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
 * WHY THE EARLIER ATTEMPT WAS REVERTED, AND WHAT'S DIFFERENT NOW:
 * The previous version produced a file and trusted it blindly. When the
 * output happened to be malformed, Gemini came back "no shots detected" on
 * every clip, so it was disabled. This version adds the missing safeguard:
 *   1. Fast Start is set EXPLICITLY ('in-memory' → moov atom at the front),
 *      so server-side decoders can parse the file.
 *   2. Higher quality (QUALITY_HIGH) keeps fast badminton/contact frames
 *      sharp enough for shot classification (MEDIUM blurred them).
 *   3. A DECODE-VERIFY step re-opens the output and confirms it actually
 *      decodes to real frames before we return it. If verification fails,
 *      we throw → the caller falls back to uploading the original (the
 *      known-good path). A bad transcode can therefore never reach Gemini.
 *
 * Throws on any unsupported/failed/unverifiable case so callers fall back to
 * uploading the original or the ffmpeg path.
 */
import {
  Input, Output, Conversion, BlobSource, BufferTarget,
  Mp4OutputFormat, ALL_FORMATS, QUALITY_HIGH, canEncodeVideo,
  VideoSampleSink,
} from "mediabunny";

export function webcodecsSupported() {
  return typeof window !== "undefined"
    && typeof window.VideoEncoder === "function"
    && typeof window.VideoDecoder === "function";
}

/**
 * Re-open a produced file and confirm it's genuinely decodable: a video track
 * exists, has a sane duration + dimensions, the browser can decode its codec,
 * and at least one real frame comes out of the decoder. This is the guard the
 * earlier attempt lacked — it catches structurally-broken output (the cause of
 * "Gemini sees no shots") before we ever upload it.
 *
 * @returns {Promise<{durationSec:number,width:number,height:number,frames:number}>}
 * @throws if the file can't be verified as decodable
 */
async function verifyDecodable(file) {
  let input = null;
  try {
    input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("verify_no_video_track");

    const durationSec = await track.computeDuration();
    if (!(durationSec > 0.4)) throw new Error(`verify_bad_duration:${durationSec}`);

    const width = await track.getDisplayWidth();
    const height = await track.getDisplayHeight();
    if (!width || !height) throw new Error("verify_bad_dimensions");

    if (!(await track.canDecode())) throw new Error("verify_cannot_decode");

    // Actually pull a few frames through the decoder — the only proof that the
    // bitstream + codec config are coherent (a valid-looking container can
    // still decode to nothing).
    const sink = new VideoSampleSink(track);
    let frames = 0;
    for await (const sample of sink.samples()) {
      frames++;
      try { sample.close(); } catch { /* noop */ }
      if (frames >= 3) break;
    }
    if (frames < 1) throw new Error("verify_no_frames_decoded");

    return { durationSec, width, height, frames };
  } finally {
    try { input?.dispose(); } catch { /* noop */ }
  }
}

/**
 * @param {File|Blob} file
 * @param {{maxHeight?: number, onProgress?: (pct:number)=>void}} [opts]
 * @returns {Promise<File>} a smaller, decode-verified 720p H.264 MP4 (audio dropped)
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
  // fastStart: 'in-memory' → moov atom written at the FRONT of the file, which
  // server-side decoders (Gemini's ingestion) need to parse the video. Set it
  // explicitly rather than relying on the BufferTarget default.
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  // height only → Mediabunny preserves aspect ratio. Force H.264 ("avc") for
  // maximum Gemini/back-end compatibility; QUALITY_HIGH keeps fast-motion
  // contact frames sharp; drop audio (analysis ignores it, shrinks the file).
  //   • frameRate: 30 — cap output FPS. 60fps phone/tutorial clips were the
  //     killer (2x the frames to decode+encode → ~2min transcodes); 30fps is
  //     plenty since Gemini samples at 1fps and the analysis upsamples to ~4fps.
  //   • hardwareAcceleration: 'prefer-hardware' — avoid the slow software
  //     encoder when the device has a hardware H.264 encoder.
  const conversion = await Conversion.init({
    input,
    output,
    video: {
      height: maxHeight,
      codec: "avc",
      bitrate: QUALITY_HIGH,
      frameRate: 30,
      hardwareAcceleration: "prefer-hardware",
    },
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

  // Hard timeout so a slow/stuck transcode can't make things WORSE than just
  // uploading the original. If we blow the budget, cancel the conversion and
  // throw → the caller falls back to the original-upload path. Tuned to keep
  // the whole compress+upload under the ~45s target on typical clips.
  const TRANSCODE_TIMEOUT_MS = 45_000;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    conversion.cancel().catch(() => { /* noop */ });
  }, TRANSCODE_TIMEOUT_MS);
  try {
    await conversion.execute();
  } catch (execErr) {
    if (timedOut) { const e = new Error("transcode_timeout"); e.code = "timeout"; throw e; }
    throw execErr;
  } finally {
    clearTimeout(timer);
  }

  const buf = output.target.buffer;
  if (!buf || buf.byteLength < 2000) throw new Error("transcode_empty");
  // If the result isn't actually smaller (already-compact source), keep the
  // original by signalling no-win to the caller.
  if (buf.byteLength >= file.size) throw new Error("transcode_no_win");

  const base = (file.name || "clip").replace(/\.[^.]+$/, "");
  const outFile = new File([buf], `${base}_720p.mp4`, { type: "video/mp4" });

  // THE SAFEGUARD: prove the output decodes before trusting it. Throws → the
  // caller uploads the original instead. This is what makes re-enabling the
  // WebCodecs path safe after the previous "Gemini went blind" regression.
  await verifyDecodable(outFile);

  return outFile;
}
