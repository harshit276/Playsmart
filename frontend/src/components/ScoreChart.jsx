import { motion } from "framer-motion";

/**
 * SVG Line Chart — lightweight, no dependencies.
 * Props:
 * - data: [{label, value}]
 * - width / height
 * - color: stroke color
 * - showDots: boolean
 * - showLabels: boolean
 * - showGrid: boolean
 */
export default function ScoreChart({
  data = [],
  width = 320,
  height = 160,
  color = "#bef264",
  fillColor = "rgba(190,242,100,0.1)",
  showDots = true,
  showLabels = true,
  showGrid = true,
  maxValue = 100,
  minValue = 0,
}) {
  if (data.length < 2) return null;

  const padding = { top: 10, right: 10, bottom: showLabels ? 28 : 10, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const range = maxValue - minValue || 1;

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - ((d.value - minValue) / range) * chartH,
    ...d,
  }));

  // Build SVG path
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${padding.top + chartH} L${points[0].x},${padding.top + chartH} Z`;

  // Grid lines (horizontal)
  const gridLines = showGrid ? [0.25, 0.5, 0.75].map(pct => ({
    y: padding.top + chartH * (1 - pct),
    label: Math.round(minValue + range * pct),
  })) : [];

  return (
    <motion.svg
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Grid lines */}
      {gridLines.map((g, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={g.y}
            x2={padding.left + chartW}
            y2={g.y}
            stroke="#27272a"
            strokeDasharray="4 4"
          />
          <text x={padding.left - 2} y={g.y - 4} fill="#52525b" fontSize="9" textAnchor="start">
            {g.label}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <motion.path
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        d={areaPath}
        fill={fillColor}
      />

      {/* Line */}
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {showDots && points.map((p, i) => (
        <motion.circle
          key={i}
          initial={{ r: 0 }}
          animate={{ r: i === points.length - 1 ? 5 : 3.5 }}
          transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
          cx={p.x}
          cy={p.y}
          fill={i === points.length - 1 ? color : "#18181b"}
          stroke={color}
          strokeWidth={2}
        />
      ))}

      {/* X-axis labels */}
      {showLabels && points.map((p, i) => (
        <text
          key={i}
          x={p.x}
          y={height - 4}
          fill="#71717a"
          fontSize="9"
          textAnchor="middle"
        >
          {p.label}
        </text>
      ))}
    </motion.svg>
  );
}

/**
 * ComparisonBars — Before/After comparison bars per dimension.
 * Props:
 * - dimensions: [{ label, firstValue, latestValue, maxValue }]
 */
export function ComparisonBars({ dimensions = [] }) {
  if (dimensions.length === 0) return null;

  return (
    <div className="space-y-3">
      {dimensions.map((dim, i) => {
        const max = dim.maxValue || 100;
        const firstPct = Math.min(100, (dim.firstValue / max) * 100);
        const latestPct = Math.min(100, (dim.latestValue / max) * 100);
        const improved = dim.latestValue > dim.firstValue;

        return (
          <motion.div
            key={dim.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-zinc-300">{dim.label}</span>
              <span className={`text-[10px] font-bold ${improved ? "text-lime-400" : dim.latestValue < dim.firstValue ? "text-red-400" : "text-zinc-500"}`}>
                {improved ? "+" : ""}{Math.round(dim.latestValue - dim.firstValue)}{dim.unit || ""}
              </span>
            </div>
            <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden">
              {/* First (background bar) */}
              <div
                className="absolute inset-y-0 left-0 bg-zinc-700 rounded-full"
                style={{ width: `${firstPct}%` }}
              />
              {/* Latest (foreground bar) */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${latestPct}%` }}
                transition={{ duration: 0.8, delay: 0.2 + i * 0.05 }}
                className={`absolute inset-y-0 left-0 rounded-full ${improved ? "bg-lime-400" : "bg-amber-400"}`}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[9px] text-zinc-600">First: {Math.round(dim.firstValue)}{dim.unit || ""}</span>
              <span className="text-[9px] text-zinc-500">Latest: {Math.round(dim.latestValue)}{dim.unit || ""}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * JourneyTimeline — Shows uploads, badges earned, improvements on a timeline.
 * Props:
 * - events: [{ type: "analysis"|"badge"|"milestone", date, title, subtitle, icon, color }]
 */
export function JourneyTimeline({ events = [] }) {
  if (events.length === 0) return null;

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-800" />

      <div className="space-y-3">
        {events.map((event, i) => (
          <motion.div
            key={`${event.type}-${i}`}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative pl-10"
          >
            <div className={`absolute left-2 top-2 w-5 h-5 rounded-full flex items-center justify-center ${
              event.type === "badge" ? "bg-amber-400" :
              event.type === "milestone" ? "bg-lime-400" :
              i === 0 ? "bg-lime-400" :
              "bg-zinc-800 border-2 border-zinc-700"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                event.type === "badge" || event.type === "milestone" || i === 0 ? "bg-black" : "bg-zinc-500"
              }`} />
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">{event.title}</p>
                <span className="text-[9px] text-zinc-600">
                  {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              {event.subtitle && <p className="text-xs text-zinc-500 mt-0.5">{event.subtitle}</p>}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
