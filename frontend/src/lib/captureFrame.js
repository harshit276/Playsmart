import { openFrameSource, frameToDataUrl, deviceKind } from "@/lib/frameSource";
import { track } from "@/lib/analytics";

// Capture a single frame from a video FILE at time t as a JPEG data URL, or
// null if this browser can't produce a real picture (never a black frame: see
// frameSource for why phones used to return black).
// Owns its own object URL — sharing the parent's caused net::ERR_FILE_NOT_FOUND
// when the parent revoked it mid-capture (seen in prod console).
export async function captureFrameAt(videoFile, t, maxDim = 720, cropBox = null) {
  let fs = null;
  let cancelled = false;
  const started = Date.now();
  const work = (async () => {
    fs = await openFrameSource(videoFile);
    if (cancelled) { fs.close(); return { url: null, reason: "cancelled" }; }
    if (!(await fs.ensureFrame(t))) return { url: null, reason: "blank" };
    const url = frameToDataUrl(fs, { maxDim, cropBox });
    return { url, reason: url ? null : "encode-failed" };
  })();
  const timeout = new Promise((r) => setTimeout(() => r({ url: null, reason: "timeout" }), 25000));
  let res;
  try {
    res = await Promise.race([work, timeout]);
  } catch (e) {
    res = { url: null, reason: e?.message || "error" };
  }
  cancelled = true;
  const stats = fs?.stats || {};
  fs?.close();
  // Only the interesting cases: a failure, or a frame that needed rescuing.
  if (!res.url || stats.retried || stats.nudged) {
    track("frame_capture", {
      ok: !!res.url, reason: res.reason, device: deviceKind(),
      blank: stats.blank || 0, retried: stats.retried || 0, nudged: stats.nudged || 0,
      seconds: Math.round((Date.now() - started) / 100) / 10,
    });
  }
  return res.url;
}
