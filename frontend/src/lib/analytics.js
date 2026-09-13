/**
 * @module analytics
 * Named product events for PostHog, so the funnel can be counted instead of
 * inferred from session replays.
 *
 * WHY: PostHog was loaded with defaults only (index.html), which records page
 * views and clicks. Uploading a video (the OS file picker) and running an
 * analysis (API calls) produce no events at all, and every visitor stayed an
 * anonymous id — so "how many people analysed a video" could only be answered
 * by watching replays one by one.
 *
 * The funnel, in order:
 *   signup_completed → video_selected → analysis_started → analysis_completed
 *   → results_end_reached → feedback_sent → compare_started → compare_completed
 *   → purchase_completed
 * Plus the drop-off signals: analysis_failed, analysis_cancelled,
 * out_of_analyses_shown, checkout_started, checkout_failed.
 *
 * PRIVACY: users are identified by their internal account id ONLY — never
 * email, name or phone. The privacy page promises PostHog data is anonymised,
 * and an opaque id keeps that true while still linking a replay to a funnel.
 *
 * Every call is fire-and-forget: analytics must never throw into, or slow
 * down, the product. The index.html snippet installs a queueing stub before
 * the real library loads, so early calls are kept, not lost.
 */

function ph() {
  try {
    const p = typeof window !== "undefined" ? window.posthog : null;
    return p && typeof p.capture === "function" ? p : null;
  } catch {
    return null;
  }
}

/** Record a named event. `props` must never contain personal data. */
export function track(event, props = {}) {
  try { ph()?.capture(event, props); } catch { /* never break the app */ }
}

let identifiedAs = null;

/** Link this browser's events + replays to the account (id only). */
export function identifyUser(user) {
  const id = user?.id;
  if (!id || identifiedAs === id) return;
  try {
    ph()?.identify(String(id));
    identifiedAs = id;
  } catch { /* noop */ }
}

/** On logout, so the next person on a shared device isn't merged into this one. */
export function resetAnalytics() {
  identifiedAs = null;
  try { ph()?.reset(); } catch { /* noop */ }
}

/**
 * First step of the funnel, once per account: /auth/firebase also serves
 * every returning Google login, and a verify link can be clicked twice.
 * @param {"google"|"email"} method
 */
export function trackSignup(userId, method) {
  if (!userId) return;
  const key = "ph_signup:" + userId;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch { /* storage blocked — a rare duplicate beats a missing signup */ }
  identifyUser({ id: userId });
  track("signup_completed", { method });
}

/** Short, stable failure bucket instead of raw error text (which can hold
 *  file names or server details and fragments the reporting). */
export function failureReason(err, status) {
  const code = status || err?.response?.status || 0;
  const s = String(err?.response?.data?.detail || err?.message || err || "").toLowerCase();
  if (code === 429 || /too quickly|analysis limit|too many/.test(s)) return "rate_limited";
  if (code === 402 || /insufficient_tokens|out of analyses/.test(s)) return "out_of_analyses";
  if (code === 413 || /too large|413|overshoot|trim it/.test(s)) return "file_too_large";
  if (/at capacity|temporarily|resource_exhausted|quota|credits|high demand|overload/.test(s)) return "service_unavailable";
  if (/didn't detect any strokes/.test(s)) return "no_strokes_for_player";
  if (/couldn't detect any shots|no shots/.test(s)) return "no_shots_found";
  if (/sport/.test(s) && /mismatch/.test(s)) return "sport_mismatch";
  if (/abort|cancel/.test(s)) return "cancelled";
  if (/timeout|timed out|stall|stream_idle|ping_failed/.test(s)) return "timeout";
  if (!code || /network|failed to fetch|50[234]/.test(s)) return "network";
  if (/upload/.test(s)) return "upload_failed";
  return s ? "other" : "unknown";
}
