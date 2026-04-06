/**
 * @module poseDetector
 * Client-side pose detection using TensorFlow.js and MoveNet Thunder.
 * Detects 17 body keypoints from images or video frames in the browser.
 */

import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

/** Canonical keypoint names for the 17-point COCO skeleton (MoveNet order). */
export const KEYPOINT_NAMES = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
];

/** Skeleton edges for visualisation (index pairs into KEYPOINT_NAMES). */
export const SKELETON_EDGES = [
  [0, 1], [0, 2], [1, 3], [2, 4],           // head
  [5, 6],                                      // shoulders
  [5, 7], [7, 9],                              // left arm
  [6, 8], [8, 10],                             // right arm
  [5, 11], [6, 12],                            // torso
  [11, 12],                                    // hips
  [11, 13], [13, 15],                          // left leg
  [12, 14], [14, 16],                          // right leg
];

import { MIN_KEYPOINT_SCORE } from "./constants.js";

/**
 * @typedef {"idle"|"loading"|"ready"|"error"} ModelState
 */

/**
 * @typedef {Object} Keypoint
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} score - Confidence 0-1
 */

// --------------- module-level singleton ---------------

/** @type {poseDetection.PoseDetector|null} */
let _detector = null;

/** @type {ModelState} */
let _state = "idle";

/** @type {string|null} */
let _errorMessage = null;

/** @type {Promise<poseDetection.PoseDetector>|null} */
let _loadingPromise = null;

// ------------- public API -------------

/**
 * Return the current model loading state.
 * @returns {{ state: ModelState, error: string|null }}
 */
export function getModelState() {
  return { state: _state, error: _errorMessage };
}

/**
 * Load the MoveNet Thunder model (singleton). Calling multiple times is safe --
 * subsequent calls return the same promise / cached detector.
 *
 * @returns {Promise<poseDetection.PoseDetector>} The ready detector instance.
 */
export async function initModel() {
  if (_detector) return _detector;
  if (_loadingPromise) return _loadingPromise;

  _state = "loading";
  _errorMessage = null;

  _loadingPromise = (async () => {
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Prefer WebGL backend for faster inference, fall back to WASM/CPU.
        try {
          await tf.setBackend("webgl");
        } catch {
          // WebGL unavailable — tf.ready() below will pick the best fallback.
        }
        await tf.ready();

        const model = poseDetection.SupportedModels.MoveNet;
        const detectorConfig = {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
          enableSmoothing: true,
        };

        _detector = await poseDetection.createDetector(model, detectorConfig);
        _state = "ready";
        return _detector;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          // Brief pause before retry
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        _state = "error";
        _errorMessage = err?.message ?? "Unknown error loading MoveNet model";
        _loadingPromise = null;
        throw err;
      }
    }
  })();

  return _loadingPromise;
}

/**
 * Detect pose keypoints from a single image / video frame.
 *
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement|ImageData} imageElement
 *   Any browser image source that TensorFlow.js can consume.
 * @returns {Promise<Keypoint[]>} Array of 17 keypoints (may have low-score entries).
 */
export async function detectPose(imageElement) {
  const detector = await initModel();
  const poses = await detector.estimatePoses(imageElement, {
    maxPoses: 1,
    flipHorizontal: false,
  });

  if (!poses || poses.length === 0) {
    return KEYPOINT_NAMES.map((name) => ({ name, x: 0, y: 0, score: 0 }));
  }

  const rawKeypoints = poses[0].keypoints;
  return rawKeypoints.map((kp, i) => ({
    name: kp.name ?? KEYPOINT_NAMES[i],
    x: kp.x,
    y: kp.y,
    score: kp.score ?? 0,
  }));
}

/**
 * Run pose detection on an array of frames (batch helper).
 * Frames are processed sequentially to keep memory usage predictable.
 *
 * @param {Array<HTMLImageElement|HTMLVideoElement|HTMLCanvasElement|ImageData>} frames
 * @param {(progress: number) => void} [onProgress] - Optional callback with 0-1 progress.
 * @returns {Promise<Keypoint[][]>} One keypoint array per frame.
 */
export async function detectPosesInFrames(frames, onProgress) {
  if (!frames || frames.length === 0) return [];

  await initModel();

  const results = [];
  for (let i = 0; i < frames.length; i++) {
    const keypoints = await detectPose(frames[i]);
    results.push(keypoints);
    if (onProgress) onProgress((i + 1) / frames.length);
  }
  return results;
}

/**
 * Look up a single keypoint by name from an array.
 *
 * @param {Keypoint[]} keypoints
 * @param {string} name - One of KEYPOINT_NAMES.
 * @returns {Keypoint|null} The keypoint or null if not found / below threshold.
 */
export function getKeypointByName(keypoints, name) {
  if (!keypoints) return null;
  const kp = keypoints.find((k) => k.name === name);
  if (!kp || kp.score < MIN_KEYPOINT_SCORE) return null;
  return kp;
}

/**
 * Count how many keypoints in a pose are above the confidence threshold.
 *
 * @param {Keypoint[]} keypoints
 * @param {number} [threshold=MIN_KEYPOINT_SCORE]
 * @returns {number}
 */
export function countVisibleKeypoints(keypoints, threshold = MIN_KEYPOINT_SCORE) {
  if (!keypoints) return 0;
  return keypoints.filter((kp) => kp.score >= threshold).length;
}

/**
 * Calculate the Euclidean distance between two keypoints.
 *
 * @param {Keypoint} a
 * @param {Keypoint} b
 * @returns {number}
 */
export function keypointDistance(a, b) {
  if (!a || !b) return 0;
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Compute the angle (in degrees) at point p2 formed by p1-p2-p3.
 *
 * @param {Keypoint} p1
 * @param {Keypoint} p2 - The vertex.
 * @param {Keypoint} p3
 * @returns {number} Angle in degrees [0, 180].
 */
export function calculateAngle(p1, p2, p3) {
  if (!p1 || !p2 || !p3) return 0;
  const v1x = p1.x - p2.x;
  const v1y = p1.y - p2.y;
  const v2x = p3.x - p2.x;
  const v2y = p3.y - p2.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}
