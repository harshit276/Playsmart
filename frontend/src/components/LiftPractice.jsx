import { useCallback, useEffect, useRef, useState } from "react";
import { liveDelegate } from "@/ai/livePose";
import { LIFTS, measureLift, findDeadliftReps, gradeLiftRep, planLiftCorrection, liftCue, liftFaultsNow, viewLabel } from "@/ai/liftPose";
import { createCoach } from "@/ai/liveCoach";
import { correctLift } from "@/ai/liftCorrect";
import { drawLiftFrame } from "@/ai/liftDraw";
import { speakCue, cancelCue, speakTest, deliverCue } from "@/lib/speakCue";
import { useVoiceHealth, voiceNote } from "@/lib/useVoiceHealth";
import { useLiveCamera } from "@/lib/useLiveCamera";
import { track } from "@/lib/analytics";
import { deviceKind } from "@/lib/frameSource";
import { verdictMs } from "@/lib/testHooks";
import PracticeShell from "@/components/practice/PracticeShell";
import PracticeTopBar from "@/components/practice/PracticeTopBar";
import PracticeStage from "@/components/practice/PracticeStage";
import CoachBanner from "@/components/practice/CoachBanner";
import FormChips from "@/components/practice/FormChips";
import VerdictCard from "@/components/practice/VerdictCard";
import SettingsSheet from "@/components/practice/SettingsSheet";
import PracticeSummary from "@/components/practice/PracticeSummary";

/**
 * LiftPractice — shadow practice for a lift, with the phone's camera.
 *
 * Prop the phone up side-on, do your reps (with a bar, or the hinge with no weight). Each rep is
 * found from the hips closing and opening; after the lockout it is graded at the SETUP and the
 * LOCKOUT, spoken (one leg cue and one back cue at most) and shown. While you hold the setup or the
 * top the coach says what to fix, and the corrected pose is drawn in green. All on the device:
 * nothing is uploaded.
 *
 * Props: lift ("deadlift"), facing, clipSrc/clipRate (a same-site video instead of the camera), onExit().
 */

const median = (a) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const HISTORY_S = 40; // seconds of readings kept to find reps in
const VERDICT_MS = 5000;

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
  const verdictTimerRef = useRef(0);
  const soundRef = useRef(true);
  const snapRef = useRef(null);
  const coachRef = useRef(createCoach());
  const coachKeyRef = useRef("");
  const facingRef = useRef(facingProp);
  const clipRef = useRef(clipSrc);

  const [sound, setSound] = useState(true);
  const [showValues, setShowValues] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hud, setHud] = useState({ inFrame: false, armed: false, vals: {}, slow: false, phase: null, view: null });
  const [reps, setReps] = useState([]);
  const [verdict, setVerdict] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [coachLine, setCoachLine] = useState(null);
  const vnote = voiceNote(useVoiceHealth());
  const toggleSound = () => { const next = !sound; setSound(next); if (next) speakTest(); }; // the tap proves whether sound works

  useEffect(() => { soundRef.current = sound; if (!sound) cancelCue(); }, [sound]);

  // The camera session comes first; it calls whatever frame handler is current (set below).
  const onFrameRef = useRef(null);
  const cam = useLiveCamera({ clipSrc, clipRate, facing: facingProp, onFrame: (f) => onFrameRef.current?.(f), trackName: "lift_practice", trackProps: { lift } });
  const { videoRef, canvasRef, engineRef, phase, facing, flip, start, stop } = cam;

  // ─── a finished rep ───
  const evaluateRep = useCallback(async (r) => {
    const signed = !!fwdRef.current;
    const grade = gradeLiftRep(lift, { ...r, signed });
    const plans = { setup: planLiftCorrection(lift, "setup", r.setup), lockout: planLiftCorrection(lift, "lockout", r.lockout) };

    // a small picture of each key moment with the skeleton (and the fix, where there is one) drawn on
    const pictures = {};
    for (const [ph, t] of [["setup", r.tPull - 0.3], ["lockout", r.tLock]]) {
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
        const plan = plans[ph];
        if (plan.applied.some((x) => x.joint === "knee" || x.joint === "trunk")) {
          const cc = correctLift({ wl: fr.wl, px: fr.px, vis: fr.vis, delta: plan.delta, w: 1, fwd: fwdRef.current });
          if (cc) ghost = { px2: cc.px2, moved: cc.moved, w: 1 };
        }
        drawLiftFrame(ctx, { px: fr.px, vis: fr.vis, ghost }, c.width / fr.vw, {});
        pictures[ph] = c.toDataURL("image/jpeg", 0.75);
      } catch { /* a missing picture never hides the verdict */ }
    }

    const rep = { n: repsRef.current.length + 1, t: r.tLock, inBand: grade.inBand, grade, setup: r.setup, lockout: r.lockout, pictures };
    repsRef.current = [...repsRef.current, rep];
    setReps(repsRef.current);
    clearTimeout(verdictTimerRef.current);
    setVerdict(rep);
    verdictTimerRef.current = setTimeout(() => setVerdict(null), verdictMs(VERDICT_MS));

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
  useEffect(() => () => clearTimeout(verdictTimerRef.current), []);
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

  const again = () => {
    repsRef.current = []; setReps([]); setVerdict(null); reset();
    startedAtRef.current = Date.now(); setSummaryOpen(false); start(facing);
  };

  // ─── what's on screen ───
  const good = reps.filter((r) => r.inBand).length;
  const last = reps[reps.length - 1] || null;
  const num = (v) => (v == null ? null : `${Math.round(Math.abs(v))}°`);
  const faultKeys = new Set(hud.armed && hud.phase ? liftFaultsNow(lift, hud.phase, hud.vals).map((f) => f.key) : []);
  const nowState = (j) => (!hud.armed || !hud.phase || hud.vals?.[j] == null ? "na" : faultKeys.has(`${hud.phase}.${j}`) ? "off" : "ok");
  const nowGroup = {
    label: hud.phase === "setup" ? "Setup now" : hud.phase === "lockout" ? "Top now" : "Position",
    items: [
      { key: "hip", label: "Hips", state: nowState("hip"), detail: num(hud.vals?.hip) },
      { key: "knee", label: "Knees", state: nowState("knee"), detail: num(hud.vals?.knee) },
      { key: "trunk", label: "Back", state: nowState("trunk"), detail: num(hud.vals?.trunk) },
    ],
  };
  const phaseState = (p) => {
    if (!last) return "na";
    const its = last.grade.items.filter((i) => i.phase === p);
    return !its.length ? "na" : its.some((i) => !i.ok) ? "off" : "ok";
  };
  const lastGroup = {
    label: "Last rep",
    items: [
      { key: "setup", label: "Setup", state: phaseState("setup") },
      { key: "top", label: "Top", state: phaseState("lockout") },
      ...(last && last.grade.faults.some((f) => f.phase === "pull") ? [{ key: "pull", label: "Pull", state: "off" }] : []),
    ],
  };

  const tip = !hud.inFrame ? "Step back so you're in view from head to feet, side-on to the camera"
    : !hud.armed ? "Hold still for a moment…"
    : reps.length === 0 && !coachLine ? (hud.view === "head-on" ? "Turn side-on to the camera for the most accurate angles" : "Hold your setup or the top and we'll coach you. Do a rep and we'll check it.") : null;
  const banner = coachLine && !verdict ? { kind: coachLine.kind, text: coachLine.text } : tip && !verdict ? { kind: "info", text: tip } : null;

  const verdictText = verdict && (verdict.inBand
    ? { headline: "Setup and top in range", detail: null }
    : { headline: verdict.grade.cues[0]?.headline || "Close: check the numbers", detail: verdict.grade.cues[1]?.headline || null });

  // the summary: the most common leg fault and the most common back fault
  const summaryCards = (() => {
    const counts = {};
    for (const r of reps) for (const f of r.grade.faults) {
      const k = `${f.phase}.${f.joint}`;
      counts[k] = counts[k] || { n: 0, f };
      counts[k].n++; counts[k].f = f;
    }
    const isBack = (f) => f.joint === "trunk" || f.joint === "hips";
    const top = (back) => Object.values(counts).filter((c) => isBack(c.f) === back).sort((a, b) => b.n - a.n)[0];
    return [top(false), top(true)].filter(Boolean).sort((a, b) => b.n - a.n).map((c) => ({
      count: c.n,
      cue: c.f.joint === "hips" ? liftCue(lift, "pull", "hips", 0, null) : liftCue(lift, c.f.phase, c.f.joint, c.f.value, c.f.range),
    })).filter((c) => c.cue).map((c) => ({ ...c.cue, count: c.count }));
  })();

  const summary = summaryOpen ? (
    <PracticeSummary
      title={L.label}
      total={reps.length}
      good={good}
      noun="rep"
      thumbs={reps.map((r) => ({ n: r.n, inBand: r.inBand, url: r.pictures.lockout || r.pictures.setup })).filter((t) => t.url)}
      cards={summaryCards}
      onAgain={again}
      onExit={onExit}
      analyzeText="Film a real lift and get the full check"
      emptyText="We didn't catch a full rep. Film from the side with your whole body in view, and go from the setup all the way to a standing lockout."
    />
  ) : null;

  return (
    <>
      <PracticeShell
        top={<PracticeTopBar title={L.label} subtitle="Shadow practice" onClose={phase === "live" ? finish : onExit} sound={sound} onToggleSound={toggleSound} onSettings={() => setSettingsOpen(true)} slow={hud.slow} />}
        bottom={(
          <div className="px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-zinc-950 space-y-2.5">
            <FormChips groups={[nowGroup, lastGroup]} showValues={showValues} />
            {phase === "live" && <button type="button" onClick={finish} className="w-full py-3 rounded-xl bg-white/10 text-[15px] font-semibold active:bg-white/15">Finish session</button>}
          </div>
        )}
      >
        <PracticeStage cam={cam} mirrored={facing === "user" && !clipSrc} onExit={onExit}>
          {phase === "live" && banner && <CoachBanner kind={banner.kind} text={banner.text} />}
          {phase === "live" && !verdict && reps.length > 0 && (
            <div className="absolute bottom-3 left-3 rounded-full bg-black/65 backdrop-blur px-3 py-1.5 text-[13px] font-bold z-10">
              {reps.length} {reps.length === 1 ? "rep" : "reps"} · <span className="text-lime-300">{good} good</span>
            </div>
          )}
          {verdict && <VerdictCard rep={verdict} headline={verdictText.headline} detail={verdictText.detail} label="Rep" />}
          <SettingsSheet
            open={settingsOpen} onClose={() => setSettingsOpen(false)}
            canFlip={!clipSrc} onFlip={flip}
            sound={sound} onToggleSound={toggleSound}
            showValues={showValues} onShowValues={setShowValues}
            note={vnote}
          />
        </PracticeStage>
      </PracticeShell>
      {summary}
    </>
  );
}
