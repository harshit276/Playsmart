/**
 * webcodecsTranscode — hardware-accelerated client-side video transcode.
 *
 * The "how does WhatsApp do it" answer for the web: WhatsApp uses the phone's
 * hardware H.264 encoder (VideoToolbox / MediaCodec). The browser's bridge to
 * that SAME hardware is WebCodecs (VideoEncoder/VideoDecoder), supported on
 * Chrome/Edge/Android and iOS Safari 16.4+. Mediabunny wraps WebCodecs with a
 * Conversion pipeline (demux → hardware decode → resize → hardware encode →
 * mux), so a 1-2 min 1080p/4K clip transcodes to 720p in SECONDS (faster than
 * real-time, GPU) vs the ~minutes a real-time MediaRecorder/canvas pass or
 * ffmpeg.wasm (software) takes. The small output uploads AND analyzes far
 * faster — this is what kills the "Optimizing your video…" stall on big clips.
 *
 * ROTATION (the Round-12 gotcha): by default Mediabunny writes the rotation
 * as MP4 metadata, which Gemini ignores → it analyzed sideways frames and
 * returned "no shots". We pass allowRotationMetadata:false so the rotation is
 * BAKED into the pixels — Gemini sees it upright, like the user does.
 *
 * Throws on any unsupported/failed case (no WebCodecs, undecodable codec, or
 * no size win when allowGrow is false) so callers fall back gracefully.
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
 * @param {{maxDim?: number, onProgress?: (pct:number)=>void, allowGrow?: boolean}} [opts]
 *   maxDim    — fit the output within a maxDim×maxDim box (default 1280 ≈ 720p),
 *               preserving aspect for both portrait and landscape.
 *   allowGrow — keep the output even if it's not smaller than the input (used
 *               for already-small ROTATED clips where we still need the baked-
 *               upright bytes). Default false (size-win required).
 * @returns {Promise<File>} a smaller, UPRIGHT 720p H.264 MP4 (audio dropped)
 */
export async function webcodecsTranscode(file, opts = {}) {
  const { maxDim = 1280, onProgress, allowGrow = false } = opts;
  if (!webcodecsSupported()) throw new Error("webcodecs_unsupported");

  let canH264 = false;
  try { canH264 = await canEncodeVideo("avc", { width: maxDim, height: maxDim }); } catch { canH264 = false; }
  if (!canH264) throw new Error("h264_encode_unsupported");

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

  // Compute the EXACT target dims from the source's display size (post-rotation),
  // fitting within a maxDim box and NEVER upscaling. Setting width+height to the
  // fitted dims (rather than maxDim×maxDim with fit:contain) avoids letterbox
  // padding — a portrait 576×1024 stays 576×1024, a 4K landscape 3840×2160
  // becomes 1280×720, with no black bars and no pointless upscale/bitrate bloat.
  let tw = maxDim, th = maxDim;
  try {
    const track = await input.getPrimaryVideoTrack();
    const dw = track?.displayWidth || 0;
    const dh = track?.displayHeight || 0;
    if (dw > 0 && dh > 0) {
      const scale = Math.min(1, maxDim / Math.max(dw, dh)); // ≤1: never upscale
      // Round to even dims (H.264 requires 2-divisible width/height).
      tw = Math.max(2, Math.round((dw * scale) / 2) * 2);
      th = Math.max(2, Math.round((dh * scale) / 2) * 2);
    }
  } catch { /* fall back to the maxDim box below */ }

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      // Exact fitted dims (computed above) — preserves the native aspect with
      // no padding. fit:contain is a no-op here since the box matches content,
      // but we keep it so a dims-read failure (tw=th=maxDim) still letterboxes
      // safely rather than distorting.
      width: tw, height: th, fit: "contain",
      codec: "avc",                  // H.264 — max Gemini/backend compatibility
      bitrate: QUALITY_MEDIUM,
      // Bake the source rotation into the frames instead of writing a metadata
      // flag Gemini ignores (the Round-12 "sideways → no shots" bug).
      allowRotationMetadata: false,
    },
    audio: { discard: true },        // analysis ignores audio; shrinks the file
  });

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
  if (!allowGrow && buf.byteLength >= file.size) throw new Error("transcode_no_win");

  const base = (file.name || "clip").replace(/\.[^.]+$/, "");
  return new File([buf], `${base}_720p.mp4`, { type: "video/mp4" });
}
