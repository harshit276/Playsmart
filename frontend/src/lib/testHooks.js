/**
 * Test-only switches. They only act on a localhost page, so they do nothing on the live site.
 *   ?vhold=<ms>  keep the verdict card on screen that long, so a screenshot can catch it
 */
const onLocalhost = () => typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

export function verdictMs(fallback) {
  try {
    if (onLocalhost()) {
      const v = Number(new URLSearchParams(window.location.search).get("vhold"));
      if (v > 0) return v;
    }
  } catch { /* no switch: use the normal time */ }
  return fallback;
}
