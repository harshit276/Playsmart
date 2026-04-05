/**
 * @module segmentDetector
 * Detects meaningful segments (rallies, power moments, transitions) from
 * video frames using motion-score analysis and auto-calibrating thresholds.
 * Works entirely on the client using canvas-based frame differencing.
 */

// ──────────────────── Types ────────────────────

/**
 * @typedef {"power_moment"|"rally"|"transition"|"neutral"} SegmentType
 */

/**
 * @typedef {Object} Segment
 * @property {number} start - Start time in seconds.
 * @property {number} end - End time in seconds.
 * @property {SegmentType} type
 * @property {number} score - Average motion score for the segment (0-1).
 * @property {number} peak_score - Maximum motion score within the segment.
 */

/**
 * @typedef {Object} HighlightClip
 * @property {number} start - Start time in seconds.
 * @property {number} end - End time in seconds.
 * @property {number} score - Relevance score (higher = more interesting).
 * @property {string} label - Human-readable label for the clip.
 */

// ──────────────────── Constants ────────────────────

import {
  MIN_SEGMENT_FRAMES,
  SEGMENT_MERGE_GAP,
} from "./constants.js";

/** Minimum segment duration in seconds. */
const MIN_SEGMENT_DURATION = 0.5;

/**
 * Merge gap: segments closer than this (seconds) get merged.
 * Derived from constants.js SEGMENT_MERGE_GAP (frames) assuming ~30fps.
 */
const MERGE_GAP = SEGMENT_MERGE_GAP / 30;

/** Default motion-score percentile used as the "high activity" threshold. */
const HIGH_PERCENTILE = 75;

/** Default motion-score percentile used as the "low activity" threshold. */
const LOW_PERCENTILE = 30;

// ──────────────────── Motion scoring ────────────────────

/**
 * Compute per-frame motion scores by pixel-differencing consecutive frames.
 * Each frame must be an ImageData or an object with { data, width, height }.
 *
 * If raw ImageData is not available (e.g. you have HTMLCanvasElement), convert
 * to ImageData first using `canvasToImageData`.
 *
 * @param {ImageData[]} frames - Ordered array of frame image data.
 * @returns {number[]} Array of motion scores (length = frames.length - 1), each in [0, 1].
 */
export function computeMotionScores(frames) {
  if (!frames || frames.length < 2) return [];

  const scores = [];
  for (let i = 1; i < frames.length; i++) {
    scores.push(frameDifference(frames[i - 1], frames[i]));
  }
  return scores;
}

/**
 * Compute the normalised pixel difference between two frames.
 * Uses luminance (grayscale) to be colour-space-agnostic.
 *
 * @param {ImageData} a
 * @param {ImageData} b
 * @returns {number} Score in [0, 1] where 0 = identical, 1 = completely different.
 */
function frameDifference(a, b) {
  if (!a?.data || !b?.data) return 0;

  const len = Math.min(a.data.length, b.data.length);
  const pixelCount = len / 4;
  if (pixelCount === 0) return 0;

  let totalDiff = 0;
  for (let i = 0; i < len; i += 4) {
    // Luminance approximation: 0.299R + 0.587G + 0.114B
    const lumA = 0.299 * a.data[i] + 0.587 * a.data[i + 1] + 0.114 * a.data[i + 2];
    const lumB = 0.299 * b.data[i] + 0.587 * b.data[i + 1] + 0.114 * b.data[i + 2];
    totalDiff += Math.abs(lumA - lumB);
  }

  // Normalise to [0, 1] (max possible diff per pixel = 255)
  return totalDiff / (pixelCount * 255);
}

/**
 * Helper: extract ImageData from an HTMLCanvasElement.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {ImageData}
 */
export function canvasToImageData(canvas) {
  const ctx = canvas.getContext("2d");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// ──────────────────── Threshold calibration ────────────────────

/**
 * Compute a given percentile from a sorted-ascending array.
 *
 * @param {number[]} sortedArr
 * @param {number} pct - Percentile (0-100).
 * @returns {number}
 */
function getPercentile(sortedArr, pct) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(
    sortedArr.length - 1,
    Math.max(0, Math.floor((pct / 100) * sortedArr.length))
  );
  return sortedArr[idx];
}

/**
 * Derive auto-calibrated thresholds from the motion score distribution.
 *
 * @param {number[]} motionScores
 * @returns {{ highThreshold: number, lowThreshold: number }}
 */
function calibrateThresholds(motionScores) {
  if (motionScores.length === 0) return { highThreshold: 0.5, lowThreshold: 0.1 };

  const sorted = [...motionScores].sort((a, b) => a - b);
  const highThreshold = getPercentile(sorted, HIGH_PERCENTILE);
  const lowThreshold = getPercentile(sorted, LOW_PERCENTILE);

  return { highThreshold, lowThreshold };
}

// ──────────────────── Segment building ────────────────────

/**
 * Given motion scores and timestamps, find contiguous high-activity and
 * low-activity regions and label them.
 *
 * @param {number[]} motionScores
 * @param {number[]} timestamps - Timestamp (seconds) for each score entry.
 * @param {number} highThreshold
 * @param {number} lowThreshold
 * @returns {Segment[]}
 */
function buildRawSegments(motionScores, timestamps, highThreshold, lowThreshold) {
  if (motionScores.length === 0) return [];

  const segments = [];
  let currentType = classifyScore(motionScores[0], highThreshold, lowThreshold);
  let segStart = timestamps[0] ?? 0;
  let segScores = [motionScores[0]];

  for (let i = 1; i < motionScores.length; i++) {
    const type = classifyScore(motionScores[i], highThreshold, lowThreshold);
    if (type !== currentType) {
      // Close previous segment
      segments.push(createSegment(segStart, timestamps[i - 1] ?? segStart, currentType, segScores));
      currentType = type;
      segStart = timestamps[i] ?? segStart;
      segScores = [motionScores[i]];
    } else {
      segScores.push(motionScores[i]);
    }
  }

  // Close last segment
  const lastTs = timestamps[timestamps.length - 1] ?? segStart;
  segments.push(createSegment(segStart, lastTs, currentType, segScores));

  return segments;
}

/**
 * Classify a single motion score into a segment type.
 *
 * @param {number} score
 * @param {number} highThreshold
 * @param {number} lowThreshold
 * @returns {SegmentType}
 */
function classifyScore(score, highThreshold, lowThreshold) {
  if (score >= highThreshold) return "power_moment";
  if (score >= lowThreshold) return "rally";
  return "neutral";
}

/**
 * Build a Segment object from accumulated data.
 *
 * @param {number} start
 * @param {number} end
 * @param {SegmentType} type
 * @param {number[]} scores
 * @returns {Segment}
 */
function createSegment(start, end, type, scores) {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const peak = Math.max(...scores);
  return {
    start: Math.round(start * 1000) / 1000,
    end: Math.round(end * 1000) / 1000,
    type,
    score: Math.round(avg * 10000) / 10000,
    peak_score: Math.round(peak * 10000) / 10000,
  };
}

/**
 * Merge adjacent segments of the same type that are closer than MERGE_GAP,
 * and drop segments shorter than MIN_SEGMENT_DURATION.
 *
 * @param {Segment[]} segments
 * @returns {Segment[]}
 */
function mergeAndFilter(segments) {
  if (segments.length === 0) return [];

  const merged = [{ ...segments[0] }];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];

    if (curr.type === prev.type && curr.start - prev.end <= MERGE_GAP) {
      // Merge
      prev.end = curr.end;
      prev.score = (prev.score + curr.score) / 2;
      prev.peak_score = Math.max(prev.peak_score, curr.peak_score);
    } else {
      merged.push({ ...curr });
    }
  }

  // Filter out too-short segments (except power_moment, which can be brief)
  return merged.filter(
    (s) => s.type === "power_moment" || s.end - s.start >= MIN_SEGMENT_DURATION
  );
}

/**
 * Label "transition" segments: neutral segments sandwiched between two
 * active segments (rally or power_moment).
 *
 * @param {Segment[]} segments
 * @returns {Segment[]}
 */
function labelTransitions(segments) {
  return segments.map((seg, i) => {
    if (seg.type !== "neutral") return seg;
    const prev = segments[i - 1];
    const next = segments[i + 1];
    const isTransition =
      prev &&
      next &&
      (prev.type === "rally" || prev.type === "power_moment") &&
      (next.type === "rally" || next.type === "power_moment");
    if (isTransition) {
      return { ...seg, type: "transition" };
    }
    return seg;
  });
}

// ──────────────────── Public API ────────────────────

/**
 * Detect segments from a sequence of video frames.
 *
 * You can either pass pre-computed motion scores (via the `motionScores`
 * option) or raw ImageData frames. If you pass raw frames, motion scores
 * will be computed internally.
 *
 * @param {ImageData[]|null} frames - Raw frames (can be null if motionScores provided).
 * @param {number[]} timestamps - Timestamp in seconds for each frame / score.
 * @param {number} fps - Frames per second of the source video.
 * @param {{ motionScores?: number[] }} [options]
 * @returns {Segment[]}
 */
export function detectSegments(frames, timestamps, fps, options = {}) {
  let scores = options.motionScores;

  if (!scores) {
    if (!frames || frames.length < 2) return [];
    scores = computeMotionScores(frames);
  }

  if (scores.length === 0) return [];

  // If timestamps array is shorter than scores, generate from fps
  const ts =
    timestamps && timestamps.length >= scores.length
      ? timestamps
      : scores.map((_, i) => i / (fps || 30));

  const { highThreshold, lowThreshold } = calibrateThresholds(scores);
  const raw = buildRawSegments(scores, ts, highThreshold, lowThreshold);
  const merged = mergeAndFilter(raw);
  const labelled = labelTransitions(merged);

  return labelled;
}

/**
 * Pick the most interesting segments as highlight clips, fitting within a
 * maximum total duration.
 *
 * @param {Segment[]} segments - Output from `detectSegments`.
 * @param {number} videoDuration - Total video duration in seconds.
 * @param {number} [maxDuration=30] - Maximum total highlight duration in seconds.
 * @returns {HighlightClip[]}
 */
export function getHighlightTimestamps(segments, videoDuration, maxDuration = 30) {
  if (!segments || segments.length === 0) return [];

  // Score each segment: power_moment gets highest weight
  const typeWeight = {
    power_moment: 3,
    rally: 2,
    transition: 0.5,
    neutral: 0.1,
  };

  const ranked = segments
    .map((seg) => ({
      ...seg,
      _rank: (typeWeight[seg.type] ?? 1) * seg.peak_score * (seg.end - seg.start + 0.5),
    }))
    .sort((a, b) => b._rank - a._rank);

  // Greedily pick top segments until budget exhausted
  const clips = [];
  let totalDuration = 0;

  for (const seg of ranked) {
    const dur = seg.end - seg.start;
    if (dur <= 0) continue;

    // Add a 0.5 s buffer on each side (clamped to video bounds)
    const clipStart = Math.max(0, seg.start - 0.5);
    const clipEnd = Math.min(videoDuration, seg.end + 0.5);
    const clipDur = clipEnd - clipStart;

    if (totalDuration + clipDur > maxDuration) continue;

    clips.push({
      start: Math.round(clipStart * 100) / 100,
      end: Math.round(clipEnd * 100) / 100,
      score: Math.round(seg.peak_score * 1000) / 1000,
      label: formatSegmentLabel(seg.type),
    });

    totalDuration += clipDur;
  }

  // Sort clips chronologically
  clips.sort((a, b) => a.start - b.start);

  return clips;
}

/**
 * Convert a segment type to a human-readable label.
 *
 * @param {SegmentType} type
 * @returns {string}
 */
function formatSegmentLabel(type) {
  const labels = {
    power_moment: "Power Moment",
    rally: "Rally",
    transition: "Transition",
    neutral: "Neutral",
  };
  return labels[type] ?? "Segment";
}
