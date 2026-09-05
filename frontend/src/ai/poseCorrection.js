/**
 * @module poseCorrection
 * Turns "your elbow is 33° too bent" into a picture of the fix — on the
 * user's OWN body.
 *
 * WHY THIS EXISTS: the posture tracker already tells a player which joints are
 * outside the ideal range and by how much. A number is not a lesson. Players
 * asked, reasonably, "so where should my arm actually be?" The obvious answer
 * is to generate a video of correct form, but a video model has no biomechanics
 * — it pattern-matches pixels, so it will happily render an anatomically
 * impossible squat that looks plausible and teaches the wrong thing. On a gym
 * or rehab clip that is an injury risk, not a quality issue.
 *
 * WHAT THIS DOES INSTEAD: we already know the player's real keypoints, so we
 * already know their real limb lengths. Rotating a segment about its joint
 * until the measured angle equals the curated ideal gives the exact pose that
 * player would be in if they fixed that one thing — their proportions, their
 * position, their frame. Nothing is invented and nothing is hallucinated: it is
 * their own skeleton, solved. Deterministic, explainable, and free to compute.
 *
 * Scope, deliberately: only the three joints the tracker measures (elbow,
 * shoulder, knee) on the dominant side, and only in 2D image space. This is a
 * teaching diagram, not a biomechanical simulation — see the caveats on
 * `correctPose`.
 */
/**
 * Keypoint order, inlined rather than imported.
 *
 * poseDetector exports this list but imports TensorFlow at module scope, so
 * importing it here would pull multi-megabyte TF into every consumer — the
 * same trap posturePolicy documents. This is the fixed MoveNet/COCO-17
 * topology; it does not change. Keep in sync with poseDetector.KEYPOINT_NAMES.
 */
export const KEYPOINT_ORDER = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

/** Keypoint index by name, so we can write back into the same array shape. */
function idx(name) {
  return KEYPOINT_ORDER.indexOf(name);
}

/** Rotate point p around pivot by `rad` (screen space: y grows downward). */
function rotateAround(p, pivot, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return {
    ...p,
    x: pivot.x + dx * c - dy * s,
    y: pivot.y + dx * s + dy * c,
  };
}

/**
 * Signed rotation (radians) that takes the pivot→distal segment to `targetDeg`
 * away from the pivot→ref segment, moving the SHORT way round.
 *
 * `calculateAngle` returns an unsigned 0-180° angle, so it cannot tell us which
 * way to rotate. The cross product can: its sign says whether distal currently
 * sits clockwise or anticlockwise of ref, and rotating further in that same
 * direction is what opens the angle.
 */
function rotationToTarget(ref, pivot, distal, targetDeg) {
  const v1x = ref.x - pivot.x, v1y = ref.y - pivot.y;
  const v2x = distal.x - pivot.x, v2y = distal.y - pivot.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 < 1e-6 || m2 < 1e-6) return 0;

  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
  const currentDeg = (Math.acos(cos) * 180) / Math.PI;

  // > 0 when distal is anticlockwise of ref in screen space.
  const cross = v1x * v2y - v1y * v2x;
  const openDir = cross >= 0 ? 1 : -1;

  const deltaDeg = (targetDeg - currentDeg) * openDir;
  return (deltaDeg * Math.PI) / 180;
}

/**
 * Which segment each joint drives, and what it is measured against.
 * `chain` lists every keypoint carried along when the joint rotates — an upper
 * arm swinging at the shoulder takes the forearm and hand with it.
 * Mirrors angleAt() in poseOverlay; keep the two in step.
 */
const JOINTS = {
  shoulder: (side) => ({
    ref: `${side}_hip`,
    pivot: `${side}_shoulder`,
    chain: [`${side}_elbow`, `${side}_wrist`],
  }),
  elbow: (side) => ({
    ref: `${side}_shoulder`,
    pivot: `${side}_elbow`,
    chain: [`${side}_wrist`],
  }),
  knee: (side) => ({
    ref: `${side}_hip`,
    pivot: `${side}_knee`,
    chain: [`${side}_ankle`],
  }),
};

// Proximal joints move their children, so they must be solved first — correct
// the elbow before the shoulder and the shoulder rotation immediately undoes it.
const SOLVE_ORDER = ["shoulder", "elbow", "knee"];

/**
 * Build the "corrected you" pose.
 *
 * @param {Array} keypoints  MoveNet keypoints ({x, y, score}), image pixel space.
 * @param {Array} measurements  from analyzePoseOnFrame — {joint, value, ideal, status}.
 * @param {string} side  "left" | "right" — the dominant/racket side.
 * @returns {{corrected: Array, applied: Array, unchanged: boolean}}
 *   `applied` is one entry per joint actually moved: {joint, from, to, deltaDeg, why}.
 *
 * CAVEATS worth stating plainly to the user, not hiding:
 *  - This is a 2D projection. A joint that looks wrong may just be angled away
 *    from the camera, which is why we only correct joints the tracker already
 *    trusted enough to grade (`ideal` present, confident keypoints).
 *  - Correcting a limb in isolation ignores balance and the rest of the
 *    kinetic chain. It shows the target for ONE joint, not a whole new posture.
 *  - Joints already inside their ideal range are left completely untouched, so
 *    "corrected" and "yours" being identical is a valid, meaningful result.
 */
export function correctPose(keypoints, measurements, side) {
  const corrected = keypoints.map((k) => (k ? { ...k } : k));
  const applied = [];
  if (!keypoints || !measurements || !side) {
    return { corrected, applied, unchanged: true };
  }

  const byJoint = new Map(measurements.map((m) => [m.joint, m]));

  for (const jointName of SOLVE_ORDER) {
    const m = byJoint.get(jointName);
    // Only move joints the tracker actually graded AND flagged. "good" means
    // inside the ideal band — there is nothing to teach there.
    if (!m || !m.ideal || m.status === "good" || m.status === "neutral") continue;

    const spec = JOINTS[jointName](side);
    const iRef = idx(spec.ref);
    const iPivot = idx(spec.pivot);
    const chainIdx = spec.chain.map(idx);
    const iDistal = chainIdx[0];
    if (iRef < 0 || iPivot < 0 || iDistal < 0) continue;

    const ref = corrected[iRef];
    const pivot = corrected[iPivot];
    const distal = corrected[iDistal];
    if (!ref || !pivot || !distal) continue;

    const target = m.ideal.target;
    const rad = rotationToTarget(ref, pivot, distal, target);
    if (!Number.isFinite(rad) || Math.abs(rad) < 1e-4) continue;

    // Rotate the whole downstream chain rigidly about the pivot: bone lengths
    // are preserved exactly, which is what keeps this the user's own body.
    for (const ci of chainIdx) {
      if (ci >= 0 && corrected[ci]) corrected[ci] = rotateAround(corrected[ci], pivot, rad);
    }

    applied.push({
      joint: jointName,
      from: Math.round(m.value),
      to: Math.round(target),
      deltaDeg: Math.round(target - m.value),
      status: m.status,
      why: m.ideal.why || null,
    });
  }

  return { corrected, applied, unchanged: applied.length === 0 };
}

/**
 * Where each corrected joint ended up, for drawing a "move it here" arrow.
 * Returns the endpoint that visibly moved most for each correction.
 */
export function correctionVectors(original, corrected, applied, side) {
  const out = [];
  for (const a of applied) {
    const spec = JOINTS[a.joint](side);
    // The tip of the chain travels furthest, so it reads best as an arrow.
    const tip = idx(spec.chain[spec.chain.length - 1]);
    if (tip < 0 || !original[tip] || !corrected[tip]) continue;
    const from = original[tip];
    const to = corrected[tip];
    if (Math.hypot(to.x - from.x, to.y - from.y) < 2) continue;
    out.push({ joint: a.joint, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } });
  }
  return out;
}
