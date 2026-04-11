/**
 * @module highlightDetector
 * Sport-specific highlight detection engine.
 *
 * Analyzes a sports video and returns a ranked list of highlight-worthy
 * moments (smashes, rallies, winners, etc.). Runs fully in the browser and
 * reuses the existing motion-scoring and segment-detection pipeline from
 * `segmentDetector.js`, plus optional pose detection for shot-speed scoring.
 *
 * This module only DETECTS moments (timestamps + metadata). Clip extraction
 * and encoding is the responsibility of a later stage (videoEditor.js).
 */

import {
  computeMotionScores,
  detectSegments as detectMotionSegments,
} from "./segmentDetector.js";
import { SPEED_THRESHOLDS } from "./constants.js";

/**
 * @typedef {Object} HighlightMoment
 * @property {number} start_time - Clip start in seconds.
 * @property {number} end_time - Clip end in seconds.
 * @property {number} duration - Duration in seconds.
 * @property {("smash"|"rally"|"long_rally"|"power_moment"|"winner"|"ace"|"moment")} type
 * @property {number} score - 0..100 importance score.
 * @property {string} description - Human-readable description.
 * @property {boolean} should_slowmo - Whether clip benefits from slo-mo.
 * @property {number} speed_kmh - Estimated peak speed (0 if unknown).
 * @property {string} player - Player identifier (default "player_1").
 * @property {Object} stats - Extra metadata (shot_count, intensity, etc.).
 */

/**
 * @typedef {Object} VideoInfo
 * @property {number} duration
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 */

/**
 * @typedef {Object} DetectionResult
 * @property {HighlightMoment[]} highlights - Sorted by score descending.
 * @property {VideoInfo} video_info
 * @property {{ total_frames_analyzed: number, activity_periods_found: number, shots_detected: number }} processing_stats
 */

// ─── Tunables ───────────────────────────────────────────────────────────────

const TARGET_FPS = 10;                 // sample rate for motion analysis
const FRAME_CANVAS_SIZE = 128;         // small canvas = fast diffs
const MIN_MOMENT_DURATION = 1.5;       // seconds
const MAX_MOMENT_DURATION = 8.0;       // seconds
const CLIP_PRE_ROLL = 0.4;             // pad before activity
const CLIP_POST_ROLL = 0.6;            // pad after activity
const LONG_RALLY_SECONDS = 3.0;

/**
 * Per-sport tuning. `rallyShotsThreshold` is how many motion peaks inside a
 * segment count as a "long rally" for that sport.
 */
const SPORT_CONFIG = {
  badminton:    { rallyShotsThreshold: 5,  powerBoost: 25, slowmoBias: 1.15 },
  tennis:       { rallyShotsThreshold: 5,  powerBoost: 22, slowmoBias: 1.10 },
  table_tennis: { rallyShotsThreshold: 10, powerBoost: 20, slowmoBias: 1.20 },
  pickleball:   { rallyShotsThreshold: 6,  powerBoost: 20, slowmoBias: 1.05 },
  cricket:      { rallyShotsThreshold: 2,  powerBoost: 30, slowmoBias: 1.25 },
};

// ─── Frame sampling ─────────────────────────────────────────────────────────

/**
 * Sample frames from a video at ~TARGET_FPS using an HTMLVideoElement and
 * canvas. Returns ImageData plus their timestamps and the video's native
 * metadata.
 *
 * @param {File} videoFile
 * @param {(p:{percent:number,message:string})=>void} [onProgress]
 * @returns {Promise<{ frames: ImageData[], timestamps: number[], info: VideoInfo }>}
 */
async function sampleFrames(videoFile, onProgress) {
  const video = document.createElement("video");
  const url = URL.createObjectURL(videoFile);
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Failed to load video metadata"));
    video.load();
  });

  const duration = video.duration;
  if (!duration || !isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(url);
    throw new Error("Invalid video duration");
  }

  const videoWidth = video.videoWidth || 0;
  const videoHeight = video.videoHeight || 0;

  // Scale frame count with duration but cap it so long videos stay fast.
  const desiredFrames = Math.ceil(duration * TARGET_FPS);
  const maxFrames = 600; // hard cap: ~60s at 10fps worth of samples
  const frameCount = Math.max(8, Math.min(desiredFrames, maxFrames));
  const interval = duration / frameCount;

  const canvas = document.createElement("canvas");
  canvas.width = FRAME_CANVAS_SIZE;
  canvas.height = FRAME_CANVAS_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const frames = [];
  const timestamps = [];

  for (let i = 0; i < frameCount; i++) {
    const t = Math.min(i * interval, Math.max(0, duration - 0.01));
    video.currentTime = t;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });

    ctx.drawImage(video, 0, 0, FRAME_CANVAS_SIZE, FRAME_CANVAS_SIZE);
    frames.push(ctx.getImageData(0, 0, FRAME_CANVAS_SIZE, FRAME_CANVAS_SIZE));
    timestamps.push(t);

    if (onProgress && i % 5 === 0) {
      onProgress({
        percent: 5 + (i / frameCount) * 45,
        message: `Sampling frames ${i + 1}/${frameCount}`,
      });
    }
  }

  URL.revokeObjectURL(url);

  return {
    frames,
    timestamps,
    info: {
      duration,
      width: videoWidth,
      height: videoHeight,
      fps: frameCount / duration,
    },
  };
}

// ─── Shot peak detection ────────────────────────────────────────────────────

/**
 * Find local maxima in motion scores that exceed `threshold`. Returns an
 * array of { index, score, time }. Peaks must be separated by at least
 * `minGap` seconds.
 *
 * @param {number[]} scores
 * @param {number[]} times
 * @param {number} threshold
 * @param {number} [minGap=0.35]
 * @returns {{index:number, score:number, time:number}[]}
 */
function findShotPeaks(scores, times, threshold, minGap = 0.35) {
  const peaks = [];
  for (let i = 1; i < scores.length - 1; i++) {
    const s = scores[i];
    if (s < threshold) continue;
    if (s < scores[i - 1] || s < scores[i + 1]) continue;
    const t = times[i] ?? 0;
    const prev = peaks[peaks.length - 1];
    if (!prev || t - prev.time >= minGap) {
      peaks.push({ index: i, score: s, time: t });
    } else if (s > prev.score) {
      // Replace the previous peak with this stronger one.
      peaks[peaks.length - 1] = { index: i, score: s, time: t };
    }
  }
  return peaks;
}

// ─── Moment construction ────────────────────────────────────────────────────

/**
 * Bundle a motion segment plus any shot peaks it contains into a
 * HighlightMoment. Returns null if the segment is too short / too quiet.
 *
 * @param {{start:number,end:number,type:string,score:number,peak_score:number}} segment
 * @param {{index:number,score:number,time:number}[]} peaksInSegment
 * @param {number} videoDuration
 * @param {string} sport
 * @returns {HighlightMoment|null}
 */
function segmentToMoment(segment, peaksInSegment, videoDuration, sport) {
  const cfg = SPORT_CONFIG[sport] || SPORT_CONFIG.badminton;

  const rawStart = segment.start;
  const rawEnd = segment.end;
  let duration = rawEnd - rawStart;

  // Pad the clip a little so viewers see wind-up and follow-through.
  let start = Math.max(0, rawStart - CLIP_PRE_ROLL);
  let end = Math.min(videoDuration, rawEnd + CLIP_POST_ROLL);

  // Enforce a minimum duration (center-expand if needed).
  if (end - start < MIN_MOMENT_DURATION) {
    const center = (start + end) / 2;
    start = Math.max(0, center - MIN_MOMENT_DURATION / 2);
    end = Math.min(videoDuration, center + MIN_MOMENT_DURATION / 2);
  }

  // Enforce a maximum duration (keep around peak).
  if (end - start > MAX_MOMENT_DURATION) {
    const peakTime =
      peaksInSegment.length > 0
        ? peaksInSegment.reduce((a, b) => (a.score > b.score ? a : b)).time
        : (start + end) / 2;
    start = Math.max(0, peakTime - MAX_MOMENT_DURATION / 2);
    end = Math.min(videoDuration, start + MAX_MOMENT_DURATION);
  }

  duration = end - start;
  if (duration < MIN_MOMENT_DURATION) return null;

  const shotCount = peaksInSegment.length;
  const peakScore = segment.peak_score ?? 0;
  const avgScore = segment.score ?? 0;

  // ── Scoring ────────────────────────────────────────────────────
  // Normalise components into 0..1 then combine.
  const activityDuration = rawEnd - rawStart;
  const durationScore = Math.min(1, activityDuration / 6); // 6s ≈ full credit
  const intensityScore = Math.min(1, peakScore / 0.4);     // peak diff ~0.4 is extreme
  const varietyScore = Math.min(1, shotCount / 6);         // 6 shots ≈ full credit

  let base =
    durationScore * 0.3 +
    intensityScore * 0.5 +
    varietyScore * 0.2;

  // Convert 0..1 to 0..100.
  let score = base * 100;

  const isLongRally = activityDuration >= LONG_RALLY_SECONDS && shotCount >= 3;
  const isPowerMoment =
    segment.type === "power_moment" || peakScore > 0.28 || shotCount === 1 && peakScore > 0.22;
  const hasMultipleShots = shotCount >= 2;

  if (isPowerMoment) score += cfg.powerBoost;
  if (hasMultipleShots) score += 15;
  if (isLongRally) score += 10;

  score = Math.max(0, Math.min(100, Math.round(score)));

  // ── Type classification ────────────────────────────────────────
  const type = classifyMomentType({
    sport,
    shotCount,
    activityDuration,
    peakScore,
    isLongRally,
    isPowerMoment,
    rallyShotsThreshold: cfg.rallyShotsThreshold,
  });

  // ── Speed estimate (rough) ─────────────────────────────────────
  // Map peak motion score -> km/h using the sport's elite threshold as
  // the ceiling of the mapping. This is approximate; a real estimator
  // would use pose-based wrist speed.
  const sportSpeeds = SPEED_THRESHOLDS[sport] || SPEED_THRESHOLDS.badminton;
  const maxKmh = sportSpeeds?.elite ?? 300;
  const speedFrac = Math.min(1, peakScore / 0.35);
  const speed_kmh = isPowerMoment ? Math.round(speedFrac * maxKmh) : 0;

  const moment = {
    start_time: Math.round(start * 100) / 100,
    end_time: Math.round(end * 100) / 100,
    duration: Math.round(duration * 100) / 100,
    type,
    score,
    description: "",
    should_slowmo: false,
    speed_kmh,
    player: "player_1",
    stats: {
      shot_count: shotCount,
      peak_intensity: Math.round(peakScore * 1000) / 1000,
      avg_intensity: Math.round(avgScore * 1000) / 1000,
      activity_duration: Math.round(activityDuration * 100) / 100,
      is_long_rally: isLongRally,
      is_power_moment: isPowerMoment,
    },
  };

  moment.should_slowmo = shouldSlowMotion(moment);
  moment.description = describeMoment(moment, sport);

  return moment;
}

/**
 * Classify a moment into a sport-aware type string.
 *
 * @param {Object} ctx
 * @returns {HighlightMoment["type"]}
 */
function classifyMomentType(ctx) {
  const {
    sport,
    shotCount,
    activityDuration,
    isLongRally,
    isPowerMoment,
    rallyShotsThreshold,
  } = ctx;

  if (sport === "cricket") {
    if (isPowerMoment) return "power_moment";
    return "moment";
  }

  if (shotCount >= rallyShotsThreshold) return "long_rally";
  if (isLongRally) return "long_rally";
  if (shotCount >= 2 && activityDuration >= 1.5) return "rally";

  if (isPowerMoment) {
    if (sport === "badminton") return "smash";
    if (sport === "tennis" && activityDuration < 2) return "ace";
    return "power_moment";
  }

  if (shotCount === 1) return "winner";
  return "moment";
}

// ─── Public helpers ─────────────────────────────────────────────────────────

/**
 * Score a single HighlightMoment using the same formula as the detector.
 * Useful for re-ranking externally edited moment lists.
 *
 * @param {HighlightMoment} moment
 * @param {string} [sport="badminton"]
 * @returns {number} 0..100
 */
export function scoreHighlight(moment, sport = "badminton") {
  if (!moment) return 0;
  const cfg = SPORT_CONFIG[sport] || SPORT_CONFIG.badminton;
  const stats = moment.stats || {};
  const dur = stats.activity_duration ?? moment.duration ?? 0;
  const peak = stats.peak_intensity ?? 0;
  const shots = stats.shot_count ?? 0;

  const durationScore = Math.min(1, dur / 6);
  const intensityScore = Math.min(1, peak / 0.4);
  const varietyScore = Math.min(1, shots / 6);

  let score =
    (durationScore * 0.3 + intensityScore * 0.5 + varietyScore * 0.2) * 100;
  if (stats.is_power_moment) score += cfg.powerBoost;
  if (shots >= 2) score += 15;
  if (stats.is_long_rally) score += 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Decide whether a moment benefits from slow-motion playback. Short, intense
 * bursts look great slowed down; long rallies generally do not.
 *
 * @param {HighlightMoment} moment
 * @returns {boolean}
 */
export function shouldSlowMotion(moment) {
  if (!moment) return false;
  // Power moments always get slo-mo
  if (moment.type === "smash" || moment.type === "ace" || moment.type === "power_moment" || moment.type === "winner") {
    return true;
  }
  // Short intense moments get slo-mo
  if (moment.duration < 3 && moment.score > 60) return true;
  // High-power detected moments
  if (moment.stats?.is_power_moment) return true;
  return false;
}

/**
 * Build a short human-readable description for a moment.
 *
 * @param {HighlightMoment} moment
 * @param {string} sport
 * @returns {string}
 */
export function describeMoment(moment, sport) {
  if (!moment) return "Highlight moment";
  const speed = moment.speed_kmh;

  // Don't use shot_count in descriptions — it's unreliable from motion-only detection.
  // Use generic but accurate descriptions instead.
  switch (moment.type) {
    case "smash":
      return speed > 0 ? `Power smash · ${speed} km/h` : "Power smash";
    case "ace":
      return "Service ace";
    case "winner":
      return speed > 0 ? `Winner · ${speed} km/h` : "Winning shot";
    case "power_moment":
      return speed > 0 ? `Power shot · ${speed} km/h` : "Quick winner";
    case "rally":
      return "Rally";
    case "long_rally":
      return "Long rally";
    default:
      return sport ? `${sport.replace("_", " ")} highlight` : "Highlight moment";
  }
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Detect highlight-worthy moments in a video.
 *
 * @param {File} videoFile
 * @param {string} sport - badminton | tennis | table_tennis | pickleball | cricket
 * @param {Object} [options]
 * @param {(p:{percent:number,message:string})=>void} [options.onProgress]
 * @param {number} [options.maxHighlights=10]
 * @returns {Promise<DetectionResult>}
 */
export async function detectHighlights(videoFile, sport, options = {}) {
  const { onProgress, maxHighlights = 10 } = options;
  const normalizedSport = (sport || "badminton").toLowerCase();

  onProgress?.({ percent: 2, message: "Loading video..." });

  // ── 1. Sample frames ─────────────────────────────────────────────
  const { frames, timestamps, info } = await sampleFrames(videoFile, onProgress);

  if (frames.length < 3) {
    onProgress?.({ percent: 100, message: "Video too short" });
    return {
      highlights: [],
      video_info: info,
      processing_stats: {
        total_frames_analyzed: frames.length,
        activity_periods_found: 0,
        shots_detected: 0,
      },
    };
  }

  // ── 2. Motion scores ─────────────────────────────────────────────
  onProgress?.({ percent: 55, message: "Computing motion..." });
  const motionScores = computeMotionScores(frames);
  // Motion scores length = frames.length - 1; align timestamps to the
  // "current" frame of each diff pair.
  const motionTimes = timestamps.slice(1);

  // ── 3. Segment detection (reuse existing pipeline) ───────────────
  onProgress?.({ percent: 65, message: "Finding activity periods..." });
  const segments = detectMotionSegments(null, motionTimes, info.fps, {
    motionScores,
  });

  const activeSegments = segments.filter(
    (s) => s.type === "rally" || s.type === "power_moment"
  );

  // ── 4. Shot peak detection ───────────────────────────────────────
  onProgress?.({ percent: 78, message: "Detecting shots..." });
  // Use the 75th percentile as peak threshold.
  const sorted = [...motionScores].sort((a, b) => a - b);
  const peakThreshold =
    sorted[Math.floor(sorted.length * 0.75)] ?? 0.1;
  const allPeaks = findShotPeaks(motionScores, motionTimes, peakThreshold);

  // ── 5. Build moments ─────────────────────────────────────────────
  onProgress?.({ percent: 88, message: "Ranking highlights..." });

  const moments = [];
  for (const seg of activeSegments) {
    const peaksInSeg = allPeaks.filter(
      (p) => p.time >= seg.start && p.time <= seg.end
    );
    const moment = segmentToMoment(seg, peaksInSeg, info.duration, normalizedSport);
    if (moment) moments.push(moment);
  }

  // De-duplicate overlapping moments (keep the higher-scoring one).
  moments.sort((a, b) => a.start_time - b.start_time);
  const deduped = [];
  for (const m of moments) {
    const last = deduped[deduped.length - 1];
    if (last && m.start_time < last.end_time - 0.1) {
      if (m.score > last.score) deduped[deduped.length - 1] = m;
    } else {
      deduped.push(m);
    }
  }

  // Sort by score descending and take top N.
  deduped.sort((a, b) => b.score - a.score);
  const top = deduped.slice(0, maxHighlights);

  onProgress?.({ percent: 100, message: "Detection complete" });

  return {
    highlights: top,
    video_info: info,
    processing_stats: {
      total_frames_analyzed: frames.length,
      activity_periods_found: activeSegments.length,
      shots_detected: allPeaks.length,
    },
  };
}

/**
 * The detector has no model dependency beyond what segmentDetector needs
 * (pure pixel math), so it's always ready.
 * @returns {boolean}
 */
export function isDetectorReady() {
  return true;
}
