// Floating analyze-page section nav.
//
// - Desktop / tablet (>=md): vertical rail pinned to the right side at
//   ~30% from the top. Each item is an icon + label pill. Hover/active
//   pop the label out. Active item is highlighted with a Framer Motion
//   layoutId-driven background so the highlight slides smoothly between
//   sections as the user scrolls.
//
// - Mobile (<md): a single floating pill at the bottom showing the
//   current section. Tap to expand a bottom-sheet listing every section,
//   tap any item to jump.
//
// Active-section detection uses IntersectionObserver (NOT scroll-event
// polling) per the spec. Each provided `section.id` is observed; the
// active id is the one whose intersection ratio is highest (with a tie
// break favoring whichever is closer to the top of the viewport).
//
// Smooth scroll is plain `el.scrollIntoView({ behavior: "smooth",
// block: "start" })` — no math, plays well with sticky headers.
//
// Sections that aren't currently rendered (the spec calls out cases like
// "no pro reference for any shot type") are filtered out by the parent
// before being passed in. We additionally guard at runtime: any id that
// can't be found in the DOM at observer-setup time is skipped so we
// never render a broken link.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, List, X } from "lucide-react";

// Force scroll-into-view ignoring intermittent hover/focus states.
function smoothScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

export default function AnalysisScroller({ sections = [] }) {
  // Filter to only sections that actually mounted in the DOM. We re-run
  // the check whenever the sections prop reference changes AND on a
  // delayed pass (because some sections — e.g. MatchInsights' per-shot
  // panel — only render after Gemini's per-shot data arrives). The
  // setTimeout/MutationObserver combo keeps the rail in sync without
  // ever polling scroll events.
  const [presentIds, setPresentIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const observerRef = useRef(null);
  const ratiosRef = useRef(new Map());

  // Stable list of ids we'd like to observe — drop sections without an id.
  const wantedIds = useMemo(
    () => sections.filter((s) => s && s.id).map((s) => s.id),
    [sections],
  );

  // Detect which sections are mounted. Runs on every layout-affecting
  // change (sections prop, DOM mutations under document.body).
  useEffect(() => {
    if (wantedIds.length === 0) return;

    const recompute = () => {
      const next = new Set();
      for (const id of wantedIds) {
        if (document.getElementById(id)) next.add(id);
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
    // Late-mounting sections (e.g. MatchInsights' per-shot data finishing).
    const delayed = setTimeout(recompute, 600);
    const mo = new MutationObserver(recompute);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(delayed);
      mo.disconnect();
    };
  }, [wantedIds]);

  // Set up the IntersectionObserver against the present sections.
  useEffect(() => {
    if (presentIds.size === 0) return;
    ratiosRef.current = new Map();

    const cb = (entries) => {
      const ratios = ratiosRef.current;
      for (const entry of entries) {
        ratios.set(entry.target.id, {
          ratio: entry.intersectionRatio,
          top: entry.boundingClientRect.top,
        });
      }
      // Best = highest ratio; ties broken by smallest absolute top.
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

    // Observe each section. rootMargin biases towards the upper-middle of
    // the viewport so a section is considered "active" as soon as its
    // header crosses ~25% of the screen — feels right without being
    // jumpy.
    const io = new IntersectionObserver(cb, {
      rootMargin: "-20% 0px -55% 0px",
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    });
    observerRef.current = io;

    for (const id of presentIds) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [presentIds]);

  // The visible items list. We deliberately show ALL provided sections
  // even before the DOM-presence check finishes — the click handler
  // already guards against missing targets via document.getElementById,
  // and the IntersectionObserver only highlights ids that are present.
  // The previous version returned null while presentIds was empty,
  // which on slow renders meant the rail never appeared at all.
  const items = useMemo(
    () => sections.filter((s) => s && s.id),
    [sections],
  );

  // Subset of items whose DOM target exists — used for the active-state
  // highlight and the empty/loading copy below.
  const itemsPresent = useMemo(
    () => items.filter((s) => presentIds.has(s.id)),
    [items, presentIds],
  );

  // First-mount default: pick the first present section if nothing active.
  useEffect(() => {
    if (!activeId && itemsPresent.length > 0) setActiveId(itemsPresent[0].id);
  }, [itemsPresent, activeId]);

  const handleJump = useCallback((id) => {
    if (!id) return;
    setActiveId(id); // optimistic — the observer corrects if user scrolls past
    setSheetOpen(false);
    smoothScrollTo(id);
  }, []);

  // Hard guard — only hide if literally zero sections were passed in.
  if (items.length === 0) return null;

  const activeItem = items.find((s) => s.id === activeId) || items[0];

  return (
    <>
      {/* ────────────────────────────────────────────────────────────
         Desktop / tablet rail (>=md)
         ──────────────────────────────────────────────────────────── */}
      <nav
        aria-label="Analysis sections"
        className="hidden md:flex fixed right-3 lg:right-5 top-[28%] z-40 max-h-[70vh] overflow-y-auto pr-1"
      >
        <ul className="flex flex-col gap-1 bg-zinc-900/85 backdrop-blur-md border border-zinc-800 rounded-2xl p-1.5 shadow-xl">
          {items.map((s) => {
            const Icon = s.icon;
            const isActive = s.id === activeId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => handleJump(s.id)}
                  className={`group relative flex items-center gap-2 rounded-xl px-2 py-2 min-h-[44px] w-full text-left transition-colors ${
                    isActive
                      ? "text-lime-300"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                  aria-current={isActive ? "true" : undefined}
                >
                  {isActive && (
                    <motion.span
                      layoutId="analysis-scroller-active-pill"
                      transition={{ type: "spring", stiffness: 320, damping: 28 }}
                      className="absolute inset-0 rounded-xl bg-zinc-800/80 border border-lime-400/30"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive
                          ? "bg-lime-400/15 border border-lime-400/40"
                          : "bg-zinc-800/60 border border-zinc-700/60 group-hover:border-zinc-600"
                      }`}
                    >
                      {Icon ? (
                        <Icon className={`w-3.5 h-3.5 ${isActive ? "text-lime-300" : "text-zinc-400"}`} />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                      )}
                    </span>
                    <span
                      className={`hidden lg:inline text-[11px] font-medium whitespace-nowrap pr-1 ${
                        isActive ? "text-lime-300" : "text-zinc-300"
                      }`}
                    >
                      {s.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ────────────────────────────────────────────────────────────
         Mobile pill + bottom-sheet (<md)
         ──────────────────────────────────────────────────────────── */}
      <div className="md:hidden fixed left-1/2 -translate-x-1/2 bottom-4 z-40 pointer-events-none">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="pointer-events-auto flex items-center gap-2 bg-zinc-900/95 backdrop-blur-md border border-lime-400/30 rounded-full pl-2 pr-3 py-2 min-h-[44px] shadow-xl text-lime-300 text-xs font-semibold"
          aria-label="Open analysis sections"
        >
          <span className="w-7 h-7 rounded-full bg-lime-400/15 border border-lime-400/40 flex items-center justify-center">
            {activeItem.icon ? (
              <activeItem.icon className="w-3.5 h-3.5 text-lime-300" />
            ) : (
              <List className="w-3.5 h-3.5 text-lime-300" />
            )}
          </span>
          <span className="max-w-[40vw] truncate">{activeItem.label}</span>
          <ChevronUp className="w-3.5 h-3.5 text-lime-300/80" />
        </button>
      </div>

      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            key="analysis-scroller-sheet"
            className="md:hidden fixed inset-0 z-50 flex flex-col justify-end"
            initial={{ backgroundColor: "rgba(0,0,0,0)" }}
            animate={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            exit={{ backgroundColor: "rgba(0,0,0,0)" }}
            transition={{ duration: 0.18 }}
            onClick={() => setSheetOpen(false)}
            aria-modal="true"
            role="dialog"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
              className="bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
                  Jump to section
                </p>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ul className="flex flex-col gap-1">
                {items.map((s) => {
                  const Icon = s.icon;
                  const isActive = s.id === activeId;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => handleJump(s.id)}
                        className={`relative w-full text-left flex items-center gap-3 rounded-xl px-3 py-3 min-h-[44px] transition-colors ${
                          isActive
                            ? "text-lime-300"
                            : "text-zinc-200 hover:bg-zinc-800/60"
                        }`}
                        aria-current={isActive ? "true" : undefined}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="analysis-scroller-active-pill-mobile"
                            transition={{ type: "spring", stiffness: 320, damping: 28 }}
                            className="absolute inset-0 rounded-xl bg-zinc-800/80 border border-lime-400/30"
                          />
                        )}
                        <span
                          className={`relative z-10 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isActive
                              ? "bg-lime-400/15 border border-lime-400/40"
                              : "bg-zinc-800/60 border border-zinc-700/60"
                          }`}
                        >
                          {Icon ? (
                            <Icon className={`w-4 h-4 ${isActive ? "text-lime-300" : "text-zinc-400"}`} />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                          )}
                        </span>
                        <span className="relative z-10 text-sm font-medium">
                          {s.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
