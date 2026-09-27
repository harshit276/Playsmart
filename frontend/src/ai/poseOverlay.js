/**
 * @module poseOverlay
 * Draws a pose skeleton on a shot thumbnail with joints color-coded
 * by whether their measured angles fall inside the "ideal range" for
 * that shot type. Pedagogical alternative to AI video regeneration â€”
 * users see exactly which joints are off and by how much.
 */
import { initModel, detectPose, detectMultiplePeople, getKeypointByName, calculateAngle, KEYPOINT_NAMES, SKELETON_EDGES } from "./poseDetector.js";
import { getIdealAngles } from "./idealAngles.js";

// Angles are only reported when EVERY contributing joint clears this. MoveNet
// happily emits low-confidence guesses for occluded limbs, and those produced
// the confidently-wrong readouts users saw ("Elbow 52° · Off" on a clean
// shot). Better to show three angles we trust than six we don't.
const MIN_ANGLE_KP_SCORE = 0.5;

// A detected person is only a candidate subject above this pose score.
const MIN_SUBJECT_SCORE = 0.3;

/**
 * Choose WHICH detected person is the player.
 *
 * MoveNet SinglePose returns exactly one pose and gives no say in whose it is,
 * so on a court with an opponent, umpire or spectators it regularly locked
 * onto the wrong body — the "skeleton drawn on the other player" bug. MultiPose
 * returns everyone, so we can pick deliberately: in a contact frame the player
 * is the largest, most confident, most central figure.
 *
 * `box` is normalized 0-1 (see detectMultiplePeople); keypoints stay in pixels.
 */
function _pickSubject(people) {
  if (!people || people.length === 0) return null;
  let best = null;
  for (const p of people) {
    if ((p.score || 0) < MIN_SUBJECT_SCORE) continue;
    const box = p.box || {};
    const area = Math.max(0, (box.width || 0) * (box.height || 0));   // 0-1
    const cx = (box.x || 0) + (box.width || 0) / 2;
    const cy = (box.y || 0) + (box.height || 0) / 2;
    // 1.0 dead centre, falling to 0 at the corners.
    const centrality = 1 - Math.min(1, Math.hypot(cx - 0.5, cy - 0.5) / 0.7071);
    // Size dominates (the player is nearest the camera), confidence gates it,
    // centrality only breaks ties between similarly-sized people.
    const rank = (p.score || 0)
      * (0.45 + 0.55 * Math.sqrt(Math.min(1, area * 4)))
      * (0.75 + 0.25 * centrality);
    if (!best || rank > best.rank) best = { pose: p, rank };
  }
  return best ? best.pose : null;
}


// Ideal ranges + shot-name lookup live in ./idealAngles.js (TF-free, shared
// with the 3D ghost).


/**
 * Pick which side (left or right) is the "racket arm" â€” heuristic:
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
  // Higher wrist (smaller y) wins â€” that's typically the racket-bearing arm
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
    if ((a.score || 0) < MIN_ANGLE_KP_SCORE || (b.score || 0) < MIN_ANGLE_KP_SCORE || (c.score || 0) < MIN_ANGLE_KP_SCORE) return null;
    return calculateAngle(a, b, c);
  }
  if (joint === "shoulder") {
    // shoulderâ†’elbow vs shoulderâ†’hip axis (how high the upper arm is)
    const sh = get(`${sideName}_shoulder`);
    const el = get(`${sideName}_elbow`);
    const hp = get(`${sideName}_hip`);
    if (!sh || !el || !hp) return null;
    if ((sh.score || 0) < MIN_ANGLE_KP_SCORE || (el.score || 0) < MIN_ANGLE_KP_SCORE || (hp.score || 0) < MIN_ANGLE_KP_SCORE) return null;
    return calculateAngle(hp, sh, el);
  }
  if (joint === "knee") {
    const h = get(`${sideName}_hip`);
    const k = get(`${sideName}_knee`);
    const a = get(`${sideName}_ankle`);
    if (!h || !k || !a) return null;
    if ((h.score || 0) < MIN_ANGLE_KP_SCORE || (k.score || 0) < MIN_ANGLE_KP_SCORE || (a.score || 0) < MIN_ANGLE_KP_SCORE) return null;
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

  // Detect EVERYONE, then choose the player (see _pickSubject). Falls back to
  // single-pose only if multi-pose is unavailable, so a model-load failure
  // degrades to the old behaviour rather than losing the feature.
  let keypoints = null;
  let peopleCount = 0;
  try {
    const people = await detectMultiplePeople(detectCanvas);
    peopleCount = people.length;
    const subject = _pickSubject(people);
    if (subject) keypoints = subject.keypoints;
  } catch {
    // fall through to single-pose
  }
  if (!keypoints) {
    try {
      keypoints = await detectPose(detectCanvas);
    } catch {
      return { error: "pose-detection-failed" };
    }
  }
  if (!keypoints || keypoints.length === 0) {
    return { error: "no-pose-detected" };
  }

  const racketSide = detectRacketSide(keypoints);
  const ideal = getIdealAngles(sport, shotType);

  // â”€â”€ Pose-reliability gate for overhead shots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Overhead shots (smash, clear, serve, overhead, spike, jump shot, bowling
  // â€¦) have a high ideal shoulder elevation. At contact the racket wrist
  // MUST sit at or above the shoulder. When MoveNet says otherwise â€” common
  // on multi-person frames, motion-blurred overhead arms, or an arm partway
  // out of the crop â€” the arm keypoints are mis-detected and ANY angle they
  // produce is garbage (the "55Â° Â· Off" on a clearly-overhead smash bug).
  // In that case we DROP the arm measurements rather than flag good
  // technique as a fault.
  const isOverhead = !!(ideal?.shoulder && ideal.shoulder.ideal >= 150);
  const rWristK = getKeypointByName(keypoints, `${racketSide}_wrist`);
  const rShoulderK = getKeypointByName(keypoints, `${racketSide}_shoulder`);
  const armReliable = !isOverhead || !!(
    rWristK && rShoulderK
    && (rWristK.score || 0) > 0.3 && (rShoulderK.score || 0) > 0.3
    // y grows downward; wrist must be at/above shoulder (small tolerance).
    && rWristK.y < rShoulderK.y + (img.height * 0.04)
  );

  // Measure angles on the racket side
  const measurements = [];
  for (const joint of ["elbow", "shoulder", "knee"]) {
    // Arm joints suppressed when the overhead pose check failed.
    if (!armReliable && (joint === "elbow" || joint === "shoulder")) continue;
    const value = angleAt(keypoints, racketSide, joint);
    if (value == null) continue;
    const range = ideal?.[joint];
    // Gross-contradiction guard: a high-ideal joint (overhead arm) measuring
    // far BELOW its range is a detection failure, not a coaching fault â€” skip
    // it instead of rendering a misleading "Off".
    if (range && range.ideal >= 150 && value < range.min - 40) continue;
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

  // Then dots â€” color-coded for the measured joints on the racket side
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
    // Raw keypoints in SOURCE image pixels, plus the source dimensions, so a
    // caller can re-render the skeleton itself rather than being stuck with the
    // baked JPEG above. FormCompareView needs these to draw the corrected pose
    // (see poseCorrection) against the same frame at any display size.
    keypoints: keypoints.map((k) => (k ? { x: k.x, y: k.y, score: k.score } : null)),
    sourceWidth: img.width,
    sourceHeight: img.height,
    // How many people were in frame — lets the UI say "we tracked the closest
    // player" instead of leaving the user wondering who the skeleton is on.
    peopleCount,
  };
}
