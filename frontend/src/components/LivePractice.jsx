import { useCallback, useEffect, useRef, useState } from "react";
import { liveDelegate } from "@/ai/livePose";
import { createSwingDetector } from "@/ai/swingDetector";
import { jointIdx, measureJoints, planCorrections, correctLimbs } from "@/ai/correctPose";
import { measureBody, bodyFaults, bodyState, bodyDelta, isOverheadShot } from "@/ai/bodyCheck";
import { correctLift } from "@/ai/liftCorrect";
import { drawLiftFrame } from "@/ai/liftDraw";
import { fixCue } from "@/ai/fixCues";
import { createCoach } from "@/ai/liveCoach";
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
 * LivePractice — shadow practice for a racquet shot, with the phone's camera.
 *
 * Two things are judged, at two different moments:
 *   - Between swings, while you hold still (the READY stance): knees, back lean and stance width.
 *     The coach talks about those, and shows the corrected stance in green.
 *   - At the moment of each swing (CONTACT): the arm and elbow against the shot's own targets,
 *     plus the knee target where the shot has one and any gross body fault. That is the verdict.
 *
 * It does NOT check that the swing is the shot you picked (a serve versus a drive): that needs
 * real footage of each shot to calibrate, and without it the check would be guesswork.
 * All on the device: the video never leaves the phone.
 *
 * Props: ideal (an idealAngles entry), shotName, shotKey, sport, hand, facing, clipSrc/clipRate, onExit().
 */

const HOLD_SPEED = 1.0; // m/s: below this the player is holding a pose, not swinging (landmark jitter alone reaches ~0.5)
const SWING_QUIET_MS = 2500; // after a swing the coach stays quiet this long: the verdict is what matters
const VERDICT_MS = 4200;
const GREEN = "#a3e635", DARK = "rgba(10,10,10,0.85)";
const median = (a) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// the green arm/leg fix drawn on a contact picture
function drawLimbs(ctx, limbs, s, lw) {
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
}

export default function LivePractice({ ideal, shotName, shotKey = "", sport, hand: handProp = "right", facing: facingProp = "user", clipSrc = null, clipRate = 1, onExit }) {
  const detectorRef = useRef(createSwingDetector());
  const ringRef = useRef([]); // recent frames {t, px, wl, vis, vw, vh}
  const bmpRef = useRef([]); // recent small pictures {t, bmp}
  const snapRef = useRef(null);
  const coachRef = useRef(createCoach({ holdMs: 1000, cooldownMs: 4000, repeatMs: 12000, goodText: "Good stance" }));
  const coachKeyRef = useRef("");
  const fwdRef = useRef(null);
  const readingsRef = useRef({ shoulder: [], elbow: [], knee: [], bknee: [], btrunk: [], bstance: [] });
  const lastHudRef = useRef(0);
  const nullRunRef = useRef(0);
  const inFrameSinceRef = useRef(0);
  const lastSwingAtRef = useRef(-1e9);
  const repsRef = useRef([]);
  const startedAtRef = useRef(0);
  const verdictTimerRef = useRef(0);
  const noticeTimerRef = useRef(0);
  const soundRef = useRef(true);
  const handRef = useRef(handProp);
  const facingRef = useRef(facingProp);

  const [sound, setSound] = useState(true);
  const [hand, setHand] = useState(handProp);
  const [showValues, setShowValues] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [hud, setHud] = useState({ inFrame: false, armed: false, slow: false, stance: {} });
  const [reps, setReps] = useState([]);
  const [verdict, setVerdict] = useState(null);
  const [notice, setNotice] = useState(null);
  const [coachLine, setCoachLine] = useState(null);
  const vnote = voiceNote(useVoiceHealth());

  const judged = ["shoulder", "elbow", "knee"].filter((j) => ideal?.[j]);
  const armJudged = ["shoulder", "elbow"].filter((j) => ideal?.[j]);
  const toggleSound = () => { const next = !sound; setSound(next); if (next) speakTest(); }; // the tap proves whether sound works

  useEffect(() => { soundRef.current = sound; if (!sound) cancelCue(); }, [sound]);
  useEffect(() => { handRef.current = hand; detectorRef.current.reset(); }, [hand]);

  // The camera session comes first; it calls whatever frame handler is current (set below).
  const onFrameRef = useRef(null);
  const cam = useLiveCamera({ clipSrc, clipRate, facing: facingProp, onFrame: (f) => onFrameRef.current?.(f), trackName: "practice", trackProps: { sport, shot: shotName } });
  const { videoRef, canvasRef, engineRef, phase, facing, flip, start, stop } = cam;
  useEffect(() => { facingRef.current = facing; }, [facing]);

  // ─── a swing: the moment of contact was at tPeak ───
  const evaluateRep = useCallback(({ tPeak, peakSpeed }) => {
    const ring = ringRef.current;
    if (!ring.length) return;
    const near = ring.filter((f) => Math.abs(f.t - tPeak) <= 0.06);
    const frames = near.length ? near : [ring.reduce((b, f) => (Math.abs(f.t - tPeak) < Math.abs(b.t - tPeak) ? f : b), ring[0])];
    const side = handRef.current;
    const per = frames.map((f) => measureJoints(f.wl, f.vis, side));
    const measured = {};
    for (const j of judged) measured[j] = median(per.map((p) => p.measured[j]));
    const bodies = frames.map((f) => measureBody(f.wl, f.vis, fwdRef.current));
    const bodyVals = { knee: median(bodies.map((b) => b.knee)), trunk: median(bodies.map((b) => b.trunk)), stance: median(bodies.map((b) => b.stance)) };
    if (!armJudged.some((j) => measured[j] != null)) {
      setNotice("Couldn't see your arm on that swing. Step back a little.");
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 3500);
      return;
    }

    // everything out of range at contact, worst first: the arm and (where the shot has a target) the knee, then gross body faults
    const plan = planCorrections(measured, ideal);
    const sevOf = (a) => Math.abs(a.deltaDeg) / Math.max(10, (ideal[a.joint].max - ideal[a.joint].min) / 2);
    const faults = [
      ...plan.applied.map((a) => ({ key: a.joint, area: a.joint === "knee" ? "body" : "arm", cue: { ...fixCue(a.joint, a.from, a.to) }, severity: sevOf(a), from: a.from, to: a.to })),
      ...bodyFaults("contact", bodyVals, { sport, shot: shotKey, skip: ideal?.knee ? ["knee"] : [] }).map((f) => ({ key: f.key, area: "body", cue: f.cue, severity: f.severity })),
    ].filter((f) => f.cue?.headline).sort((a, b) => b.severity - a.severity);
    const inBand = faults.length === 0;
    // one cue for the arm and one for the body when both are off
    const cues = [faults.find((f) => f.area === "arm"), faults.find((f) => f.area === "body")].filter(Boolean).sort((a, b) => b.severity - a.severity).map((f) => ({ ...f.cue, key: f.key, area: f.area }));

    // the Last-swing chips
    const jointState = (j) => (ideal?.[j] == null || measured[j] == null ? "na" : plan.applied.some((a) => a.joint === j) ? "off" : "ok");
    // the body is judged at contact when the shot has its own knee target, or isn't an overhead shot (where an arched back and straight legs are normal)
    const bodyJudged = !!ideal?.knee || !isOverheadShot(sport, shotKey);
    const bodySeen = bodyVals.knee != null || bodyVals.trunk != null || measured.knee != null;
    const chips = {
      shoulder: jointState("shoulder"),
      elbow: jointState("elbow"),
      body: faults.some((f) => f.area === "body") ? "off" : bodyJudged && bodySeen ? "ok" : "na",
    };

    // the contact picture: the nearest saved frame, with the skeleton and the correction drawn on it
    let picture = null;
    const frame = frames.reduce((b, f) => (Math.abs(f.t - tPeak) < Math.abs(b.t - tPeak) ? f : b), frames[0]);
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
        drawLiftFrame(ctx, { px: frame.px, vis: frame.vis }, s, { lw });
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

    const rep = { n: repsRef.current.length + 1, t: tPeak, inBand, measured, bodyVals, faults, cues, chips, picture, peakSpeed };
    repsRef.current = [...repsRef.current, rep];
    setReps(repsRef.current);
    lastSwingAtRef.current = performance.now();
    coachRef.current.reset(); coachKeyRef.current = ""; setCoachLine(null);
    clearTimeout(verdictTimerRef.current);
    setVerdict(rep);
    verdictTimerRef.current = setTimeout(() => setVerdict(null), verdictMs(VERDICT_MS));

    if (soundRef.current) {
      const streak = (() => { let n = 0; for (let i = repsRef.current.length - 1; i >= 0 && repsRef.current[i].inBand; i--) n++; return n; })();
      // the verdict on the swing is the most important thing said: it interrupts a routine cue
      if (!inBand && cues.length) speakCue(cues.map((c) => c.headline).join(". "), { priority: 2, minGapMs: 0 });
      else if (inBand) speakCue(streak >= 3 ? `${streak} in a row` : "Good", { priority: 2, minGapMs: 0 });
    }
  }, [ideal, judged, armJudged, sport, shotKey, clipSrc]);

  // ─── every camera frame ───
  const onFrame = useCallback((f) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const det = detectorRef.current;
    if (!f) {
      det.push(0, null, null);
      if (++nullRunRef.current > 8) inFrameSinceRef.current = 0;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = performance.now();
      if (now - lastHudRef.current > 150) { lastHudRef.current = now; setHud((h) => ({ ...h, inFrame: false, armed: false, stance: {} })); }
      return;
    }
    nullRunRef.current = 0;
    const side = handRef.current;
    const { WR, SH } = jointIdx(side);
    const { armOk, measured } = measureJoints(f.wl, f.vis, side);
    const body = measureBody(f.wl, f.vis, fwdRef.current);
    if (body.fwdFrame) {
      const cur = fwdRef.current;
      if (!cur) fwdRef.current = body.fwdFrame;
      else {
        const x = 0.92 * cur[0] + 0.08 * body.fwdFrame[0], z = 0.92 * cur[2] + 0.08 * body.fwdFrame[2], n = Math.hypot(x, z) || 1;
        fwdRef.current = [x / n, 0, z / n];
      }
    }
    // "in frame": the hitting arm and both hips are seen well enough to coach
    const inFrame = armOk && f.vis[23] >= 0.5 && f.vis[24] >= 0.5;
    const nowMs = performance.now();
    if (inFrame) { if (!inFrameSinceRef.current) inFrameSinceRef.current = nowMs; } else inFrameSinceRef.current = 0;
    const armed = !!inFrameSinceRef.current && nowMs - inFrameSinceRef.current > 800;

    // keep ~1.2 s of frames and a small picture every other frame, for the contact picture
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
    const push = (k, v) => { const a = readingsRef.current[k]; if (v != null) { a.push(v); if (a.length > 5) a.shift(); } else a.length = 0; };
    for (const j of judged) push(j, measured[j]);
    push("bknee", body.knee); push("btrunk", body.trunk); push("bstance", body.stance);
    const stance = { knee: median(readingsRef.current.bknee), trunk: median(readingsRef.current.btrunk), stance: median(readingsRef.current.bstance) };

    // swings
    const ev = armed && armOk ? det.push(f.t, f.wl[WR], f.wl[SH]) : (det.push(f.t, null, null), null);
    if (ev) evaluateRep(ev);
    const moving = det.speed() > HOLD_SPEED;

    // between swings, while you hold still: coach the ready stance (knees, back, feet), not the arm
    const quiet = nowMs - lastSwingAtRef.current < SWING_QUIET_MS;
    const faultsNow = bodyFaults("ready", stance, { sport }).map((x) => ({ key: x.key, say: x.say, severity: x.severity }));
    const measurable = stance.knee != null || stance.trunk != null || stance.stance != null;
    const co = coachRef.current.update({ now: nowMs, active: armed && !moving && !quiet && measurable, faults: faultsNow });
    const lineKey = co.line ? `${co.line.kind}:${co.line.text}` : "";
    if (lineKey !== coachKeyRef.current) { coachKeyRef.current = lineKey; setCoachLine(co.line); }
    deliverCue(co, soundRef.current);

    // draw: the skeleton, and the corrected stance in green while you hold still outside the target
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const lf = { px: f.px, vis: f.vis, ghost: null };
      if (armed && !moving && !quiet && measurable) {
        const { delta, faults: bf } = bodyDelta("ready", stance, { sport });
        if (bf.some((x) => x.joint === "knee" || x.joint === "trunk") && fwdRef.current) {
          const c = correctLift({ wl: f.wl, px: f.px, vis: f.vis, delta, w: 1, fwd: fwdRef.current });
          if (c) lf.ghost = { px2: c.px2, moved: c.moved, w: 1 };
        }
      }
      drawLiftFrame(ctx, lf, canvas.width / f.vw, {});
    }

    if (nowMs - lastHudRef.current > 130) {
      lastHudRef.current = nowMs;
      const st = engineRef.current?.stats();
      setHud({ inFrame, armed, slow: !!st && st.inferMs > 140, stance });
    }
  }, [judged, sport, evaluateRep, canvasRef, engineRef, videoRef]);

  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  useEffect(() => () => { clearTimeout(verdictTimerRef.current); clearTimeout(noticeTimerRef.current); for (const p of bmpRef.current) { try { p.bmp.close(); } catch { /* noop */ } } }, []);
  useEffect(() => { if (phase === "live" && !startedAtRef.current) startedAtRef.current = Date.now(); }, [phase]);

  const finish = () => {
    const list = repsRef.current;
    track("practice_ended", {
      sport, shot: shotName, reps: list.length, in_range: list.filter((r) => r.inBand).length,
      seconds: Math.round((Date.now() - (startedAtRef.current || Date.now())) / 1000),
      device: deviceKind(), delegate: liveDelegate(), fps: Math.round(engineRef.current?.stats().fps || 0),
    });
    stop();
    setSummaryOpen(true);
  };

  const again = () => {
    repsRef.current = []; setReps([]); setVerdict(null);
    for (const k of Object.keys(readingsRef.current)) readingsRef.current[k] = [];
    coachRef.current.reset(); coachKeyRef.current = ""; setCoachLine(null);
    lastSwingAtRef.current = -1e9; startedAtRef.current = Date.now();
    setSummaryOpen(false);
    start(facing);
  };

  // ─── what's on screen ───
  const good = reps.filter((r) => r.inBand).length;
  const last = reps[reps.length - 1] || null;
  const num = (v) => (v == null ? null : `${Math.round(v)}°`);
  const chipDetail = { shoulder: num(last?.measured.shoulder), elbow: num(last?.measured.elbow), body: num(last?.bodyVals.knee ?? last?.measured.knee) };
  const swingGroup = {
    label: "Last swing",
    items: [
      ...(ideal?.shoulder ? [{ key: "shoulder", label: "Arm", state: last ? last.chips.shoulder : "na", detail: chipDetail.shoulder }] : []),
      ...(ideal?.elbow ? [{ key: "elbow", label: "Elbow", state: last ? last.chips.elbow : "na", detail: chipDetail.elbow }] : []),
      { key: "body", label: "Body", state: last ? last.chips.body : "na", detail: chipDetail.body },
    ],
  };
  const live = hud.armed;
  const stanceGroup = {
    label: "Stance now",
    items: [
      { key: "knee", label: "Knees", state: live ? bodyState("ready", "knee", hud.stance.knee, { sport }) : "na", detail: num(hud.stance.knee) },
      { key: "trunk", label: "Back", state: live ? bodyState("ready", "trunk", hud.stance.trunk, { sport }) : "na", detail: num(hud.stance.trunk) },
      { key: "stance", label: "Feet", state: live ? bodyState("ready", "stance", hud.stance.stance, { sport }) : "na", detail: hud.stance.stance == null ? null : `${hud.stance.stance.toFixed(1)}×` },
    ],
  };

  const tip = notice || (!hud.inFrame ? "Step back so your whole body is in view"
    : !hud.armed ? "Hold still for a moment…"
    : reps.length === 0 && !coachLine ? "Take your ready stance, then swing" : null);
  const banner = coachLine && !verdict ? { kind: coachLine.kind, text: coachLine.text } : tip && !verdict ? { kind: "info", text: tip } : null;

  const verdictText = verdict && (verdict.inBand
    ? { headline: "In range: arm and body", detail: null }
    : { headline: verdict.cues[0]?.headline || "Close: check the target", detail: verdict.cues[1]?.headline || null });

  // the summary: the most common arm fault and the most common body fault
  const summaryCards = (() => {
    const counts = {};
    for (const r of reps) for (const f of r.faults) { counts[f.key] = counts[f.key] || { n: 0, f }; counts[f.key].n++; counts[f.key].f = f; }
    const top = (area) => Object.values(counts).filter((c) => c.f.area === area).sort((a, b) => b.n - a.n)[0];
    return [top("arm"), top("body")].filter(Boolean).sort((a, b) => b.n - a.n).map((c) => ({ ...c.f.cue, count: c.n }));
  })();

  const summary = summaryOpen ? (
    <PracticeSummary
      title={shotName}
      total={reps.length}
      good={good}
      noun="swing"
      thumbs={reps.filter((r) => r.picture).map((r) => ({ n: r.n, inBand: r.inBand, url: r.picture }))}
      cards={summaryCards}
      onAgain={again}
      onExit={onExit}
      analyzeText="Film a real rally and get the full analysis"
      emptyText="We didn't catch a swing. Stand so your whole body is in view, turn your hitting side toward the camera, and swing at match speed."
    />
  ) : null;

  return (
    <>
    <PracticeShell
      top={<PracticeTopBar title={shotName} subtitle={sport?.replace(/_/g, " ")} onClose={phase === "live" ? finish : onExit} sound={sound} onToggleSound={toggleSound} onSettings={() => setSettingsOpen(true)} slow={hud.slow} />}
      bottom={(
        <div className="px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-zinc-950 space-y-2.5">
          <FormChips groups={[swingGroup, stanceGroup]} showValues={showValues} />
          {phase === "live" && <button type="button" onClick={finish} className="w-full py-3 rounded-xl bg-white/10 text-[15px] font-semibold active:bg-white/15">Finish session</button>}
        </div>
      )}
    >
      <PracticeStage cam={cam} mirrored={facing === "user" && !clipSrc} onExit={onExit}>
        {phase === "live" && banner && <CoachBanner kind={banner.kind} text={banner.text} />}
        {phase === "live" && !verdict && reps.length > 0 && (
          <div className="absolute bottom-3 left-3 rounded-full bg-black/65 backdrop-blur px-3 py-1.5 text-[13px] font-bold z-10">
            {reps.length} {reps.length === 1 ? "swing" : "swings"} · <span className="text-lime-300">{good} good</span>
          </div>
        )}
        {verdict && <VerdictCard rep={verdict} headline={verdictText.headline} detail={verdictText.detail} label="Swing" />}
        <SettingsSheet
          open={settingsOpen} onClose={() => setSettingsOpen(false)}
          hand={hand} onHand={setHand}
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
