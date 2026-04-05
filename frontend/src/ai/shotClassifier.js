/**
 * @module shotClassifier
 * Classifies racket sport shots from pose keypoint sequences using
 * angle-based heuristics. Supports badminton, table tennis, tennis, and
 * pickleball. No model files required -- pure deterministic logic.
 */

import { getKeypointByName, calculateAngle, keypointDistance } from "./poseDetector.js";
import { SHOT_TYPES } from "./constants.js";

// ──────────────────── Helper utilities ────────────────────

/**
 * Safely extract a named keypoint; returns null when missing or low-confidence.
 * @param {import("./poseDetector.js").Keypoint[]} kps
 * @param {string} name
 * @returns {import("./poseDetector.js").Keypoint|null}
 */
const kp = (kps, name) => getKeypointByName(kps, name);

/**
 * Determine the dominant (playing) side of the body.
 * Heuristic: the wrist that moves the most across the pose sequence.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @returns {"left"|"right"}
 */
function detectDominantSide(poses) {
  if (!poses || poses.length < 2) return "right";

  let leftDist = 0;
  let rightDist = 0;
  for (let i = 1; i < poses.length; i++) {
    const prevLW = kp(poses[i - 1], "left_wrist");
    const currLW = kp(poses[i], "left_wrist");
    const prevRW = kp(poses[i - 1], "right_wrist");
    const currRW = kp(poses[i], "right_wrist");
    leftDist += keypointDistance(prevLW, currLW);
    rightDist += keypointDistance(prevRW, currRW);
  }
  return leftDist > rightDist ? "left" : "right";
}

/**
 * Get the "peak" frame -- the frame where the dominant wrist is highest (lowest y).
 * This is typically the contact / swing apex.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @param {"left"|"right"} side
 * @returns {number} Frame index.
 */
function getPeakFrameIndex(poses, side) {
  let bestIdx = 0;
  let bestY = Infinity;
  const wristName = `${side}_wrist`;
  for (let i = 0; i < poses.length; i++) {
    const w = kp(poses[i], wristName);
    if (w && w.y < bestY) {
      bestY = w.y;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Compute aggregate features from a pose sequence for shot classification.
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @returns {Object} Feature dictionary.
 */
function extractFeatures(poses) {
  if (!poses || poses.length === 0) return {};

  const side = detectDominantSide(poses);
  const peakIdx = getPeakFrameIndex(poses, side);
  const peak = poses[peakIdx];
  const prefix = side;
  const otherPrefix = side === "right" ? "left" : "right";

  const shoulder = kp(peak, `${prefix}_shoulder`);
  const elbow = kp(peak, `${prefix}_elbow`);
  const wrist = kp(peak, `${prefix}_wrist`);
  const hip = kp(peak, `${prefix}_hip`);
  const otherShoulder = kp(peak, `${otherPrefix}_shoulder`);
  const otherHip = kp(peak, `${otherPrefix}_hip`);
  const nose = kp(peak, "nose");

  // Elbow angle at peak
  const elbowAngle = calculateAngle(shoulder, elbow, wrist);

  // Shoulder-elbow-wrist alignment (arm extension)
  const armExtension = calculateAngle(shoulder, elbow, wrist);

  // Wrist height relative to shoulder (negative = above shoulder)
  const wristAboveShoulder =
    shoulder && wrist ? shoulder.y - wrist.y : 0;

  // Wrist height relative to nose
  const wristAboveNose = nose && wrist ? nose.y - wrist.y : 0;

  // Shoulder rotation (angle between shoulder line and horizontal)
  let shoulderRotation = 0;
  if (shoulder && otherShoulder) {
    const dx = shoulder.x - otherShoulder.x;
    const dy = shoulder.y - otherShoulder.y;
    shoulderRotation = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  }

  // Hip rotation
  let hipRotation = 0;
  if (hip && otherHip) {
    const dx = hip.x - otherHip.x;
    const dy = hip.y - otherHip.y;
    hipRotation = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  }

  // Wrist speed (pixel displacement over the sequence)
  let maxWristSpeed = 0;
  const wristName = `${prefix}_wrist`;
  for (let i = 1; i < poses.length; i++) {
    const prev = kp(poses[i - 1], wristName);
    const curr = kp(poses[i], wristName);
    const dist = keypointDistance(prev, curr);
    if (dist > maxWristSpeed) maxWristSpeed = dist;
  }

  // Wrist-hip vertical distance at peak (indicates low/high shot)
  const wristHipDist = hip && wrist ? hip.y - wrist.y : 0;

  // Is the wrist on the backhand side? (crosses body midline)
  let isBackhandSide = false;
  if (shoulder && wrist) {
    if (side === "right") {
      isBackhandSide = wrist.x < shoulder.x;
    } else {
      isBackhandSide = wrist.x > shoulder.x;
    }
  }

  return {
    side,
    peakIdx,
    elbowAngle,
    armExtension,
    wristAboveShoulder,
    wristAboveNose,
    shoulderRotation,
    hipRotation,
    maxWristSpeed,
    wristHipDist,
    isBackhandSide,
  };
}

// ──────────────────── Sport-specific classifiers ────────────────────

/**
 * Score each badminton shot type based on extracted features.
 * @param {Object} feat - Feature dictionary from extractFeatures.
 * @returns {Record<string, number>} Scores per shot type (higher = more likely).
 */
function scoreBadminton(feat) {
  const scores = {};

  // Smash: high contact, fast wrist, extended arm, steep angle
  scores.smash =
    (feat.wristAboveShoulder > 80 ? 30 : 0) +
    (feat.maxWristSpeed > 60 ? 25 : feat.maxWristSpeed > 40 ? 15 : 0) +
    (feat.elbowAngle > 140 ? 20 : feat.elbowAngle > 120 ? 10 : 0) +
    (feat.shoulderRotation > 15 ? 10 : 0);

  // Clear: very high contact, moderate speed, arm fully extended overhead
  scores.clear =
    (feat.wristAboveNose > 40 ? 30 : 0) +
    (feat.wristAboveShoulder > 60 ? 20 : 0) +
    (feat.elbowAngle > 150 ? 20 : feat.elbowAngle > 130 ? 10 : 0) +
    (feat.maxWristSpeed > 25 && feat.maxWristSpeed < 55 ? 15 : 0);

  // Drop: high contact, slow wrist, moderate arm extension
  scores.drop =
    (feat.wristAboveShoulder > 40 ? 25 : 0) +
    (feat.maxWristSpeed < 30 ? 25 : feat.maxWristSpeed < 45 ? 10 : 0) +
    (feat.elbowAngle > 100 && feat.elbowAngle < 150 ? 20 : 0);

  // Drive: shoulder-level contact, fast wrist, horizontal arm
  scores.drive =
    (Math.abs(feat.wristAboveShoulder) < 40 ? 25 : 0) +
    (feat.maxWristSpeed > 35 ? 20 : 0) +
    (feat.elbowAngle > 100 && feat.elbowAngle < 155 ? 20 : 0) +
    (feat.shoulderRotation < 20 ? 10 : 0);

  // Net shot: wrist well below shoulder, slow, bent arm
  scores.net_shot =
    (feat.wristAboveShoulder < 0 ? 30 : feat.wristAboveShoulder < 20 ? 15 : 0) +
    (feat.maxWristSpeed < 25 ? 20 : 0) +
    (feat.elbowAngle < 120 ? 15 : 0) +
    (feat.wristHipDist < 30 ? 10 : 0);

  // Serve: moderate wrist height, moderate speed, low hip rotation
  scores.serve =
    (feat.wristAboveShoulder > 10 && feat.wristAboveShoulder < 60 ? 20 : 0) +
    (feat.maxWristSpeed > 15 && feat.maxWristSpeed < 45 ? 15 : 0) +
    (feat.hipRotation < 10 ? 15 : 0) +
    (feat.elbowAngle > 90 && feat.elbowAngle < 140 ? 10 : 0);

  // Lift: low contact point, upward motion, moderate speed
  scores.lift =
    (feat.wristAboveShoulder < 10 ? 25 : 0) +
    (feat.wristHipDist < 20 ? 20 : 0) +
    (feat.maxWristSpeed > 15 && feat.maxWristSpeed < 40 ? 15 : 0) +
    (feat.elbowAngle < 130 ? 10 : 0);

  // Backhand: wrist crosses body midline
  scores.backhand =
    (feat.isBackhandSide ? 35 : 0) +
    (feat.maxWristSpeed > 20 ? 15 : 0) +
    (feat.shoulderRotation > 10 ? 10 : 0) +
    (feat.elbowAngle > 80 && feat.elbowAngle < 150 ? 10 : 0);

  return scores;
}

/**
 * Score each table tennis shot type.
 * @param {Object} feat
 * @returns {Record<string, number>}
 */
function scoreTableTennis(feat) {
  const scores = {};

  // Forehand drive: dominant side, moderate speed, wrist near shoulder height
  scores.forehand_drive =
    (!feat.isBackhandSide ? 25 : 0) +
    (feat.maxWristSpeed > 20 && feat.maxWristSpeed < 50 ? 20 : 0) +
    (Math.abs(feat.wristAboveShoulder) < 30 ? 20 : 0) +
    (feat.elbowAngle > 90 && feat.elbowAngle < 140 ? 15 : 0);

  // Backhand drive
  scores.backhand_drive =
    (feat.isBackhandSide ? 25 : 0) +
    (feat.maxWristSpeed > 20 && feat.maxWristSpeed < 50 ? 20 : 0) +
    (Math.abs(feat.wristAboveShoulder) < 30 ? 20 : 0) +
    (feat.elbowAngle > 80 && feat.elbowAngle < 130 ? 15 : 0);

  // Forehand loop: dominant side, fast wrist, upward arc, elbow bent then extended
  scores.forehand_loop =
    (!feat.isBackhandSide ? 20 : 0) +
    (feat.maxWristSpeed > 40 ? 25 : feat.maxWristSpeed > 30 ? 15 : 0) +
    (feat.wristAboveShoulder > 10 ? 15 : 0) +
    (feat.shoulderRotation > 10 ? 10 : 0) +
    (feat.elbowAngle > 100 ? 10 : 0);

  // Forehand counter: fast, close to table, short stroke
  scores.forehand_counter =
    (!feat.isBackhandSide ? 20 : 0) +
    (feat.maxWristSpeed > 30 ? 20 : 0) +
    (feat.elbowAngle > 70 && feat.elbowAngle < 120 ? 20 : 0) +
    (Math.abs(feat.wristAboveShoulder) < 20 ? 15 : 0);

  // Backhand counter
  scores.backhand_counter =
    (feat.isBackhandSide ? 20 : 0) +
    (feat.maxWristSpeed > 30 ? 20 : 0) +
    (feat.elbowAngle > 70 && feat.elbowAngle < 120 ? 20 : 0) +
    (Math.abs(feat.wristAboveShoulder) < 20 ? 15 : 0);

  // Chop: defensive, downward motion, wrist drops below starting position
  scores.chop =
    (feat.wristAboveShoulder < 0 ? 25 : 0) +
    (feat.maxWristSpeed > 15 && feat.maxWristSpeed < 40 ? 20 : 0) +
    (feat.elbowAngle > 100 && feat.elbowAngle < 160 ? 15 : 0) +
    (feat.hipRotation < 10 ? 10 : 0);

  // Serve: moderate motion, low hip rotation, moderate elbow angle
  scores.serve =
    (feat.maxWristSpeed > 10 && feat.maxWristSpeed < 35 ? 20 : 0) +
    (feat.hipRotation < 10 ? 15 : 0) +
    (feat.wristAboveShoulder > -10 && feat.wristAboveShoulder < 30 ? 15 : 0) +
    (feat.elbowAngle > 80 && feat.elbowAngle < 130 ? 10 : 0);

  // Smash: high contact, very fast, extended arm
  scores.smash =
    (feat.wristAboveShoulder > 30 ? 25 : 0) +
    (feat.maxWristSpeed > 50 ? 25 : feat.maxWristSpeed > 35 ? 15 : 0) +
    (feat.elbowAngle > 130 ? 15 : 0) +
    (feat.shoulderRotation > 10 ? 10 : 0);

  // Push: gentle, short motion, wrist below shoulder
  scores.push =
    (feat.maxWristSpeed < 20 ? 25 : 0) +
    (feat.wristAboveShoulder < 10 ? 20 : 0) +
    (feat.elbowAngle > 70 && feat.elbowAngle < 120 ? 15 : 0);

  return scores;
}

/**
 * Score each tennis shot type.
 * @param {Object} feat
 * @returns {Record<string, number>}
 */
function scoreTennis(feat) {
  const scores = {};

  scores.forehand =
    (!feat.isBackhandSide ? 25 : 0) +
    (feat.maxWristSpeed > 30 ? 20 : 0) +
    (feat.shoulderRotation > 10 ? 15 : 0) +
    (feat.elbowAngle > 100 && feat.elbowAngle < 170 ? 15 : 0);

  scores.backhand =
    (feat.isBackhandSide ? 25 : 0) +
    (feat.maxWristSpeed > 25 ? 20 : 0) +
    (feat.shoulderRotation > 10 ? 15 : 0) +
    (feat.elbowAngle > 90 && feat.elbowAngle < 160 ? 15 : 0);

  scores.serve =
    (feat.wristAboveNose > 30 ? 30 : 0) +
    (feat.wristAboveShoulder > 70 ? 20 : 0) +
    (feat.maxWristSpeed > 40 ? 15 : 0) +
    (feat.elbowAngle > 140 ? 10 : 0);

  scores.volley =
    (feat.maxWristSpeed < 30 ? 20 : 0) +
    (Math.abs(feat.wristAboveShoulder) < 30 ? 20 : 0) +
    (feat.elbowAngle > 80 && feat.elbowAngle < 130 ? 20 : 0);

  scores.lob =
    (feat.wristAboveShoulder > 20 ? 20 : 0) +
    (feat.maxWristSpeed > 15 && feat.maxWristSpeed < 35 ? 20 : 0) +
    (feat.elbowAngle > 120 ? 15 : 0);

  scores.drop_shot =
    (feat.maxWristSpeed < 20 ? 25 : 0) +
    (feat.wristAboveShoulder < 20 ? 20 : 0) +
    (feat.elbowAngle > 80 && feat.elbowAngle < 130 ? 15 : 0);

  scores.smash =
    (feat.wristAboveNose > 40 ? 30 : 0) +
    (feat.maxWristSpeed > 50 ? 25 : 0) +
    (feat.elbowAngle > 140 ? 15 : 0);

  return scores;
}

/**
 * Score each pickleball shot type.
 * @param {Object} feat
 * @returns {Record<string, number>}
 */
function scorePickleball(feat) {
  const scores = {};

  scores.dink =
    (feat.maxWristSpeed < 15 ? 25 : 0) +
    (feat.wristAboveShoulder < 0 ? 20 : 0) +
    (feat.elbowAngle > 80 && feat.elbowAngle < 130 ? 15 : 0);

  scores.drive =
    (feat.maxWristSpeed > 30 ? 25 : 0) +
    (Math.abs(feat.wristAboveShoulder) < 30 ? 20 : 0) +
    (feat.elbowAngle > 110 && feat.elbowAngle < 160 ? 15 : 0);

  scores.drop_shot =
    (feat.maxWristSpeed < 20 ? 20 : 0) +
    (feat.wristAboveShoulder > 0 && feat.wristAboveShoulder < 30 ? 20 : 0) +
    (feat.elbowAngle > 90 && feat.elbowAngle < 140 ? 15 : 0);

  scores.serve =
    (feat.maxWristSpeed > 15 && feat.maxWristSpeed < 40 ? 20 : 0) +
    (feat.hipRotation < 10 ? 15 : 0) +
    (feat.wristAboveShoulder < 20 ? 15 : 0);

  scores.volley =
    (feat.maxWristSpeed < 25 ? 20 : 0) +
    (Math.abs(feat.wristAboveShoulder) < 25 ? 20 : 0) +
    (feat.elbowAngle > 80 && feat.elbowAngle < 130 ? 15 : 0);

  scores.lob =
    (feat.wristAboveShoulder > 10 ? 20 : 0) +
    (feat.maxWristSpeed > 10 && feat.maxWristSpeed < 30 ? 20 : 0) +
    (feat.elbowAngle > 120 ? 15 : 0);

  scores.smash =
    (feat.wristAboveNose > 30 ? 30 : 0) +
    (feat.maxWristSpeed > 40 ? 25 : 0) +
    (feat.elbowAngle > 140 ? 15 : 0);

  return scores;
}

/** Map sport key to its scoring function. */
const SPORT_SCORERS = {
  badminton: scoreBadminton,
  table_tennis: scoreTableTennis,
  tennis: scoreTennis,
  pickleball: scorePickleball,
};

// ──────────────────── Main classification API ────────────────────

/**
 * @typedef {Object} ClassificationResult
 * @property {string} shot_type - Best-matching shot name.
 * @property {number} confidence - 0-1 confidence for the top shot.
 * @property {Record<string, number>} all_scores - Raw scores for every shot type.
 * @property {Object} features - Extracted features (useful for debugging).
 */

/**
 * Classify a shot from a sequence of pose frames.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 *   Array of per-frame keypoint arrays (typically 5-30 frames covering one stroke).
 * @param {string} sport - One of: badminton, table_tennis, tennis, pickleball.
 * @returns {ClassificationResult}
 */
export function classifyShot(poses, sport) {
  const normalizedSport = sport?.toLowerCase().replace(/\s+/g, "_") ?? "";
  const scorer = SPORT_SCORERS[normalizedSport];

  if (!scorer) {
    return {
      shot_type: "unknown",
      confidence: 0,
      all_scores: {},
      features: {},
    };
  }

  if (!poses || poses.length === 0) {
    const emptyScores = {};
    for (const st of SHOT_TYPES[normalizedSport] ?? []) emptyScores[st] = 0;
    return { shot_type: "unknown", confidence: 0, all_scores: emptyScores, features: {} };
  }

  const features = extractFeatures(poses);
  const rawScores = scorer(features);

  // Normalise scores to 0-1 confidence range
  const totalScore = Object.values(rawScores).reduce((s, v) => s + v, 0);
  const allScores = {};
  for (const [k, v] of Object.entries(rawScores)) {
    allScores[k] = totalScore > 0 ? v / totalScore : 0;
  }

  // Pick top shot
  let bestShot = "unknown";
  let bestConf = 0;
  for (const [k, v] of Object.entries(allScores)) {
    if (v > bestConf) {
      bestConf = v;
      bestShot = k;
    }
  }

  return {
    shot_type: bestShot,
    confidence: Math.round(bestConf * 1000) / 1000,
    all_scores: allScores,
    features,
  };
}
