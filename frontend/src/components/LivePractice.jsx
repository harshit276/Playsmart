import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X, SwitchCamera, Volume2, VolumeX, Check, Camera, Dumbbell } from "lucide-react";
import { startLivePose, liveDelegate, resetLivePose } from "@/ai/livePose";
import { createSwingDetector } from "@/ai/swingDetector";
import { GHOST_EDGES, jointIdx, measureJoints, planCorrections, correctLimbs } from "@/ai/correctPose";
import { fixCue } from "@/ai/fixCues";
import { speakCue, cancelCue, cuesSupported } from "@/lib/speakCue";
import { track } from "@/lib/analytics";
import { deviceKind } from "@/lib/frameSource";

/**
 * LivePractice — shadow practice with the phone's camera.
 *
 * The player props the phone up, swings in front of it, and sees themselves
 * with a live skeleton. Holding still shows the correct form (green) wherever a
 * joint is outside its target; every swing is caught at its moment of contact,
 * frozen with the correction drawn on it, scored in or out of range, and spoken.
 * All on the device: the video never leaves the phone.
 *
 * Props: ideal (an idealAngles entry), shotName, sport, focus (joint to stress),
 * hand ("right"|"left"), facing ("user"|"environment"), onExit().
 */

const JOINT_LABEL = { shoulder: "Arm height", elbow: "Elbow", knee: "Knee bend" };
const RED = "#f87171", GREEN = "#a3e635", DARK = "rgba(10,10,10,0.85)";
const HOLD_SPEED = 1.0; // m/s: below this the player is holding a pose, not swinging (landmark jitter alone reaches ~0.5)
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

export default function LivePractice({ ideal, shotName, sport, focus = null, hand: handProp = "right", facing: facingProp = "user", clipSrc = null, clipRate = 1, onExit }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const streamRef = useRef(null);
  const engineRef = useRef(null);
  const detectorRef = useRef(createSwingDetector());
  const ringRef = useRef([]); // recent frames {t, px, wl, vis, vw, vh}
  const bmpRef = useRef([]); // recent small pictures {t, bmp}
  const snapRef = useRef(null);
  const readingsRef = useRef({ shoulder: [], elbow: [], knee: [] });
  const armedRef = useRef(false);
  const lastHudRef = useRef(0);
  const nullRunRef = useRef(0);
  const inFrameSinceRef = useRef(0);
  const repsRef = useRef([]);
  const startedAtRef = useRef(0);
  const wakeRef = useRef(null);
  const toastTimerRef = useRef(0);
  const soundRef = useRef(true);
  const aliveRef = useRef(true);
  const timeoutsRef = useRef(0);
  const handRef = useRef(handProp);
  const facingRef = useRef(facingProp);

  const [phase, setPhase] = useState("starting"); // starting | live | summary | error
  const [error, setError] = useState(null);
  const [facing, setFacing] = useState(facingProp);
  const [hand, setHand] = useState(handProp);
  const [sound, setSound] = useState(true);
  const [box, setBox] = useState({ w: 320, h: 480 });
  const [aspect, setAspect] = useState(9 / 16);
  const [hud, setHud] = useState({ inFrame: false, armed: false, moving: false, vals: {}, slow: false });
  const [reps, setReps] = useState([]);
  const [toast, setToast] = useState(null);
  const [slowLoad, setSlowLoad] = useState(false);

  const judged = ["shoulder", "elbow", "knee"].filter((j) => ideal?.[j]);

  useEffect(() => { soundRef.current = sound; if (!sound) cancelCue(); }, [sound]);
  useEffect(() => { handRef.current = hand; detectorRef.current.reset(); }, [hand]);

  // ─── layout: fit the camera picture into the space, canvas at device resolution ───
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const fit = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const viewW = Math.max(1, Math.min(box.w, box.h * aspect));
  const viewH = viewW / aspect;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(viewW * dpr);
    c.height = Math.round(viewH * dpr);
  }, [viewW, viewH]);

  // ─── drawing ───
  const drawLimbs = useCallback((ctx, limbs, s, lw) => {
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const pts of limbs) {
      for (const [color, width] of [[DARK, lw * 3.6], [GREEN, lw * 2.4]]) {
        ctx.strokeStyle = color; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(pts[0][0] * s, pts[0][1] * s); ctx.lineTo(pts[1][0] * s, pts[1][1] * s); ctx.lineTo(pts[2][0] * s, pts[2][1] * s); ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      for (const p of [pts[1], pts[2]]) { ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, lw * 1.6, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }, []);

  const drawSkeleton = useCallback((ctx, f, s, lw, armGood) => {
    const { SH, EL, WR } = jointIdx(handRef.current);
    ctx.save();
    ctx.lineCap = "round"; ctx.lineWidth = lw;
    for (const [a, b] of GHOST_EDGES) {
      if (f.vis[a] < 0.3 || f.vis[b] < 0.3) continue;
      const onArm = (a === SH && b === EL) || (a === EL && b === WR);
      ctx.strokeStyle = onArm ? (armGood ? GREEN : RED) : "rgba(255,255,255,0.75)";
      ctx.beginPath(); ctx.moveTo(f.px[a][0] * s, f.px[a][1] * s); ctx.lineTo(f.px[b][0] * s, f.px[b][1] * s); ctx.stroke();
    }
    ctx.restore();
  }, []);

  // ─── a rep: the swing just happened at tPeak ───
  const evaluateRep = useCallback(async ({ tPeak, peakSpeed }) => {
    const ring = ringRef.current;
    if (!ring.length) return;
    const near = ring.filter((f) => Math.abs(f.t - tPeak) <= 0.06);
    const frames = near.length ? near : [ring.reduce((b, f) => (Math.abs(f.t - tPeak) < Math.abs(b.t - tPeak) ? f : b), ring[0])];
    const side = handRef.current;
    const per = frames.map((f) => measureJoints(f.wl, f.vis, side));
    const measured = {};
    for (const j of judged) {
      const vals = per.map((p) => p.measured[j]).filter((v) => v != null);
      measured[j] = vals.length ? median(vals) : null;
    }
    const seen = judged.filter((j) => measured[j] != null);
    if (!seen.length) { setHud((h) => ({ ...h, hint: "Couldn't see your arm on that swing. Step back a little." })); return; }
    const plan = planCorrections(measured, ideal);
    const inBand = plan.applied.length === 0;
    // Rank by how far out each joint is relative to ITS OWN band, not by raw degrees:
    // a 60° arm miss must not bury a 25° knee miss that is just as far outside its range.
    const severity = (a) => Math.abs(a.deltaDeg) / Math.max(10, (ideal[a.joint].max - ideal[a.joint].min) / 2);
    const ranked = plan.applied.slice().sort((a, b) => severity(b) - severity(a));
    const worst = ranked[0] || null;
    // One cue for the arm and one for the leg when both are off: that's what gets spoken and shown.
    const picks = [ranked.find((a) => a.joint !== "knee"), ranked.find((a) => a.joint === "knee")]
      .filter(Boolean)
      .sort((a, b) => severity(b) - severity(a));
    const cues = picks.map((a) => ({ ...fixCue(a.joint, a.from, a.to), joint: a.joint, from: a.from, to: a.to })).filter((c) => c.headline);
    const cue = cues[0] || null;
    const frame = frames.reduce((b, f) => (Math.abs(f.t - tPeak) < Math.abs(b.t - tPeak) ? f : b), frames[0]);

    // The contact picture: the nearest saved frame, with the skeleton and the correction drawn on it.
    let picture = null;
    const pic = bmpRef.current.reduce((b, p) => (!b || Math.abs(p.t - tPeak) < Math.abs(b.t - tPeak) ? p : b), null);
    if (pic && Math.abs(pic.t - tPeak) < 0.25) {
      try {
        const c = document.createElement("canvas");
        c.width = pic.bmp.width; c.height = pic.bmp.height;
        const ctx = c.getContext("2d");
        if (facingRef.current === "user" && !clipSrc) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(pic.bmp, 0, 0);
        const s = c.width / frame.vw;
        const lw = Math.max(2, c.width / 120);
        drawSkeleton(ctx, frame, s, lw, inBand);
        if (!inBand) {
          const fix = correctLimbs({ wl: frame.wl, px: frame.px, vis: frame.vis, side, delta: plan.delta, w: 1 });
          const limbs = [];
          if (fix?.arm) limbs.push([fix.arm.sh, fix.arm.el, fix.arm.wr]);
          if (fix?.leg) limbs.push([fix.leg.hip, fix.leg.kn, fix.leg.an]);
          drawLimbs(ctx, limbs, s, lw);
        }
        picture = c.toDataURL("image/jpeg", 0.8);
      } catch { picture = null; }
    }

    const rep = { n: repsRef.current.length + 1, t: tPeak, inBand, measured, worst, cue, cues, off: ranked, peakSpeed, picture };
    repsRef.current = [...repsRef.current, rep];
    setReps(repsRef.current);
    clearTimeout(toastTimerRef.current);
    setToast(rep);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);

    if (soundRef.current) {
      const streak = (() => { let n = 0; for (let i = repsRef.current.length - 1; i >= 0 && repsRef.current[i].inBand; i--) n++; return n; })();
      if (!inBand && cues.length) speakCue(cues.map((c) => c.headline).join(". "));
      else if (inBand) speakCue(streak >= 3 ? `${streak} in a row` : "Good");
    }
  }, [ideal, judged, drawLimbs, drawSkeleton, clipSrc]);

  // ─── every camera frame ───
  const onFrame = useCallback((f) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const det = detectorRef.current;
    if (!f) {
      det.push(0, null, null);
      if (++nullRunRef.current > 8) { inFrameSinceRef.current = 0; armedRef.current = false; }
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = performance.now();
      if (now - lastHudRef.current > 150) { lastHudRef.current = now; setHud((h) => ({ ...h, inFrame: false, armed: false, moving: false, vals: {} })); }
      return;
    }
    nullRunRef.current = 0;
    const side = handRef.current;
    const { WR, SH } = jointIdx(side);
    const { armOk, measured } = measureJoints(f.wl, f.vis, side);
    // "In frame": the hitting arm and both hips are seen well enough to coach.
    const inFrame = armOk && f.vis[23] >= 0.5 && f.vis[24] >= 0.5;
    const nowMs = performance.now();
    if (inFrame) { if (!inFrameSinceRef.current) inFrameSinceRef.current = nowMs; } else inFrameSinceRef.current = 0;
    const armed = !!inFrameSinceRef.current && nowMs - inFrameSinceRef.current > 800;
    armedRef.current = armed;

    // keep ~1.2 s of frames and a small picture every other frame
    const ring = ringRef.current;
    ring.push({ t: f.t, px: f.px, wl: f.wl, vis: f.vis, vw: f.vw, vh: f.vh });
    while (ring.length && ring[0].t < f.t - 1.2) ring.shift();
    if (armed && (Math.floor(f.t * 1000) % 2 === 0) && videoRef.current && typeof createImageBitmap === "function") {
      try {
        const sw = 360, sh = Math.round((360 * f.vh) / f.vw);
        const c = snapRef.current || (snapRef.current = document.createElement("canvas"));
        c.width = sw; c.height = sh;
        c.getContext("2d").drawImage(videoRef.current, 0, 0, sw, sh);
        createImageBitmap(c).then((bmp) => {
          bmpRef.current.push({ t: f.t, bmp });
          while (bmpRef.current.length > 16) { try { bmpRef.current.shift().bmp.close(); } catch { /* noop */ } }
        }).catch(() => {});
      } catch { /* no picture for this frame: the verdict still shows */ }
    }

    // smooth the readings over the last few frames
    for (const j of judged) {
      const arr = readingsRef.current[j];
      if (measured[j] != null) { arr.push(measured[j]); if (arr.length > 5) arr.shift(); } else arr.length = 0;
    }
    const smooth = {};
    for (const j of judged) smooth[j] = median(readingsRef.current[j]);

    // swings
    const ev = armed && armOk ? det.push(f.t, f.wl[WR], f.wl[SH]) : (det.push(f.t, null, null), null);
    if (ev) evaluateRep(ev);
    const moving = det.speed() > HOLD_SPEED;

    // in-band now? (the arm turns green when what you're doing is inside the target)
    const plan = planCorrections(smooth, ideal);
    const armJudged = ["shoulder", "elbow"].filter((j) => smooth[j] != null && ideal?.[j]);
    const armGood = armJudged.length > 0 && armJudged.every((j) => !plan.applied.some((a) => a.joint === j));

    // draw
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const s = canvas.width / f.vw;
      const lw = Math.max(2, canvas.width / 150);
      drawSkeleton(ctx, f, s, lw, armGood);
      // Holding still and outside the target: show where the limb should be.
      if (armed && !moving && plan.applied.length) {
        const fix = correctLimbs({ wl: f.wl, px: f.px, vis: f.vis, side, delta: plan.delta, w: 1 });
        const limbs = [];
        if (fix?.arm) limbs.push([fix.arm.sh, fix.arm.el, fix.arm.wr]);
        if (fix?.leg) limbs.push([fix.leg.hip, fix.leg.kn, fix.leg.an]);
        drawLimbs(ctx, limbs, s, lw);
      }
    }

    if (nowMs - lastHudRef.current > 130) {
      lastHudRef.current = nowMs;
      const st = engineRef.current?.stats();
      setHud({ inFrame, armed, moving, vals: smooth, slow: !!st && st.inferMs > 140, hint: null });
    }
  }, [ideal, judged, evaluateRep, drawLimbs, drawSkeleton]);

  // ─── camera session ───
  const stopSession = useCallback(() => {
    try { engineRef.current?.stop(); } catch { /* noop */ }
    engineRef.current = null;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    streamRef.current = null;
    try { wakeRef.current?.release?.(); } catch { /* noop */ }
    wakeRef.current = null;
    for (const p of bmpRef.current) { try { p.bmp.close(); } catch { /* noop */ } }
    bmpRef.current = [];
    cancelCue();
  }, []);

  const startSession = useCallback(async (face) => {
    stopSession();
    setError(null);
    setPhase("starting");
    detectorRef.current.reset();
    ringRef.current = [];
    inFrameSinceRef.current = 0;
    facingRef.current = face;
    setSlowLoad(false);
    // The pose model is ~20 MB from a CDN: ~2.5 minutes on a slow 3G link. Say so
    // after a few seconds; if it still hasn't arrived after the budget, stop
    // with a way to retry instead of spinning forever. The first retry rejoins
    // the SAME download (it may be nearly done); only a second consecutive
    // timeout throws it away and starts fresh.
    const slowTimer = setTimeout(() => setSlowLoad(true), 12000);
    try {
      const v = videoRef.current;
      if (clipSrc) {
        // A same-site sample video stands in for the camera (for people without
        // one, and for testing): same pipeline, played at clipRate.
        v.srcObject = null;
        v.src = clipSrc;
        v.muted = true;
        v.playbackRate = clipRate;
        await v.play();
      } else {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("no-camera-api"), { name: "NotSupportedError" });
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: face }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false,
          });
        } catch (e) {
          if (e?.name === "OverconstrainedError") stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          else throw e;
        }
        streamRef.current = stream;
        v.srcObject = stream;
        v.muted = true;
        await v.play();
      }
      setAspect((v.videoWidth || 9) / (v.videoHeight || 16));
      try { wakeRef.current = await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
      const enginePromise = startLivePose({
        video: v,
        onFrame: (f) => onFrameRef.current?.(f),
        onError: (e) => { setError(e); setPhase("error"); track("practice_error", { reason: String(e?.message || e).slice(0, 80), device: deviceKind() }); },
      });
      let giveUp = 0;
      const timeout = new Promise((_, reject) => {
        giveUp = setTimeout(() => reject(Object.assign(new Error("model-timeout"), { name: "ModelTimeout" })), 150000);
      });
      try {
        engineRef.current = await Promise.race([enginePromise, timeout]);
      } catch (e) {
        // A late-arriving engine must not keep running behind the error screen.
        enginePromise.then((eng) => eng.stop()).catch(() => {});
        if (e?.name === "ModelTimeout") {
          if (++timeoutsRef.current >= 2) { resetLivePose(); timeoutsRef.current = 0; }
        }
        throw e;
      } finally {
        clearTimeout(giveUp);
      }
      timeoutsRef.current = 0;
      if (!aliveRef.current) { stopSession(); return; } // closed while loading
      startedAtRef.current = startedAtRef.current || Date.now();
      setPhase("live");
    } catch (e) {
      stopSession();
      setError(e);
      setPhase("error");
      track("practice_error", { reason: e?.name || String(e?.message || e).slice(0, 80), device: deviceKind() });
    } finally {
      clearTimeout(slowTimer);
      setSlowLoad(false);
    }
  }, [stopSession, clipSrc, clipRate]);

  // Mount: start. Unmount: release the camera. (The latest onFrame is used via ref below.)
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  useEffect(() => {
    aliveRef.current = true;
    track("practice_started", { sport, shot: shotName, facing: facingProp, device: deviceKind() });
    startSession(facingProp);
    const onVis = async () => {
      if (document.visibilityState === "visible" && streamRef.current && !wakeRef.current) {
        try { wakeRef.current = await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { aliveRef.current = false; document.removeEventListener("visibilitychange", onVis); clearTimeout(toastTimerRef.current); stopSession(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    startSession(next);
  };

  const finish = () => {
    const list = repsRef.current;
    track("practice_ended", {
      sport, shot: shotName, reps: list.length, in_range: list.filter((r) => r.inBand).length,
      seconds: Math.round((Date.now() - (startedAtRef.current || Date.now())) / 1000),
      device: deviceKind(), delegate: liveDelegate(), fps: Math.round(engineRef.current?.stats().fps || 0),
    });
    stopSession();
    setPhase("summary");
  };

  // ─── render ───
  const inRange = reps.filter((r) => r.inBand).length;
  const streak = (() => { let n = 0; for (let i = reps.length - 1; i >= 0 && reps[i].inBand; i--) n++; return n; })();
  const bestStreak = (() => { let best = 0, n = 0; for (const r of reps) { n = r.inBand ? n + 1 : 0; best = Math.max(best, n); } return best; })();

  let summary = null;
  if (phase === "summary") {
    // every joint that was off on a rep counts, not just the worst one, so legs show up too
    const faults = {};
    for (const r of reps) for (const o of r.off || []) faults[o.joint] = (faults[o.joint] || 0) + 1;
    const topFor = (match) => {
      const top = Object.entries(faults).filter(([j]) => match(j)).sort((a, b) => b[1] - a[1])[0];
      if (!top) return null;
      const r = reps.find((x) => x.off?.some((o) => o.joint === top[0]));
      const o = r?.off.find((x) => x.joint === top[0]);
      const c = o ? fixCue(o.joint, o.from, o.to) : null;
      return c ? { ...c, joint: top[0], count: top[1] } : null;
    };
    const workOn = [topFor((j) => j !== "knee"), topFor((j) => j === "knee")].filter(Boolean).sort((a, b) => b.count - a.count);
    summary = (
      <div className="fixed inset-0 z-[62] bg-zinc-950 text-white overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-8">
          <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">Session done · {shotName}</p>
          <h1 className="font-heading text-3xl font-black mt-1">{reps.length ? `${inRange} of ${reps.length} in range` : "No swings counted"}</h1>
          {reps.length > 0 && <p className="text-zinc-400 text-sm mt-1">Best run: {bestStreak} in a row</p>}
          {reps.length === 0 && (
            <p className="text-zinc-300 text-sm mt-3">We didn't catch a swing. Stand so your whole body is in view, turn your hitting side toward the camera, and swing at match speed.</p>
          )}
          {reps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {reps.map((r) => (
                <span key={r.n} className={`w-7 h-7 rounded-md text-[11px] font-bold flex items-center justify-center ${r.inBand ? "bg-lime-400 text-black" : "bg-rose-500/80 text-white"}`}>{r.n}</span>
              ))}
            </div>
          )}
          {workOn.map((c, i) => (
            <div key={c.joint} className="mt-5 rounded-xl border border-lime-400/30 bg-lime-400/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold">{i === 0 ? "Work on next" : "Then"}<span className="text-zinc-400 normal-case tracking-normal font-medium"> · off on {c.count} of {reps.length} {reps.length === 1 ? "swing" : "swings"}</span></p>
              <p className="text-[15px] font-bold mt-0.5">{c.headline}</p>
              <p className="text-[13px] text-zinc-300 mt-1">{c.feel}</p>
              <p className="text-[12px] text-sky-200 mt-2 flex gap-1.5"><Dumbbell className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{c.drill}</span></p>
            </div>
          ))}
          <div className="mt-6 grid gap-2">
            <button type="button" onClick={() => { repsRef.current = []; setReps([]); startedAtRef.current = Date.now(); startSession(facing); }} className="w-full py-3 rounded-xl bg-lime-400 text-black font-bold">Practise again</button>
            <Link to="/analyze" className="w-full py-3 rounded-xl border border-zinc-700 text-center font-semibold text-zinc-200">Film a real rally and get the full analysis</Link>
            <button type="button" onClick={onExit} className="w-full py-3 text-zinc-400 font-semibold">Done</button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-4">Your video stayed on your phone: nothing was uploaded.</p>
        </div>
      </div>
    );
  }

  const tip = hud.hint ? hud.hint : !hud.inFrame
    ? "Step back until your whole body and racket arm are in view"
    : !hud.armed ? "Hold on… getting ready"
    : reps.length === 0 ? "Swing when you're ready. We check the moment of contact." : null;

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col select-none">
      {/* header */}
      <div className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={phase === "live" ? finish : onExit} className="p-2 rounded-full bg-white/10" aria-label="Finish"><X className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold">Shadow practice</p>
          <p className="text-sm font-bold truncate">{shotName}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white/10 p-0.5" role="group" aria-label="Racket hand">
          {["right", "left"].map((h) => (
            <button key={h} type="button" onClick={() => setHand(h)} aria-pressed={hand === h}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${hand === h ? "bg-lime-400 text-black" : "text-zinc-300"}`}>{h === "right" ? "Right" : "Left"}</button>
          ))}
        </div>
        {cuesSupported() && (
          <button type="button" onClick={() => setSound((s) => !s)} className="p-2 rounded-full bg-white/10" aria-label={sound ? "Mute voice cues" : "Unmute voice cues"}>
            {sound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        )}
        {!clipSrc && <button type="button" onClick={flip} className="p-2 rounded-full bg-white/10" aria-label="Switch camera"><SwitchCamera className="w-5 h-5" /></button>}
      </div>

      {/* camera */}
      <div ref={boxRef} className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <div className="relative bg-zinc-900 overflow-hidden" style={{ width: viewW, height: viewH, transform: facing === "user" && !clipSrc ? "scaleX(-1)" : "none" }}>
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        </div>

        {phase === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
            <div className="w-8 h-8 rounded-full border-2 border-lime-400/30 border-t-lime-400 animate-spin" />
            <p className="text-sm text-zinc-200">Starting your camera…</p>
            <p className="text-[11px] text-zinc-400">First time also loads the pose model (about 20 MB).</p>
            {slowLoad && <p className="text-[12px] text-amber-200 max-w-xs text-center">Still loading. Your connection looks slow; this only takes long the first time.</p>}
          </div>
        )}

        {phase === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center">
            <Camera className="w-8 h-8 text-zinc-500" />
            <p className="text-sm text-zinc-200 max-w-xs">{errorMessage(error)}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => startSession(facing)} className="px-4 py-2 rounded-lg bg-lime-400 text-black font-bold text-sm">Try again</button>
              <button type="button" onClick={onExit} className="px-4 py-2 rounded-lg border border-zinc-700 text-sm">Back</button>
            </div>
          </div>
        )}

        {/* hint + slow note share one column so a long hint can never sit under the note or the score */}
        {phase === "live" && (tip || hud.slow) && (
          <div className={`absolute top-3 flex flex-col gap-1.5 pointer-events-none ${reps.length > 0 ? "left-3 right-[92px] items-start" : "inset-x-3 items-center"}`}>
            {tip && <div className="bg-black/70 backdrop-blur rounded-2xl px-4 py-2 text-[13px] text-center">{tip}</div>}
            {hud.slow && <div className="bg-amber-400/20 text-amber-200 rounded-full px-3 py-1 text-[11px]">Running slowly on this device</div>}
          </div>
        )}

        {phase === "live" && reps.length > 0 && (
          <div className="absolute top-3 right-3 bg-black/70 backdrop-blur rounded-xl px-3 py-1.5 text-right">
            <p className="text-lg font-black leading-none"><span className="text-lime-300">{inRange}</span><span className="text-zinc-500">/{reps.length}</span></p>
            <p className="text-[10px] text-zinc-400 mt-0.5">{streak > 1 ? `${streak} in a row` : "in range"}</p>
          </div>
        )}

        {/* the verdict on the swing you just did */}
        {toast && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl overflow-hidden bg-zinc-950/95 border border-white/10 shadow-2xl flex">
            {toast.picture && <img src={toast.picture} alt="Your moment of contact" className="w-28 object-cover shrink-0" />}
            <div className="p-3 min-w-0">
              <p className={`text-[11px] uppercase tracking-wider font-bold ${toast.inBand ? "text-lime-400" : "text-rose-300"}`}>
                Swing {toast.n} · {toast.inBand ? "in range" : "adjust"}
              </p>
              {toast.inBand || !toast.cues?.length ? (
                <p className="text-[15px] font-bold leading-snug mt-0.5">
                  {toast.inBand ? "Good: that's the position" : toast.cue?.headline || "Close: check the target"}
                </p>
              ) : (
                <ul className="mt-0.5 space-y-0.5">
                  {toast.cues.map((c) => <li key={c.joint} className="text-[14px] font-bold leading-snug">{c.headline}</li>)}
                </ul>
              )}
              <p className="text-[12px] text-zinc-300 mt-1 leading-snug">
                {Object.entries(toast.measured).filter(([, v]) => v != null).map(([j, v]) => {
                  const o = toast.off?.find((x) => x.joint === j);
                  return `${JOINT_LABEL[j]} ${Math.round(v)}°${o ? ` (aim ${Math.round(o.to)}°)` : ""}`;
                }).join(" · ")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* readings */}
      <div className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-zinc-950">
        <div className="space-y-1.5">
          {judged.map((j) => <Gauge key={j} label={JOINT_LABEL[j]} value={hud.vals?.[j]} range={ideal[j]} focus={focus === j} />)}
        </div>
        {phase === "live" && (
          <button type="button" onClick={finish} className="w-full mt-3 py-2.5 rounded-xl bg-white/10 text-sm font-semibold">Finish session</button>
        )}
      </div>
      {summary}
    </div>
  );
}

function Gauge({ label, value, range, focus }) {
  const has = typeof value === "number";
  const good = has && value >= range.min && value <= range.max;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / 180) * 100))}%`;
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[76px] shrink-0">
        <p className={`text-[11px] font-semibold leading-none ${focus ? "text-lime-300" : "text-zinc-300"}`}>{label}{focus ? " ★" : ""}</p>
        <p className={`text-sm font-mono font-bold mt-0.5 ${!has ? "text-zinc-600" : good ? "text-lime-300" : "text-rose-300"}`}>{has ? `${Math.round(value)}°` : "—"}</p>
      </div>
      <div className="relative flex-1 h-2.5 rounded-full bg-zinc-800 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-y-0 bg-lime-400/35" style={{ left: pct(range.min), width: `calc(${pct(range.max)} - ${pct(range.min)})` }} />
        {has && <div className={`absolute top-0 bottom-0 w-1.5 -ml-0.5 rounded-full ${good ? "bg-lime-300" : "bg-rose-400"}`} style={{ left: pct(value) }} />}
      </div>
      {good && <Check className="w-4 h-4 text-lime-300 shrink-0" aria-label="In range" />}
      {!good && has && <span className="w-4 shrink-0" />}
    </div>
  );
}

function errorMessage(e) {
  const n = e?.name || "";
  if (n === "NotAllowedError" || n === "SecurityError") return "Camera access is blocked. Allow the camera for this site in your browser's settings, then try again.";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "We couldn't find a camera on this device.";
  if (n === "NotReadableError") return "Another app is using the camera. Close it and try again.";
  if (n === "ModelTimeout") return "The pose model didn't finish loading. Check your connection and try again.";
  if (n === "NotSupportedError") return "This browser can't open the camera here. Try Chrome or Safari over a secure (https) connection.";
  const m = String(e?.message || e || "");
  if (/activeTexture|webgl|WebGL|GL context/.test(m)) return "This browser can't run the live pose model because graphics acceleration is off. Try Chrome or Safari with hardware acceleration on.";
  return "Couldn't start live practice on this device. Try again, or use Chrome or Safari.";
}
