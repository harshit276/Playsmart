/**
 * @module highlightGenerator
 * Orchestrates the full highlight reel pipeline:
 *   1. Detect highlight moments in a video
 *   2. Extract individual clips (with optional slo-mo / labels)
 *   3. Generate thumbnails for each clip
 *   4. Concatenate clips into a single highlight reel
 */

import { detectHighlights } from "./highlightDetector.js";
import { extractClip, concatenateClips, generateThumbnail } from "./videoEditor.js";

/**
 * Generate a complete highlight reel from a video.
 *
 * @param {File} videoFile
 * @param {string} sport
 * @param {Object} options
 * @param {function} [options.onProgress]
 * @param {number} [options.maxClips]
 * @param {boolean} [options.includeSlomo]
 * @returns {Promise<{
 *   reel: Blob,
 *   clips: Array<{blob: Blob, moment: Object, thumbnail: Blob}>,
 *   moments: Object[],
 *   video_info: Object
 * }>}
 */
export async function generateHighlightReel(videoFile, sport, options = {}) {
  const { onProgress, maxClips = 8, includeSlomo = true } = options;
  const progress = (pct, msg) => onProgress?.({ percent: pct, message: msg });

  console.log("[HighlightGen] Starting with file:", videoFile?.name, "sport:", sport);

  // Step 1: Detect highlight moments
  progress(5, "Analyzing video for highlight moments...");
  let detection;
  try {
    detection = await detectHighlights(videoFile, sport, {
      onProgress: (info) => {
        const pct = 5 + (info.percent || 0) * 0.3;
        progress(pct, info.message || "Detecting moments...");
      },
      maxHighlights: maxClips,
    });
    console.log("[HighlightGen] Detected", detection.highlights.length, "moments");
  } catch (detectErr) {
    console.error("[HighlightGen] Detection failed:", detectErr);
    throw new Error(`Could not analyze video: ${detectErr.message}`);
  }

  const moments = detection.highlights.slice(0, maxClips);

  if (moments.length === 0) {
    throw new Error("No highlight-worthy moments detected in this video. Try a longer video with more action.");
  }

  // Step 2: Extract individual clips
  progress(40, `Loading video editor (~25MB on first use)...`);
  const clips = [];
  let firstClipError = null;

  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i];
    progress(
      40 + (i / moments.length) * 30,
      `Extracting clip ${i + 1}/${moments.length}...`
    );

    try {
      const blob = await extractClip(videoFile, moment.start_time, moment.end_time, {
        slowMotion: includeSlomo && moment.should_slowmo,
        label: moment.speed_kmh > 0 ? `${Math.round(moment.speed_kmh)} km/h` : null,
      });

      // Generate thumbnail
      const thumbTime = (moment.start_time + moment.end_time) / 2;
      let thumbnail;
      try {
        thumbnail = await generateThumbnail(videoFile, thumbTime);
      } catch (thumbErr) {
        console.warn("Thumbnail failed:", thumbErr);
        thumbnail = null;
      }

      clips.push({ blob, moment, thumbnail });
      console.log(`[HighlightGen] Extracted clip ${i + 1}`);
    } catch (err) {
      console.error(`[HighlightGen] Failed to extract clip ${i + 1}:`, err);
      if (!firstClipError) firstClipError = err;
    }
  }

  if (clips.length === 0) {
    const msg = firstClipError?.message || "unknown error";
    throw new Error(`Failed to extract clips. Video editor error: ${msg}. Try a different video format (MP4 recommended).`);
  }

  // Step 3: Concatenate into final reel (skip if only 1 clip)
  let reel;
  if (clips.length === 1) {
    reel = clips[0].blob;
    progress(100, "Complete!");
  } else {
    progress(75, "Combining into highlight reel...");
    try {
      reel = await concatenateClips(
        clips.map((c) => c.blob),
        {
          onProgress: (pct, msg) => progress(75 + pct * 0.2, msg),
        }
      );
    } catch (concatErr) {
      console.error("[HighlightGen] Concatenation failed:", concatErr);
      // Fallback: return the first clip as the "reel"
      reel = clips[0].blob;
    }
    progress(100, "Complete!");
  }

  return {
    reel,
    clips,
    moments,
    video_info: detection.video_info,
  };
}
