/**
 * @module frameSource
 * Reliable frame grabs from a video FILE, on phones as well as desktops.
 *
 * WHY: a <video> that was never played and isn't in the page is not decoded
 * by every phone browser. iOS Safari (and some Android WebViews) fire `seeked`
 * and then hand back a solid black frame, which is what players saw as a black
 * "posture" screen and a black "which one are you?" picker. Nothing checked
 * that the frame it drew actually had a picture in it.
 *
 * WHAT this does differently:
 *   - the video sits in the page (2px, near-transparent) so the browser treats
 *     it as something to render
 *   - the decoder is woken with a muted play → pause when data isn't there yet
 *   - a seek waits for the new frame to be presented (requestVideoFrameCallback
 *     where it exists), not just for `seeked`
 *   - every frame is probed for "blank"; a blank one is retried (wait, nudge,
 *     nearby times) and finally reported as a failure instead of being drawn
 *   - if the source keeps failing it gives up fast rather than burning minutes
 *
 * Dependency-free on purpose so it can be tested on a bare static page.
 */

const PROBE = 24;
const BLANK_MEAN = 10; // average brightness (0-255) at or below this = black
const BLANK_SPREAD = 8; // brightest minus darkest at or below this = flat/empty

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitEvent(el, name, ms) {
  return new Promise((resolve, reject) => {
    const on = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(() => { el.removeEventListener(name, on); reject(new Error(`${name}-timeout`)); }, ms);
    el.addEventListener(name, on, { once: true });
  });
}

/**
 * Browsers defer loading and seeking media in background tabs. Resolve when
 * the page is visible (immediately if it already is). With `maxMs`, give up
 * waiting after that long and resolve anyway.
 */
export function waitVisible(maxMs = 0) {
  if (typeof document === "undefined" || !document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    let timer = 0;
    const on = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", on);
      clearTimeout(timer);
      resolve();
    };
    document.addEventListener("visibilitychange", on);
    if (maxMs > 0) timer = setTimeout(() => { document.removeEventListener("visibilitychange", on); resolve(); }, maxMs);
  });
}

let _probe = null;
/**
 * True when `drawable` (a video, image or canvas) is black or flat: no picture.
 * Judged on a whole-frame thumbnail, so a legitimately plain crop is never
 * mistaken for a failed decode. Returns false if the browser won't let us read
 * pixels (privacy modes): better to trust the frame than to reject everything.
 */
export function looksBlank(drawable, sw, sh) {
  try {
    if (!sw || !sh) return true;
    if (!_probe) { _probe = document.createElement("canvas"); _probe.width = PROBE; _probe.height = PROBE; }
    const ctx = _probe.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, PROBE, PROBE);
    ctx.drawImage(drawable, 0, 0, sw, sh, 0, 0, PROBE, PROBE);
    const d = ctx.getImageData(0, 0, PROBE, PROBE).data;
    let sum = 0, min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += y;
      if (y < min) min = y;
      if (y > max) max = y;
    }
    return sum / (PROBE * PROBE) <= BLANK_MEAN || max - min <= BLANK_SPREAD;
  } catch {
    return false;
  }
}

/**
 * Open a video (File/Blob or URL) for frame grabbing.
 * @returns {Promise<{video:HTMLVideoElement,width:number,height:number,duration:number,
 *   stats:object, ensureFrame:(t:number)=>Promise<boolean>, close:()=>void}>}
 * @throws Error("video-load-failed" | "video-load-timeout" | "video-no-dimensions")
 */
export async function openFrameSource(src) {
  const ownUrl = typeof src === "string" ? null : URL.createObjectURL(src);
  const v = document.createElement("video");
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.setAttribute("muted", "");
  v.preload = "auto";
  try { v.disablePictureInPicture = true; } catch { /* noop */ }
  Object.assign(v.style, {
    position: "fixed", left: "0", top: "0", width: "2px", height: "2px",
    opacity: "0.01", pointerEvents: "none", zIndex: "-1",
  });
  document.body.appendChild(v);

  const stats = { seekMs: 0, presentMs: 0, probeMs: 0, seeks: 0, blank: 0, stalled: 0, retried: 0, nudged: 0, failed: 0, ok: 0, rvfc: typeof v.requestVideoFrameCallback === "function" };
  let closed = false;
  let dead = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try { v.pause(); } catch { /* noop */ }
    try { v.removeAttribute("src"); v.load(); } catch { /* noop */ }
    try { v.remove(); } catch { /* noop */ }
    if (ownUrl) { try { URL.revokeObjectURL(ownUrl); } catch { /* noop */ } }
  };

  try {
    v.src = ownUrl || src;
    await waitVisible(20000);
    await new Promise((resolve, reject) => {
      let t;
      const arm = () => {
        t = setTimeout(() => {
          if (v.readyState >= 1) resolve();
          else if (document.hidden) waitVisible().then(arm); // switched away: the clock restarts on return
          else reject(new Error("video-load-timeout"));
        }, 20000);
      };
      v.addEventListener("loadedmetadata", () => { clearTimeout(t); resolve(); }, { once: true });
      v.addEventListener("error", () => { clearTimeout(t); reject(new Error("video-load-failed")); }, { once: true });
      if (v.readyState >= 1) resolve(); else arm();
    });
    const width = v.videoWidth, height = v.videoHeight;
    if (!width || !height) throw new Error("video-no-dimensions");

    // Wake the decoder. Chrome usually has a frame by now; iOS often has not.
    if (v.readyState < 2) await waitEvent(v, "loadeddata", 1500).catch(() => {});
    if (v.readyState < 2) {
      try { await Promise.race([v.play(), sleep(1500)]); } catch { /* autoplay refused */ }
      if (v.readyState < 2) await waitEvent(v, "loadeddata", 2500).catch(() => {});
      try { v.pause(); } catch { /* noop */ }
    }

    let useRvfc = stats.rvfc, rvfcHits = 0, rvfcMisses = 0;
    const seekTo = async (t) => {
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : t + 1;
      const target = Math.max(0.001, Math.min(t, dur - 0.03));
      if (Math.abs(v.currentTime - target) < 0.0005 && v.readyState >= 2) return true;
      // Register for the presented frame BEFORE seeking, or a fast browser
      // shows it and we wait for a callback that already happened.
      const presented = useRvfc ? new Promise((r) => v.requestVideoFrameCallback(() => r(true))) : null;
      const ts0 = performance.now();
      const seeked = await new Promise((resolve) => {
        let done = false;
        const fin = (ok) => { if (done) return; done = true; v.removeEventListener("seeked", onS); clearTimeout(to); resolve(ok); };
        const onS = () => fin(true);
        v.addEventListener("seeked", onS);
        const to = setTimeout(() => fin(false), 4000);
        try { v.currentTime = target; } catch { fin(false); }
      });
      const ts1 = performance.now();
      stats.seeks++; stats.seekMs += ts1 - ts0;
      if (presented) {
        const got = await Promise.race([presented, sleep(seeked ? 90 : 0)]);
        stats.presentMs += performance.now() - ts1;
        if (got) rvfcHits++;
        else if (++rvfcMisses >= 4 && rvfcHits === 0) useRvfc = false; // this browser never calls back: stop paying for it
      } else {
        await sleep(30);
      }
      return seeked;
    };

    const nudge = async () => {
      stats.nudged++;
      try { await Promise.race([v.play(), sleep(600)]); } catch { /* noop */ }
      await sleep(120);
      try { v.pause(); } catch { /* noop */ }
    };

    /** Show a real (non-blank) frame at time t. False if the browser can't. */
    const ensureFrame = async (t) => {
      if (closed || dead) return false;
      const plan = [t, t, t - 0.15, t + 0.15];
      for (let attempt = 0; attempt < plan.length; attempt++) {
        // A seek that never completed leaves whatever frame was showing before
        // (a different moment): that is a failure, not a picture.
        const seeked = await seekTo(Math.max(0, plan[attempt]));
        if (closed) return false;
        if (!seeked) { stats.stalled++; await sleep(150); continue; }
        const tp = performance.now();
        const blank0 = looksBlank(v, width, height);
        stats.probeMs += performance.now() - tp;
        if (!blank0) { if (attempt) stats.retried++; stats.ok++; return true; }
        stats.blank++;
        await sleep(100 + attempt * 150); // give a slow decoder a moment
        if (!looksBlank(v, width, height)) { stats.retried++; stats.ok++; return true; }
        if (attempt === 1) await nudge(); // last resort for a stubborn decoder
      }
      stats.failed++;
      // A source that has never produced a picture won't start now: fail fast.
      if (stats.ok === 0 && stats.failed >= 3) dead = true;
      return false;
    };

    return { video: v, width, height, duration: v.duration, stats, ensureFrame, close };
  } catch (e) {
    close();
    throw e;
  }
}

/**
 * The frame currently showing in `fs`, as a JPEG data URL, optionally cropped
 * to a 0-1000 [ymin,xmin,ymax,xmax] box (20% padding, like Gemini's contact box).
 */
export function frameToDataUrl(fs, { maxDim = 720, cropBox = null, quality = 0.85 } = {}) {
  try {
    const vw = fs.width, vh = fs.height;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (Array.isArray(cropBox) && cropBox.length === 4) {
      const [ymin, xmin, ymax, xmax] = cropBox.map(Number);
      if (ymax > ymin && xmax > xmin) {
        const padY = (ymax - ymin) * 0.2;
        const padX = (xmax - xmin) * 0.2;
        sy = Math.max(0, ((ymin - padY) / 1000) * vh);
        sx = Math.max(0, ((xmin - padX) / 1000) * vw);
        sh = Math.min(vh - sy, ((ymax - ymin + 2 * padY) / 1000) * vh);
        sw = Math.min(vw - sx, ((xmax - xmin + 2 * padX) / 1000) * vw);
        if (sw < 40 || sh < 40) { sx = 0; sy = 0; sw = vw; sh = vh; }
      }
    }
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(sw * scale));
    c.height = Math.max(2, Math.round(sh * scale));
    c.getContext("2d").drawImage(fs.video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/** `dataUrl` if it decodes to a real picture, else null (a saved black thumbnail, a bad file). */
export async function imageIfReal(dataUrl) {
  if (!dataUrl) return null;
  try {
    const img = new Image();
    img.src = dataUrl;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    return looksBlank(img, img.naturalWidth, img.naturalHeight) ? null : dataUrl;
  } catch {
    return null;
  }
}

export function deviceKind() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  return /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : "desktop";
}
