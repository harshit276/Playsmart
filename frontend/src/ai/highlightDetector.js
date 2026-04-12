/**
 * @module highlightDetector
 * Motion-pattern-based highlight detection engine.
 *
 * Analyzes a sports video using active/rest cycle detection to find
 * highlight-worthy moments. Runs fully in the browser using canvas
 * pixel differencing — no external dependencies.
 *
 * Sports videos follow a pattern:
 *   REST → SERVE → RALLY → POINT_ENDS → REST → ...
 * A "highlight" is the ACTIVE period (serve+rally) between rests.
 */

/**
 * Detect highlight-worthy moments in a video.
 *
 * @param {File} videoFile
 * @param {string} sport
 * @param {Object} [options]
 * @param {(p:{percent:number,message:string})=>void} [options.onProgress]
 * @param {number} [options.maxHighlights=8]
 * @returns {Promise<{highlights: Object[], video_info: Object, processing_stats: Object}>}
 */
export async function detectHighlights(videoFile, sport, options = {}) {
  const { onProgress, maxHighlights = 8 } = options;

  // 1. Load video metadata
  const video = document.createElement("video");
  video.src = URL.createObjectURL(videoFile);
  video.muted = true;
  video.playsInline = true;

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Could not load video"));
    video.load();
  });

  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  // 2. Sample at ~5fps, cap at 500 frames
  const sampleFps = 5;
  const totalSamples = Math.min(500, Math.ceil(duration * sampleFps));
  const interval = duration / totalSamples;

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const motionScores = [];
  const timestamps = [];
  let prevData = null;

  for (let i = 0; i < totalSamples; i++) {
    const t = Math.min(i * interval, duration - 0.01);
    video.currentTime = t;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => {
      video.onseeked = r;
    });

    ctx.drawImage(video, 0, 0, 128, 128);
    const data = ctx.getImageData(0, 0, 128, 128).data;

    if (prevData) {
      // Compute motion: average absolute pixel difference (grayscale)
      let totalDiff = 0;
      const pixelCount = data.length / 4;
      for (let p = 0; p < data.length; p += 4) {
        const gray1 = (prevData[p] + prevData[p + 1] + prevData[p + 2]) / 3;
        const gray2 = (data[p] + data[p + 1] + data[p + 2]) / 3;
        totalDiff += Math.abs(gray1 - gray2);
      }
      motionScores.push(totalDiff / pixelCount);
    } else {
      motionScores.push(0);
    }
    timestamps.push(t);
    prevData = new Uint8ClampedArray(data);

    if (onProgress && i % 10 === 0) {
      onProgress({
        percent: (i / totalSamples) * 80,
        message: `Analyzing frame ${i}/${totalSamples}`,
      });
    }
  }

  URL.revokeObjectURL(video.src);

  // 3. Smooth motion scores (moving average, window 5)
  const smoothed = smoothArray(motionScores, 5);

  // 4. Auto-calibrate threshold
  const nonZero = smoothed.filter((s) => s > 0.5);
  if (nonZero.length === 0) {
    onProgress?.({ percent: 100, message: "Analysis complete" });
    return {
      highlights: [],
      video_info: { duration, width, height },
      processing_stats: {
        total_frames_analyzed: totalSamples,
        activity_periods_found: 0,
        threshold_used: 0,
      },
    };
  }

  nonZero.sort((a, b) => a - b);
  const median = nonZero[Math.floor(nonZero.length / 2)];
  const threshold = median * 0.8; // Slightly below median = catch more action

  // 5. Find active/rest periods
  const MIN_REST_DURATION = 1.5; // seconds of quiet = point ended
  const MIN_ACTIVE_DURATION = 1.5; // minimum rally length
  const MAX_ACTIVE_DURATION = 15; // maximum clip length

  const segments = findActiveRestPeriods(
    smoothed,
    timestamps,
    threshold,
    MIN_REST_DURATION
  );

  // 6. Filter and score active segments
  const candidates = segments
    .filter((seg) => seg.type === "active")
    .filter((seg) => seg.duration >= MIN_ACTIVE_DURATION)
    .map((seg) => {
      // Trim to max duration (keep the most intense part)
      let start = seg.start;
      let end = seg.end;
      if (end - start > MAX_ACTIVE_DURATION) {
        // Find the peak within this segment and center around it
        let maxScore = 0;
        let maxIdx = seg.startIdx;
        for (let i = seg.startIdx; i <= seg.endIdx; i++) {
          if (smoothed[i] > maxScore) {
            maxScore = smoothed[i];
            maxIdx = i;
          }
        }
        const peakTime = timestamps[maxIdx];
        start = Math.max(seg.start, peakTime - MAX_ACTIVE_DURATION / 2);
        end = Math.min(seg.end, start + MAX_ACTIVE_DURATION);
      }

      // Add padding (0.5s before, 0.3s after)
      start = Math.max(0, start - 0.5);
      end = Math.min(duration, end + 0.3);

      // Score
      const clipDuration = end - start;
      const peakIntensity = Math.max(
        ...smoothed.slice(seg.startIdx, seg.endIdx + 1)
      );
      // Sharpness: how quickly motion drops at the end (sharp end = point scored)
      const endSharpness =
        seg.endIdx < smoothed.length - 1
          ? Math.max(
              0,
              smoothed[seg.endIdx] -
                smoothed[Math.min(seg.endIdx + 3, smoothed.length - 1)]
            )
          : 0;

      const score = Math.min(
        100,
        Math.round(
          Math.min(1, clipDuration / 8) * 40 + // longer = better (up to 8s)
            Math.min(1, peakIntensity / (median * 3)) * 40 + // more intense = better
            Math.min(1, endSharpness / (median * 2)) * 20 // sharp ending = better
        )
      );

      return {
        start_time: Math.round(start * 10) / 10,
        end_time: Math.round(end * 10) / 10,
        duration: Math.round((end - start) * 10) / 10,
        type:
          peakIntensity > median * 2.5
            ? "power_moment"
            : clipDuration > 5
            ? "rally"
            : "moment",
        score,
        description: "",
        should_slowmo: peakIntensity > median * 2.5 && clipDuration < 3,
        speed_kmh: 0, // Can't reliably estimate from motion alone
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxHighlights);

  // Add descriptions
  candidates.forEach((m) => {
    if (m.type === "power_moment") m.description = "Power moment";
    else if (m.type === "rally") m.description = `Rally \u00b7 ${m.duration}s`;
    else m.description = "Active play";
  });

  // Sort chronologically for playback
  candidates.sort((a, b) => a.start_time - b.start_time);

  onProgress?.({ percent: 100, message: "Analysis complete" });

  return {
    highlights: candidates,
    video_info: { duration, width, height, fps: sampleFps },
    processing_stats: {
      total_frames_analyzed: totalSamples,
      activity_periods_found: segments.filter((s) => s.type === "active")
        .length,
      threshold_used: threshold,
    },
  };
}

// ─── Helper: Smooth array with moving average ──────────────────────────────

function smoothArray(arr, window) {
  const result = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let count = 0;
    for (
      let j = Math.max(0, i - half);
      j <= Math.min(arr.length - 1, i + half);
      j++
    ) {
      sum += arr[j];
      count++;
    }
    result.push(sum / count);
  }
  return result;
}

// ─── Helper: Find active/rest periods ──────────────────────────────────────

function findActiveRestPeriods(scores, timestamps, threshold, minRestDuration) {
  const segments = [];
  let currentType = scores[0] >= threshold ? "active" : "rest";
  let segStart = 0;

  for (let i = 1; i < scores.length; i++) {
    const type = scores[i] >= threshold ? "active" : "rest";
    if (type !== currentType) {
      const start = timestamps[segStart];
      const end = timestamps[i - 1];
      const dur = end - start;

      // Only create a "rest" segment if it's long enough
      // (short pauses are part of the rally)
      if (currentType === "rest" && dur < minRestDuration) {
        continue;
      }

      segments.push({
        type: currentType,
        start,
        end,
        duration: dur,
        startIdx: segStart,
        endIdx: i - 1,
      });
      currentType = type;
      segStart = i;
    }
  }

  // Last segment
  segments.push({
    type: currentType,
    start: timestamps[segStart],
    end: timestamps[timestamps.length - 1],
    duration: timestamps[timestamps.length - 1] - timestamps[segStart],
    startIdx: segStart,
    endIdx: timestamps.length - 1,
  });

  return segments;
}

// ─── Backward-compatible exports ───────────────────────────────────────────

export function scoreHighlight(moment) {
  return moment?.score || 0;
}

export function shouldSlowMotion(moment) {
  return moment?.should_slowmo || false;
}

export function describeMoment(moment) {
  return moment?.description || "Highlight";
}

export function isDetectorReady() {
  return true;
}
