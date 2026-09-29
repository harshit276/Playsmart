/** True when the browser can create a WebGL context (MediaPipe's web runtime needs one). */
export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * May the 3D fix start by itself? It downloads ~20 MB the first time and works
 * the phone hard for ~20 s, so it stays on demand for people who've asked the
 * browser to save data, are on a slow link, or are on a low-memory device, and
 * for browsers that can't run it at all.
 */
export function autoGhostAllowed() {
  try {
    const c = navigator.connection;
    if (c?.saveData) return false;
    if (c && /^(slow-2g|2g|3g)$/.test(c.effectiveType || "")) return false;
    if (typeof navigator.deviceMemory === "number" && navigator.deviceMemory < 3) return false;
    if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency < 4) return false;
  } catch { /* unknown: assume fine */ }
  return hasWebGL();
}
