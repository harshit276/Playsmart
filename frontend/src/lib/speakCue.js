/**
 * Spoken cues for live practice, through the browser's own speech synthesis
 * (on-device, free, nothing uploaded).
 *
 * Rules a player will feel: a cue never talks over itself or over the swing
 * (new cues replace old ones, and there is a minimum gap), and speech is only
 * available after a tap: iOS refuses until something has been spoken from a
 * user gesture, so call unlockSpeech() from the Start button's click handler.
 */
let lastAt = 0;

export function cuesSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined";
}

/** Call from a click handler: lets later cues speak on iOS. Safe to call repeatedly. */
export function unlockSpeech() {
  if (!cuesSupported()) return;
  try {
    const u = new window.SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch { /* noop */ }
}

/**
 * Say `text` unless something was said less than `minGapMs` ago.
 * @returns {boolean} whether it was spoken
 */
export function speakCue(text, { minGapMs = 3500 } = {}) {
  if (!cuesSupported() || !text) return false;
  const now = Date.now();
  if (now - lastAt < minGapMs) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.rate = 1.08;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
    lastAt = now;
    return true;
  } catch {
    return false;
  }
}

export function cancelCue() {
  if (!cuesSupported()) return;
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
}
