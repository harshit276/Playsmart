import api from "./api";

/**
 * Compress a video in the browser using ffmpeg.wasm only as a LAST resort
 * for very large files. Returns the original otherwise.
 *
 * Threshold 130MB: ffmpeg.wasm is single-threaded and PAINFULLY slow on
 * big inputs — measured >6 min (never finished in test) on a 78MB clip, so
 * compressing the 50-100MB common case made things far WORSE than just
 * uploading the original (verified ~300s end-to-end for 78MB upload-as-is).
 * We therefore upload the original for everything up to 130MB and only
 * ffmpeg-shrink beyond that, where the raw upload would exceed Cloudinary /
 * the 200MB backend fetch cap. (Properly fast >100MB support needs
 * server-side async transcoding — tracked as a follow-up.) On any ffmpeg
 * error we still fall back to the original.
 */
async function compressIfNeeded(file, onProgress) {
  if (file.size < 130 * 1024 * 1024) return file; // Upload as-is up to 130MB

  try {
    onProgress?.({ percent: 5, message: "Optimizing a large video (this one takes a bit)..." });
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

  // Step 1: compress in-browser if the file is large
  const fileToUpload = await compressIfNeeded(videoFile, onProgress);

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
