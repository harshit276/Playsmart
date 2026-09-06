/**
 * @module adsConversion
 * Reports a completed signup to Google Ads, exactly once per user.
 *
 * WHY A GUARD: the conversion tells ad bidding which clicks are worth paying
 * for, so an inflated count is worse than no count — it teaches Google to buy
 * more of whatever produced the phantom conversions. Two things could inflate
 * it here: /auth/firebase serves every returning Google login as well as the
 * first one, and a verification magic link can be clicked twice. The caller
 * checks is_new_user for the first case; this module's per-user flag covers
 * both, and survives a reload.
 *
 * Fails silently and completely: an ad tag must never be able to break signup.
 */

// Conversion action "Formanti signup" in Ads account 215-460-4080.
const SEND_TO = "AW-18380539529/LFUuCLCy_O8cEImNw7xE";
const KEY_PREFIX = "gads_signup:";

/**
 * @param {string} userId  the account that just signed up — scopes the guard.
 * @returns {boolean} whether the event was actually sent (useful in tests).
 */
export function trackSignupConversion(userId) {
  try {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return false;

    // Per-user so a second account on the same device still reports. Storage
    // can throw (private mode, blocked cookies) — treat that as "unknown" and
    // still fire, because under-reporting is the more damaging failure here.
    const key = KEY_PREFIX + (userId || "anon");
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, String(Date.now()));
    } catch {
      /* storage unavailable — fall through and fire once for this page load */
      if (window.__gadsSignupFired) return false;
    }
    window.__gadsSignupFired = true;

    window.gtag("event", "conversion", { send_to: SEND_TO });
    return true;
  } catch {
    // Never let measurement break the auth flow.
    return false;
  }
}
