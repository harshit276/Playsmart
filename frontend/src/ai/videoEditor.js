/**
 * @module videoEditor
 * Browser-based video editor using ffmpeg.wasm.
 *
 * Architecture decisions:
 * - Re-encode (NOT stream copy) to produce valid playable MP4s with moov atom
 * - Use libx264 ultrafast preset for speed
 * - Lower resolution for output to fit in memory budget
 * - Process clips into JS Blobs immediately, store outside ffmpeg
 * - Reset ffmpeg between batches of operations to prevent memory leaks
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let _ffmpeg = null;
let _loading = null;
let _currentSourceKey = null;

/**
 * Lazy-load and initialize ffmpeg.wasm.
 */
async function getFFmpeg() {
  if (_ffmpeg) return _ffmpeg;
  if (_loading) return _loading;

  _loading = (async () => {
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      if (message.includes("Error") || message.includes("error") || message.includes("failed")) {
        console.warn("[ffmpeg]", message);
      }
    });

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
 * Ensure source video is loaded into ffmpeg's filesystem.
 * Loads only once per video file.
 */
async function ensureSourceLoaded(videoFile) {
  const ffmpeg = await getFFmpeg();
  const key = `${videoFile.name}-${videoFile.size}-${videoFile.lastModified}`;

  if (_currentSourceKey === key) return ffmpeg;

  if (_currentSourceKey) {
    try { await ffmpeg.deleteFile(SOURCE_NAME); } catch {}
  }

  console.log("[ffmpeg] Loading source video...");
  await ffmpeg.writeFile(SOURCE_NAME, await fetchFile(videoFile));
  _currentSourceKey = key;
  console.log("[ffmpeg] Source loaded");
  return ffmpeg;
}

/**
 * Reset ffmpeg entirely (terminates worker and frees memory).
 * Source video must be re-loaded after reset.
 */
export async function resetEditor() {
  if (!_ffmpeg) return;
  try {
    await _ffmpeg.terminate();
  } catch (err) {
    console.warn("[ffmpeg] terminate failed:", err);
  }
  _ffmpeg = null;
  _loading = null;
  _currentSourceKey = null;
}

/**
 * Extract a clip from a video at specific timestamps.
 * Re-encodes to produce a valid playable MP4 with proper moov atom.
 *
 * @param {File} videoFile - Source video
 * @param {number} startTime - Start in seconds
 * @param {number} endTime - End in seconds
 * @param {Object} options
 * @param {string} [options.label] - Optional text overlay
 * @param {boolean} [options.slowMotion] - Apply 0.5x speed
 * @param {number} [options.maxHeight=720] - Max output height (smaller = less memory)
 * @returns {Promise<Blob>} The clip as MP4 blob
 */
export async function extractClip(videoFile, startTime, endTime, options = {}) {
  const ffmpeg = await ensureSourceLoaded(videoFile);
  const outputName = `out_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp4`;
  const duration = Math.max(0.5, endTime - startTime);
  const maxHeight = options.maxHeight || 720;

  // Always re-encode for playable MP4s with valid moov atom
  // Place -ss BEFORE -i for fast seek (more efficient)
  const args = [
    "-ss", startTime.toString(),
    "-i", SOURCE_NAME,
    "-t", duration.toString(),
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "26",  // Good quality, reasonable file size
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",  // Place moov atom at start for streaming
  ];

  // Build video filter
  const filters = [];

  // Always scale down to manage memory (preserves aspect ratio)
  filters.push(`scale=-2:'min(${maxHeight},ih)'`);

  if (options.slowMotion) {
    filters.push("setpts=2.0*PTS");
  }

  if (options.label) {
    const escapedLabel = options.label.replace(/'/g, "").replace(/:/g, " ");
    filters.push(
      `drawtext=text='${escapedLabel}':fontcolor=white:fontsize=28:` +
      `box=1:boxcolor=black@0.6:boxborderw=6:x=(w-text_w)/2:y=h-th-20`
    );
  }

  if (filters.length > 0) {
    args.push("-vf", filters.join(","));
  }

  // Audio: keep audio unless slo-mo (which would pitch-shift it)
  if (options.slowMotion) {
    args.push("-an");
  } else {
    args.push("-c:a", "aac", "-b:a", "96k");
  }

  args.push(outputName);

  await ffmpeg.exec(args);

  // Read output IMMEDIATELY into a Blob (lives in JS heap, not WASM heap)
  const data = await ffmpeg.readFile(outputName);
  // Copy data to a fresh ArrayBuffer so it survives ffmpeg cleanup
  const copied = new Uint8Array(data.length);
  copied.set(data);
  const blob = new Blob([copied], { type: "video/mp4" });

  // Cleanup output file in WASM filesystem
  try { await ffmpeg.deleteFile(outputName); } catch {}

  if (blob.size === 0) {
    throw new Error("ffmpeg produced an empty clip");
  }

  return blob;
}

/**
 * Concatenate multiple clip blobs into a single MP4 reel.
 * IMPORTANT: clips must be valid MP4s (re-encoded, with moov atom).
 *
 * @param {Blob[]} clips - Array of valid MP4 blobs
 * @param {Object} options
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<Blob>}
 */
export async function concatenateClips(clips, options = {}) {
  const ffmpeg = await getFFmpeg();

  if (clips.length === 0) throw new Error("No clips to concatenate");
  if (clips.length === 1) return clips[0];

  // Validate clips
  const validClips = clips.filter((c) => c && c.size > 0);
  if (validClips.length === 0) throw new Error("No valid clips to concatenate");
  if (validClips.length === 1) return validClips[0];

  // Write all clips to ffmpeg's filesystem
  const fileList = [];
  for (let i = 0; i < validClips.length; i++) {
    const name = `clip${i}.mp4`;
    const buffer = await validClips[i].arrayBuffer();
    await ffmpeg.writeFile(name, new Uint8Array(buffer));
    fileList.push(`file '${name}'`);
    if (options.onProgress) {
      options.onProgress(((i + 1) / validClips.length) * 30, `Loading clip ${i + 1}/${validClips.length}`);
    }
  }

  const listName = "list.txt";
  await ffmpeg.writeFile(listName, new TextEncoder().encode(fileList.join("\n")));

  if (options.onProgress) options.onProgress(40, "Combining clips...");

  const outputName = `final_${Date.now()}.mp4`;

  // Re-encode the concatenated stream to ensure valid MP4
  // (concat copy fails if clips have slightly different params)
  await ffmpeg.exec([
    "-f", "concat",
    "-safe", "0",
    "-i", listName,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "26",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "96k",
    "-movflags", "+faststart",
    outputName,
  ]);

  if (options.onProgress) options.onProgress(85, "Finalizing...");

  const data = await ffmpeg.readFile(outputName);
  const copied = new Uint8Array(data.length);
  copied.set(data);
  const blob = new Blob([copied], { type: "video/mp4" });

  // Cleanup
  for (let i = 0; i < validClips.length; i++) {
    try { await ffmpeg.deleteFile(`clip${i}.mp4`); } catch {}
  }
  try { await ffmpeg.deleteFile(listName); } catch {}
  try { await ffmpeg.deleteFile(outputName); } catch {}

  if (options.onProgress) options.onProgress(100, "Complete!");

  if (blob.size === 0) {
    throw new Error("Concatenation produced empty file");
  }

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
