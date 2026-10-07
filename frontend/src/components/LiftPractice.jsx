import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X, SwitchCamera, Volume2, VolumeX, Check, Camera, Dumbbell, AlertTriangle } from "lucide-react";
import { liveDelegate } from "@/ai/livePose";
import { LIFTS, measureLift, findDeadliftReps, gradeLiftRep, planLiftCorrection, liftCue, liftFaultsNow, viewLabel } from "@/ai/liftPose";
import { createCoach } from "@/ai/liveCoach";
import { correctLift } from "@/ai/liftCorrect";
import { drawLiftFrame } from "@/ai/liftDraw";
import { speakCue, cancelCue, cuesSupported, speakTest, deliverCue } from "@/lib/speakCue";
import { useVoiceHealth, voiceNote } from "@/lib/useVoiceHealth";
import { useLiveCamera, cameraErrorMessage } from "@/lib/useLiveCamera";
import { track } from "@/lib/analytics";
import { deviceKind } from "@/lib/frameSource";

/**
 * LiftPractice — shadow practice for a lift, with the phone's camera.
 *
 * Prop the phone up side-on, do your reps (with a bar, or the hinge with no weight),
 * and see yourself with a live skeleton and hip / knee / back angles. Each rep is found
 * from the hips closing and opening; after the lockout it is graded at the SETUP and the
 * LOCKOUT, spoken (one leg cue and one back cue at most) and shown. Holding still out of
 * range draws the corrected pose in green. All on the device: nothing is uploaded.
 *
 * Props: lift ("deadlift"), facing, clipSrc/clipRate (a same-site video instead of the camera), onExit().
 */

const LABEL = { hip: "Hips", knee: "Knees", trunk: "Back angle" };
const DOMAIN = { hip: [0, 180], knee: [0, 180], trunk: [-30, 100] };
const median = (a) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const HISTORY_S = 40; // seconds of readings kept to find reps in

export default function LiftPractice({ lift = "deadlift", facing: facingProp = "user", clipSrc = null, clipRate = 1, onExit }) {
  const L = LIFTS[lift];
  const seriesRef = useRef([]); // {t, hip, knee, trunk, trunkAbs}
  const framesRef = useRef([]); // {t, px, wl, vis, vw, vh}
  const picsRef = useRef([]); // {t, url, vw}
  const picAtRef = useRef(0);
  const fwdRef = useRef(null);
  const readingsRef = useRef({ hip: [], knee: [], trunk: [] });
  const histRef = useRef([]); // {t, hip, trunk} last ~0.6 s, to tell holding still from moving
  const viewsRef = useRef([]);
  const inFrameSinceRef = useRef(0);
  const nullRunRef = useRef(0);
  const lastHudRef = useRef(0);
  const lastCheckRef = useRef(0);
  const lastRepTRef = useRef(-Infinity);
  const repsRef = useRef([]);
  const startedAtRef = useRef(0);
  const toastTimerRef = useRef(0);
  const soundRef = useRef(true);
  const snapRef = useRef(null);
  const coachRef = useRef(createCoach());
  const coachKeyRef = useRef("");
  const facingRef = useRef(facingProp);
  const clipRef = useRef(clipSrc);

  const [sound, setSound] = useState(true);
  const [hud, setHud] = useState({ inFrame: false, armed: false, vals: {}, slow: false, phase: null, view: null });
  const [reps, setReps] = useState([]);
  const [toast, setToast] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [coachLine, setCoachLine] = useState(null);
  const vnote = voiceNote(useVoiceHealth());
  const toggleSound = () => { const next = !sound; setSound(next); if (next) speakTest(); }; // the tap proves whether sound works

  useEffect(() => { soundRef.current = sound; if (!sound) cancelCue(); }, [sound]);

  // The camera session comes first; it calls whatever frame handler is current (set below).
  const onFrameRef = useRef(null);
  const cam = useLiveCamera({ clipSrc, clipRate, facing: facingProp, onFrame: (f) => onFrameRef.current?.(f), trackName: "lift_practice", trackProps: { lift } });
  const { videoRef, canvasRef, boxRef, engineRef, phase, error, slowLoad, facing, flip, start, stop, viewW, viewH } = cam;

  // ─── a finished rep ───
  const evaluateRep = useCallback(async (r) => {
    const signed = !!fwdRef.current;
    const grade = gradeLiftRep(lift, { ...r, signed });
    const plans = { setup: planLiftCorrection(lift, "setup", r.setup), lockout: planLiftCorrection(lift, "lockout", r.lockout) };

    // a small picture of each key moment with the skeleton (and the fix, where there is one) drawn on
    const pictures = {};
    for (const [phase, t] of [["setup", r.tPull - 0.3], ["lockout", r.tLock]]) {
      try {
        const pic = picsRef.current.reduce((b, p) => (!b || Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b), null);
        const fr = framesRef.current.reduce((b, p) => (!b || Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b), null);
        if (!pic || !fr || Math.abs(pic.t - t) > 1 || Math.abs(fr.t - t) > 0.4) continue;
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = pic.url; });
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        if (facingRef.current === "user" && !clipRef.current) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(img, 0, 0);
        let ghost = null;
        const plan = plans[phase];
        if (plan.applied.some((x) => x.joint === "knee" || x.joint === "trunk")) {
          const cc = correctLift({ wl: fr.wl, px: fr.px, vis: fr.vis, delta: plan.delta, w: 1, fwd: fwdRef.current });
          if (cc) ghost = { px2: cc.px2, moved: cc.moved, w: 1 };
        }
        drawLiftFrame(ctx, { px: fr.px, vis: fr.vis, ghost }, c.width / fr.vw, {});
        pictures[phase] = c.toDataURL("image/jpeg", 0.75);
      } catch { /* a missing picture never hides the verdict */ }
    }

    const rep = { n: repsRef.current.length + 1, t: r.tLock, inBand: grade.inBand, grade, setup: r.setup, lockout: r.lockout, pictures };
    repsRef.current = [...repsRef.current, rep];
    setReps(repsRef.current);
    clearTimeout(toastTimerRef.current);
    setToast(rep);
    toastTimerRef.current = setTimeout(() => setToast(null), 5200);

    if (soundRef.current) {
      const streak = (() => { let n = 0; for (let i = repsRef.current.length - 1; i >= 0 && repsRef.current[i].inBand; i--) n++; return n; })();
      // the verdict on the rep is the most important thing said: it interrupts a routine cue
      if (!grade.inBand && grade.cues.length) speakCue(grade.cues.map((c) => c.headline).join(". "), { priority: 2, minGapMs: 0 });
      else if (grade.inBand) speakCue(streak >= 3 ? `${streak} in a row` : "Good rep", { priority: 2, minGapMs: 0 });
    }
  }, [lift]);

  // ─── every camera frame ───
  const onFrame = useCallback((f) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!f) {
      if (++nullRunRef.current > 8) inFrameSinceRef.current = 0;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = performance.now();
      if (now - lastHudRef.current > 150) { lastHudRef.current = now; setHud((h) => ({ ...h, inFrame: false, armed: false, vals: {}, phase: null })); }
      return;
    }
    nullRunRef.current = 0;
    const m = measureLift(f.wl, f.vis, fwdRef.current);
    if (m.fwdFrame) {
      const cur = fwdRef.current;
      if (!cur) fwdRef.current = m.fwdFrame;
      else {
        const x = 0.92 * cur[0] + 0.08 * m.fwdFrame[0], z = 0.92 * cur[2] + 0.08 * m.fwdFrame[2], n = Math.hypot(x, z) || 1;
        fwdRef.current = [x / n, 0, z / n];
      }
    }
    if (m.view != null) { viewsRef.current.push(m.view); if (viewsRef.current.length > 40) viewsRef.current.shift(); }

    // "in frame": hips, knees and trunk all measurable, both hips seen
    const inFrame = m.hip != null && m.knee != null && m.trunk != null && f.vis[23] >= 0.5 && f.vis[24] >= 0.5;
    const nowMs = performance.now();
    if (inFrame) { if (!inFrameSinceRef.current) inFrameSinceRef.current = nowMs; } else inFrameSinceRef.current = 0;
    const armed = !!inFrameSinceRef.current && nowMs - inFrameSinceRef.current > 800;

    // history for rep finding, frames and pictures for the verdict
    if (m.ok && m.hip != null && m.trunkAbs != null) {
      seriesRef.current.push({ t: f.t, hip: m.hip, knee: m.knee, trunk: m.trunk, trunkAbs: m.trunkAbs });
      while (seriesRef.current.length && seriesRef.current[0].t < f.t - HISTORY_S) seriesRef.current.shift();
    }
    framesRef.current.push({ t: f.t, px: f.px, wl: f.wl, vis: f.vis, vw: f.vw, vh: f.vh });
    while (framesRef.current.length && framesRef.current[0].t < f.t - HISTORY_S) framesRef.current.shift();
    if (armed && f.t - picAtRef.current >= 0.5 && videoRef.current) {
      picAtRef.current = f.t; // by the video's own clock, so a slowed-down clip keeps the same picture spacing
      try {
        const sw = 240, sh = Math.round((240 * f.vh) / f.vw);
        const c = snapRef.current || (snapRef.current = document.createElement("canvas"));
        c.width = sw; c.height = sh;
        c.getContext("2d").drawImage(videoRef.current, 0, 0, sw, sh);
        picsRef.current.push({ t: f.t, url: c.toDataURL("image/jpeg", 0.6), vw: f.vw });
        while (picsRef.current.length && picsRef.current[0].t < f.t - HISTORY_S) picsRef.current.shift();
        while (picsRef.current.length > 120) picsRef.current.shift();
      } catch { /* no picture for this frame */ }
    }

    // smooth the readings over a few frames
    for (const j of ["hip", "knee", "trunk"]) {
      const arr = readingsRef.current[j];
      if (m[j] != null) { arr.push(m[j]); if (arr.length > 5) arr.shift(); } else arr.length = 0;
    }
    const smooth = { hip: median(readingsRef.current.hip), knee: median(readingsRef.current.knee), trunk: median(readingsRef.current.trunk) };
    histRef.current.push({ t: f.t, hip: smooth.hip, trunk: smooth.trunk });
    while (histRef.current.length && histRef.current[0].t < f.t - 0.6) histRef.current.shift();
    const span = (k) => { const v = histRef.current.map((h) => h[k]).filter((x) => x != null); return v.length ? Math.max(...v) - Math.min(...v) : 99; };
    const holding = histRef.current.length >= 3 && span("hip") < 8 && span("trunk") < 8;

    // which position are we judging right now?
    const phaseNow = smooth.hip == null ? null : smooth.hip >= 140 ? "lockout" : smooth.hip <= 110 ? "setup" : null;

    // continuous coaching: while you hold the setup or the top, say what to fix (or that it's good)
    const faultsNow = armed && holding && phaseNow ? liftFaultsNow(lift, phaseNow, smooth) : null;
    const co = coachRef.current.update({ now: nowMs, active: armed && holding && !!phaseNow, faults: faultsNow });
    const lineKey = co.line ? `${co.line.kind}:${co.line.text}` : "";
    if (lineKey !== coachKeyRef.current) { coachKeyRef.current = lineKey; setCoachLine(co.line); }
    deliverCue(co, soundRef.current);

    // reps: look every 0.4 s; a rep is graded once its lockout has held for 0.9 s
    if (armed && nowMs - lastCheckRef.current > 400) {
      lastCheckRef.current = nowMs;
      const found = findDeadliftReps(seriesRef.current);
      for (const r of found) {
        if (f.t - r.tLock >= 0.9 && r.tLock - lastRepTRef.current > 1.5) {
          lastRepTRef.current = r.tLock;
          evaluateRep(r);
        }
      }
    }

    // draw: the skeleton, and the corrected pose when you hold still outside the target
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const lf = { px: f.px, vis: f.vis, ghost: null };
      if (armed && holding && phaseNow) {
        const plan = planLiftCorrection(lift, phaseNow, smooth);
        if (plan.applied.some((x) => x.joint === "knee" || x.joint === "trunk")) {
          const c = correctLift({ wl: f.wl, px: f.px, vis: f.vis, delta: plan.delta, w: 1, fwd: fwdRef.current });
          if (c) lf.ghost = { px2: c.px2, moved: c.moved, w: 1 };
        }
      }
      drawLiftFrame(ctx, lf, canvas.width / f.vw, {});
    }

    if (nowMs - lastHudRef.current > 130) {
      lastHudRef.current = nowMs;
      const st = engineRef.current?.stats();
      const vs = [...viewsRef.current].sort((a, b) => a - b);
      setHud({ inFrame, armed, vals: smooth, slow: !!st && st.inferMs > 140, phase: phaseNow, view: vs.length >= 10 ? viewLabel(vs[Math.floor(vs.length / 2)]) : null });
    }
  }, [lift, evaluateRep, canvasRef, engineRef, videoRef]);

  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  useEffect(() => { facingRef.current = facing; }, [facing]);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);
  useEffect(() => { if (phase === "live" && !startedAtRef.current) startedAtRef.current = Date.now(); }, [phase]);

  const reset = () => {
    seriesRef.current = []; framesRef.current = []; picsRef.current = [];
    readingsRef.current = { hip: [], knee: [], trunk: [] }; histRef.current = [];
    lastRepTRef.current = -Infinity; inFrameSinceRef.current = 0;
    coachRef.current.reset(); coachKeyRef.current = ""; setCoachLine(null);
  };

  const finish = () => {
    const list = repsRef.current;
    track("lift_practice_ended", {
      lift, reps: list.length, in_range: list.filter((r) => r.inBand).length,
      seconds: Math.round((Date.now() - (startedAtRef.current || Date.now())) / 1000),
      device: deviceKind(), delegate: liveDelegate(), fps: Math.round(engineRef.current?.stats().fps || 0),
      view: hud.view || null,
    });
    stop();
    setSummaryOpen(true);
  };

  // ─── render ───
  const inRange = reps.filter((r) => r.inBand).length;
  const streak = (() => { let n = 0; for (let i = reps.length - 1; i >= 0 && reps[i].inBand; i--) n++; return n; })();
  const bands = hud.phase ? L[hud.phase] : null;

  let summary = null;
  if (summaryOpen) {
    const counts = {};
    for (const r of reps) for (const f of r.grade.faults) {
      const k = `${f.phase}.${f.joint}`;
      counts[k] = counts[k] || { n: 0, f };
      counts[k].n++; counts[k].f = f;
    }
    const isBack = (f) => f.joint === "trunk" || f.joint === "hips";
    const top = (back) => Object.values(counts).filter((c) => isBack(c.f) === back).sort((a, b) => b.n - a.n)[0];
    const cards = [top(false), top(true)].filter(Boolean).sort((a, b) => b.n - a.n).map((c) => ({
      n: c.n,
      cue: c.f.joint === "hips" ? liftCue(lift, "pull", "hips", 0, null) : liftCue(lift, c.f.phase, c.f.joint, c.f.value, c.f.range),
    })).filter((c) => c.cue);
    summary = (
      <div className="fixed inset-0 z-[62] bg-zinc-950 text-white overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-8">
          <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">Session done · {L.label}</p>
          <h1 className="font-heading text-3xl font-black mt-1">{reps.length ? `${inRange} of ${reps.length} in range` : "No reps counted"}</h1>
          {reps.length === 0 && (
            <p className="text-zinc-300 text-sm mt-3">We didn't catch a full rep. Film from the side with your whole body in view, and go from the setup all the way to a standing lockout.</p>
          )}
          {reps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {reps.map((r) => <span key={r.n} className={`w-7 h-7 rounded-md text-[11px] font-bold flex items-center justify-center ${r.inBand ? "bg-lime-400 text-black" : "bg-rose-500/80 text-white"}`}>{r.n}</span>)}
            </div>
          )}
          {cards.map(({ n, cue }, i) => (
            <div key={cue.headline} className="mt-5 rounded-xl border border-lime-400/30 bg-lime-400/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold">{i === 0 ? "Work on next" : "Then"}<span className="text-zinc-400 normal-case tracking-normal font-medium"> · off on {n} of {reps.length} {reps.length === 1 ? "rep" : "reps"}</span></p>
              <p className="text-[15px] font-bold mt-0.5">{cue.headline}</p>
              <p className="text-[13px] text-zinc-300 mt-1">{cue.feel}</p>
              <p className="text-[12px] text-sky-200 mt-2 flex gap-1.5"><Dumbbell className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{cue.drill}</span></p>
            </div>
          ))}
          <div className="mt-6 grid gap-2">
            <button type="button" onClick={() => { repsRef.current = []; setReps([]); reset(); startedAtRef.current = Date.now(); setSummaryOpen(false); start(facing); }} className="w-full py-3 rounded-xl bg-lime-400 text-black font-bold">Practise again</button>
            <Link to="/analyze" className="w-full py-3 rounded-xl border border-zinc-700 text-center font-semibold text-zinc-200">Film a real lift and get the full check</Link>
            <button type="button" onClick={onExit} className="w-full py-3 text-zinc-400 font-semibold">Done</button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-4">Your video stayed on your phone: nothing was uploaded. Guide ranges, not a coach's verdict.</p>
        </div>
      </div>
    );
  }

  const tip = !hud.inFrame ? "Step back until you're in view from head to feet, side-on to the camera"
    : !hud.armed ? "Hold on… getting ready"
    : reps.length === 0 ? (hud.view === "head-on" ? "Turn side-on to the camera for the most accurate angles, then do a rep" : "Hold your setup or your top and we'll coach you. Do a rep and we'll check it.")
    : null;

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col select-none">
      <div className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={phase === "live" ? finish : onExit} className="p-2 rounded-full bg-white/10" aria-label="Finish"><X className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold">Shadow practice</p>
          <p className="text-sm font-bold truncate">{L.label}</p>
        </div>
        {cuesSupported() && (
          <button type="button" onClick={toggleSound} className="p-2 rounded-full bg-white/10" aria-label={sound ? "Mute voice cues" : "Unmute voice cues"}>
            {sound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        )}
        {!clipSrc && <button type="button" onClick={flip} className="p-2 rounded-full bg-white/10" aria-label="Switch camera"><SwitchCamera className="w-5 h-5" /></button>}
      </div>

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
            <p className="text-sm text-zinc-200 max-w-xs">{cameraErrorMessage(error)}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => start(facing)} className="px-4 py-2 rounded-lg bg-lime-400 text-black font-bold text-sm">Try again</button>
              <button type="button" onClick={onExit} className="px-4 py-2 rounded-lg border border-zinc-700 text-sm">Back</button>
            </div>
          </div>
        )}

        {/* hint + slow note share one column so neither can sit under the other or the score */}
        {phase === "live" && (coachLine || tip || hud.slow) && (
          <div className={`absolute top-3 flex flex-col gap-1.5 pointer-events-none ${reps.length > 0 ? "left-3 right-[92px] items-start" : "inset-x-3 items-center"}`}>
            {coachLine && (
              <div role="status" aria-live="polite" className={`rounded-2xl px-4 py-2 text-[18px] font-black leading-tight shadow-lg flex items-center gap-2 ${coachLine.kind === "good" ? "bg-lime-400 text-black" : "bg-rose-500 text-white"}`}>
                {coachLine.kind === "good" ? <Check className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}{coachLine.text}
              </div>
            )}
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

        {toast && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl overflow-hidden bg-zinc-950/95 border border-white/10 shadow-2xl flex">
            <div className="flex shrink-0">
              {["setup", "lockout"].map((p) => toast.pictures[p] && <img key={p} src={toast.pictures[p]} alt={`Your ${p}`} className="w-20 object-cover" />)}
            </div>
            <div className="p-3 min-w-0">
              <p className={`text-[11px] uppercase tracking-wider font-bold ${toast.inBand ? "text-lime-400" : "text-rose-300"}`}>Rep {toast.n} · {toast.inBand ? "in range" : "adjust"}</p>
              {toast.inBand || !toast.grade.cues.length ? (
                <p className="text-[15px] font-bold leading-snug mt-0.5">{toast.inBand ? "Good: setup and lockout are in range" : "Close: check the numbers"}</p>
              ) : (
                <ul className="mt-0.5 space-y-0.5">{toast.grade.cues.map((c) => <li key={`${c.phase}.${c.joint}`} className="text-[14px] font-bold leading-snug">{c.headline}</li>)}</ul>
              )}
              <p className="text-[12px] text-zinc-300 mt-1 leading-snug">
                <span className="text-zinc-500">Setup</span> {fmt(toast.setup)}<br />
                <span className="text-zinc-500">Top</span> {fmt(toast.lockout)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-zinc-950">
        <div className="space-y-1.5">
          {["hip", "knee", "trunk"].map((j) => <Gauge key={j} label={LABEL[j]} value={hud.vals?.[j]} domain={DOMAIN[j]} range={bands?.[j] || null} />)}
        </div>
        <p className="text-[11px] text-zinc-500 mt-1.5">{hud.phase === "setup" ? "Judging your setup position" : hud.phase === "lockout" ? "Judging your lockout position" : "In motion: judged at the setup and the lockout"}</p>
        {vnote && sound && <p className="text-[11px] text-amber-200 mt-2 leading-snug">{vnote}</p>}
        {phase === "live" && <button type="button" onClick={finish} className="w-full mt-2 py-2.5 rounded-xl bg-white/10 text-sm font-semibold">Finish session</button>}
      </div>
      {summary}
    </div>
  );
}

const fmt = (m) => [["hip", "hips"], ["knee", "knees"], ["trunk", "back"]].map(([j, n]) => (m?.[j] != null ? `${n} ${Math.round(m[j])}°` : null)).filter(Boolean).join(" · ");

function Gauge({ label, value, domain, range }) {
  const [lo, hi] = domain;
  const has = typeof value === "number";
  const good = has && range && value >= range.min && value <= range.max;
  const pct = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[84px] shrink-0">
        <p className="text-[11px] font-semibold leading-none text-zinc-300">{label}</p>
        <p className={`text-sm font-mono font-bold mt-0.5 ${!has ? "text-zinc-600" : !range ? "text-zinc-200" : good ? "text-lime-300" : "text-rose-300"}`}>{has ? `${Math.round(value)}°` : "—"}</p>
      </div>
      <div className="relative flex-1 h-2.5 rounded-full bg-zinc-800 overflow-hidden" aria-hidden="true">
        {range && <div className="absolute inset-y-0 bg-lime-400/35" style={{ left: pct(range.min), width: `calc(${pct(range.max)} - ${pct(range.min)})` }} />}
        {has && <div className={`absolute top-0 bottom-0 w-1.5 -ml-0.5 rounded-full ${!range ? "bg-zinc-300" : good ? "bg-lime-300" : "bg-rose-400"}`} style={{ left: pct(value) }} />}
      </div>
      {good && <Check className="w-4 h-4 text-lime-300 shrink-0" aria-label="In range" />}
      {!good && <span className="w-4 shrink-0" />}
    </div>
  );
}
