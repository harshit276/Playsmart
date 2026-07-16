/**
 * modalPresence — lets full-screen sheets/modals tell the floating pills
 * (LiveVoiceCoach, VirtualCoach) to get out of the way.
 *
 * The score-reveal sheet and the LiveVoiceCoach pill both render at z-50, so
 * whichever mounted last painted on top — the "Talk to Virtual Coach" pill
 * sat across the sheet's Download button. z-index alone isn't enough (the
 * pill is fixed-position in a different subtree), so modals announce
 * themselves and the pills hide while any is open.
 */

const OPEN = new Set();
const listeners = new Set();

function emit() {
  const anyOpen = OPEN.size > 0;
  listeners.forEach((fn) => { try { fn(anyOpen); } catch { /* listener owns its errors */ } });
}

/** Mark a modal open/closed by a stable id. */
export function setModalOpen(id, open) {
  if (open) OPEN.add(id);
  else OPEN.delete(id);
  emit();
}

export function isAnyModalOpen() {
  return OPEN.size > 0;
}

/** Subscribe to "is any modal open" changes. Returns an unsubscribe fn. */
export function subscribeModalPresence(fn) {
  listeners.add(fn);
  fn(OPEN.size > 0);
  return () => listeners.delete(fn);
}
