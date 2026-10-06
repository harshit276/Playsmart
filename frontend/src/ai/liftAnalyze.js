/**
 * @module liftAnalyze
 * Check a lift on the lifter's own clip, in the browser (no upload): follow the
 * lifter through the clip with the pose model, find the reps, grade the setup
 * and lockout of each, and build the corrected-pose picture around any moment
 * that is out of range.
 *
 * Everything is measured by liftPose and re-posed by liftCorrect; this file is
 * the glue that needs a browser: the model, the frame reader, the canvas.
 *
 * Who is the lifter? A gym is full of people. The largest person in view at the
 * start is taken as the lifter, and they are then followed frame to frame by
 * staying close to where they just were. If tracking is lost for good, the
 * largest person is picked up again.
 */
import { loadLandmarker, fallBackToCpu, ghostDelegate } from "./ghostPose.js";
import { openFrameSource, waitVisible, frameToDataUrl } from "../lib/frameSource.js";
import { hasWebGL } from "../lib/webgl.js";
import { L_SH, R_SH, L_HIP, R_HIP } from "./correctPose.js";
import { measureLift, clipFacing, viewLabel, findDeadliftReps, gradeLiftRep, planLiftCorrection, LIFTS } from "./liftPose.js";
import { correctLift, achievedLift } from "./liftCorrect.js";
import { drawLiftFrame } from "./liftDraw.js";

const DETECT_MAX_DIM = 720;
const MAX_FRAMES = 200;
const MAX_GAP = 4; // frames the tracker may miss in a row before the lifter counts as lost
const RAMP_S = 0.45; // the corrected pose fades in and out over this long around setup and lockout
const STILL_DIM = 560;
const BUILD_BUDGET_MS = 150000;

const median3 = (a) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const smoothstep = (x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

/** 1 inside [a, b], easing to 0 over RAMP_S either side. */
function windowWeight(t, a, b) {
  if (t >= a && t <= b) return 1;
  return smoothstep(1 - (t < a ? a - t : t - b) / RAMP_S);
}

/**
 * @param {object} args
 * @param {File|Blob|string} args.video  the lifter's clip
 * @param {string} [args.lift="deadlift"]
 * @param {(p:{phase:string, done:number, total:number})=>void} [args.onProgress]
 * @param {AbortSignal} [args.signal]
 * @param {number} [args.budgetMs]
 * @returns {Promise<object>} { ok:true, ... } or { ok:false, reason }
 */
export async function analyzeLiftClip({ video, lift = "deadlift", onProgress, signal, budgetMs = BUILD_BUDGET_MS }) {
  if (!LIFTS[lift]) return { ok: false, reason: "unsupported-lift" };
  if (!hasWebGL()) return { ok: false, reason: "no-webgl" };
  onProgress?.({ phase: "model", done: 0, total: 1 });
  let landmarker = await loadLandmarker();
  if (signal?.aborted) return { ok: false, reason: "aborted" };

  let fs = null;
  let budgetEnd = Date.now() + budgetMs;
  const overBudget = () => Date.now() > budgetEnd;
  try {
    await waitVisible();
    fs = await openFrameSource(video);
    const v = fs.video;
    const W = fs.width, H = fs.height, dur = fs.duration;
    if (!W || !H || !dur || dur < 2) return { ok: false, reason: "clip-too-short" };

    const fps = dur <= 20 ? 8 : dur <= 40 ? 5 : 3;
    const step = Math.max(1 / fps, (dur - 0.1) / MAX_FRAMES);
    const times = [];
    for (let t = 0.05; t < dur - 0.04; t += step) times.push(+t.toFixed(3));
    if (times.length < 12) return { ok: false, reason: "clip-too-short" };

    const canvas = document.createElement("canvas");
    const cx = canvas.getContext("2d");
    const minWH = Math.min(W, H);
    const goTo = async (t) => {
      const w0 = Date.now();
      await waitVisible();
      budgetEnd += Date.now() - w0; // time spent waiting for the tab to be visible is the user's, not ours
      return fs.ensureFrame(t);
    };
    const detect = async () => {
      const sc = Math.min(1, DETECT_MAX_DIM / Math.max(W, H));
      canvas.width = Math.max(16, Math.round(W * sc));
      canvas.height = Math.max(16, Math.round(H * sc));
      cx.drawImage(v, 0, 0, canvas.width, canvas.height);
      let res;
      try {
        res = landmarker.detect(canvas);
      } catch (err) {
        if (ghostDelegate() !== "GPU") throw err;
        landmarker = await fallBackToCpu();
        res = landmarker.detect(canvas);
      }
      return (res.landmarks || []).map((img, k) => ({
        img: img.map((l) => ({ x: l.x * W, y: l.y * H, visibility: l.visibility ?? 0 })),
        world: res.worldLandmarks?.[k] || null,
      })).filter((p) => p.world && p.img.length === 33);
    };
    const torsoPx = (p) => {
      const a = p.img;
      return [(a[L_SH].x + a[R_SH].x + a[L_HIP].x + a[R_HIP].x) / 4, (a[L_SH].y + a[R_SH].y + a[L_HIP].y + a[R_HIP].y) / 4];
    };
    const torsoLen = (p) => {
      const a = p.img;
      return Math.hypot((a[L_SH].x + a[R_SH].x) / 2 - (a[L_HIP].x + a[R_HIP].x) / 2, (a[L_SH].y + a[R_SH].y) / 2 - (a[L_HIP].y + a[R_HIP].y) / 2);
    };
    const hipsSeen = (p) => Math.min(p.img[L_HIP].visibility, p.img[R_HIP].visibility);

    // ── follow the lifter ──
    const tracked = new Array(times.length).fill(null);
    let prev = null, refLen = 0, misses = 0;
    for (let i = 0; i < times.length; i++) {
      if (signal?.aborted) return { ok: false, reason: "aborted" };
      if (overBudget()) return { ok: false, reason: "too-slow" };
      onProgress?.({ phase: "track", done: i, total: times.length });
      if (!(await goTo(times[i]))) { misses++; continue; }
      const people = (await detect()).filter((p) => hipsSeen(p) >= 0.3 && torsoLen(p) > 0.04 * minWH);
      let pick = null;
      if (prev && misses <= MAX_GAP) {
        const [px, py] = torsoPx(prev);
        const lim = 0.9 * (1 + 0.35 * misses) * Math.max(0.03 * minWH, torsoLen(prev));
        let bestD = Infinity;
        for (const p of people) {
          const len = torsoLen(p);
          if (len < 0.55 * refLen || len > 1.8 * refLen) continue;
          const [tx, ty] = torsoPx(p);
          const d = Math.hypot(tx - px, ty - py);
          if (d < bestD) { bestD = d; pick = p; }
        }
        if (pick && bestD >= lim) pick = null;
      }
      if (!pick && (!prev || misses > MAX_GAP)) {
        // (re)acquire: the biggest person in view
        pick = people.reduce((b, p) => (!b || torsoLen(p) > torsoLen(b) ? p : b), null);
        if (pick) refLen = torsoLen(pick);
      }
      if (pick) { tracked[i] = pick; prev = pick; misses = 0; refLen = 0.8 * refLen + 0.2 * torsoLen(pick); } else misses++;
    }
    onProgress?.({ phase: "track", done: times.length, total: times.length });

    const seen = tracked.filter(Boolean).length;
    const coverage = seen / times.length;
    if (seen < 8) return { ok: false, reason: "no-lifter", coverage: +coverage.toFixed(2) };

    // ── series: fill short gaps, light smoothing ──
    const have = tracked.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
    const at = (i) => {
      if (tracked[i]) return tracked[i];
      let lo = -1, hi = -1;
      for (const j of have) { if (j < i) lo = j; else { hi = j; break; } }
      if (lo < 0 || hi < 0 || hi - lo > MAX_GAP + 1) return null;
      const w = (i - lo) / (hi - lo), A = tracked[lo], B = tracked[hi];
      return {
        img: A.img.map((p, k) => ({ x: p.x * (1 - w) + B.img[k].x * w, y: p.y * (1 - w) + B.img[k].y * w, visibility: Math.min(p.visibility, B.img[k].visibility) })),
        world: A.world.map((p, k) => ({ x: p.x * (1 - w) + B.world[k].x * w, y: p.y * (1 - w) + B.world[k].y * w, z: p.z * (1 - w) + B.world[k].z * w })),
      };
    };
    const series = times.map((t, i) => {
      const p = at(i);
      if (!p) return { t, ok: false };
      return {
        t, ok: true,
        px: p.img.map((l) => [l.x, l.y]),
        wl: p.world.map((l) => [l.x, l.y, l.z]),
        vis: p.img.map((l) => l.visibility),
      };
    });

    // ── measure (twice: the first pass finds which way the lifter faces) ──
    const first = series.map((f) => (f.ok ? { t: f.t, ...measureLift(f.wl, f.vis, null) } : { t: f.t, ok: false }));
    const fwd = clipFacing(first.filter((m) => m.ok));
    const meas = series.map((f) => (f.ok ? { t: f.t, ...measureLift(f.wl, f.vis, fwd) } : { t: f.t, ok: false }));
    const viewDeg = (() => {
      const vs = meas.map((m) => m.view).filter((x) => x != null).sort((a, b) => a - b);
      return vs.length ? vs[Math.floor(vs.length / 2)] : null;
    })();

    // ── reps, grades, plans ──
    const found = findDeadliftReps(meas.filter((m) => m.ok));
    if (!found.length) {
      return { ok: false, reason: "no-rep", coverage: +coverage.toFixed(2), view: { deg: viewDeg, label: viewLabel(viewDeg) } };
    }
    const nearest = (t) => series.reduce((b, f, i) => (f.ok && (b < 0 || Math.abs(f.t - t) < Math.abs(series[b].t - t)) ? i : b), -1);
    const reps = found.map((r, n) => {
      const grade = gradeLiftRep(lift, { ...r, signed: !!fwd });
      const plans = {
        setup: planLiftCorrection(lift, "setup", r.setup),
        lockout: planLiftCorrection(lift, "lockout", r.lockout),
      };
      return { n: n + 1, ...r, grade, plans };
    });

    // ── per-frame: smoothed angles and, near an out-of-range moment, the corrected pose ──
    const frames = series.map((f, i) => {
      if (!f.ok) return null;
      const win = [i - 1, i, i + 1].filter((k) => k >= 0 && k < meas.length && meas[k].ok);
      const ang = {
        hip: median3(win.map((k) => meas[k].hip)),
        knee: median3(win.map((k) => meas[k].knee)),
        trunk: median3(win.map((k) => meas[k].trunk)),
      };
      let best = null;
      for (const r of reps) {
        const wins = [
          ["setup", r.tPull - 0.9, r.tPull + 0.1],
          ["lockout", r.tLock - 0.2, r.tLock + 0.8],
        ];
        for (const [phase, a, b] of wins) {
          if (!r.plans[phase].applied.some((x) => x.joint === "knee" || x.joint === "trunk")) continue;
          const w = windowWeight(f.t, a, b);
          if (w > 0.02 && (!best || w > best.w)) best = { w, phase, plan: r.plans[phase] };
        }
      }
      let ghost = null;
      if (best) {
        const c = correctLift({ wl: f.wl, px: f.px, vis: f.vis, delta: best.plan.delta, w: best.w, fwd });
        if (c) ghost = { px2: c.px2, moved: c.moved, w: best.w, phase: best.phase };
      }
      return { t: f.t, px: f.px, vis: f.vis, ang, ghost };
    });

    // ── what each correction really achieves, measured at the key frame (checked, not assumed) ──
    for (const r of reps) {
      r.achieved = {};
      for (const phase of ["setup", "lockout"]) {
        const plan = r.plans[phase];
        if (!plan.applied.some((x) => x.joint === "knee" || x.joint === "trunk")) continue;
        const i = nearest(phase === "setup" ? r.tPull - 0.3 : r.tLock);
        if (i < 0) continue;
        const f = series[i];
        const c = correctLift({ wl: f.wl, px: f.px, vis: f.vis, delta: plan.delta, w: 1, fwd });
        if (c) { const a = achievedLift(c, f.vis, fwd); r.achieved[phase] = { hip: a.hip, knee: a.knee, trunk: a.trunk }; }
      }
    }

    // ── still pictures at the two key moments of each rep (first few reps) ──
    const stills = {};
    for (const r of reps.slice(0, 4)) {
      stills[r.n] = {};
      for (const [phase, t] of [["setup", Math.max(0.05, r.tPull - 0.3)], ["lockout", r.tLock]]) {
        try {
          const i = nearest(t);
          if (i < 0 || !frames[i] || !(await goTo(series[i].t))) continue;
          const url = frameToDataUrl(fs, { maxDim: STILL_DIM, quality: 0.8 });
          if (!url) continue;
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
          const c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          // the still is its own correction at full weight, whether or not the player was inside a ghost window
          const plan = r.plans[phase];
          let ghost = null;
          if (plan.applied.some((x) => x.joint === "knee" || x.joint === "trunk")) {
            const f = series[i];
            const cc = correctLift({ wl: f.wl, px: f.px, vis: f.vis, delta: plan.delta, w: 1, fwd });
            if (cc) ghost = { px2: cc.px2, moved: cc.moved, w: 1 };
          }
          drawLiftFrame(ctx, { ...frames[i], ghost }, c.width / W, { readout: true });
          stills[r.n][phase] = { url: c.toDataURL("image/jpeg", 0.82), t: series[i].t };
        } catch { /* a missing still never sinks the analysis */ }
      }
    }

    return {
      ok: true,
      lift,
      reps,
      frames: frames.filter(Boolean),
      stills,
      videoWidth: W,
      videoHeight: H,
      duration: dur,
      signed: !!fwd,
      view: { deg: viewDeg, label: viewLabel(viewDeg) },
      quality: { coverage: +coverage.toFixed(2), frames: times.length, delegate: ghostDelegate() },
    };
  } finally {
    fs?.close();
  }
}
