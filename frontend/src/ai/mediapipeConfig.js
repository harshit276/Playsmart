/**
 * Where MediaPipe's pose runtime and model come from. Shared by the clip ghost
 * (IMAGE mode) and the live practice mode (VIDEO mode) so both download the
 * same files once and the browser caches them.
 */
export const TASKS_VERSION = "1.0.1"; // keep in step with package.json
export const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
export const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

/** True when an error came from MediaPipe losing / never having a GL context. */
export function isWebGLError(err) {
  const m = String(err?.message || err || "");
  return /activeTexture|webgl|WebGL|GL context|kGpuService/.test(m);
}
