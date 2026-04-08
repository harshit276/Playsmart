/**
 * @module videoProcessor
 * Main video analysis pipeline that runs entirely in the browser.
 * Extracts frames from video using HTML5 canvas, runs MoveNet pose detection,
 * classifies shots, computes metrics, and returns results in the same format
 * as the server's /analyze-video endpoint.
 */

import { initModel, detectPose, getKeypointByName, calculateAngle, keypointDistance, countVisibleKeypoints } from "./poseDetector.js";
import {
  SUPPORTED_SPORTS,
  SHOT_TYPES,
  SPEED_THRESHOLDS,
  SKILL_LEVEL_THRESHOLDS,
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
 * HTML5 video element and canvas.
 *
 * @param {File} videoFile - Video file from an <input> element
 * @param {number} [targetFrameCount=50] - Number of frames to extract
 * @param {string} [targetPlayer="auto"] - Player quadrant to crop
 * @returns {Promise<{ frames: ImageData[], timestamps: number[], duration: number,
 *   fps: number, width: number, height: number }>}
 */
async function extractFrames(videoFile, targetFrameCount = 30, targetPlayer = "auto", canvasSize = MODEL_INPUT_SIZE) {
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
  const crop = getCropRegion(videoWidth, videoHeight, targetPlayer);

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
  // Mark frames as active/inactive
  const active = motionScores.map((s) => s > MOTION_ACTIVE_THRESHOLD);

  // Find contiguous active regions
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

  // Merge segments that are close together
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

  // Filter by minimum length
  const segments = merged
    .filter((s) => s.endFrame - s.startFrame + 1 >= MIN_SEGMENT_FRAMES)
    .map((s) => ({
      start: timestamps[s.startFrame] || 0,
      end: timestamps[s.endFrame] || 0,
      startFrame: s.startFrame,
      endFrame: s.endFrame,
    }));

  const activeFrameCount = active.filter(Boolean).length;

  // Power moments = frames with very high motion
  const highThreshold = MOTION_ACTIVE_THRESHOLD * 3;
  const powerMoments = motionScores.filter((s) => s > highThreshold).length;

  return { segments, activeFrameCount, powerMoments };
}

// ─── Shot Classification ────────────────────────────────────────────────────

/**
 * Determine which arm is the dominant (racket) arm based on range of motion.
 * The arm that moves more across frames is likely holding the racket.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @returns {"right"|"left"}
 */
function detectDominantArm(allKeypoints) {
  let rightMotion = 0;
  let leftMotion = 0;

  for (let i = 1; i < allKeypoints.length; i++) {
    const prevRW = getKeypointByName(allKeypoints[i - 1], "right_wrist");
    const currRW = getKeypointByName(allKeypoints[i], "right_wrist");
    const prevLW = getKeypointByName(allKeypoints[i - 1], "left_wrist");
    const currLW = getKeypointByName(allKeypoints[i], "left_wrist");

    if (prevRW && currRW) {
      rightMotion += Math.sqrt((currRW.x - prevRW.x) ** 2 + (currRW.y - prevRW.y) ** 2);
    }
    if (prevLW && currLW) {
      leftMotion += Math.sqrt((currLW.x - prevLW.x) ** 2 + (currLW.y - prevLW.y) ** 2);
    }
  }

  return rightMotion >= leftMotion ? "right" : "left";
}

/**
 * Extract per-frame motion features for the dominant arm, normalised by torso length.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @param {"right"|"left"} arm
 * @returns {{ wristRelHeights: number[], wristVelocitiesY: number[], wristVelocitiesX: number[],
 *   wristSpeeds: number[], elbowAngles: number[], hipRelHeights: number[],
 *   bodyCenterXs: number[], wristXs: number[] }}
 */
function extractArmFeatures(allKeypoints, arm) {
  const prefix = arm === "right" ? "right" : "left";
  const otherPrefix = arm === "right" ? "left" : "right";

  const wristRelHeights = []; // wrist.y - shoulder.y, normalised by torso length (negative = above shoulder)
  const wristVelocitiesY = []; // frame-to-frame vertical velocity (negative = moving up)
  const wristVelocitiesX = []; // frame-to-frame horizontal velocity
  const wristSpeeds = []; // absolute speed normalised by torso
  const elbowAngles = [];
  const hipRelHeights = []; // wrist.y - hip.y, normalised (negative = above hip)
  const bodyCenterXs = []; // x-centre of the body
  const wristXs = []; // wrist x positions

  let prevWristX = null;
  let prevWristY = null;

  for (const kps of allKeypoints) {
    const shoulder = getKeypointByName(kps, `${prefix}_shoulder`);
    const elbow = getKeypointByName(kps, `${prefix}_elbow`);
    const wrist = getKeypointByName(kps, `${prefix}_wrist`);
    const hip = getKeypointByName(kps, `${prefix}_hip`);
    const otherShoulder = getKeypointByName(kps, `${otherPrefix}_shoulder`);
    const otherHip = getKeypointByName(kps, `${otherPrefix}_hip`);

    // Torso length for normalisation (shoulder to hip)
    let torso = 1; // fallback
    if (shoulder && hip) {
      const t = Math.sqrt((shoulder.x - hip.x) ** 2 + (shoulder.y - hip.y) ** 2);
      if (t > 5) torso = t; // guard against degenerate poses
    }

    if (wrist && shoulder) {
      wristRelHeights.push((wrist.y - shoulder.y) / torso);
    }

    if (wrist && hip) {
      hipRelHeights.push((wrist.y - hip.y) / torso);
    }

    if (shoulder && elbow && wrist) {
      elbowAngles.push(calculateAngle(shoulder, elbow, wrist));
    }

    // Body centre X
    if (shoulder && otherShoulder) {
      bodyCenterXs.push((shoulder.x + otherShoulder.x) / 2);
    }

    if (wrist) {
      wristXs.push(wrist.x);

      if (prevWristX !== null && prevWristY !== null) {
        const dx = (wrist.x - prevWristX) / torso;
        const dy = (wrist.y - prevWristY) / torso;
        wristVelocitiesX.push(dx);
        wristVelocitiesY.push(dy);
        wristSpeeds.push(Math.sqrt(dx * dx + dy * dy));
      }

      prevWristX = wrist.x;
      prevWristY = wrist.y;
    }
  }

  return { wristRelHeights, wristVelocitiesY, wristVelocitiesX, wristSpeeds, elbowAngles, hipRelHeights, bodyCenterXs, wristXs };
}

/**
 * Classify the dominant shot type from pose keypoints across frames.
 * Uses motion direction, wrist position relative to body, and speed
 * for accurate multi-factor classification.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints - Keypoints for each frame
 * @param {string} sport - Sport key
 * @returns {{ shotType: string, shotName: string, confidence: number }}
 */
function classifyShot(allKeypoints, sport) {
  const shotTypes = SHOT_TYPES[sport] || SHOT_TYPES.badminton;

  if (allKeypoints.length < 2) {
    const shotType = shotTypes[0] || "unknown";
    const shotName = shotType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { shotType, shotName, confidence: 0.3 };
  }

  const arm = detectDominantArm(allKeypoints);
  const feat = extractArmFeatures(allKeypoints, arm);

  // Helpers
  const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const max = (arr) => arr.length > 0 ? Math.max(...arr) : 0;
  const min = (arr) => arr.length > 0 ? Math.min(...arr) : 0;

  const avgWristRelHeight = avg(feat.wristRelHeights);
  const minWristRelHeight = min(feat.wristRelHeights); // most negative = highest above shoulder
  const maxWristRelHeight = max(feat.wristRelHeights);
  const peakWristSpeed = max(feat.wristSpeeds);
  const avgWristSpeed = avg(feat.wristSpeeds);

  // Net vertical velocity: negative = overall upward motion, positive = downward
  const avgVelY = avg(feat.wristVelocitiesY);
  // Look at the fastest portion — find peak downward and upward velocities
  const peakDownVelY = max(feat.wristVelocitiesY); // most positive = fastest downward
  const peakUpVelY = min(feat.wristVelocitiesY);    // most negative = fastest upward

  // Whether wrist was ever above shoulder (relHeight < -0.2 means well above)
  const wristWentAboveShoulder = minWristRelHeight < -0.15;
  // Whether wrist was near or below hip
  const wristNearHip = avg(feat.hipRelHeights) > -0.3;
  const wristBelowHip = max(feat.hipRelHeights) > 0.1;

  // Whether the wrist is on the same side as the arm or crossed to opposite side
  const avgBodyCenterX = avg(feat.bodyCenterXs);
  const avgWristX = avg(feat.wristXs);
  const wristOnNaturalSide = arm === "right" ? (avgWristX > avgBodyCenterX) : (avgWristX < avgBodyCenterX);

  let shotType;
  let confidence;

  if (sport === "badminton") {
    if (wristWentAboveShoulder && peakWristSpeed > 0.4 && peakDownVelY > 0.2) {
      // High position + fast + downward motion = smash
      shotType = "smash";
      confidence = 0.80;
    } else if (wristWentAboveShoulder && peakUpVelY < -0.15) {
      // High position + upward trajectory = clear
      shotType = "clear";
      confidence = 0.72;
    } else if (wristWentAboveShoulder && peakWristSpeed < 0.25) {
      // High position + slow speed = drop shot (deceptive)
      shotType = "drop";
      confidence = 0.65;
    } else if (!wristWentAboveShoulder && Math.abs(avgWristRelHeight) < 0.3 && peakWristSpeed > 0.25) {
      // Arm roughly horizontal + fast horizontal movement = drive
      shotType = "drive";
      confidence = 0.68;
    } else if (!wristWentAboveShoulder && avgWristRelHeight > 0.2 && avgWristSpeed < 0.15) {
      // Wrist below shoulder, slow controlled = net shot
      shotType = "net_shot";
      confidence = 0.62;
    } else if (wristBelowHip && peakUpVelY < -0.1) {
      // Low start + upward motion = lift/lob
      shotType = "lift";
      confidence = 0.58;
    } else if (wristBelowHip && avgWristSpeed < 0.2) {
      // Low position, underhand, slow = serve
      shotType = "serve";
      confidence = 0.60;
    } else if (wristWentAboveShoulder) {
      // Fallback for high shots we couldn't differentiate
      shotType = peakWristSpeed > 0.3 ? "smash" : "clear";
      confidence = 0.50;
    } else {
      shotType = "drive";
      confidence = 0.45;
    }
  } else if (sport === "table_tennis") {
    // Table tennis: shorter motions, distinguish forehand/backhand by arm side
    const isForehand = wristOnNaturalSide;

    if (peakWristSpeed > 0.5 && !wristWentAboveShoulder) {
      // Very fast, flat = smash
      shotType = "smash";
      confidence = 0.72;
    } else if (peakUpVelY < -0.15 && avgWristSpeed > 0.2) {
      // Upward brush motion = loop/topspin
      shotType = isForehand ? "forehand_loop" : "backhand_loop";
      confidence = 0.70;
    } else if (peakDownVelY > 0.15 && avgWristSpeed > 0.15) {
      // Downward motion = chop
      shotType = "chop";
      confidence = 0.65;
    } else if (avgWristSpeed > 0.15) {
      // Moderate speed forward motion = drive
      shotType = isForehand ? "forehand_drive" : "backhand_drive";
      confidence = 0.62;
    } else if (wristNearHip && avgWristSpeed < 0.12) {
      // Low, compact, slow = serve
      shotType = "serve";
      confidence = 0.60;
    } else if (avgWristSpeed < 0.1) {
      // Very slow = push/block
      shotType = peakWristSpeed < 0.08 ? "block" : "push";
      confidence = 0.55;
    } else {
      shotType = isForehand ? "forehand_drive" : "backhand_drive";
      confidence = 0.45;
    }
  } else if (sport === "tennis") {
    const isForehand = wristOnNaturalSide;

    if (wristWentAboveShoulder && minWristRelHeight < -0.5 && peakWristSpeed > 0.4) {
      shotType = "serve";
      confidence = 0.75;
    } else if (wristWentAboveShoulder && peakDownVelY > 0.2) {
      shotType = "overhead";
      confidence = 0.68;
    } else if (peakDownVelY > 0.15 && avgWristSpeed < 0.2) {
      shotType = "slice";
      confidence = 0.60;
    } else if (!wristWentAboveShoulder && avgWristSpeed < 0.1) {
      shotType = "drop_shot";
      confidence = 0.55;
    } else if (peakUpVelY < -0.2 && !wristWentAboveShoulder) {
      shotType = "lob";
      confidence = 0.58;
    } else if (avgWristSpeed > 0.12 && !wristWentAboveShoulder) {
      shotType = isForehand ? "forehand" : "backhand";
      confidence = 0.65;
    } else if (wristNearHip && avgWristSpeed < 0.15) {
      shotType = "volley";
      confidence = 0.55;
    } else {
      shotType = isForehand ? "forehand" : "backhand";
      confidence = 0.48;
    }
  } else if (sport === "pickleball") {
    const isForehand = wristOnNaturalSide;

    if (wristWentAboveShoulder && peakDownVelY > 0.15) {
      shotType = "overhead";
      confidence = 0.68;
    } else if (wristNearHip && avgWristSpeed < 0.08) {
      shotType = "dink";
      confidence = 0.65;
    } else if (wristBelowHip && avgWristSpeed < 0.15) {
      shotType = "serve";
      confidence = 0.62;
    } else if (avgWristSpeed > 0.2) {
      shotType = "drive";
      confidence = 0.60;
    } else if (peakUpVelY < -0.15) {
      shotType = "lob";
      confidence = 0.55;
    } else if (avgWristSpeed < 0.12 && !wristWentAboveShoulder) {
      shotType = "third_shot_drop";
      confidence = 0.55;
    } else if (!wristWentAboveShoulder && avgWristSpeed < 0.15) {
      shotType = "volley";
      confidence = 0.52;
    } else {
      shotType = "drop";
      confidence = 0.45;
    }
  } else {
    shotType = shotTypes[0] || "unknown";
    confidence = 0.40;
  }

  // Convert snake_case to Title Case for display
  const shotName = shotType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return { shotType, shotName, confidence };
}

// ─── Metrics Computation ────────────────────────────────────────────────────

/**
 * Compute analysis metrics from pose keypoints.
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

    // Elbow angles
    const rShoulder = getKeypointByName(kps, "right_shoulder");
    const rElbow = getKeypointByName(kps, "right_elbow");
    const rWrist = getKeypointByName(kps, "right_wrist");
    if (rShoulder && rElbow && rWrist) {
      elbowAngles.push(calculateAngle(rShoulder, rElbow, rWrist));
    }

    // Shoulder angle (arm raise relative to torso)
    const rHip = getKeypointByName(kps, "right_hip");
    if (rHip && rShoulder && rElbow) {
      shoulderAngles.push(calculateAngle(rHip, rShoulder, rElbow));
    }

    // Hip angles
    const lHip = getKeypointByName(kps, "left_hip");
    const rKnee = getKeypointByName(kps, "right_knee");
    if (rShoulder && rHip && rKnee) {
      hipAngles.push(calculateAngle(rShoulder, rHip, rKnee));
    }

    // Knee angles
    const rAnkle = getKeypointByName(kps, "right_ankle");
    if (rHip && rKnee && rAnkle) {
      kneeAngles.push(calculateAngle(rHip, rKnee, rAnkle));
    }

    // Balance: horizontal distance between ankles relative to shoulders
    const lShoulder = getKeypointByName(kps, "left_shoulder");
    const lAnkle = getKeypointByName(kps, "left_ankle");
    if (rShoulder && lShoulder && rAnkle && lAnkle) {
      const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
      const ankleWidth = Math.abs(rAnkle.x - lAnkle.x);
      if (shoulderWidth > 0) {
        const ratio = ankleWidth / shoulderWidth;
        // Ideal stance: ankles roughly shoulder-width (ratio ~1.0)
        const deviation = Math.abs(ratio - 1.0);
        balanceScores.push(Math.max(0, 100 - deviation * 80));
      }
    }
  }

  // Helper: average of an array
  const avg = (arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const stddev = (arr) => {
    if (arr.length < 2) return 0;
    const mean = avg(arr);
    return Math.sqrt(arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length);
  };

  // Elbow angle quality: closer to sport-ideal is better
  const avgElbow = avg(elbowAngles);
  const elbowStd = stddev(elbowAngles);
  // Good elbow: angle between 80-160 degrees, low std
  const elbowAngleQuality = Math.max(0, Math.min(100, 100 - Math.abs(avgElbow - 120) * 0.8 - elbowStd * 0.5));

  // Range of motion: std dev of shoulder angles (more movement = more ROM)
  const romScore = Math.min(100, avg(shoulderAngles) * 0.5 + stddev(shoulderAngles) * 2);

  // Form score: based on visibility and posture consistency
  const avgVisibility = avg(visibilityCounts);
  const formScore = Math.min(100, (avgVisibility / 17) * 70 + 30 - elbowStd * 0.3);

  // Consistency: inverse of variation in key angles
  const elbowConsistency = Math.max(0, 100 - elbowStd * 2);
  const hipConsistency = Math.max(0, 100 - stddev(hipAngles) * 2);
  const consistencyScore = (elbowConsistency + hipConsistency) / 2;

  // Wrist action: range of elbow angles indicates wrist/arm snap
  const elbowRange = elbowAngles.length > 1 ? Math.max(...elbowAngles) - Math.min(...elbowAngles) : 0;
  const wristAction = Math.min(100, elbowRange * 0.8);

  // Footwork: based on knee angle variation (more = more dynamic footwork)
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

/**
 * Clamp a number between min and max.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ─── Scoring & Grading ──────────────────────────────────────────────────────

/**
 * Compute a weighted overall score from individual metrics.
 *
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
 *
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
 *
 * @param {number} score
 * @returns {string}
 */
function scoreToSkillLevel(score) {
  for (const { label, minScore } of SKILL_LEVEL_THRESHOLDS) {
    if (score >= minScore) return label;
  }
  return "Beginner";
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
 *
 * Rationale: average torso length is ~0.5m. Wrist speed relative to torso is
 * a dimensionless ratio. We multiply by a sport-specific factor calibrated
 * against known amateur speed ranges.
 *
 * The factor accounts for:
 * - Racket/paddle extension beyond the wrist
 * - Typical amateur vs pro speed ranges
 * - The fact that wrist speed != shuttle/ball speed (transfer ratio)
 */
const SPEED_CALIBRATION = {
  badminton:    { factor: 280, minPlausible: 30, maxPlausible: 450 },
  table_tennis: { factor: 100, minPlausible: 10, maxPlausible: 130 },
  tennis:       { factor: 240, minPlausible: 30, maxPlausible: 260 },
  pickleball:   { factor: 110, minPlausible: 15, maxPlausible: 100 },
};

/**
 * Estimate swing speed from wrist movement relative to torso size.
 *
 * Instead of converting pixels to meters (which depends on camera distance),
 * we normalise wrist displacement by torso length (shoulder-to-hip distance)
 * then apply a sport-specific calibration factor to produce a plausible km/h
 * estimate.
 *
 * @param {import("./poseDetector.js").Keypoint[][]} allKeypoints
 * @param {number[]} timestamps
 * @param {string} sport
 * @param {{ width: number, height: number }} videoInfo
 * @returns {{ estimated_speed_kmh: number, speed_class: string, note: string }}
 */
function estimateSpeed(allKeypoints, timestamps, sport, videoInfo) {
  const arm = detectDominantArm(allKeypoints);
  const wristName = `${arm}_wrist`;
  const shoulderName = `${arm}_shoulder`;
  const hipName = `${arm}_hip`;

  const normalisedSpeeds = []; // wrist displacement / torso length per second

  for (let i = 1; i < allKeypoints.length; i++) {
    const prevWrist = getKeypointByName(allKeypoints[i - 1], wristName) ||
                      getKeypointByName(allKeypoints[i - 1], "right_wrist") ||
                      getKeypointByName(allKeypoints[i - 1], "left_wrist");
    const currWrist = getKeypointByName(allKeypoints[i], wristName) ||
                      getKeypointByName(allKeypoints[i], "right_wrist") ||
                      getKeypointByName(allKeypoints[i], "left_wrist");

    if (!prevWrist || !currWrist) continue;

    const dt = timestamps[i] - timestamps[i - 1];
    if (dt <= 0) continue;

    // Compute torso length as scale reference (average of both frames)
    let torso = 0;
    let torsoCount = 0;
    for (const kps of [allKeypoints[i - 1], allKeypoints[i]]) {
      const sh = getKeypointByName(kps, shoulderName) || getKeypointByName(kps, "right_shoulder") || getKeypointByName(kps, "left_shoulder");
      const hp = getKeypointByName(kps, hipName) || getKeypointByName(kps, "right_hip") || getKeypointByName(kps, "left_hip");
      if (sh && hp) {
        const t = Math.sqrt((sh.x - hp.x) ** 2 + (sh.y - hp.y) ** 2);
        if (t > 5) { torso += t; torsoCount++; }
      }
    }

    if (torsoCount === 0) continue;
    const avgTorso = torso / torsoCount;

    const pixelDist = Math.sqrt((currWrist.x - prevWrist.x) ** 2 + (currWrist.y - prevWrist.y) ** 2);
    const relativeSpeed = (pixelDist / avgTorso) / dt; // torso-lengths per second

    normalisedSpeeds.push(relativeSpeed);
  }

  if (normalisedSpeeds.length === 0) {
    return { estimated_speed_kmh: 0, speed_class: "Unknown", note: "Could not estimate speed — wrist not visible." };
  }

  // Use the average of the top 3-5 fastest frames (peak swing phase)
  normalisedSpeeds.sort((a, b) => b - a);
  const topN = Math.min(5, Math.max(3, Math.floor(normalisedSpeeds.length * 0.15)));
  const peakRelativeSpeed = normalisedSpeeds.slice(0, topN).reduce((a, b) => a + b, 0) / topN;

  // Convert to km/h using sport-specific calibration
  const cal = SPEED_CALIBRATION[sport] || SPEED_CALIBRATION.badminton;
  let estimatedSpeed = Math.round(peakRelativeSpeed * cal.factor);

  // Clamp to plausible range for the sport
  estimatedSpeed = Math.max(cal.minPlausible, Math.min(cal.maxPlausible, estimatedSpeed));

  // Classify speed
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

// ─── Main Pipeline ──────────────────────────────────────────────────────────

/**
 * Main video analysis pipeline that runs entirely in the browser.
 *
 * Extracts frames from the provided video file, runs MoveNet pose detection
 * on each frame, classifies the shot type, computes technique metrics, detects
 * active segments, estimates swing speed, and returns results in the same
 * format as the server's /analyze-video endpoint.
 *
 * @param {File} videoFile - The video file to analyze
 * @param {string} sport - Sport type (badminton, table_tennis, tennis, pickleball)
 * @param {object} [options] - Analysis options
 * @param {string} [options.mode="full"] - "full" or "quick"
 * @param {string} [options.targetPlayer="auto"] - Player quadrant: "auto", "top-left", etc.
 * @param {(progress: { step: string, percent: number, message: string }) => void} [options.onProgress] - Progress callback
 * @returns {Promise<object>} Analysis results matching the server's response format
 */
export async function analyzeVideo(videoFile, sport, options = {}) {
  const { mode = "full", targetPlayer = "auto", onProgress } = options;

  const sportConfig = SUPPORTED_SPORTS[sport];
  if (!sportConfig) {
    throw new Error(`Unsupported sport: "${sport}". Supported: ${Object.keys(SUPPORTED_SPORTS).join(", ")}`);
  }
  if (!sportConfig.videoAnalysis) {
    throw new Error(`Video analysis is not available for ${sportConfig.name}.`);
  }

  const targetFrameCount = mode === "quick" ? sportConfig.quickFrames : sportConfig.targetFrames;

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

    // ── Step 2: Read video metadata ──────────────────────────────────────
    progress("metadata", 15, "Reading video...");
    // We get metadata as part of frame extraction, but report it as a step

    // ── Step 3: Extract frames ───────────────────────────────────────────
    const canvasSize = mode === "quick" ? QUICK_MODEL_INPUT_SIZE : MODEL_INPUT_SIZE;
    progress("extraction", 25, `Extracting ${targetFrameCount} frames...`);
    const { frames, timestamps, duration, fps, width, height } = await extractFrames(
      videoFile,
      targetFrameCount,
      targetPlayer,
      canvasSize
    );

    const videoInfo = { duration, fps, width, height, frame_count: frames.length };

    // ── Step 3b: Compute motion scores early to skip static frames ──────
    progress("motion", 35, "Detecting motion...");
    const motionScores = [];
    for (let i = 1; i < frames.length; i++) {
      motionScores.push(computeMotionScore(frames[i - 1], frames[i]));
    }
    // First frame has no predecessor — assume active
    const isActiveFrame = [true, ...motionScores.map((s) => s > MOTION_ACTIVE_THRESHOLD * 0.5)];

    // ── Step 4: Detect poses (skip static frames) ────────────────────────
    progress("pose", 45, "Detecting poses...");
    const allKeypoints = [];
    const emptyPose = Array.from({ length: 17 }, (_, i) => ({ name: "", x: 0, y: 0, score: 0 }));
    let poseCount = 0;
    const totalActive = isActiveFrame.filter(Boolean).length;
    for (let i = 0; i < frames.length; i++) {
      if (isActiveFrame[i]) {
        const kps = await detectPose(frames[i]);
        allKeypoints.push(kps);
        poseCount++;
        const subPercent = 45 + Math.round((poseCount / totalActive) * 15);
        progress("pose", subPercent, `Detecting poses... (${poseCount}/${totalActive})`);
      } else {
        // Skip pose detection on static frames — reuse empty placeholder
        allKeypoints.push(emptyPose);
      }
    }

    // ── Step 5: Classify technique ───────────────────────────────────────
    progress("classify", 60, "Classifying technique...");
    // Only use active-frame keypoints for classification
    const activeKeypoints = allKeypoints.filter((_, i) => isActiveFrame[i]);
    const { shotType, shotName, confidence } = classifyShot(
      activeKeypoints.length > 0 ? activeKeypoints : allKeypoints,
      sport
    );

    // ── Step 6: Analyze segments (motion detection) ──────────────────────
    progress("segments", 70, "Analyzing segments...");
    const segmentData = detectSegments(motionScores, timestamps);

    // Release frame data to free memory
    frames.length = 0;

    // ── Step 7: Compute metrics ──────────────────────────────────────────
    progress("metrics", 80, "Computing metrics...");
    const metrics = computeMetrics(allKeypoints, segmentData, allKeypoints.length);
    const overallScore = computeOverallScore(metrics);
    const grade = scoreToGrade(overallScore);
    const skillLevel = scoreToSkillLevel(overallScore);
    const weaknesses = detectWeaknesses(metrics, shotName);

    // ── Step 8: Estimate speed ───────────────────────────────────────────
    progress("speed", 85, "Estimating speed...");
    const speedAnalysis = estimateSpeed(allKeypoints, timestamps, sport, { width, height });

    // ── Step 9: Generate results ─────────────────────────────────────────
    progress("results", 95, "Generating results...");

    const result = {
      success: true,
      skill_level: skillLevel,
      analysis_mode: mode,
      shot_analysis: {
        shot_type: shotType,
        shot_name: shotName,
        confidence,
        grade,
        score: overallScore,
        weaknesses,
        improvement_plan: weaknesses.length > 0
          ? `Focus on ${weaknesses[0].area} first — ${weaknesses[0].fix}`
          : `Great ${shotName}! Keep practicing to maintain your form.`,
      },
      pro_comparison: {
        overall_score: overallScore,
        level: skillLevel,
        message: overallScore >= 80
          ? `Your ${shotName} shows advanced technique. Fine-tune the details to reach elite level.`
          : overallScore >= 55
            ? `Your ${shotName} is solid. Focus on the identified weaknesses to level up.`
            : `Your ${shotName} has room for improvement. Work on the basics first.`,
        pro_tips: generateProTips(shotType, sport, weaknesses),
        player_match: null,
      },
      metrics,
      coaching: null,
      comprehensive_coaching: null,
      quick_summary: `${shotName} analysis: ${grade} grade (${overallScore}/100). ${weaknesses.length > 0 ? `Key area: ${weaknesses[0].issue}.` : "Looking good!"}`,
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
      // Fields the server adds via DB/research — null in client-side mode
      analysis_id: `local-${Date.now()}`,
      coach_feedback: {
        summary: `Your ${shotName} scored ${overallScore}/100 (${grade}). ${skillLevel} level detected.`,
        top_issues: weaknesses.slice(0, 3).map((w) => ({
          issue: w.issue,
          coach_says: `Let's work on your ${w.area} — ${w.issue.toLowerCase()}.`,
          fix: w.fix,
          drill: null,
          severity: w.severity,
        })),
        strengths: buildStrengths(metrics, shotName, grade, overallScore),
        encouragement: weaknesses.length === 0
          ? "Excellent technique! Keep up the great work."
          : "Every champion started where you are. Keep practicing!",
      },
      improvement_plan: {
        this_week: weaknesses.slice(0, 3).map((w) => `Focus on: ${w.issue}`),
        next_upload: "Upload again in 7 days to track your improvement",
        expected_improvement: `With daily practice, you should see noticeable improvement in your ${shotName} within 2 weeks`,
      },
      recommended_videos: [],
      recommended_drills: [],
      performance_scores: null,
      score_messages: [],
      training_plan_7day: null,
      earned_badges: [],
      score_comparison: null,
      _client_side: true,
    };

    // ── Step 10: Complete ────────────────────────────────────────────────
    progress("complete", 100, "Complete!");

    return result;
  } catch (err) {
    // Provide a structured error result so callers can display it gracefully
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

  // Always include a general tip
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

  if (grade === "A" || grade === "B") {
    strengths.push(`Good ${shotName} technique`);
  }
  if (score > 70) {
    strengths.push("Solid overall form");
  }
  if (metrics.consistency_score > 70) {
    strengths.push("Consistent technique across repetitions");
  }
  if (metrics.balance_score > 75) {
    strengths.push("Excellent balance and stance");
  }
  if (metrics.range_of_motion > 70) {
    strengths.push("Good range of motion");
  }
  if (metrics.wrist_action > 70) {
    strengths.push("Strong wrist action");
  }

  return strengths.length > 0 ? strengths.slice(0, 5) : ["Keep practicing to build your strengths!"];
}
