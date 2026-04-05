/**
 * @module metricsCalculator
 * Computes technique metrics, grades, and skill-level assessments from
 * pose keypoint sequences. Sport- and shot-aware.
 */

import {
  getKeypointByName,
  calculateAngle,
  keypointDistance,
} from "./poseDetector.js";

// ──────────────────── Types ────────────────────

/**
 * @typedef {Object} TechniqueMetrics
 * @property {number} elbow_angle_min - Minimum elbow angle (degrees) across the sequence.
 * @property {number} elbow_angle_max - Maximum elbow angle (degrees) across the sequence.
 * @property {number} elbow_angle_range - Range of elbow flexion/extension.
 * @property {number} wrist_height_min - Minimum wrist Y (highest point on screen).
 * @property {number} wrist_height_max - Maximum wrist Y (lowest point on screen).
 * @property {number} wrist_height_range - Range of wrist vertical travel.
 * @property {number} shoulder_rotation - Peak shoulder rotation (degrees).
 * @property {number} hip_rotation - Peak hip rotation (degrees).
 * @property {Object} shot_specific - Additional metrics specific to the shot type.
 * @property {string} grade - Letter grade: A, B, C, D, or F.
 * @property {string} skill_level - Beginner, Intermediate, Advanced, or Elite.
 * @property {number} overall_score - 0-100 composite technique score.
 * @property {string[]} feedback - Human-readable improvement tips.
 */

// ──────────────────── Constants ────────────────────

/**
 * Ideal ranges for grading. Structure:
 *   { metric: [min_ideal, max_ideal, weight] }
 * Weight determines how much each metric contributes to the grade.
 */
const GRADE_CRITERIA = {
  badminton: {
    smash: {
      elbow_angle_max: [150, 180, 0.25],
      wrist_height_range: [80, 200, 0.20],
      shoulder_rotation: [15, 45, 0.20],
      hip_rotation: [10, 35, 0.15],
      contact_height: [0.3, 0.7, 0.20], // ratio of wrist-to-frame-height
    },
    clear: {
      elbow_angle_max: [145, 180, 0.25],
      wrist_height_range: [60, 180, 0.20],
      shoulder_rotation: [10, 40, 0.25],
      hip_rotation: [8, 30, 0.15],
      contact_height: [0.25, 0.6, 0.15],
    },
    drive: {
      elbow_angle_max: [110, 155, 0.25],
      wrist_height_range: [30, 100, 0.20],
      shoulder_rotation: [5, 25, 0.20],
      arm_extension: [0.6, 0.95, 0.20],
      hip_rotation: [5, 20, 0.15],
    },
    _default: {
      elbow_angle_max: [100, 170, 0.30],
      wrist_height_range: [30, 150, 0.25],
      shoulder_rotation: [5, 35, 0.25],
      hip_rotation: [5, 25, 0.20],
    },
  },
  table_tennis: {
    forehand_loop: {
      elbow_angle_range: [40, 90, 0.25],
      wrist_height_range: [30, 100, 0.20],
      shoulder_rotation: [10, 35, 0.25],
      hip_rotation: [8, 30, 0.30],
    },
    smash: {
      elbow_angle_max: [140, 175, 0.25],
      wrist_height_range: [50, 120, 0.25],
      shoulder_rotation: [10, 35, 0.25],
      hip_rotation: [8, 25, 0.25],
    },
    _default: {
      elbow_angle_range: [20, 80, 0.30],
      wrist_height_range: [20, 80, 0.25],
      shoulder_rotation: [5, 30, 0.25],
      hip_rotation: [5, 25, 0.20],
    },
  },
  tennis: {
    serve: {
      elbow_angle_max: [155, 180, 0.25],
      wrist_height_range: [80, 200, 0.20],
      shoulder_rotation: [20, 50, 0.25],
      hip_rotation: [15, 40, 0.15],
      contact_height: [0.3, 0.65, 0.15],
    },
    forehand: {
      elbow_angle_range: [40, 100, 0.25],
      shoulder_rotation: [15, 45, 0.30],
      hip_rotation: [10, 35, 0.25],
      wrist_height_range: [30, 100, 0.20],
    },
    _default: {
      elbow_angle_range: [30, 90, 0.30],
      shoulder_rotation: [10, 40, 0.25],
      hip_rotation: [8, 30, 0.25],
      wrist_height_range: [25, 100, 0.20],
    },
  },
  pickleball: {
    _default: {
      elbow_angle_range: [20, 70, 0.30],
      wrist_height_range: [15, 70, 0.25],
      shoulder_rotation: [5, 25, 0.25],
      hip_rotation: [5, 20, 0.20],
    },
  },
};

import {
  GRADE_THRESHOLDS as GRADE_THRESHOLDS_RAW,
  SKILL_LEVEL_THRESHOLDS as SKILL_LEVEL_THRESHOLDS_RAW,
} from "./constants.js";

/** Grade letter from overall_score -- derived from constants.js. */
const GRADE_THRESHOLDS = GRADE_THRESHOLDS_RAW.map((g) => [g.minScore, g.grade]);

/** Skill level from overall_score -- derived from constants.js. */
const SKILL_THRESHOLDS = SKILL_LEVEL_THRESHOLDS_RAW.map((s) => [s.minScore, s.label]);

// ──────────────────── Helpers ────────────────────

/**
 * Detect dominant (playing) side based on wrist movement.
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @returns {"left"|"right"}
 */
function detectSide(poses) {
  if (!poses || poses.length < 2) return "right";
  let l = 0, r = 0;
  for (let i = 1; i < poses.length; i++) {
    l += keypointDistance(
      getKeypointByName(poses[i - 1], "left_wrist"),
      getKeypointByName(poses[i], "left_wrist")
    );
    r += keypointDistance(
      getKeypointByName(poses[i - 1], "right_wrist"),
      getKeypointByName(poses[i], "right_wrist")
    );
  }
  return l > r ? "left" : "right";
}

/**
 * Compute elbow angles across all frames for the dominant arm.
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @param {string} side
 * @returns {number[]}
 */
function elbowAngles(poses, side) {
  return poses
    .map((frame) => {
      const shoulder = getKeypointByName(frame, `${side}_shoulder`);
      const elbow = getKeypointByName(frame, `${side}_elbow`);
      const wrist = getKeypointByName(frame, `${side}_wrist`);
      return calculateAngle(shoulder, elbow, wrist);
    })
    .filter((a) => a > 0);
}

/**
 * Compute wrist Y positions across frames for the dominant side.
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @param {string} side
 * @returns {number[]}
 */
function wristHeights(poses, side) {
  return poses
    .map((frame) => {
      const w = getKeypointByName(frame, `${side}_wrist`);
      return w ? w.y : null;
    })
    .filter((y) => y !== null);
}

/**
 * Peak shoulder rotation across the sequence.
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @returns {number} Degrees.
 */
function peakShoulderRotation(poses) {
  let maxRot = 0;
  for (const frame of poses) {
    const ls = getKeypointByName(frame, "left_shoulder");
    const rs = getKeypointByName(frame, "right_shoulder");
    if (!ls || !rs) continue;
    const dx = Math.abs(ls.x - rs.x);
    const dy = Math.abs(ls.y - rs.y);
    const rot = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (rot > maxRot) maxRot = rot;
  }
  return Math.round(maxRot * 10) / 10;
}

/**
 * Peak hip rotation across the sequence.
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @returns {number} Degrees.
 */
function peakHipRotation(poses) {
  let maxRot = 0;
  for (const frame of poses) {
    const lh = getKeypointByName(frame, "left_hip");
    const rh = getKeypointByName(frame, "right_hip");
    if (!lh || !rh) continue;
    const dx = Math.abs(lh.x - rh.x);
    const dy = Math.abs(lh.y - rh.y);
    const rot = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (rot > maxRot) maxRot = rot;
  }
  return Math.round(maxRot * 10) / 10;
}

/**
 * Compute contact height ratio: how high the wrist is at its peak relative
 * to the full frame height (approximated as nose-to-ankle distance).
 * Returns a value in [0, 1] where 1 = highest possible.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @param {string} side
 * @returns {number}
 */
function contactHeightRatio(poses, side) {
  let bestRatio = 0;
  for (const frame of poses) {
    const nose = getKeypointByName(frame, "nose");
    const ankle = getKeypointByName(frame, `${side}_ankle`) ??
                  getKeypointByName(frame, side === "right" ? "left_ankle" : "right_ankle");
    const wrist = getKeypointByName(frame, `${side}_wrist`);
    if (!nose || !ankle || !wrist) continue;
    const fullHeight = Math.abs(ankle.y - nose.y);
    if (fullHeight < 10) continue;
    const wristFromTop = Math.max(0, ankle.y - wrist.y);
    const ratio = wristFromTop / fullHeight;
    if (ratio > bestRatio) bestRatio = ratio;
  }
  return Math.round(bestRatio * 100) / 100;
}

/**
 * Arm extension ratio: distance(shoulder, wrist) / distance(shoulder, elbow) + distance(elbow, wrist).
 * 1.0 = fully extended, 0 = fully bent.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @param {string} side
 * @returns {number} Peak extension ratio.
 */
function peakArmExtension(poses, side) {
  let best = 0;
  for (const frame of poses) {
    const shoulder = getKeypointByName(frame, `${side}_shoulder`);
    const elbow = getKeypointByName(frame, `${side}_elbow`);
    const wrist = getKeypointByName(frame, `${side}_wrist`);
    if (!shoulder || !elbow || !wrist) continue;
    const directDist = keypointDistance(shoulder, wrist);
    const segDist = keypointDistance(shoulder, elbow) + keypointDistance(elbow, wrist);
    if (segDist === 0) continue;
    const ratio = directDist / segDist;
    if (ratio > best) best = ratio;
  }
  return Math.round(best * 100) / 100;
}

/**
 * Score a single metric against an ideal range.
 * Returns 0-100 where 100 = within ideal range.
 *
 * @param {number} value
 * @param {number} idealMin
 * @param {number} idealMax
 * @returns {number}
 */
function scoreMetric(value, idealMin, idealMax) {
  if (value >= idealMin && value <= idealMax) return 100;
  // Linear drop-off outside the ideal range
  const range = idealMax - idealMin;
  const buffer = range * 0.5 || 10;
  if (value < idealMin) {
    const deficit = idealMin - value;
    return Math.max(0, 100 - (deficit / buffer) * 50);
  }
  const excess = value - idealMax;
  return Math.max(0, 100 - (excess / buffer) * 50);
}

/**
 * Build shot-specific metrics depending on sport and shot type.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @param {string} side
 * @param {string} sport
 * @param {string} shotType
 * @returns {Object}
 */
function shotSpecificMetrics(poses, side, sport, shotType) {
  const extra = {};

  if (
    (sport === "badminton" && (shotType === "smash" || shotType === "clear")) ||
    (sport === "tennis" && shotType === "serve")
  ) {
    extra.contact_height = contactHeightRatio(poses, side);
  }

  if (
    sport === "badminton" && shotType === "drive" ||
    sport === "tennis" && (shotType === "forehand" || shotType === "backhand")
  ) {
    extra.arm_extension = peakArmExtension(poses, side);
  }

  return extra;
}

/**
 * Generate human-readable feedback tips based on metrics.
 *
 * @param {Object} metrics - The computed raw metrics.
 * @param {Object} criteria - The grading criteria for this shot.
 * @returns {string[]}
 */
function generateFeedback(metrics, criteria) {
  const tips = [];

  if (criteria.elbow_angle_max && metrics.elbow_angle_max < criteria.elbow_angle_max[0]) {
    tips.push("Try extending your arm more fully at the point of contact for better power.");
  }
  if (criteria.elbow_angle_range && metrics.elbow_angle_range < criteria.elbow_angle_range[0]) {
    tips.push("Increase your arm swing range -- a fuller backswing generates more racket speed.");
  }
  if (criteria.shoulder_rotation && metrics.shoulder_rotation < criteria.shoulder_rotation[0]) {
    tips.push("Rotate your shoulders more to transfer body weight into the shot.");
  }
  if (criteria.hip_rotation && metrics.hip_rotation < criteria.hip_rotation[0]) {
    tips.push("Engage your hips -- rotate them to drive power from your legs through the kinetic chain.");
  }
  if (criteria.wrist_height_range && metrics.wrist_height_range < criteria.wrist_height_range[0]) {
    tips.push("Use a bigger follow-through; your wrist travel seems limited.");
  }
  if (criteria.contact_height && metrics.shot_specific?.contact_height != null) {
    if (metrics.shot_specific.contact_height < criteria.contact_height[0]) {
      tips.push("Contact the shuttle/ball at a higher point for a steeper angle and more power.");
    }
  }
  if (criteria.arm_extension && metrics.shot_specific?.arm_extension != null) {
    if (metrics.shot_specific.arm_extension < criteria.arm_extension[0]) {
      tips.push("Extend your arm further at contact to maximise reach and power.");
    }
  }

  if (tips.length === 0) {
    tips.push("Good technique overall. Keep practising for consistency.");
  }

  return tips;
}

// ──────────────────── Public API ────────────────────

/**
 * Compute comprehensive technique metrics for a shot sequence.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 *   Array of per-frame keypoint arrays covering one stroke.
 * @param {string} sport - Sport key (badminton, table_tennis, tennis, pickleball).
 * @param {string} shotType - Shot type string from shotClassifier.
 * @param {number} fps - Video frame rate.
 * @returns {TechniqueMetrics}
 */
export function computeMetrics(poses, sport, shotType, fps) {
  const normalizedSport = sport?.toLowerCase().replace(/\s+/g, "_") ?? "";
  const normalizedShot = shotType?.toLowerCase().replace(/\s+/g, "_") ?? "";

  // Edge case: no data
  if (!poses || poses.length === 0) {
    return {
      elbow_angle_min: 0,
      elbow_angle_max: 0,
      elbow_angle_range: 0,
      wrist_height_min: 0,
      wrist_height_max: 0,
      wrist_height_range: 0,
      shoulder_rotation: 0,
      hip_rotation: 0,
      shot_specific: {},
      grade: "F",
      skill_level: "Beginner",
      overall_score: 0,
      feedback: ["Not enough pose data to analyse. Try uploading a clearer video."],
    };
  }

  const side = detectSide(poses);

  // --- Raw metrics ---
  const angles = elbowAngles(poses, side);
  const elbowMin = angles.length > 0 ? Math.min(...angles) : 0;
  const elbowMax = angles.length > 0 ? Math.max(...angles) : 0;
  const elbowRange = elbowMax - elbowMin;

  const heights = wristHeights(poses, side);
  const wristMin = heights.length > 0 ? Math.min(...heights) : 0;
  const wristMax = heights.length > 0 ? Math.max(...heights) : 0;
  const wristRange = wristMax - wristMin;

  const shoulderRot = peakShoulderRotation(poses);
  const hipRot = peakHipRotation(poses);

  const shotSpecific = shotSpecificMetrics(poses, side, normalizedSport, normalizedShot);

  const rawMetrics = {
    elbow_angle_min: Math.round(elbowMin * 10) / 10,
    elbow_angle_max: Math.round(elbowMax * 10) / 10,
    elbow_angle_range: Math.round(elbowRange * 10) / 10,
    wrist_height_min: Math.round(wristMin * 10) / 10,
    wrist_height_max: Math.round(wristMax * 10) / 10,
    wrist_height_range: Math.round(wristRange * 10) / 10,
    shoulder_rotation: shoulderRot,
    hip_rotation: hipRot,
    shot_specific: shotSpecific,
  };

  // --- Grading ---
  const sportCriteria = GRADE_CRITERIA[normalizedSport] ?? GRADE_CRITERIA.badminton;
  const criteria = sportCriteria[normalizedShot] ?? sportCriteria._default ?? {};

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const [metricKey, [idealMin, idealMax, weight]] of Object.entries(criteria)) {
    let value;
    if (metricKey in rawMetrics) {
      value = rawMetrics[metricKey];
    } else if (rawMetrics.shot_specific && metricKey in rawMetrics.shot_specific) {
      value = rawMetrics.shot_specific[metricKey];
    } else {
      continue;
    }
    totalWeightedScore += scoreMetric(value, idealMin, idealMax) * weight;
    totalWeight += weight;
  }

  const overallScore =
    totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 50;

  // Map score to grade and skill level
  let grade = "F";
  for (const [threshold, letter] of GRADE_THRESHOLDS) {
    if (overallScore >= threshold) { grade = letter; break; }
  }
  let skillLevel = "Beginner";
  for (const [threshold, level] of SKILL_THRESHOLDS) {
    if (overallScore >= threshold) { skillLevel = level; break; }
  }

  const feedback = generateFeedback({ ...rawMetrics, shot_specific: shotSpecific }, criteria);

  return {
    ...rawMetrics,
    grade,
    skill_level: skillLevel,
    overall_score: overallScore,
    feedback,
  };
}
