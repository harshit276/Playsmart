/**
 * @module overheadSwing
 * Judging an overhead swing (smash, clear, drop, tennis serve) at the right moment, and with the
 * right questions.
 *
 * Why this exists: the swing detector reports the moment the wrist is FASTEST relative to the
 * shoulder. For a ground stroke that is contact. For an overhead swing it is the follow-through,
 * when the arm is already coming down: measured there, a textbook smash reads "arm too low" every
 * time. Real footage (a badminton coach at 25 fps and a pro rally): the upper-arm angle at the speed
 * peak was 27-132 deg on swings that reached 127-151 deg a tenth to a third of a second earlier.
 *
 * So for these shots the arm is judged at the REACH: the frame, just before the speed peak, where the
 * wrist is highest above the shoulder. The same footage shows the reach height also tells an overhead
 * swing from one that isn't: wrist above shoulder by 0.42-0.97 torso lengths on the overhead swings,
 * -0.23 to 0.31 on the rest.
 *
 * The questions asked of each swing:
 *   - reach     did the hand get up above the shoulder like an overhead hit? (else: not an overhead swing)
 *   - arm       the upper-arm and elbow angles at the reach, against the shot's targets with a margin
 *   - prep      did the elbow get up to shoulder height in the load (leading with the elbow)?
 *   - speed     how fast, against the player's own earlier swings (never against a fixed number)
 *
 * HONEST LIMITS: a single camera reads a fully raised arm at 127-151 deg, not the 150-180 the targets
 * are written for, so the arm ranges get a margin here (`slack`). The thresholds come from two clips
 * and rule-of-thumb coaching; they have not been reviewed by a coach.
 *
 * Pure functions: no browser, no clock. Frames are the live ring's {t, wl, vis} entries.
 */
import { jointIdx, measureJoints, planCorrections, L_SH, R_SH } from "./correctPose.js";
import { isOverheadShot } from "./bodyCheck.js";
import { fixCue } from "./fixCues.js";

export const REACH = {
  before: 0.6, // s before the speed peak to look for the highest point of the hand
  after: 0.1, // s after it
  loadSpan: 0.8, // s before the peak the elbow-up check looks back over
  minUp: 0.38, // torso lengths the wrist must get above the shoulder to be an overhead swing
  minElbowUp: 0.05, // torso lengths the elbow must get above the shoulder in the load
  slack: { shoulder: 25, elbow: 25 }, // degrees: how far below the written minimum a single camera can read a good reach
  slowShare: 0.65, // a swing slower than this share of the player's usual is called slow
  minForSpeed: 3, // swings needed before "usual" means anything
};

/** True when this shot is hit up high, so its arm should be judged at the reach and not at the speed peak. */
export function usesReach(sport, shot, ideal) {
  return isOverheadShot(sport, shot) || (!!ideal?.shoulder && ideal.shoulder.min >= 140);
}

/** The shot's targets with the single-camera margin on the minimums (the ideal, the maximum and the knee are unchanged). */
export function widen(ideal) {
  if (!ideal) return ideal;
  const out = { ...ideal };
  for (const j of ["shoulder", "elbow"]) if (ideal[j]) out[j] = { ...ideal[j], min: Math.max(90, ideal[j].min - REACH.slack[j]) };
  return out;
}

const torso = (wl) => {
  const m = (a, b, i) => (wl[a][i] + wl[b][i]) / 2;
  return Math.hypot(m(L_SH, R_SH, 0) - m(23, 24, 0), m(L_SH, R_SH, 1) - m(23, 24, 1), m(L_SH, R_SH, 2) - m(23, 24, 2));
};
const median = (a) => { const s = a.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/**
 * The reach of one swing.
 * @param {{t:number, wl:number[][], vis:number[]}[]} frames  recent frames, oldest first
 * @returns {{frame:object, near:object[], up:number, elbowUpMax:number|null}|null}
 *   up: how far the wrist got above the shoulder, in torso lengths; elbowUpMax: the same for the elbow, in the load
 */
export function findReach(frames, tPeak, side) {
  const { SH, EL, WR } = jointIdx(side);
  const seen = (f) => Math.min(f.vis[SH], f.vis[EL], f.vis[WR], f.vis[L_SH], f.vis[R_SH], f.vis[23], f.vis[24]) >= 0.5;
  const upOf = (f, J) => (f.wl[SH][1] - f.wl[J][1]) / torso(f.wl); // world y points down
  let best = null;
  for (const f of frames) {
    if (f.t < tPeak - REACH.before || f.t > tPeak + REACH.after || !seen(f) || torso(f.wl) < 0.15) continue;
    const up = upOf(f, WR);
    if (!best || up > best.up) best = { frame: f, up };
  }
  if (!best) return null;
  let elbowUpMax = null;
  for (const f of frames) {
    if (f.t > best.frame.t || f.t < tPeak - REACH.loadSpan || !seen(f) || torso(f.wl) < 0.15) continue;
    const e = upOf(f, EL);
    if (elbowUpMax == null || e > elbowUpMax) elbowUpMax = e;
  }
  const near = frames.filter((f) => Math.abs(f.t - best.frame.t) <= 0.05 && seen(f));
  return { frame: best.frame, near: near.length ? near : [best.frame], up: best.up, elbowUpMax };
}

// ─── what to say ───
export const REACH_CUE = {
  headline: "Reach up: hit it above your head",
  feel: "That swing stayed low. For an overhead shot, jump or stretch up so your racket meets the shuttle at the very top, arm long, hand well above your shoulder.",
  drill: "Shadow 10 swings and freeze at the top: your hand should be clearly above your head before you whip down.",
};
export const PREP_CUE = {
  headline: "Get your elbow up before you swing",
  feel: "Lead with a high elbow: bring it up to shoulder height or above in the load, then throw the racket up and through from behind your head.",
  drill: "Without a racket, point your hitting elbow at the sky, hold it a second, then throw your hand up to the top.",
};
export const SPEED_CUE = {
  headline: "Swing through faster",
  feel: "That swing was slower than your usual. Power comes from a quick whip of the forearm at the top, not a push: relax the grip, then snap.",
  drill: "Shadow swings with a loose grip and a loud 'whoosh' at the top.",
};

// "a lot" / "slightly" in the cue follow how far the reading is outside the range that was applied (the widened one),
// not how far it is from the ideal, and the arm is judged at the top of the swing, not "at contact".
function armCue(joint, from, to, range) {
  const miss = from < range.min ? range.min - from : Math.max(0, from - range.max);
  const toward = Math.sign(to - from) || 1;
  const sized = fixCue(joint, from, from + toward * Math.max(1, miss)); // only its headline wording is used
  const full = fixCue(joint, from, to);
  if (!sized || !full) return full;
  return { ...full, headline: sized.headline.replace(/ at contact$/, " at the top of the swing") };
}

/**
 * Judge one overhead swing.
 * @param {object} p
 * @param {{t:number, wl:number[][], vis:number[]}[]} p.frames   the live ring
 * @param {number} p.tPeak     the detector's speed peak
 * @param {"left"|"right"} p.side
 * @param {object} p.ideal     the shot's idealAngles entry
 * @param {number} p.peakSpeed m/s
 * @param {number[]} [p.prevSpeeds]  this session's earlier swing speeds
 * @returns {null | {
 *   reach:{up:number, elbowUpMax:number|null, t:number, frame:object},
 *   isOverhead:boolean, measured:object, plan:object,
 *   faults:{key:string, area:"arm", cue:object, severity:number}[],
 *   checks:{shoulder:"ok"|"off"|"na", elbow:"ok"|"off"|"na", prep:"ok"|"off"|"na", speed:"ok"|"off"|"na"}
 * }}
 */
export function judgeOverhead({ frames, tPeak, side, ideal, peakSpeed, prevSpeeds = [] }) {
  const reach = findReach(frames, tPeak, side);
  if (!reach) return null;
  const per = reach.near.map((f) => measureJoints(f.wl, f.vis, side));
  const measured = {};
  for (const j of ["shoulder", "elbow", "knee"]) if (ideal?.[j]) measured[j] = median(per.map((p) => p.measured[j]));
  const plan = planCorrections(measured, widen(ideal));
  const isOverhead = reach.up >= REACH.minUp;
  const sevOf = (a) => Math.abs(a.deltaDeg) / Math.max(10, (ideal[a.joint].max - ideal[a.joint].min) / 2);
  const off = (j) => plan.applied.some((a) => a.joint === j);

  const faults = [];
  if (!isOverhead) {
    faults.push({ key: "reach", area: "arm", cue: REACH_CUE, severity: 1.5 });
  } else {
    for (const a of plan.applied) {
      if (a.joint === "knee") continue; // the knee is the body's, handled by the caller
      faults.push({ key: a.joint, area: "arm", cue: armCue(a.joint, a.from, a.to, widen(ideal)[a.joint]), severity: sevOf(a), from: a.from, to: a.to });
    }
    if (reach.elbowUpMax != null && reach.elbowUpMax < REACH.minElbowUp && !off("shoulder")) {
      faults.push({ key: "prep", area: "arm", cue: PREP_CUE, severity: 0.6 });
    }
  }
  let speedState = "na";
  if (prevSpeeds.length >= REACH.minForSpeed && Number.isFinite(peakSpeed)) {
    const usual = median(prevSpeeds);
    if (peakSpeed < REACH.slowShare * usual) { speedState = "off"; faults.push({ key: "speed", area: "arm", cue: SPEED_CUE, severity: 0.5 }); } else speedState = "ok";
  }
  const state = (j) => (!ideal?.[j] || measured[j] == null ? "na" : off(j) ? "off" : "ok");
  const checks = {
    shoulder: !isOverhead ? "off" : state("shoulder"),
    elbow: !isOverhead ? "na" : state("elbow"),
    prep: isOverhead && !off("shoulder") && reach.elbowUpMax != null ? (reach.elbowUpMax < REACH.minElbowUp ? "off" : "ok") : "na",
    speed: speedState,
  };
  faults.sort((a, b) => b.severity - a.severity);
  return { reach: { up: reach.up, elbowUpMax: reach.elbowUpMax, t: reach.frame.t, frame: reach.frame }, isOverhead, measured, plan, faults, checks };
}
