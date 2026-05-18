/**
 * @module poseOverlay
 * Draws a pose skeleton on a shot thumbnail with joints color-coded
 * by whether their measured angles fall inside the "ideal range" for
 * that shot type. Pedagogical alternative to AI video regeneration —
 * users see exactly which joints are off and by how much.
 */
import { initModel, detectPose, getKeypointByName, calculateAngle, KEYPOINT_NAMES, SKELETON_EDGES } from "./poseDetector.js";


/**
 * Hand-curated ideal joint-angle ranges PER (sport, shot_type) at the
 * CONTACT moment. Based on coaching literature + slow-motion analysis
 * of pro players. Numbers are degrees. `null` ranges mean "not part of
 * the signature for this shot — don't grade it."
 *
 * Joint angles measured:
 *   shoulder = shoulder→elbow vs shoulder→hip axis
 *   elbow    = shoulder→elbow→wrist (interior angle)
 *   knee     = hip→knee→ankle (interior angle)
 *
 * "side": which side to grade (the racket arm). MoveNet doesn't
 * automatically know left vs right dominant hand, so we measure
 * BOTH sides and pick the one with the higher arm position
 * (typically the racket arm at contact).
 */
const IDEAL_ANGLES = {
  badminton: {
    smash: {
      label: "Smash — overhead contact",
      elbow: { min: 150, max: 175, ideal: 165, why: "Near-straight arm at contact transfers max power" },
      shoulder: { min: 150, max: 180, ideal: 170, why: "Racket arm high overhead, body coiled and uncoiling" },
      knee: { min: 130, max: 175, ideal: 160, why: "Slight bend = athletic stance, fully extended = post-jump landing" },
    },
    clear: {
      label: "Clear — high deep arc",
      elbow: { min: 160, max: 180, ideal: 175, why: "Fully extended at contact for maximum height" },
      shoulder: { min: 155, max: 180, ideal: 170, why: "Throwing-motion: shoulder peaks above ear" },
      knee: { min: 130, max: 170, ideal: 155, why: "Stable base, weight transfer front-to-back" },
    },
    drop: {
      label: "Drop — soft just-over-net",
      elbow: { min: 140, max: 175, ideal: 160, why: "Same as smash setup; deception comes from slice" },
      shoulder: { min: 145, max: 180, ideal: 165, why: "Identical to smash from address — the disguise is critical" },
    },
    drive: {
      label: "Drive — flat fast",
      elbow: { min: 100, max: 145, ideal: 125, why: "Bent arm, racket head leads through contact zone" },
      shoulder: { min: 70, max: 120, ideal: 95, why: "Shoulder-height contact, body rotated to side" },
    },
    net_shot: {
      label: "Net shot — soft touch",
      elbow: { min: 130, max: 170, ideal: 150, why: "Relaxed grip, racket lifted up to shuttle" },
      shoulder: { min: 30, max: 90, ideal: 55, why: "Low, in front of body — wrist does the work" },
    },
    serve: {
      label: "Serve — backhand low",
      elbow: { min: 60, max: 110, ideal: 85, why: "Compact L-shape, fingers push the shuttle" },
      shoulder: { min: 10, max: 60, ideal: 30, why: "Low to waist height, no big swing" },
    },
    lift: {
      label: "Lift — underarm deep",
      elbow: { min: 130, max: 175, ideal: 155, why: "Lower-body drives, arm extends through contact" },
      shoulder: { min: 30, max: 100, ideal: 65, why: "Below waist at contact, follows through up" },
    },
  },
  tennis: {
    forehand: {
      label: "Forehand — topspin drive",
      elbow: { min: 120, max: 170, ideal: 150, why: "Slight bend at contact, full extension on follow-through" },
      shoulder: { min: 60, max: 110, ideal: 90, why: "Contact in front of body at hip-to-shoulder height" },
    },
    backhand: {
      label: "Backhand — two-handed drive",
      elbow: { min: 110, max: 165, ideal: 140, why: "Both arms bent at setup, extending through contact" },
      shoulder: { min: 50, max: 100, ideal: 80, why: "Compact, rotation drives the racket" },
    },
    serve: {
      label: "Serve — flat / kick",
      elbow: { min: 155, max: 180, ideal: 175, why: "Full extension at contact, ball at peak racket reach" },
      shoulder: { min: 160, max: 180, ideal: 175, why: "Arm above ear, body fully stretched" },
    },
    volley: {
      label: "Volley — punch",
      elbow: { min: 90, max: 140, ideal: 115, why: "Short stab, no swing — racket head LEADS contact" },
      shoulder: { min: 40, max: 90, ideal: 65, why: "In front of body at shoulder height, knees bent" },
    },
  },
  table_tennis: {
    forehand_drive: {
      label: "Forehand drive — topspin",
      elbow: { min: 100, max: 150, ideal: 125, why: "Bent at setup, opens through contact" },
      shoulder: { min: 30, max: 80, ideal: 55, why: "Below shoulder, hip drives the rotation" },
    },
    backhand_drive: {
      label: "Backhand drive",
      elbow: { min: 80, max: 130, ideal: 105, why: "Compact L, wrist snaps over the ball" },
      shoulder: { min: 30, max: 70, ideal: 50, why: "Close to the body, low setup" },
    },
    smash: {
      label: "Smash — high-ball kill",
      elbow: { min: 130, max: 170, ideal: 150, why: "Near-straight at contact, ball is well above table" },
      shoulder: { min: 80, max: 150, ideal: 120, why: "Reaches up to high ball, body weight forward" },
    },
  },
  cricket: {
    cover_drive: {
      label: "Cover drive — front foot",
      elbow: { min: 120, max: 170, ideal: 150, why: "Top hand controls; bat face stays under ball" },
      shoulder: { min: 30, max: 90, ideal: 60, why: "Front shoulder points to where ball is going" },
      knee: { min: 90, max: 145, ideal: 120, why: "Front knee bent, weight on it" },
    },
    pull_shot: {
      label: "Pull shot — back foot",
      elbow: { min: 90, max: 160, ideal: 130, why: "Bottom hand drives the horizontal bat" },
      shoulder: { min: 60, max: 120, ideal: 90, why: "Body opens up to leg side" },
    },
    straight_drive: {
      label: "Straight drive",
      elbow: { min: 130, max: 175, ideal: 160, why: "Bat presented full-face, top elbow high" },
      shoulder: { min: 40, max: 100, ideal: 70, why: "Front shoulder leads, head over the ball" },
    },
    bowling_action_fast: {
      label: "Fast bowling action",
      elbow: { min: 155, max: 180, ideal: 175, why: "High-arm release at the very top of the action" },
      shoulder: { min: 155, max: 180, ideal: 175, why: "Front arm pulls down as bowling arm comes over" },
    },
  },
  pickleball: {
    dink: {
      label: "Dink — soft kitchen drop",
      elbow: { min: 130, max: 170, ideal: 150, why: "Paddle face open, lift from the shoulder" },
      shoulder: { min: 30, max: 80, ideal: 55, why: "Below the chest, paddle in front of body" },
    },
    drive: {
      label: "Drive — flat groundstroke",
      elbow: { min: 110, max: 155, ideal: 130, why: "Compact swing, paddle head LEADS contact" },
      shoulder: { min: 50, max: 100, ideal: 75, why: "Hip-to-shoulder level, body rotates" },
    },
    volley: {
      label: "Volley — kitchen punch",
      elbow: { min: 90, max: 140, ideal: 115, why: "Stab not swing, paddle head in front" },
      shoulder: { min: 40, max: 100, ideal: 70, why: "Knees bent, paddle out in front" },
    },
  },
};


function getIdealAngles(sport, shotType) {
  const s = (sport || "").toLowerCase().trim();
  const t = (shotType || "").toLowerCase().trim().replace(/\s+/g, "_");
  const sportMap = IDEAL_ANGLES[s];
  if (!sportMap) return null;
  // Direct hit
  if (sportMap[t]) return sportMap[t];
  // Fuzzy: contains match
  for (const key of Object.keys(sportMap)) {
    if (t.includes(key) || key.includes(t)) return sportMap[key];
  }
  return null;
}


/**
 * Pick which side (left or right) is the "racket arm" — heuristic:
 * the arm with the wrist HIGHER in the frame at contact (smaller y).
 * For non-overhead shots, the arm whose elbow is FURTHER from the
 * shoulder horizontally. Returns "left" or "right".
 */
function detectRacketSide(kps) {
  const lw = getKeypointByName(kps, "left_wrist");
  const rw = getKeypointByName(kps, "right_wrist");
  if (!lw || !rw) return "right";
  if ((lw.score || 0) < 0.3 && (rw.score || 0) >= 0.3) return "right";
  if ((rw.score || 0) < 0.3 && (lw.score || 0) >= 0.3) return "left";
  // Higher wrist (smaller y) wins — that's typically the racket-bearing arm
  return lw.y < rw.y ? "left" : "right";
}


function angleAt(kps, sideName, joint) {
  // joint: "shoulder" | "elbow" | "knee"
  const get = (n) => getKeypointByName(kps, n);
  if (joint === "elbow") {
    const a = get(`${sideName}_shoulder`);
    const b = get(`${sideName}_elbow`);
    const c = get(`${sideName}_wrist`);
    if (!a || !b || !c) return null;
    if ((a.score || 0) < 0.2 || (b.score || 0) < 0.2 || (c.score || 0) < 0.2) return null;
    return calculateAngle(a, b, c);
  }
  if (joint === "shoulder") {
    // shoulder→elbow vs shoulder→hip axis (how high the upper arm is)
    const sh = get(`${sideName}_shoulder`);
    const el = get(`${sideName}_elbow`);
    const hp = get(`${sideName}_hip`);
    if (!sh || !el || !hp) return null;
    if ((sh.score || 0) < 0.2 || (el.score || 0) < 0.2 || (hp.score || 0) < 0.2) return null;
    return calculateAngle(hp, sh, el);
  }
  if (joint === "knee") {
    const h = get(`${sideName}_hip`);
    const k = get(`${sideName}_knee`);
    const a = get(`${sideName}_ankle`);
    if (!h || !k || !a) return null;
    if ((h.score || 0) < 0.2 || (k.score || 0) < 0.2 || (a.score || 0) < 0.2) return null;
    return calculateAngle(h, k, a);
  }
  return null;
}


/**
 * Run MoveNet on an image data URL, draw the skeleton on an offscreen
 * canvas, compute joint angles, and grade each measured angle against
 * the ideal range for this sport+shot. Returns:
 *   { annotatedDataUrl, measurements: [{ joint, value, ideal, status }], racketSide }
 */
export async function analyzePoseOnFrame(imageDataUrl, sport, shotType, options = {}) {
  const { maxDim = 480 } = options;
  await initModel();

  // Load image
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageDataUrl;
  await new Promise((res, rej) => {
    img.onload = res; img.onerror = () => rej(new Error("failed to load thumbnail"));
  });

  // Downscale if huge (perf)
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  // Draw into a tmp canvas at native size for detection (better keypoint
  // accuracy than the downscaled annotation canvas)
  const detectCanvas = document.createElement("canvas");
  detectCanvas.width = img.width; detectCanvas.height = img.height;
  detectCanvas.getContext("2d").drawImage(img, 0, 0);

  let keypoints = null;
  try {
    keypoints = await detectPose(detectCanvas);
  } catch {
    return { error: "pose-detection-failed" };
  }
  if (!keypoints || keypoints.length === 0) {
    return { error: "no-pose-detected" };
  }

  const racketSide = detectRacketSide(keypoints);
  const ideal = getIdealAngles(sport, shotType);

  // Measure angles on the racket side
  const measurements = [];
  for (const joint of ["elbow", "shoulder", "knee"]) {
    const value = angleAt(keypoints, racketSide, joint);
    if (value == null) continue;
    const range = ideal?.[joint];
    let status = "neutral";
    let delta = null;
    if (range) {
      delta = Math.abs(value - range.ideal);
      if (value >= range.min && value <= range.max) status = "good";
      else if (value >= range.min - 15 && value <= range.max + 15) status = "okay";
      else status = "off";
    }
    measurements.push({
      joint, value: Math.round(value),
      ideal: range ? { min: range.min, max: range.max, target: range.ideal, why: range.why } : null,
      status, delta: delta != null ? Math.round(delta) : null,
    });
  }

  // Draw skeleton on annotation canvas (downscaled to maxDim for size)
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const scaleX = w / img.width;
  const scaleY = h / img.height;

  // Color by status of the nearest measured joint
  const statusColors = {
    good: "#84cc16", okay: "#facc15", off: "#ef4444", neutral: "#a3a3a3",
  };

  // Draw edges first (under the dots)
  ctx.lineWidth = Math.max(2, Math.round(w / 240));
  ctx.strokeStyle = "#84cc16";
  for (const [i, j] of SKELETON_EDGES) {
    const a = keypoints[i], b = keypoints[j];
    if (!a || !b) continue;
    if ((a.score || 0) < 0.2 || (b.score || 0) < 0.2) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * scaleX, a.y * scaleY);
    ctx.lineTo(b.x * scaleX, b.y * scaleY);
    ctx.stroke();
  }

  // Then dots — color-coded for the measured joints on the racket side
  const racketJointMap = {
    [`${racketSide}_elbow`]: measurements.find((m) => m.joint === "elbow")?.status,
    [`${racketSide}_shoulder`]: measurements.find((m) => m.joint === "shoulder")?.status,
    [`${racketSide}_knee`]: measurements.find((m) => m.joint === "knee")?.status,
  };
  for (let i = 0; i < keypoints.length; i++) {
    const kp = keypoints[i];
    if (!kp || (kp.score || 0) < 0.2) continue;
    const name = KEYPOINT_NAMES[i];
    const statusForThis = racketJointMap[name];
    const color = statusForThis ? statusColors[statusForThis] : "#84cc16";
    const radius = statusForThis ? Math.max(6, Math.round(w / 90)) : Math.max(4, Math.round(w / 150));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(kp.x * scaleX, kp.y * scaleY, radius, 0, Math.PI * 2);
    ctx.fill();
    if (statusForThis) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  return {
    annotatedDataUrl: out.toDataURL("image/jpeg", 0.85),
    measurements,
    racketSide,
    shotLabel: ideal?.label || null,
    hasIdealRange: !!ideal,
  };
}
