import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Info, ArrowRight } from "lucide-react";
import { buildGhostTrack, GHOST_EDGES, isWebGLError } from "@/ai/ghostPose";

/**
 * GhostPlayback — the player's real clip, slowed down, with their own arm
 * re-posed to the ideal drawn over it (green) next to what they actually did
 * (red). Built by ghostPose in the browser; nothing is uploaded or generated.
 *
 * Loaded lazily (React.lazy) — MediaPipe's model + WASM (~20 MB the first
 * time, cached after) only download when someone asks to see the fix.
 */

const JOINT_LABEL = { elbow: "Elbow", shoulder: "Arm height" };
const REASON_COPY = {
  "no-contact-time": "This shot has no timestamp, so we can't find the moment of contact.",
  "clip-too-short": "There isn't enough video around this shot.",
  "no-player-at-contact": "We couldn't find the player at the moment of contact.",
  "lost-player": "We lost track of the player during the shot. Try a clip where they stay in view.",
  "arm-not-visible": "The hitting arm isn't clearly visible at contact from this camera angle.",
  "video-load-failed": "Your clip couldn't be opened on this device.",
  "video-load-timeout": "Your clip took too long to open on this device.",
  "no-webgl": "This browser can't run the 3D pose model because graphics acceleration is off. Try Chrome or Safari with hardware acceleration turned on.",
};
const HOLD_AT_CONTACT_MS = 900;
const RED = "#f87171", GREEN = "#a3e635", OUTLINE = "rgba(10,10,10,0.85)";

/** Crop around the player over the whole window: bigger arm on a phone. */
function cropRect(track) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of track.frames) {
    const pts = [...(f.pts || [])];
    if (f.corrected) pts.push(f.corrected.el, f.corrected.wr);
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

export default function GhostPlayback({ videoFile, contactSec, sport, shotType, contactBox = null, shotLabel = null }) {
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
  useEffect(() => {
    if (!videoFile) { setState({ status: "failed", reason: "video-load-failed" }); return undefined; }
    const ac = new AbortController();
    setState({ status: "working", phase: "model", done: 0, total: 1 });
    buildGhostTrack({
      video: videoFile, contactSec, sport, shotType, contactBox, signal: ac.signal,
      onProgress: (p) => !ac.signal.aborted && setState({ status: "working", ...p }),
    })
      .then((r) => {
        if (ac.signal.aborted) return;
        if (!r.ok && process.env.NODE_ENV !== "production") console.info("[ghost] not built:", r);
        setState(r.ok ? { status: "ready", track: r } : { status: "failed", reason: r.reason });
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        if (process.env.NODE_ENV !== "production") console.warn("[ghost] failed:", e);
        setState({ status: "failed", reason: isWebGLError(e) ? "no-webgl" : (e?.message || "error") });
      });
    return () => ac.abort();
  }, [videoFile, contactSec, sport, shotType, boxKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const { sh, el, wr } = f.corrected;
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.65 * f.w;
        ctx.lineCap = "round";
        for (const [color, width] of [[OUTLINE, lw * 3.6], [GREEN, lw * 2.4]]) {
          ctx.strokeStyle = color; ctx.lineWidth = width;
          ctx.beginPath(); ctx.moveTo(X(sh), Y(sh)); ctx.lineTo(X(el), Y(el)); ctx.lineTo(X(wr), Y(wr)); ctx.stroke();
        }
        ctx.fillStyle = "#ffffff";
        for (const p of [el, wr]) { ctx.beginPath(); ctx.arc(X(p), Y(p), lw * 1.6, 0, Math.PI * 2); ctx.fill(); }
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
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
        <p className="text-sm text-zinc-300">
          {REASON_COPY[state.reason] || "We couldn't build the corrected motion for this clip."}
        </p>
      </div>
    );
  }

  const { applied, measured, achieved, hasIdeal, quality } = track;
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
          <span className="flex items-center gap-1.5"><i className="w-4 h-1 rounded-full inline-block" style={{ background: GREEN }} /> Corrected arm</span>
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
          Measured in 3D, your arm is already inside the ideal range at contact
          {measured.elbow != null ? ` (elbow ${measured.elbow}°)` : ""}. Nothing to correct here.
        </p>
      )}
      {applied.length > 0 && (
        <div className="mt-3 space-y-2">
          {applied.map((a) => (
            <div key={a.joint} className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white">{JOINT_LABEL[a.joint] || a.joint}</span>
                <span className="flex items-center gap-1.5 text-sm font-mono">
                  <span className="text-rose-400">{a.from}°</span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
                  <span className="text-lime-400 font-bold">{achieved[a.joint] ?? a.to}°</span>
                </span>
              </div>
              {a.why && <p className="text-[12px] text-zinc-400 mt-1.5 leading-relaxed">{a.why}</p>}
            </div>
          ))}
        </div>
      )}

      <p className="flex gap-1.5 text-[11px] text-zinc-500 mt-3 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Measured in 3D from one camera, so treat the green arm as the direction to move, not an
          exact angle. It changes only your hitting arm around contact; the rest is your real swing.
          {quality?.coverage != null && quality.coverage < 0.9 ? " Some frames were estimated where the player was hidden." : ""}
        </span>
      </p>
    </div>
  );
}
