/**
 * @module liftCorrect
 * Re-pose a lifter's legs and trunk to a target so the correction can be drawn
 * on their own picture: the knees to a target angle (feet planted, hips settle),
 * and the trunk rotated about the hips to a target lean, with the shoulders,
 * arms and head carried along.
 *
 * Same idea and same camera fit as correctPose.correctLimbs (which does the
 * hitting arm and one leg), extended to the whole pelvis-and-trunk chain a lift
 * needs. Pure functions, no browser needed.
 *
 * Inputs for ONE person on ONE frame:
 *   wl  — 33 world landmarks [x, y, z] metres, hip-centred, y pointing DOWN
 *   px  — 33 image points [x, y] in the pixel space the caller draws in
 *   vis — 33 visibility scores
 */
import { fitCamera, sub, add, scale, cross, unit, rotate, angleDeg } from "./correctPose.js";
import { reposeLeg } from "./legIK.js";
import { measureLift } from "./liftPose.js";

const UP = [0, -1, 0];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const LEGS = [[23, 25, 27], [24, 26, 28]];
const UPPER = []; // head, shoulders, arms, hands: they ride on the trunk
for (let i = 0; i <= 22; i++) UPPER.push(i);

/**
 * @param {object} a
 * @param {{knee:number, trunk:number}} a.delta  degrees to move each by (target − measured); trunk > 0 leans forward
 * @param {number} [a.w=1]                        0-1 blend: 1 is the full correction
 * @param {number[]|null} a.fwd                   facing direction (unit [x,0,z]); without it the trunk is left alone
 * @returns {{px2:number[][], moved:boolean[], world:number[][]} | null}  null when no camera can be fitted
 */
export function correctLift({ wl, px, vis, delta, w = 1, fwd = null }) {
  const project = fitCamera(wl, px, vis);
  if (!project) return null;
  const W = wl.map((p) => [...p]);
  const moved = new Array(33).fill(false);

  // 1. knees: each visible leg reaches the target knee angle with its ankle planted
  let shift = [0, 0, 0], n = 0;
  if (delta.knee) {
    const hipShift = [null, null];
    LEGS.forEach(([H, K, A], li) => {
      if (Math.min(vis[H], vis[K], vis[A]) < 0.5) return;
      const cur = angleDeg(wl[H], wl[K], wl[A]);
      const re = cur != null ? reposeLeg(wl[H], wl[K], wl[A], cur + delta.knee * w) : null;
      if (!re) return;
      W[H] = re.hip; W[K] = re.knee;
      moved[H] = moved[K] = true;
      hipShift[li] = sub(re.hip, wl[H]);
      shift = add(shift, hipShift[li]);
      n++;
    });
    if (n) shift = scale(shift, 1 / n);
    // a leg the model can't see moves with the pelvis rather than being left behind
    LEGS.forEach(([H, K], li) => {
      if (hipShift[li] || !n) return;
      W[H] = add(wl[H], shift); W[K] = add(wl[K], shift);
      moved[H] = moved[K] = true;
    });
  }

  // 2. trunk: the shoulders ride on the pelvis, then lean about the hips to the target
  const hipMidOld = mid(wl[23], wl[24]);
  const hipMid = mid(W[23], W[24]);
  const shMidOld = mid(wl[11], wl[12]);
  const tv = sub(shMidOld, hipMidOld);
  let tvNew = tv;
  if (delta.trunk && fwd) {
    const ax = unit(cross(UP, fwd)); // lateral axis: rotating about it leans the trunk toward/away from `fwd`
    if (ax) tvNew = rotate(tv, ax, (delta.trunk * w * Math.PI) / 180);
  }
  const upperShift = sub(add(hipMid, tvNew), shMidOld);
  if (n || (delta.trunk && fwd)) {
    for (const i of UPPER) { W[i] = add(wl[i], upperShift); moved[i] = true; }
  }
  if (!moved.some(Boolean)) return { px2: px.map((p) => [...p]), moved, world: W };

  // 3. back to pixels: each moved point is its REAL pixel plus the projected displacement, so the
  // camera fit's residual never shows (no correction means no drift) and the planted ankles stay put
  const px2 = px.map((p, i) => {
    if (!moved[i]) return [...p];
    const a = project(wl[i]), b = project(W[i]);
    return [p[0] + (b[0] - a[0]), p[1] + (b[1] - a[1])];
  });
  return { px2, moved, world: W };
}

/** What a correction really achieves, measured on the re-posed 3D points (checked, not assumed). */
export function achievedLift(corrected, vis, fwd) {
  const m = measureLift(corrected.world, vis, fwd);
  return { hip: m.hip, knee: m.knee, trunk: m.trunk };
}
