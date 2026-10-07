/**
 * @module liftPose
 * Strength lifts (deadlift first): measure the lifter from MediaPipe's 3D pose,
 * find the reps, and grade the two moments that decide a deadlift: the setup
 * (the position the bar leaves the floor from) and the lockout.
 *
 * Why this is its own module and not a "shot" for the racquet code: a lift is
 * bilateral (both legs matter), has no single contact instant, and the useful
 * numbers are hip, knee and back angle at known phases of a rep, not one
 * dominant arm at one moment.
 *
 * Inputs are the same per-frame pose arrays the rest of the pose code uses:
 *   wl  — 33 world landmarks [x, y, z] metres, hip-centred, y pointing DOWN
 *   vis — 33 visibility scores 0-1
 * Pure functions, no browser needed.
 *
 * HONEST LIMITS (surfaced in the UI):
 *   - Angles are estimated from one camera. Side-on is most accurate; filmed
 *     head-on, hip and back angles are softer (the view is reported).
 *   - A guide, not a verdict: ranges are common coaching targets and every
 *     lifter's levers differ. They have not been reviewed by a coach.
 *   - Back ROUNDING can't be seen: the pose has one point per shoulder and hip,
 *     not a spine. We measure trunk angle, not lumbar curve.
 */
import { L_SH, R_SH, L_HIP, R_HIP, L_KN, R_KN, L_AN, R_AN, sub, dot, norm, angleDeg } from "./correctPose.js";

const L_HEEL = 29, R_HEEL = 30, L_TOE = 31, R_TOE = 32;
const VIS_MIN = 0.5;
const UP = [0, -1, 0]; // world y points down

const median = (a) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const deg = (rad) => (rad * 180) / Math.PI;

// ─── targets ────────────────────────────────────────────────────────────
// Angles in degrees. hip/knee: the interior angle (180 = straight). trunk: the
// lean from vertical (0 upright, 90 flat), positive = forward, negative = back.
export const LIFTS = {
  deadlift: {
    key: "deadlift",
    label: "Deadlift",
    setup: {
      hip: { min: 45, max: 90, ideal: 65, why: "hips low enough to push the floor away, high enough to hinge" },
      knee: { min: 105, max: 150, ideal: 125, why: "enough knee bend that the legs and back share the pull" },
      trunk: { min: 45, max: 80, ideal: 62, why: "chest up over the bar, not folded flat" },
    },
    // The pose model reads a plainly straight, standing body as hip ~170 / knee ~164
    // (seen on real footage), so "locked out" is judged against that noise floor:
    // a lifter who is really short of lockout reads clearly below these.
    lockout: {
      hip: { min: 158, max: 185, ideal: 172, why: "hips fully through at the top" },
      knee: { min: 155, max: 185, ideal: 170, why: "knees locked at the top" },
      trunk: { min: -12, max: 12, ideal: 2, why: "tall, shoulders over hips, no lean back" },
    },
  },
};

export const isLiftKey = (k) => !!LIFTS[k];

/**
 * The pose angles wobble by a few degrees from one sampling to the next (the same clip graded twice
 * landed a setup knee on either side of its 105° limit and got two different verdicts). A number is
 * only called a miss when it is clearly outside the range, by more than this; just outside is
 * "borderline" and is shown as such, never as a fault.
 */
export const TOLERANCE_DEG = 4;

/** A lift named in free text ("Conventional Deadlift", "deadlift - sumo"), or null. */
export function resolveLift(text) {
  const s = String(text || "").toLowerCase();
  if (/dead\s?lift|\brdl\b|romanian/.test(s)) return "deadlift";
  return null;
}

// ─── cues ───────────────────────────────────────────────────────────────
const amount = (d) => (Math.abs(d) >= 25 ? "a lot " : Math.abs(d) >= 10 ? "" : "slightly ");

/**
 * What to do about one out-of-range measurement: an instruction, what it should
 * feel like, and a practice cue. Same shape as fixCues.fixCue.
 */
export function liftCue(lift, phase, joint, measured, range) {
  const rangeless = joint === "hips"; // the pull check compares two phases, so it has no angle range
  if (!rangeless && (!Number.isFinite(measured) || !range)) return null;
  const low = range ? measured < range.min : false;
  const k = `${lift}.${phase}.${joint}`;
  const more = range ? amount(measured - range.ideal) : "";
  switch (k) {
    case "deadlift.lockout.hip":
      return { headline: "Drive your hips all the way through at the top",
        feel: "Squeeze your glutes and finish standing tall. The bar should lock out by your hips, not by leaning back.",
        drill: "Hip thrusts or pull-throughs, pausing 2 seconds at the top of each rep." };
    case "deadlift.lockout.knee":
      return { headline: "Straighten your knees fully at lockout",
        feel: "Finish with both knees locked and legs straight, hips and knees arriving together.",
        drill: "Pause deadlifts: hold the top for 2 seconds and check both knees are straight." };
    case "deadlift.lockout.trunk":
      return low
        ? { headline: "Don't lean back at the top",
            feel: "Stand tall with your ribs down and shoulders over your hips. Leaning back doesn't add height, it just loads your lower back.",
            drill: "Film from the side and check your shoulders stack over your hips at lockout." }
        : { headline: "Stand tall at the top",
            feel: "You're still leaning forward at lockout. Drive your hips forward until your shoulders stack over them.",
            drill: "Hip thrusts or block pulls, finishing tall with a 2 second pause." };
    case "deadlift.setup.hip":
      return low
        ? { headline: `Start with your hips ${more}higher`,
            feel: "Sitting too low turns the pull into a squat. Raise your hips until your shins are close to vertical and you can feel your hamstrings load.",
            drill: "Set up, lift your hips until your hamstrings tighten, then take the slack out of the bar." }
        : { headline: `Start with your hips ${more}lower`,
            feel: "Hips too high makes the pull a stiff-legged, back-heavy lift. Drop your hips until your chest can rise over the bar.",
            drill: "Set up with your chest up and shins to the bar, then push the floor away." };
    case "deadlift.setup.knee":
      return low
        ? { headline: `Bend your knees ${more}less at the start`,
            feel: "You're sitting too deep. Let your hips rise so your shins are close to vertical when the bar breaks from the floor.",
            drill: "Take 3 setups without lifting: shins to the bar, hips up until your hamstrings load." }
        : { headline: `Bend your knees ${more}more at the start`,
            feel: "Your legs are too straight, so the back does all the work. Drop your hips and push the floor away with your legs.",
            drill: "Take 3 setups without lifting: shins to the bar, then sink your hips until your chest is up." };
    case "deadlift.setup.trunk":
      return low
        ? { headline: "Fold forward more at the start",
            feel: "You're very upright, which usually means your hips are too low. Hinge until your shoulders are over or just ahead of the bar.",
            drill: "Practise the hinge with a dowel along your spine, then add the bar." }
        : { headline: "Get your chest up at the start",
            feel: "Your back is close to flat to the floor. Lift your chest and brace so the bar leaves the floor with your torso more upright.",
            drill: "Set up, take a big breath into your belt, and drive your chest up before you pull." };
    case "deadlift.pull.hips":
      return { headline: "Keep your chest rising with your hips",
        feel: "Your hips are rising faster than your chest, so your back flattens toward the floor and your lower back ends up lifting the bar. Push the floor away with your legs and keep your chest up.",
        drill: "Tempo pulls: take 3 seconds to reach the knee, holding the same back angle until the bar passes it." };
    default:
      return null;
  }
}

/**
 * The few words said out loud while holding a position ("Chest up"), as opposed to the
 * full instruction shown after a rep (liftCue). Short on purpose: it has to land before
 * the lifter moves.
 */
export function liftSay(lift, phase, joint, measured, range) {
  const low = range ? measured < range.min : false;
  switch (`${lift}.${phase}.${joint}`) {
    case "deadlift.setup.hip": return low ? "Hips up a little" : "Hips down a little";
    case "deadlift.setup.knee": return low ? "Hips up, less knee bend" : "More knee bend";
    case "deadlift.setup.trunk": return low ? "Hinge forward more" : "Chest up";
    case "deadlift.lockout.hip": return "Drive your hips through";
    case "deadlift.lockout.knee": return "Lock your knees";
    case "deadlift.lockout.trunk": return low ? "Don't lean back" : "Stand tall";
    default: return null;
  }
}

/**
 * What is out of range in the position being held right now, worst first, each with the
 * words to say. `vals` = { hip, knee, trunk } (smoothed); `phase` = "setup" | "lockout".
 */
export function liftFaultsNow(lift, phase, vals) {
  const L = LIFTS[lift];
  const out = [];
  for (const j of ["hip", "knee", "trunk"]) {
    const r = L?.[phase]?.[j];
    const v = vals?.[j];
    if (!r || v == null) continue;
    const miss = v < r.min ? r.min - v : v > r.max ? v - r.max : 0;
    if (miss <= TOLERANCE_DEG) continue;
    const say = liftSay(lift, phase, j, v, r);
    if (say) out.push({ key: `${phase}.${j}`, say, severity: miss / Math.max(10, (r.max - r.min) / 2) });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

// ─── per-frame measurement ──────────────────────────────────────────────
/**
 * The direction the lifter faces on the floor (unit [x,0,z]), from heel→toe of
 * the feet the model can see, or null. Needed to tell leaning forward from back.
 */
export function facingDir(wl, vis) {
  let sx = 0, sz = 0;
  for (const [h, t] of [[L_HEEL, L_TOE], [R_HEEL, R_TOE]]) {
    if (Math.min(vis[h], vis[t]) < 0.4) continue;
    sx += wl[t][0] - wl[h][0];
    sz += wl[t][2] - wl[h][2];
  }
  const n = Math.hypot(sx, sz);
  return n >= 0.05 ? [sx / n, 0, sz / n] : null;
}

/**
 * Hip, knee and trunk for one frame. Sides the model can't see are left out
 * rather than guessed; the rest are averaged.
 * @param {number[][]} wl  @param {number[]} vis
 * @param {number[]|null} fwd  facing direction from facingDir (or a whole-clip estimate)
 * @returns {{ok:boolean, hip:number|null, knee:number|null, trunk:number|null, trunkAbs:number|null, signed:boolean, fwdFrame:number[]|null, view:number|null}}
 */
export function measureLift(wl, vis, fwd = null) {
  const sides = [[L_SH, L_HIP, L_KN, L_AN], [R_SH, R_HIP, R_KN, R_AN]];
  const hips = [], knees = [];
  for (const [SH, HP, KN, AN] of sides) {
    if (Math.min(vis[SH], vis[HP], vis[KN]) >= VIS_MIN) hips.push(angleDeg(wl[SH], wl[HP], wl[KN]));
    if (Math.min(vis[HP], vis[KN], vis[AN]) >= VIS_MIN) knees.push(angleDeg(wl[HP], wl[KN], wl[AN]));
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const ok2 = (a, b) => Math.min(vis[a], vis[b]) >= VIS_MIN;
  const shMid = ok2(L_SH, R_SH) ? mid(wl[L_SH], wl[R_SH]) : vis[L_SH] >= vis[R_SH] ? wl[L_SH] : wl[R_SH];
  const hpMid = ok2(L_HIP, R_HIP) ? mid(wl[L_HIP], wl[R_HIP]) : vis[L_HIP] >= vis[R_HIP] ? wl[L_HIP] : wl[R_HIP];
  const trunkOk = Math.max(vis[L_SH], vis[R_SH]) >= VIS_MIN && Math.max(vis[L_HIP], vis[R_HIP]) >= VIS_MIN;
  let trunkAbs = null, trunk = null, signed = false;
  const fwdFrame = facingDir(wl, vis);
  if (trunkOk) {
    const tv = sub(shMid, hpMid);
    const n = norm(tv);
    if (n > 0.05) {
      trunkAbs = deg(Math.acos(Math.max(-1, Math.min(1, dot(tv, UP) / n))));
      const f = fwd || fwdFrame;
      // Signed lean in the forward/back plane only (0 upright, + forward, - back). Sideways tilt is
      // left out: one camera can't judge it, and it is not what "leaning back" means.
      if (f) { trunk = deg(Math.atan2(dot(tv, f), dot(tv, UP))); signed = true; }
      else trunk = trunkAbs;
    }
  }
  const hip = mean(hips), knee = mean(knees);
  const f = fwd || fwdFrame;
  // 0 = filmed side-on, 90 = head-on: the angle between the facing direction and the camera's depth axis.
  const view = f ? deg(Math.atan2(Math.abs(f[2]), Math.abs(f[0]))) : null;
  return { ok: hip != null || knee != null || trunk != null, hip, knee, trunk, trunkAbs, signed, fwdFrame, view };
}

/** A whole-clip facing estimate: the median of the per-frame heel→toe directions. */
export function clipFacing(frames) {
  const xs = [], zs = [];
  for (const f of frames) if (f.fwdFrame) { xs.push(f.fwdFrame[0]); zs.push(f.fwdFrame[2]); }
  if (xs.length < 5) return null;
  const x = median(xs), z = median(zs), n = Math.hypot(x, z);
  return n > 0.2 ? [x / n, 0, z / n] : null;
}

export function viewLabel(view) {
  if (view == null) return null;
  if (view < 35) return "side-on";
  if (view < 65) return "from an angle";
  return "head-on";
}

// ─── reps ───────────────────────────────────────────────────────────────
function medianFilter(vals, half) {
  return vals.map((_, i) => median(vals.slice(Math.max(0, i - half), i + half + 1)));
}

/**
 * Find the deadlift reps in a series of measured frames.
 * @param {{t:number, hip:number|null, knee:number|null, trunk:number|null, trunkAbs:number|null}[]} frames  time-ordered
 * @returns {object[]} reps: { tPull, tSetup, tLock, tEnd, setup:{hip,knee,trunk}, lockout:{hip,knee,trunk}, hipsFirst }
 *
 * A rep is a top position (hips mostly open, trunk upright) that follows a low
 * phase (hips closed), so standing around never counts. The threshold for "top"
 * is deliberately below a good lockout: a rep that stalls short of lockout is
 * still a rep, and it is the grading that says it fell short. The pull starts
 * where the hips begin opening steadily; the setup is read just before that,
 * the lockout at its best-extended moment.
 */
export function findDeadliftReps(frames, o = {}) {
  const cfg = { low: 120, high: 135, trunkHigh: 35, slope: 8, slopeSpan: 0.5, setupSpan: 0.7, lockSpan: 3.0, gap: 0.3, ...o };
  const fr = frames.filter((f) => f.hip != null && f.trunkAbs != null);
  if (fr.length < 6) return [];
  const hipS = medianFilter(fr.map((f) => f.hip), 2);
  const trS = medianFilter(fr.map((f) => f.trunkAbs), 2);
  const t = fr.map((f) => f.t);
  const hipAt = (time) => { let b = 0; for (let i = 1; i < t.length; i++) if (Math.abs(t[i] - time) < Math.abs(t[b] - time)) b = i; return hipS[b]; };

  // lockout segments
  const segs = [];
  let cur = null;
  for (let i = 0; i < fr.length; i++) {
    const up = hipS[i] >= cfg.high && trS[i] <= cfg.trunkHigh;
    if (up) {
      if (cur && t[i] - t[cur.b] <= cfg.gap) cur.b = i;
      else { if (cur) segs.push(cur); cur = { a: i, b: i }; }
    } else if (cur && t[i] - t[cur.b] > cfg.gap) { segs.push(cur); cur = null; }
  }
  if (cur) segs.push(cur);

  const reps = [];
  let prevEnd = -Infinity;
  for (const s of segs) {
    const tA = t[s.a];
    // the low phase before this lockout
    const i0 = fr.findIndex((f) => f.t >= Math.max(prevEnd, tA - 30));
    let lowest = Infinity;
    for (let i = Math.max(0, i0); i < s.a; i++) lowest = Math.min(lowest, hipS[i]);
    if (!(lowest <= cfg.low)) { prevEnd = t[s.b]; continue; }
    // pull start: walk back from the lockout while the hips are opening steadily
    let tPull = Math.max(prevEnd, t[Math.max(0, i0)]);
    for (let i = s.a; i > Math.max(0, i0); i--) {
      const slope = (hipS[i] - hipAt(t[i] - cfg.slopeSpan)) / cfg.slopeSpan;
      if (slope < cfg.slope) { tPull = t[i]; break; }
    }
    // setup: just before the pull; lockout: the best-extended moment in the first lockSpan
    const pick = (a, b, key) => median(fr.filter((f) => f.t >= a && f.t <= b).map((f) => f[key]));
    const setup = { hip: pick(tPull - cfg.setupSpan, tPull, "hip"), knee: pick(tPull - cfg.setupSpan, tPull, "knee"), trunk: pick(tPull - cfg.setupSpan, tPull, "trunk") };
    let best = s.a;
    for (let i = s.a; i <= s.b && t[i] <= tA + cfg.lockSpan; i++) if (hipS[i] > hipS[best]) best = i;
    const tL = t[best];
    // averaged over a short hold: single-frame trunk and knee readings jitter by 10-15 degrees
    const tH = Math.min(t[s.b], tL + 0.8);
    const lockout = { hip: pick(tL - 0.2, tH, "hip"), knee: pick(tL - 0.2, tH, "knee"), trunk: pick(tL - 0.2, tH, "trunk") };

    // hips-shoot-up check: once the knees have opened 20° from the setup, has the torso
    // flattened toward the floor? (A constant back angle is the good version of a pull;
    // the fault is the trunk lean growing while the hips rise.)
    let hipsFirst = null;
    if (setup.knee != null && setup.trunk != null) {
      for (const f of fr) {
        if (f.t <= tPull || f.t >= tA || f.knee == null || f.trunk == null) continue;
        if (f.knee - setup.knee >= 20) { hipsFirst = { t: f.t, kneeOpen: f.knee - setup.knee, torsoUp: setup.trunk - f.trunk }; break; }
      }
    }
    reps.push({ tPull, tSetup: Math.max(0, tPull - cfg.setupSpan / 2), tLock: tL, tEnd: t[s.b], setup, lockout, hipsFirst });
    prevEnd = t[s.b];
  }
  return reps;
}

// ─── grading ────────────────────────────────────────────────────────────
/**
 * Grade one rep against the lift's ranges.
 * @returns {{items:object[], faults:object[], cues:object[], inBand:boolean}}
 *   items: every judged number (phase, joint, value, range, ok)
 *   faults: out-of-range items, worst first (by how far out, relative to the band)
 *   cues: up to 2 spoken/shown cues, never two from the same body area
 */
export function gradeLiftRep(lift, rep) {
  const L = LIFTS[lift];
  const items = [];
  const judge = (phase, joint, value, signedKnown = true) => {
    const range = L[phase]?.[joint];
    if (!range || value == null) return;
    // an unsigned trunk reading can't be told from leaning back: judge only its size
    const v = joint === "trunk" && !signedKnown ? Math.abs(value) : value;
    const miss = v < range.min ? range.min - v : v > range.max ? v - range.max : 0;
    const ok = miss <= TOLERANCE_DEG;
    items.push({ phase, joint, value: v, range, ok, borderline: ok && miss > 0, miss, severity: miss / Math.max(10, (range.max - range.min) / 2) });
  };
  const sg = rep.signed !== false;
  for (const j of ["hip", "knee", "trunk"]) judge("setup", j, rep.setup?.[j], sg);
  for (const j of ["hip", "knee", "trunk"]) judge("lockout", j, rep.lockout?.[j], sg);

  const faults = items.filter((i) => !i.ok).sort((a, b) => b.severity - a.severity);
  const area = (i) => (i.joint === "trunk" ? "trunk" : "legs");
  const cues = [];
  const used = new Set();
  for (const f of faults) {
    if (used.has(area(f))) continue;
    const cue = liftCue(lift, f.phase, f.joint, f.value, f.range);
    if (!cue) continue;
    used.add(area(f));
    cues.push({ ...cue, phase: f.phase, joint: f.joint, value: Math.round(f.value), to: f.range.ideal });
    if (cues.length === 2) break;
  }
  const hf = rep.hipsFirst;
  if (hf && hf.kneeOpen >= 20 && hf.torsoUp <= -8) {
    const sev = Math.min(2, (-hf.torsoUp - 4) / 10);
    faults.push({ phase: "pull", joint: "hips", value: hf.torsoUp, ok: false, severity: sev });
    if (cues.length < 2 && !used.has("trunk")) cues.push({ ...liftCue(lift, "pull", "hips", 0, null), phase: "pull", joint: "hips", value: Math.round(-hf.torsoUp), to: null });
  }
  return { items, faults, cues, inBand: faults.length === 0 };
}

/** Out-of-range joints to correct on the picture: the delta (target − measured) per joint at a phase. */
export function planLiftCorrection(lift, phase, measured) {
  const L = LIFTS[lift];
  const delta = { knee: 0, trunk: 0 };
  const applied = [];
  for (const j of ["knee", "trunk", "hip"]) {
    const r = L[phase]?.[j];
    const v = measured?.[j];
    if (!r || v == null) continue;
    if ((v < r.min ? r.min - v : v > r.max ? v - r.max : 0) <= TOLERANCE_DEG) continue;
    applied.push({ joint: j, from: Math.round(v), to: r.ideal, deltaDeg: Math.round(r.ideal - v) });
    if (j === "knee" || j === "trunk") delta[j] = r.ideal - v;
  }
  return { applied, delta };
}
