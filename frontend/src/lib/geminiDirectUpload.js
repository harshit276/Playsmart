import api from "./api";

/**
 * Direct browser → Gemini Files API upload.
 *
 * The legacy large-clip path moved the bytes THREE times:
 *   browser → Cloudinary → our backend → Gemini Files API
 * which added 10-30s of pure transfer time on a big phone clip. This
 * uploads ONCE, straight to Google:
 *   1. POST /files/upload-session  — backend mints a resumable upload URL
 *      (API key stays server-side; the URL embeds a single-use token).
 *   2. PUT the bytes to that URL with upload+finalize in one shot
 *      (XHR for upload progress events).
 *   3. POST /files/finalize — backend waits until Gemini marks the file
 *      ACTIVE, returns the {file_name, file_uri} handle used by
 *      /describe-players and the analysis endpoints.
 *
 * Throws on any failure — callers fall back to the Cloudinary path.
 *
 * @param {File|Blob} videoFile
 * @param {Object} [options]
 * @param {function} [options.onProgress] - ({percent, message})
 * @param {AbortSignal} [options.signal] - cancel an in-flight upload
 * @returns {Promise<{file_name: string, file_uri: string|null}>}
 */
// Treat "no upload progress for this long" as a stall → abort, so a silently
// dropped connection fails fast and the caller can fall back to Cloudinary
// instead of waiting out the 240s hard timeout.
const DIRECT_STALL_TIMEOUT_MS = 25_000;

export async function uploadDirectToGemini(videoFile, options = {}) {
  const { onProgress, signal } = options;
  if (signal?.aborted) { const e = new Error("Upload cancelled"); e.code = "abort"; throw e; }
  const mimeType = (videoFile.type || "video/mp4").split(";")[0];

  onProgress?.({ percent: 2, message: "Preparing fast upload..." });
  const { data: session } = await api.post(
    "/files/upload-session",
    { size_bytes: videoFile.size, mime_type: mimeType },
    { timeout: 25000, signal },
  );
  if (!session?.upload_url) throw new Error("no upload_url in session");

  onProgress?.({ percent: 5, message: "Uploading your video..." });
  const fileInfo = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stallTimer = null;
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        try { xhr.abort(); } catch { /* noop */ }
        const e = new Error("Direct upload stalled (no progress)"); e.code = "stall";
        reject(e);
      }, DIRECT_STALL_TIMEOUT_MS);
    };
    const onAbort = () => { try { xhr.abort(); } catch { /* noop */ } };
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
      signal?.removeEventListener("abort", onAbort);
    };
    xhr.open("POST", session.upload_url);
    // Google's resumable protocol: single-chunk upload + finalize.
    xhr.setRequestHeader("X-Goog-Upload-Command", "upload, finalize");
    xhr.setRequestHeader("X-Goog-Upload-Offset", "0");
    xhr.timeout = 240000;
    xhr.upload.onloadstart = armStall;
    xhr.upload.onprogress = (e) => {
      armStall(); // reset the watchdog whenever bytes actually move
      if (e.lengthComputable) {
        const frac = e.loaded / e.total;
        onProgress?.({
          percent: 5 + frac * 85, // 5-90%
          message: `Uploading... ${Math.round(frac * 100)}%`,
        });
      }
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid upload response from Gemini"));
        }
      } else {
        reject(new Error(`Direct upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => { cleanup(); reject(new Error("Direct upload network error (possibly CORS)")); };
    xhr.ontimeout = () => { cleanup(); reject(new Error("Direct upload timed out")); };
    xhr.onabort = () => {
      cleanup();
      if (signal?.aborted) { const e = new Error("Upload cancelled"); e.code = "abort"; reject(e); }
    };
    armStall();
    xhr.send(videoFile);
  });

  const fileName = fileInfo?.file?.name;
  if (!fileName) throw new Error("upload response missing file name");

  onProgress?.({ percent: 92, message: "Finishing up..." });
  const { data: finalized } = await api.post(
    "/files/finalize",
    { file_name: fileName },
    { timeout: 120000, signal },
  );
  if (!finalized?.file_name) throw new Error("finalize failed");
  onProgress?.({ percent: 100, message: "Upload complete" });
  return { file_name: finalized.file_name, file_uri: finalized.file_uri || null };
}
