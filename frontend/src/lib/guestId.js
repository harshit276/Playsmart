/**
 * getGuestId — a best-effort, privacy-respecting anonymous id used only to
 * rate-limit the ONE free guest analysis. It is NOT PII and NOT a login: a
 * hash of coarse device traits plus a random id persisted in localStorage.
 *
 * Design note: we bias toward LOW false-positives (a unique random id per
 * browser) rather than maximum un-evadability, because wrongly blocking a real
 * new prospect from their free analysis is worse for us than an abuser clearing
 * storage to get a second one. The random id makes two different people on
 * identical devices distinct; clearing storage evades, which is accepted — the
 * server's per-IP and global daily caps are the real cost backstop.
 *
 * Sent as the `X-Guest-Id` header (see lib/api.js). Ignored server-side for
 * signed-in users.
 */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function getGuestId() {
  try {
    let rid = localStorage.getItem("guest_rid");
    if (!rid) {
      rid =
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Math.random()).slice(2) + Date.now().toString(36));
      localStorage.setItem("guest_rid", rid);
    }
    const n = typeof navigator !== "undefined" ? navigator : {};
    const scr = typeof screen !== "undefined" ? screen : {};
    const traits = [
      n.userAgent, n.language, (n.languages || []).join(","),
      n.platform, n.hardwareConcurrency, n.deviceMemory,
      scr.width, scr.height, scr.colorDepth,
      new Date().getTimezoneOffset(),
    ].join("|");
    // device-traits hash (stable across incognito on same browser) + unique rid
    return `${fnv1a(traits)}.${fnv1a(rid)}`;
  } catch {
    return "na";
  }
}
