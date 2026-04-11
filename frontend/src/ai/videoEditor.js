/**
 * @module videoEditor
 * Browser-based video editor using ffmpeg.wasm.
 * Used for highlight reel generation.
 *
 * IMPORTANT: ffmpeg.wasm has limited memory (~2GB max). To avoid
 * "memory access out of bounds" errors:
 * - Upload the source video to ffmpeg's filesystem ONCE per session
 * - Use stream copy (-c copy) where possible to avoid re-encoding
 * - Delete output files after reading them
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let _ffmpeg = null;
let _loading = null;
let _currentSourceKey = null;  // Identity of currently loaded video

/**
 * Lazy-load and initialize ffmpeg.wasm.
 */
async function getFFmpeg() {
  if (_ffmpeg) return _ffmpeg;
  if (_loading) return _loading;

  _loading = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => console.log("[ffmpeg]", message));

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
    } catch (loadErr) {
      console.error("[ffmpeg] unpkg failed, trying jsdelivr:", loadErr);
      const fallbackURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${fallbackURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${fallbackURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
    }

    _ffmpeg = ffmpeg;
    return ffmpeg;
  })();

  return _loading;
}

const SOURCE_NAME = "source.mp4";

/**
 * Ensure the video is loaded into ffmpeg's filesystem.
 * Only writes once per video file (cached by name+size).
 */
async function ensureSourceLoaded(videoFile) {
  const ffmpeg = await getFFmpeg();
  const key = `${videoFile.name}-${videoFile.size}-${videoFile.lastModified}`;

  if (_currentSourceKey === key) {
    return ffmpeg;  // Already loaded
  }

  // Clean up any previous source
  if (_currentSourceKey) {
    try {
      await ffmpeg.deleteFile(SOURCE_NAME);
    } catch {}
  }

  console.log("[ffmpeg] Loading source video into memory...");
  await ffmpeg.writeFile(SOURCE_NAME, await fetchFile(videoFile));
  _currentSourceKey = key;
  console.log("[ffmpeg] Source loaded");
  return ffmpeg;
}

/**
 * Reset the editor (frees memory). Call between separate analyses.
 */
export async function resetEditor() {
  if (!_ffmpeg) return;
  try {
    await _ffmpeg.deleteFile(SOURCE_NAME);
  } catch {}
  _currentSourceKey = null;
}

/**
 * Extract a clip from a video at specific timestamps.
 * Uses stream copy (no re-encoding) for speed and low memory.
 * Source video must be loaded once before calling this multiple times.
 *
 * @param {File} videoFile - Source video
 * @param {number} startTime - Start in seconds
 * @param {number} endTime - End in seconds
 * @param {Object} options
 * @param {string} options.label - Optional text overlay
 * @param {boolean} options.slowMotion - Apply slo-mo (0.5x speed)
 * @returns {Promise<Blob>} The clip as MP4 blob
 */
export async function extractClip(videoFile, startTime, endTime, options = {}) {
  const ffmpeg = await ensureSourceLoaded(videoFile);

  const outputName = `out_${Math.random().toString(36).slice(2, 8)}.mp4`;
  const duration = Math.max(0.5, endTime - startTime);

  // Build args - use stream copy by default for low memory
  // Stream copy is FAST and uses minimal memory
  const args = [
    "-ss", startTime.toString(),
    "-i", SOURCE_NAME,
    "-t", duration.toString(),
  ];

  // If slo-mo or label needed, must re-encode (slower, more memory)
  const needsEncoding = options.slowMotion || options.label;

  if (needsEncoding) {
    args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "28");
    args.push("-pix_fmt", "yuv420p");

    if (options.slowMotion) {
      args.push("-vf", "setpts=2.0*PTS");
      args.push("-an");  // remove audio for slo-mo
    } else if (options.label) {
      const escapedLabel = options.label.replace(/'/g, "").replace(/:/g, " ");
      args.push("-vf", `drawtext=text='${escapedLabel}':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.6:boxborderw=8:x=20:y=h-th-20`);
    }
  } else {
    // Stream copy - blazing fast, minimal memory
    args.push("-c", "copy");
  }

  args.push("-avoid_negative_ts", "make_zero");
  args.push(outputName);

  try {
    await ffmpeg.exec(args);
  } catch (err) {
    console.error("[ffmpeg] exec failed, retrying with re-encode:", err);
    // Retry with re-encode (more reliable but slower)
    const retryArgs = [
      "-ss", startTime.toString(),
      "-i", SOURCE_NAME,
      "-t", duration.toString(),
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "28",
      "-pix_fmt", "yuv420p",
      "-an",
      outputName,
    ];
    await ffmpeg.exec(retryArgs);
  }

  // Read output
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: "video/mp4" });

  // Cleanup output only (keep source for next call)
  try {
    await ffmpeg.deleteFile(outputName);
  } catch {}

  return blob;
}

/**
 * Concatenate multiple clips into a single video.
 *
 * @param {Blob[]} clips - Array of video blobs
 * @param {Object} options
 * @param {function} options.onProgress - Progress callback
 * @returns {Promise<Blob>}
 */
export async function concatenateClips(clips, options = {}) {
  const ffmpeg = await getFFmpeg();

  if (clips.length === 0) throw new Error("No clips to concatenate");
  if (clips.length === 1) return clips[0];

  // Write clips to filesystem
  const fileList = [];
  for (let i = 0; i < clips.length; i++) {
    const name = `clip${i}.mp4`;
    await ffmpeg.writeFile(name, new Uint8Array(await clips[i].arrayBuffer()));
    fileList.push(`file '${name}'`);
    if (options.onProgress) {
      options.onProgress(((i + 1) / clips.length) * 40, `Loading clip ${i + 1}/${clips.length}`);
    }
  }

  // Concat list
  await ffmpeg.writeFile("list.txt", new TextEncoder().encode(fileList.join("\n")));

  if (options.onProgress) options.onProgress(60, "Combining clips...");

  // Try concat demuxer with stream copy first (fast)
  const outputName = `final_${Math.random().toString(36).slice(2, 8)}.mp4`;
  try {
    await ffmpeg.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "list.txt",
      "-c", "copy",
      outputName,
    ]);
  } catch (err) {
    console.error("[ffmpeg] concat copy failed, retrying with re-encode:", err);
    await ffmpeg.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "list.txt",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "28",
      "-pix_fmt", "yuv420p",
      "-an",
      outputName,
    ]);
  }

  if (options.onProgress) options.onProgress(90, "Finalizing...");

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: "video/mp4" });

  // Cleanup
  for (let i = 0; i < clips.length; i++) {
    try { await ffmpeg.deleteFile(`clip${i}.mp4`); } catch {}
  }
  try { await ffmpeg.deleteFile("list.txt"); } catch {}
  try { await ffmpeg.deleteFile(outputName); } catch {}

  if (options.onProgress) options.onProgress(100, "Complete!");

  return blob;
}

/**
 * Generate thumbnail from video at specific timestamp.
 * Uses the already-loaded source video.
 */
export async function generateThumbnail(videoFile, timestamp) {
  const ffmpeg = await ensureSourceLoaded(videoFile);

  const outputName = `thumb_${Math.random().toString(36).slice(2, 8)}.jpg`;

  await ffmpeg.exec([
    "-ss", timestamp.toString(),
    "-i", SOURCE_NAME,
    "-frames:v", "1",
    "-q:v", "5",
    "-vf", "scale=320:-1",
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: "image/jpeg" });

  try { await ffmpeg.deleteFile(outputName); } catch {}

  return blob;
}

/**
 * Check if ffmpeg is loaded and ready.
 */
export function isFFmpegReady() {
  return _ffmpeg !== null;
}

/**
 * Preload ffmpeg in the background.
 */
export async function preloadFFmpeg() {
  try {
    await getFFmpeg();
    return true;
  } catch (err) {
    console.warn("ffmpeg preload failed:", err);
    return false;
  }
}
