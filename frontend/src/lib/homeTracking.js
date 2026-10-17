import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * Home page reading + click signals, so cutting or reordering sections can be decided from what people
 * actually reach instead of from opinion.
 *
 *   home_section_view  { section, order, seconds, device }   first time a [data-section] is ~a third on screen
 *   home_scroll_depth  { pct, seconds, device }              25 / 50 / 75 / 100 % of the page, once each
 *   home_click         { cta, section, device }              any element marked data-cta (links and buttons)
 *
 * Mark a section with data-section="name" and a button or link with data-cta="name". Nothing personal is
 * ever sent, every call is fire-and-forget (see lib/analytics), and the hook adds one IntersectionObserver,
 * one passive scroll listener and one click listener, all removed on unmount.
 */
export function useHomeTracking() {
  useEffect(() => {
    const t0 = performance.now();
    const secs = () => Math.round((performance.now() - t0) / 100) / 10;
    const device = window.matchMedia?.("(min-width: 768px)").matches ? "desktop" : "phone";

    // which sections were reached
    const seen = new Set();
    const watched = new WeakSet();
    let io, mo;
    try {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const name = e.target.getAttribute("data-section");
          if (!name || seen.has(name)) continue;
          seen.add(name);
          const order = [...document.querySelectorAll("[data-section]")].indexOf(e.target) + 1;
          track("home_section_view", { section: name, order, seconds: secs(), device });
          io.unobserve(e.target);
        }
      }, { threshold: 0.3 });
      // sections that arrive later (the blog row waits on its request) are picked up as they appear
      const scan = () => document.querySelectorAll("[data-section]").forEach((el) => { if (!watched.has(el)) { watched.add(el); io.observe(el); } });
      scan();
      let queued = false;
      mo = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); }); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch { /* no IntersectionObserver: skip section views */ }

    // how far down the page
    const marks = [25, 50, 75, 100];
    const fired = new Set();
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        if (total <= 0) return;
        const pct = Math.min(100, Math.round(((window.scrollY || doc.scrollTop) / total) * 100));
        for (const m of marks) {
          if (pct >= m - (m === 100 ? 2 : 0) && !fired.has(m)) { fired.add(m); track("home_scroll_depth", { pct: m, seconds: secs(), device }); }
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // which calls to action get used (and from where)
    const onClick = (ev) => {
      const el = ev.target instanceof Element ? ev.target.closest("[data-cta]") : null;
      if (!el) return;
      track("home_click", { cta: el.getAttribute("data-cta"), section: el.closest("[data-section]")?.getAttribute("data-section") || "outside", device });
    };
    document.addEventListener("click", onClick, true);

    return () => {
      io?.disconnect();
      mo?.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
}
