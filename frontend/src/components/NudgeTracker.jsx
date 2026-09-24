import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import api from "@/lib/api";
import { track } from "@/lib/analytics";

/**
 * NudgeTracker — attributes a visit that came from a re-engagement nudge.
 *
 * The "film again and compare" push/email links carry ?src=push|email&n=<id>.
 * Without this, we could only count what we SENT, never what came back, so
 * there was no way to tell whether the retention loop works.
 *
 * Reports to PostHog (funnel) and to the backend (admin stats, first tap
 * only), then strips the parameters so a reload can't double-count and the
 * URL the user sees stays clean.
 */
export default function NudgeTracker() {
  const location = useLocation();

  useEffect(() => {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch { return; }
    const src = params.get("src");
    const id = params.get("n");
    if (!src || !["push", "email"].includes(src)) return;

    track("nudge_clicked", { channel: src, has_id: !!id });
    if (id) api.post("/push/clicked", { id }, { timeout: 8000 }).catch(() => {});

    params.delete("src");
    params.delete("n");
    const qs = params.toString();
    try {
      window.history.replaceState({}, "",
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    } catch { /* URL stays as-is; the events are already sent */ }
  }, [location.pathname]);

  return null;
}
