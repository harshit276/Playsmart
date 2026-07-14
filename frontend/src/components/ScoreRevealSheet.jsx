// ScoreRevealSheet — the post-analysis "reveal" moment.
//
// Replaces the flat "Your Coach Report is ready" modal with a bottom sheet
// that springs up, animates a half-circle gauge filling to the detected
// level (the number counts up over ~2.2s), surfaces 2–3 headline metrics
// (skill level, top speed if the sport has it, shots analysed), and offers
// the full-report download.
//
// The <ScoreGauge> is exported so the same animated arc can live inline on
// the results page (Performance Scores card) for a consistent visual.

import { useEffect, useState } from "react";
import { motion, AnimatePresence, animate } from "framer-motion";
import { Download, Zap, Gauge, Target, TrendingUp, X } from "lucide-react";

// Level → colour ramp (shared with the on-page performance card).
function levelColor(v) {
  if (v >= 7.5) return { stroke: "#a3e635", text: "text-lime-400", glow: "rgba(163,230,53,0.35)" };
  if (v >= 5) return { stroke: "#38bdf8", text: "text-sky-400", glow: "rgba(56,189,248,0.3)" };
  if (v >= 3) return { stroke: "#fbbf24", text: "text-amber-400", glow: "rgba(251,191,36,0.3)" };
  return { stroke: "#f87171", text: "text-red-400", glow: "rgba(248,113,113,0.3)" };
}

// A semicircular gauge that fills to `value` (0–max) and counts the number
// up in sync. `animateOnMount` drives the fill; pass a stable `runKey` to
// re-trigger the animation when the same component is reused for a new score.
export function ScoreGauge({
  value = 0,
  max = 10,
  size = 220,
  label = "Level",
  suffix = `/${max}`,
  decimals = 1,
  duration = 2.2,
  runKey = 0,
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const [display, setDisplay] = useState(0);
  const { stroke, text, glow } = levelColor((value / max) * 10);

  // Count-up. framer-motion's `animate` handles the easing + cleanup.
  useEffect(() => {
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
    // runKey lets a reused gauge replay for a fresh score.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, runKey]);

  const w = size;
  const h = size * 0.62;
  // Semicircle path (left→right, bulging up), radius 80 in a 200×110 canvas.
  const arc = "M 20 100 A 80 80 0 0 1 180 100";

  return (
    <div className="relative flex flex-col items-center" style={{ width: w }}>
      <svg viewBox="0 0 200 110" width={w} height={h} className="overflow-visible">
        {/* Track */}
        <path d={arc} fill="none" stroke="#27272a" strokeWidth="14" strokeLinecap="round" />
        {/* Value arc */}
        <motion.path
          d={arc}
          fill="none"
          stroke={stroke}
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: pct }}
          transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${glow})` }}
        />
      </svg>
      {/* Number, overlaid in the bowl of the arc */}
      <div className="absolute inset-x-0 top-[38%] flex flex-col items-center">
        <div className="flex items-baseline">
          <span className={`font-heading font-black tabular-nums ${text}`} style={{ fontSize: size * 0.2 }}>
            {display.toFixed(decimals)}
          </span>
          <span className="text-zinc-500 font-heading font-bold ml-0.5" style={{ fontSize: size * 0.075 }}>
            {suffix}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mt-0.5">{label}</span>
      </div>
    </div>
  );
}

// Derive the headline numbers from the analysis result.
function deriveMetrics(result) {
  if (!result) return { level: 0, skill: null, topSpeed: null, shots: 0, shotName: null };
  const ps = result.performance_scores || {};
  const rawScore = result.shot_analysis?.score ?? result.pro_comparison?.overall_score ?? null;
  let level = typeof ps.overall_score === "number" ? ps.overall_score : null;
  if (level == null && rawScore != null) level = rawScore > 10 ? rawScore / 10 : rawScore;
  if (level == null && Array.isArray(ps.dimension_list) && ps.dimension_list.length) {
    const avg = ps.dimension_list.reduce((a, d) => a + (d.score || 0), 0) / ps.dimension_list.length;
    level = avg;
  }
  level = Math.max(0, Math.min(10, Number(level) || 0));

  // Top speed across shots (km/h) — the "smash speed" moment when present.
  let topSpeed = null;
  const shots = Array.isArray(result.shots) ? result.shots : [];
  for (const s of shots) {
    const v = s?.speed?.estimated_speed_kmh ?? s?.speed_analysis?.estimated_speed_kmh;
    if (typeof v === "number" && v > 0) topSpeed = Math.max(topSpeed || 0, v);
  }
  const rootSpeed = result.speed_analysis?.estimated_speed_kmh;
  if (typeof rootSpeed === "number" && rootSpeed > 0) topSpeed = Math.max(topSpeed || 0, rootSpeed);

  return {
    level,
    skill: result.skill_level || result.overall_skill_level || null,
    topSpeed: topSpeed ? Math.round(topSpeed) : null,
    shots: shots.length,
    shotName: result.shot_analysis?.shot_name || null,
  };
}

function MetricChip({ icon: Icon, label, value, accent = "text-white" }) {
  return (
    <div className="flex-1 min-w-[92px] bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2.5 text-center">
      <Icon className="w-4 h-4 text-zinc-500 mx-auto mb-1" strokeWidth={1.75} />
      <p className={`font-heading font-bold text-base leading-none ${accent}`}>{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mt-1">{label}</p>
    </div>
  );
}

export default function ScoreRevealSheet({ open, onClose, onDownload, result, isGuest }) {
  const m = deriveMetrics(result);
  const { text } = levelColor(m.level);

  return (
    <AnimatePresence>
      {open && result && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Sheet */}
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="relative w-full sm:max-w-md bg-gradient-to-b from-zinc-900 to-zinc-950 border-t border-x border-lime-400/25 rounded-t-3xl px-5 pt-3 pb-6 sm:mb-3 sm:rounded-3xl sm:border shadow-2xl"
          >
            {/* Grab handle */}
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-700" />
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-zinc-800/70 text-zinc-400 hover:text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            <p className="text-center text-[10px] uppercase tracking-[0.2em] text-lime-400/80 font-bold mb-1">
              Analysis complete
            </p>

            {/* Gauge */}
            <div className="flex justify-center">
              <ScoreGauge value={m.level} runKey={open ? 1 : 0} size={210} label="Your level" />
            </div>

            {/* Verdict line */}
            <p className="text-center text-white font-heading font-bold text-lg -mt-1 capitalize">
              {m.skill || "Analyzed"}
              {m.shotName ? <span className="text-zinc-500 font-normal text-sm"> · {m.shotName}</span> : null}
            </p>

            {/* Metric chips */}
            <div className="flex gap-2 mt-4">
              {m.topSpeed ? (
                <MetricChip icon={Zap} label="Top speed" value={`${m.topSpeed}`} accent={text} />
              ) : (
                <MetricChip icon={Gauge} label="Level" value={m.level.toFixed(1)} accent={text} />
              )}
              <MetricChip icon={Target} label="Shots" value={m.shots || "—"} />
              <MetricChip icon={TrendingUp} label="Out of" value="10" />
            </div>
            {m.topSpeed ? (
              <p className="text-center text-[10px] text-zinc-500 mt-1.5">Top speed in km/h · estimated from your clip</p>
            ) : null}

            {/* CTAs */}
            <div className="flex flex-col gap-2 mt-5">
              <button
                onClick={onDownload}
                className="w-full h-12 rounded-full bg-lime-400 text-black font-bold flex items-center justify-center gap-2 hover:bg-lime-500 transition-colors"
              >
                <Download className="w-4 h-4" />
                {isGuest ? "Sign in for the full report" : "Download full report"}
              </button>
              <button
                onClick={onClose}
                className="w-full h-10 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                View full analysis
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
