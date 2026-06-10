import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Map as MapIcon, Footprints } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * CourtMapCard — elite spatial layer for universal analyses.
 *
 * Takes the Gemini-tracked court geometry (`court_map.corners`, 4 frame-space
 * points ordered far-left, far-right, near-right, near-left) and computes a
 * proper homography to a top-down court, then plots where the player was
 * standing at every shot (colored by intent) with direction arrows derived
 * from the tracked ball trajectory. Movement stats (distance covered, court
 * coverage, recovery quality) render as chips below the map.
 *
 * All Gemini coordinates are normalized 0-1000 to the video frame.
 */

// Real playing-surface aspect ratios (width : length) per court type.
const COURT_ASPECT = {
  badminton_court: 6.1 / 13.4,
  tennis_court: 10.97 / 23.77,
  tt_table: 1.525 / 2.74,
  pickleball_court: 6.1 / 13.41,
  basketball_court: 15 / 28,
  generic: 1 / 2,
};

const INTENT_COLOR = {
  attacking: "#fb7185", // rose-400
  defensive: "#38bdf8", // sky-400
  neutral: "#a1a1aa",   // zinc-400
};

/**
 * Solve the homography H mapping 4 source points to 4 destination points
 * (direct linear transform, Gaussian elimination on the 8x8 system).
 * Returns a function (x, y) -> [X, Y], or null if degenerate.
 */
function computeHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-9) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const h = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * h[c];
    h[r] = s / A[r][r];
  }
  return (x, y) => {
    const w = h[6] * x + h[7] * y + 1;
    if (Math.abs(w) < 1e-9) return null;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  };
}

export default function CourtMapCard({ courtMap, movement, shots }) {
  const canvasRef = useRef(null);
  // Projected dot positions (canvas px) + their timestamps, for tap-to-seek.
  const dotHitsRef = useRef([]);

  const spatialShots = useMemo(
    () => (shots || []).filter((s) => Array.isArray(s.player_position) && s.player_position.length === 2),
    [shots],
  );

  // Low-movement collapse: a stationary drill (all positions clustered,
  // tiny distance covered) renders as one lonely dot on an empty court —
  // it reads as "the app barely saw me". Show the stats + note instead;
  // the map earns its space on rally/match clips with real movement.
  const lowMovement = useMemo(() => {
    if (spatialShots.length === 0) return true;
    if (typeof movement?.distance_covered_m === "number" && movement.distance_covered_m >= 5) return false;
    const xs = spatialShots.map((s) => s.player_position[0]);
    const ys = spatialShots.map((s) => s.player_position[1]);
    const spread = Math.hypot(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    );
    // <8% of the frame diagonal of spread AND <5m covered = stationary drill.
    return spread < 80 && (movement?.distance_covered_m == null || movement.distance_covered_m < 5);
  }, [spatialShots, movement]);

  const hasMap = courtMap && Array.isArray(courtMap.corners) && courtMap.corners.length === 4
    && spatialShots.length > 0 && !lowMovement;
  const hasMovement = movement && (movement.distance_covered_m || movement.court_coverage_pct || movement.avg_recovery_quality || movement.note);

  // Tap a dot → jump the main player to that shot (same event the
  // "tap to jump" pro panel uses).
  const onCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || dotHitsRef.current.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = null, bestD = 16; // 16px tap tolerance
    for (const hit of dotHitsRef.current) {
      const d = Math.hypot(hit.x - x, hit.y - y);
      if (d < bestD) { bestD = d; best = hit; }
    }
    if (best && typeof best.t === "number") {
      window.dispatchEvent(new CustomEvent("playsmart:seek", { detail: { time: best.t } }));
      const v = document.querySelector("video[data-playsmart-clip]");
      if (v) { try { v.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {} }
    }
  };

  useEffect(() => {
    if (!hasMap) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const aspect = COURT_ASPECT[courtMap.type] || COURT_ASPECT.generic;
    const H = 240; // court length on screen (vertical, far → near)
    const W = Math.max(80, Math.round(H * aspect));
    const PAD = 26;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = (W + PAD * 2) * dpr;
    canvas.height = (H + PAD * 2) * dpr;
    canvas.style.width = `${W + PAD * 2}px`;
    canvas.style.height = `${H + PAD * 2}px`;
    ctx.scale(dpr, dpr);

    // Homography: frame coords (0-1000) → top-down court rect.
    // corners ordered [far-left, far-right, near-right, near-left]
    const dst = [[PAD, PAD], [PAD + W, PAD], [PAD + W, PAD + H], [PAD, PAD + H]];
    const project = computeHomography(courtMap.corners, dst);
    if (!project) return;

    // ── Court surface + markings ──
    ctx.clearRect(0, 0, W + PAD * 2, H + PAD * 2);
    ctx.fillStyle = "rgba(20, 83, 45, 0.25)"; // faint green surface
    ctx.fillRect(PAD, PAD, W, H);
    ctx.strokeStyle = "rgba(244, 244, 245, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(PAD, PAD, W, H);
    // Net / halfway line
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + H / 2);
    ctx.lineTo(PAD + W, PAD + H / 2);
    ctx.strokeStyle = "rgba(248, 250, 252, 0.8)";
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Light service-area guides (generic, quarter lines)
    ctx.strokeStyle = "rgba(244, 244, 245, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + H * 0.25); ctx.lineTo(PAD + W, PAD + H * 0.25);
    ctx.moveTo(PAD, PAD + H * 0.75); ctx.lineTo(PAD + W, PAD + H * 0.75);
    ctx.moveTo(PAD + W / 2, PAD); ctx.lineTo(PAD + W / 2, PAD + H);
    ctx.stroke();
    ctx.fillStyle = "rgba(161, 161, 170, 0.8)";
    ctx.font = "9px sans-serif";
    ctx.fillText("NET", PAD + W + 4, PAD + H / 2 + 3);

    const clampPt = (p) => p && [
      Math.max(PAD - 14, Math.min(PAD + W + 14, p[0])),
      Math.max(PAD - 14, Math.min(PAD + H + 14, p[1])),
    ];

    // ── Heat underlay: soft radial blobs at every position ──
    for (const s of spatialShots) {
      const p = clampPt(project(s.player_position[0], s.player_position[1]));
      if (!p) continue;
      const g = ctx.createRadialGradient(p[0], p[1], 2, p[0], p[1], 22);
      g.addColorStop(0, "rgba(163, 230, 53, 0.30)");
      g.addColorStop(1, "rgba(163, 230, 53, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 22, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Shot-direction arrows from ball trajectories ──
    for (const s of spatialShots) {
      const traj = s.ball_trajectory;
      if (!Array.isArray(traj) || traj.length < 2) continue;
      const a = clampPt(project(traj[0][1], traj[0][2]));
      const b = clampPt(project(traj[traj.length - 1][1], traj[traj.length - 1][2]));
      if (!a || !b) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 6) continue;
      ctx.strokeStyle = "rgba(250, 204, 21, 0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      // Arrowhead
      const ang = Math.atan2(dy, dx);
      ctx.fillStyle = "rgba(250, 204, 21, 0.7)";
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - 6 * Math.cos(ang - 0.45), b[1] - 6 * Math.sin(ang - 0.45));
      ctx.lineTo(b[0] - 6 * Math.cos(ang + 0.45), b[1] - 6 * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    }

    // ── Numbered position markers, colored by intent ──
    dotHitsRef.current = [];
    spatialShots.forEach((s, i) => {
      const p = clampPt(project(s.player_position[0], s.player_position[1]));
      if (!p) return;
      dotHitsRef.current.push({ x: p[0], y: p[1], t: s.timestamp ?? s.timestamp_sec ?? null });
      ctx.fillStyle = INTENT_COLOR[s.intent] || INTENT_COLOR.neutral;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(9, 9, 11, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#09090b";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), p[0], p[1] + 0.5);
    });
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }, [hasMap, courtMap, spatialShots]);

  if (!hasMap && !hasMovement) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1.5">
          <MapIcon className="w-3.5 h-3.5 text-lime-400" /> Court positioning &amp; movement
        </p>
        {hasMap && typeof courtMap.confidence === "number" && (
          <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[10px]">
            map confidence {Math.round(courtMap.confidence * 100)}%
          </Badge>
        )}
      </div>

      {hasMap && (
        <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className="rounded-lg bg-zinc-950/60 border border-zinc-800/70 cursor-pointer"
            title="Tap a dot to jump to that shot in the video"
          />
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-3 flex-wrap mb-3 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: INTENT_COLOR.attacking }} /> attacking
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: INTENT_COLOR.defensive }} /> defensive
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: INTENT_COLOR.neutral }} /> neutral
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 inline-block" style={{ background: "rgba(250, 204, 21, 0.7)" }} /> shot direction
              </span>
            </div>
            <p className="text-[12px] text-zinc-400 leading-relaxed">
              Numbered dots show where you were standing at each shot, mapped
              top-down from the camera view. Bright zones are where you played
              from most. <span className="text-sky-300">Tap a dot to jump to
              that shot in the video.</span>
            </p>
            {hasMovement && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {typeof movement.distance_covered_m === "number" && (
                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">Distance covered</p>
                    <p className="text-base font-bold text-lime-400">{movement.distance_covered_m < 10 ? movement.distance_covered_m.toFixed(1) : movement.distance_covered_m.toFixed(0)} m</p>
                  </div>
                )}
                {typeof movement.court_coverage_pct === "number" && (
                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">Court coverage</p>
                    <p className="text-base font-bold text-sky-400">{movement.court_coverage_pct.toFixed(0)}%</p>
                  </div>
                )}
                {movement.avg_recovery_quality && (
                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2.5 col-span-2">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">Recovery to base</p>
                    <p className="text-sm font-semibold text-white capitalize">{movement.avg_recovery_quality}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!hasMap && hasMovement && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {typeof movement.distance_covered_m === "number" && (
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">Distance covered</p>
              <p className="text-base font-bold text-lime-400">{movement.distance_covered_m.toFixed(0)} m</p>
            </div>
          )}
          {typeof movement.court_coverage_pct === "number" && (
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">Court coverage</p>
              <p className="text-base font-bold text-sky-400">{movement.court_coverage_pct.toFixed(0)}%</p>
            </div>
          )}
          {movement.avg_recovery_quality && (
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">Recovery to base</p>
              <p className="text-sm font-semibold text-white capitalize">{movement.avg_recovery_quality}</p>
            </div>
          )}
        </div>
      )}

      {movement?.note && (
        <p className="text-[12px] text-zinc-400 leading-relaxed mt-3 flex items-start gap-1.5">
          <Footprints className="w-3.5 h-3.5 text-lime-400 mt-0.5 shrink-0" />
          <span>{movement.note}</span>
        </p>
      )}
    </motion.section>
  );
}
