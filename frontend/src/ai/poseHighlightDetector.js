/**
 * @module poseHighlightDetector
 * Pose-based highlight detection — MoveNet over the video, then look for
 * the wrist-acceleration signature of an actual shot.
 *
 * Why not pixel-diff (the old detector)?
 *   Pixel-diff fires on ANY motion: footwork, camera pan, crowd, etc.
 *   That's why the old highlights included clips with nothing happening
 *   and clips that ended mid-shot.
 *
 * What an actual shot looks like in pose data:
 *   - Wrist accelerates rapidly along its swing arc
 *   - Speed peaks at racket-shuttle contact
 *   - Then drops sharply (follow-through)
 *   - Often paired with the OPPOSITE shoulder rotating into the hit
 *
 * We detect those contact moments and build a clip around each:
 *   start = contact - 1.5s  (backswing)
 *   end   = contact + 0.8s  (follow-through)
 */

import { initModel } from "@/ai/poseDetector";

// MoveNet keypoint indices
const KP = {
  LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,    RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,    RIGHT_WRIST: 10,
};

const SAMPLE_FPS = 5;
const MIN_KP_CONF = 0.3;
const CLIP_PAD_BEFORE = 1.5;   // backswing
const CLIP_PAD_AFTER = 0.8;    // follow-through
const MIN_GAP_BETWEEN_SHOTS = 1.0; // seconds — never two highlights closer than this

/**
 * Detect highlight-worthy SHOT moments using MoveNet pose.
 *
 * @param {File} videoFile
 * @param {string} sport
 * @param {object} options
 * @param {(p:{percent:number,message:string})=>void} [options.onProgress]
 * @param {number} [options.maxHighlights=10]
 * @returns {Promise<{highlights:Object[], video_info:Object, processing_stats:Object}>}
 */
export async function detectPoseHighlights(videoFile, sport, options = {}) {
  const { onProgress, maxHighlights = 10 } = options;

  // ─── Load video ─────────────────────────────────────────────────
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

  // ─── Set up MoveNet ────────────────────────────────────────────
  onProgress?.({ percent: 2, message: "Loading pose model…" });
  const detector = await initModel();

  // Render at modest resolution — pose accuracy is fine at 480px wide
  const targetW = Math.min(width, 480);
  const scale = targetW / width;
  const targetH = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // ─── Sample frames + run pose ──────────────────────────────────
  const totalSamples = Math.min(900, Math.ceil(duration * SAMPLE_FPS));
  const interval = duration / totalSamples;
  const times = new Array(totalSamples);
  const wristXY = new Array(totalSamples);     // dominant wrist [x, y, conf]
  const armExtension = new Array(totalSamples);// shoulder→wrist distance
  const overhead = new Array(totalSamples);    // wrist above shoulder?

  let totalRightVis = 0;
  let totalLeftVis = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = Math.min(i * interval, duration - 0.01);
    times[i] = t;
    video.currentTime = t;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { video.onseeked = r; });
    ctx.drawImage(video, 0, 0, targetW, targetH);

    let kp = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      const poses = await detector.estimatePoses(canvas);
      if (poses?.[0]?.keypoints) kp = poses[0].keypoints;
    } catch { /* skip frame */ }

    if (!kp) {
      wristXY[i] = null;
      armExtension[i] = 0;
      overhead[i] = false;
      continue;
    }

    const lw = kp[KP.LEFT_WRIST];
    const rw = kp[KP.RIGHT_WRIST];
    const ls = kp[KP.LEFT_SHOULDER];
    const rs = kp[KP.RIGHT_SHOULDER];
    if (lw?.score >= MIN_KP_CONF) totalLeftVis += lw.score;
    if (rw?.score >= MIN_KP_CONF) totalRightVis += rw.score;

    // Pick the more visible wrist for THIS frame; we'll resolve dominant
    // hand globally at the end.
    let wrist = null, shoulder = null;
    if ((rw?.score ?? 0) >= (lw?.score ?? 0)) { wrist = rw; shoulder = rs; }
    else { wrist = lw; shoulder = ls; }
    if (!wrist || wrist.score < MIN_KP_CONF || !shoulder || shoulder.score < MIN_KP_CONF) {
      wristXY[i] = null;
      armExtension[i] = 0;
      overhead[i] = false;
      continue;
    }

    wristXY[i] = [wrist.x / targetW, wrist.y / targetH, wrist.score];
    const dx = (wrist.x - shoulder.x) / targetW;
    const dy = (wrist.y - shoulder.y) / targetH;
    armExtension[i] = Math.sqrt(dx * dx + dy * dy);
    overhead[i] = wrist.y < shoulder.y; // browser coords: y=0 is top

    if (onProgress && i % 10 === 0) {
      onProgress({
        percent: 2 + Math.round((i / totalSamples) * 75),
        message: `Pose ${i}/${totalSamples}`,
      });
    }
  }

  URL.revokeObjectURL(video.src);

  const dominantHand = totalRightVis >= totalLeftVis ? "right" : "left";

  // ─── Compute wrist speed per frame ─────────────────────────────
  // speed[i] in normalized units per second
  const speed = new Array(totalSamples).fill(0);
  for (let i = 1; i < totalSamples; i++) {
    const a = wristXY[i - 1];
    const b = wristXY[i];
    if (!a || !b) continue;
    const dt = times[i] - times[i - 1] || 1 / SAMPLE_FPS;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    speed[i] = Math.sqrt(dx * dx + dy * dy) / dt;
  }

  // smooth (window 3) — kills single-frame noise without blunting peaks
  const smoothed = smooth(speed, 3);

  // ─── Find shot CONTACT moments (acceleration peaks) ────────────
  const valid = smoothed.filter((s) => s > 0.05);
  if (valid.length === 0) {
    onProgress?.({ percent: 100, message: "No clear shots detected" });
    return {
      highlights: [],
      video_info: { duration, width, height },
      processing_stats: { dominant_hand: dominantHand, frames_analyzed: totalSamples },
    };
  }
  const sorted = valid.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const q90 = sorted[Math.floor(sorted.length * 0.9)];
  // Peak threshold: well above median, around 90th percentile
  const peakThreshold = Math.max(median * 2.0, q90, 0.15);

  // A real shot has:
  //   1. speed[i] >= peakThreshold (fast wrist motion)
  //   2. local maximum at i (>= neighbours)
  //   3. sharp drop AFTER (impact + follow-through deceleration)
  //   4. wasn't preceded by 0.5s of ~0 motion (player wasn't just standing — they swung)
  const SHOT_MIN_DROP = 0.6; // speed must drop to ≤60% within ~3 frames after peak

  const candidates = [];
  for (let i = 2; i < smoothed.length - 4; i++) {
    if (smoothed[i] < peakThreshold) continue;
    if (smoothed[i] < smoothed[i - 1] || smoothed[i] < smoothed[i + 1]) continue;
    // Check post-peak deceleration
    const postWindow = smoothed.slice(i + 1, Math.min(i + 4, smoothed.length));
    const postMin = Math.min(...postWindow);
    if (postMin > smoothed[i] * SHOT_MIN_DROP) continue;
    // Player must have been doing SOMETHING (rules out random idle arm twitches)
    const preWindow = smoothed.slice(Math.max(0, i - 4), i);
    const preMax = preWindow.length ? Math.max(...preWindow) : 0;
    if (preMax < median * 0.5) continue;

    candidates.push({
      idx: i,
      t: times[i],
      speed: smoothed[i],
      armExt: armExtension[i] || 0,
      overhead: !!overhead[i],
    });
  }

  // ─── Score and dedupe ──────────────────────────────────────────
  // Score: faster wrist + arm fully extended + overhead bonus = better highlight
  const scored = candidates.map((c) => {
    const speedScore = Math.min(1, c.speed / (q90 * 1.3));   // 0..1
    const extScore = Math.min(1, c.armExt / 0.45);           // arm out = better shot
    const overheadBonus = c.overhead ? 0.15 : 0;
    const score = speedScore * 0.65 + extScore * 0.25 + overheadBonus;
    return { ...c, score };
  });

  // Min-gap dedupe — keep the strongest peak per window
  scored.sort((a, b) => a.t - b.t);
  const deduped = [];
  for (const c of scored) {
    const last = deduped[deduped.length - 1];
    if (!last || c.t - last.t >= MIN_GAP_BETWEEN_SHOTS) {
      deduped.push(c);
    } else if (c.score > last.score) {
      deduped[deduped.length - 1] = c;
    }
  }

  // Top-N by score
  deduped.sort((a, b) => b.score - a.score);
  const top = deduped.slice(0, maxHighlights).sort((a, b) => a.t - b.t);

  // ─── Build clip ranges ────────────────────────────────────────
  const highlights = top.map((c, i) => {
    const start = Math.max(0, c.t - CLIP_PAD_BEFORE);
    const end = Math.min(duration, c.t + CLIP_PAD_AFTER);
    return {
      id: `pose_hl_${i}`,
      start_time: round(start),
      end_time: round(end),
      duration: round(end - start),
      contact_time: round(c.t),
      score: Math.round(c.score * 100),
      type: c.overhead ? "overhead_shot" : "drive",
      should_slowmo: c.overhead && (end - start) < 3.0 && c.speed > q90,
      description: c.overhead ? "Overhead shot" : "Power shot",
      speed_norm: round(c.speed),
    };
  });

  onProgress?.({ percent: 100, message: `Found ${highlights.length} highlight shots` });
  return {
    highlights,
    video_info: { duration, width, height, fps: SAMPLE_FPS },
    processing_stats: {
      dominant_hand: dominantHand,
      frames_analyzed: totalSamples,
      candidates_before_dedupe: candidates.length,
      peak_threshold: peakThreshold,
    },
  };
}

// ─── helpers ─────────────────────────────────────────────────────

function smooth(arr, w) {
  const out = new Array(arr.length).fill(0);
  const half = Math.floor(w / 2);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j];
      n++;
    }
    out[i] = n ? sum / n : 0;
  }
  return out;
}

function round(v) { return Math.round(v * 100) / 100; }
