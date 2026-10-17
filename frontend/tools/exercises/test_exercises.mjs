// The exercise engine on synthetic lifters: a stick figure built from joint angles (forward kinematics) is run through
// the real measurement code, the rep finder and the grader. It checks the LOGIC (rep counting, which fault is named,
// that the deadlift is untouched). It cannot check how well a phone's pose model reads a real person: that needs footage.
// usage: node test_exercises.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const A = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/ai/");
const L = await import(pathToFileURL(A + "liftPose.js").href);
const { EXERCISES } = await import(pathToFileURL(A + "exercises.js").href);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } };

const rot = (v, deg) => { const a = (deg * Math.PI) / 180; return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]; };
/** A side-on lifter facing +x, world metres, hip at the origin, y pointing down. */
function pose({ knee = 170, hip = 170, trunk = 2, elbow = 170, armDir = 0 }) {
  const t = (trunk * Math.PI) / 180, u = [Math.sin(t), -Math.cos(t)];
  const S = [u[0] * 0.5, u[1] * 0.5];
  const v = rot(u, hip), K = [v[0] * 0.45, v[1] * 0.45];
  const w = rot([-v[0], -v[1]], -knee), An = [K[0] + w[0] * 0.45, K[1] + w[1] * 0.45];
  const ua = rot([0, 1], armDir), E = [S[0] + ua[0] * 0.3, S[1] + ua[1] * 0.3];
  const fa = rot([-ua[0], -ua[1]], elbow), W = [E[0] + fa[0] * 0.27, E[1] + fa[1] * 0.27];
  const wl = Array.from({ length: 33 }, () => [0, 0, 0]), vis = Array(33).fill(1);
  const put = (l, r, p) => { wl[l] = [p[0], p[1], 0.1]; wl[r] = [p[0], p[1], -0.1]; };
  put(11, 12, S); put(13, 14, E); put(15, 16, W); put(23, 24, [0, 0]); put(25, 26, K); put(27, 28, An);
  put(29, 30, [An[0] - 0.05, An[1] + 0.05]); put(31, 32, [An[0] + 0.2, An[1] + 0.05]);
  return { wl, vis };
}
const measure = (p) => { const { wl, vis } = pose(p); return L.measureLift(wl, vis, [1, 0, 0]); };
const near = (a, b, tol, m) => ok(a != null && Math.abs(a - b) <= tol, `${m}: ${a == null ? a : a.toFixed(1)} vs ${b}`);

// ── 1. the measurements round-trip ──
let m = measure({ knee: 85, hip: 70, trunk: 40, elbow: 120, armDir: 20 });
near(m.knee, 85, 1.5, "knee"); near(m.hip, 70, 1.5, "hip"); near(m.trunk, 40, 1.5, "trunk"); near(m.elbow, 120, 1.5, "elbow"); near(m.kneeMin, 85, 1.5, "kneeMin");
m = measure({ knee: 170, hip: 172, trunk: 0, elbow: 172, armDir: 180 });
ok(m.wristUp > 0.9 && m.wristUp < 1.4, "hands overhead read as above the shoulders: " + (m.wristUp && m.wristUp.toFixed(2)));
m = measure({ knee: 170, hip: 172, trunk: 0, elbow: 172, armDir: 0 });
ok(m.wristUp < 0, "hands by the sides read as below the shoulders");

// ── 2. a stream of frames for N reps ──
const FPS = 25;
const smooth = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x))); // 0 -> 1
function series(specs, { holdTop = 1.0, down = 1.2, holdBottom = 0.3, up = 1.0 } = {}) {
  // specs: [{ top:{...pose}, bottom:{...pose} }], one per rep; the pose parameters move top -> bottom -> top
  const frames = [];
  let t = 0;
  const push = (a, b, x) => { const p = {}; for (const k of Object.keys(a)) p[k] = a[k] + (b[k] - a[k]) * x; const { wl, vis } = pose(p); frames.push({ t, ...L.measureLift(wl, vis, [1, 0, 0]) }); t += 1 / FPS; };
  const first = specs[0].top;
  for (let i = 0; i < holdTop * FPS; i++) push(first, first, 0);
  for (const s of specs) {
    for (let i = 0; i < down * FPS; i++) push(s.top, s.bottom, smooth(i / (down * FPS)));
    for (let i = 0; i < holdBottom * FPS; i++) push(s.bottom, s.bottom, 0);
    for (let i = 0; i < up * FPS; i++) push(s.bottom, s.top, smooth(i / (up * FPS)));
    for (let i = 0; i < holdTop * FPS; i++) push(s.top, s.top, 0);
  }
  return frames;
}
const grade = (lift, r) => L.gradeLiftRep(lift, { ...r, signed: true });
const run = (lift, specs, o) => { const reps = L.findLiftReps(lift, series(specs, o)); return { reps, graded: reps.map((r) => grade(lift, r)) }; };
const faultKeys = (g) => g.faults.map((f) => `${f.phase}.${f.joint}`);

// ── squat ──
const SQ_TOP = { knee: 172, hip: 172, trunk: 2, elbow: 170, armDir: 0 };
const squatGood = { top: SQ_TOP, bottom: { ...SQ_TOP, knee: 85, hip: 70, trunk: 40 } };
const squatShallow = { top: SQ_TOP, bottom: { ...SQ_TOP, knee: 112, hip: 95, trunk: 30 } };
const squatFolded = { top: SQ_TOP, bottom: { ...SQ_TOP, knee: 85, hip: 55, trunk: 75 } };
let r = run("squat", [squatGood, squatGood, squatGood, squatShallow, squatShallow, squatFolded]);
ok(r.reps.length === 6, "squat: 6 reps found, got " + r.reps.length);
ok(r.graded.slice(0, 3).every((g) => g.inBand), "squat: three good reps are in range: " + JSON.stringify(r.graded.slice(0, 3).map(faultKeys)));
ok(r.graded.slice(3, 5).every((g) => faultKeys(g).includes("setup.knee")), "squat: shallow reps flag the depth");
ok(r.graded[3] && /deeper/i.test(r.graded[3].cues[0].headline), "squat: the cue says go deeper: " + (r.graded[3] && r.graded[3].cues[0] && r.graded[3].cues[0].headline));
ok(r.graded[5] && faultKeys(r.graded[5]).includes("setup.trunk") && /chest up/i.test(r.graded[5].cues.map((c) => c.headline).join()), "squat: folding forward flags the back angle: " + JSON.stringify(r.graded[5] && faultKeys(r.graded[5])));
r = run("squat", [{ top: SQ_TOP, bottom: { ...SQ_TOP, knee: 140, hip: 130, trunk: 15 } }, { top: SQ_TOP, bottom: { ...SQ_TOP, knee: 140, hip: 130, trunk: 15 } }]);
ok(r.reps.length === 0, "squat: quarter squats (the knee never gets under 120) are not counted");
ok(L.findLiftReps("squat", series([{ top: SQ_TOP, bottom: SQ_TOP }])).length === 0, "squat: standing still is not a rep");
r = run("squat", [{ top: { ...SQ_TOP, knee: 140, hip: 140 }, bottom: { ...SQ_TOP, knee: 85, hip: 70, trunk: 40 } }]);
ok(r.reps.length === 0, "squat: a rep that never gets back up above the top threshold is not counted yet");

// ── push-up ──
const PU_TOP = { knee: 176, hip: 174, trunk: 88, elbow: 172, armDir: 0 };
const puGood = { top: PU_TOP, bottom: { ...PU_TOP, elbow: 80 } };
const puShallow = { top: PU_TOP, bottom: { ...PU_TOP, elbow: 108 } };
const puSag = { top: PU_TOP, bottom: { ...PU_TOP, elbow: 80, hip: 140 } };
r = run("pushup", [puGood, puGood, puShallow, puSag]);
ok(r.reps.length === 4, "push-up: 4 reps, got " + r.reps.length);
ok(r.graded[0] && r.graded[0].inBand && r.graded[1].inBand, "push-up: good reps in range: " + JSON.stringify(r.graded.slice(0, 2).map(faultKeys)));
ok(r.graded[2] && faultKeys(r.graded[2]).includes("setup.elbow") && /90 degrees/.test(r.graded[2].cues[0].headline), "push-up: shallow flags the elbow depth");
ok(r.graded[3] && faultKeys(r.graded[3]).includes("setup.hip") && /straight line/.test(r.graded[3].cues[0].headline), "push-up: a broken body line is named");

// ── lunge ──
const LU_TOP = { knee: 172, hip: 172, trunk: 2, elbow: 170, armDir: 0 };
const luGood = { top: LU_TOP, bottom: { ...LU_TOP, knee: 92, hip: 95, trunk: 8 } };
const luShallow = { top: LU_TOP, bottom: { ...LU_TOP, knee: 115, hip: 120, trunk: 8 } };
const luLean = { top: LU_TOP, bottom: { ...LU_TOP, knee: 92, hip: 70, trunk: 38 } };
r = run("lunge", [luGood, luShallow, luLean]);
ok(r.reps.length === 3 && r.graded[0].inBand, "lunge: 3 reps, first in range: " + JSON.stringify(r.graded.map(faultKeys)));
ok(r.graded[1] && faultKeys(r.graded[1]).includes("setup.kneeMin") && /Sink lower/.test(r.graded[1].cues[0].headline), "lunge: shallow says sink lower");
ok(r.graded[2] && faultKeys(r.graded[2]).includes("setup.trunk"), "lunge: leaning over the front knee is flagged");

// ── overhead press (rack = the low end of the elbow signal, lockout = the high end) ──
const OH_RACK = { knee: 172, hip: 172, trunk: 1, elbow: 70, armDir: 25 };
const OH_LOCK = { knee: 172, hip: 172, trunk: 1, elbow: 172, armDir: 180 };
const ohSeries = (lock) => series([{ top: lock, bottom: OH_RACK }, { top: lock, bottom: OH_RACK }]);
let reps = L.findLiftReps("ohp", ohSeries(OH_LOCK));
ok(reps.length === 2, "press: 2 reps, got " + reps.length);
ok(reps.every((x) => grade("ohp", x).inBand), "press: a strict press is in range: " + JSON.stringify(reps.map((x) => faultKeys(grade("ohp", x)))));
reps = L.findLiftReps("ohp", ohSeries({ ...OH_LOCK, trunk: -20 }));
ok(reps.length === 2 && faultKeys(grade("ohp", reps[0])).includes("lockout.trunk") && /Ribs down|lean back/i.test(grade("ohp", reps[0]).cues.map((c) => c.headline).join()), "press: leaning back to finish is named");

// ── bent-over row: the elbow is the rep signal, "setup" is the pulled position ──
const RW_HANG = { knee: 160, hip: 100, trunk: 45, elbow: 170, armDir: 0 };
const rwGood = { top: RW_HANG, bottom: { ...RW_HANG, elbow: 70, armDir: -35 } };
const rwHeave = { top: RW_HANG, bottom: { ...RW_HANG, elbow: 70, armDir: -35, trunk: 72, hip: 85 } };
r = run("row", [rwGood, rwHeave]);
ok(r.reps.length === 2, "row: 2 reps, got " + r.reps.length);
ok(r.graded[0] && r.graded[0].inBand, "row: a good row is in range: " + JSON.stringify(r.graded[0] && faultKeys(r.graded[0])));
ok(r.graded[1] && (faultKeys(r.graded[1]).includes("between.swing") || faultKeys(r.graded[1]).includes("setup.trunk")), "row: heaving the torso is flagged: " + JSON.stringify(r.graded[1] && faultKeys(r.graded[1])));

// ── Romanian deadlift ──
const RD_TOP = { knee: 168, hip: 172, trunk: 2, elbow: 172, armDir: 0 };
const rdGood = { top: RD_TOP, bottom: { ...RD_TOP, hip: 92, trunk: 62, knee: 158 } };
const rdSquatty = { top: RD_TOP, bottom: { ...RD_TOP, hip: 92, trunk: 62, knee: 120 } };
r = run("rdl", [rdGood, rdSquatty]);
ok(r.reps.length === 2 && r.graded[0].inBand, "rdl: 2 reps, first in range: " + JSON.stringify(r.graded.map(faultKeys)));
ok(r.graded[1] && faultKeys(r.graded[1]).includes("setup.knee") && /hinge, don't sit/i.test(r.graded[1].cues[0].headline), "rdl: squatting the hinge is named");

// ── the deadlift is untouched ──
ok(L.LIFTS.deadlift && !L.LIFTS.deadlift.generic && L.LIFTS.deadlift.setup.hip.min === 45, "deadlift config unchanged");
ok(typeof L.liftCue("deadlift", "lockout", "hip", 150, L.LIFTS.deadlift.lockout.hip).headline === "string", "deadlift cues unchanged");
ok(L.liftPhaseNow("deadlift", { hip: 150 }) === "lockout" && L.liftPhaseNow("deadlift", { hip: 100 }) === "setup" && L.liftPhaseNow("deadlift", { hip: 125 }) === null, "deadlift phases unchanged");
ok(L.liftSignal("deadlift") === "hip" && L.liftSignal("squat") === "knee" && L.liftSignal("lunge") === "kneeMin", "rep signals");
ok(Object.keys(EXERCISES).length === 6 && Object.keys(L.LIFTS).length === 7, "seven lifts in all");
console.log(fails ? `\n${fails} FAILED` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
