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

// ── Upload resilience knobs ──────────────────────────────────────────
// A *stall* (no bytes for a while) is not an `onerror` — a naked XHR will
// hang forever if the connection silently drops. We treat "no upload
// progress for STALL_TIMEOUT_MS" as a failure, then retry the whole upload
// a few times with backoff. This turns the old infinite "stuck at 23%" hang
// into a fast fail-and-recover.
const STALL_TIMEOUT_MS = 25_000;   // no progress for 25s → abort this attempt
const MAX_UPLOAD_ATTEMPTS = 3;     // total tries before giving up
const RETRY_BACKOFF_MS = [1500, 4000]; // wait before attempt 2, then 3

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One Cloudinary upload attempt with a stall watchdog + external abort.
 * Rejects with err.code === "stall" | "abort" | "network" | "http" so the
 * caller can decide whether to retry.
 */
function uploadAttemptXHR(uploadUrl, formData, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const e = new Error("Upload cancelled"); e.code = "abort"; return reject(e);
    }
    const xhr = new XMLHttpRequest();
    let stallTimer = null;
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        try { xhr.abort(); } catch { /* noop */ }
        const e = new Error("Upload stalled (no progress)"); e.code = "stall";
        reject(e);
      }, STALL_TIMEOUT_MS);
    };
    const clearStall = () => { if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; } };

    const onAbort = () => { try { xhr.abort(); } catch { /* noop */ } };
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => { clearStall(); signal?.removeEventListener("abort", onAbort); };

    xhr.open("POST", uploadUrl);
    // Hard ceiling in case the browser never fires progress at all.
    xhr.timeout = STALL_TIMEOUT_MS * 4;
    xhr.upload.onprogress = (e) => {
      armStall(); // reset the watchdog every time bytes actually move
      if (e.lengthComputable) {
        const pct = 25 + (e.loaded / e.total) * 50; // 25-75%
        onProgress?.({
          percent: pct,
          message: `Uploading... ${Math.round((e.loaded / e.total) * 100)}%`,
        });
      }
    };
    xhr.upload.onloadstart = armStall;
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          const e = new Error("Invalid upload response from Cloudinary"); e.code = "parse";
          reject(e);
        }
      } else {
        const e = new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`);
        // 4xx (bad signature/params) won't fix itself — don't retry those.
        e.code = xhr.status >= 400 && xhr.status < 500 ? "fatal" : "http";
        reject(e);
      }
    };
    xhr.onerror = () => { cleanup(); const e = new Error("Upload network error"); e.code = "network"; reject(e); };
    xhr.ontimeout = () => { cleanup(); const e = new Error("Upload timed out"); e.code = "stall"; reject(e); };
    xhr.onabort = () => {
      cleanup();
      // If we aborted because of the external signal, surface "abort"; the
      // stall path already rejected with its own error before calling abort.
      if (signal?.aborted) { const e = new Error("Upload cancelled"); e.code = "abort"; reject(e); }
    };
    armStall();
    xhr.send(formData);
  });
}

/**
 * Upload a video to Cloudinary using a signed upload from our backend.
 *
 * @param {File} videoFile
 * @param {Object} [options]
 * @param {function} [options.onProgress] - ({percent, message})
 * @param {AbortSignal} [options.signal] - cancel an in-flight upload
 * @returns {Promise<{public_id: string, secure_url: string, duration: number, width: number, height: number}>}
 */
export async function uploadToCloudinary(videoFile, options = {}) {
  const { onProgress, signal } = options;

  const { getVideoRotationDegrees, downscaleForUpload } = await import("./videoRotation");

  // Step 0a: LARGE / 4K clips → downscale to ~720p on-device first. A 295MB
  // 4K clip is over the 200MB backend cap and Gemini doesn't need 4K (720p
  // detects shots identically). The canvas re-encode ALSO bakes in rotation,
  // so a downscaled clip is already upright (rotated=false). Never throws.
  let workFile = videoFile;
  let rotation = 0;
  const ds = await downscaleForUpload(videoFile, onProgress);
  if (ds.downscaled) {
    workFile = ds.file; // already upright + small
  } else {
    // Step 0b: not downscaled → DETECT the rotation flag so the backend can
    // fetch a Cloudinary rotation-baked derivative (fast header parse, no
    // decode; no on-device re-encode which was slow/fragile on iOS Safari).
    try { rotation = await getVideoRotationDegrees(videoFile); }
    catch { /* best-effort; default to no rotation */ }
  }

  // Step 1: compress in-browser if STILL large (ffmpeg path; rarely hit now
  // that big clips are downscaled above).
  const fileToUpload = await compressIfNeeded(workFile, onProgress);

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

  // Retry the whole attempt on transient failures (stall / network / 5xx).
  // A stalled upload aborts after STALL_TIMEOUT_MS and we try again instead
  // of hanging forever. User-initiated abort and 4xx are NOT retried.
  let uploadResponse;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    try {
      uploadResponse = await uploadAttemptXHR(signed.upload_url, formData, { onProgress, signal });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (err?.code === "abort") throw err;             // user cancelled
      if (err?.code === "fatal") throw err;             // 4xx — won't recover
      if (attempt >= MAX_UPLOAD_ATTEMPTS) break;        // out of tries
      onProgress?.({
        percent: 25,
        message: `Upload interrupted — retrying (${attempt + 1}/${MAX_UPLOAD_ATTEMPTS})...`,
      });
      await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? 4000);
      if (signal?.aborted) { const e = new Error("Upload cancelled"); e.code = "abort"; throw e; }
    }
  }
  if (!uploadResponse) {
    throw lastErr || new Error("Upload failed after multiple attempts");
  }

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
