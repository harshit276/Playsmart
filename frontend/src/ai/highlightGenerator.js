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

  // Step 1: Detect highlight moments
  progress(5, "Analyzing video for highlight moments...");
  const detection = await detectHighlights(videoFile, sport, {
    onProgress: (info) => {
      const pct = 5 + (info.percent || 0) * 0.3;
      progress(pct, info.message || "Detecting moments...");
    },
    maxHighlights: maxClips,
  });

  const moments = detection.highlights.slice(0, maxClips);

  if (moments.length === 0) {
    throw new Error("No highlight-worthy moments detected in this video");
  }

  // Step 2: Extract individual clips
  progress(40, `Extracting ${moments.length} clips...`);
  const clips = [];

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
      const thumbnail = await generateThumbnail(videoFile, thumbTime);

      clips.push({ blob, moment, thumbnail });
    } catch (err) {
      console.warn(`Failed to extract clip ${i + 1}:`, err);
    }
  }

  if (clips.length === 0) {
    throw new Error("Failed to extract any clips");
  }

  // Step 3: Concatenate into final reel
  progress(75, "Combining into highlight reel...");
  const reel = await concatenateClips(
    clips.map((c) => c.blob),
    {
      onProgress: (pct, msg) => progress(75 + pct * 0.2, msg),
    }
  );

  progress(100, "Complete!");

  return {
    reel,
    clips,
    moments,
    video_info: detection.video_info,
  };
}
