/**
 * @module strokeRules
 * Judging the racquet shots that are NOT hit up high (drives, ground strokes, volleys, serves, pushes, dinks, blocks, lifts,
 * boasts), by WHERE the hand is when the racquet meets the ball rather than by joint angles.
 *
 * Why positions and not angles: published biomechanics gives no agreed arm angles at contact for these strokes (studies are
 * tiny, use different joint conventions and disagree), and the angle ranges this app used before were rule of thumb and
 * flagged nearly every swing on some shots. What coaches of every one of these sports DO agree on is positional:
 *   - contact in FRONT of the body, not beside or behind it,
 *   - at the right HEIGHT for the shot (a dink or a squash drive near knee height, a volley or a block around the chest,
 *     a serve below the waist: pickleball and badminton both have a law about it),
 *   - a COMPACT backswing for volleys, blocks, pushes, flicks, dinks and drops ("imagine a wall behind you").
 * Those are measured from the 3D pose as the hand's position relative to the shoulder, in torso lengths (so a tall adult,
 * a child and a phone close or far all read alike): `front` (hand ahead of the shoulder along the way the player faces),
 * `height` (hand above the shoulder; 0 = shoulder, about -0.35 chest, -1.0 waist, -1.9 knee) and `back` (how far behind the
 * shoulder the hand went in the 0.7 s before contact).
 *
 * HONEST LIMITS: the bands below are my translation of those coaching rules into body-relative numbers, made wide on purpose;
 * they are NOT measured values and have not been checked against real players or reviewed by a coach. `front` and `back`
 * depend on the facing direction, which a single camera estimates from the feet; filmed head-on they are softer. Each shot's
 * `source` says what the rule rests on.
 *
 * Pure: no browser.
 */
import { jointIdx } from "./correctPose.js";
import { L_SH, R_SH, L_HIP, R_HIP } from "./correctPose.js";

const VIS = 0.5;
const median = (a) => { const s = a.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const TOL = { height: 0.12, front: 0.1, back: 0.1 }; // torso lengths: a miss smaller than this is noise, not a fault

const SRC = {
  pickle: "Pickleball coaching consensus: contact out in front of the body near knee height, a short backswing ('a wall behind you'), bent knees.",
  pickleServe: "USA Pickleball rule: the serve is struck below the waist.",
  squash: "Squash coaching (e.g. Squash Canada): the ball is hit at the top of the bounce, about knee height, slightly ahead of the front shoulder.",
  bwfServe: "BWF law: the shuttle is struck below 1.15 m at the serve; coaching: contact out in front.",
  general: "Coaching consensus across the sport: contact in front of the body, at a height that suits the shot, compact where the stroke is short.",
};

// height: [min, max] of the hand above the shoulder in torso lengths. front: [min] hand ahead of the shoulder. back: [max] hand behind it.
export const STROKE_RULES = {
  badminton: {
    drive: { height: [-1.0, 0.15], front: [0.3], back: [0.65], source: SRC.general },
    net_shot: { height: [-0.9, 0.5], front: [0.8], back: [0.4], source: SRC.general },
    serve: { height: [-2.0, -0.8], front: [0.2], back: [0.95], source: SRC.bwfServe },
    lift: { height: [-2.3, -0.9], front: [0.3], source: SRC.general },
    block: { height: [-1.0, 0.15], front: [0.4], back: [0.3], source: SRC.general },
  },
  tennis: {
    forehand: { height: [-1.7, -0.2], front: [0.25], source: SRC.general },
    backhand: { height: [-1.7, -0.2], front: [0.3], source: SRC.general },
    volley: { height: [-1.3, 0.3], front: [0.4], back: [0.45], source: SRC.general },
    slice: { height: [-1.6, -0.1], front: [0.3], source: SRC.general },
    drop_shot: { height: [-1.8, -0.3], front: [0.35], back: [0.8], source: SRC.general },
  },
  table_tennis: {
    forehand_drive: { height: [-1.6, -0.3], front: [0.15], back: [0.9], source: SRC.general },
    backhand_drive: { height: [-1.5, -0.2], front: [0.25], back: [0.5], source: SRC.general },
    forehand_loop: { height: [-1.9, -0.4], front: [0.1], back: [1.2], source: SRC.general },
    backhand_flick: { height: [-1.4, -0.2], front: [0.3], back: [0.4], source: SRC.general },
    push: { height: [-1.6, -0.4], front: [0.3], back: [0.6], source: SRC.general },
    chop: { height: [-1.7, -0.1], front: [0.1], source: SRC.general },
    serve: { height: [-1.6, -0.3], front: [0.1], back: [1.0], source: SRC.general },
  },
  pickleball: {
    dink: { height: [-2.2, -0.9], front: [0.4], back: [0.4], kneeMax: 152, source: SRC.pickle },
    drive: { height: [-1.5, -0.2], front: [0.3], back: [0.9], source: SRC.pickle },
    volley: { height: [-1.1, 0.3], front: [0.4], back: [0.4], source: SRC.pickle },
    serve: { height: [-2.0, -0.8], front: [0.2], back: [1.0], source: SRC.pickleServe },
    third_shot_drop: { height: [-2.2, -1.0], front: [0.4], back: [0.7], kneeMax: 152, source: SRC.pickle },
  },
  squash: {
    forehand_drive: { height: [-2.2, -0.9], front: [0.2], kneeMax: 160, source: SRC.squash },
    backhand_drive: { height: [-2.2, -0.9], front: [0.25], kneeMax: 160, source: SRC.squash },
    drop_shot: { height: [-2.3, -1.0], front: [0.4], source: SRC.squash },
    volley: { height: [-1.2, 0.1], front: [0.4], back: [0.5], source: SRC.squash },
    boast: { height: [-2.2, -0.9], front: [0.1], source: SRC.squash },
  },
};

/** The rule for a shot, or null (overhead shots are judged by ai/overheadSwing, and unknown shots by nothing). */
export const strokeRule = (sport, shot) => STROKE_RULES[sport]?.[shot] || null;

const torsoLen = (wl) => {
  const m = (a, b, i) => (wl[a][i] + wl[b][i]) / 2;
  return Math.hypot(m(L_SH, R_SH, 0) - m(L_HIP, R_HIP, 0), m(L_SH, R_SH, 1) - m(L_HIP, R_HIP, 1), m(L_SH, R_SH, 2) - m(L_HIP, R_HIP, 2));
};

/**
 * Where the hitting hand was at contact.
 * @param {{t:number, wl:number[][], vis:number[]}[]} frames  the live ring
 * @param {number} tContact
 * @param {"left"|"right"} side
 * @param {number[]|null} fwd  unit [x,0,z] the player faces (null: front and back cannot be told)
 * @returns {{height:number, front:number|null, back:number|null}|null}
 */
export function strokeFeatures({ frames, tContact, side, fwd }) {
  const { SH, WR } = jointIdx(side);
  const ok = (f) => Math.min(f.vis[SH], f.vis[WR], f.vis[L_SH], f.vis[R_SH], f.vis[L_HIP], f.vis[R_HIP]) >= VIS && torsoLen(f.wl) >= 0.15;
  const rel = (f) => [f.wl[WR][0] - f.wl[SH][0], f.wl[WR][1] - f.wl[SH][1], f.wl[WR][2] - f.wl[SH][2]];
  const near = frames.filter((f) => Math.abs(f.t - tContact) <= 0.05 && ok(f));
  if (!near.length) return null;
  const height = median(near.map((f) => -rel(f)[1] / torsoLen(f.wl)));
  // "in front" is the hand's depth along the way the player faces. Filmed from the front or back that is the camera's
  // weakest axis (a single camera guesses depth), so front and back are only judged when the player is side-on.
  const sideOn = !!fwd && Math.abs(fwd[0]) >= 0.7;
  if (!sideOn) return { height, front: null, back: null, sideOn: false };
  const front = median(near.map((f) => dot3(rel(f), fwd) / torsoLen(f.wl)));
  const win = frames.filter((f) => f.t >= tContact - 0.7 && f.t <= tContact && ok(f));
  const back = win.length >= 3 ? Math.max(...win.map((f) => -dot3(rel(f), fwd) / torsoLen(f.wl))) : null;
  return { height, front, back, sideOn: true };
}

/** The shot's arm and elbow ranges with a wide margin on both sides, so only a GROSS miss is called (these angles were never validated). */
export function grossOnly(ideal, slack = 30) {
  if (!ideal) return ideal;
  const out = { ...ideal };
  for (const j of ["shoulder", "elbow"]) if (ideal[j]) out[j] = { ...ideal[j], min: Math.max(0, ideal[j].min - slack), max: Math.min(185, ideal[j].max + slack) };
  return out;
}

/** A word for how high the hand was: "knee", "waist", "chest", "shoulder", "above the head". */
export function heightName(h) {
  if (h == null) return null;
  return h >= 0.4 ? "overhead" : h >= -0.15 ? "shoulder" : h >= -0.65 ? "chest" : h >= -1.3 ? "waist" : h >= -1.8 ? "thigh" : "knee";
}

const HEIGHT_WORDS = (band) => {
  const c = (band[0] + band[1]) / 2;
  return c >= -0.3 ? "about chest to shoulder height" : c >= -0.9 ? "about chest to waist height" : c >= -1.4 ? "about waist height" : c >= -1.8 ? "between waist and knee height" : "about knee height or lower";
};
export const heightWords = HEIGHT_WORDS;

/** Wording for each way of missing. `rule` shapes the height cue (a low-contact shot says "let it drop", a chest-high one does not). */
export function strokeCue(key, low, rule) {
  const lowShot = rule?.height && (rule.height[0] + rule.height[1]) / 2 <= -1.3;
  if (key === "contact.front") {
    return { headline: "Meet it further out in front", feel: "You made contact too close to your body, or beside or behind your shoulder. Reach out and meet the ball in front of you, with your arm comfortably extended and room to swing through.", drill: "Shadow swings, freezing at contact: your hand should be clearly in front of your shoulder before you swing for real. If the ball is too close, move your feet, not your arm." };
  }
  if (key === "contact.height") {
    return low
      ? { headline: "Meet it higher", feel: "You made contact lower than this shot wants. Get your hand up to meet the ball at about " + HEIGHT_WORDS(rule.height).replace("about ", "") + ", and take it earlier if you can.", drill: "Shadow swings freezing at contact at the right height, then feed yourself a ball and take it on the rise." }
      : { headline: lowShot ? "Let it drop and meet it lower" : "Meet it a little lower", feel: lowShot ? "You hit it higher than this shot wants. Let the ball drop and bend your knees (not your back) so your hand meets it at about " + HEIGHT_WORDS(rule.height).replace("about ", "") + "." : "You made contact higher than this shot wants. Meet it at about " + HEIGHT_WORDS(rule.height).replace("about ", "") + ".", drill: "Shadow swings with your knees bent, freezing at contact at the right height, so your legs do the lowering and your arm stays quiet." };
  }
  if (key === "backswing") {
    return { headline: "Keep the backswing short", feel: "Your hand went a long way behind your shoulder before the swing. This shot wants a short, compact stroke: take the racquet back only as far as you need.", drill: "Shadow swings with a wall behind you that your racquet may not touch, or with your back against a real wall." };
  }
  return null;
}

/**
 * Judge one swing against the shot's rule.
 * @returns {{faults:{key:string, area:string, low?:boolean, severity:number, cue:object}[], chips:{contact:"ok"|"off"|"na", backswing:"ok"|"off"|"na"}}}
 */
export function judgeStroke(rule, f, { kneeAtContact = null } = {}) {
  const faults = [];
  let contact = "na", backswing = "na";
  if (f && rule.front && f.front != null) {
    contact = "ok";
    const miss = rule.front[0] - f.front;
    if (miss > TOL.front) { faults.push({ key: "contact.front", area: "arm", low: true, severity: Math.min(2, miss / 0.4), cue: strokeCue("contact.front", true, rule) }); contact = "off"; }
  }
  if (f && rule.height && f.height != null) {
    if (contact === "na") contact = "ok";
    const lo = rule.height[0] - f.height, hi = f.height - rule.height[1];
    if (lo > TOL.height) { faults.push({ key: "contact.height", area: "arm", low: true, severity: Math.min(2, lo / 0.5), cue: strokeCue("contact.height", true, rule) }); contact = "off"; }
    else if (hi > TOL.height) { faults.push({ key: "contact.height", area: "arm", low: false, severity: Math.min(2, hi / 0.5), cue: strokeCue("contact.height", false, rule) }); contact = "off"; }
  }
  if (f && rule.back && f.back != null) {
    backswing = "ok";
    const over = f.back - rule.back[0];
    if (over > TOL.back) { faults.push({ key: "backswing", area: "arm", low: false, severity: Math.min(2, over / 0.4), cue: strokeCue("backswing", false, rule) }); backswing = "off"; }
  }
  return { faults: faults.sort((a, b) => b.severity - a.severity), chips: { contact, backswing }, kneeTooStraight: rule.kneeMax != null && kneeAtContact != null && kneeAtContact > rule.kneeMax + 4 };
}
