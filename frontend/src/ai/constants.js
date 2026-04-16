/**
 * @module constants
 * Sport-specific constants for the client-side AI analysis pipeline.
 * Mirrors backend sports_config.py and analysis thresholds.
 */

// ─── Supported Sports ───────────────────────────────────────────────────────

/**
 * @typedef {Object} SportConfig
 * @property {string} name - Display name
 * @property {boolean} videoAnalysis - Whether video analysis is supported
 * @property {number} targetFps - Frames per second to sample
 * @property {number} targetFrames - Total frames to extract for full analysis
 * @property {number} quickFrames - Frames for quick mode
 */

/** @type {Record<string, SportConfig>} */
export const SUPPORTED_SPORTS = {
  badminton: {
    name: "Badminton",
    videoAnalysis: true,
    targetFps: 8,
    targetFrames: 30,
    quickFrames: 15,
  },
  table_tennis: {
    name: "Table Tennis",
    videoAnalysis: true,
    targetFps: 10,
    targetFrames: 30,
    quickFrames: 15,
  },
  tennis: {
    name: "Tennis",
    videoAnalysis: true,
    targetFps: 8,
    targetFrames: 30,
    quickFrames: 15,
  },
  pickleball: {
    name: "Pickleball",
    videoAnalysis: true,
    targetFps: 8,
    targetFrames: 30,
    quickFrames: 15,
  },
  cricket: {
    name: "Cricket",
    videoAnalysis: true,
    targetFps: 8,
    targetFrames: 30,
    quickFrames: 15,
  },
};

// ─── Shot Types per Sport ───────────────────────────────────────────────────

/** @type {Record<string, string[]>} */
export const SHOT_TYPES = {
  badminton: [
    "clear",
    "drop",
    "smash",
    "net_shot",
    "drive",
    "serve",
    "lift",
    "block",
  ],
  table_tennis: [
    "forehand_loop",
    "backhand_loop",
    "forehand_drive",
    "backhand_drive",
    "push",
    "chop",
    "serve",
    "smash",
    "flick",
    "block",
  ],
  tennis: [
    "forehand",
    "backhand",
    "serve",
    "volley",
    "overhead",
    "drop_shot",
    "slice",
    "lob",
  ],
  pickleball: [
    "dink",
    "drive",
    "drop",
    "serve",
    "volley",
    "lob",
    "overhead",
    "third_shot_drop",
  ],
  cricket: [
    "forward_defense",
    "back_foot_defense",
    "straight_drive",
    "cover_drive",
    "pull",
    "cut",
    "sweep",
    "bowling_action",
  ],
};

// ─── Speed Thresholds (km/h) ───────────────────────────────────────────────

/**
 * @typedef {Object} SpeedThreshold
 * @property {number} beginner - Upper bound for beginner
 * @property {number} intermediate - Upper bound for intermediate
 * @property {number} advanced - Upper bound for advanced
 * @property {number} elite - Anything above advanced
 */

/** @type {Record<string, SpeedThreshold>} */
export const SPEED_THRESHOLDS = {
  badminton: { beginner: 100, intermediate: 200, advanced: 300, elite: 400 },
  table_tennis: { beginner: 30, intermediate: 60, advanced: 90, elite: 120 },
  tennis: { beginner: 80, intermediate: 140, advanced: 190, elite: 230 },
  pickleball: { beginner: 30, intermediate: 50, advanced: 70, elite: 90 },
  cricket: { beginner: 60, intermediate: 100, advanced: 130, elite: 160 },
};

// ─── Skill Level Thresholds (based on overall score 0-100) ──────────────────

/** @type {{ label: string, minScore: number }[]} */
export const SKILL_LEVEL_THRESHOLDS = [
  { label: "Pro", minScore: 85 },
  { label: "Advanced", minScore: 70 },
  { label: "Intermediate", minScore: 50 },
  { label: "Beginner", minScore: 0 },
];

// Speed thresholds (km/h) — speed is a strong signal of skill level
// If a shot's detected speed exceeds these, the skill level is bumped up
export const SPEED_SKILL_BOOST = {
  badminton: { pro: 150, advanced: 100, intermediate: 60 },
  table_tennis: { pro: 60, advanced: 40, intermediate: 25 },
  tennis: { pro: 130, advanced: 90, intermediate: 60 },
  pickleball: { pro: 50, advanced: 35, intermediate: 22 },
  cricket: { pro: 120, advanced: 85, intermediate: 55 },
};

// ─── Grade Thresholds (based on overall score 0-100) ────────────────────────

/** @type {{ grade: string, minScore: number }[]} */
export const GRADE_THRESHOLDS = [
  { grade: "A", minScore: 85 },
  { grade: "B", minScore: 70 },
  { grade: "C", minScore: 55 },
  { grade: "D", minScore: 40 },
  { grade: "F", minScore: 0 },
];

// ─── Metric Weights for Overall Score ───────────────────────────────────────

/**
 * Weights used to combine individual metric scores into an overall score.
 * Keys match the metric names returned by computeMetrics().
 */
export const METRIC_WEIGHTS = {
  form_score: 0.25,
  consistency_score: 0.20,
  range_of_motion: 0.15,
  balance_score: 0.15,
  elbow_angle_quality: 0.10,
  wrist_action: 0.10,
  footwork_score: 0.05,
};

// ─── Motion Detection Thresholds ────────────────────────────────────────────

/** Pixel-diff threshold above which a frame pair is considered "active". */
export const MOTION_ACTIVE_THRESHOLD = 8;

/** Minimum consecutive active frames to form a segment. */
export const MIN_SEGMENT_FRAMES = 3;

/** Maximum gap (in frames) to merge two nearby segments. */
export const SEGMENT_MERGE_GAP = 2;

// ─── Model Configuration ────────────────────────────────────────────────────

/** MoveNet input resolution (full mode). */
export const MODEL_INPUT_SIZE = 256;

/** Smaller input resolution for quick mode (faster processing). */
export const QUICK_MODEL_INPUT_SIZE = 192;

/** Minimum keypoint confidence for visibility. */
export const MIN_KEYPOINT_SCORE = 0.3;

/** Number of COCO keypoints. */
export const NUM_KEYPOINTS = 17;
