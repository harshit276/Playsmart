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

// Scroll the document so the target's top sits ~8px below the sticky
// QuickNav bar. Computing the offset manually (instead of using
// `scrollIntoView`) avoids two known issues:
//   1. scrollIntoView with block:"start" lands the target UNDER the
//      sticky bar (because the bar is rendered at top:2 in document
//      flow, the browser doesn't know to offset).
//   2. Some browsers cascade scrollIntoView up to ancestors, which
//      caused the page to scroll BACK to the top whenever the pill
//      row tried to bring an active chip into view.
function jumpToSection(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  // Approximate sticky-nav height (rail + padding) — we shift the
  // target down that much so it doesn't land under the bar.
  const stickyOffset = 64;
  const target = window.scrollY + rect.top - stickyOffset;
  window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  return true;
}

export default function AnalysisQuickNav({ sections = [] }) {
  const items = useMemo(() => sections.filter((s) => s && s.id), [sections]);
  const [activeId, setActiveId] = useState(null);
  // Track which targets actually exist in the DOM. We filter the
  // visible chip list by this set so the user only sees sections they
  // can actually navigate to (otherwise clicks on missing targets
  // silently no-op and the UI looks broken).
  const [presentIds, setPresentIds] = useState(() => new Set());
  // Lock the active-state observer briefly after a user click. Without
  // this, the IO would re-flag the previously-active section as active
  // mid-scroll and the chip animation would jitter back and forth.
  const userClickLockRef = useRef(0);
  const ratiosRef = useRef(new Map());
  const railRef = useRef(null);

  // Walk the items list and record which ones have a matching DOM
  // node right now. We poll on mount + on each Mutation since some
  // sections (e.g. MatchInsights' per-shot block) only render once
  // their Gemini data arrives. Filtering by this set keeps clicks
  // honest — no dead chips that scroll nowhere.
  useEffect(() => {
    if (items.length === 0) return undefined;
    const recompute = () => {
      const next = new Set();
      for (const s of items) {
        if (document.getElementById(s.id)) next.add(s.id);
      }
      setPresentIds((prev) => {
        if (prev.size === next.size) {
          let same = true;
          for (const id of next) if (!prev.has(id)) { same = false; break; }
          if (same) return prev;
        }
        return next;
      });
    };
    recompute();
    const delayed = setTimeout(recompute, 600);
    const mo = new MutationObserver(recompute);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      clearTimeout(delayed);
      mo.disconnect();
    };
  }, [items]);

  const visibleItems = useMemo(
    () => items.filter((s) => presentIds.has(s.id)),
    [items, presentIds],
  );

  // Active-state detection. Skips updates briefly after a user click
  // so the smooth-scroll target isn't immediately overridden by the
  // section the page is passing through mid-scroll.
  useEffect(() => {
    if (visibleItems.length === 0) return undefined;
    ratiosRef.current = new Map();

    const cb = (entries) => {
      // Honor the post-click lock — during smooth-scroll, the IO
      // would otherwise flip the active id to whichever section is
      // currently mid-viewport, causing the chip animation to bounce.
      if (Date.now() < userClickLockRef.current) return;
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
        if (!presentIds.has(id)) continue;
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
    for (const s of visibleItems) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [visibleItems, presentIds]);

  // Auto-scroll the pill row so the active chip is visible. We use
  // direct scrollLeft assignment on the rail container — NOT
  // scrollIntoView, which on some browsers cascades to the document
  // and pulls the whole page back to the top (since the pill row is
  // sticky at the top). The previous version used scrollIntoView and
  // users reported the page kept jumping back to the top.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !activeId) return;
    const active = rail.querySelector(`[data-qn-id="${activeId}"]`);
    if (!active) return;
    const railRect = rail.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const offset = activeRect.left - railRect.left + rail.scrollLeft
      - (rail.clientWidth - activeRect.width) / 2;
    try {
      rail.scrollTo({ left: Math.max(0, offset), behavior: "smooth" });
    } catch {
      // Older browsers without smooth ScrollToOptions support.
      rail.scrollLeft = Math.max(0, offset);
    }
  }, [activeId]);

  const handleClick = useCallback((id) => {
    if (!id) return;
    // Lock the IO from overriding active state during the smooth-scroll.
    // 800ms covers most browsers' smooth-scroll animation duration.
    userClickLockRef.current = Date.now() + 800;
    setActiveId(id);
    jumpToSection(id);
  }, []);

  if (visibleItems.length === 0) return null;

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
        {visibleItems.map((s) => {
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
