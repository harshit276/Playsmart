import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Info, ArrowRight, Dumbbell } from "lucide-react";
import { fixCue } from "@/ai/fixCues";
import { Link } from "react-router-dom";
import { practiceUrl, resolveShot, isPracticeSport } from "@/lib/practiceShots";
import { buildGhostTrack, GHOST_EDGES, isWebGLError, ghostDelegate } from "@/ai/ghostPose";
import { track as trackEvent } from "@/lib/analytics";
import { deviceKind } from "@/lib/frameSource";

/**
 * GhostPlayback — the player's real clip, slowed down, with their own arm
 * re-posed to the ideal drawn over it (green) next to what they actually did
 * (red). Built by ghostPose in the browser; nothing is uploaded or generated.
 *
 * Loaded lazily (React.lazy) — MediaPipe's model + WASM (~20 MB the first
 * time, cached after) only download when someone asks to see the fix.
 */

const JOINT_LABEL = { elbow: "Elbow", shoulder: "Arm height", knee: "Knee bend" };
const REASON_COPY = {
  "no-contact-time": "This shot has no timestamp, so we can't find the moment of contact.",
  "clip-too-short": "There isn't enough video around this shot.",
  "no-player-at-contact": "We couldn't find you at the moment of contact.",
  "need-player-pick": "There are several people in this shot. Tap yourself so we follow the right player.",
  "lost-player": "We lost track of you during the shot.",
  "arm-not-visible": "Your hitting arm isn't clearly visible at contact from this camera angle.",
  "video-load-failed": "Your clip couldn't be opened on this device.",
  "video-load-timeout": "Your clip took too long to open on this device.",
  "no-webgl": "This browser can't run the 3D pose model because graphics acceleration is off. Try Chrome or Safari with hardware acceleration turned on.",
  "too-slow": "This took too long on your device, so we stopped. The 3D fix works best on a recent phone.",
  "frames-blank": "This browser couldn't read the video frames of your clip. Opening Formanti in Chrome, or in the Formanti app, usually helps.",
};
// Failures where following a different person is the likely fix.
const REPICK_REASONS = new Set(["no-player-at-contact", "need-player-pick", "lost-player", "arm-not-visible"]);
const HOLD_AT_CONTACT_MS = 900;

// Finished tracks by clip + shot + who was followed, so closing and reopening a
// shot (or the page re-rendering) doesn't redo ~20 s of work on a phone.
const _trackCache = new Map();
const cacheKey = (f, ...rest) => (f ? [f.name, f.size, f.lastModified, ...rest].join("|") : null);
const RED = "#f87171", GREEN = "#a3e635", OUTLINE = "rgba(10,10,10,0.85)";

/** Crop around the player over the whole window: bigger arm on a phone. */
function cropRect(track) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of track.frames) {
    const pts = [...(f.pts || [])];
    if (f.corrected?.arm) pts.push(f.corrected.arm.el, f.corrected.arm.wr);
    if (f.corrected?.leg) pts.push(f.corrected.leg.hip, f.corrected.leg.kn);
    for (const p of pts) {
      if (!p) continue;
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
  }
  const W = track.videoWidth, H = track.videoHeight;
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: W, h: H };
  const pad = 0.35;
  let w = (x1 - x0) * (1 + pad), h = (y1 - y0) * (1 + pad);
  const aspect = 4 / 5;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  w = Math.min(w, W); h = Math.min(h, H);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const x = Math.max(0, Math.min(W - w, cx - w / 2));
  const y = Math.max(0, Math.min(H - h, cy - h / 2));
  return { x, y, w, h };
}

function nearestFrame(frames, t) {
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < t) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)) lo -= 1;
  return frames[lo];
}

export default function GhostPlayback({
  videoFile, contactSec, sport, shotType, contactBox = null, tapPoint = null, shotLabel = null, onRepick = null,
}) {
  const [state, setState] = useState({ status: "working", phase: "model", done: 0, total: 1 });
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(0.5);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const heldRef = useRef(false);
  const holdTimerRef = useRef(null);
  const playingRef = useRef(playing);

  const srcUrl = useMemo(() => (videoFile ? URL.createObjectURL(videoFile) : null), [videoFile]);
  useEffect(() => () => { if (srcUrl) URL.revokeObjectURL(srcUrl); }, [srcUrl]);

  // Build the track once per clip/shot. Keyed on the box's values, not the
  // array, so a parent re-render can't restart a 20-second build.
  const boxKey = Array.isArray(contactBox) ? contactBox.join(",") : "";
  const tapKey = tapPoint ? `${tapPoint.x},${tapPoint.y}` : "";
  useEffect(() => {
    if (!videoFile) { setState({ status: "failed", reason: "video-load-failed" }); return undefined; }
    const ac = new AbortController();
    const key = cacheKey(videoFile, contactSec, sport, shotType, boxKey, tapKey);
    const cached = key ? _trackCache.get(key) : null;
    if (cached) { setState({ status: "ready", track: cached }); return undefined; }
    setState({ status: "working", phase: "model", done: 0, total: 1 });
    const started = Date.now();
    // One event per build, success or not: the only way to see why it fails
    // on real phones. No clip content, just the outcome and how it was steered.
    const report = (ok, reason, extra = {}) => trackEvent("ghost_built", {
      ok, reason: reason || null, sport: sport || null, delegate: ghostDelegate(),
      steered_by: tapPoint ? "tap" : contactBox ? "box" : "none",
      seconds: Math.round((Date.now() - started) / 100) / 10, device: deviceKind(), ...extra,
    });
    buildGhostTrack({
      video: videoFile, contactSec, sport, shotType, contactBox, tapPoint, signal: ac.signal,
      onProgress: (p) => !ac.signal.aborted && setState({ status: "working", ...p }),
    })
      .then((r) => {
        if (ac.signal.aborted) return;
        if (!r.ok && process.env.NODE_ENV !== "production") console.info("[ghost] not built:", r);
        const fr = r.diag?.frames || {};
        report(r.ok, r.ok ? null : r.reason, {
          coverage: r.coverage ?? r.quality?.coverage ?? null, corrections: r.applied?.length ?? null,
          blank_frames: fr.blank ?? 0, retried_frames: fr.retried ?? 0, nudged: fr.nudged ?? 0,
          joints: (r.applied || []).map((a) => a.joint).join(","), legs_readable: r.legs?.readable ?? null, arm_readable: r.arm?.readable ?? null,
        });
        if (r.ok && key) {
          _trackCache.set(key, r);
          if (_trackCache.size > 4) _trackCache.delete(_trackCache.keys().next().value);
        }
        setState(r.ok ? { status: "ready", track: r } : { status: "failed", reason: r.reason });
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        if (process.env.NODE_ENV !== "production") console.warn("[ghost] failed:", e);
        const reason = isWebGLError(e) ? "no-webgl" : (e?.message || "error");
        report(false, reason);
        setState({ status: "failed", reason });
      });
    return () => ac.abort();
  }, [videoFile, contactSec, sport, shotType, boxKey, tapKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const track = state.status === "ready" ? state.track : null;
  const crop = useMemo(() => (track ? cropRect(track) : null), [track]);

  // Render loop. The real <video> is shown (cropped to the player with CSS)
  // and only the skeletons are drawn on a transparent canvas above it —
  // browsers won't reliably hand over frames from an invisible video.
  useEffect(() => {
    const v = videoRef.current, cv = canvasRef.current, wrap = wrapRef.current, stage = stageRef.current;
    if (!track || !v || !cv || !wrap || !stage || !crop) return undefined;
    let raf = 0;
    const ctx = cv.getContext("2d");
    v.playbackRate = rate;

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const maxH = Math.max(260, Math.min(window.innerHeight * 0.62, 640));
      let cssW = wrap.clientWidth || 320;
      let cssH = cssW * (crop.h / crop.w);
      if (cssH > maxH) { cssH = maxH; cssW = cssH * (crop.w / crop.h); }
      const k = cssW / crop.w; // css px per video px
      stage.style.width = `${Math.round(cssW)}px`;
      stage.style.height = `${Math.round(cssH)}px`;
      Object.assign(v.style, {
        width: `${track.videoWidth * k}px`,
        height: `${track.videoHeight * k}px`,
        left: `${-crop.x * k}px`,
        top: `${-crop.y * k}px`,
      });
      cv.style.width = `${Math.round(cssW)}px`;
      cv.style.height = `${Math.round(cssH)}px`;
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssH * dpr);
    };
    size();
    window.addEventListener("resize", size);

    const draw = () => {
      if (v.currentTime >= track.windowEnd - 0.01 || v.currentTime < track.windowStart - 0.25) {
        v.currentTime = track.windowStart;
        heldRef.current = false;
      }
      if (!heldRef.current && !v.paused && v.currentTime >= track.contactSec) {
        heldRef.current = true;
        v.pause();
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = setTimeout(() => { if (playingRef.current) v.play().catch(() => {}); }, HOLD_AT_CONTACT_MS);
      }
      const s = cv.width / crop.w;
      const X = (p) => (p[0] - crop.x) * s;
      const Y = (p) => (p[1] - crop.y) * s;
      ctx.clearRect(0, 0, cv.width, cv.height);
      // Light dim so the lines read on bright courts and gyms.
      ctx.fillStyle = "rgba(10,10,10,0.18)";
      ctx.fillRect(0, 0, cv.width, cv.height);

      const f = nearestFrame(track.frames, v.currentTime);
      const lw = Math.max(2, cv.width / 170);
      if (f?.pts) {
        ctx.save();
        ctx.strokeStyle = RED; ctx.lineWidth = lw; ctx.lineCap = "round";
        for (const [a, b] of GHOST_EDGES) {
          ctx.beginPath(); ctx.moveTo(X(f.pts[a]), Y(f.pts[a])); ctx.lineTo(X(f.pts[b]), Y(f.pts[b])); ctx.stroke();
        }
        ctx.restore();
      }
      if (f?.corrected && f.w > 0.02) {
        // Each corrected limb is a green polyline with a dark outline and white joints.
        const limbs = [];
        const a = f.corrected.arm, l = f.corrected.leg;
        if (a) limbs.push([a.sh, a.el, a.wr]);
        if (l) limbs.push([l.hip, l.kn, l.an]);
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.65 * f.w;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const pts of limbs) {
          for (const [color, width] of [[OUTLINE, lw * 3.6], [GREEN, lw * 2.4]]) {
            ctx.strokeStyle = color; ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(X(pts[0]), Y(pts[0])); ctx.lineTo(X(pts[1]), Y(pts[1])); ctx.lineTo(X(pts[2]), Y(pts[2])); ctx.stroke();
          }
          ctx.fillStyle = "#ffffff";
          for (const p of [pts[1], pts[2]]) { ctx.beginPath(); ctx.arc(X(p), Y(p), lw * 1.6, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.restore();
      }
      if (Math.abs(v.currentTime - track.contactSec) < 0.05) {
        ctx.save();
        ctx.font = `bold ${Math.round(cv.width / 22)}px system-ui, sans-serif`;
        ctx.fillStyle = "#fde047";
        ctx.fillText("CONTACT", cv.width * 0.04, cv.height * 0.08);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };

    const start = () => {
      v.currentTime = track.windowStart;
      heldRef.current = false;
      if (playingRef.current) v.play().catch(() => {});
      raf = requestAnimationFrame(draw);
    };
    if (v.readyState >= 1) start(); else v.addEventListener("loadedmetadata", start, { once: true });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(holdTimerRef.current);
      window.removeEventListener("resize", size);
      v.removeEventListener("loadedmetadata", start);
    };
  }, [track, crop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play/pause + speed without rebuilding the loop.
  useEffect(() => {
    playingRef.current = playing;
    const v = videoRef.current;
    if (!v || !track) return;
    if (playing) v.play().catch(() => {}); else { clearTimeout(holdTimerRef.current); v.pause(); }
  }, [playing, track]);
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate; }, [rate]);

  if (state.status === "working") {
    const pct = state.phase === "track" && state.total ? Math.round((100 * state.done) / state.total) : null;
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full border-2 border-lime-400/30 border-t-lime-400 animate-spin shrink-0" />
          <div>
            <p className="text-sm text-white">
              {state.phase === "model" ? "Loading the 3D pose model" : "Following your arm through the shot"}
            </p>
            <p className="text-[11px] text-zinc-500">
              {state.phase === "model"
                ? "First time only — about 20 MB, then it's cached on this device."
                : `${pct ?? 0}% · runs on your phone, nothing is uploaded`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "failed") {
    const canRepick = onRepick && REPICK_REASONS.has(state.reason);
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3 flex-wrap">
        <p className="text-sm text-zinc-300 flex-1 min-w-[180px]">
          {REASON_COPY[state.reason] || "We couldn't build the corrected motion for this clip."}
        </p>
        {canRepick && (
          <button
            type="button"
            onClick={onRepick}
            className="shrink-0 px-3 py-2 rounded-lg text-[12px] font-bold bg-sky-400 text-black hover:bg-sky-300"
          >
            {tapPoint ? "Pick yourself again" : "Pick yourself"}
          </button>
        )}
      </div>
    );
  }

  const { applied, measured, achieved, hasIdeal, quality, legs } = track;
  const practiceTarget = (() => {
    const sp = String(sport || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    if (!isPracticeSport(sp)) return null;
    const r = resolveShot(sp, shotType);
    return r ? { sport: sp, key: r.key } : null;
  })();
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">The fix, in motion</p>
          {shotLabel && <p className="text-[11px] text-zinc-500 mt-0.5">{shotLabel}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 hover:text-white"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => { const v = videoRef.current; if (v) { v.currentTime = track.windowStart; heldRef.current = false; } }}
            className="p-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white"
            aria-label="Restart"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="w-full flex justify-center rounded-xl overflow-hidden bg-black">
        <div ref={stageRef} className="relative overflow-hidden">
          <video
            ref={videoRef}
            src={srcUrl || undefined}
            muted
            playsInline
            preload="auto"
            className="absolute max-w-none pointer-events-none"
          />
          <canvas ref={canvasRef} className="absolute inset-0 block" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5 flex-wrap">
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1.5"><i className="w-4 h-0.5 rounded-full inline-block" style={{ background: RED }} /> What you did</span>
          <span className="flex items-center gap-1.5"><i className="w-4 h-1 rounded-full inline-block" style={{ background: GREEN }} /> Corrected position</span>
        </div>
        <div className="inline-flex rounded-md overflow-hidden border border-zinc-700 bg-zinc-900">
          {[0.25, 0.5, 1].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRate(r)}
              aria-pressed={rate === r}
              className={`px-2.5 py-1 text-[11px] font-bold ${rate === r ? "bg-lime-400 text-black" : "text-zinc-300 hover:bg-zinc-800"}`}
            >
              {r === 1 ? "1×" : `${r}×`}
            </button>
          ))}
        </div>
      </div>

      {!hasIdeal && (
        <p className="text-sm text-zinc-300 mt-3">
          We don't have a curated target for this shot type yet, so this shows your motion only.
        </p>
      )}
      {hasIdeal && applied.length === 0 && (
        <p className="text-sm text-zinc-300 mt-3">
          Measured in 3D, your{" "}
          {[measured.elbow != null && "arm", measured.knee != null && legs?.hasKneeTarget && "leg"].filter(Boolean).join(" and ") || "position"}
          {" "}already sit inside the ideal range at contact
          {measured.elbow != null ? ` (elbow ${measured.elbow}°` : ""}
          {measured.elbow != null && measured.knee != null && legs?.hasKneeTarget ? `, knee ${measured.knee}°` : ""}
          {measured.elbow != null ? ")" : ""}. Nothing to correct here.
        </p>
      )}
      {applied.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold">What to do</p>
          {applied.map((a) => {
            const cue = fixCue(a.joint, a.from, a.to);
            return (
              <div key={a.joint} className="bg-zinc-950/70 border border-lime-400/25 rounded-xl p-3">
                <p className="text-[15px] font-bold text-white leading-snug">{cue?.headline || JOINT_LABEL[a.joint] || a.joint}</p>
                {cue?.feel && <p className="text-[13px] text-zinc-300 mt-1 leading-snug">{cue.feel}</p>}
                {cue?.drill && (
                  <p className="text-[12px] text-sky-200 mt-2 leading-snug flex gap-1.5">
                    <Dumbbell className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-300" />
                    <span>{cue.drill}</span>
                  </p>
                )}
                <p className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 mt-2">
                  {JOINT_LABEL[a.joint] || a.joint}
                  <span className="text-rose-400">{a.from}°</span>
                  <ArrowRight className="w-3 h-3 text-zinc-600" />
                  <span className="text-lime-400">{achieved[a.joint] ?? a.to}°</span>
                  <span className="font-sans">at contact</span>
                </p>
              </div>
            );
          })}
          {practiceTarget && (
            <Link
              to={practiceUrl({ sport: practiceTarget.sport, shot: practiceTarget.key, focus: applied[0]?.joint })}
              className="inline-flex items-center gap-1 pt-1 text-[13px] font-bold text-lime-300 hover:text-lime-200"
            >
              Practise this now with your camera →
            </Link>
          )}
        </div>
      )}

      {legs && (measured.knee != null || legs.stanceWidth != null) && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">Legs at contact</p>
          <p className="text-[13px] text-zinc-200 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            {measured.knee != null && <span>Hitting-side knee <span className="font-mono font-bold text-white">{measured.knee}°</span></span>}
            {legs.stanceWidth != null && <span>Feet <span className="font-mono font-bold text-white">{legs.stanceWidth}×</span> shoulder width apart</span>}
          </p>
          {!legs.hasKneeTarget && measured.knee != null && (
            <p className="text-[11px] text-zinc-500 mt-1 leading-snug">
              We don't have a leg target for this shot yet, so this is just for your information.
            </p>
          )}
        </div>
      )}
      {legs && !legs.readable && (
        <p className="text-[11px] text-zinc-500 mt-3 leading-snug">
          Your legs aren't fully in view from this angle, so we only measured your arm.
        </p>
      )}

      <p className="flex gap-1.5 text-[11px] text-zinc-500 mt-3 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Measured in 3D from one camera, so treat the green as the direction to move, not an
          exact angle. It changes only your hitting arm and leg around contact; the rest is your real swing.
          {quality?.coverage != null && quality.coverage < 0.9 ? " Some frames were estimated where the player was hidden." : ""}
        </span>
      </p>
    </div>
  );
}
