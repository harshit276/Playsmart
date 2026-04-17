/**
 * @module shotMomentExtractor
 * Extracts individual shot moments (single hits) from a long sports video
 * for the labeling tool. Returns short clips centered on motion peaks.
 *
 * Strategy:
 *   1. Sample frames at 5fps
 *   2. Compute pixel-difference motion scores
 *   3. Detect local maxima (each peak ~ one shot)
 *   4. Filter peaks too close together (min gap 0.6s)
 *   5. Around each peak, return [peak-1.0s, peak+1.0s]
 */

export async function extractShotMoments(videoFile, options = {}) {
  const {
    onProgress,
    sampleFps = 5,
    clipPad = 1.0,         // seconds before/after the peak
    minGapBetweenPeaks = 0.6,
    minPeakRatio = 1.5,    // peak must be >= median * this
    maxClips = 200,
  } = options;

  const video = document.createElement("video");
  video.src = URL.createObjectURL(videoFile);
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Could not load video"));
    video.load();
  });

  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  const totalSamples = Math.min(2000, Math.ceil(duration * sampleFps));
  const interval = duration / totalSamples;

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const motion = new Array(totalSamples).fill(0);
  const times = new Array(totalSamples).fill(0);
  let prev = null;

  for (let i = 0; i < totalSamples; i++) {
    const t = Math.min(i * interval, duration - 0.01);
    video.currentTime = t;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { video.onseeked = r; });

    ctx.drawImage(video, 0, 0, 128, 128);
    const data = ctx.getImageData(0, 0, 128, 128).data;

    if (prev) {
      let total = 0;
      for (let p = 0; p < data.length; p += 4) {
        const a = (prev[p] + prev[p + 1] + prev[p + 2]) / 3;
        const b = (data[p] + data[p + 1] + data[p + 2]) / 3;
        total += Math.abs(a - b);
      }
      motion[i] = total / (data.length / 4);
    }
    times[i] = t;
    prev = new Uint8ClampedArray(data);

    if (onProgress && i % 8 === 0) {
      onProgress({
        percent: Math.round((i / totalSamples) * 90),
        message: `Scanning ${i}/${totalSamples} frames`,
      });
    }
  }

  URL.revokeObjectURL(video.src);

  // Smooth (window 3 — keeps peaks sharp)
  const smoothed = smooth(motion, 3);

  // Compute median of non-trivial frames
  const nonZero = smoothed.filter((s) => s > 0.5).slice().sort((a, b) => a - b);
  if (nonZero.length === 0) {
    onProgress?.({ percent: 100, message: "No motion detected" });
    return { clips: [], duration, width, height };
  }
  const median = nonZero[Math.floor(nonZero.length / 2)];
  const minPeakValue = median * minPeakRatio;

  // Find local maxima
  const peaks = [];
  for (let i = 2; i < smoothed.length - 2; i++) {
    if (
      smoothed[i] >= minPeakValue &&
      smoothed[i] >= smoothed[i - 1] &&
      smoothed[i] >= smoothed[i + 1] &&
      smoothed[i] > smoothed[i - 2] &&
      smoothed[i] > smoothed[i + 2]
    ) {
      peaks.push({ idx: i, t: times[i], score: smoothed[i] });
    }
  }

  // Enforce min gap (pick the strongest within each window)
  peaks.sort((a, b) => a.t - b.t);
  const filtered = [];
  for (const p of peaks) {
    const last = filtered[filtered.length - 1];
    if (!last || p.t - last.t >= minGapBetweenPeaks) {
      filtered.push(p);
    } else if (p.score > last.score) {
      // Replace the weaker neighbour
      filtered[filtered.length - 1] = p;
    }
  }

  // Build clips
  const clips = filtered.slice(0, maxClips).map((p, i) => ({
    id: `shot_${i}`,
    peak: round(p.t),
    start: round(Math.max(0, p.t - clipPad)),
    end: round(Math.min(duration, p.t + clipPad)),
    score: round(p.score),
  }));

  onProgress?.({ percent: 100, message: `Found ${clips.length} shot moments` });
  return { clips, duration, width, height };
}

function smooth(arr, w) {
  const out = new Array(arr.length).fill(0);
  const half = Math.floor(w / 2);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j];
      n++;
    }
    out[i] = sum / n;
  }
  return out;
}

function round(v) { return Math.round(v * 100) / 100; }

/**
 * Compute a hash for a video file — uses size + name + lastModified.
 * Cheap and stable enough to deduplicate uploads in our labels DB.
 */
export async function computeVideoHash(file) {
  const str = `${file.name}-${file.size}-${file.lastModified || 0}`;
  if (window.crypto?.subtle) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-1", buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback: simple djb2
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return Math.abs(h).toString(16);
}
