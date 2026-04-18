/**
 * @module shotMomentExtractor
 * Extracts shot moments from a sports video for the labeling tool.
 *
 * Strategy:
 *   1. Sample frames at 8fps, compute per-frame motion via pixel diff.
 *   2. Smooth, then pick local maxima above an adaptive percentile-based
 *      threshold (Q75 + 0.3·IQR, but never below median × 1.2).
 *   3. Enforce a min-gap so adjacent peaks merge to the strongest one.
 *   4. Fallback: if too few peaks were found (very static video, replays,
 *      slow-motion footage), top up with evenly spaced clips at the
 *      highest-motion windows so the user always has something to label.
 *   5. Around each chosen moment, return [t-clipPad, t+clipPad].
 */

export async function extractShotMoments(videoFile, options = {}) {
  const {
    onProgress,
    sampleFps = 8,
    clipPad = 1.0,
    minGapBetweenPeaks = 0.6,
    targetMinClips = 12,         // top up with fallback if fewer than this
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

  const totalSamples = Math.min(2400, Math.ceil(duration * sampleFps));
  const interval = duration / Math.max(1, totalSamples);

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
      // Weight the centre of the frame more — players are usually mid-frame
      // and we want to ignore camera-edge motion (scoreboards, crowd).
      for (let p = 0, idx = 0; p < data.length; p += 4, idx++) {
        const px = idx % 128;
        const py = (idx / 128) | 0;
        const dx = px - 64;
        const dy = py - 64;
        const r = Math.sqrt(dx * dx + dy * dy);
        const w = r < 32 ? 1.4 : r < 56 ? 1.0 : 0.5;
        const a = (prev[p] + prev[p + 1] + prev[p + 2]) / 3;
        const b = (data[p] + data[p + 1] + data[p + 2]) / 3;
        total += Math.abs(a - b) * w;
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

  const smoothed = smooth(motion, 3);

  // Adaptive threshold via percentiles (more robust than mean × constant)
  const sorted = smoothed.slice().sort((a, b) => a - b);
  if (sorted.length === 0 || sorted[sorted.length - 1] < 0.2) {
    onProgress?.({ percent: 100, message: "Video appears static — no clips" });
    return { clips: [], duration, width, height };
  }
  const q25 = sorted[Math.floor(sorted.length * 0.25)] || 0;
  const q50 = sorted[Math.floor(sorted.length * 0.50)] || 0;
  const q75 = sorted[Math.floor(sorted.length * 0.75)] || 0;
  const iqr = Math.max(0, q75 - q25);

  // Threshold: comfortably above the body of the distribution but not
  // hopelessly above it. 1.2× median catches lots of real shots.
  const minPeakValue = Math.max(q75 + iqr * 0.3, q50 * 1.2, 0.4);

  // Local maxima — relaxed: just check immediate neighbours.
  const peaks = [];
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (
      smoothed[i] >= minPeakValue &&
      smoothed[i] >= smoothed[i - 1] &&
      smoothed[i] >= smoothed[i + 1]
    ) {
      peaks.push({ idx: i, t: times[i], score: smoothed[i] });
    }
  }

  // Enforce min gap (strongest wins inside a window)
  peaks.sort((a, b) => a.t - b.t);
  let filtered = [];
  for (const p of peaks) {
    const last = filtered[filtered.length - 1];
    if (!last || p.t - last.t >= minGapBetweenPeaks) {
      filtered.push(p);
    } else if (p.score > last.score) {
      filtered[filtered.length - 1] = p;
    }
  }

  // Fallback: if peak detection found very few clips, top up with the
  // top-N motion frames spaced at least minGapBetweenPeaks apart. This
  // covers slow-motion footage, replays, or videos with continuous motion
  // (no clear peaks) where the user still wants clips to label.
  if (filtered.length < targetMinClips) {
    const allByScore = smoothed
      .map((s, i) => ({ idx: i, t: times[i], score: s }))
      .filter((p) => p.score > q50 * 0.9)
      .sort((a, b) => b.score - a.score);

    const taken = [...filtered];
    for (const cand of allByScore) {
      if (taken.length >= targetMinClips * 2) break;
      const tooClose = taken.some((t) => Math.abs(t.t - cand.t) < minGapBetweenPeaks);
      if (!tooClose) taken.push(cand);
    }
    taken.sort((a, b) => a.t - b.t);
    filtered = taken;
  }

  const clips = filtered.slice(0, maxClips).map((p, i) => ({
    id: `shot_${i}`,
    peak: round(p.t),
    start: round(Math.max(0, p.t - clipPad)),
    end: round(Math.min(duration, p.t + clipPad)),
    score: round(p.score),
  }));

  onProgress?.({
    percent: 100,
    message: clips.length
      ? `Found ${clips.length} clip${clips.length === 1 ? "" : "s"} to label`
      : "No clips detected",
  });
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
 * Stable hash from filename + size + lastModified — cheap, no crypto needed
 * for de-duplication purposes.
 */
export async function computeVideoHash(file) {
  const str = `${file.name}-${file.size}-${file.lastModified || 0}`;
  if (window.crypto?.subtle) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-1", buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return Math.abs(h).toString(16);
}
