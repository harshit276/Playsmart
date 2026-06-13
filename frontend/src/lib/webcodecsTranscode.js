/**
 * webcodecsTranscode — hardware-accelerated client-side video transcode.
 *
 * This is the "how does WhatsApp do it" answer for a web app: WhatsApp uses
 * the phone's hardware H.264/HEVC encoder via native APIs (VideoToolbox /
 * MediaCodec). The browser's bridge to that SAME hardware is the WebCodecs
 * API (VideoEncoder/VideoDecoder), supported on Chrome/Edge/Android and
 * iOS Safari 16.4+. Mediabunny wraps WebCodecs with a high-level Conversion
 * pipeline (demux → hardware decode → downscale → hardware encode → mux),
 * so a 1-2 min 1080p/4K clip transcodes to 720p in ~10-20s instead of the
 * ~60-120s ffmpeg.wasm (software, single-thread) takes — and the small
 * output uploads AND analyzes far faster.
 *
 * Throws on any unsupported/failed case (no WebCodecs, undecodable codec
 * e.g. some HEVC on non-Apple, or no real size win) so callers fall back to
 * uploading the original or the ffmpeg path.
 */
import {
  Input, Output, Conversion, BlobSource, BufferTarget,
  Mp4OutputFormat, ALL_FORMATS, QUALITY_MEDIUM, canEncodeVideo,
} from "mediabunny";

export function webcodecsSupported() {
  return typeof window !== "undefined"
    && typeof window.VideoEncoder === "function"
    && typeof window.VideoDecoder === "function";
}

/**
 * @param {File|Blob} file
 * @param {{maxHeight?: number, onProgress?: (pct:number)=>void}} [opts]
 * @returns {Promise<File>} a smaller 720p H.264 MP4 (audio dropped)
 */
export async function webcodecsTranscode(file, opts = {}) {
  const { maxHeight = 720, onProgress } = opts;
  if (!webcodecsSupported()) throw new Error("webcodecs_unsupported");

  // Confirm H.264 encode is actually available (hardware or software) before
  // committing — avoids a long run that fails at the encode step.
  let canH264 = false;
  try { canH264 = await canEncodeVideo("avc", { width: 1280, height: maxHeight }); } catch { canH264 = false; }
  if (!canH264) throw new Error("h264_encode_unsupported");

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

  // height only → Mediabunny preserves aspect ratio. Force H.264 ("avc") for
  // maximum Gemini/back-end compatibility; drop audio (analysis ignores it,
  // and it shrinks the file + avoids audio-codec issues).
  const conversion = await Conversion.init({
    input,
    output,
    video: { height: maxHeight, codec: "avc", bitrate: QUALITY_MEDIUM },
    audio: { discard: true },
  });

  // isValid=false means Mediabunny couldn't build a usable pipeline (e.g.
  // the only video track is an undecodable codec on this device).
  if (!conversion.isValid) {
    try { await conversion.cancel(); } catch { /* noop */ }
    throw new Error("conversion_invalid");
  }
  if (onProgress) {
    conversion.onProgress = (p) => { try { onProgress(Math.round((p || 0) * 100)); } catch { /* noop */ } };
  }

  await conversion.execute();

  const buf = output.target.buffer;
  if (!buf || buf.byteLength < 2000) throw new Error("transcode_empty");
  // If the result isn't actually smaller (already-compact source), keep the
  // original by signalling no-win to the caller.
  if (buf.byteLength >= file.size) throw new Error("transcode_no_win");

  const base = (file.name || "clip").replace(/\.[^.]+$/, "");
  return new File([buf], `${base}_720p.mp4`, { type: "video/mp4" });
}
