/**
 * @module coachSignals
 * Things about one swing that a coach would notice and the angle checks do not: did the player jump, and was the
 * hit at the top of the jump. Measured from the live frame ring, in the camera's own picture (pixels), because the
 * 3D world landmarks are hip-centred and so cannot see a jump at all.
 *
 * HONEST LIMITS: thresholds come from rule of thumb and one real clip (see test_jump.mjs notes in the repo history);
 * a player walking toward or away from the camera moves their hips in the picture too, so a jump is only called when
 * the rise is clearly more than that. These signals are used for praise and one gentle tip, never to fail a swing.
 *
 * Pure functions, no browser. Frames are the ring's {t, px, vis} entries (px = [x, y] in image pixels).
 */

export const JUMP = {
  baseline: [1.25, 0.5], // s before the swing (start, end): where the player was standing before it
  window: [0.7, 0.1], // s before / after the swing: where the hips could be highest
  minRise: 0.2, // torso lengths the hips must rise to count as a jump (about 10 cm on an adult)
  lateAfter: 0.2, // s: contact this long after the top of the jump means "hit on the way down"
  onTopWithin: 0.12, // s: contact this close to the top of the jump is good timing
};

const L_SH = 11, R_SH = 12, L_HIP = 23, R_HIP = 24;
const median = (a) => { const s = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

function hipsAndTorso(f) {
  if (!f.px || !f.vis || Math.min(f.vis[L_HIP], f.vis[R_HIP], f.vis[L_SH], f.vis[R_SH]) < 0.5) return null;
  const hipY = (f.px[L_HIP][1] + f.px[R_HIP][1]) / 2;
  const shY = (f.px[L_SH][1] + f.px[R_SH][1]) / 2;
  const hipX = (f.px[L_HIP][0] + f.px[R_HIP][0]) / 2;
  const shX = (f.px[L_SH][0] + f.px[R_SH][0]) / 2;
  const torso = Math.hypot(hipX - shX, hipY - shY);
  return torso > 20 ? { hipY, torso } : null;
}

/**
 * Did the hips leave the floor around this swing, and when was the top of it?
 * @param {{t:number, px:number[][], vis:number[]}[]} frames  recent frames, oldest first
 * @param {number} tSwing  the moment judged (the reach for overhead shots, otherwise the speed peak)
 * @returns {{rise:number, apexT:number, offset:number, jumped:boolean, late:boolean, onTop:boolean}|null}
 *   rise: torso lengths; offset: seconds from the top of the jump to the swing (positive = the swing came after it)
 */
export function jumpOf(frames, tSwing) {
  const rows = frames.map((f) => ({ t: f.t, h: hipsAndTorso(f) })).filter((r) => r.h);
  const base = rows.filter((r) => r.t >= tSwing - JUMP.baseline[0] && r.t <= tSwing - JUMP.baseline[1]);
  const win = rows.filter((r) => r.t >= tSwing - JUMP.window[0] && r.t <= tSwing + JUMP.window[1]);
  if (base.length < 3 || win.length < 3) return null;
  const baseY = median(base.map((r) => r.h.hipY));
  const torso = median(rows.map((r) => r.h.torso));
  if (baseY == null || !torso) return null;
  let top = win[0];
  for (const r of win) if (r.h.hipY < top.h.hipY) top = r;
  const rise = (baseY - top.h.hipY) / torso;
  const jumped = rise >= JUMP.minRise;
  const offset = tSwing - top.t;
  return { rise, apexT: top.t, offset, jumped, late: jumped && offset > JUMP.lateAfter, onTop: jumped && Math.abs(offset) <= JUMP.onTopWithin };
}

/**
 * How one swing compares with the player's own earlier ones. Never against a fixed number: a phone far from the
 * player, a child and an adult all read differently, so only "better or worse than your usual" is meaningful.
 * @param {{peakSpeed?:number|null, reachUp?:number|null}} rep
 * @param {{peakSpeed?:number|null, reachUp?:number|null}[]} prev  earlier swings of this session
 */
export function compareToSelf(rep, prev) {
  const speeds = prev.map((r) => r.peakSpeed).filter(Number.isFinite);
  const reaches = prev.map((r) => r.reachUp).filter(Number.isFinite);
  const out = { speedRatio: null, bestSpeed: false, reachStrong: false, bestReach: false };
  if (Number.isFinite(rep.peakSpeed) && speeds.length >= 3) {
    out.speedRatio = rep.peakSpeed / median(speeds);
    out.bestSpeed = rep.peakSpeed >= 1.08 * Math.max(...speeds);
  }
  if (Number.isFinite(rep.reachUp)) {
    // reach is measured in torso lengths above the shoulder, a body-relative number, so a fixed floor is fair here
    out.reachStrong = rep.reachUp >= Math.max(0.75, reaches.length >= 3 ? median(reaches) * 1.1 : 0);
    out.bestReach = reaches.length >= 4 && rep.reachUp >= Math.max(...reaches) + 0.05;
  }
  return out;
}
