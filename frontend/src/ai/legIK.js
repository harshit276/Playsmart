/**
 * @module legIK
 * Re-pose one leg so its knee reaches a target angle, the way a coach would
 * picture "bend your knees more": the foot stays planted, the hips settle
 * lower (or rise), and thigh and shin keep their real lengths.
 *
 * Pure vector maths, no browser needed. Points are [x, y, z] in metres.
 */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Interior angle at `b` in degrees (180 = straight), or null for a degenerate limb. */
export function jointAngle(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const nu = norm(u), nv = norm(v);
  if (nu < 1e-9 || nv < 1e-9) return null;
  return (Math.acos(clamp(dot(u, v) / (nu * nv), -1, 1)) * 180) / Math.PI;
}

/**
 * @param {number[]} hip
 * @param {number[]} knee
 * @param {number[]} ankle    stays exactly where it is
 * @param {number} targetDeg  the knee angle to reach (hip–knee–ankle)
 * @returns {{hip:number[], knee:number[], ankle:number[]} | null}
 *
 * The hip slides along the ankle→hip line to the distance that makes the
 * triangle close at `targetDeg` (law of cosines); the knee then sits at the
 * matching point on the SAME side it bends toward now, so the leg keeps
 * folding the way the player's does.
 */
export function reposeLeg(hip, knee, ankle, targetDeg) {
  const a = norm(sub(hip, knee)); // thigh
  const b = norm(sub(ankle, knee)); // shin
  if (a < 1e-6 || b < 1e-6) return null;
  const theta = (clamp(targetDeg, 20, 179.5) * Math.PI) / 180;
  const d = Math.sqrt(Math.max(1e-12, a * a + b * b - 2 * a * b * Math.cos(theta)));

  const axis = sub(hip, ankle);
  const na = norm(axis);
  if (na < 1e-6) return null;
  const u = mul(axis, 1 / na);

  // Unit vector, perpendicular to the axis, pointing toward where the knee is.
  const kv = sub(knee, ankle);
  let perp = sub(kv, mul(u, dot(kv, u)));
  let np = norm(perp);
  if (np < 1e-6) {
    // Dead-straight leg: any perpendicular will do; pick one that is stable.
    perp = cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
    np = norm(perp);
  }
  const n = mul(perp, 1 / np);

  const cosA = clamp((b * b + d * d - a * a) / (2 * b * d), -1, 1); // angle at the ankle
  const A = Math.acos(cosA);
  return {
    hip: add(ankle, mul(u, d)),
    knee: add(ankle, add(mul(u, b * Math.cos(A)), mul(n, b * Math.sin(A)))),
    ankle,
  };
}
