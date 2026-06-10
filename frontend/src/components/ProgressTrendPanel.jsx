import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";

/**
 * YOUR PROGRESS panel — session-to-session trend tracking.
 *
 * Calls GET /analyses/trend?sport=...&shot_type=... after the analysis
 * result renders and shows 2-3 headline deltas + a sparkline + an
 * honest rule-based takeaway. Hides itself silently on network errors
 * so it never breaks the analysis page.
 *
 * Props:
 *   sport       — required, e.g. "table_tennis"
 *   shotType    — optional, dominant shot from current analysis
 *   currentId   — current analysis id; component refetches when it changes
 */
export default function ProgressTrendPanel({ sport, shotType, currentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!sport) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrored(false);

    const params = { sport, limit: 10 };
    if (shotType) params.shot_type = shotType;

    api
      .get("/analyses/trend", { params })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
      })
      .catch(() => {
        if (cancelled) return;
        setErrored(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sport, shotType, currentId]);

  if (loading) {
    return (
      <div className="border border-zinc-800 bg-zinc-900/40 rounded-2xl p-4 animate-pulse">
        <div className="h-3 w-32 bg-zinc-800 rounded mb-3" />
        <div className="h-12 w-full bg-zinc-800/60 rounded" />
      </div>
    );
  }

  if (errored || !data) return null;

  const history = Array.isArray(data.history) ? data.history : [];
  // No history at all — backend already gave us a takeaway, but rendering
  // an empty panel is noise. Skip.
  if (history.length === 0) return null;

  const deltas = data.deltas || {};
  const takeaway = data.takeaway || "";
  const isFirstSession = history.length === 1;

  // Defensive trust gate: drop degenerate blocks the backend may still
  // emit from old saved analyses — a pinned "100 → 100" (both values at
  // the metric ceiling, zero delta) reads as a fake stat and erodes
  // trust in every number around it. Real flat trends (e.g. 64 → 64)
  // still render.
  const _isDegenerate = (b) =>
    !b
    || (b.delta === 0 && b.current === 100 && b.prev_avg === 100)
    || (b.delta === 0 && b.current === 0 && b.prev_avg === 0);
  for (const k of Object.keys(deltas)) {
    if (k.endsWith("_delta") && _isDegenerate(deltas[k])) delete deltas[k];
  }

  // Pick up to 3 headline deltas in priority order. Each block from the
  // backend looks like {current, prev_avg, delta, trend, over_sessions}.
  const headlineDeltas = [];
  if (deltas.consistency_delta) {
    headlineDeltas.push({
      label: "Consistency",
      block: deltas.consistency_delta,
      unit: "",
    });
  }
  if (deltas.score_delta) {
    headlineDeltas.push({
      label: "Shot Score",
      block: deltas.score_delta,
      unit: "",
    });
  }
  if (deltas.tempo_delta) {
    headlineDeltas.push({
      label: "Tempo",
      block: deltas.tempo_delta,
      unit: " /min",
    });
  }
  if (headlineDeltas.length < 3 && deltas.best_shot_quality_delta) {
    headlineDeltas.push({
      label: "Best Shot",
      block: deltas.best_shot_quality_delta,
      unit: "",
    });
  }
  const visibleDeltas = headlineDeltas.slice(0, 3);

  const skill = deltas.skill_progression;

  // Sparkline data — pick the most relevant metric available across
  // the history window. Try consistency first, then score, then tempo.
  const sparkSeries = (() => {
    for (const key of ["consistency", "score", "tempo", "best_shot_quality"]) {
      const vals = history
        .slice()
        .reverse() // chronological for the eye
        .map((h) => h.metrics?.[key])
        .filter((v) => typeof v === "number");
      if (vals.length >= 1) return { key, vals };
    }
    return null;
  })();

  const sparkLabel =
    sparkSeries &&
    {
      consistency: "Consistency trend",
      score: "Score trend",
      tempo: "Tempo trend",
      best_shot_quality: "Best-shot trend",
    }[sparkSeries.key];

  const shotTypeDisplay = (shotType || data.shot_type || "")
    .toString()
    .replace(/_/g, " ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-2 border-lime-400/30 bg-gradient-to-br from-lime-400/5 to-zinc-900/80 rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-lime-400" />
          <p className="text-[11px] uppercase tracking-wide text-lime-300 font-bold">
            Your Progress
          </p>
          {isFirstSession ? (
            <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 text-[10px]">
              Baseline
            </Badge>
          ) : (
            <Badge className="bg-lime-400/15 text-lime-300 border-lime-400/30 text-[10px]">
              {history.length} sessions
            </Badge>
          )}
        </div>
        {shotTypeDisplay && (
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            {shotTypeDisplay} · {data.sport?.replace(/_/g, " ") || ""}
          </p>
        )}
      </div>

      {/* Skill progression banner — shown when the user has leveled up
          across the window. Most motivating signal so it gets top billing. */}
      {skill && skill.improved && skill.first !== skill.latest && (
        <div className="mb-3 bg-lime-400/10 border border-lime-400/30 rounded-lg px-3 py-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-lime-400 shrink-0" />
          <p className="text-sm text-lime-100">
            Skill level:{" "}
            <span className="font-semibold">{skill.first}</span>
            <span className="text-zinc-500 mx-1">→</span>
            <span className="font-bold text-lime-300">{skill.latest}</span>
          </p>
        </div>
      )}

      {/* Headline delta tiles */}
      {visibleDeltas.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          {visibleDeltas.map((d, i) => (
            <DeltaTile key={`d-${i}`} label={d.label} block={d.block} unit={d.unit} />
          ))}
        </div>
      ) : (
        // First-session / no comparable deltas — show baseline numbers
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          {history[0]?.metrics?.consistency != null && (
            <BaselineTile label="Consistency" value={history[0].metrics.consistency} />
          )}
          {history[0]?.metrics?.score != null && (
            <BaselineTile label="Shot Score" value={history[0].metrics.score} />
          )}
          {history[0]?.metrics?.tempo != null && (
            <BaselineTile label="Tempo" value={history[0].metrics.tempo} unit=" /min" />
          )}
        </div>
      )}

      {/* Sparkline */}
      {sparkSeries && sparkSeries.vals.length >= 2 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
            {sparkLabel}
          </p>
          <Sparkline values={sparkSeries.vals} />
        </div>
      )}

      {/* Inline 5-dot fallback when there's only one data point */}
      {sparkSeries && sparkSeries.vals.length === 1 && (
        <div className="mb-3 flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={`dot-${i}`}
              className={`w-2 h-2 rounded-full ${
                i === 0 ? "bg-lime-400" : "bg-zinc-700"
              }`}
            />
          ))}
          <span className="text-[10px] text-zinc-500 ml-2">
            One down, four to fill in
          </span>
        </div>
      )}

      {/* Honest 1-sentence takeaway */}
      {takeaway && (
        <p className="text-sm text-zinc-200 italic leading-relaxed">
          "{takeaway}"
        </p>
      )}
    </motion.div>
  );
}

function trendColor(trend) {
  if (trend === "up") return "text-lime-400";
  if (trend === "down") return "text-rose-400";
  return "text-sky-300";
}

function TrendIcon({ trend, className = "w-3.5 h-3.5" }) {
  if (trend === "up") return <TrendingUp className={`${className} text-lime-400`} />;
  if (trend === "down") return <TrendingDown className={`${className} text-rose-400`} />;
  return <Minus className={`${className} text-sky-300`} />;
}

function DeltaTile({ label, block, unit = "" }) {
  if (!block) return null;
  const { current, prev_avg, delta, trend, over_sessions } = block;
  const sign = delta > 0 ? "+" : "";
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
        <TrendIcon trend={trend} />
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-lg font-bold text-white">
          {fmtNum(prev_avg)}
          <span className="text-zinc-600 mx-1">→</span>
          {fmtNum(current)}
          {unit && <span className="text-xs text-zinc-500 ml-0.5">{unit}</span>}
        </p>
      </div>
      <p className={`text-xs font-semibold ${trendColor(trend)}`}>
        {sign}
        {fmtNum(delta)}
        <span className="text-zinc-500 font-normal ml-1">
          over {over_sessions} session{over_sessions === 1 ? "" : "s"}
        </span>
      </p>
    </div>
  );
}

function BaselineTile({ label, value, unit = "" }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-white">
        {fmtNum(value)}
        {unit && <span className="text-xs text-zinc-500 ml-0.5">{unit}</span>}
      </p>
      <p className="text-[11px] text-zinc-500">This is your baseline</p>
    </div>
  );
}

function fmtNum(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 100) return Math.round(v);
  return Math.round(v * 10) / 10;
}

/**
 * Tiny inline SVG sparkline — no dependency on recharts.
 * Color reflects the slope: up = lime, down = rose, flat = sky.
 */
function Sparkline({ values, width = 320, height = 48 }) {
  if (!values || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const padX = 4;
  const padY = 6;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const points = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * chartW;
    const y = padY + chartH - ((v - min) / range) * chartH;
    return [x, y];
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  const slope = values[values.length - 1] - values[0];
  const stroke = slope > 0.5 ? "#a3e635" : slope < -0.5 ? "#fb7185" : "#7dd3fc";
  const fill =
    slope > 0.5
      ? "rgba(163,230,53,0.12)"
      : slope < -0.5
      ? "rgba(251,113,133,0.12)"
      : "rgba(125,211,252,0.12)";

  // Build area fill path
  const areaPath = `${path} L ${points[points.length - 1][0].toFixed(1)} ${(
    padY + chartH
  ).toFixed(1)} L ${points[0][0].toFixed(1)} ${(padY + chartH).toFixed(1)} Z`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block"
    >
      <path d={areaPath} fill={fill} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      {points.map(([x, y], i) => (
        <circle
          key={`p-${i}`}
          cx={x}
          cy={y}
          r={i === points.length - 1 ? 3 : 2}
          fill={i === points.length - 1 ? stroke : "#27272a"}
          stroke={stroke}
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}
