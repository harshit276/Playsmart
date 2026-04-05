/**
 * @module speedEstimator
 * Estimates racket / hand speed from pose keypoint sequences.
 * Tracks wrist displacement between frames and converts pixel-space
 * movement into approximate real-world km/h using sport-specific scaling.
 */

import { getKeypointByName, keypointDistance } from "./poseDetector.js";
import { SPEED_THRESHOLDS as SPEED_THRESHOLDS_CONFIG } from "./constants.js";

// ──────────────────── Speed category thresholds (km/h) ────────────────────

/**
 * Convert the { beginner, intermediate, advanced } object format from
 * constants.js into the [boundary1, boundary2, boundary3] array we use
 * internally.
 *
 * @param {Object} cfg
 * @returns {number[]}
 */
function toThresholdArray(cfg) {
  if (!cfg) return [40, 80, 140];
  return [cfg.beginner, cfg.intermediate, cfg.advanced];
}

/** Pre-built threshold arrays keyed by sport. */
const SPEED_THRESHOLDS = Object.fromEntries(
  Object.entries(SPEED_THRESHOLDS_CONFIG).map(([k, v]) => [k, toThresholdArray(v)])
);

/** Default if sport is unrecognised. */
const DEFAULT_THRESHOLDS = [40, 80, 140];

/**
 * Approximate pixel-to-metre conversion factors per sport.
 * These assume a "typical" video framing: the player's shoulder-to-hip
 * distance in pixels roughly equals these real-world centimetres.
 * We calibrate at runtime from the actual torso length when available.
 */
const REFERENCE_TORSO_CM = {
  badminton: 50,
  table_tennis: 45,
  tennis: 52,
  pickleball: 50,
};

const DEFAULT_TORSO_CM = 48;

// ──────────────────── Helpers ────────────────────

/**
 * Compute the average torso pixel length across a pose sequence to use as
 * a scale reference. Torso = distance from mid-shoulder to mid-hip.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @returns {number} Average torso length in pixels (0 if undetectable).
 */
function averageTorsoLength(poses) {
  let sum = 0;
  let count = 0;

  for (const frame of poses) {
    const ls = getKeypointByName(frame, "left_shoulder");
    const rs = getKeypointByName(frame, "right_shoulder");
    const lh = getKeypointByName(frame, "left_hip");
    const rh = getKeypointByName(frame, "right_hip");
    if (!ls || !rs || !lh || !rh) continue;

    const midShoulderX = (ls.x + rs.x) / 2;
    const midShoulderY = (ls.y + rs.y) / 2;
    const midHipX = (lh.x + rh.x) / 2;
    const midHipY = (lh.y + rh.y) / 2;

    const torso = Math.sqrt(
      (midShoulderX - midHipX) ** 2 + (midShoulderY - midHipY) ** 2
    );
    if (torso > 0) {
      sum += torso;
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Compute the dominant wrist's frame-to-frame pixel displacement series.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 * @returns {{ displacements: number[], side: "left"|"right" }}
 */
function wristDisplacements(poses) {
  if (!poses || poses.length < 2) return { displacements: [], side: "right" };

  // Decide dominant wrist by total movement
  let leftTotal = 0;
  let rightTotal = 0;
  for (let i = 1; i < poses.length; i++) {
    leftTotal += keypointDistance(
      getKeypointByName(poses[i - 1], "left_wrist"),
      getKeypointByName(poses[i], "left_wrist")
    );
    rightTotal += keypointDistance(
      getKeypointByName(poses[i - 1], "right_wrist"),
      getKeypointByName(poses[i], "right_wrist")
    );
  }

  const side = leftTotal > rightTotal ? "left" : "right";
  const wristName = `${side}_wrist`;

  const displacements = [];
  for (let i = 1; i < poses.length; i++) {
    const prev = getKeypointByName(poses[i - 1], wristName);
    const curr = getKeypointByName(poses[i], wristName);
    displacements.push(keypointDistance(prev, curr));
  }

  return { displacements, side };
}

/**
 * Map a speed value to a category string using sport-specific thresholds.
 *
 * @param {number} speedKmh
 * @param {number[]} thresholds
 * @returns {string}
 */
function categorise(speedKmh, thresholds) {
  if (speedKmh < thresholds[0]) return "Beginner";
  if (speedKmh < thresholds[1]) return "Intermediate";
  if (speedKmh < thresholds[2]) return "Advanced";
  return "Elite";
}

/**
 * Compute a percentile (0-100) of the speed within the sport's range.
 * Uses a simple linear mapping capped at the Elite threshold * 1.5.
 *
 * @param {number} speedKmh
 * @param {number[]} thresholds
 * @returns {number}
 */
function percentile(speedKmh, thresholds) {
  const maxRef = thresholds[2] * 1.5;
  const pct = (speedKmh / maxRef) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

// ──────────────────── Public API ────────────────────

/**
 * @typedef {Object} SpeedResult
 * @property {number} speed_kmh - Estimated peak hand speed in km/h.
 * @property {string} speed_category - "Beginner" | "Intermediate" | "Advanced" | "Elite".
 * @property {number} speed_percentile - 0-100 percentile within the sport.
 * @property {number} avg_speed_kmh - Average hand speed across the sequence.
 * @property {number} peak_frame - Frame index of the fastest movement.
 * @property {string} dominant_side - "left" or "right".
 */

/**
 * Estimate hand / racket speed from a pose sequence.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} poses
 *   Ordered array of per-frame keypoints.
 * @param {number} fps - Video frame rate (frames per second).
 * @param {string} sport - Sport key (badminton, table_tennis, tennis, pickleball).
 * @returns {SpeedResult}
 */
export function estimateSpeed(poses, fps, sport) {
  const normalizedSport = sport?.toLowerCase().replace(/\s+/g, "_") ?? "";
  const thresholds = SPEED_THRESHOLDS[normalizedSport] ?? DEFAULT_THRESHOLDS;

  // Edge cases
  if (!poses || poses.length < 2 || !fps || fps <= 0) {
    return {
      speed_kmh: 0,
      speed_category: "Beginner",
      speed_percentile: 0,
      avg_speed_kmh: 0,
      peak_frame: 0,
      dominant_side: "right",
    };
  }

  // 1. Compute a pixel-to-cm ratio from the player's torso
  const torsoPixels = averageTorsoLength(poses);
  const torsoCm = REFERENCE_TORSO_CM[normalizedSport] ?? DEFAULT_TORSO_CM;
  // Fallback: if torso is not visible, assume 200 pixels ~ torsoCm
  const pxPerCm = torsoPixels > 0 ? torsoPixels / torsoCm : 200 / torsoCm;

  // 2. Wrist displacement per frame (in pixels)
  const { displacements, side } = wristDisplacements(poses);
  if (displacements.length === 0) {
    return {
      speed_kmh: 0,
      speed_category: "Beginner",
      speed_percentile: 0,
      avg_speed_kmh: 0,
      peak_frame: 0,
      dominant_side: side,
    };
  }

  // 3. Convert pixel displacement to real-world speed
  //    displacement_cm = displacement_px / pxPerCm
  //    speed_cm_per_s  = displacement_cm * fps
  //    speed_km_h      = speed_cm_per_s * 0.036
  const factor = (fps / pxPerCm) * 0.036; // px -> km/h in one step

  const speedsKmh = displacements.map((d) => d * factor);

  // Peak speed (use max of a 3-frame rolling average to reduce noise)
  let peakSpeed = 0;
  let peakFrame = 0;
  for (let i = 0; i < speedsKmh.length; i++) {
    // 3-frame window average (or fewer at edges)
    const windowStart = Math.max(0, i - 1);
    const windowEnd = Math.min(speedsKmh.length - 1, i + 1);
    let windowSum = 0;
    let windowCount = 0;
    for (let j = windowStart; j <= windowEnd; j++) {
      windowSum += speedsKmh[j];
      windowCount++;
    }
    const avgWindow = windowSum / windowCount;
    if (avgWindow > peakSpeed) {
      peakSpeed = avgWindow;
      peakFrame = i + 1; // +1 because displacements[i] is between frame i and i+1
    }
  }

  const avgSpeed =
    speedsKmh.reduce((a, b) => a + b, 0) / speedsKmh.length;

  const peakRounded = Math.round(peakSpeed * 10) / 10;
  const avgRounded = Math.round(avgSpeed * 10) / 10;

  return {
    speed_kmh: peakRounded,
    speed_category: categorise(peakRounded, thresholds),
    speed_percentile: percentile(peakRounded, thresholds),
    avg_speed_kmh: avgRounded,
    peak_frame: peakFrame,
    dominant_side: side,
  };
}
