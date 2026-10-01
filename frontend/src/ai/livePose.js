/**
 * @module livePose
 * Real-time pose from a playing <video> (a camera stream, or a file in tests).
 *
 * One person, every frame, on the player's own device: no upload. Each frame
 * comes back as the image points (for drawing), the 3D world points (for
 * angles) and the visibility scores; a frame with nobody in it comes back null.
 *
 * MediaPipe's VIDEO mode keeps tracking state between frames, which is what
 * makes it fast enough to run live, so this owns its own model instance
 * (separate from the clip ghost's IMAGE-mode one).
 */
import { WASM_BASE, MODEL_URL, isWebGLError } from "./mediapipeConfig.js";

let _promise = null;
let _delegate = "GPU";

function loadLive() {
  if (!_promise) {
    _promise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      if (_delegate === "GPU") {
        try { return await make("GPU"); } catch { _delegate = "CPU"; }
      }
      return make("CPU");
    })();
    _promise.catch(() => { _promise = null; });
  }
  return _promise;
}

/** "GPU" or "CPU": which path the live model ended up on (for diagnostics). */
export const liveDelegate = () => _delegate;

/** Forget a model load that never finished, so the next try starts a fresh one. */
export const resetLivePose = () => { _promise = null; };

/** Start loading the model early (e.g. on the setup screen) so Start is instant. */
export const preloadLivePose = () => loadLive().then(() => true).catch(() => false);

/**
 * @param {object} args
 * @param {HTMLVideoElement} args.video  a playing video (camera stream or file)
 * @param {(frame: object|null) => void} args.onFrame
 *   frame = { t, px:[x,y][33] in video pixels, wl:[x,y,z][33] metres, vis:[33], vw, vh, inferMs }
 *   t is seconds: the media time for a file, the capture clock for a camera.
 * @param {(err: Error) => void} [args.onError]
 * @returns {Promise<{stop: () => void, stats: () => object}>}
 */
export async function startLivePose({ video, onFrame, onError }) {
  let landmarker = await loadLive();
  let stopped = false;
  let lastTs = 0;
  let handle = 0;
  const stats = { frames: 0, dropped: 0, inferMs: 0, lastFrameAt: 0, fps: 0 };
  const isFile = !video.srcObject;

  const schedule = () => {
    if (stopped) return;
    if (typeof video.requestVideoFrameCallback === "function") {
      handle = video.requestVideoFrameCallback(step);
    } else {
      handle = requestAnimationFrame((now) => step(now, null));
    }
  };

  const recover = async (err) => {
    // WebGL looked fine but isn't usable (blocked GPU, some WebViews): one
    // retry on the CPU path, then give up with the real error.
    if (_delegate === "GPU" && isWebGLError(err)) {
      try {
        try { landmarker.close(); } catch { /* noop */ }
        _delegate = "CPU";
        _promise = null;
        landmarker = await loadLive();
        return true;
      } catch { /* fall through */ }
    }
    return false;
  };

  async function step(now, meta) {
    if (stopped) return;
    if (video.readyState >= 2 && video.videoWidth > 0 && !document.hidden) {
      const ts = Math.max(lastTs + 1, Math.round(now));
      lastTs = ts;
      const t0 = performance.now();
      let res;
      try {
        res = landmarker.detectForVideo(video, ts);
      } catch (err) {
        if (await recover(err)) { schedule(); return; }
        stopped = true;
        onError?.(err);
        return;
      }
      const inferMs = performance.now() - t0;
      stats.inferMs = stats.frames ? stats.inferMs * 0.9 + inferMs * 0.1 : inferMs;
      if (stats.lastFrameAt) {
        const gap = now - stats.lastFrameAt;
        stats.fps = stats.fps ? stats.fps * 0.9 + (1000 / gap) * 0.1 : 1000 / gap;
        if (gap > 70) stats.dropped++;
      }
      stats.lastFrameAt = now;
      stats.frames++;

      const p = res.landmarks?.[0];
      const w = res.worldLandmarks?.[0];
      const vw = video.videoWidth, vh = video.videoHeight;
      const t = isFile && meta && typeof meta.mediaTime === "number" ? meta.mediaTime : now / 1000;
      if (!p || !w || p.length !== 33 || w.length !== 33) {
        onFrame(null);
      } else {
        onFrame({
          t,
          px: p.map((l) => [l.x * vw, l.y * vh]),
          wl: w.map((l) => [l.x, l.y, l.z]),
          vis: p.map((l) => l.visibility ?? 0),
          vw, vh, inferMs,
        });
      }
    }
    schedule();
  }

  schedule();
  return {
    stop() {
      stopped = true;
      try {
        if (typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(handle);
        else cancelAnimationFrame(handle);
      } catch { /* noop */ }
    },
    stats: () => ({ ...stats, delegate: _delegate }),
  };
}
