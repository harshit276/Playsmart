/**
 * Jump the analysis page's main video to `sec` and bring it into view.
 * Same "playsmart:seek" event the shot cards and court map use; a page with
 * no main video (the demo) just ignores it.
 */
export function seekMainVideo(sec) {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return;
  window.dispatchEvent(new CustomEvent("playsmart:seek", { detail: { time: sec } }));
  const v = document.querySelector("video[data-playsmart-clip]");
  if (v) {
    try { v.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* noop */ }
  }
}

/** "0:25" / "1:05" → seconds, else null. */
export function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 ? s : null;
}

export function formatClock(sec) {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return "";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
