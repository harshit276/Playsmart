/**
 * @module videoProcessor
 * Main video analysis pipeline that runs entirely in the browser.
 * Extracts frames from video using HTML5 canvas, runs MoveNet pose detection,
 * detects individual shot moments via motion peaks, classifies each shot
 * separately, computes metrics, and returns a multi-shot report.
 *
 * Supports:
 * - Single player, single shot type videos
 * - 2-3 minute match videos with multiple shot types
 */

import { initModel, detectPose, getKeypointByName, calculateAngle, keypointDistance, countVisibleKeypoints, detectMultiplePeople, initMultiPoseModel } from "./poseDetector.js";
import {
  SUPPORTED_SPORTS,
  SHOT_TYPES,
  SPEED_THRESHOLDS,
  SKILL_LEVEL_THRESHOLDS,
  SPEED_SKILL_BOOST,
  GRADE_THRESHOLDS,
  METRIC_WEIGHTS,
  MOTION_ACTIVE_THRESHOLD,
  MIN_SEGMENT_FRAMES,
  SEGMENT_MERGE_GAP,
  MODEL_INPUT_SIZE,
  QUICK_MODEL_INPUT_SIZE,
  MIN_KEYPOINT_SCORE,
} from "./constants.js";

// ─── Frame Extraction ───────────────────────────────────────────────────────

/**
 * Compute the crop region for a target player quadrant.
 *
 * @param {number} videoWidth
 * @param {number} videoHeight
 * @param {string} targetPlayer - "auto"|"top-left"|"top-right"|"bottom-left"|"bottom-right"
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
function getCropRegion(videoWidth, videoHeight, targetPlayer) {
  const halfW = videoWidth / 2;
  const halfH = videoHeight / 2;

  switch (targetPlayer) {
    case "top-left":
      return { sx: 0, sy: 0, sw: halfW, sh: halfH };
    case "top-right":
      return { sx: halfW, sy: 0, sw: halfW, sh: halfH };
    case "bottom-left":
      return { sx: 0, sy: halfH, sw: halfW, sh: halfH };
    case "bottom-right":
      return { sx: halfW, sy: halfH, sw: halfW, sh: halfH };
    case "left":
      return { sx: 0, sy: 0, sw: halfW, sh: videoHeight };
    case "right":
      return { sx: halfW, sy: 0, sw: halfW, sh: videoHeight };
    case "top":
      return { sx: 0, sy: 0, sw: videoWidth, sh: halfH };
    case "bottom":
      return { sx: 0, sy: halfH, sw: videoWidth, sh: halfH };
    default:
      return { sx: 0, sy: 0, sw: videoWidth, sh: videoHeight };
  }
}

/**
 * Extract frames from a video file at regular intervals using an offscreen
 * HTML5 video element and canvas. Frame count scales with video duration.
 *
 * @param {File} videoFile - Video file from an <input> element
 * @param {number} [targetFrameCount=30] - Number of frames to extract
 * @param {string} [targetPlayer="auto"] - Player quadrant to crop
 * @param {number} [canvasSize=256] - Canvas resolution for model input
 * @returns {Promise<{ frames: ImageData[], timestamps: number[], duration: number,
 *   fps: number, width: number, height: number }>}
 */
async function extractFrames(videoFile, targetFrameCount = 30, targetPlayer = "auto", canvasSize = MODEL_INPUT_SIZE, customCropBox = null) {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(videoFile);
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;

  // Wait for metadata so we know duration and dimensions
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Failed to load video. The file may be corrupt or unsupported."));
    video.load();
  });

  const duration = video.duration;
  if (!duration || !isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Could not determine video duration. The file may be corrupt.");
  }

  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  const interval = duration / targetFrameCount;
  let crop;
  if (customCropBox) {
    // Clamp normalized box to [0,1] and convert to pixel coords
    const cx = Math.max(0, Math.min(1, customCropBox.x));
    const cy = Math.max(0, Math.min(1, customCropBox.y));
    const cw = Math.max(0, Math.min(1 - cx, customCropBox.width));
    const ch = Math.max(0, Math.min(1 - cy, customCropBox.height));
    crop = {
      sx: cx * videoWidth,
      sy: cy * videoHeight,
      sw: Math.max(1, cw * videoWidth),
      sh: Math.max(1, ch * videoHeight),
    };
  } else {
    crop = getCropRegion(videoWidth, videoHeight, targetPlayer);
  }

  // Canvas sized to model input (smaller for quick mode = faster)
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext("2d");

  const frames = [];
  const timestamps = [];

  for (let i = 0; i < targetFrameCount; i++) {
    const time = Math.min(i * interval, duration - 0.01);
    video.currentTime = time;
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });

    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvasSize, canvasSize);
    const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
    frames.push(imageData);
    timestamps.push(time);
  }

  URL.revokeObjectURL(objectUrl);

  return {
    frames,
    timestamps,
    duration,
    fps: targetFrameCount / duration,
    width: videoWidth,
    height: videoHeight,
  };
}

// ─── Motion & Segment Detection ─────────────────────────────────────────────

/**
 * Compute a motion score between two consecutive ImageData frames using
 * grayscale pixel differencing.
 *
 * @param {ImageData} frame1
 * @param {ImageData} frame2
 * @returns {number} Average absolute pixel difference (0-255 scale).
 */
function computeMotionScore(frame1, frame2) {
  const data1 = frame1.data;
  const data2 = frame2.data;
  let totalDiff = 0;
  const pixelCount = data1.length / 4;

  for (let i = 0; i < data1.length; i += 4) {
    const gray1 = (data1[i] + data1[i + 1] + data1[i + 2]) / 3;
    const gray2 = (data2[i] + data2[i + 1] + data2[i + 2]) / 3;
    totalDiff += Math.abs(gray1 - gray2);
  }

  return totalDiff / pixelCount;
}

/**
 * Detect active segments from motion scores.
 *
 * @param {number[]} motionScores - Per-frame motion scores
 * @param {number[]} timestamps - Corresponding timestamps
 * @returns {{ segments: { start: number, end: number, startFrame: number, endFrame: number }[],
 *   activeFrameCount: number, powerMoments: number }}
 */
function detectSegments(motionScores, timestamps) {
  const active = motionScores.map((s) => s > MOTION_ACTIVE_THRESHOLD);
  const rawSegments = [];
  let segStart = -1;

  for (let i = 0; i < active.length; i++) {
    if (active[i] && segStart === -1) {
      segStart = i;
    } else if (!active[i] && segStart !== -1) {
      rawSegments.push({ startFrame: segStart, endFrame: i - 1 });
      segStart = -1;
    }
  }
  if (segStart !== -1) {
    rawSegments.push({ startFrame: segStart, endFrame: active.length - 1 });
  }

  const merged = [];
  for (const seg of rawSegments) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (seg.startFrame - prev.endFrame <= SEGMENT_MERGE_GAP) {
        prev.endFrame = seg.endFrame;
        continue;
      }
    }
    merged.push({ ...seg });
  }

  const segments = merged
    .filter((s) => s.endFrame - s.startFrame + 1 >= MIN_SEGMENT_FRAMES)
    .map((s) => ({
      start: timestamps[s.startFrame] || 0,
      end: timestamps[s.endFrame] || 0,
      startFrame: s.startFrame,
      endFrame: s.endFrame,
    }));

  const activeFrameCount = active.filter(Boolean).length;
  const highThreshold = MOTION_ACTIVE_THRESHOLD * 3;
  const powerMoments = motionScores.filter((s) => s > highThreshold).length;

  return { segments, activeFrameCount, powerMoments };
}

// ─── Utility Helpers ───────────────────────────────────────────────────────

/**
 * Shorthand for getKeypointByName.
 * @param {import("./poseDetector.js").Keypoint[]} kps
 * @param {string} name
 * @returns {import("./poseDetector.js").Keypoint|null}
 */
function getKp(kps, name) {
  return getKeypointByName(kps, name);
}

/**
 * Euclidean distance between two keypoints.
 * @param {import("./poseDetector.js").Keypoint} a
 * @param {import("./poseDetector.js").Keypoint} b
 * @returns {number}
 */
function kpDist(a, b) {
  if (!a || !b) return 0;
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** @param {number[]} arr */
const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

/** @param {number[]} arr */
const stddev = (arr) => {
  if (arr.length < 2) return 0;
  const mean = avg(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length);
};

/**
 * Clamp a number between min and max.
 * @param {number} value
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

// ─── Quality Gates & Camera Angle ──────────────────────────────────────────

/**
 * Raw keypoint lookup that ignores the global MIN_KEYPOINT_SCORE threshold so
 * quality-gating can apply its own stricter cutoff.
 *
 * @param {import("./poseDetector.js").Keypoint[]} kps
 * @param {string} name
 * @returns {import("./poseDetector.js").Keypoint|null}
 */
function getRawKp(kps, name) {
  if (!kps) return null;
  const kp = kps.find((k) => k.name === name);
  return kp || null;
}

/**
 * Decide whether a single-frame pose is high-enough quality to trust for
 * classification. Requires torso + dominant arm to be visible at >0.4 score
 * and body proportions to be within a plausible range.
 *
 * Keypoint coordinates are in canvas pixels (0..canvasSize, typically 256),
 * so we normalize against canvasSize when checking proportional thresholds.
 *
 * @param {import("./poseDetector.js").Keypoint[]} keypoints
 * @param {"right"|"left"} dominantHand
 * @param {number} [canvasSize=MODEL_INPUT_SIZE]
 * @returns {boolean}
 */
function isQualityFrame(keypoints, dominantHand, canvasSize = MODEL_INPUT_SIZE) {
  if (!keypoints) return false;

  const required = [
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    `${dominantHand}_wrist`,
    `${dominantHand}_elbow`,
  ];

  for (const name of required) {
    const kp = getRawKp(keypoints, name);
    if (!kp || (kp.score || 0) < 0.4) return false;
  }

  const ls = getRawKp(keypoints, "left_shoulder");
  const rs = getRawKp(keypoints, "right_shoulder");
  const lh = getRawKp(keypoints, "left_hip");

  if (ls && rs && lh) {
    const shoulderWidthN = Math.abs(ls.x - rs.x) / canvasSize;
    const torsoHeightN = Math.abs(ls.y - lh.y) / canvasSize;
    if (torsoHeightN < 0.05 || torsoHeightN > 0.9) return false;
    if (shoulderWidthN < 0.02) return false;
  }

  return true;
}

/**
 * Guess whether the video is shot from the front, side, or angled based on
 * the average shoulder width relative to the canvas size.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @param {number} [canvasSize=MODEL_INPUT_SIZE]
 * @returns {"front"|"side"|"angled"|"unknown"}
 */
function detectCameraAngle(allKeypoints, canvasSize = MODEL_INPUT_SIZE) {
  const shoulderWidths = [];
  for (const kps of allKeypoints) {
    const ls = getRawKp(kps, "left_shoulder");
    const rs = getRawKp(kps, "right_shoulder");
    if (ls && rs && (ls.score || 0) > 0.4 && (rs.score || 0) > 0.4) {
      shoulderWidths.push(Math.abs(ls.x - rs.x) / canvasSize);
    }
  }
  if (shoulderWidths.length === 0) return "unknown";
  const avgWidth = shoulderWidths.reduce((a, b) => a + b, 0) / shoulderWidths.length;
  if (avgWidth > 0.1) return "front";
  if (avgWidth < 0.05) return "side";
  return "angled";
}

// ─── Dominant Hand Detection ───────────────────────────────────────────────

/**
 * Detect which hand is the dominant (racket) hand by comparing cumulative
 * wrist motion across all frames. The hand that moves more is the playing hand.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @returns {"right"|"left"}
 */
function detectDominantHand(allKeypoints) {
  let leftMotion = 0;
  let rightMotion = 0;
  const leftMotions = [];
  const rightMotions = [];

  for (let i = 1; i < allKeypoints.length; i++) {
    const prevLW = getKp(allKeypoints[i - 1], "left_wrist");
    const currLW = getKp(allKeypoints[i], "left_wrist");
    const prevRW = getKp(allKeypoints[i - 1], "right_wrist");
    const currRW = getKp(allKeypoints[i], "right_wrist");

    const ld = (prevLW && currLW) ? kpDist(prevLW, currLW) : 0;
    const rd = (prevRW && currRW) ? kpDist(prevRW, currRW) : 0;

    leftMotion += ld;
    rightMotion += rd;
    leftMotions.push(ld);
    rightMotions.push(rd);
  }

  const cumulativeResult = rightMotion > leftMotion ? "right" : "left";

  // Cross-validate: at the fastest frame(s), which wrist moved more?
  // The playing hand should be the fastest at impact points.
  if (leftMotions.length > 0) {
    const wristSpeeds = leftMotions.map((l, i) => l + rightMotions[i]);
    const fastestIdx = wristSpeeds.indexOf(Math.max(...wristSpeeds));
    const fastLeft = leftMotions[fastestIdx] || 0;
    const fastRight = rightMotions[fastestIdx] || 0;

    const peakResult = fastRight > fastLeft ? "right" : "left";

    // If the fastest frame contradicts cumulative AND the margin is close (<20%), trust fastest frame
    if (peakResult !== cumulativeResult) {
      const ratio = Math.min(leftMotion, rightMotion) / Math.max(leftMotion, rightMotion);
      if (ratio > 0.8) {
        return peakResult;
      }
    }
  }

  return cumulativeResult;
}

// ─── Shot Moment Detection ─────────────────────────────────────────────────

/**
 * @typedef {Object} ShotPeak
 * @property {number} index - Frame index of the peak
 * @property {number} speed - Wrist speed at peak
 * @property {number} time - Timestamp of the peak
 */

/**
 * Find individual shot moments by detecting motion peaks in the dominant
 * wrist speed. A shot is defined as a local maximum in wrist speed that
 * exceeds a threshold (1.5x average speed) with at least 0.5s between peaks.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @param {number[]} timestamps
 * @param {"right"|"left"} dominantHand
 * @returns {ShotPeak[]}
 */
function findShotMoments(allKeypoints, timestamps, dominantHand) {
  const wristName = dominantHand === "right" ? "right_wrist" : "left_wrist";

  // Calculate wrist speed for each frame pair
  const wristSpeeds = [];
  for (let i = 1; i < allKeypoints.length; i++) {
    const prev = getKp(allKeypoints[i - 1], wristName);
    const curr = getKp(allKeypoints[i], wristName);
    const dt = timestamps[i] - timestamps[i - 1];

    if (prev && curr && dt > 0) {
      const speed = kpDist(prev, curr) / dt;
      wristSpeeds.push({ index: i, speed, time: timestamps[i] });
    } else {
      wristSpeeds.push({ index: i, speed: 0, time: timestamps[i] });
    }
  }

  if (wristSpeeds.length < 3) return [];

  // Compute threshold: shots are faster than average
  const avgSpeed = avg(wristSpeeds.map((w) => w.speed));
  const threshold = avgSpeed * 2.0;

  // Adaptive minimum gap between peaks based on video duration
  const duration = timestamps.length > 0 ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
  const minGap = duration < 15 ? 2.0 : duration < 60 ? 1.0 : 0.5;

  // Find peaks (local maxima above threshold)
  const peaks = [];
  for (let i = 1; i < wristSpeeds.length - 1; i++) {
    if (
      wristSpeeds[i].speed > threshold &&
      wristSpeeds[i].speed >= wristSpeeds[i - 1].speed &&
      wristSpeeds[i].speed >= wristSpeeds[i + 1].speed
    ) {
      if (peaks.length === 0 || wristSpeeds[i].time - peaks[peaks.length - 1].time > minGap) {
        peaks.push(wristSpeeds[i]);
      }
    }
  }

  // Cap max shots based on video duration to avoid over-detection
  const maxShots = duration < 15 ? 3 : duration < 30 ? 6 : duration < 120 ? 15 : 30;
  if (peaks.length > maxShots) {
    peaks.sort((a, b) => b.speed - a.speed);
    peaks.length = maxShots;
    peaks.sort((a, b) => a.time - b.time); // restore chronological order
  }

  // If no peaks found (e.g. single slow shot), treat the fastest frame as one shot
  if (peaks.length === 0 && wristSpeeds.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < wristSpeeds.length; i++) {
      if (wristSpeeds[i].speed > wristSpeeds[maxIdx].speed) maxIdx = i;
    }
    if (wristSpeeds[maxIdx].speed > 0) {
      peaks.push(wristSpeeds[maxIdx]);
    }
  }

  return peaks;
}

// ─── Backhand Detection (camera-aware) ─────────────────────────────────────

/**
 * Camera-aware forehand/backhand detector. Uses body midline on front views
 * and elbow-vs-wrist vertical offset as a proxy on side views.
 *
 * Keypoints are in canvas pixels (typically 0..256). The "-0.05" threshold in
 * the side-view branch is expressed as a fraction of the canvas size.
 *
 * @param {import("./poseDetector.js").Keypoint[]} keypoints
 * @param {"right"|"left"} dominantHand
 * @param {"front"|"side"|"angled"|"unknown"} cameraAngle
 * @param {number} [canvasSize=MODEL_INPUT_SIZE]
 * @returns {boolean}
 */
function isBackhandShot(keypoints, dominantHand, cameraAngle, canvasSize = MODEL_INPUT_SIZE) {
  const wristName = `${dominantHand}_wrist`;
  const oppositeShoulder = dominantHand === "right" ? "left_shoulder" : "right_shoulder";
  const sameShoulder = `${dominantHand}_shoulder`;

  const wrist = getKp(keypoints, wristName);
  const oppShoulder = getKp(keypoints, oppositeShoulder);
  const sameShl = getKp(keypoints, sameShoulder);

  if (!wrist || !oppShoulder || !sameShl) return false;

  if (cameraAngle === "front") {
    const bodyCenter = (oppShoulder.x + sameShl.x) / 2;
    if (dominantHand === "right") {
      return wrist.x < bodyCenter;
    }
    return wrist.x > bodyCenter;
  } else if (cameraAngle === "side") {
    // Side view: elbow-above-wrist is a reasonable backhand proxy.
    const elbow = getKp(keypoints, `${dominantHand}_elbow`);
    if (!elbow) return false;
    // pixel threshold equivalent to 0.05 * canvas
    const pxThresh = 0.05 * canvasSize;
    return elbow.y < wrist.y - pxThresh;
  } else {
    // Angled / unknown: require a margin past the body midline.
    const bodyCenter = (oppShoulder.x + sameShl.x) / 2;
    const margin = Math.abs(oppShoulder.x - sameShl.x) * 0.3;
    if (dominantHand === "right") {
      return wrist.x < bodyCenter - margin;
    }
    return wrist.x > bodyCenter + margin;
  }
}

// ─── Multi-Frame Voting ────────────────────────────────────────────────────

/**
 * Classify a shot using a 5-frame window around the peak (peak ± 2). Only
 * frames that pass isQualityFrame() contribute. The winning type is the one
 * with the highest total confidence.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @param {number} peakIdx
 * @param {"right"|"left"} dominantHand
 * @param {string} sport
 * @param {number[]} timestamps
 * @param {"front"|"side"|"angled"|"unknown"} cameraAngle
 * @returns {{ type: string, name: string, confidence: number, isBackhand: boolean,
 *   elbowAngle: number, wristSpeed: number, framesAnalyzed: number }}
 */
function classifyShotWithVoting(allKeypoints, peakIdx, dominantHand, sport, timestamps, cameraAngle) {
  const window = [];
  for (let offset = -2; offset <= 2; offset++) {
    const idx = peakIdx + offset;
    if (idx >= 0 && idx < allKeypoints.length) {
      if (isQualityFrame(allKeypoints[idx], dominantHand)) {
        window.push(idx);
      }
    }
  }

  if (window.length === 0) {
    // Fall back to a single-frame classify so we still return *something* when
    // quality is low, but mark confidence accordingly.
    const fallback = classifySingleShot(allKeypoints, peakIdx, dominantHand, sport, timestamps, cameraAngle);
    return { ...fallback, confidence: Math.min(fallback.confidence, 0.25), framesAnalyzed: 0 };
  }

  const votes = {};
  const details = {}; // keep the richest per-type classification for metadata
  for (const idx of window) {
    const result = classifySingleShot(allKeypoints, idx, dominantHand, sport, timestamps, cameraAngle);
    if (result.type && result.type !== "unknown") {
      votes[result.type] = (votes[result.type] || 0) + result.confidence;
      if (!details[result.type] || result.confidence > details[result.type].confidence) {
        details[result.type] = result;
      }
    }
  }

  let bestType = "unknown";
  let bestScore = 0;
  for (const [type, score] of Object.entries(votes)) {
    if (score > bestScore) {
      bestType = type;
      bestScore = score;
    }
  }

  if (bestType === "unknown") {
    const fallback = classifySingleShot(allKeypoints, peakIdx, dominantHand, sport, timestamps, cameraAngle);
    return { ...fallback, framesAnalyzed: window.length };
  }

  const maxPossible = window.length;
  const confidence = Math.min(1, bestScore / maxPossible);
  const winner = details[bestType];
  const name = bestType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    type: bestType,
    name,
    confidence,
    isBackhand: winner.isBackhand,
    elbowAngle: winner.elbowAngle,
    wristSpeed: winner.wristSpeed,
    framesAnalyzed: window.length,
  };
}

// ─── Single Shot Classification ────────────────────────────────────────────

/**
 * Classify a single shot from the frames around a detected peak.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints - All frame keypoints
 * @param {number} peakIdx - Frame index of the motion peak
 * @param {"right"|"left"} dominantHand - Which hand holds the racket
 * @param {string} sport - Sport key
 * @param {number[]} timestamps - Frame timestamps
 * @param {"front"|"side"|"angled"|"unknown"} [cameraAngle="unknown"]
 * @returns {{ type: string, name: string, confidence: number, isBackhand: boolean,
 *   elbowAngle: number, wristSpeed: number }}
 */
function classifySingleShot(allKeypoints, peakIdx, dominantHand, sport, timestamps, cameraAngle = "unknown") {
  const wristName = dominantHand === "right" ? "right_wrist" : "left_wrist";
  const shoulderName = dominantHand === "right" ? "right_shoulder" : "left_shoulder";
  const elbowName = dominantHand === "right" ? "right_elbow" : "left_elbow";
  const hipName = dominantHand === "right" ? "right_hip" : "left_hip";

  const peakFrame = allKeypoints[peakIdx];
  if (!peakFrame) {
    return { type: "unknown", name: "Unknown", confidence: 0, isBackhand: false, elbowAngle: 0, wristSpeed: 0 };
  }

  const wrist = getKp(peakFrame, wristName);
  const shoulder = getKp(peakFrame, shoulderName);
  const elbow = getKp(peakFrame, elbowName);
  const hip = getKp(peakFrame, hipName);
  const lShoulder = getKp(peakFrame, "left_shoulder");
  const rShoulder = getKp(peakFrame, "right_shoulder");

  if (!wrist || !shoulder) {
    return { type: "unknown", name: "Unknown", confidence: 0.1, isBackhand: false, elbowAngle: 0, wristSpeed: 0 };
  }

  // Torso length for normalization (moved up so backhand margin can use it)
  const torsoLength = hip ? Math.abs(shoulder.y - hip.y) : 80;
  const safeTorso = torsoLength > 5 ? torsoLength : 80;

  // Camera-aware backhand detection
  const isBackhand = isBackhandShot(peakFrame, dominantHand, cameraAngle);

  // Canvas-normalized vertical offset of the wrist w.r.t. the shoulder.
  // Negative = above shoulder, positive = below. Keypoints are in pixel
  // coordinates on a MODEL_INPUT_SIZE-square canvas.
  const canvasSize = MODEL_INPUT_SIZE;
  const wristShoulderDyNorm = (wrist.y - shoulder.y) / canvasSize;

  // Wrist height flags
  const wristAboveShoulder = wristShoulderDyNorm < -0.015;
  // "Wrist HIGH" — prompt: above shoulder by >0.1 normalized
  const wristHighAboveShoulder = wristShoulderDyNorm < -0.1;
  const hipY = hip ? hip.y : shoulder.y + 80;
  const wristBelowHip = wrist.y > hipY;
  const wristNearShoulderHeight = Math.abs(wrist.y - shoulder.y) < 20;

  // Wrist velocity direction from neighboring frames (torso-normalized)
  let wristVelY = 0;
  let wristVelX = 0;
  let peakSpeed = 0;
  if (peakIdx > 0 && peakIdx < allKeypoints.length - 1) {
    const prevWrist = getKp(allKeypoints[peakIdx - 1], wristName);
    const nextWrist = getKp(allKeypoints[peakIdx + 1], wristName);
    if (prevWrist && nextWrist) {
      wristVelY = (nextWrist.y - prevWrist.y) / safeTorso; // positive = downward
      wristVelX = Math.abs(nextWrist.x - prevWrist.x) / safeTorso;
    }
  }

  // Window-based upward wrist motion (canvas-normalized). Useful for TT loop
  // detection: "wrist y decreases by >0.04 over a 5-frame window".
  let wristDyWindowNorm = 0;
  {
    const lo = Math.max(0, peakIdx - 2);
    const hi = Math.min(allKeypoints.length - 1, peakIdx + 2);
    const loW = getKp(allKeypoints[lo], wristName);
    const hiW = getKp(allKeypoints[hi], wristName);
    if (loW && hiW) {
      wristDyWindowNorm = (hiW.y - loW.y) / canvasSize;
    }
  }

  // Peak wrist speed (normalized by torso)
  if (peakIdx > 0) {
    const prevWrist = getKp(allKeypoints[peakIdx - 1], wristName);
    if (prevWrist) {
      const dt = timestamps[peakIdx] - timestamps[peakIdx - 1];
      if (dt > 0) {
        peakSpeed = kpDist(wrist, prevWrist) / safeTorso / dt;
      }
    }
  }

  // Elbow angle at peak
  const elbowAngle = elbow ? calculateAngle(shoulder, elbow, wrist) : 90;

  const features = {
    aboveShoulder: wristAboveShoulder,
    highAboveShoulder: wristHighAboveShoulder,
    belowHip: wristBelowHip,
    nearShoulder: wristNearShoulderHeight,
    isBackhand,
    velY: wristVelY,
    velX: wristVelX,
    elbowAngle,
    speed: peakSpeed,
    wristDyWindowNorm,
    wristShoulderDyNorm,
  };

  // Sport-specific classification
  let type;
  let confidence;

  if (sport === "badminton") {
    ({ type, confidence } = classifyBadmintonShot(features));
  } else if (sport === "table_tennis") {
    ({ type, confidence } = classifyTTShot(features));
  } else if (sport === "tennis") {
    ({ type, confidence } = classifyTennisShot(features));
  } else if (sport === "pickleball") {
    ({ type, confidence } = classifyPickleballShot(features));
  } else {
    type = "unknown";
    confidence = 0.3;
  }

  const name = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return { type, name, confidence, isBackhand, elbowAngle, wristSpeed: peakSpeed };
}

/**
 * Classify a badminton shot from motion features at the peak frame.
 * Uses the feature bundle built in classifySingleShot().
 *
 * @param {object} f - Feature bundle
 * @returns {{ type: string, confidence: number }}
 */
function classifyBadmintonShot(f) {
  const { aboveShoulder, highAboveShoulder, belowHip, isBackhand, velY, velX, elbowAngle, speed, nearShoulder } = f;
  // velY/velX are torso-normalized displacements (pixel coords / torsoLength).
  // speed is torso-normalized velocity (pixel dist / torsoLength / dt).
  // Typical ranges on 256px canvas: velY +-0.01..0.5, velX 0..0.3, speed 0.1..5.0
  let type;
  let confidence;

  // Tightened rules per spec:
  //   Smash   : wrist HIGH (>0.1 above shoulder, normalized) + fast downward
  //   Clear   : wrist HIGH + neutral or upward trajectory
  //   Drop    : wrist HIGH + slow speed
  //   Drive   : wrist near shoulder height + fast horizontal
  //   Net shot: wrist BELOW shoulder + slow
  //   Serve   : wrist BELOW hip + underhand
  // Forehand gets slightly higher base confidence than backhand.
  const fhBoost = isBackhand ? 0.0 : 0.08;

  if (belowHip && speed < 0.15) {
    type = "serve"; confidence = 0.62 + fhBoost;
  } else if (highAboveShoulder && velY > 0.03 && speed > 0.2) {
    type = "smash"; confidence = 0.80 + fhBoost;
  } else if (highAboveShoulder && velY <= 0.01) {
    type = "clear"; confidence = 0.70 + fhBoost;
  } else if (highAboveShoulder && speed < 0.15) {
    type = "drop"; confidence = 0.62 + fhBoost;
  } else if (nearShoulder && velX > 0.03) {
    type = "drive"; confidence = 0.66 + fhBoost;
  } else if (!aboveShoulder && speed < 0.1) {
    type = "net_shot"; confidence = 0.60 + fhBoost;
  } else if (belowHip && velY < -0.03) {
    type = "lift"; confidence = 0.56 + fhBoost;
  } else if (aboveShoulder && speed > 0.2 && velY > 0.03) {
    // Overhead but not "high above" — still a smash, lower confidence.
    type = "smash"; confidence = 0.62 + fhBoost;
  } else if (aboveShoulder) {
    type = speed > 0.15 ? "smash" : "clear";
    confidence = 0.48 + fhBoost;
  } else {
    type = "drive"; confidence = 0.42 + fhBoost;
  }

  return { type, confidence };
}

/**
 * Classify a table tennis shot from motion features at the peak frame.
 *
 * @param {object} f - Feature bundle
 * @returns {{ type: string, confidence: number }}
 */
function classifyTTShot(f) {
  const { aboveShoulder, nearShoulder, isBackhand, velY, velX, elbowAngle, speed, belowHip, wristDyWindowNorm } = f;
  let type;
  let confidence;

  // Loop: wrist clearly goes UP across a 5-frame window (dy < -0.04 normalized).
  // This is a cleaner signal than a single-frame velY.
  const loopUpward = wristDyWindowNorm < -0.04;

  if (speed > 0.35 && nearShoulder && velX > 0.04 && Math.abs(velY) < 0.02) {
    // Very fast flat smash, wrist near shoulder height.
    type = "smash"; confidence = 0.75;
  } else if (loopUpward && speed > 0.15) {
    type = isBackhand ? "backhand_loop" : "forehand_loop";
    confidence = 0.72;
  } else if (velY > 0.03 && velX < 0.02) {
    type = "chop"; confidence = 0.68;
  } else if (belowHip && speed < 0.1) {
    type = "serve"; confidence = 0.64;
  } else if (nearShoulder && speed > 0.1 && velX > 0.015) {
    type = isBackhand ? "backhand_drive" : "forehand_drive";
    confidence = 0.66;
  } else if (speed < 0.08) {
    type = speed < 0.03 ? "block" : "push";
    confidence = 0.55;
  } else if (speed > 0.18 && elbowAngle > 140) {
    type = "flick"; confidence = 0.58;
  } else {
    type = isBackhand ? "backhand_drive" : "forehand_drive";
    confidence = 0.45;
  }

  return { type, confidence };
}

/**
 * Classify a tennis shot from motion features at the peak frame.
 *
 * @param {object} f - Feature bundle
 * @returns {{ type: string, confidence: number }}
 */
function classifyTennisShot(f) {
  const { highAboveShoulder, aboveShoulder, nearShoulder, isBackhand, velY, velX, elbowAngle, speed } = f;
  let type;
  let confidence;

  // Serve: wrist VERY HIGH + fast downward + arm fully extended (elbow ~ straight)
  if (highAboveShoulder && speed > 0.3 && velY > 0.03 && elbowAngle > 150) {
    type = "serve"; confidence = 0.82;
  } else if (highAboveShoulder && velY > 0.06) {
    type = "overhead"; confidence = 0.72;
  } else if (velY > 0.05 && speed < 0.15) {
    type = "slice"; confidence = 0.62;
  } else if (velY < -0.06 && !aboveShoulder) {
    type = "lob"; confidence = 0.60;
  } else if (!aboveShoulder && speed < 0.06) {
    type = "drop_shot"; confidence = 0.55;
  } else if (nearShoulder && speed < 0.12 && Math.abs(velX) < 0.03) {
    // Compact motion at shoulder height = volley
    type = "volley"; confidence = 0.60;
  } else {
    type = isBackhand ? "backhand" : "forehand";
    confidence = 0.68;
  }

  return { type, confidence };
}

/**
 * Classify a pickleball shot from motion features at the peak frame.
 *
 * @param {object} f - Feature bundle
 * @returns {{ type: string, confidence: number }}
 */
function classifyPickleballShot(f) {
  const { highAboveShoulder, aboveShoulder, nearShoulder, velY, velX, speed, belowHip } = f;
  let type;
  let confidence;

  if (highAboveShoulder && velY > 0.06) {
    type = "overhead"; confidence = 0.70;
  } else if (belowHip && speed < 0.1) {
    // Underhand from below waist
    type = "serve"; confidence = 0.66;
  } else if (nearShoulder && speed < 0.08 && Math.abs(velX) < 0.02) {
    // Slow, soft, compact motion at net height = dink
    type = "dink"; confidence = 0.66;
  } else if (velY < -0.06) {
    type = "lob"; confidence = 0.58;
  } else if (nearShoulder && speed > 0.1 && velX > 0.02 && speed < 0.2) {
    // Medium horizontal at net = volley
    type = "volley"; confidence = 0.58;
  } else if (speed > 0.15 && velX > 0.02) {
    type = "drive"; confidence = 0.62;
  } else if (!aboveShoulder && speed < 0.1) {
    type = "third_shot_drop"; confidence = 0.55;
  } else {
    type = "drop"; confidence = 0.45;
  }

  return { type, confidence };
}

// ─── Per-Shot Metrics ──────────────────────────────────────────────────────

/**
 * Compute metrics for a window of frames around a shot peak.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @param {number} peakIdx - Frame index of the shot
 * @param {number} windowSize - Number of frames on each side to include
 * @returns {object} Metrics for this shot window
 */
function computeShotMetrics(allKeypoints, peakIdx, windowSize = 3) {
  const start = Math.max(0, peakIdx - windowSize);
  const end = Math.min(allKeypoints.length - 1, peakIdx + windowSize);
  const window = allKeypoints.slice(start, end + 1);

  const elbowAngles = [];
  const shoulderAngles = [];
  const balanceScores = [];
  const visibilityCounts = [];

  for (const kps of window) {
    visibilityCounts.push(countVisibleKeypoints(kps));

    const rShoulder = getKp(kps, "right_shoulder");
    const rElbow = getKp(kps, "right_elbow");
    const rWrist = getKp(kps, "right_wrist");
    const rHip = getKp(kps, "right_hip");
    const lShoulder = getKp(kps, "left_shoulder");
    const rAnkle = getKp(kps, "right_ankle");
    const lAnkle = getKp(kps, "left_ankle");

    if (rShoulder && rElbow && rWrist) elbowAngles.push(calculateAngle(rShoulder, rElbow, rWrist));
    if (rHip && rShoulder && rElbow) shoulderAngles.push(calculateAngle(rHip, rShoulder, rElbow));

    if (rShoulder && lShoulder && rAnkle && lAnkle) {
      const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
      const ankleWidth = Math.abs(rAnkle.x - lAnkle.x);
      if (shoulderWidth > 0) {
        const ratio = ankleWidth / shoulderWidth;
        const deviation = Math.abs(ratio - 1.0);
        balanceScores.push(Math.max(0, 100 - deviation * 80));
      }
    }
  }

  const avgElbow = avg(elbowAngles);
  const elbowStd = stddev(elbowAngles);
  const elbowAngleQuality = Math.max(0, Math.min(100, 100 - Math.abs(avgElbow - 120) * 0.8 - elbowStd * 0.5));
  const formScore = Math.min(100, (avg(visibilityCounts) / 17) * 70 + 30 - elbowStd * 0.3);
  const balanceScore = avg(balanceScores) || 60;

  const overallShotScore = Math.round(
    formScore * 0.3 + elbowAngleQuality * 0.3 + balanceScore * 0.2 + Math.min(100, avg(shoulderAngles) * 0.5) * 0.2
  );

  return {
    form_score: Math.round(clamp(formScore, 0, 100)),
    elbow_angle_quality: Math.round(clamp(elbowAngleQuality, 0, 100)),
    balance_score: Math.round(clamp(balanceScore, 0, 100)),
    overall: clamp(overallShotScore, 0, 100),
  };
}

// ─── Full Metrics Computation ──────────────────────────────────────────────

/**
 * Compute analysis metrics from all pose keypoints across the entire video.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @param {{ segments: object[], activeFrameCount: number }} segmentData
 * @param {number} totalFrames
 * @returns {object} Metrics object
 */
function computeMetrics(allKeypoints, segmentData, totalFrames) {
  const elbowAngles = [];
  const shoulderAngles = [];
  const hipAngles = [];
  const kneeAngles = [];
  const visibilityCounts = [];
  const balanceScores = [];

  for (const kps of allKeypoints) {
    visibilityCounts.push(countVisibleKeypoints(kps));

    const rShoulder = getKp(kps, "right_shoulder");
    const rElbow = getKp(kps, "right_elbow");
    const rWrist = getKp(kps, "right_wrist");
    const rHip = getKp(kps, "right_hip");
    const lHip = getKp(kps, "left_hip");
    const rKnee = getKp(kps, "right_knee");
    const rAnkle = getKp(kps, "right_ankle");
    const lShoulder = getKp(kps, "left_shoulder");
    const lAnkle = getKp(kps, "left_ankle");

    if (rShoulder && rElbow && rWrist) elbowAngles.push(calculateAngle(rShoulder, rElbow, rWrist));
    if (rHip && rShoulder && rElbow) shoulderAngles.push(calculateAngle(rHip, rShoulder, rElbow));
    if (rShoulder && rHip && rKnee) hipAngles.push(calculateAngle(rShoulder, rHip, rKnee));
    if (rHip && rKnee && rAnkle) kneeAngles.push(calculateAngle(rHip, rKnee, rAnkle));

    if (rShoulder && lShoulder && rAnkle && lAnkle) {
      const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
      const ankleWidth = Math.abs(rAnkle.x - lAnkle.x);
      if (shoulderWidth > 0) {
        const ratio = ankleWidth / shoulderWidth;
        const deviation = Math.abs(ratio - 1.0);
        balanceScores.push(Math.max(0, 100 - deviation * 80));
      }
    }
  }

  const avgElbow = avg(elbowAngles);
  const elbowStd = stddev(elbowAngles);
  const elbowAngleQuality = Math.max(0, Math.min(100, 100 - Math.abs(avgElbow - 120) * 0.8 - elbowStd * 0.5));
  const romScore = Math.min(100, avg(shoulderAngles) * 0.5 + stddev(shoulderAngles) * 2);
  const formScore = Math.min(100, (avg(visibilityCounts) / 17) * 70 + 30 - elbowStd * 0.3);
  const elbowConsistency = Math.max(0, 100 - elbowStd * 2);
  const hipConsistency = Math.max(0, 100 - stddev(hipAngles) * 2);
  const consistencyScore = (elbowConsistency + hipConsistency) / 2;
  const elbowRange = elbowAngles.length > 1 ? Math.max(...elbowAngles) - Math.min(...elbowAngles) : 0;
  const wristAction = Math.min(100, elbowRange * 0.8);
  const kneeVariation = stddev(kneeAngles);
  const footworkScore = Math.min(100, kneeVariation * 3 + 20);
  const balanceScore = avg(balanceScores) || 60;

  return {
    form_score: Math.round(clamp(formScore, 0, 100)),
    consistency_score: Math.round(clamp(consistencyScore, 0, 100)),
    range_of_motion: Math.round(clamp(romScore, 0, 100)),
    balance_score: Math.round(clamp(balanceScore, 0, 100)),
    elbow_angle_quality: Math.round(clamp(elbowAngleQuality, 0, 100)),
    wrist_action: Math.round(clamp(wristAction, 0, 100)),
    footwork_score: Math.round(clamp(footworkScore, 0, 100)),
    avg_elbow_angle: Math.round(avgElbow * 10) / 10,
    avg_knee_angle: Math.round(avg(kneeAngles) * 10) / 10,
    frames_processed: totalFrames,
    active_frame_ratio: totalFrames > 0 ? Math.round((segmentData.activeFrameCount / totalFrames) * 100) / 100 : 0,
  };
}

// ─── Scoring & Grading ──────────────────────────────────────────────────────

/**
 * Compute a weighted overall score from individual metrics.
 * @param {object} metrics
 * @returns {number} Score 0-100
 */
function computeOverallScore(metrics) {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, weight] of Object.entries(METRIC_WEIGHTS)) {
    const value = metrics[key];
    if (typeof value === "number") {
      weightedSum += value * weight;
      totalWeight += weight;
    }
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
}

/**
 * Determine letter grade from overall score.
 * @param {number} score
 * @returns {string}
 */
function scoreToGrade(score) {
  for (const { grade, minScore } of GRADE_THRESHOLDS) {
    if (score >= minScore) return grade;
  }
  return "F";
}

/**
 * Determine skill level from overall score.
 * @param {number} score
 * @returns {string}
 */
function scoreToSkillLevel(score) {
  for (const { label, minScore } of SKILL_LEVEL_THRESHOLDS) {
    if (score >= minScore) return label;
  }
  return "Beginner";
}

/**
 * Determine skill level using BOTH form score AND speed.
 * Speed is a strong signal: a 200 km/h smash = pro regardless of perceived form.
 *
 * @param {number} formScore - 0-100 technique score
 * @param {number} speedKmh - Estimated shot speed
 * @param {string} sport
 * @param {string} shotType - The detected shot type (smash gets more weight than push)
 * @returns {string} skill level
 */
function determineSkillLevel(formScore, speedKmh, sport, shotType) {
  const baseLevel = scoreToSkillLevel(formScore);
  const boost = SPEED_SKILL_BOOST[sport] || SPEED_SKILL_BOOST.badminton;

  // Speed-based level (only meaningful for fast shots, not pushes/drops)
  const isFastShot = ["smash", "drive", "loop", "drive_clear", "clear", "forehand_drive", "backhand_drive", "forehand_loop", "backhand_loop", "forehand_smash", "tt_smash", "serve", "forehand", "backhand"].some(s => shotType?.toLowerCase().includes(s));

  if (!isFastShot || !speedKmh || speedKmh <= 0) {
    return baseLevel;
  }

  let speedLevel = "Beginner";
  if (speedKmh >= boost.pro) speedLevel = "Pro";
  else if (speedKmh >= boost.advanced) speedLevel = "Advanced";
  else if (speedKmh >= boost.intermediate) speedLevel = "Intermediate";

  // Take the HIGHER of the two levels (speed is hard to fake)
  const levels = ["Beginner", "Intermediate", "Advanced", "Pro"];
  const baseIdx = levels.indexOf(baseLevel);
  const speedIdx = levels.indexOf(speedLevel);
  return levels[Math.max(baseIdx, speedIdx)];
}

// ─── Weakness Detection ─────────────────────────────────────────────────────

/**
 * Identify weaknesses from metrics and generate improvement suggestions.
 *
 * @param {object} metrics
 * @param {string} shotName
 * @returns {{ issue: string, severity: string, fix: string, area: string }[]}
 */
function detectWeaknesses(metrics, shotName) {
  const weaknesses = [];

  if (metrics.form_score < 60) {
    weaknesses.push({
      issue: "Inconsistent body form",
      area: "form",
      severity: metrics.form_score < 40 ? "high" : "medium",
      fix: `Focus on maintaining a stable body posture throughout your ${shotName}. Record yourself from the side to check alignment.`,
    });
  }

  if (metrics.elbow_angle_quality < 55) {
    weaknesses.push({
      issue: "Elbow positioning needs work",
      area: "arm_technique",
      severity: metrics.elbow_angle_quality < 35 ? "high" : "medium",
      fix: "Keep your elbow at roughly 90-120 degrees during the swing. Practice shadow swings slowly to build muscle memory.",
    });
  }

  if (metrics.balance_score < 55) {
    weaknesses.push({
      issue: "Balance and stance instability",
      area: "balance",
      severity: metrics.balance_score < 35 ? "high" : "medium",
      fix: "Widen your stance to shoulder width and bend your knees slightly. Practice split-step drills.",
    });
  }

  if (metrics.consistency_score < 50) {
    weaknesses.push({
      issue: "Technique varies between repetitions",
      area: "consistency",
      severity: "medium",
      fix: "Practice the same shot repeatedly with focus on identical motion each time. Use a wall drill for consistency.",
    });
  }

  if (metrics.range_of_motion < 40) {
    weaknesses.push({
      issue: "Limited range of motion in swing",
      area: "flexibility",
      severity: "low",
      fix: "Warm up with dynamic stretches before playing. Work on shoulder mobility exercises.",
    });
  }

  if (metrics.wrist_action < 35) {
    weaknesses.push({
      issue: "Insufficient wrist snap",
      area: "wrist",
      severity: "medium",
      fix: "Practice wrist flicks with a light racket. Focus on snapping the wrist at the point of contact.",
    });
  }

  if (metrics.footwork_score < 40) {
    weaknesses.push({
      issue: "Static footwork — not enough movement",
      area: "footwork",
      severity: "low",
      fix: "Practice ladder drills and shadow footwork. Stay on the balls of your feet and keep moving between shots.",
    });
  }

  return weaknesses;
}

// ─── Speed Estimation ───────────────────────────────────────────────────────

/**
 * Sport-specific calibration factors to convert body-relative wrist speed
 * to approximate real-world shot speed in km/h.
 */
const SPEED_CALIBRATION = {
  badminton:    { factor: 60,  minPlausible: 20, maxPlausible: 200 },
  table_tennis: { factor: 30,  minPlausible: 5,  maxPlausible: 100 },
  tennis:       { factor: 55,  minPlausible: 20, maxPlausible: 200 },
  pickleball:   { factor: 35,  minPlausible: 10, maxPlausible: 80  },
};

/**
 * Estimate swing speed from wrist movement relative to torso size.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @param {number[]} timestamps
 * @param {string} sport
 * @param {{ width: number, height: number }} videoInfo
 * @returns {{ estimated_speed_kmh: number, speed_class: string, note: string }}
 */
function estimateSpeed(allKeypoints, timestamps, sport, videoInfo) {
  const arm = detectDominantHand(allKeypoints);
  const wristName = `${arm}_wrist`;
  const shoulderName = `${arm}_shoulder`;
  const hipName = `${arm}_hip`;

  const normalisedSpeeds = [];

  for (let i = 1; i < allKeypoints.length; i++) {
    const prevWrist = getKp(allKeypoints[i - 1], wristName) ||
                      getKp(allKeypoints[i - 1], "right_wrist") ||
                      getKp(allKeypoints[i - 1], "left_wrist");
    const currWrist = getKp(allKeypoints[i], wristName) ||
                      getKp(allKeypoints[i], "right_wrist") ||
                      getKp(allKeypoints[i], "left_wrist");

    if (!prevWrist || !currWrist) continue;

    const dt = timestamps[i] - timestamps[i - 1];
    if (dt <= 0) continue;

    let torso = 0;
    let torsoCount = 0;
    for (const kps of [allKeypoints[i - 1], allKeypoints[i]]) {
      const sh = getKp(kps, shoulderName) || getKp(kps, "right_shoulder") || getKp(kps, "left_shoulder");
      const hp = getKp(kps, hipName) || getKp(kps, "right_hip") || getKp(kps, "left_hip");
      if (sh && hp) {
        const t = Math.sqrt((sh.x - hp.x) ** 2 + (sh.y - hp.y) ** 2);
        if (t > 5) { torso += t; torsoCount++; }
      }
    }

    if (torsoCount === 0) continue;
    const avgTorso = torso / torsoCount;

    const pixelDist = Math.sqrt((currWrist.x - prevWrist.x) ** 2 + (currWrist.y - prevWrist.y) ** 2);
    const relativeSpeed = (pixelDist / avgTorso) / dt;
    normalisedSpeeds.push(relativeSpeed);
  }

  if (normalisedSpeeds.length === 0) {
    return { estimated_speed_kmh: 0, speed_class: "Unknown", note: "Could not estimate speed — wrist not visible." };
  }

  normalisedSpeeds.sort((a, b) => b - a);
  const topN = Math.min(5, Math.max(3, Math.floor(normalisedSpeeds.length * 0.15)));
  const peakRelativeSpeed = normalisedSpeeds.slice(0, topN).reduce((a, b) => a + b, 0) / topN;

  const cal = SPEED_CALIBRATION[sport] || SPEED_CALIBRATION.badminton;
  let estimatedSpeed = Math.round(peakRelativeSpeed * cal.factor);
  estimatedSpeed = Math.max(cal.minPlausible, Math.min(cal.maxPlausible, estimatedSpeed));

  const thresholds = SPEED_THRESHOLDS[sport] || SPEED_THRESHOLDS.badminton;
  let speedClass;
  if (estimatedSpeed >= thresholds.advanced) {
    speedClass = "Elite";
  } else if (estimatedSpeed >= thresholds.intermediate) {
    speedClass = "Advanced";
  } else if (estimatedSpeed >= thresholds.beginner) {
    speedClass = "Intermediate";
  } else {
    speedClass = "Beginner";
  }

  return {
    estimated_speed_kmh: estimatedSpeed,
    speed_class: speedClass,
    note: `Estimated from wrist tracking (body-relative) across ${allKeypoints.length} frames. Actual shuttle/ball speed may differ.`,
  };
}

/**
 * Estimate speed for a single shot window around a peak.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @param {number[]} timestamps
 * @param {number} peakIdx
 * @param {string} sport
 * @param {"right"|"left"} dominantHand
 * @returns {number} Estimated speed in km/h
 */
function estimateShotSpeed(allKeypoints, timestamps, peakIdx, sport, dominantHand, shotType) {
  const wristName = `${dominantHand}_wrist`;
  const shoulderName = `${dominantHand}_shoulder`;
  const hipName = `${dominantHand}_hip`;

  // Use a centered 3-frame difference at the exact peak frame to get the
  // instantaneous wrist velocity *at* this shot (not a max-over-window, which
  // was pinning every shot to the ceiling).
  const lo = Math.max(0, peakIdx - 1);
  const hi = Math.min(allKeypoints.length - 1, peakIdx + 1);
  const prevWrist = getKp(allKeypoints[lo], wristName);
  const nextWrist = getKp(allKeypoints[hi], wristName);
  const dt = timestamps[hi] - timestamps[lo];
  if (!prevWrist || !nextWrist || dt <= 0) return 0;

  // Torso length at the peak frame for normalization
  let torso = 80;
  const sh = getKp(allKeypoints[peakIdx], shoulderName);
  const hp = getKp(allKeypoints[peakIdx], hipName);
  if (sh && hp) {
    const t = Math.abs(sh.y - hp.y);
    if (t > 5) torso = t;
  }

  const pixelDist = kpDist(prevWrist, nextWrist);
  const peakSpeed = (pixelDist / torso) / dt; // torso-normalized speed for *this* shot

  const cal = SPEED_CALIBRATION[sport] || SPEED_CALIBRATION.badminton;

  // Shot-type multipliers — a smash is genuinely faster than a drop, so let
  // the estimated speed reflect the classified shot type instead of being
  // driven purely by frame-to-frame wrist jitter.
  const SHOT_MULTIPLIER = {
    smash: 1.35, drive: 1.05, clear: 0.95, drop: 0.55, net: 0.45, lift: 0.7, serve: 0.85,
    forehand: 1.0, backhand: 0.9, topspin: 1.1, slice: 0.7, volley: 0.65,
    dink: 0.4,
  };
  const mult = SHOT_MULTIPLIER[shotType] ?? 1.0;

  let estimated = Math.round(peakSpeed * cal.factor * mult);
  return clamp(estimated, cal.minPlausible, cal.maxPlausible);
}

// ─── Player Profile & Multi-Shot Aggregation ───────────────────────────────

/**
 * Build a player profile from detected shots.
 *
 * @param {object[]} detectedShots - Array of classified shots
 * @param {"right"|"left"} dominantHand
 * @returns {object} Player profile
 */
function buildPlayerProfile(detectedShots, dominantHand) {
  if (detectedShots.length === 0) {
    return {
      dominant_hand: dominantHand,
      total_shots: 0,
      shot_distribution: {},
      primary_shot: "unknown",
      play_style: "unknown",
      overall_grade: "N/A",
      strengths: [],
      weaknesses: [],
    };
  }

  // Build shot distribution
  const shotDistribution = {};
  for (const shot of detectedShots) {
    const key = shot.type;
    if (!shotDistribution[key]) {
      shotDistribution[key] = { count: 0, grades: [], speeds: [], confidences: [] };
    }
    shotDistribution[key].count++;
    shotDistribution[key].grades.push(shot.grade);
    shotDistribution[key].speeds.push(shot.speed);
    shotDistribution[key].confidences.push(shot.confidence);
  }

  // Find primary shot (most frequent)
  let primaryShot = "unknown";
  let maxCount = 0;
  for (const [shotType, data] of Object.entries(shotDistribution)) {
    if (data.count > maxCount) {
      maxCount = data.count;
      primaryShot = shotType;
    }
  }

  // Derive play style from distribution
  const aggressiveTypes = ["smash", "forehand_loop", "backhand_loop", "drive", "overhead", "forehand_drive"];
  const defensiveTypes = ["clear", "chop", "push", "block", "lob", "net_shot", "dink", "third_shot_drop"];

  let aggressiveCount = 0;
  let defensiveCount = 0;
  for (const shot of detectedShots) {
    if (aggressiveTypes.includes(shot.type)) aggressiveCount++;
    if (defensiveTypes.includes(shot.type)) defensiveCount++;
  }

  let playStyle;
  if (aggressiveCount > defensiveCount * 2) playStyle = "Aggressive";
  else if (defensiveCount > aggressiveCount * 2) playStyle = "Defensive";
  else if (aggressiveCount > defensiveCount) playStyle = "Attacking";
  else playStyle = "All-round";

  // Overall grade from average of all shot scores
  const allScores = detectedShots.map((s) => s.score).filter((s) => s > 0);
  const overallScore = allScores.length > 0 ? Math.round(avg(allScores)) : 50;
  const overallGrade = scoreToGrade(overallScore);

  // Strengths: shots with grade A or B
  const strengths = [];
  const weaknessTypes = [];
  for (const [shotType, data] of Object.entries(shotDistribution)) {
    const gradeValues = data.grades.map((g) => {
      const entry = GRADE_THRESHOLDS.find((t) => t.grade === g);
      return entry ? entry.minScore + 10 : 50;
    });
    const avgGradeVal = avg(gradeValues);
    const displayName = shotType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (avgGradeVal >= 70) strengths.push(displayName);
    if (avgGradeVal < 55) weaknessTypes.push(displayName);
  }

  // Simplified distribution for the result
  const simpleDist = {};
  for (const [key, data] of Object.entries(shotDistribution)) {
    simpleDist[key] = data.count;
  }

  return {
    dominant_hand: dominantHand,
    total_shots: detectedShots.length,
    shot_distribution: simpleDist,
    primary_shot: primaryShot,
    play_style: playStyle,
    overall_grade: overallGrade,
    overall_score: overallScore,
    strengths,
    weaknesses: weaknessTypes,
  };
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

/**
 * Main video analysis pipeline that runs entirely in the browser.
 *
 * Extracts frames from the provided video file, runs MoveNet pose detection
 * on each frame, detects individual shot moments via wrist speed peaks,
 * classifies each shot separately, computes technique metrics, and returns
 * a multi-shot report.
 *
 * Works for both single-shot and multi-minute match videos.
 *
 * @param {File} videoFile - The video file to analyze
 * @param {string} sport - Sport type (badminton, table_tennis, tennis, pickleball)
 * @param {object} [options] - Analysis options
 * @param {string} [options.mode="full"] - "full" or "quick"
 * @param {string} [options.targetPlayer="auto"] - Player quadrant: "auto", "top-left", etc.
 * @param {{x:number,y:number,width:number,height:number}|null} [options.customCropBox] - Optional normalized (0-1) crop box from user player selection. Overrides targetPlayer.
 * @param {(progress: { step: string, percent: number, message: string }) => void} [options.onProgress] - Progress callback
 * @returns {Promise<object>} Analysis results matching the server's response format
 */
/**
 * Quickly scan a video to detect how many people are visible. Extracts a few
 * sample frames from the middle portion of the video and runs multi-person
 * detection on each. Returns the sample frames (as data URLs) along with the
 * bounding boxes of detected people in normalized coordinates (0-1).
 *
 * @param {File} videoFile
 * @returns {Promise<{
 *   frames: Array<{ imageDataUrl: string, people: Array<{box: {x:number,y:number,width:number,height:number}, score: number}>, timestamp: number }>,
 *   videoWidth: number,
 *   videoHeight: number,
 * }>}
 */
export async function scanVideoForPlayers(videoFile) {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(videoFile);
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Failed to load video metadata."));
    video.load();
  });

  const duration = video.duration;
  if (!duration || !isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Could not determine video duration.");
  }

  // Pre-load multi-pose model
  await initMultiPoseModel();

  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;

  const canvas = document.createElement("canvas");
  canvas.width = videoWidth;
  canvas.height = videoHeight;
  const ctx = canvas.getContext("2d");

  // Sample 3 frames from the middle of the video
  const sampleTimes = [duration * 0.25, duration * 0.5, duration * 0.75];
  const sampleFrames = [];

  for (const time of sampleTimes) {
    video.currentTime = Math.min(time, duration - 0.01);
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });

    ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

    let people = [];
    try {
      people = await detectMultiplePeople(canvas);
    } catch {
      people = [];
    }

    sampleFrames.push({
      imageDataUrl: canvas.toDataURL("image/jpeg", 0.7),
      people,
      timestamp: time,
    });
  }

  URL.revokeObjectURL(objectUrl);

  return {
    frames: sampleFrames,
    videoWidth,
    videoHeight,
  };
}

export async function analyzeVideo(videoFile, sport, options = {}) {
  const { mode = "full", targetPlayer = "auto", onProgress, customCropBox = null } = options;

  const sportConfig = SUPPORTED_SPORTS[sport];
  if (!sportConfig) {
    throw new Error(`Unsupported sport: "${sport}". Supported: ${Object.keys(SUPPORTED_SPORTS).join(", ")}`);
  }
  if (!sportConfig.videoAnalysis) {
    throw new Error(`Video analysis is not available for ${sportConfig.name}.`);
  }

  /** Report progress to the caller. */
  const progress = (step, percent, message) => {
    if (onProgress) {
      onProgress({ step, percent, message });
    }
  };

  try {
    // ── Step 1: Load AI model ────────────────────────────────────────────
    progress("model", 10, "Loading AI model...");
    await initModel();

    // ── Step 2: Determine frame count based on video duration ───────────
    progress("metadata", 15, "Reading video...");

    // Peek at duration first to decide frame count
    const tempVideo = document.createElement("video");
    const tempUrl = URL.createObjectURL(videoFile);
    tempVideo.src = tempUrl;
    tempVideo.muted = true;
    await new Promise((resolve, reject) => {
      tempVideo.onloadedmetadata = resolve;
      tempVideo.onerror = () => reject(new Error("Failed to load video metadata."));
      tempVideo.load();
    });
    const videoDuration = tempVideo.duration;
    URL.revokeObjectURL(tempUrl);

    // Scale frame count by duration: ~3fps sampling, clamped 30-100
    let targetFrameCount;
    if (mode === "quick") {
      targetFrameCount = sportConfig.quickFrames;
    } else {
      targetFrameCount = Math.min(100, Math.max(30, Math.floor(videoDuration * 3)));
    }

    // ── Step 3: Extract frames ───────────────────────────────────────────
    const canvasSize = mode === "quick" ? QUICK_MODEL_INPUT_SIZE : MODEL_INPUT_SIZE;
    progress("extraction", 25, `Extracting ${targetFrameCount} frames...`);
    const { frames, timestamps, duration, fps, width, height } = await extractFrames(
      videoFile,
      targetFrameCount,
      targetPlayer,
      canvasSize,
      customCropBox
    );

    const videoInfo = { duration, fps, width, height, frame_count: frames.length };

    // ── Step 3b: Compute motion scores ──────────────────────────────────
    progress("motion", 30, "Detecting motion...");
    const motionScores = [];
    for (let i = 1; i < frames.length; i++) {
      motionScores.push(computeMotionScore(frames[i - 1], frames[i]));
    }
    const isActiveFrame = [true, ...motionScores.map((s) => s > MOTION_ACTIVE_THRESHOLD * 0.5)];

    // ── Step 4: Detect poses (skip static frames) ────────────────────────
    progress("pose", 35, "Detecting poses...");
    const allKeypoints = [];
    const emptyPose = Array.from({ length: 17 }, () => ({ name: "", x: 0, y: 0, score: 0 }));
    let poseCount = 0;
    const totalActive = isActiveFrame.filter(Boolean).length;

    for (let i = 0; i < frames.length; i++) {
      if (isActiveFrame[i]) {
        const kps = await detectPose(frames[i]);
        allKeypoints.push(kps);
        poseCount++;
        const subPercent = 35 + Math.round((poseCount / totalActive) * 20);
        progress("pose", subPercent, `Detecting poses... (${poseCount}/${totalActive})`);
      } else {
        allKeypoints.push(emptyPose);
      }
    }

    // ── Step 5: Detect dominant hand ─────────────────────────────────────
    progress("classify", 56, "Detecting dominant hand...");
    const activeKeypoints = allKeypoints.filter((_, i) => isActiveFrame[i]);
    const dominantHand = detectDominantHand(activeKeypoints.length > 0 ? activeKeypoints : allKeypoints);

    // ── Step 5b: Quality gating + camera angle detection ────────────────
    // Count how many frames pass the quality gate. We DO NOT drop the low-
    // quality frames from allKeypoints (motion peak detection and metrics
    // still use the full array) but the classifier uses only quality frames
    // via the voting helper + isQualityFrame().
    const qualityFrameFlags = allKeypoints.map((kps) => isQualityFrame(kps, dominantHand));
    const qualityFrameCount = qualityFrameFlags.filter(Boolean).length;
    const totalFramesExtracted = allKeypoints.length;
    const qualityPercentage = totalFramesExtracted > 0
      ? Math.round((qualityFrameCount / totalFramesExtracted) * 100)
      : 0;
    const cameraAngle = detectCameraAngle(allKeypoints);

    // Insufficient data guard — if fewer than 5 quality frames, bail early
    // with a clear "insufficient data" result. The existing result shape is
    // preserved so the frontend UI keeps working.
    if (qualityFrameCount < 5) {
      progress("complete", 100, "Insufficient data");
      return {
        success: false,
        error: "Insufficient data — not enough clean pose frames to analyze. Try a clearer, better-lit video with the full body visible.",
        multi_shot: false,
        total_shots_detected: 0,
        dominant_hand: dominantHand,
        shots: [],
        shot_distribution: {},
        player_profile: buildPlayerProfile([], dominantHand),
        skill_level: "Beginner",
        analysis_mode: mode,
        shot_analysis: {
          shot_type: "unknown",
          shot_name: "Unknown",
          confidence: 0,
          grade: "F",
          score: 0,
          weaknesses: [],
          improvement_plan: "Upload a clearer video with the player fully in frame.",
        },
        metrics: {},
        quick_summary: "Insufficient data — not enough clean pose frames to analyze.",
        frames_analyzed: allKeypoints.length,
        video_info: videoInfo,
        sport,
        target_player: targetPlayer,
        analysis_quality: {
          total_frames_extracted: totalFramesExtracted,
          quality_frames: qualityFrameCount,
          quality_percentage: qualityPercentage,
          camera_angle: cameraAngle,
          confidence_level: "low",
          warning: "Video quality is too low to produce reliable results. Try a clearer video with the full body visible.",
        },
        _client_side: true,
      };
    }

    // ── Step 6: Find shot moments (motion peaks) ─────────────────────────
    progress("classify", 58, "Finding shot moments...");
    const shotPeaks = findShotMoments(allKeypoints, timestamps, dominantHand);

    // ── Step 7: Classify each shot individually ──────────────────────────
    progress("classify", 62, `Classifying ${shotPeaks.length} shot(s)...`);
    const detectedShots = [];

    for (let i = 0; i < shotPeaks.length; i++) {
      const peak = shotPeaks[i];
      const classification = classifyShotWithVoting(
        allKeypoints, peak.index, dominantHand, sport, timestamps, cameraAngle,
      );
      const shotMetrics = computeShotMetrics(allKeypoints, peak.index);
      const shotSpeed = estimateShotSpeed(
        allKeypoints, timestamps, peak.index, sport, dominantHand, classification.type,
      );
      const shotScore = shotMetrics.overall;
      const shotGrade = scoreToGrade(shotScore);

      // Per-shot duration: gap to the next peak (or video end) — capped at 3s
      const nextTime = i + 1 < shotPeaks.length ? shotPeaks[i + 1].time : (timestamps[timestamps.length - 1] ?? peak.time + 1);
      const prevTime = i > 0 ? shotPeaks[i - 1].time : (timestamps[0] ?? peak.time - 1);
      const duration = Math.min(3, Math.max(0.3, (nextTime - prevTime) / 2));

      detectedShots.push({
        type: classification.type,
        name: classification.name,
        confidence: classification.confidence,
        isBackhand: classification.isBackhand,
        timestamp: peak.time,
        frameIndex: peak.index,
        grade: shotGrade,
        score: shotScore,
        speed: shotSpeed,
        duration: Math.round(duration * 10) / 10,
        elbowAngle: classification.elbowAngle,
        metrics: shotMetrics,
      });

      const subPercent = 62 + Math.round(((i + 1) / shotPeaks.length) * 8);
      progress("classify", subPercent, `Classified shot ${i + 1}/${shotPeaks.length}: ${classification.name}`);
    }

    // Release frame data to free memory
    frames.length = 0;

    // ── Step 8: Analyze segments ─────────────────────────────────────────
    progress("segments", 72, "Analyzing segments...");
    const segmentData = detectSegments(motionScores, timestamps);

    // ── Step 9: Compute overall metrics ──────────────────────────────────
    progress("metrics", 78, "Computing metrics...");
    const metrics = computeMetrics(allKeypoints, segmentData, allKeypoints.length);
    // Overall score is the AVERAGE of all detected shots' scores. Falls back
    // to the legacy form-metric score if no shots were detected.
    const shotScoresArr = detectedShots.map((s) => s.score || 0).filter((s) => s > 0);
    const overallScore = shotScoresArr.length > 0
      ? Math.round(shotScoresArr.reduce((a, b) => a + b, 0) / shotScoresArr.length)
      : computeOverallScore(metrics);
    const grade = scoreToGrade(overallScore);
    // ── Step 10: Build player profile ────────────────────────────────────
    progress("profile", 82, "Building player profile...");
    const playerProfile = buildPlayerProfile(detectedShots, dominantHand);

    // Determine the "primary" shot for backward compat
    const primaryShotType = playerProfile.primary_shot;
    const primaryShotName = primaryShotType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const primaryConfidence = detectedShots.length > 0
      ? avg(detectedShots.filter((s) => s.type === primaryShotType).map((s) => s.confidence))
      : 0.5;

    const weaknesses = detectWeaknesses(metrics, primaryShotName);

    // ── Step 11: Estimate overall speed ──────────────────────────────────
    progress("speed", 88, "Estimating speed...");
    const speedAnalysis = estimateSpeed(allKeypoints, timestamps, sport, { width, height });

    // Determine skill level using BOTH form score AND speed
    // Speed is a strong signal: a 200km/h smash = pro regardless of form score
    const skillLevel = determineSkillLevel(
      overallScore,
      speedAnalysis?.estimated_speed_kmh || 0,
      sport,
      primaryShotType,
    );

    // ── Step 12: Build shot distribution ─────────────────────────────────
    const shotDistribution = {};
    for (const shot of detectedShots) {
      if (!shotDistribution[shot.type]) shotDistribution[shot.type] = 0;
      shotDistribution[shot.type]++;
    }

    // ── Step 13: Generate results ────────────────────────────────────────
    progress("results", 95, "Generating results...");

    const isMultiShot = detectedShots.length > 1;

    const result = {
      success: true,
      multi_shot: isMultiShot,
      total_shots_detected: detectedShots.length,
      dominant_hand: dominantHand,

      // Individual shots array (NEW)
      shots: detectedShots.map((s) => ({
        type: s.type,
        name: s.name,
        confidence: s.confidence,
        isBackhand: s.isBackhand,
        timestamp: Math.round(s.timestamp * 10) / 10,
        grade: s.grade,
        score: s.score,
        speed: s.speed,
        speed_kmh: s.speed,
        duration: s.duration,
      })),

      // Shot distribution (NEW)
      shot_distribution: shotDistribution,

      // Player profile (NEW)
      player_profile: playerProfile,

      // Backward-compatible fields — use the primary/most common shot
      skill_level: skillLevel,
      analysis_mode: mode,
      shot_analysis: {
        shot_type: primaryShotType,
        shot_name: primaryShotName,
        confidence: primaryConfidence,
        grade,
        score: overallScore,
        weaknesses,
        improvement_plan: weaknesses.length > 0
          ? `Focus on ${weaknesses[0].area} first — ${weaknesses[0].fix}`
          : `Great ${primaryShotName}! Keep practicing to maintain your form.`,
      },
      pro_comparison: {
        overall_score: overallScore,
        level: skillLevel,
        message: overallScore >= 80
          ? `Your ${primaryShotName} shows advanced technique. Fine-tune the details to reach elite level.`
          : overallScore >= 55
            ? `Your ${primaryShotName} is solid. Focus on the identified weaknesses to level up.`
            : `Your ${primaryShotName} has room for improvement. Work on the basics first.`,
        pro_tips: generateProTips(primaryShotType, sport, weaknesses),
        player_match: null,
      },
      metrics,
      coaching: null,
      comprehensive_coaching: null,
      quick_summary: isMultiShot
        ? `Match analysis: ${detectedShots.length} shots detected. ${grade} overall (${overallScore}/100). Style: ${playerProfile.play_style}. Primary: ${primaryShotName}.`
        : `${primaryShotName} analysis: ${grade} grade (${overallScore}/100). ${weaknesses.length > 0 ? `Key area: ${weaknesses[0].issue}.` : "Looking good!"}`,
      frames_analyzed: allKeypoints.length,
      analyzed_player_preview: null,
      video_info: videoInfo,
      speed_analysis: speedAnalysis,
      sport,
      target_player: targetPlayer,
      highlights: null,
      segments: {
        total: segmentData.segments.length,
        active: segmentData.activeFrameCount,
        power_moments: segmentData.powerMoments,
      },
      analysis_id: `local-${Date.now()}`,
      coach_feedback: {
        summary: isMultiShot
          ? `Match analysis: ${detectedShots.length} shots detected. Overall ${grade} (${overallScore}/100). Dominant hand: ${dominantHand}. Play style: ${playerProfile.play_style}.`
          : `Your ${primaryShotName} scored ${overallScore}/100 (${grade}). ${skillLevel} level detected.`,
        top_issues: weaknesses.slice(0, 3).map((w) => ({
          issue: w.issue,
          coach_says: `Let's work on your ${w.area} — ${w.issue.toLowerCase()}.`,
          fix: w.fix,
          drill: null,
          severity: w.severity,
        })),
        strengths: buildStrengths(metrics, primaryShotName, grade, overallScore),
        encouragement: weaknesses.length === 0
          ? "Excellent technique! Keep up the great work."
          : "Every champion started where you are. Keep practicing!",
      },
      improvement_plan: {
        this_week: weaknesses.slice(0, 3).map((w) => `Focus on: ${w.issue}`),
        next_upload: "Upload again in 7 days to track your improvement",
        expected_improvement: `With daily practice, you should see noticeable improvement in your ${primaryShotName} within 2 weeks`,
      },
      recommended_videos: [],
      recommended_drills: [],
      performance_scores: null,
      score_messages: [],
      training_plan_7day: null,
      earned_badges: [],
      score_comparison: null,
      analysis_quality: {
        total_frames_extracted: totalFramesExtracted,
        quality_frames: qualityFrameCount,
        quality_percentage: qualityPercentage,
        camera_angle: cameraAngle,
        confidence_level: qualityPercentage >= 70 ? "high" : qualityPercentage >= 40 ? "medium" : "low",
        warning: qualityPercentage < 40
          ? "Video quality is low. Try a clearer video for better results."
          : null,
      },
      _client_side: true,
    };

    // ── Step 14: Complete ────────────────────────────────────────────────
    progress("complete", 100, "Complete!");

    return result;
  } catch (err) {
    const errorResult = {
      success: false,
      error: err.message || "Unknown analysis error",
      sport,
      analysis_mode: mode,
      _client_side: true,
    };
    throw Object.assign(err, { analysisResult: errorResult });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate pro tips based on shot type and detected weaknesses.
 *
 * @param {string} shotType
 * @param {string} sport
 * @param {object[]} weaknesses
 * @returns {string[]}
 */
function generateProTips(shotType, sport, weaknesses) {
  const tips = [];
  const sportName = SUPPORTED_SPORTS[sport]?.name || sport;

  if (weaknesses.some((w) => w.area === "form")) {
    tips.push(`Watch professional ${sportName} players in slow motion and mirror their body positioning.`);
  }
  if (weaknesses.some((w) => w.area === "footwork")) {
    tips.push("Pro players are always on their toes. Practice split-step timing before every shot.");
  }
  if (weaknesses.some((w) => w.area === "wrist")) {
    tips.push("A relaxed grip with a quick wrist snap at contact generates more power than arm strength alone.");
  }
  if (weaknesses.some((w) => w.area === "balance")) {
    tips.push("Lower your center of gravity by bending your knees. This improves both balance and reaction time.");
  }

  if (tips.length === 0) {
    tips.push(`Great foundation! Focus on shot placement and tactical decision-making to reach the next level.`);
  }

  return tips.slice(0, 3);
}

/**
 * Build a list of detected strengths from metrics.
 *
 * @param {object} metrics
 * @param {string} shotName
 * @param {string} grade
 * @param {number} score
 * @returns {string[]}
 */
function buildStrengths(metrics, shotName, grade, score) {
  const strengths = [];

  if (grade === "A" || grade === "B") strengths.push(`Good ${shotName} technique`);
  if (score > 70) strengths.push("Solid overall form");
  if (metrics.consistency_score > 70) strengths.push("Consistent technique across repetitions");
  if (metrics.balance_score > 75) strengths.push("Excellent balance and stance");
  if (metrics.range_of_motion > 70) strengths.push("Good range of motion");
  if (metrics.wrist_action > 70) strengths.push("Strong wrist action");

  return strengths.length > 0 ? strengths.slice(0, 5) : ["Keep practicing to build your strengths!"];
}
