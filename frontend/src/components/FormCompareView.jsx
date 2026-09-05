import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { ArrowRight, Info, RotateCcw, Layers, Columns2 } from "lucide-react";
import { correctPose, correctionVectors, KEYPOINT_ORDER } from "@/ai/poseCorrection";

/**
 * FormCompareView — "your form" beside "corrected", on the user's own body.
 *
 * The posture tracker already says a joint is 33° out. This shows where that
 * joint should actually be: we take the player's real keypoints, rotate the
 * offending segment to the curated ideal while preserving their own bone
 * lengths, and draw the result over the same frame. Nothing is generated, so
 * nothing can be biomechanically invented — it is their skeleton, solved.
 *
 * Two views because they answer different questions:
 *   - Side by side: "what should it look like?"
 *   - Overlay:      "how far off am I?"  (ghost of current under the target)
 */

// Drawn as index pairs into KEYPOINT_ORDER. Local copy for the same reason
// poseCorrection inlines the names: importing poseDetector pulls in TensorFlow.
const EDGES = [
  ["left_shoulder", "right_shoulder"], ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"], ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"], ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
].map(([a, b]) => [KEYPOINT_ORDER.indexOf(a), KEYPOINT_ORDER.indexOf(b)]);

const MIN_DRAW_SCORE = 0.25;
const JOINT_LABEL = { elbow: "Elbow", shoulder: "Shoulder", knee: "Knee" };

function drawSkeleton(ctx, kps, sx, sy, { color, width, alpha = 1, dots = true, dotColor }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [i, j] of EDGES) {
    const a = kps[i], b = kps[j];
    if (!a || !b) continue;
    if ((a.score || 0) < MIN_DRAW_SCORE || (b.score || 0) < MIN_DRAW_SCORE) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * sx, a.y * sy);
    ctx.lineTo(b.x * sx, b.y * sy);
    ctx.stroke();
  }
  if (dots) {
    ctx.fillStyle = dotColor || color;
    for (const kp of kps) {
      if (!kp || (kp.score || 0) < MIN_DRAW_SCORE) continue;
      ctx.beginPath();
      ctx.arc(kp.x * sx, kp.y * sy, Math.max(2.5, width * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawArrow(ctx, from, to, sx, sy, color, width) {
  const x1 = from.x * sx, y1 = from.y * sy, x2 = to.x * sx, y2 = to.y * sy;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 6) return;
  const head = Math.min(14, Math.max(7, len * 0.28));
  const ang = Math.atan2(dy, dx);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.setLineDash([width * 2.2, width * 1.8]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(ang) * head * 0.8, y2 - Math.sin(ang) * head * 0.8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(ang - 0.42) * head, y2 - Math.sin(ang - 0.42) * head);
  ctx.lineTo(x2 - Math.cos(ang + 0.42) * head, y2 - Math.sin(ang + 0.42) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** One canvas: the frame, plus whichever skeletons this panel is meant to show. */
function PoseCanvas({ frameUrl, sourceWidth, sourceHeight, original, corrected, vectors, mode, label, accent }) {
  const ref = useRef(null);
  const [img, setImg] = useState(null);

  useEffect(() => {
    if (!frameUrl) return undefined;
    let alive = true;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => alive && setImg(im);
    im.onerror = () => alive && setImg(null);
    im.src = frameUrl;
    return () => { alive = false; };
  }, [frameUrl]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !img || !sourceWidth || !sourceHeight) return;
    // Render at 2x for crisp lines on retina, CSS scales it back down.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = cv.clientWidth || 320;
    const cssH = Math.round((cssW * sourceHeight) / sourceWidth);
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.height = `${cssH}px`;

    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    // Darken slightly so lime/white skeletons stay legible on bright gyms/courts.
    ctx.fillStyle = "rgba(10,10,10,0.34)";
    ctx.fillRect(0, 0, cv.width, cv.height);

    const sx = cv.width / sourceWidth;
    const sy = cv.height / sourceHeight;
    const w = Math.max(2.5, cv.width / 150);

    if (mode === "yours") {
      drawSkeleton(ctx, original, sx, sy, { color: "#f87171", width: w, dotColor: "#fca5a5" });
    } else if (mode === "corrected") {
      drawSkeleton(ctx, original, sx, sy, { color: "#f87171", width: w * 0.75, alpha: 0.3, dots: false });
      drawSkeleton(ctx, corrected, sx, sy, { color: "#a3e635", width: w, dotColor: "#d9f99d" });
      for (const v of vectors || []) drawArrow(ctx, v.from, v.to, sx, sy, "#fbbf24", Math.max(2, w * 0.8));
    } else {
      // overlay — both, equal weight, so the gap is the subject
      drawSkeleton(ctx, original, sx, sy, { color: "#f87171", width: w, alpha: 0.85, dotColor: "#fca5a5" });
      drawSkeleton(ctx, corrected, sx, sy, { color: "#a3e635", width: w, alpha: 0.95, dotColor: "#d9f99d" });
      for (const v of vectors || []) drawArrow(ctx, v.from, v.to, sx, sy, "#fbbf24", Math.max(2, w * 0.8));
    }
  }, [img, sourceWidth, sourceHeight, original, corrected, vectors, mode]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
      <canvas ref={ref} className="w-full block" />
      {label && (
        <div
          className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md backdrop-blur-sm"
          style={{ background: "rgba(10,10,10,.72)", color: accent }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

export default function FormCompareView({ pose, shotLabel }) {
  const [mode, setMode] = useState("split"); // split | overlay

  const { original, corrected, applied, vectors } = useMemo(() => {
    if (!pose?.keypoints || !pose?.measurements || !pose?.racketSide) {
      return { original: null, corrected: null, applied: [], vectors: [] };
    }
    const res = correctPose(pose.keypoints, pose.measurements, pose.racketSide);
    return {
      original: pose.keypoints,
      corrected: res.corrected,
      applied: res.applied,
      vectors: correctionVectors(pose.keypoints, res.corrected, res.applied, pose.racketSide),
    };
  }, [pose]);

  if (!original) return null;

  const common = {
    frameUrl: pose.frameUrl,
    sourceWidth: pose.sourceWidth,
    sourceHeight: pose.sourceHeight,
    original,
    corrected,
    vectors,
  };

  // Everything already inside its ideal band — a real, meaningful result.
  if (!applied.length) {
    return (
      <div className="bg-zinc-900/60 border border-lime-400/30 rounded-2xl p-4">
        <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold mb-3">Form check</p>
        <PoseCanvas {...common} mode="yours" label="Your form" accent="#a3e635" />
        <p className="text-sm text-zinc-300 mt-3">
          Every joint we can measure is already inside its ideal range for this
          {shotLabel ? ` ${shotLabel.toLowerCase()}` : " shot"}. Nothing to correct here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">
            Your form vs corrected
          </p>
          {shotLabel && <p className="text-[11px] text-zinc-500 mt-0.5">{shotLabel}</p>}
        </div>
        <div className="flex gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setMode("split")}
            className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
              mode === "split" ? "bg-lime-400 text-black" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Columns2 className="w-3 h-3" /> Side by side
          </button>
          <button
            type="button"
            onClick={() => setMode("overlay")}
            className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
              mode === "overlay" ? "bg-lime-400 text-black" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Layers className="w-3 h-3" /> Overlay
          </button>
        </div>
      </div>

      {mode === "split" ? (
        <div className="grid grid-cols-2 gap-2">
          <PoseCanvas {...common} mode="yours" label="Your form" accent="#f87171" />
          <PoseCanvas {...common} mode="corrected" label="Corrected" accent="#a3e635" />
        </div>
      ) : (
        <PoseCanvas {...common} mode="overlay" label="Yours vs corrected" accent="#a3e635" />
      )}

      <div className="flex items-center gap-3 mt-2.5 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <i className="w-4 h-0.5 rounded-full inline-block" style={{ background: "#f87171" }} /> Yours
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-4 h-0.5 rounded-full inline-block" style={{ background: "#a3e635" }} /> Target
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-4 h-0.5 rounded-full inline-block" style={{ background: "#fbbf24" }} /> Move this way
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {applied.map((a) => (
          <div key={a.joint} className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">{JOINT_LABEL[a.joint] || a.joint}</span>
              <span className="flex items-center gap-1.5 text-sm font-mono">
                <span className="text-rose-400">{a.from}°</span>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
                <span className="text-lime-400 font-bold">{a.to}°</span>
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  a.deltaDeg > 0 ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {a.deltaDeg > 0 ? `open ${a.deltaDeg}°` : `close ${Math.abs(a.deltaDeg)}°`}
              </span>
            </div>
            {a.why && <p className="text-[12px] text-zinc-400 mt-1.5 leading-relaxed">{a.why}</p>}
          </div>
        ))}
      </div>

      <p className="flex gap-1.5 text-[11px] text-zinc-500 mt-3 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Measured from a single frame in 2D, so a joint angled away from the camera can read
          low. This shows the target for one joint at a time — not a whole new posture.
        </span>
      </p>
    </div>
  );
}
