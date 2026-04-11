/**
 * @module videoEditor
 * Browser-based video editor using ffmpeg.wasm.
 * Used for highlight reel generation.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let _ffmpeg = null;
let _loading = null;

/**
 * Lazy-load and initialize ffmpeg.wasm.
 * Only loads on first call.
 */
async function getFFmpeg() {
  if (_ffmpeg) return _ffmpeg;
  if (_loading) return _loading;

  _loading = (async () => {
    const ffmpeg = new FFmpeg();

    // Load core from CDN
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    _ffmpeg = ffmpeg;
    return ffmpeg;
  })();

  return _loading;
}

/**
 * Extract a clip from a video at specific timestamps.
 *
 * @param {File} videoFile - Source video
 * @param {number} startTime - Start in seconds
 * @param {number} endTime - End in seconds
 * @param {Object} options
 * @param {string} options.label - Optional text overlay (e.g., "Smash 250 km/h")
 * @param {boolean} options.slowMotion - Apply slo-mo (0.5x speed)
 * @returns {Promise<Blob>} The clip as MP4 blob
 */
export async function extractClip(videoFile, startTime, endTime, options = {}) {
  const ffmpeg = await getFFmpeg();

  const inputName = "input.mp4";
  const outputName = "output.mp4";

  // Write input file to ffmpeg's virtual filesystem
  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  const duration = endTime - startTime;

  // Build ffmpeg command
  const args = [
    "-ss", startTime.toString(),
    "-i", inputName,
    "-t", duration.toString(),
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
  ];

  // Apply slow motion if requested
  if (options.slowMotion) {
    args.push("-vf", "setpts=2.0*PTS,setpts=PTS-STARTPTS");
    args.push("-an"); // remove audio for slo-mo (would be pitched down)
  } else if (options.label) {
    // Add text overlay
    const escapedLabel = options.label.replace(/'/g, "\\'").replace(/:/g, "\\:");
    args.push("-vf", `drawtext=text='${escapedLabel}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=20:y=h-th-20`);
  }

  args.push(outputName);

  await ffmpeg.exec(args);

  // Read output
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: "video/mp4" });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return blob;
}

/**
 * Concatenate multiple clips into a single video with smooth transitions.
 *
 * @param {Blob[]} clips - Array of video blobs
 * @param {Object} options
 * @param {function} options.onProgress - Progress callback
 * @returns {Promise<Blob>}
 */
export async function concatenateClips(clips, options = {}) {
  const ffmpeg = await getFFmpeg();

  // Write all clips to virtual filesystem
  const fileList = [];
  for (let i = 0; i < clips.length; i++) {
    const name = `clip${i}.mp4`;
    await ffmpeg.writeFile(name, new Uint8Array(await clips[i].arrayBuffer()));
    fileList.push(`file '${name}'`);
    if (options.onProgress) {
      options.onProgress(((i + 1) / clips.length) * 50, `Loading clip ${i + 1}/${clips.length}`);
    }
  }

  // Create concat list file
  const listContent = fileList.join("\n");
  await ffmpeg.writeFile("list.txt", new TextEncoder().encode(listContent));

  // Concatenate using concat demuxer
  if (options.onProgress) options.onProgress(60, "Combining clips...");

  await ffmpeg.exec([
    "-f", "concat",
    "-safe", "0",
    "-i", "list.txt",
    "-c", "copy",
    "output.mp4",
  ]);

  if (options.onProgress) options.onProgress(90, "Finalizing...");

  const data = await ffmpeg.readFile("output.mp4");
  const blob = new Blob([data.buffer], { type: "video/mp4" });

  // Cleanup
  for (let i = 0; i < clips.length; i++) {
    await ffmpeg.deleteFile(`clip${i}.mp4`);
  }
  await ffmpeg.deleteFile("list.txt");
  await ffmpeg.deleteFile("output.mp4");

  if (options.onProgress) options.onProgress(100, "Complete!");

  return blob;
}

/**
 * Generate thumbnail from video at specific timestamp.
 *
 * @param {File|Blob} videoFile
 * @param {number} timestamp - Time in seconds
 * @returns {Promise<Blob>} JPEG image blob
 */
export async function generateThumbnail(videoFile, timestamp) {
  const ffmpeg = await getFFmpeg();

  await ffmpeg.writeFile("input.mp4", await fetchFile(videoFile));

  await ffmpeg.exec([
    "-ss", timestamp.toString(),
    "-i", "input.mp4",
    "-frames:v", "1",
    "-q:v", "2",
    "thumb.jpg",
  ]);

  const data = await ffmpeg.readFile("thumb.jpg");
  const blob = new Blob([data.buffer], { type: "image/jpeg" });

  await ffmpeg.deleteFile("input.mp4");
  await ffmpeg.deleteFile("thumb.jpg");

  return blob;
}

/**
 * Check if ffmpeg is loaded and ready.
 */
export function isFFmpegReady() {
  return _ffmpeg !== null;
}

/**
 * Preload ffmpeg in the background (call on app idle).
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
