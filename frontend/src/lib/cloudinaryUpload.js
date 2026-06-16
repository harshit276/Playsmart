import api from "./api";

/**
 * Shrink a large video before upload. Tiered, fastest-first:
 *   1. <25MB           → upload as-is (incl. WhatsApp clips; re-encoding a
 *                        small, already-compressed file is pointless + risky).
 *   2. WebCodecs path  → hardware-accelerated 720p transcode (the
 *                        WhatsApp-equivalent: phone's H.264 encoder via the
 *                        browser). ~10-20s for a 1-2 min clip; turns a 78MB
 *                        upload into ~10MB → faster upload AND faster Gemini.
 *   3. ffmpeg.wasm     → only >130MB and only if WebCodecs is unavailable/
 *                        failed (software, slow, but better than a giant
 *                        upload that would blow the 200MB backend cap).
 *   4. original        → final fallback (never block the analysis).
 */
async function compressIfNeeded(file, onProgress) {
  // ── WebCodecs transcode DISABLED (regression) ───────────────────────
  // Commit 0508aac routed >=25MB clips through a WebCodecs (Mediabunny)
  // 720p transcode. It ran fast, but the OUTPUT mp4 was unanalyzable by
  // Gemini — every >=25MB video came back "no shots detected" (40MB
  // badminton, gym, WhatsApp clips all broke; <25MB clips that skip this
  // path kept working). The transcoded container/profile evidently isn't
  // something Gemini's Files API decodes. Disabled until the output is
  // verified frame-by-frame; uploading the original is the known-good path.
  // The webcodecsTranscode lib is kept for that future investigation.

  // Upload the original up to 130MB (verified-working). ffmpeg.wasm only
  // beyond that, where the raw upload would exceed Cloudinary / the 200MB
  // backend fetch cap.
  if (file.size < 130 * 1024 * 1024) return file;
  try {
    onProgress?.({ percent: 5, message: "Optimizing a large video (this one takes a bit)…" });
    const { compressVideo, resetEditor } = await import("@/ai/videoEditor");
    const compressed = await compressVideo(file, {
      maxHeight: 720,
      onProgress: (p) =>
        onProgress?.({
          percent: 5 + (p.percent || 0) * 0.15,
          message: p.message,
        }),
    });
    await resetEditor(); // Free ffmpeg memory
    return new File([compressed], file.name, { type: "video/mp4" });
  } catch (err) {
    console.warn("Compression failed, uploading original:", err);
    return file;
  }
}

/**
 * Upload a video to Cloudinary using a signed upload from our backend.
 *
 * @param {File} videoFile
 * @param {Object} [options]
 * @param {function} [options.onProgress] - ({percent, message})
 * @returns {Promise<{public_id: string, secure_url: string, duration: number, width: number, height: number}>}
 */
export async function uploadToCloudinary(videoFile, options = {}) {
  const { onProgress } = options;

  const { getVideoRotationDegrees, downscaleForUpload } = await import("./videoRotation");

  let workFile = videoFile;
  let rotation = 0;
  let handledClientSide = false; // rotation baked + downscaled on-device already

  // Detect the rotation flag first (fast header parse, no decode).
  try { rotation = await getVideoRotationDegrees(videoFile); }
  catch { /* best-effort */ }

  // Step 0 — PRIMARY: hardware WebCodecs transcode to ~720p. GPU, faster than
  // real-time, so a 170MB 4K clip shrinks to a few MB in SECONDS (the
  // real-time canvas/MediaRecorder path took minutes and stalled on mobile).
  // We transcode when it helps: a rotated clip (bake it upright + drop the
  // server-side transcode) OR a large clip (shrink before the upload).
  // allowRotationMetadata:false inside the transcoder bakes orientation so
  // Gemini sees it upright. Falls through to the canvas path on any failure.
  const isBig = videoFile.size > 20 * 1024 * 1024;
  if (rotation !== 0 || isBig) {
    try {
      const { webcodecsSupported, webcodecsTranscode } = await import("./webcodecsTranscode");
      if (webcodecsSupported()) {
        onProgress?.({ percent: 4, message: "Optimizing video…" });
        workFile = await webcodecsTranscode(videoFile, {
          maxDim: 1280,
          allowGrow: rotation !== 0, // rotated: keep the upright output even if not smaller
          onProgress: (p) => onProgress?.({ percent: 4 + Math.min(1, p / 100) * 18, message: "Optimizing video…" }),
        });
        handledClientSide = true; // rotation baked + downscaled by WebCodecs
      }
    } catch (e) {
      console.warn("[upload] WebCodecs transcode failed, falling back:", e?.message || e);
    }
  }

  // Step 0b — FALLBACK (no WebCodecs / it failed): the canvas downscale for
  // very large clips so we never push a 200MB+ original over the wire.
  if (!handledClientSide) {
    const ds = await downscaleForUpload(workFile, onProgress);
    if (ds.downscaled) { workFile = ds.file; handledClientSide = true; }
  }

  // Step 1: ffmpeg.wasm only as the last resort beyond 130MB.
  const fileToUpload = await compressIfNeeded(workFile, onProgress);

  // If rotation was baked client-side, the backend needs no rotation transform.
  if (handledClientSide) rotation = 0;

  // Step 2: ask our backend for signed upload params
  onProgress?.({ percent: 22, message: "Preparing upload..." });
  const { data: signed } = await api.post("/highlights/sign-upload", {});

  // Step 3: upload directly to Cloudinary
  const formData = new FormData();
  formData.append("file", fileToUpload);
  formData.append("api_key", signed.api_key);
  formData.append("timestamp", signed.timestamp);
  formData.append("signature", signed.signature);
  formData.append("public_id", signed.public_id);
  formData.append("folder", signed.folder);

  onProgress?.({ percent: 25, message: "Uploading to cloud..." });

  const uploadResponse = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", signed.upload_url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = 25 + (e.loaded / e.total) * 50; // 25-75%
        onProgress?.({
          percent: pct,
          message: `Uploading... ${Math.round((e.loaded / e.total) * 100)}%`,
        });
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(new Error("Invalid upload response from Cloudinary"));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(formData);
  });

  return {
    public_id: uploadResponse.public_id,
    secure_url: uploadResponse.secure_url,
    duration: uploadResponse.duration,
    width: uploadResponse.width,
    height: uploadResponse.height,
    // Rotation flag (deg) of the source clip. The caller forwards
    // `rotated: rotation > 0` to /upload-video-url so the backend bakes the
    // rotation server-side via a Cloudinary transform.
    rotation,
  };
}

/**
 * Generate a highlight reel from an already-uploaded Cloudinary video.
 */
export async function generateReel(public_id, sport, duration, options = {}) {
  const { data } = await api.post("/highlights/generate-reel", {
    public_id,
    sport,
    duration_seconds: duration,
    target_clips: options.target_clips || 5,
    include_speed_overlay: options.include_speed_overlay !== false,
    moments: options.moments || [],
  });
  return data;
}

/**
 * Delete a previously uploaded Cloudinary video to free storage.
 */
export async function cleanupVideo(public_id) {
  try {
    await api.delete(`/highlights/cleanup/${encodeURIComponent(public_id)}`);
  } catch (err) {
    console.warn("Cleanup failed:", err);
  }
}
