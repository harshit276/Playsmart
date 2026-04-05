/**
 * @module ai
 * AthlyticAI client-side analysis pipeline.
 *
 * Re-exports every public symbol from the individual AI modules so
 * consumers can do:
 *
 *   import { initModel, classifyShot, estimateSpeed } from "../ai";
 */

// Pose detection (TensorFlow.js + MoveNet Thunder)
export {
  KEYPOINT_NAMES,
  SKELETON_EDGES,
  initModel,
  getModelState,
  detectPose,
  detectPosesInFrames,
  getKeypointByName,
  countVisibleKeypoints,
  keypointDistance,
  calculateAngle,
} from "./poseDetector.js";

// Shot classification (angle-based heuristics)
export {
  classifyShot,
} from "./shotClassifier.js";

// Shared constants (shot types, speed thresholds, etc.)
export {
  SUPPORTED_SPORTS,
  SHOT_TYPES,
  SPEED_THRESHOLDS,
  SKILL_LEVEL_THRESHOLDS,
  GRADE_THRESHOLDS,
  METRIC_WEIGHTS,
  MIN_KEYPOINT_SCORE,
  NUM_KEYPOINTS,
  MODEL_INPUT_SIZE,
} from "./constants.js";

// Speed estimation
export {
  estimateSpeed,
} from "./speedEstimator.js";

// Segment / highlight detection
export {
  computeMotionScores,
  canvasToImageData,
  detectSegments,
  getHighlightTimestamps,
} from "./segmentDetector.js";

// Technique metrics and grading
export {
  computeMetrics,
} from "./metricsCalculator.js";
