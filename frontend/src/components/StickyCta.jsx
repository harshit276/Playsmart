import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

/**
 * A bar pinned to the bottom of the home page on phones once the hero button has scrolled away, so the
 * next step is always one thumb-tap away instead of a scroll back up. It steps aside when the final call
 * to action or the footer is on screen (it would only be repeating them), and it is never shown on
 * larger screens or to signed-in people.
 *
 * Props: onClick() runs the same handler as the hero button; heroSelector / endSelectors name what to watch.
 */
export default function StickyCta({ onClick, label = "Analyze my first clip, free", heroSelector, endSelectors = [] }) {
  const [heroGone, setHeroGone] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const hero = document.querySelector(heroSelector);
    const ends = endSelectors.map((s) => document.querySelector(s)).filter(Boolean);
    const seen = new Set();
    const cleanups = [];
    if (hero) {
      // "gone" means scrolled up and out of view, not merely not yet reached
      const io = new IntersectionObserver(([e]) => setHeroGone(!e.isIntersecting && e.boundingClientRect.top < 0));
      io.observe(hero); cleanups.push(() => io.disconnect());
    }
    ends.forEach((el) => {
      const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) seen.add(el); else seen.delete(el); setAtEnd(seen.size > 0); });
      io.observe(el); cleanups.push(() => io.disconnect());
    });
    return () => cleanups.forEach((f) => f());
  }, [heroSelector, endSelectors.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const show = heroGone && !atEnd;
  return (
    <div
      className={`md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-200 ${show ? "translate-y-0" : "translate-y-full pointer-events-none"}`}
      aria-hidden={!show}
      data-testid="sticky-cta"
    >
      <button type="button" onClick={onClick} tabIndex={show ? 0 : -1}
        className="w-full h-12 rounded-full bg-lime-400 text-black font-bold uppercase tracking-wide text-[15px] flex items-center justify-center gap-1 shadow-[0_0_24px_rgba(163,230,53,0.25)] active:scale-[0.98] transition-transform">
        {label} <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
