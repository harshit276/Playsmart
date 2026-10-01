/**
 * @module correctPose
 * The maths shared by the clip ghost (ghostPose) and the live practice mode:
 * measure the hitting arm and leg in 3D, decide what is outside its target,
 * and re-pose those limbs to the target so they can be drawn on the picture.
 *
 * Inputs are MediaPipe pose landmarks for ONE person on ONE frame:
 *   wl  — 33 world landmarks as [x, y, z] metres (hip-centred)
 *   px  — 33 image points as [x, y] in whatever pixel space the caller draws in
 *   vis — 33 visibility scores 0-1
 * Pure functions, no browser needed.
 */
import { reposeLeg } from "./legIK.js";

// MediaPipe / BlazePose 33-landmark indices.
export const L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16, L_HIP = 23, R_HIP = 24;
export const L_KN = 25, R_KN = 26, L_AN = 27, R_AN = 28;
export const GHOST_EDGES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [27, 29], [28, 30],
];

// ─── small vector helpers ───────────────────────────────────────────────
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => { const n = norm(a); return n > 1e-9 ? scale(a, 1 / n) : null; };

export function angleDeg(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const nu = norm(u), nv = norm(v);
  if (nu < 1e-9 || nv < 1e-9) return null;
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (nu * nv)))) * 180) / Math.PI;
}

// Rodrigues: rotate v about unit axis k by rad.
export function rotate(v, k, rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

// ─── camera fit: world (x,y,z,1) → pixels, least squares ───────────────
function solve4(A, b) {
  // Gaussian elimination with partial pivoting on a 4x4 system (2 RHS columns).
  const M = A.map((row, i) => [...row, ...b[i]]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 6; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [0, 1, 2, 3].map((r) => [M[r][4] / M[r][r], M[r][5] / M[r][r]]);
}

/** An affine camera fitted from the joints the model is sure of, or null. */
export function fitCamera(world, px, vis) {
  const AtA = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const AtP = [[0, 0], [0, 0], [0, 0], [0, 0]];
  let n = 0;
  for (let i = 0; i < world.length; i++) {
    if ((vis[i] ?? 0) < 0.5) continue;
    const x = [world[i][0], world[i][1], world[i][2], 1];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) AtA[r][c] += x[r] * x[c];
      AtP[r][0] += x[r] * px[i][0];
      AtP[r][1] += x[r] * px[i][1];
    }
    n++;
  }
  if (n < 8) return null;
  const M = solve4(AtA, AtP);
  if (!M) return null;
  return (p) => [
    p[0] * M[0][0] + p[1] * M[1][0] + p[2] * M[2][0] + M[3][0],
    p[0] * M[0][1] + p[1] * M[1][1] + p[2] * M[2][1] + M[3][1],
  ];
}

// ─── measure, plan, correct ─────────────────────────────────────────────
/** Landmark indices of the hitting-side limbs. */
export function jointIdx(side) {
  const left = side === "left";
  return {
    SH: left ? L_SH : R_SH, EL: left ? L_EL : R_EL, WR: left ? L_WR : R_WR,
    HIP: left ? L_HIP : R_HIP, KN: left ? L_KN : R_KN, AN: left ? L_AN : R_AN,
  };
}

/**
 * The hitting arm's and leg's angles in 3D, each only when the model can see
 * every joint of it (visibility >= 0.5), plus base width (feet apart in
 * shoulder widths; information only).
 */
export function measureJoints(wl, vis, side) {
  const { SH, EL, WR, HIP, KN, AN } = jointIdx(side);
  const armOk = Math.min(vis[SH], vis[EL], vis[WR]) >= 0.5;
  const legOk = Math.min(vis[HIP], vis[KN], vis[AN]) >= 0.5;
  const measured = {
    elbow: armOk ? angleDeg(wl[SH], wl[EL], wl[WR]) : null,
    shoulder: armOk ? angleDeg(wl[HIP], wl[SH], wl[EL]) : null,
    knee: legOk ? angleDeg(wl[HIP], wl[KN], wl[AN]) : null, // the hitting-side leg
  };
  const shoulderW = Math.hypot(...sub(wl[L_SH], wl[R_SH]));
  const footGap = Math.hypot(wl[L_AN][0] - wl[R_AN][0], wl[L_AN][2] - wl[R_AN][2]);
  const bothFeet = Math.min(vis[L_AN], vis[R_AN]) >= 0.5;
  const stanceWidth = bothFeet && shoulderW > 0.05 ? footGap / shoulderW : null;
  return { armOk, legOk, measured, stanceWidth };
}

/**
 * Which joints sit outside their target range, and by how much to move each to
 * the ideal. `ideal` is an entry from idealAngles (may be null).
 * @returns {{applied: object[], delta: {shoulder:number, elbow:number, knee:number}}}
 */
export function planCorrections(measured, ideal) {
  const applied = [];
  const delta = { shoulder: 0, elbow: 0, knee: 0 };
  for (const joint of ["shoulder", "elbow", "knee"]) {
    const range = ideal?.[joint];
    const val = measured[joint];
    if (!range || val == null) continue;
    if (val >= range.min && val <= range.max) continue;
    delta[joint] = range.ideal - val;
    applied.push({
      joint, from: Math.round(val), to: Math.round(range.ideal),
      deltaDeg: Math.round(range.ideal - val), why: range.why || null,
    });
  }
  return { applied, delta };
}

/**
 * The corrected arm and leg for one frame, in the pixel space of `px`.
 * `w` (0-1) blends the correction in: 1 is the full correction, 0 the real pose.
 * The arm is anchored at the real shoulder, the leg at the planted ankle.
 * @returns {{arm: object|null, leg: object|null, fitErrSum: number, fitN: number} | null}
 *   null when no camera can be fitted to this frame
 */
export function correctLimbs({ wl, px, vis, side, delta, w = 1 }) {
  const { SH, EL, WR, HIP, KN, AN } = jointIdx(side);
  const project = fitCamera(wl, px, vis);
  if (!project) return null;
  let fitErrSum = 0;
  for (const k of [SH, L_HIP, R_HIP]) {
    const q = project(wl[k]);
    fitErrSum += Math.hypot(q[0] - px[k][0], q[1] - px[k][1]);
  }
  const out = { arm: null, leg: null, fitErrSum, fitN: 3 };

  if (delta.shoulder || delta.elbow) {
    let el = wl[EL], wr = wl[WR];
    const sh = wl[SH], hip = wl[HIP];
    if (delta.shoulder) {
      const ax = unit(cross(sub(hip, sh), sub(el, sh)));
      if (ax) {
        const rad = (delta.shoulder * w * Math.PI) / 180;
        el = add(sh, rotate(sub(el, sh), ax, rad));
        wr = add(sh, rotate(sub(wr, sh), ax, rad));
      }
    }
    if (delta.elbow) {
      const ax = unit(cross(sub(sh, el), sub(wr, el)));
      if (ax) {
        const rad = (delta.elbow * w * Math.PI) / 180;
        wr = add(el, rotate(sub(wr, el), ax, rad));
      }
    }
    const off = sub([...px[SH], 0], [...project(sh), 0]);
    const toPx = (p) => { const q = project(p); return [q[0] + off[0], q[1] + off[1]]; };
    out.arm = { sh: px[SH], el: toPx(el), wr: toPx(wr) };
  }

  if (delta.knee) {
    // Foot planted, hips settle: the leg reaches the target knee angle.
    const cur = angleDeg(wl[HIP], wl[KN], wl[AN]);
    const re = cur != null ? reposeLeg(wl[HIP], wl[KN], wl[AN], cur + delta.knee * w) : null;
    if (re) {
      const off = sub([...px[AN], 0], [...project(wl[AN]), 0]);
      const toPx = (p) => { const q = project(p); return [q[0] + off[0], q[1] + off[1]]; };
      out.leg = { hip: toPx(re.hip), kn: toPx(re.knee), an: px[AN] };
    }
  }
  return out;
}

/**
 * What the full correction achieves (checked, not assumed): the angles after
 * re-posing. Joints that weren't corrected keep their measured value.
 */
export function achievedAngles(wl, side, delta, measured, armOk) {
  const { SH, EL, WR, HIP, KN, AN } = jointIdx(side);
  let el = wl[EL], wr = wl[WR];
  const sh = wl[SH], hip = wl[HIP];
  if (delta.shoulder) {
    const ax = unit(cross(sub(hip, sh), sub(el, sh)));
    if (ax) { const r = (delta.shoulder * Math.PI) / 180; el = add(sh, rotate(sub(el, sh), ax, r)); wr = add(sh, rotate(sub(wr, sh), ax, r)); }
  }
  if (delta.elbow) {
    const ax = unit(cross(sub(sh, el), sub(wr, el)));
    if (ax) { const r = (delta.elbow * Math.PI) / 180; wr = add(el, rotate(sub(wr, el), ax, r)); }
  }
  let knee = measured.knee;
  if (delta.knee) {
    const re = reposeLeg(wl[HIP], wl[KN], wl[AN], measured.knee + delta.knee);
    knee = re ? angleDeg(re.hip, re.knee, re.ankle) : null;
  }
  return {
    elbow: armOk ? angleDeg(sh, el, wr) : null,
    shoulder: armOk ? angleDeg(hip, sh, el) : null,
    knee,
  };
}
