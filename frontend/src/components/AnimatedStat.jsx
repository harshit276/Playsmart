// AnimatedStat — small shared animation primitives for "reveal" polish
// across the app (Progress, Training, Marketplace…).
//
// <AnimatedNumber> counts a value up from 0 the first time it scrolls into
// view, then holds. Cheap, dependency-free beyond framer-motion (already a
// core dep), and safe to sprinkle on any numeric stat.

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";

export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 1.4,
  prefix = "",
  suffix = "",
  format,
  className = "",
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return undefined;
    const target = Number(value) || 0;
    const controls = animate(0, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={className}>
      {format ? format(display) : `${prefix}${display.toFixed(decimals)}${suffix}`}
    </span>
  );
}

// Re-export the gauge from its home so callers can import both from one place.
export { ScoreGauge } from "@/components/ScoreRevealSheet";
