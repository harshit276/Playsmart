/**
 * @module formReplay
 * Phase 1 of "pose-corrected video": extract a frame stack around the
 * shot's contact moment, run MoveNet on each, and compute a green
 * "ideal-ghost" skeleton at the contact frame via forward kinematics
 * from the user's own bone lengths + curated IDEAL_ANGLES targets.
 *
 * Output is consumed by FormCoachReplay.jsx which draws frames to a
 * canvas with requestAnimationFrame for a smooth loop. No AI video
 * generation — just controlled playback + overlay.
 */
import { initModel, detectPose, getKeypointByName, calculateAngle, KEYPOINT_NAMES, SKELETON_EDGES } from "./poseDetector.js";


// ─── Same IDEAL_ANGLES the PoseOverlayModal uses, kept inline so this
// module is self-contained. Update both if you change one (or refactor
// to a shared config in a follow-up).
const IDEAL_ANGLES = {
  badminton: {
    smash:    { elbow: { min: 150, max: 175, target: 165 }, shoulder: { min: 150, max: 180, target: 170 } },
    clear:    { elbow: { min: 160, max: 180, target: 175 }, shoulder: { min: 155, max: 180, target: 170 } },
    drop:     { elbow: { min: 140, max: 175, target: 160 }, shoulder: { min: 145, max: 180, target: 165 } },
    drive:    { elbow: { min: 100, max: 145, target: 125 }, shoulder: { min: 70,  max: 120, target: 95  } },
    net_shot: { elbow: { min: 130, max: 170, target: 150 }, shoulder: { min: 30,  max: 90,  target: 55  } },
    serve:    { elbow: { min: 60,  max: 110, target: 85  }, shoulder: { min: 10,  max: 60,  target: 30  } },
    lift:     { elbow: { min: 130, max: 175, target: 155 }, shoulder: { min: 30,  max: 100, target: 65  } },
  },
  tennis: {
    forehand: { elbow: { min: 120, max: 170, target: 150 }, shoulder: { min: 60,  max: 110, target: 90  } },
    backhand: { elbow: { min: 110, max: 165, target: 140 }, shoulder: { min: 50,  max: 100, target: 80  } },
    serve:    { elbow: { min: 155, max: 180, target: 175 }, shoulder: { min: 160, max: 180, target: 175 } },
    volley:   { elbow: { min: 90,  max: 140, target: 115 }, shoulder: { min: 40,  max: 90,  target: 65  } },
  },
  table_tennis: {
    forehand_drive: { elbow: { min: 100, max: 150, target: 125 }, shoulder: { min: 30, max: 80,  target: 55  } },
    backhand_drive: { elbow: { min: 80,  max: 130, target: 105 }, shoulder: { min: 30, max: 70,  target: 50  } },
    smash:          { elbow: { min: 130, max: 170, target: 150 }, shoulder: { min: 80, max: 150, target: 120 } },
  },
  cricket: {
    cover_drive:         { elbow: { min: 120, max: 170, target: 150 }, shoulder: { min: 30,  max: 90,  target: 60  } },
    pull_shot:           { elbow: { min: 90,  max: 160, target: 130 }, shoulder: { min: 60,  max: 120, target: 90  } },
    straight_drive:      { elbow: { min: 130, max: 175, target: 160 }, shoulder: { min: 40,  max: 100, target: 70  } },
    bowling_action_fast: { elbow: { min: 155, max: 180, target: 175 }, shoulder: { min: 155, max: 180, target: 175 } },
  },
  pickleball: {
    dink:   { elbow: { min: 130, max: 170, target: 150 }, shoulder: { min: 30, max: 80,  target: 55 } },
    drive:  { elbow: { min: 110, max: 155, target: 130 }, shoulder: { min: 50, max: 100, target: 75 } },
    volley: { elbow: { min: 90,  max: 140, target: 115 }, shoulder: { min: 40, max: 100, target: 70 } },
  },
};


function getIdeal(sport, shotType) {
  const s = (sport || "").toLowerCase().trim();
  const t = (shotType || "").toLowerCase().trim().replace(/\s+/g, "_");
  const sportMap = IDEAL_ANGLES[s];
  if (!sportMap) return null;
  if (sportMap[t]) return sportMap[t];
  for (const key of Object.keys(sportMap)) {
    if (t.includes(key) || key.includes(t)) return sportMap[key];
  }
  // Token-overlap fallback (matches "back_court_smash" → "smash" etc.)
  const GENERIC = new Set(["shot", "shots", "play", "hit", "stroke", "court", "side", "back", "front"]);
  const shotTok = new Set(t.split("_").filter((x) => x.length >= 4 && !GENERIC.has(x)));
  let best = null, bestOverlap = 0;
  for (const [key, entry] of Object.entries(sportMap)) {
    const keyTok = new Set(key.split("_").filter((x) => x.length >= 4 && !GENERIC.has(x)));
    const overlap = [...shotTok].filter((x) => keyTok.has(x)).length;
    if (overlap > bestOverlap) { bestOverlap = overlap; best = entry; }
  }
  return best;
}


// Pick which side is the racket arm (higher wrist = overhead, else
// further-out elbow). Used to know which arm's joints to compare to
// the IDEAL_ANGLES.
function pickRacketSide(kps) {
  const lw = getKeypointByName(kps, "left_wrist");
  const rw = getKeypointByName(kps, "right_wrist");
  if (!lw && !rw) return "right";
  if (!lw) return "right";
  if (!rw) return "left";
  const lc = lw.score || 0, rc = rw.score || 0;
  if (lc < 0.25 && rc >= 0.25) return "right";
  if (rc < 0.25 && lc >= 0.25) return "left";
  return lw.y < rw.y ? "left" : "right";
}


// Rotate point P around pivot O by angle (radians).
function rotate(O, P, angleRad) {
  const dx = P.x - O.x, dy = P.y - O.y;
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  return { x: O.x + dx * c - dy * s, y: O.y + dx * s + dy * c };
}


/**
 * Forward kinematics — given the user's measured pose and a target
 * elbow angle, compute WHERE the wrist would land if we kept the
 * shoulder + elbow positions fixed and only changed the elbow's
 * interior angle to the target.
 *
 * This is the GREEN ghost overlay: we use the user's own bone lengths
 * (so it looks like THEM with corrected form), only rotating the wrist
 * around the elbow joint until the interior angle = target.
 *
 * Returns a NEW keypoints array with the corrected wrist + the rest of
 * the user's joints unchanged. When a joint isn't fixable (the angle
 * is already within range, or detection confidence is too low),
 * returns null and the caller should skip drawing the ghost.
 */
function buildIdealGhost(kps, sideName, idealCfg) {
  if (!idealCfg) return null;
  const get = (n) => getKeypointByName(kps, n);
  const sh = get(`${sideName}_shoulder`);
  const el = get(`${sideName}_elbow`);
  const wr = get(`${sideName}_wrist`);
  if (!sh || !el || !wr) return null;
  if ((sh.score || 0) < 0.3 || (el.score || 0) < 0.3 || (wr.score || 0) < 0.3) return null;

  const corrected = kps.map((p) => p ? { ...p } : p);
  let didCorrect = false;

  // ── ELBOW: rotate wrist around elbow until ∠shoulder-elbow-wrist = target
  if (idealCfg.elbow) {
    const measured = calculateAngle(sh, el, wr);
    const { min, max, target } = idealCfg.elbow;
    if (measured < min || measured > max) {
      // angle correction = target - measured
      // Determine rotation direction by checking the sign of the cross product
      const v1x = sh.x - el.x, v1y = sh.y - el.y;
      const v2x = wr.x - el.x, v2y = wr.y - el.y;
      const cross = v1x * v2y - v1y * v2x;
      const sign = cross >= 0 ? 1 : -1;
      const deltaDeg = target - measured;
      const newWr = rotate(el, wr, sign * deltaDeg * Math.PI / 180);
      const wrIdx = KEYPOINT_NAMES.indexOf(`${sideName}_wrist`);
      if (wrIdx >= 0) {
        corrected[wrIdx] = { ...wr, x: newWr.x, y: newWr.y, _ghost: true };
        didCorrect = true;
      }
    }
  }

  // ── SHOULDER: rotate (elbow + wrist) around shoulder until
  //    ∠hip-shoulder-elbow = target. This changes how high the upper
  //    arm is raised.
  if (idealCfg.shoulder) {
    const hp = get(`${sideName}_hip`);
    if (hp && (hp.score || 0) >= 0.3) {
      const measured = calculateAngle(hp, sh, el);
      const { min, max, target } = idealCfg.shoulder;
      if (measured < min || measured > max) {
        const v1x = hp.x - sh.x, v1y = hp.y - sh.y;
        const v2x = el.x - sh.x, v2y = el.y - sh.y;
        const cross = v1x * v2y - v1y * v2x;
        const sign = cross >= 0 ? 1 : -1;
        const deltaRad = sign * (target - measured) * Math.PI / 180;
        // Rotate both elbow and wrist (the whole upper arm + forearm)
        // around the shoulder so the whole limb pivots together.
        const elIdx = KEYPOINT_NAMES.indexOf(`${sideName}_elbow`);
        const wrIdx = KEYPOINT_NAMES.indexOf(`${sideName}_wrist`);
        const curEl = corrected[elIdx] || el;
        const curWr = corrected[wrIdx] || wr;
        const newEl = rotate(sh, curEl, deltaRad);
        const newWr = rotate(sh, curWr, deltaRad);
        corrected[elIdx] = { ...curEl, x: newEl.x, y: newEl.y, _ghost: true };
        corrected[wrIdx] = { ...curWr, x: newWr.x, y: newWr.y, _ghost: true };
        didCorrect = true;
      }
    }
  }

  return didCorrect ? corrected : null;
}


/**
 * Extract a frame stack around the shot's contact moment + run MoveNet
 * on each. Returns:
 *   {
 *     frames: [{ dataUrl, keypoints, frameTime, isContact }],
 *     racketSide: "left" | "right",
 *     idealCfg: { elbow, shoulder } | null,
 *     contactGhost: keypoints[] | null,   // green ghost for the contact frame
 *     contactStatus: { elbow: "good"|"okay"|"off", shoulder: ... } | null,
 *     videoSize: { w, h }
 *   }
 *
 * Frame count: 25 frames over a 2.5s window (10 fps). One-shot cost
 * ~1.5-3s depending on device. Cached at component level so the loop
 * itself is canvas-only.
 */
export async function extractFormReplay(videoFile, timestamp, sport, shotType, opts = {}) {
  const { framesPerSecond = 10, windowSec = 2.5, leadSec = 1.0, maxDim = 480 } = opts;
  await initModel();

  const video = document.createElement("video");
  const url = URL.createObjectURL(videoFile);
  video.src = url; video.muted = true; video.playsInline = true; video.crossOrigin = "anonymous";
  video.load();
  await new Promise((res, rej) => {
    let done = false;
    video.addEventListener("loadedmetadata", () => { if (!done) { done = true; res(); } }, { once: true });
    video.addEventListener("error", () => { if (!done) { done = true; rej(new Error("video metadata load failed")); } }, { once: true });
    setTimeout(() => { if (!done) { done = true; rej(new Error("video metadata timeout")); } }, 8000);
  });

  const duration = video.duration;
  let ts = (typeof timestamp === "number" && timestamp > 0.5) ? timestamp : duration * 0.25;
  ts = Math.max(0.1, Math.min(duration - 0.1, ts));

  const startSec = Math.max(0, ts - leadSec);
  const endSec = Math.min(duration, ts + (windowSec - leadSec));
  const total = Math.max(2, Math.round((endSec - startSec) * framesPerSecond));
  const step = (endSec - startSec) / Math.max(1, total - 1);

  const vw = video.videoWidth || 720, vh = video.videoHeight || 480;
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const outW = Math.max(1, Math.round(vw * scale));
  const outH = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");
  const detectCanvas = document.createElement("canvas");
  detectCanvas.width = vw; detectCanvas.height = vh;
  const detectCtx = detectCanvas.getContext("2d");

  // Seek helper
  const seekTo = (t) => new Promise((res, rej) => {
    let done = false;
    const onSeeked = () => { if (!done) { done = true; video.removeEventListener("seeked", onSeeked); res(); } };
    video.addEventListener("seeked", onSeeked);
    try { video.currentTime = Math.max(0.01, Math.min(duration - 0.01, t)); } catch (e) { rej(e); return; }
    setTimeout(() => { if (!done) { done = true; video.removeEventListener("seeked", onSeeked); res(); } }, 1500);
  });

  const frames = [];
  let contactIdx = -1;
  let bestContactDelta = Infinity;
  for (let i = 0; i < total; i++) {
    const t = startSec + step * i;
    await seekTo(t);
    // Draw downscaled frame for display
    ctx.drawImage(video, 0, 0, vw, vh, 0, 0, outW, outH);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    // Draw native-size frame for detection accuracy
    detectCtx.drawImage(video, 0, 0, vw, vh);
    let keypoints = null;
    try { keypoints = await detectPose(detectCanvas); } catch {}
    const dt = Math.abs(t - ts);
    if (dt < bestContactDelta) { bestContactDelta = dt; contactIdx = i; }
    frames.push({ dataUrl, keypoints, frameTime: t, isContact: false });
  }
  if (frames[contactIdx]) frames[contactIdx].isContact = true;

  URL.revokeObjectURL(url);

  // Compute ideal ghost on the contact frame only.
  const contactFrame = frames[contactIdx];
  let contactGhost = null, contactStatus = null, racketSide = "right";
  if (contactFrame?.keypoints) {
    racketSide = pickRacketSide(contactFrame.keypoints);
    const idealCfg = getIdeal(sport, shotType);
    if (idealCfg) {
      contactGhost = buildIdealGhost(contactFrame.keypoints, racketSide, idealCfg);
      // Compute status for each joint at contact
      const get = (n) => getKeypointByName(contactFrame.keypoints, n);
      const statusFor = (joint) => {
        const cfg = idealCfg[joint];
        if (!cfg) return null;
        let a, b, c;
        if (joint === "elbow") {
          a = get(`${racketSide}_shoulder`); b = get(`${racketSide}_elbow`); c = get(`${racketSide}_wrist`);
        } else if (joint === "shoulder") {
          a = get(`${racketSide}_hip`); b = get(`${racketSide}_shoulder`); c = get(`${racketSide}_elbow`);
        }
        if (!a || !b || !c) return null;
        if ((a.score || 0) < 0.25 || (b.score || 0) < 0.25 || (c.score || 0) < 0.25) return null;
        const v = calculateAngle(a, b, c);
        if (v >= cfg.min && v <= cfg.max) return { joint, value: Math.round(v), target: cfg.target, status: "good" };
        if (v >= cfg.min - 15 && v <= cfg.max + 15) return { joint, value: Math.round(v), target: cfg.target, status: "okay" };
        return { joint, value: Math.round(v), target: cfg.target, status: "off" };
      };
      contactStatus = {
        elbow: statusFor("elbow"),
        shoulder: statusFor("shoulder"),
      };
    }
  }

  return {
    frames,
    racketSide,
    contactIdx,
    contactGhost,
    contactStatus,
    videoSize: { w: outW, h: outH, originalW: vw, originalH: vh },
  };
}


/**
 * Draw a frame's pose + (when contact frame) the green ideal-ghost
 * overlay onto a 2D canvas context. Used by FormCoachReplay.jsx in
 * its requestAnimationFrame loop.
 */
export function drawFormFrame(ctx, frame, replay, options = {}) {
  const { canvasW, canvasH } = options;
  const { videoSize, contactGhost, racketSide } = replay;
  const sx = canvasW / videoSize.originalW;
  const sy = canvasH / videoSize.originalH;

  // Draw the underlying frame (already downscaled to maxDim)
  const img = new Image();
  img.src = frame.dataUrl;
  if (img.complete) {
    ctx.drawImage(img, 0, 0, canvasW, canvasH);
  } else {
    img.onload = () => ctx.drawImage(img, 0, 0, canvasW, canvasH);
    // Fill while loading to avoid flicker
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  if (!frame.keypoints) return;

  // Draw USER skeleton (white on every frame, color-coded at contact)
  const lineW = Math.max(2, Math.round(canvasW / 220));
  const drawSkeleton = (kps, color, alpha = 1.0, dotR = 4) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    for (const [a, b] of SKELETON_EDGES) {
      const pa = kps[a], pb = kps[b];
      if (!pa || !pb) continue;
      if ((pa.score || 0) < 0.2 || (pb.score || 0) < 0.2) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * sx, pa.y * sy);
      ctx.lineTo(pb.x * sx, pb.y * sy);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    for (const kp of kps) {
      if (!kp || (kp.score || 0) < 0.2) continue;
      ctx.beginPath();
      ctx.arc(kp.x * sx, kp.y * sy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  if (frame.isContact) {
    // At the contact frame, draw USER in white outline + colored joints,
    // then GHOST in green dashed overlay.
    drawSkeleton(frame.keypoints, "rgba(255,255,255,0.85)", 1.0, Math.max(5, Math.round(canvasW / 90)));
    if (contactGhost) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      drawSkeleton(contactGhost, "#84cc16", 0.85, Math.max(5, Math.round(canvasW / 90)));
      ctx.restore();
    }
  } else {
    drawSkeleton(frame.keypoints, "rgba(255,255,255,0.7)", 0.7, Math.max(3, Math.round(canvasW / 150)));
  }
}
