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
// ─── Video event helpers (with timeouts so we never hang) ──────────────
// Some browsers/codecs occasionally fail to fire `onseeked` or take many
// seconds. Without a timeout the analyze flow gets stuck forever.

function _waitForEvent(target, eventName, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { target[`on${eventName}`] = null; } catch {}
      try { target.onerror = null; } catch {}
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(finish, timeoutMs);
    target[`on${eventName}`] = finish;
    target.onerror = finish;
  });
}

async function _seekTo(video, time, timeoutMs = 4000) {
  video.currentTime = time;
  await _waitForEvent(video, "seeked", timeoutMs);
}

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

  // Wait for metadata (with timeout so we don't hang on bad files)
  video.load();
  await _waitForEvent(video, "loadedmetadata", 8000);

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
    await _seekTo(video, time, 3000);

    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvasSize, canvasSize);
    const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
    frames.push(imageData);
    timestamps.push(time);
    // Yield periodically so the spinner / progress bar can repaint.
    if (i % 15 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
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

  // Minimum requirement: the dominant wrist must be visible
  const wrist = getRawKp(keypoints, `${dominantHand}_wrist`);
  if (!wrist || (wrist.score || 0) < 0.3) {
    // Try the other wrist as fallback
    const otherHand = dominantHand === "right" ? "left" : "right";
    const otherWrist = getRawKp(keypoints, `${otherHand}_wrist`);
    if (!otherWrist || (otherWrist.score || 0) < 0.3) return false;
  }

  // At least ONE shoulder must be visible (for body reference)
  const ls = getRawKp(keypoints, "left_shoulder");
  const rs = getRawKp(keypoints, "right_shoulder");
  const hasAnyShoulder = (ls && (ls.score || 0) >= 0.3) || (rs && (rs.score || 0) >= 0.3);
  if (!hasAnyShoulder) return false;

  // That's it — wrist + shoulder = enough to analyze a shot
  // Hips, elbows, etc. are BONUS data, not required
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
  const hipWidths = [];
  let bothEarsCount = 0;
  let oneEarCount = 0;
  let earFrames = 0;

  for (const kps of allKeypoints) {
    const ls = getRawKp(kps, "left_shoulder");
    const rs = getRawKp(kps, "right_shoulder");
    if (ls && rs && (ls.score || 0) > 0.4 && (rs.score || 0) > 0.4) {
      shoulderWidths.push(Math.abs(ls.x - rs.x) / canvasSize);
    }

    // Hip width signal (hips rotate less than shoulders)
    const lh = getRawKp(kps, "left_hip");
    const rh = getRawKp(kps, "right_hip");
    if (lh && rh && (lh.score || 0) > 0.2 && (rh.score || 0) > 0.2) {
      hipWidths.push(Math.abs(lh.x - rh.x) / canvasSize);
    }

    // Ear visibility signal
    const le = getRawKp(kps, "left_ear");
    const re = getRawKp(kps, "right_ear");
    const leVisible = le && (le.score || 0) > 0.3;
    const reVisible = re && (re.score || 0) > 0.3;
    if (leVisible || reVisible) {
      earFrames++;
      if (leVisible && reVisible) bothEarsCount++;
      else oneEarCount++;
    }
  }

  if (shoulderWidths.length === 0) return "unknown";

  // Use median instead of mean for shoulder width (resists swing-rotation outliers)
  const sortedShoulders = [...shoulderWidths].sort((a, b) => a - b);
  const medianShoulderWidth = sortedShoulders[Math.floor(sortedShoulders.length / 2)];

  const sortedHips = [...hipWidths].sort((a, b) => a - b);
  const medianHipWidth = sortedHips.length > 0 ? sortedHips[Math.floor(sortedHips.length / 2)] : null;

  // Shoulder score: front if > 0.07, side if < 0.05
  let shoulderScore = 0; // -1 = side, 0 = angled, 1 = front
  if (medianShoulderWidth > 0.07) shoulderScore = 1;
  else if (medianShoulderWidth < 0.05) shoulderScore = -1;

  // Hip score
  let hipScore = 0;
  if (medianHipWidth !== null) {
    if (medianHipWidth > 0.06) hipScore = 1;
    else if (medianHipWidth < 0.04) hipScore = -1;
  }

  // Ear score: both ears visible = front, one ear = side
  let earScore = 0;
  if (earFrames > 0) {
    const bothRatio = bothEarsCount / earFrames;
    const oneRatio = oneEarCount / earFrames;
    if (bothRatio > 0.5) earScore = 1;
    else if (oneRatio > 0.5) earScore = -1;
  }

  // Weighted voting
  const totalScore = shoulderScore + hipScore + earScore;
  if (totalScore >= 2) return "front";
  if (totalScore <= -2) return "side";
  if (shoulderScore === 1) return "front";
  if (shoulderScore === -1) return "side";
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
  // FIRST: Check which wrist is MORE VISIBLE (higher average confidence).
  // In sports videos, the playing arm is the one you see most clearly.
  let leftVisibleCount = 0, rightVisibleCount = 0;
  let leftConfidenceSum = 0, rightConfidenceSum = 0;
  for (const kps of allKeypoints) {
    const lw = getRawKp(kps, "left_wrist");
    const rw = getRawKp(kps, "right_wrist");
    if (lw && (lw.score || 0) > 0.3) { leftVisibleCount++; leftConfidenceSum += lw.score; }
    if (rw && (rw.score || 0) > 0.3) { rightVisibleCount++; rightConfidenceSum += rw.score; }
  }

  // If one wrist is visible in significantly more frames, that's likely the dominant hand
  const visibilityRatio = Math.max(leftVisibleCount, rightVisibleCount) / Math.max(1, Math.min(leftVisibleCount, rightVisibleCount));
  if (visibilityRatio > 2) {
    // One wrist is 2x+ more visible — strong signal
    return rightVisibleCount > leftVisibleCount ? "right" : "left";
  }

  // If both are similarly visible, use motion-based detection
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

    leftMotions.push(ld);
    rightMotions.push(rd);
  }

  // Weight active frames (top 30% motion) 3x more than passive frames
  const totalSpeeds = leftMotions.map((l, i) => l + rightMotions[i]);
  const sortedSpeeds = [...totalSpeeds].sort((a, b) => b - a);
  const activeThreshold = sortedSpeeds[Math.floor(sortedSpeeds.length * 0.3)] || 0;

  for (let i = 0; i < leftMotions.length; i++) {
    const weight = (totalSpeeds[i] >= activeThreshold) ? 3 : 1;
    leftMotion += leftMotions[i] * weight;
    rightMotion += rightMotions[i] * weight;
  }

  const cumulativeResult = rightMotion > leftMotion ? "right" : "left";

  // Wrist-above-shoulder signal: racket hand goes higher in overhead sports
  let leftAboveCount = 0;
  let rightAboveCount = 0;
  for (const kps of allKeypoints) {
    const lw = getKp(kps, "left_wrist");
    const ls = getKp(kps, "left_shoulder");
    const rw = getKp(kps, "right_wrist");
    const rs = getKp(kps, "right_shoulder");
    if (lw && ls && lw.y < ls.y - 10) leftAboveCount++;
    if (rw && rs && rw.y < rs.y - 10) rightAboveCount++;
  }
  const aboveResult = rightAboveCount > leftAboveCount ? "right" : "left";

  // Cross-validate with top-5 peak frames
  if (leftMotions.length > 0) {
    const wristSpeeds = leftMotions.map((l, i) => ({ idx: i, total: l + rightMotions[i] }));
    wristSpeeds.sort((a, b) => b.total - a.total);
    const topN = Math.min(5, wristSpeeds.length);
    let peakLeft = 0;
    let peakRight = 0;
    for (let k = 0; k < topN; k++) {
      const idx = wristSpeeds[k].idx;
      peakLeft += leftMotions[idx];
      peakRight += rightMotions[idx];
    }
    const peakResult = peakRight > peakLeft ? "right" : "left";

    // Elbow extension signal at peaks: higher average elbow angle = racket arm
    let leftElbowSum = 0, rightElbowSum = 0, elbowCount = 0;
    for (let k = 0; k < topN; k++) {
      const frameIdx = Math.min(wristSpeeds[k].idx + 1, allKeypoints.length - 1);
      const kps = allKeypoints[frameIdx];
      const lShl = getKp(kps, "left_shoulder");
      const lElb = getKp(kps, "left_elbow");
      const lWr = getKp(kps, "left_wrist");
      const rShl = getKp(kps, "right_shoulder");
      const rElb = getKp(kps, "right_elbow");
      const rWr = getKp(kps, "right_wrist");
      if (lShl && lElb && lWr) leftElbowSum += calculateAngle(lShl, lElb, lWr);
      if (rShl && rElb && rWr) rightElbowSum += calculateAngle(rShl, rElb, rWr);
      elbowCount++;
    }
    const elbowResult = (elbowCount > 0 && rightElbowSum > leftElbowSum) ? "right" : "left";

    // Voting: cumulative + peak + above-shoulder + elbow extension
    let rightVotes = 0;
    let leftVotes = 0;
    if (cumulativeResult === "right") rightVotes++; else leftVotes++;
    if (peakResult === "right") rightVotes++; else leftVotes++;
    if (aboveResult === "right") rightVotes++; else leftVotes++;
    if (elbowResult === "right") rightVotes++; else leftVotes++;

    if (rightVotes !== leftVotes) {
      return rightVotes > leftVotes ? "right" : "left";
    }

    // Tie-break: if peak contradicts cumulative and margin is close, trust peak
    if (peakResult !== cumulativeResult) {
      const ratio = Math.min(leftMotion, rightMotion) / Math.max(leftMotion, rightMotion);
      if (ratio > 0.6) {
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

  // Percentile-based threshold (adapts to clip motion profile).
  const nonZero = wristSpeeds.filter((w) => w.speed > 0).sort((a, b) => a.speed - b.speed);
  const pIdx = Math.floor(nonZero.length * 0.65);
  const percentileThresh = nonZero[pIdx]?.speed || 0;
  const avgSpeed = avg(wristSpeeds.map((w) => w.speed));
  // Absolute floor: real swings clear ~0.45 frame-fractions/sec even on
  // slower shots (serves, drops). Idle wandering / setup is usually <0.3.
  // 0.45 catches slower shots like TT/badminton serves while still
  // filtering most non-shot micro-motion. Was 0.6 — too strict, missed serves.
  const ABS_FLOOR = 0.45;
  const threshold = Math.max(
    ABS_FLOOR,
    Math.min(avgSpeed * 1.4, percentileThresh) || 0,
  );

  // Adaptive minimum gap between peaks based on video duration
  const duration = timestamps.length > 0 ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
  const minGap = duration < 15 ? 1.2 : duration < 60 ? 0.7 : 0.4;

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
  const maxShots = duration < 15 ? 6 : duration < 30 ? 12 : duration < 120 ? 30 : duration < 300 ? 60 : 120;
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
/**
 * Determine backhand for a single frame.
 */
function isBackhandShotSingleFrame(keypoints, dominantHand, cameraAngle, canvasSize = MODEL_INPUT_SIZE) {
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
    const elbow = getKp(keypoints, `${dominantHand}_elbow`);
    if (!elbow) return false;
    const pxThresh = 0.05 * canvasSize;
    return elbow.y < wrist.y - pxThresh;
  } else {
    // Angled / unknown: require a margin past the body midline (0.4 of shoulder width).
    const bodyCenter = (oppShoulder.x + sameShl.x) / 2;
    const margin = Math.abs(oppShoulder.x - sameShl.x) * 0.4;
    if (dominantHand === "right") {
      return wrist.x < bodyCenter - margin;
    }
    return wrist.x > bodyCenter + margin;
  }
}

/**
 * Multi-frame voting backhand detection: check peak-2, peak-1, and peak.
 * Also checks wrist trajectory direction: if wrist is moving FROM dominant
 * side TOWARD center, it's a forehand follow-through, not backhand.
 */
function isBackhandShot(allKeypoints, peakIdx, dominantHand, cameraAngle, canvasSize = MODEL_INPUT_SIZE) {
  // If allKeypoints is a single frame array (backward compat), use single frame
  if (!Array.isArray(allKeypoints[0]) && allKeypoints.length > 0 && allKeypoints[0]?.name !== undefined) {
    return isBackhandShotSingleFrame(allKeypoints, dominantHand, cameraAngle, canvasSize);
  }

  let backhandVotes = 0;
  let forehandVotes = 0;

  // Check frames at peak-2, peak-1, peak (pre-impact frames are more indicative)
  for (let offset = -2; offset <= 0; offset++) {
    const idx = peakIdx + offset;
    if (idx >= 0 && idx < allKeypoints.length) {
      const result = isBackhandShotSingleFrame(allKeypoints[idx], dominantHand, cameraAngle, canvasSize);
      if (result) backhandVotes++;
      else forehandVotes++;
    }
  }

  // Wrist trajectory direction check: if wrist moves from dominant side toward center,
  // it's likely a forehand follow-through, not a backhand
  if (peakIdx > 0 && peakIdx < allKeypoints.length) {
    const wristName = `${dominantHand}_wrist`;
    const prevWrist = getKp(allKeypoints[Math.max(0, peakIdx - 1)], wristName);
    const peakWrist = getKp(allKeypoints[peakIdx], wristName);
    const sameShoulder = getKp(allKeypoints[peakIdx], `${dominantHand}_shoulder`);
    const oppShoulder = getKp(allKeypoints[peakIdx], dominantHand === "right" ? "left_shoulder" : "right_shoulder");

    if (prevWrist && peakWrist && sameShoulder && oppShoulder) {
      const bodyCenter = (sameShoulder.x + oppShoulder.x) / 2;
      const movingTowardCenter = dominantHand === "right"
        ? (prevWrist.x > peakWrist.x && prevWrist.x > bodyCenter) // right hand moving left toward center
        : (prevWrist.x < peakWrist.x && prevWrist.x < bodyCenter); // left hand moving right toward center
      if (movingTowardCenter) {
        forehandVotes++; // forehand follow-through
      }
    }
  }

  return backhandVotes > forehandVotes;
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
  for (let offset = -3; offset <= 3; offset++) {
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

  // Camera-aware backhand detection with multi-frame voting
  const isBackhand = isBackhandShot(allKeypoints, peakIdx, dominantHand, cameraAngle);

  // Canvas-normalized vertical offset of the wrist w.r.t. the shoulder.
  // Negative = above shoulder, positive = below. Keypoints are in pixel
  // coordinates on a MODEL_INPUT_SIZE-square canvas.
  const canvasSize = MODEL_INPUT_SIZE;
  const wristShoulderDyNorm = (wrist.y - shoulder.y) / canvasSize;

  // Wrist height flags
  const wristAboveShoulder = wristShoulderDyNorm < -0.015;
  // "Wrist HIGH" — above shoulder by >0.05 normalized (relaxed from -0.1)
  const wristHighAboveShoulder = wristShoulderDyNorm < -0.05;
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

  // "Was above" lookback: check if wrist was above shoulder in any of the 3 frames before peak
  let wasAboveShoulder = false;
  for (let lookback = 1; lookback <= 3; lookback++) {
    const prevIdx = peakIdx - lookback;
    if (prevIdx >= 0) {
      const prevW = getKp(allKeypoints[prevIdx], wristName);
      const prevS = getKp(allKeypoints[prevIdx], shoulderName);
      if (prevW && prevS && (prevW.y - prevS.y) / canvasSize < -0.015) {
        wasAboveShoulder = true;
        break;
      }
    }
  }

  const features = {
    aboveShoulder: wristAboveShoulder,
    highAboveShoulder: wristHighAboveShoulder,
    wasAboveShoulder,
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
  } else if (sport === "cricket") {
    ({ type, confidence } = classifyCricketShot(features));
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
  const { aboveShoulder, highAboveShoulder, wasAboveShoulder, belowHip, isBackhand, velY, velX, elbowAngle, speed, nearShoulder } = f;
  // velY/velX are torso-normalized displacements (pixel coords / torsoLength).
  // speed is torso-normalized velocity (pixel dist / torsoLength / dt).
  // Typical ranges on 256px canvas: velY +-0.01..0.5, velX 0..0.3, speed 0.1..5.0
  let type;
  let confidence;

  // "Was above" or currently high above counts as overhead
  const isOverhead = highAboveShoulder || wasAboveShoulder;

  // Forehand gets slightly higher base confidence than backhand.
  const fhBoost = isBackhand ? 0.0 : 0.08;

  // SIMPLE RULE: In badminton, arm position is the strongest signal.
  // Overhead (wrist above shoulder) = smash/clear/drop. NOT a drive.
  // Drive = arm at shoulder height (horizontal shot)
  // Below = net shot, serve, lift

  if (belowHip && speed < 0.15) {
    type = "serve"; confidence = 0.65 + fhBoost;
  } else if (belowHip && velY < -0.02) {
    type = "lift"; confidence = 0.58 + fhBoost;
  } else if (isOverhead || aboveShoulder) {
    // ARM IS UP = overhead shot. Now distinguish smash vs clear vs drop.
    if (velY > 0.01 && speed > 0.1) {
      // Downward velocity + speed = SMASH (most common overhead shot)
      type = "smash"; confidence = 0.80 + fhBoost;
    } else if (speed < 0.08) {
      // Slow overhead = drop shot
      type = "drop"; confidence = 0.65 + fhBoost;
    } else {
      // Not clearly downward, not slow = clear
      type = "clear"; confidence = 0.68 + fhBoost;
    }
  } else if (nearShoulder && velX > 0.02) {
    // Arm at shoulder height + horizontal motion = DRIVE
    type = "drive"; confidence = 0.66 + fhBoost;
  } else if (!aboveShoulder && speed < 0.08) {
    type = "net_shot"; confidence = 0.60 + fhBoost;
  } else {
    // Default to drive for shoulder-height shots
    type = "drive"; confidence = 0.45 + fhBoost;
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

  // Forehand/backhand confidence boost for TT
  const fhBoost = isBackhand ? 0.0 : 0.06;

  // Loop: wrist clearly goes UP across a 5-frame window (relaxed from -0.04 to -0.025).
  const loopUpward = wristDyWindowNorm < -0.025;

  if (speed > 0.35 && nearShoulder && velX > 0.04 && Math.abs(velY) < 0.02) {
    // Very fast flat smash, wrist near shoulder height.
    type = "smash"; confidence = 0.75;
  } else if (loopUpward && speed > 0.15) {
    type = isBackhand ? "backhand_loop" : "forehand_loop";
    confidence = 0.72 + fhBoost;
  } else if (velY > 0.03 && velX < 0.02) {
    type = "chop"; confidence = 0.68;
  } else if (belowHip && speed < 0.1) {
    type = "serve"; confidence = 0.64;
  } else if (nearShoulder && speed > 0.06 && velX > 0.015) {
    type = isBackhand ? "backhand_drive" : "forehand_drive";
    confidence = 0.66 + fhBoost;
  } else if (speed < 0.08) {
    type = speed < 0.03 ? "block" : "push";
    confidence = 0.55;
  } else if (speed > 0.18 && elbowAngle > 140) {
    type = "flick"; confidence = 0.58;
  } else {
    type = isBackhand ? "backhand_drive" : "forehand_drive";
    confidence = 0.45 + fhBoost;
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

/**
 * Classify a cricket shot from motion features at the peak frame.
 *
 * @param {object} f - Feature bundle
 * @returns {{ type: string, confidence: number }}
 */
function classifyCricketShot(f) {
  const { aboveShoulder, highAboveShoulder, wasAboveShoulder, belowHip, nearShoulder, isBackhand, velY, velX, elbowAngle, speed, wristShoulderDyNorm } = f;
  let type;
  let confidence;

  // Bowling action: full arm rotation + high speed + arm above shoulder + extended elbow
  if ((highAboveShoulder || wasAboveShoulder) && speed > 0.25 && elbowAngle > 150) {
    type = "bowling_action"; confidence = 0.75;
  }
  // Pull: horizontal swing from behind body + wrist above hip level + fast
  else if (nearShoulder && velX > 0.04 && speed > 0.15 && !aboveShoulder) {
    type = "pull"; confidence = 0.68;
  }
  // Cut: horizontal swing + wrist near shoulder + compact motion
  else if (nearShoulder && velX > 0.03 && speed > 0.1 && !aboveShoulder) {
    type = "cut"; confidence = 0.65;
  }
  // Sweep: wrist goes low + horizontal motion
  else if (belowHip && velX > 0.02 && speed > 0.08) {
    type = "sweep"; confidence = 0.62;
  }
  // Drives: wrist high + downward arc
  else if (aboveShoulder && velY > 0.02 && speed > 0.12) {
    // Straight drive vs cover drive: cover drive has more lateral motion
    if (velX > 0.03) {
      type = "cover_drive"; confidence = 0.68;
    } else {
      type = "straight_drive"; confidence = 0.70;
    }
  }
  // Forward defense: wrist low + compact + slow
  else if (!aboveShoulder && speed < 0.08 && velY > 0) {
    type = "forward_defense"; confidence = 0.64;
  }
  // Back foot defense: compact + slightly above or at shoulder + slow
  else if (!aboveShoulder && speed < 0.1 && velY <= 0) {
    type = "back_foot_defense"; confidence = 0.60;
  }
  // Fallback: if wrist is high, probably a drive; otherwise defense
  else if (aboveShoulder) {
    type = speed > 0.1 ? "straight_drive" : "forward_defense";
    confidence = 0.45;
  } else {
    type = "forward_defense"; confidence = 0.40;
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
  cricket:      { factor: 50,  minPlausible: 15, maxPlausible: 160 },
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
    // Cricket
    straight_drive: 1.1, cover_drive: 1.05, pull: 1.15, cut: 1.0,
    sweep: 0.85, forward_defense: 0.4, back_foot_defense: 0.45, bowling_action: 1.3,
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
 * Extract small cropped snippets of the SELECTED PLAYER at each shot moment,
 * for use as visual proof in shot result cards. Crops to the user's
 * `customCropBox` (expanded slightly for movement headroom). When no box
 * is provided (auto-detect), returns null per shot so the UI omits the
 * snippet rather than showing arbitrary regions.
 *
 * Returns: Array<base64-jpeg-string|null>  (one per peakTime)
 */
/**
 * Re-encode a video file at a lower resolution + bitrate so it fits Vercel's
 * 4.5 MB request body limit. Uses HTML5 canvas + MediaRecorder to draw each
 * frame at the target size and capture into a Blob.
 *
 * Returns the smaller Blob (or the original file if compression isn't
 * supported or actually grows the file).
 *
 * Options:
 *   maxDim: longest output side (default 480)
 *   bitrate: video bits/sec (default 800_000 = ~0.8 Mbps)
 *   maxDurationSec: hard trim cap (default 30s)
 *   onProgress: (pct) => void
 */
export async function compressVideoForUpload(videoFile, options = {}) {
  const {
    maxDim = 480,
    bitrate = 800_000,
    // Was 30 (and AnalyzePage was overriding to 20, sometimes 15 for
    // big inputs) which silently cut off the END of any video longer
    // than the cap — users reported "Gemini only saw the prep, not
    // the shot" for clips where the action lands late. 90s is long
    // enough for full coaching clips while still bounded; the retry
    // ladder in compressUnderSize will drop quality (not duration)
    // first to fit Vercel's 4.5MB body cap.
    maxDurationSec = 90,
    onProgress,
    // Skip compression for any file below this size — modern phones produce
    // 6-12 MB for a short clip, well under Vercel's 25 MB cap. Compression
    // was the SLOWEST step (50s+ for a 17s clip via canvas seek-loop), and
    // most of the time it wasn't even saving meaningful bytes. Raised from
    // 3 MB → 15 MB.
    skipBelowBytes = 15 * 1024 * 1024,
    // playbackRate MUST be 1.0 for correct output.
    //
    // Strategy A records the canvas in WALL-CLOCK time while the source
    // plays at `playbackRate`. So the encoded file's duration =
    // sourceDuration / playbackRate. A 4x rate turned a real 10s clip into
    // a 2.7s file where everything moves 4x faster. Two things broke:
    //   1. Gemini saw ~4x fewer frames of each shot — the racket/ball
    //      contact moment blurred across 1-2 frames and got missed
    //      (the "5 chip shots, only 1 detected" undercount).
    //   2. Gemini timestamped events in the 2.7s sped-up domain, but the
    //      analysis page plays the ORIGINAL clip — so every "0:01" landed
    //      ~4x too early ("timestamp in the video is wrong").
    // Size is controlled entirely by bitrate + resolution (480p/800kbps ≈
    // 100 KB per real second), so the speed-up never helped the file cap —
    // it only corrupted time. Real-time capture is slightly slower to
    // encode but keeps timestamps and frame coverage truthful.
    playbackRate = 1.0,
  } = options;

  // Fast exit: file is already small enough — Vercel accepts up to 25 MB.
  // For nearly all phone-recorded short clips this returns immediately.
  if (videoFile.size <= skipBelowBytes) {
    if (onProgress) onProgress(100);
    return videoFile;
  }

  // Feature detect — MediaRecorder + captureStream are needed
  if (typeof window === "undefined" || !window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    console.warn("[compress] MediaRecorder/captureStream not supported — sending original");
    return videoFile;
  }

  // Pick the smallest MIME the browser can encode. Mp4 preferred for Gemini.
  let mimeType = "";
  for (const t of [
    "video/mp4;codecs=avc1.42E01E",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]) {
    if (window.MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
  }
  if (!mimeType) {
    console.warn("[compress] no supported MIME for MediaRecorder — sending original");
    return videoFile;
  }

  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(videoFile);
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.load();
  try {
    await _waitForEvent(video, "loadedmetadata", 8000);
  } catch {
    URL.revokeObjectURL(objectUrl);
    return videoFile;
  }

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const duration = Math.min(video.duration || 0, maxDurationSec);
  if (!duration || !vw || !vh) {
    URL.revokeObjectURL(objectUrl);
    return videoFile;
  }

  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const outW = Math.max(2, Math.round(vw * scale / 2) * 2);  // even
  const outH = Math.max(2, Math.round(vh * scale / 2) * 2);

  // ── Strategy A (FAST): playbackRate-based real-time-x4 capture ─────
  // The old seek-loop strategy did 340 seeks for a 17s video — each
  // seek-and-decode took 100-300ms in Chrome = ~50s of wall time for a
  // 17s video. The new strategy plays the video at 4x speed and records
  // the canvas in real time. Wall time: duration_sec / playback_rate ≈
  // 4-8s for a 30s source. Frames are drawn via requestAnimationFrame
  // (paced by the video itself, not manual seeking).
  const PLAYBACK_RATE = playbackRate;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");

  // captureStream(fps) — give the stream a target frame rate so the
  // recorder doesn't starve when the video element pauses for buffering.
  const stream = canvas.captureStream(20);
  const recorder = new window.MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  // Try the fast playbackRate path first; fall back to the seek-loop only
  // if the browser refuses to honor playbackRate > 2 (some Android setups).
  let fastPathOk = true;
  try {
    video.playbackRate = PLAYBACK_RATE;
    // Some browsers silently cap playbackRate. Read it back to confirm.
    if (video.playbackRate < PLAYBACK_RATE - 0.1) {
      console.warn(`[compress] playbackRate capped at ${video.playbackRate} — slower compression path`);
      fastPathOk = false;
    }
  } catch {
    fastPathOk = false;
  }

  if (fastPathOk) {
    recorder.start(200);
    let rafId = null;
    let lastDrawnTime = -1;
    const drawLoop = () => {
      if (video.ended || video.currentTime >= duration) return;
      const t = video.currentTime;
      if (t !== lastDrawnTime) {
        try { ctx.drawImage(video, 0, 0, outW, outH); } catch {}
        lastDrawnTime = t;
        if (onProgress) onProgress(Math.min(99, Math.round((t / duration) * 100)));
      }
      rafId = requestAnimationFrame(drawLoop);
    };
    const playEnded = new Promise((resolve) => {
      const finish = () => { resolve(); };
      video.addEventListener("ended", finish, { once: true });
      // STALL-based watchdog (NOT wall-clock). A large / high-bitrate source
      // (50-100MB, 4K) decodes SLOWER than real time, so currentTime advances
      // slower than the wall clock. The old fixed wall-clock cap fired early
      // and TRUNCATED the clip — Gemini then only saw the first few seconds
      // and returned "no shot detected". Instead we only give up if the
      // decoder genuinely WEDGES (currentTime stops advancing for ~12s), with
      // a very generous absolute backstop so the full clip is always captured.
      let lastT = -1;
      let stalls = 0;
      const iv = setInterval(() => {
        const t = video.currentTime;
        if (t >= duration - 0.05 || video.ended) { clearInterval(iv); finish(); return; }
        if (t - lastT < 0.02) {
          stalls += 1;
          if (stalls >= 24) { clearInterval(iv); finish(); }  // ~12s no progress
        } else { stalls = 0; lastT = t; }
      }, 500);
      // Absolute backstop — only a truly dead decode reaches this.
      setTimeout(() => { clearInterval(iv); finish(); }, 8 * 60 * 1000);
    });
    try {
      await video.play();
      drawLoop();
      // Also auto-stop when we cross the duration cap (in case the source
      // is longer than maxDurationSec and `ended` never fires within our window)
      const hitCap = new Promise((resolve) => {
        const check = () => {
          if (video.currentTime >= duration - 0.05 || video.ended) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
      await Promise.race([playEnded, hitCap]);
    } catch (err) {
      console.warn("[compress] playbackRate path failed:", err);
      fastPathOk = false;
    } finally {
      if (rafId) cancelAnimationFrame(rafId);
      try { video.pause(); } catch {}
    }
  }

  if (!fastPathOk) {
    // ── Strategy B (SLOW FALLBACK): seek-loop @ 15 fps ────────────────
    // Reduced from 20 → 15 fps to cut wall-time by 25% while staying
    // visually adequate for AI analysis (Gemini samples at 3 fps anyway).
    const track = stream.getVideoTracks()[0];
    const requestFrame = (track && typeof track.requestFrame === "function")
      ? track.requestFrame.bind(track)
      : null;
    // The fast path may have already called recorder.start() before
    // video.play() threw — on mobile (especially iOS Safari) autoplay
    // gets blocked here. Calling start() a second time throws
    // "InvalidStateError: MediaRecorder's state must be inactive".
    // Only start if we haven't already. The recorder keeps capturing
    // from the canvas as we drive frames via drawImage() below.
    if (recorder.state === "inactive") {
      try { recorder.start(200); } catch (e) {
        console.warn("[compress] slow-path recorder.start failed:", e?.message || e);
      }
    }
    const fps = 15;
    const step = 1 / fps;
    for (let t = 0; t < duration; t += step) {
      try {
        video.currentTime = t;
        await _waitForEvent(video, "seeked", 1500);
        ctx.drawImage(video, 0, 0, outW, outH);
        if (requestFrame) requestFrame();
        if (onProgress) onProgress(Math.round((t / duration) * 100));
      } catch { /* skip undecodable frames */ }
    }
  }

  // Symmetric guard: if neither path ever started the recorder (both
  // failed silently), calling .stop() on an inactive recorder throws.
  // Resolve immediately in that case so the function still returns.
  const stopped = new Promise((resolve) => {
    if (recorder.state === "inactive") { resolve(); return; }
    recorder.onstop = resolve;
  });
  try {
    if (recorder.state !== "inactive") recorder.stop();
  } catch (e) {
    console.warn("[compress] recorder.stop failed:", e?.message || e);
  }
  await stopped;
  try { stream.getTracks().forEach((t) => t.stop()); } catch {}
  URL.revokeObjectURL(objectUrl);

  const outBlob = new Blob(chunks, { type: mimeType });
  if (outBlob.size === 0 || outBlob.size >= videoFile.size) {
    console.warn(`[compress] no win (${outBlob.size} >= ${videoFile.size}) — sending original`);
    return videoFile;
  }
  console.info(`[compress] ${(videoFile.size / 1024).toFixed(0)} KB -> ${(outBlob.size / 1024).toFixed(0)} KB (${outW}x${outH} @ ${bitrate / 1000} kbps, fast=${fastPathOk})`);
  if (onProgress) onProgress(100);
  const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  return new File([outBlob], `compressed.${ext}`, { type: mimeType });
}


/**
 * compressUnderSize — wraps compressVideoForUpload with a retry ladder
 * so the output is guaranteed to fit under `targetBytes` (or we throw a
 * specific, helpful error).
 *
 * Why this exists:
 *   compressVideoForUpload's skipBelowBytes default (15 MB) means small
 *   phone clips (5-12 MB) bypass compression entirely and get returned
 *   as-is. That's correct for Vercel's 25 MB raw cap, but breaks for
 *   the analyze endpoints which have a 4-4.5 MB body cap. And even when
 *   compression DOES run, the bitrate is a target, not a guarantee —
 *   high-motion content can overshoot by 30-50%.
 *
 * Strategy:
 *   1. First attempt at the caller's preferred preset, but with
 *      skipBelowBytes forced to targetBytes (so anything over the cap
 *      gets compressed, no exceptions).
 *   2. If still over target, retry at progressively tighter rungs:
 *      - 90% bitrate, same dims/duration
 *      - 70% bitrate, 0.8x maxDim
 *      - 50% bitrate, 0.66x maxDim, 0.8x duration
 *   3. After all rungs, throw with a clear "trim this clip" message
 *      that includes the actual size + the cap.
 */
export async function compressUnderSize(videoFile, targetBytes, options = {}) {
  const {
    maxDim = 480,
    bitrate = 800_000,
    // Default raised from 30 to 90. Users reported the back end of
    // their clips being cut off ("Gemini saw the prep but not the
    // shot"), which traced back to compressVideoForUpload's hardcoded
    // duration cap. We now preserve full video duration up to 90s and
    // only fall back to trimming on the LOWEST retry rung when every
    // bitrate/resolution shrink has already overshot the size cap.
    maxDurationSec = 90,
    onProgress,
    playbackRate,  // optional override; auto-picked below when undefined
  } = options;

  // playbackRate is forced to 1.0 (real-time capture). The old size-based
  // auto-speedup (4x/6x/8x) compressed the output's TIME axis, not just its
  // bytes — a 10s clip became a 2.7s file with everything sped up 4x, which
  // made Gemini miss fast shots and report timestamps in the wrong (sped-up)
  // domain. See the long note in compressVideoForUpload. Bitrate/resolution
  // alone (dropped across the retry ladder below) handle the size cap.
  // A manual override is still honored for callers that knowingly accept the
  // temporal distortion, but nothing in the app sets it anymore.
  const effectiveRate = typeof playbackRate === "number" ? playbackRate : 1.0;

  // Size-estimate convergence (replaces the old fixed rung ladder).
  //
  // The killer on iPhone: Safari's MediaRecorder frequently IGNORES the
  // bitrate setting, so lowering bitrate alone doesn't shrink the file
  // ("still too large after compression" → upload exceeds the cap → the
  // universal timeout/error users hit on iOS while Android works). The lever
  // that ALWAYS reduces size is RESOLUTION (and, last resort, duration).
  //
  // So instead of stepping through many fixed rungs (each a slow full
  // re-encode that compounds into a timeout on iOS), we measure the first
  // result and jump straight to the resolution that should fit: encoded size
  // scales ~ with pixel count, so scale maxDim by sqrt(target/actual) with a
  // safety margin. Converges in ~2 attempts; only trims duration once the
  // resolution is already small (i.e. the clip is genuinely too long).
  const attempt = (dim, br, dur, withProgress) =>
    compressVideoForUpload(videoFile, {
      maxDim: Math.max(180, Math.round(dim)),
      bitrate: Math.max(220_000, Math.round(br)),
      maxDurationSec: dur,
      playbackRate: effectiveRate,
      skipBelowBytes: targetBytes,
      onProgress: withProgress ? onProgress : undefined,
    });

  let best = null;
  let dim = maxDim;
  let br = bitrate;
  let dur = maxDurationSec;
  for (let i = 0; i < 5; i++) {
    const result = await attempt(dim, br, dur, i === 0);
    if (!best || result.size < best.size) best = result;
    if (result.size <= targetBytes) {
      if (i > 0) {
        console.info(`[compress-fit] fit on attempt ${i + 1} (${(result.size / 1024).toFixed(0)} KB @ ${Math.round(dim)}px, ${dur}s)`);
      }
      return result;
    }
    const overshoot = result.size / targetBytes; // > 1
    console.warn(`[compress-fit] attempt ${i + 1} over by ${overshoot.toFixed(1)}x: ${(result.size / 1024).toFixed(0)} KB @ ${Math.round(dim)}px`);
    // Drop resolution by sqrt(overshoot) (size ~ pixel count) + a 10% margin.
    dim = (dim / Math.sqrt(overshoot)) * 0.9;
    br = br * 0.6;
    // Once we're already small and STILL over, the clip is just too long —
    // start trimming duration as well.
    if (dim < 280 && dur > 18) {
      dur = Math.max(12, Math.round(dur * 0.6));
    }
  }

  // Couldn't fit even tiny — surface a clear, actionable error.
  const sizeMb = (best?.size || videoFile.size) / 1024 / 1024;
  const capMb = targetBytes / 1024 / 1024;
  const e = new Error(`This clip is ${sizeMb.toFixed(1)} MB even after compression (cap ${capMb.toFixed(1)} MB). Record a shorter clip (~10–15s) or at a lower resolution and try again.`);
  e.code = "COMPRESSION_OVERSHOOT";
  e.bestResult = best;
  throw e;
}


/**
 * countPeopleQuick — fast client-side athlete count used to SKIP the
 * /describe-players Gemini pre-pass (25-45s of wall time) when only one
 * person is visible. Samples a few frames spread across the clip, runs
 * MoveNet MultiPose on each, and returns the MAX simultaneous person
 * count seen. Conservative on purpose: any frame with 2+ people means
 * "run the real picker"; only a clean 0-1 across all samples skips it.
 *
 * Throws on any failure — callers treat errors as "don't skip".
 *
 * @param {File|Blob} videoFile
 * @param {Object} [options]
 * @param {number} [options.frameCount=3]
 * @param {number} [options.minScore=0.25] - person detection confidence floor
 * @returns {Promise<number>} max people seen in any sampled frame
 */
export async function countPeopleQuick(videoFile, options = {}) {
  const { frameCount = 3, minScore = 0.25 } = options;
  await initMultiPoseModel();

  const video = document.createElement("video");
  const url = URL.createObjectURL(videoFile);
  video.src = url; video.muted = true; video.playsInline = true;
  video.load();
  try {
    await _waitForEvent(video, "loadedmetadata", 6000);
    const duration = video.duration;
    if (!duration || !isFinite(duration)) throw new Error("no duration");

    // Detection canvas at a modest size — MultiPose Lightning is built
    // for 256px-class inputs; bigger buys nothing but latency here.
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.min(1, 512 / Math.max(vw, vh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(vw * scale));
    canvas.height = Math.max(2, Math.round(vh * scale));
    const ctx = canvas.getContext("2d");

    let maxPeople = 0;
    // Sample mid-clip fractions — endpoints often show walk-on/walk-off.
    const fractions = frameCount === 3 ? [0.25, 0.5, 0.75]
      : Array.from({ length: frameCount }, (_, i) => (i + 1) / (frameCount + 1));
    for (const f of fractions) {
      await _seekTo(video, Math.min(duration - 0.05, duration * f), 3000);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const people = await detectMultiplePeople(canvas);
      const real = (people || []).filter((p) => {
        if ((p.score || 0) < minScore) return false;
        // Ignore tiny background figures (<1.5% of frame area) — they're
        // spectators/passers-by, not pickable athletes.
        const area = (p.box?.width || 0) * (p.box?.height || 0);
        const frameArea = canvas.width * canvas.height;
        return area > frameArea * 0.015;
      });
      maxPeople = Math.max(maxPeople, real.length);
      if (maxPeople >= 2) break; // early exit — picker is needed anyway
    }
    return maxPeople;
  } finally {
    URL.revokeObjectURL(url);
  }
}


export async function extractPlayerSnippets(videoFile, peakTimes, customCropBox, options = {}) {
  if (!peakTimes || peakTimes.length === 0) return [];
  const { maxDim = 180, jpegQuality = 0.7, expandFactor = 1.5 } = options;

  const video = document.createElement("video");
  const url = URL.createObjectURL(videoFile);
  video.src = url; video.muted = true; video.playsInline = true; video.crossOrigin = "anonymous";
  video.load();
  await _waitForEvent(video, "loadedmetadata", 6000);
  const duration = video.duration;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!duration || !vw || !vh) { URL.revokeObjectURL(url); return peakTimes.map(() => null); }

  // Determine source rect: prefer the explicit player bbox (expanded 1.5x);
  // when no bbox is available (target=auto, doubles auto-select, etc.) fall
  // back to a center-square crop of the full frame so every shot still gets
  // a thumbnail. This ensures the UI always has a visual reference per shot.
  let sx, sy, sw, sh;
  if (customCropBox) {
    const cx = customCropBox.x + customCropBox.width / 2;
    const cy = customCropBox.y + customCropBox.height / 2;
    const ew = Math.min(1, customCropBox.width * expandFactor);
    const eh = Math.min(1, customCropBox.height * expandFactor);
    const ex = Math.max(0, Math.min(1 - ew, cx - ew / 2));
    const ey = Math.max(0, Math.min(1 - eh, cy - eh / 2));
    sx = Math.round(ex * vw); sy = Math.round(ey * vh);
    sw = Math.max(1, Math.round(ew * vw)); sh = Math.max(1, Math.round(eh * vh));
  } else {
    // Center-square crop on the shorter edge so the thumbnail isn't a thin
    // strip on landscape videos.
    const side = Math.min(vw, vh);
    sx = Math.round((vw - side) / 2);
    sy = Math.round((vh - side) / 2);
    sw = side; sh = side;
  }

  // Output sized to maxDim on the longest side
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");

  const out = [];
  for (const t of peakTimes) {
    try {
      await _seekTo(video, Math.max(0.01, Math.min(duration - 0.01, t)), 3000);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
      out.push(canvas.toDataURL("image/jpeg", jpegQuality));
    } catch {
      out.push(null);
    }
  }
  URL.revokeObjectURL(url);
  return out;
}


/**
 * Extract a single full-frame keyframe from the middle of the video
 * for use as a backdrop in the player picker (so we can overlay Gemini
 * bboxes on it). Returns { dataUrl, width, height }.
 */
export async function extractMidFrameKeyframe(videoFile, options = {}) {
  const { maxDim = 720, jpegQuality = 0.78, atFraction = 0.5 } = options;
  const video = document.createElement("video");
  const url = URL.createObjectURL(videoFile);
  video.src = url; video.muted = true; video.playsInline = true; video.crossOrigin = "anonymous";
  video.load();
  await _waitForEvent(video, "loadedmetadata", 6000);
  const duration = video.duration;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!duration || !vw || !vh) { URL.revokeObjectURL(url); return null; }
  await _seekTo(video, Math.max(0.01, Math.min(duration - 0.01, duration * atFraction)), 3000);
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const outW = Math.max(1, Math.round(vw * scale));
  const outH = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");
  try {
    ctx.drawImage(video, 0, 0, vw, vh, 0, 0, outW, outH);
    const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
    URL.revokeObjectURL(url);
    return { dataUrl, width: outW, height: outH, originalWidth: vw, originalHeight: vh };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}


/**
 * Extract one mini-thumbnail per player from a single mid-video frame
 * using their bbox in normalized [0..1] coordinates. Falls back to a
 * center-square crop when bbox is null/invalid. Returns Array<dataUrl>.
 */
export async function extractPlayerThumbnails(videoFile, seekSec, bboxes, options = {}) {
  const { maxDim = 160, jpegQuality = 0.75, padFactor = 1.25 } = options;
  if (!bboxes || bboxes.length === 0) return [];

  const video = document.createElement("video");
  const url = URL.createObjectURL(videoFile);
  video.src = url; video.muted = true; video.playsInline = true; video.crossOrigin = "anonymous";
  video.load();
  await _waitForEvent(video, "loadedmetadata", 6000);
  const duration = video.duration;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!duration || !vw || !vh) { URL.revokeObjectURL(url); return bboxes.map(() => null); }
  await _seekTo(video, Math.max(0.01, Math.min(duration - 0.01, seekSec)), 3000);

  const out = [];
  for (const bb of bboxes) {
    let sx, sy, sw, sh;
    if (bb && typeof bb === "object" && bb.width > 0 && bb.height > 0) {
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      const ew = Math.min(1, bb.width * padFactor);
      const eh = Math.min(1, bb.height * padFactor);
      const ex = Math.max(0, Math.min(1 - ew, cx - ew / 2));
      const ey = Math.max(0, Math.min(1 - eh, cy - eh / 2));
      sx = Math.round(ex * vw); sy = Math.round(ey * vh);
      sw = Math.max(1, Math.round(ew * vw)); sh = Math.max(1, Math.round(eh * vh));
    } else {
      const side = Math.min(vw, vh);
      sx = Math.round((vw - side) / 2);
      sy = Math.round((vh - side) / 2);
      sw = side; sh = side;
    }
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const outW = Math.max(1, Math.round(sw * scale));
    const outH = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext("2d");
    try {
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
      out.push(canvas.toDataURL("image/jpeg", jpegQuality));
    } catch {
      out.push(null);
    }
  }
  URL.revokeObjectURL(url);
  return out;
}


/**
 * Extract 1-2 keyframes from the middle of the video for sport auto-detect.
 * Returns Array<base64-jpeg>.
 */
export async function extractDetectKeyframes(videoFile, options = {}) {
  const { count = 2, maxDim = 480, jpegQuality = 0.6 } = options;
  const video = document.createElement("video");
  const url = URL.createObjectURL(videoFile);
  video.src = url; video.muted = true; video.playsInline = true; video.crossOrigin = "anonymous";
  video.load();
  await _waitForEvent(video, "loadedmetadata", 6000);
  const duration = video.duration;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!duration || !vw || !vh) { URL.revokeObjectURL(url); return []; }

  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const outW = Math.max(1, Math.round(vw * scale));
  const outH = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");

  const times = count <= 1 ? [duration / 2] : [duration * 0.33, duration * 0.66];
  const out = [];
  for (const t of times) {
    try {
      await _seekTo(video, Math.min(t, duration - 0.01), 3000);
      ctx.drawImage(video, 0, 0, vw, vh, 0, 0, outW, outH);
      out.push(canvas.toDataURL("image/jpeg", jpegQuality));
    } catch {}
  }
  URL.revokeObjectURL(url);
  return out;
}


/**
 * Extract a small set of keyframes per shot moment for VLM classification.
 * For each peak time, captures frames around it (default: peak-0.3s, peak,
 * peak+0.3s).
 *
 * IMPORTANT: we no longer crop tightly to the selected player's bbox. The
 * player moves around the court during a rally, so a static crop quickly
 * captures the wrong person (or empty court). Instead we send a wider region
 * (or the full frame for doubles) and let Gemini identify the target player
 * via spatial hints in the prompt.
 *
 * options.isMultiPlayer: when true, send the FULL frame so Gemini sees all
 *   players in context. Caller is expected to pass a "focus on the {position}
 *   player" hint in the prompt.
 * options.expandFactor: when isMultiPlayer is false, multiply the customCropBox
 *   by this factor to capture some surrounding court (default 1.5 = 50% wider).
 *
 * Returns: Array<Array<base64-jpeg-string>>
 */
export async function extractKeyframesPerShot(videoFile, peakTimes, customCropBox = null, options = {}) {
  const {
    framesPerShot = 3, maxDim = 720, jpegQuality = 0.7,
    offsets = [-0.3, 0, 0.3], isMultiPlayer = false,
    // When a target box is provided, draw a red rectangle around the target
    // player on the FULL frame instead of cropping. Keeps shuttle/ball
    // trajectory, court lines, and opponent context intact for the VLM while
    // still disambiguating which player to focus on. Same token cost as the
    // previous crop path. Disable with annotateTargetBox=false to fall back
    // to the legacy crop (useful for A/B testing).
    annotateTargetBox = true,
    boxConfidence = 1.0,
    expandFactor = 1.5,
  } = options;
  if (!peakTimes || peakTimes.length === 0) return [];

  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(videoFile);
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  video.load();
  await _waitForEvent(video, "loadedmetadata", 6000);

  const duration = video.duration;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!duration || !isFinite(duration) || !vw || !vh) {
    URL.revokeObjectURL(objectUrl);
    return [];
  }

  // Decide annotate-vs-crop. We annotate when we have a target box AND
  // confidence is high enough to trust it. Falls back to legacy crop only
  // when annotateTargetBox is explicitly disabled.
  const useAnnotate = !!(customCropBox && annotateTargetBox && boxConfidence >= 0.7);
  const useCrop = !!(customCropBox && !isMultiPlayer && !useAnnotate);

  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (useCrop) {
    // Legacy single-player crop (kept for A/B). Loses shuttle context — only
    // used when annotation is explicitly disabled.
    const cx = customCropBox.x + customCropBox.width / 2;
    const cy = customCropBox.y + customCropBox.height / 2;
    const ew = Math.min(1, customCropBox.width * expandFactor);
    const eh = Math.min(1, customCropBox.height * expandFactor);
    const ex = Math.max(0, Math.min(1 - ew, cx - ew / 2));
    const ey = Math.max(0, Math.min(1 - eh, cy - eh / 2));
    sx = Math.round(ex * vw);
    sy = Math.round(ey * vh);
    sw = Math.max(1, Math.round(ew * vw));
    sh = Math.max(1, Math.round(eh * vh));
  }
  // For annotated frames and multi-player full frames, sx/sy/sw/sh stay at
  // full video dimensions.

  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");

  // Pre-compute box draw rect in output-canvas coordinates (only used when
  // useAnnotate). Scale from normalized video coords to output canvas coords.
  let boxRect = null;
  if (useAnnotate) {
    const bx = Math.max(0, Math.min(1, customCropBox.x));
    const by = Math.max(0, Math.min(1, customCropBox.y));
    const bw = Math.max(0.02, Math.min(1 - bx, customCropBox.width));
    const bh = Math.max(0.02, Math.min(1 - by, customCropBox.height));
    boxRect = {
      x: Math.round(bx * outW),
      y: Math.round(by * outH),
      w: Math.round(bw * outW),
      h: Math.round(bh * outH),
    };
  }

  const useOffsets = framesPerShot === 3 ? offsets : Array.from({ length: framesPerShot }, (_, i) =>
    -0.4 + (0.8 * i) / Math.max(1, framesPerShot - 1)
  );

  const out = [];
  for (const peakTime of peakTimes) {
    const shotFrames = [];
    for (const offs of useOffsets) {
      const t = Math.max(0.01, Math.min(duration - 0.01, peakTime + offs));
      try {
        await _seekTo(video, t, 3000);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
        if (boxRect) {
          // Bright red box + small TARGET label so the VLM has an
          // unambiguous anchor for "which player is this analysis about".
          const lineW = Math.max(3, Math.round(outW / 220));
          ctx.lineWidth = lineW;
          ctx.strokeStyle = "rgb(255, 40, 40)";
          ctx.strokeRect(boxRect.x, boxRect.y, boxRect.w, boxRect.h);
          // Label background
          const fontPx = Math.max(11, Math.round(outW / 65));
          ctx.font = `bold ${fontPx}px sans-serif`;
          const label = "TARGET";
          const padX = 4, padY = 2;
          const textW = ctx.measureText(label).width;
          const labelX = boxRect.x;
          const labelY = Math.max(fontPx + padY * 2, boxRect.y) - (fontPx + padY);
          ctx.fillStyle = "rgb(255, 40, 40)";
          ctx.fillRect(labelX, labelY, textW + padX * 2, fontPx + padY * 2);
          ctx.fillStyle = "rgb(255, 255, 255)";
          ctx.textBaseline = "top";
          ctx.fillText(label, labelX + padX, labelY + padY);
        }
        const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
        shotFrames.push(dataUrl);
      } catch {
        // Skip this offset if seek failed
      }
    }
    out.push(shotFrames);
  }

  URL.revokeObjectURL(objectUrl);
  return out;
}


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
export async function scanVideoForPlayers(videoFile, onProgress) {
  const report = (msg) => { if (onProgress) onProgress(msg); };

  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(videoFile);
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  video.load();
  await _waitForEvent(video, "loadedmetadata", 8000);

  const duration = video.duration;
  if (!duration || !isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Could not determine video duration.");
  }

  // Pre-load multi-pose model
  report("Loading AI model...");
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

  for (let si = 0; si < sampleTimes.length; si++) {
    const time = sampleTimes[si];
    report(`Scanning frame ${si + 1}/${sampleTimes.length}...`);
    await _seekTo(video, Math.min(time, duration - 0.01), 3000);

    ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

    // Yield before the multi-pose call so the report text actually
    // paints; without this the user sees the previous label until the
    // detection finishes (~300-600 ms each).
    await new Promise((r) => setTimeout(r, 0));

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
    tempVideo.load();
    await _waitForEvent(tempVideo, "loadedmetadata", 6000);
    const videoDuration = tempVideo.duration;
    URL.revokeObjectURL(tempUrl);
    if (!videoDuration || !isFinite(videoDuration)) {
      throw new Error("Could not read video metadata. Try a different file.");
    }

    // Frame budget. Old cap of 150 was a disaster on long clips —
    // a 7-minute highlight got sampled at 0.36 fps, missing every smash.
    // New strategy: at least 3 fps, hard ceiling at 600 to keep memory
    // sane. A 7-min clip now samples at ~1.4 fps (vs 0.36) and captures
    // ~4× as many shot moments.
    let targetFrameCount;
    if (mode === "quick") {
      targetFrameCount = sportConfig.quickFrames;
    } else {
      targetFrameCount = Math.min(600, Math.max(60, Math.floor(videoDuration * 3)));
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
        // Yield to the event loop every ~10 frames so React can flush
        // progress updates and the browser can repaint the spinner. TF.js
        // pose detection holds the main thread otherwise, making the UI
        // look frozen even though work is happening.
        if (poseCount % 10 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
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
    if (qualityFrameCount < Math.max(3, Math.floor(totalFramesExtracted * 0.05))) {
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

    // ── VLM upgrade: replace heuristic shot type with Gemini's per-shot
    // classification (when caller provides a vlmClassify hook). Pose-derived
    // metrics stay on-device; only shot type + reasoning + speed come from
    // the LLM. Falls back gracefully to heuristic if the call fails.
    if (typeof options.vlmClassify === "function" && shotPeaks.length > 0) {
      try {
        progress("classify", 70, "Coach is analyzing your shots...");
        const peakTimes = shotPeaks.map((p) => p.time);
        // Multi-player flag: if the caller flagged this as a doubles/multi
        // video, send full frames so Gemini can identify the right player by
        // position (rather than us blindly cropping to a stale bbox).
        const isMultiPlayer = !!options.isMultiPlayer;
        // 5 frames with asymmetric offsets capture windup → contact →
        // follow-through better than 3 symmetric frames. Gives the AI Coach
        // more chances to see the actual swing even when the motion peak
        // isn't perfectly aligned with the contact moment.
        const keyframes = await extractKeyframesPerShot(
          videoFile, peakTimes, customCropBox,
          { framesPerShot: 5, maxDim: 720, jpegQuality: 0.65,
            offsets: [-0.5, -0.2, 0, 0.2, 0.5],
            isMultiPlayer, expandFactor: 1.6 },
        );
        // Per-shot SNIPPET — small image of the shot moment (~5-15 KB each,
        // ~150px max dim). With a bbox: tight crop around the picked player.
        // Without a bbox: center-square crop of the full frame so EVERY shot
        // card has a visual thumbnail regardless of player selection state.
        const thumbnails = await extractPlayerSnippets(
          videoFile, peakTimes, customCropBox,
          { maxDim: 180, jpegQuality: 0.7, expandFactor: 1.5 },
        );
        // Keyframes used in-flight only — sent to the VLM for classification
        // and then dropped. Not persisted on the result (no video/image storage).
        const vlmShots = await options.vlmClassify({
          shots: keyframes,
          sport,
          target_player: targetPlayer,
          // Pass the selected player's bbox so the backend prompt can tell
          // Gemini exactly where to look on the wider frame.
          target_box: customCropBox || null,
          is_multi_player: isMultiPlayer,
        });
        if (Array.isArray(vlmShots) && vlmShots.length === detectedShots.length) {
          for (let i = 0; i < detectedShots.length; i++) {
            const v = vlmShots[i] || {};
            const conf = Number(v.confidence) || 0;
            // Only override if Gemini was reasonably sure; below 0.4 keep heuristic
            if (v.shot_type && v.shot_type !== "unknown" && conf >= 0.4) {
              detectedShots[i].type = v.shot_type;
              detectedShots[i].name = String(v.shot_type)
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase());
              detectedShots[i].confidence = conf;
            }
            // Always attach VLM extras when we have them
            if (v.reasoning) detectedShots[i].reasoning = v.reasoning;
            if (v.form_feedback) detectedShots[i].formFeedback = v.form_feedback;
            if (v.alternatives) detectedShots[i].alternatives = v.alternatives;
            if (v.estimated_skill) detectedShots[i].vlmSkill = v.estimated_skill;
            if (v.power_level) detectedShots[i].powerLevel = v.power_level;
            if (v._meta) detectedShots[i].vlmMeta = v._meta;
            if (v.estimated_speed_kmh) {
              detectedShots[i].speed = v.estimated_speed_kmh;
              detectedShots[i].speedSource = v.speed_source || "vlm_power_map";
            }
            // Thumbnail of the shot moment (in-memory only, never sent to
            // backend). Lets the result UI show "this is the moment" so the
            // user can visually verify which player Gemini classified.
            if (thumbnails[i]) detectedShots[i].thumbnail = thumbnails[i];
          }
        }
      } catch (vlmErr) {
        console.warn("[vlm] classification failed, keeping heuristic:", vlmErr);
      }
    }

    // Drop unknowns and clearly-junk shots from downstream stats.
    // (They pollute the distribution, score average, and profile.)
    let cleanShots = detectedShots.filter(
      (s) => s.type && s.type !== "unknown" && (s.confidence ?? 0) >= 0.15,
    );
    // De-duplicate: a single physical shot's windup, contact, and
    // follow-through can each produce a wrist-speed peak. If two
    // consecutive shots have the SAME type within ~1.5s of each other,
    // they're almost certainly phases of the same swing — collapse
    // them into one shot at the higher-confidence moment so we don't
    // report "5 backhands" for a single backhand swing.
    {
      const MERGE_WINDOW = 1.5;
      const sorted = [...cleanShots].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const merged = [];
      for (const s of sorted) {
        const prev = merged[merged.length - 1];
        if (
          prev &&
          prev.type === s.type &&
          (s.timestamp || 0) - (prev.timestamp || 0) <= MERGE_WINDOW
        ) {
          // Keep higher-confidence record + longer reasoning
          if ((s.confidence ?? 0) > (prev.confidence ?? 0)) {
            const longerReason = (s.reasoning?.length || 0) > (prev.reasoning?.length || 0) ? s.reasoning : prev.reasoning;
            Object.assign(prev, s, { reasoning: longerReason });
          }
        } else {
          merged.push({ ...s });
        }
      }
      if (merged.length < cleanShots.length) {
        console.info(`[shots] merged ${cleanShots.length} → ${merged.length} (de-duplicated phases of same swing)`);
      }
      cleanShots = merged;
    }

    // ── Step 8: Analyze segments ─────────────────────────────────────────
    progress("segments", 72, "Analyzing segments...");
    const segmentData = detectSegments(motionScores, timestamps);

    // ── Step 9: Compute overall metrics ──────────────────────────────────
    progress("metrics", 78, "Computing metrics...");
    const metrics = computeMetrics(allKeypoints, segmentData, allKeypoints.length);
    // Overall score = average of clean shots' scores. Fall back to form
    // metrics when nothing classifiable was detected.
    const shotScoresArr = cleanShots.map((s) => s.score || 0).filter((s) => s > 0);
    const overallScore = shotScoresArr.length > 0
      ? Math.round(shotScoresArr.reduce((a, b) => a + b, 0) / shotScoresArr.length)
      : computeOverallScore(metrics);
    const grade = scoreToGrade(overallScore);
    // ── Step 10: Build player profile ────────────────────────────────────
    progress("profile", 82, "Building player profile...");
    const playerProfile = buildPlayerProfile(cleanShots, dominantHand);

    // Determine the "primary" shot for backward compat
    const primaryShotType = playerProfile.primary_shot;
    const primaryShotName = primaryShotType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const primaryConfidence = cleanShots.length > 0
      ? avg(cleanShots.filter((s) => s.type === primaryShotType).map((s) => s.confidence))
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
    for (const shot of cleanShots) {
      if (!shotDistribution[shot.type]) shotDistribution[shot.type] = 0;
      shotDistribution[shot.type]++;
    }

    // ── Step 13: Generate results ────────────────────────────────────────
    progress("results", 95, "Generating results...");

    const isMultiShot = cleanShots.length > 1;

    const result = {
      success: true,
      multi_shot: isMultiShot,
      total_shots_detected: cleanShots.length,
      dominant_hand: dominantHand,

      // (No video/keyframe storage — comparisons run text-only on the per-shot
      // reasoning + form_feedback below, which is dense enough for Gemini.)

      // Individual shots array (NEW). Preserve VLM extras (reasoning,
      // formFeedback, etc.) so per-shot AI coach feedback can render in the UI.
      shots: cleanShots.map((s) => ({
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
        reasoning: s.reasoning || null,
        formFeedback: s.formFeedback || null,
        alternatives: s.alternatives || null,
        vlmSkill: s.vlmSkill || null,
        powerLevel: s.powerLevel || null,
        speedSource: s.speedSource || null,
        vlmMeta: s.vlmMeta || null,
        // Per-shot thumbnail (~10-15 KB) for visual verification in the UI.
        // Kept on the in-memory result; only sent to backend if AnalyzePage
        // chooses to (defaults to NOT persisting — see clientResult mapping).
        thumbnail: s.thumbnail || null,
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
          ? `Match analysis: ${detectedShots.length} shots detected. Overall ${grade} (${overallScore}/100). Play style: ${playerProfile.play_style}.`
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
        confidence_level: qualityPercentage >= 50 ? "high" : qualityPercentage >= 20 ? "medium" : "low",
        warning: qualityPercentage < 20
          ? "Limited pose data detected. Results may vary — try filming with full body visible."
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
