/**
 * push.js — Web Push subscription helper.
 *
 * Registers the browser with the backend so it can fire a "your analysis is
 * ready" notification even when the tab is backgrounded or closed (a local
 * `new Notification()` can't — mobile suspends a backgrounded tab's JS).
 *
 * Flow:
 *   1. fetch the public VAPID key from /api/push/vapid-public-key
 *   2. wait for the service worker, reuse or create a push subscription
 *   3. POST the subscription to /api/push/subscribe
 *
 * Everything is best-effort: unsupported browser, denied permission, or
 * push not configured on the backend all resolve to `false` without throwing.
 */

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Subscribe this browser to push and register it with the backend.
 * @param {import("axios").AxiosInstance} api - the app's axios instance
 * @returns {Promise<boolean>} true if a subscription was registered
 */
export async function subscribeToPush(api) {
  try {
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (!("Notification" in window) || Notification.permission !== "granted") return false;

    // Backend public key — empty string means push isn't configured server-side.
    let key = "";
    try {
      const { data } = await api.get("/push/vapid-public-key", { timeout: 8000 });
      key = (data && data.key) || "";
    } catch {
      return false;
    }
    if (!key) return false;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await api.post("/push/subscribe", { subscription: sub.toJSON ? sub.toJSON() : sub }, { timeout: 8000 });
    return true;
  } catch (e) {
    // VAPID key mismatch, denied permission mid-flow, etc. — non-fatal.
    console.warn("[push] subscribe failed:", e?.message || e);
    return false;
  }
}
