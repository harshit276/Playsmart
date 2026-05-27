// AnalysisQuickNav — in-flow sticky table of contents for the analyze
// result page.
//
// Why this exists alongside `AnalysisScroller`:
//   The floating right-rail scroller is the premium experience, but a
//   meaningful fraction of users (DevTools docked right, narrow
//   viewports, browser extensions overlaying the corner) reported
//   never seeing it. This component is a fallback that lives IN the
//   document flow — it sticks to the top of the viewport when scrolled
//   past, so users always have a visible "X of Y sections · jump to →"
//   handle regardless of what's blocking the floating UI.
//
// Layout:
//   - Single horizontal scrollable pill row.
//   - Sticky at top: `sticky top-2 z-30` so it floats above the result
//     content but BELOW the global Navbar (which sits at top-0 z-40).
//   - Each section is a chip; tap to smooth-scroll.
//   - Active section auto-highlights as the user scrolls (same
//     IntersectionObserver pattern as AnalysisScroller, but the
//     in-flow version doesn't need the late-mount MutationObserver
//     guard since it's used right next to the content).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

function smoothScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

export default function AnalysisQuickNav({ sections = [] }) {
  const items = useMemo(() => sections.filter((s) => s && s.id), [sections]);
  const [activeId, setActiveId] = useState(null);
  const ratiosRef = useRef(new Map());
  const railRef = useRef(null);

  // Active-state detection — only observe ids that are actually in the
  // DOM right now. Re-runs when the items list changes.
  useEffect(() => {
    if (items.length === 0) return undefined;
    ratiosRef.current = new Map();

    const cb = (entries) => {
      const ratios = ratiosRef.current;
      for (const entry of entries) {
        ratios.set(entry.target.id, {
          ratio: entry.intersectionRatio,
          top: entry.boundingClientRect.top,
        });
      }
      let bestId = null;
      let bestRatio = 0;
      let bestTopAbs = Infinity;
      for (const [id, info] of ratios.entries()) {
        const r = info.ratio || 0;
        const topAbs = Math.abs(info.top || 0);
        if (r > bestRatio + 0.001) {
          bestRatio = r; bestTopAbs = topAbs; bestId = id;
        } else if (Math.abs(r - bestRatio) <= 0.001 && topAbs < bestTopAbs) {
          bestTopAbs = topAbs; bestId = id;
        }
      }
      if (bestId) setActiveId(bestId);
    };

    const io = new IntersectionObserver(cb, {
      rootMargin: "-20% 0px -55% 0px",
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    });
    for (const s of items) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [items]);

  // Auto-scroll the pill row so the active chip is always visible.
  useEffect(() => {
    if (!railRef.current || !activeId) return;
    const active = railRef.current.querySelector(`[data-qn-id="${activeId}"]`);
    if (active && typeof active.scrollIntoView === "function") {
      try {
        active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      } catch {}
    }
  }, [activeId]);

  const handleClick = useCallback((id) => {
    if (!id) return;
    setActiveId(id);
    smoothScrollTo(id);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="sticky top-2 z-30 -mx-1 mb-3 backdrop-blur-md bg-zinc-950/85 border border-zinc-800 rounded-xl px-2 py-1.5 shadow-lg shadow-black/30"
      aria-label="Jump to analysis section"
    >
      <div
        ref={railRef}
        className="flex gap-1.5 overflow-x-auto no-scrollbar"
        style={{ scrollbarWidth: "none" }}
      >
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold flex items-center gap-1 pl-1 pr-1 shrink-0 self-center">
          Jump to
          <ChevronRight className="w-3 h-3" />
        </p>
        {items.map((s) => {
          const Icon = s.icon;
          const isActive = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              data-qn-id={s.id}
              onClick={() => handleClick(s.id)}
              aria-current={isActive ? "true" : undefined}
              className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg min-h-[34px] whitespace-nowrap text-[11px] font-medium transition-colors shrink-0 ${
                isActive
                  ? "text-lime-300"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="analysis-quicknav-active"
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className="absolute inset-0 rounded-lg bg-lime-400/12 border border-lime-400/40"
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {Icon ? <Icon className="w-3 h-3" /> : null}
                <span>{s.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
