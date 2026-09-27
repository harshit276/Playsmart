/**
 * @module ghostPose
 * The corrected-motion "ghost": the player's own arm, re-posed to the ideal,
 * drawn over their real clip frame by frame around the moment of contact.
 *
 * WHY 3D: the posture tracker (poseOverlay + poseCorrection) measures and
 * corrects in 2D on one frame. When the arm points toward or away from the
 * camera — a phone filming from behind the court is the common case — a 2D
 * angle is simply the wrong number, and rotating a 2D limb to "fix" it draws
 * the wrong target. MediaPipe's pose landmarker also returns 3D world
 * landmarks (metres, hip-centred), so the angles here are measured in 3D and
 * the correction is a 3D rotation of the player's own upper arm / forearm,
 * projected back onto the frame with a per-frame camera fit.
 *
 * WHAT IT DOES:
 *   1. Samples the clip from ~1 s before contact to ~0.6 s after, runs the
 *      pose landmarker on each frame (in the browser — no server, no upload).
 *   2. Picks the player: the person inside Gemini's contact box, or under
 *      the player's own tap, at contact. It never guesses between several
 *      people. It then follows them frame to frame by re-running the model
 *      on a crop around where they just were. A tournament frame has four
 *      players and a crowd, and on the full frame a far player is a few
 *      pixels high, so they drop out of detection.
 *   3. Measures elbow + shoulder in 3D at contact and compares them with the
 *      curated ideal ranges (idealAngles — the same targets the posture
 *      tracker uses).
 *   4. For each joint outside its range, rotates that segment in 3D by the
 *      amount needed at contact, blended in and out around contact so the
 *      player's own swing is kept everywhere else.
 *   5. Projects the corrected arm back to pixels (affine camera fitted per
 *      frame from the untouched joints, anchored at the real shoulder).
 *
 * HONEST LIMITS (surfaced in the UI, not hidden):
 *   - One camera: 3D is estimated, not measured with markers. The ghost shows
 *     direction and rough size of the change, not a lab-grade angle.
 *   - Arm only (elbow + shoulder). Knee/trunk corrections aren't drawn yet.
 *   - The racket is not tracked.
 */
import { getIdealAngles } from "./idealAngles.js";

const TASKS_VERSION = "1.0.1"; // keep in step with package.json
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

// MediaPipe / BlazePose 33-landmark indices.
const L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16, L_HIP = 23, R_HIP = 24;
export const GHOST_EDGES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [27, 29], [28, 30],
];

const WINDOW_BEFORE_S = 1.0;
const WINDOW_AFTER_S = 0.6;
const SAMPLE_FPS = 30;
const DETECT_MAX_DIM = 720;
// Tracking crops: the region around the player's last box, scaled so the
// model sees them large.
const CROP_DIM = 512;
const CROP_SCALE = 1.9;
// Frames the tracker may miss in a row (motion blur, a body half out of
// frame) before that end of the swing counts as lost.
const MAX_GAP = 4;
// The overlay needs the player followed at least this far either side of
// contact: the correction ramps in over the last 0.3 s and out over 0.25 s.
// Past that, whatever stretch we followed is what plays; losing the player
// at the edge of a 1.6 s window no longer sinks the whole shot.
const NEED_BEFORE_S = 0.3; // = RAMP_IN_S
const NEED_AFTER_S = 0.25; // = RAMP_OUT_S
// Correction weight ramps: fully applied at contact, faded out around it so
// the rest of the swing stays the player's own motion.
const RAMP_IN_S = 0.3;
const RAMP_OUT_S = 0.25;

// ─── model ──────────────────────────────────────────────────────────────
let _landmarkerPromise = null;
// GPU first; drops to CPU for the rest of the session the first time GPU
// fails — at creation, or (the case that bites) on the first real frame, when
// WebGL looked available but isn't usable (blocked GPU, some Android
// WebViews, background tabs).
let _delegate = "GPU";

// IMAGE mode, not VIDEO: every call is an independent detection, which is what
// crop tracking needs. VIDEO mode carries its own tracking state between calls
// and gets confused when the crop window moves under it.
export function loadLandmarker() {
  if (!_landmarkerPromise) {
    _landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "IMAGE",
        numPoses: 6,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
      if (_delegate === "GPU") {
        try {
          return await make("GPU");
        } catch {
          _delegate = "CPU";
        }
      }
      return make("CPU");
    })();
    _landmarkerPromise.catch(() => { _landmarkerPromise = null; });
  }
  return _landmarkerPromise;
}

/** "GPU" or "CPU" — which path the model ended up on (for diagnostics). */
export const ghostDelegate = () => _delegate;

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** True when an error came from MediaPipe losing / never having a GL context. */
export function isWebGLError(err) {
  const m = String(err?.message || err || "");
  return /activeTexture|webgl|WebGL|GL context|kGpuService/.test(m);
}

async function _fallBackToCpu() {
  const old = await _landmarkerPromise?.catch(() => null);
  try { old?.close(); } catch { /* noop */ }
  _delegate = "CPU";
  _landmarkerPromise = null;
  return loadLandmarker();
}

// ─── small vector helpers ───────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); return n > 1e-9 ? scale(a, 1 / n) : null; };

function angleDeg(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const nu = norm(u), nv = norm(v);
  if (nu < 1e-9 || nv < 1e-9) return null;
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (nu * nv)))) * 180) / Math.PI;
}

// Rodrigues: rotate v about unit axis k by rad.
function rotate(v, k, rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

// ─── frame sampling ─────────────────────────────────────────────────────
// Browsers defer loading and seeking media in background tabs, so a player
// who switches apps mid-analysis would otherwise hit a timeout. Pause while
// hidden; carry on when they come back.
function waitVisible() {
  if (typeof document === "undefined" || !document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const on = () => {
      if (!document.hidden) { document.removeEventListener("visibilitychange", on); resolve(); }
    };
    document.addEventListener("visibilitychange", on);
  });
}

function seek(video, t) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; video.removeEventListener("seeked", onSeek); resolve(ok); } };
    const onSeek = () => finish(true);
    video.addEventListener("seeked", onSeek);
    setTimeout(() => finish(false), 2500);
    video.currentTime = t;
  });
}

async function openVideo(src) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  v.src = src;
  // Metadata (size + duration) is all we need to start: each seek fetches the
  // frames it needs. Waiting for `loadeddata` stalls on slow phones and in
  // background tabs, where the browser defers media loading.
  await new Promise((resolve, reject) => {
    let t;
    const arm = () => {
      t = setTimeout(() => {
        if (v.readyState >= 1) resolve();
        else if (document.hidden) waitVisible().then(arm); // they switched away: the clock restarts on return
        else reject(new Error("video-load-timeout"));
      }, 20000);
    };
    arm();
    v.addEventListener("loadedmetadata", () => { clearTimeout(t); resolve(); }, { once: true });
    v.onerror = () => { clearTimeout(t); reject(new Error("video-load-failed")); };
  });
  return v;
}

// ─── target selection ───────────────────────────────────────────────────
function torsoCentre(lm) {
  const p = [lm[L_SH], lm[R_SH], lm[L_HIP], lm[R_HIP]];
  return [p.reduce((a, q) => a + q.x, 0) / 4, p.reduce((a, q) => a + q.y, 0) / 4];
}
/** Gemini's contact box ([ymin,xmin,ymax,xmax], 0-1000) as 0-1 edges, or null. */
function normBox(box) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = box.map((n) => Number(n) / 1000);
  if (![ymin, xmin, ymax, xmax].every(Number.isFinite) || ymax <= ymin || xmax <= xmin) return null;
  return { ymin, xmin, ymax, xmax };
}

/** A tap on the frame ({x, y} in 0-1), or null. */
function normTap(tap) {
  if (!tap || !Number.isFinite(tap.x) || !Number.isFinite(tap.y)) return null;
  if (tap.x < 0 || tap.x > 1 || tap.y < 0 || tap.y > 1) return null;
  return { x: tap.x, y: tap.y };
}

// ─── camera fit: world (x,y,z,1) → pixels, least squares ───────────────
function solve4(A, b) {
  // Gaussian elimination with partial pivoting on a 4x4 system (2 RHS columns).
  const M = A.map((row, i) => [...row, ...b[i]]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 6; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [0, 1, 2, 3].map((r) => [M[r][4] / M[r][r], M[r][5] / M[r][r]]);
}

function fitCamera(world, px, vis) {
  const AtA = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const AtP = [[0, 0], [0, 0], [0, 0], [0, 0]];
  let n = 0;
  for (let i = 0; i < world.length; i++) {
    if ((vis[i] ?? 0) < 0.5) continue;
    const x = [world[i][0], world[i][1], world[i][2], 1];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) AtA[r][c] += x[r] * x[c];
      AtP[r][0] += x[r] * px[i][0];
      AtP[r][1] += x[r] * px[i][1];
    }
    n++;
  }
  if (n < 8) return null;
  const M = solve4(AtA, AtP);
  if (!M) return null;
  return (p) => [
    p[0] * M[0][0] + p[1] * M[1][0] + p[2] * M[2][0] + M[3][0],
    p[0] * M[0][1] + p[1] * M[1][1] + p[2] * M[2][1] + M[3][1],
  ];
}

// ─── smoothing + gap fill ───────────────────────────────────────────────
function fillAndSmooth(series, width = 5) {
  // series: array (per frame) of arrays (per joint) of number[] or null frames.
  const n = series.length;
  const have = series.map((f) => f != null);
  const idx = have.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const filled = series.map((f, i) => {
    if (f) return f;
    let lo = -1, hi = -1;
    for (const j of idx) { if (j < i) lo = j; else { hi = j; break; } }
    if (lo < 0) return series[hi];
    if (hi < 0) return series[lo];
    const w = (i - lo) / (hi - lo);
    return series[lo].map((p, k) => p.map((v, d) => v * (1 - w) + series[hi][k][d] * w));
  });
  const half = Math.floor(width / 2);
  return filled.map((f, i) => f.map((p, k) => p.map((_, d) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) { s += filled[j][k][d]; c++; }
    return s / c;
  })));
}

// ─── main ───────────────────────────────────────────────────────────────
/**
 * Analyse the window around one shot and build the ghost track.
 *
 * @param {object} args
 * @param {File|Blob|string} args.video   the user's clip (File/Blob) or a URL
 * @param {number} args.contactSec        Gemini's contact timestamp (seconds)
 * @param {string} args.sport
 * @param {string} args.shotType          free-text shot category (idealAngles resolves it)
 * @param {number[]|null} args.contactBox [ymin,xmin,ymax,xmax] 0-1000, optional
 * @param {{x:number,y:number}|null} args.tapPoint where the player tapped themselves (0-1), optional
 * @param {(p:{phase:string, done:number, total:number})=>void} [args.onProgress]
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<object>} { ok:true, ... } or { ok:false, reason }
 */
export async function buildGhostTrack({ video, contactSec, sport, shotType, contactBox = null, tapPoint = null, onProgress, signal }) {
  if (typeof contactSec !== "number" || !Number.isFinite(contactSec)) return { ok: false, reason: "no-contact-time" };
  // MediaPipe's web runtime needs WebGL for image handling even on its CPU
  // path, so without it there's nothing to try — say so plainly.
  if (!hasWebGL()) return { ok: false, reason: "no-webgl" };
  const ideal = getIdealAngles(sport, shotType);

  onProgress?.({ phase: "model", done: 0, total: 1 });
  let landmarker = await loadLandmarker();
  if (signal?.aborted) return { ok: false, reason: "aborted" };

  const ownUrl = typeof video === "string" ? null : URL.createObjectURL(video);
  const src = ownUrl || video;
  let v;
  try {
    await waitVisible();
    v = await openVideo(src);
    const dur = v.duration || contactSec + WINDOW_AFTER_S;
    const t0 = Math.max(0, contactSec - WINDOW_BEFORE_S);
    const t1 = Math.min(dur - 0.02, contactSec + WINDOW_AFTER_S);
    let times = [];
    for (let t = t0; t <= t1 + 1e-6; t += 1 / SAMPLE_FPS) times.push(+t.toFixed(4));
    const W = v.videoWidth, H = v.videoHeight;
    if (!W || !H || times.length < 8) return { ok: false, reason: "clip-too-short" };

    const minWH = Math.min(W, H);
    const box = normBox(contactBox);
    const tap = normTap(tapPoint);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const goTo = async (t) => {
      await waitVisible();
      if (!(await seek(v, t)) && document.hidden) {
        await waitVisible();
        await seek(v, t);
      }
    };
    // Run the model on one region of the current frame. Landmarks come back
    // in full-frame 0-1 coordinates whatever the region was.
    const detectRegion = async (r) => {
      const s = r.full ? Math.min(1, DETECT_MAX_DIM / Math.max(r.w, r.h)) : Math.min(2, CROP_DIM / Math.max(r.w, r.h));
      canvas.width = Math.max(16, Math.round(r.w * s));
      canvas.height = Math.max(16, Math.round(r.h * s));
      ctx.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
      let res;
      try {
        res = landmarker.detect(canvas);
      } catch (err) {
        if (_delegate !== "GPU") throw err;
        landmarker = await _fallBackToCpu();
        res = landmarker.detect(canvas);
      }
      return (res.landmarks || []).map((img, k) => ({
        img: img.map((l) => ({ x: (r.x + l.x * r.w) / W, y: (r.y + l.y * r.h) / H, z: l.z, visibility: l.visibility })),
        world: res.worldLandmarks?.[k] || null,
      })).filter((p) => p.world && p.img.length === 33);
    };
    const FULL = { x: 0, y: 0, w: W, h: H, full: true };
    const regionAround = (cx, cy, side) => {
      const w = Math.min(W, side), h = Math.min(H, side);
      return { x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - h, cy - h / 2)), w, h };
    };
    // The player's extent in pixels, from the joints the model could see.
    const bodyBox = (p) => {
      let pts = p.img.filter((l) => (l.visibility ?? 1) >= 0.2);
      if (pts.length < 6) pts = p.img;
      const xs = pts.map((l) => l.x * W), ys = pts.map((l) => l.y * H);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    };
    const regionFor = (p, grow = 1) => {
      const b = bodyBox(p);
      const side = Math.max(0.2 * minWH, CROP_SCALE * grow * Math.max(b.x1 - b.x0, b.y1 - b.y0));
      return regionAround((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, side);
    };
    const torsoPx = (p) => { const [x, y] = torsoCentre(p.img); return [x * W, y * H]; };
    const torsoLenPx = (p) => {
      const lm = p.img;
      const sh = [((lm[L_SH].x + lm[R_SH].x) / 2) * W, ((lm[L_SH].y + lm[R_SH].y) / 2) * H];
      const hp = [((lm[L_HIP].x + lm[R_HIP].x) / 2) * W, ((lm[L_HIP].y + lm[R_HIP].y) / 2) * H];
      return Math.hypot(sh[0] - hp[0], sh[1] - hp[1]);
    };
    // Who is the player? Gemini's box, else their tap, else the only person
    // in view. -2 means several people and nothing to choose between them.
    const pickTarget = (people) => {
      if (!people.length) return -1;
      if (box) {
        const padX = (box.xmax - box.xmin) * 0.3, padY = (box.ymax - box.ymin) * 0.3;
        const cx = (box.xmin + box.xmax) / 2, cy = (box.ymin + box.ymax) / 2;
        let best = -1, bestD = Infinity;
        people.forEach((p, i) => {
          const [tx, ty] = torsoCentre(p.img);
          const inside = tx >= box.xmin - padX && tx <= box.xmax + padX && ty >= box.ymin - padY && ty <= box.ymax + padY;
          const d = Math.hypot((tx - cx) * W, (ty - cy) * H);
          if (inside && d < bestD) { best = i; bestD = d; }
        });
        return best;
      }
      if (tap) {
        const tx = tap.x * W, ty = tap.y * H;
        let best = -1, bestScore = Infinity, bestOut = Infinity;
        people.forEach((p, i) => {
          const b = bodyBox(p);
          const out = Math.hypot(Math.max(b.x0 - tx, 0, tx - b.x1), Math.max(b.y0 - ty, 0, ty - b.y1));
          const [cx, cy] = torsoPx(p);
          // Inside the body beats near it; among overlapping bodies, the torso nearest the tap.
          const score = out * 10 + Math.hypot(cx - tx, cy - ty);
          if (score < bestScore) { best = i; bestScore = score; bestOut = out; }
        });
        return bestOut < 0.06 * minWH ? best : -1;
      }
      return people.length === 1 ? 0 : -2;
    };

    // 1. find the player at contact. A fast arm blurs the contact frame
    // itself, so try the nearest frames (±0.2 s) too. A box is sized to the
    // player, so look in a crop around it first. A tap isn't: a small crop
    // round a near player cuts them in half and the half-body poisons the
    // tracking, so try the full frame first and crops only for a far player
    // too small to find on it.
    const kContact = times.reduce((best, t, i) => (Math.abs(t - contactSec) < Math.abs(times[best] - contactSec) ? i : best), 0);
    const maxShift = Math.round(0.2 * SAMPLE_FPS);
    const anchorRegions = [];
    if (box) {
      const side = Math.max(0.25 * minWH, 1.7 * Math.max((box.xmax - box.xmin) * W, (box.ymax - box.ymin) * H));
      anchorRegions.push(regionAround(((box.xmin + box.xmax) / 2) * W, ((box.ymin + box.ymax) / 2) * H, side), FULL);
    } else if (tap) {
      anchorRegions.push(FULL, regionAround(tap.x * W, tap.y * H, 0.8 * minWH), regionAround(tap.x * W, tap.y * H, 0.45 * minWH));
    } else {
      anchorRegions.push(FULL);
    }
    let kc = -1, anchor = null, ambiguous = false;
    search:
    for (let d = 0; d <= maxShift; d++) {
      for (const k of d === 0 ? [kContact] : [kContact - d, kContact + d]) {
        if (k < 0 || k >= times.length) continue;
        if (signal?.aborted) return { ok: false, reason: "aborted" };
        await goTo(times[k]);
        for (const r of anchorRegions) {
          const people = await detectRegion(r);
          const i = pickTarget(people);
          if (i === -2) { ambiguous = true; break search; }
          if (i >= 0) { kc = k; anchor = people[i]; break search; }
        }
      }
    }
    if (ambiguous) return { ok: false, reason: "need-player-pick" };
    if (kc < 0) return { ok: false, reason: "no-player-at-contact" };

    // 2. follow them out from contact, both ways, looking only in a crop
    // around where they just were. After a miss the search widens (they kept
    // moving while the model blinked); a body far smaller or larger than the
    // one we're following is a partial or wrong detection, not them.
    const tracked = new Array(times.length).fill(null);
    tracked[kc] = anchor;
    let refLen = torsoLenPx(anchor);
    let done = 1;
    onProgress?.({ phase: "track", done, total: times.length });
    for (const dir of [1, -1]) {
      let prev = anchor, misses = 0;
      for (let i = kc + dir; i >= 0 && i < times.length && misses <= MAX_GAP; i += dir) {
        if (signal?.aborted) return { ok: false, reason: "aborted" };
        await goTo(times[i]);
        const grow = 1 + 0.35 * misses;
        const [px, py] = torsoPx(prev);
        const lim = 0.9 * grow * Math.max(0.02 * minWH, torsoLenPx(prev));
        const nearest = (people) => {
          let best = null, bestD = Infinity;
          for (const p of people) {
            const len = torsoLenPx(p);
            if (len < 0.55 * refLen || len > 1.8 * refLen) continue;
            const [tx, ty] = torsoPx(p);
            const d = Math.hypot(tx - px, ty - py);
            if (d < bestD) { bestD = d; best = p; }
          }
          return best && bestD < lim ? best : null;
        };
        // The crop usually finds them; when it doesn't, look at the whole
        // frame before calling it a miss (a crop can clip a lunging body).
        let found = nearest(await detectRegion(regionFor(prev, grow)));
        if (!found) found = nearest(await detectRegion(FULL));
        if (found) {
          tracked[i] = found;
          prev = found;
          misses = 0;
          refLen = 0.8 * refLen + 0.2 * torsoLenPx(prev);
        } else {
          misses++;
        }
        onProgress?.({ phase: "track", done: ++done, total: times.length });
      }
    }

    // Keep the stretch around contact we actually followed (short gaps are
    // filled below). It has to reach far enough either side of contact for
    // the correction to ramp in and out; clips that start or end sooner than
    // that just need to be followed to their edge.
    let lo = kc, hi = kc;
    for (let i = kc - 1, gap = 0; i >= 0; i--) {
      if (tracked[i]) { lo = i; gap = 0; } else if (++gap > MAX_GAP) break;
    }
    for (let i = kc + 1, gap = 0; i < times.length; i++) {
      if (tracked[i]) { hi = i; gap = 0; } else if (++gap > MAX_GAP) break;
    }
    const needBefore = Math.min(NEED_BEFORE_S, contactSec - times[0]);
    const needAfter = Math.min(NEED_AFTER_S, times[times.length - 1] - contactSec);
    const coverage = tracked.filter(Boolean).length / tracked.length;
    if (contactSec - times[lo] < needBefore - 0.02 || times[hi] - contactSec < needAfter - 0.02) {
      return { ok: false, reason: "lost-player", coverage: Math.round(coverage * 100) / 100 };
    }
    times = times.slice(lo, hi + 1);
    const tracked2 = tracked.slice(lo, hi + 1);
    kc -= lo;
    tracked.length = 0;
    tracked.push(...tracked2);
    // Share of the kept stretch the model actually saw (the rest is gap-filled).
    const followed = tracked.filter(Boolean).length / tracked.length;

    // 3. arrays in video pixels / metres, gap-filled + lightly smoothed
    const pxSeries = tracked.map((p) => (p ? p.img.map((l) => [l.x * W, l.y * H]) : null));
    const worldSeries = tracked.map((p) => (p ? p.world.map((l) => [l.x, l.y, l.z]) : null));
    const visSeries = tracked.map((p) => (p ? p.img.map((l) => l.visibility ?? 0) : null));
    const PX = fillAndSmooth(pxSeries, 3);
    const WL = fillAndSmooth(worldSeries, 5);
    const VIS = visSeries.map((f) => f || visSeries[kc]);

    // 4. racket side = the wrist highest in the image around contact
    let lUp = 0, rUp = 0;
    for (let i = Math.max(0, kc - 3); i <= Math.min(times.length - 1, kc + 3); i++) {
      if (PX[i][L_WR][1] < PX[i][R_WR][1]) lUp++; else rUp++;
    }
    const side = lUp > rUp ? "left" : "right";
    const [SH, EL, WR, HIP] = side === "left" ? [L_SH, L_EL, L_WR, L_HIP] : [R_SH, R_EL, R_WR, R_HIP];

    const armVis = Math.min(VIS[kc][SH], VIS[kc][EL], VIS[kc][WR]);
    if (armVis < 0.5) return { ok: false, reason: "arm-not-visible", coverage: Math.round(followed * 100) / 100 };

    // 5. measure at contact (3D) and decide the correction
    const wc = WL[kc];
    const measured = {
      elbow: angleDeg(wc[SH], wc[EL], wc[WR]),
      shoulder: angleDeg(wc[HIP], wc[SH], wc[EL]),
    };
    const applied = [];
    const delta = { shoulder: 0, elbow: 0 };
    for (const joint of ["shoulder", "elbow"]) {
      const range = ideal?.[joint];
      const val = measured[joint];
      if (!range || val == null) continue;
      if (val >= range.min && val <= range.max) continue;
      delta[joint] = range.ideal - val;
      applied.push({
        joint, from: Math.round(val), to: Math.round(range.ideal),
        deltaDeg: Math.round(range.ideal - val), why: range.why || null,
      });
    }

    // 6. per-frame corrected arm (3D rotation blended around contact) → pixels
    const weightAt = (t) => {
      const d = t - contactSec;
      if (d <= -RAMP_IN_S || d >= RAMP_OUT_S) return 0;
      const x = d < 0 ? 1 + d / RAMP_IN_S : 1 - d / RAMP_OUT_S;
      return x * x * (3 - 2 * x);
    };
    let fitErr = 0, fitN = 0;
    const out = times.map((t, i) => {
      const w = applied.length ? weightAt(t) : 0;
      const frame = { t, pts: PX[i], w, corrected: null, tracked: !!tracked[i] };
      if (w < 0.02) return frame;
      const wl = WL[i];
      const project = fitCamera(wl, PX[i], VIS[i]);
      if (!project) return frame;
      for (const k of [SH, L_HIP, R_HIP]) {
        const q = project(wl[k]);
        fitErr += Math.hypot(q[0] - PX[i][k][0], q[1] - PX[i][k][1]); fitN++;
      }
      let el = wl[EL], wr = wl[WR];
      const sh = wl[SH], hip = wl[HIP];
      if (delta.shoulder) {
        const ax = unit(cross(sub(hip, sh), sub(el, sh)));
        if (ax) {
          const rad = (delta.shoulder * w * Math.PI) / 180;
          el = add(sh, rotate(sub(el, sh), ax, rad));
          wr = add(sh, rotate(sub(wr, sh), ax, rad));
        }
      }
      if (delta.elbow) {
        const ax = unit(cross(sub(sh, el), sub(wr, el)));
        if (ax) {
          const rad = (delta.elbow * w * Math.PI) / 180;
          wr = add(el, rotate(sub(wr, el), ax, rad));
        }
      }
      const off = sub([...PX[i][SH], 0], [...project(sh), 0]);
      const toPx = (p) => { const q = project(p); return [q[0] + off[0], q[1] + off[1]]; };
      frame.corrected = { sh: PX[i][SH], el: toPx(el), wr: toPx(wr) };
      return frame;
    });

    // What the correction achieves at contact (checked, not assumed).
    const check = (() => {
      const wl = WL[kc];
      let el = wl[EL], wr = wl[WR];
      const sh = wl[SH], hip = wl[HIP];
      if (delta.shoulder) {
        const ax = unit(cross(sub(hip, sh), sub(el, sh)));
        if (ax) { const r = (delta.shoulder * Math.PI) / 180; el = add(sh, rotate(sub(el, sh), ax, r)); wr = add(sh, rotate(sub(wr, sh), ax, r)); }
      }
      if (delta.elbow) {
        const ax = unit(cross(sub(sh, el), sub(wr, el)));
        if (ax) { const r = (delta.elbow * Math.PI) / 180; wr = add(el, rotate(sub(wr, el), ax, r)); }
      }
      return { elbow: angleDeg(sh, el, wr), shoulder: angleDeg(hip, sh, el) };
    })();

    return {
      ok: true,
      side,
      contactSec,
      contactIndex: kc,
      windowStart: times[0],
      windowEnd: times[times.length - 1],
      videoWidth: W,
      videoHeight: H,
      frames: out,
      measured: { elbow: measured.elbow != null ? Math.round(measured.elbow) : null,
        shoulder: measured.shoulder != null ? Math.round(measured.shoulder) : null },
      achieved: { elbow: check.elbow != null ? Math.round(check.elbow) : null,
        shoulder: check.shoulder != null ? Math.round(check.shoulder) : null },
      applied,
      hasIdeal: !!ideal,
      idealLabel: ideal?.label || null,
      quality: { coverage: Math.round(followed * 100) / 100, fitErrorPx: fitN ? Math.round(fitErr / fitN) : null },
    };
  } finally {
    try { v?.removeAttribute("src"); v?.load?.(); } catch { /* noop */ }
    if (ownUrl) URL.revokeObjectURL(ownUrl);
  }
}
