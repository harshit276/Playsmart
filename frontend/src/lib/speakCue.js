/**
 * Spoken cues for live practice, through the browser's own speech synthesis
 * (on-device, free, nothing uploaded), plus short tones as the fallback.
 *
 * What phones do that desktops don't, and what this does about it:
 *   - iOS (and some Android WebViews) refuse to speak until something has been
 *     spoken from a tap. unlockSpeech() speaks a real, audible "Voice coach on" from
 *     the Start button, which also tells the player at once whether they can hear us.
 *   - Android Chrome drops a cue that is spoken straight after cancel(): a more
 *     important cue cancels, waits a beat, then speaks.
 *   - Android Chrome can leave speech stuck paused: resume() before every cue.
 *   - Voices load late and a default voice may be in the wrong language: an English
 *     voice is picked once they are there, and every cue carries a language.
 *   - Some devices accept speak() and then say nothing: a watchdog notices when the
 *     engine never starts, and the UI is told (voiceHealth) so it can say so, and
 *     tones play instead.
 *   - In-app browsers often have no speech synthesis at all: cuesSupported() says so.
 *
 * A cue never talks over a cue that matters as much (new cues are skipped while
 * speaking, unless more important), and there is a minimum gap between cues.
 */
let lastAt = 0;
let curPriority = 0;
let curStartedAt = 0;
let unlocked = false;
let voice = null;
let watchdog = 0;
let audioCtx = null;

const health = { supported: false, started: 0, spoken: 0, errors: 0, lastError: null, silent: false, locked: false };
const listeners = new Set();
const emit = () => listeners.forEach((f) => { try { f({ ...health }); } catch { /* a listener must never break speech */ } });

export function cuesSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined";
}
health.supported = cuesSupported();

/** What the speech engine is doing, for the UI: { supported, started, spoken, errors, lastError, silent, locked }. */
export const voiceHealth = () => ({ ...health });
/** Be told when voiceHealth changes. Returns an unsubscribe. */
export function subscribeVoice(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ─── voice choice ───
function pickVoice() {
  if (!cuesSupported()) return;
  const vs = window.speechSynthesis.getVoices?.() || [];
  if (!vs.length) return;
  const want = String(navigator.language || "en-US").toLowerCase();
  const lang = (v) => String(v.lang || "").toLowerCase().replace("_", "-");
  // the cues are English, so an English voice, in the player's own flavour of English if there is one
  voice = vs.find((v) => lang(v) === want && lang(v).startsWith("en") && v.localService)
    || vs.find((v) => lang(v) === want && lang(v).startsWith("en"))
    || vs.find((v) => lang(v).startsWith("en") && v.localService)
    || vs.find((v) => lang(v).startsWith("en"))
    || null;
}
if (cuesSupported()) {
  pickVoice();
  try { window.speechSynthesis.addEventListener?.("voiceschanged", pickVoice); } catch { /* noop */ }
}

// ─── speaking ───
function say(text, priority) {
  const synth = window.speechSynthesis;
  try { synth.resume?.(); } catch { /* noop */ }
  const u = new window.SpeechSynthesisUtterance(text);
  u.lang = voice?.lang || "en-US";
  if (voice) u.voice = voice;
  u.rate = 1.0;
  u.pitch = 1;
  u.volume = 1;
  let started = false;
  u.onstart = () => {
    started = true;
    curStartedAt = Date.now();
    health.started++;
    if (health.silent || health.locked) { health.silent = false; health.locked = false; }
    clearTimeout(watchdog);
    emit();
  };
  u.onend = () => { if (curPriority === priority) curPriority = 0; };
  u.onerror = (e) => {
    if (e?.error === "canceled" || e?.error === "interrupted") return;
    health.errors++;
    health.lastError = e?.error || "error";
    if (e?.error === "not-allowed") health.locked = true;
    curPriority = 0;
    emit();
  };
  curPriority = priority;
  curStartedAt = Date.now();
  synth.speak(u);
  health.spoken++;
  clearTimeout(watchdog);
  // speak() accepted but the engine never started: say so rather than staying silent about it
  watchdog = setTimeout(() => {
    if (started) return;
    health.silent = true;
    try { synth.cancel(); } catch { /* noop */ }
    curPriority = 0;
    emit();
  }, 3000);
}

/**
 * Call from a click handler (the Start button): lets later cues speak on iOS, and plays an
 * audible "Voice coach on" so the player knows at once whether they can hear it. Idempotent.
 */
export function unlockSpeech() {
  ensureAudio();
  if (!cuesSupported() || unlocked) return;
  unlocked = true;
  try { say("Voice coach on.", 2); lastAt = Date.now(); } catch { /* noop */ }
}

/** Say a short confirmation: for the sound button, so tapping it proves whether audio works. */
export function speakTest() {
  ensureAudio();
  if (!cuesSupported()) return false;
  try {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(() => say("Voice on.", 2), 80); } else say("Voice on.", 2);
    lastAt = Date.now();
    return true;
  } catch { return false; }
}

/**
 * Say `text`. Never talks over something just as important; a more important cue
 * (priority 2, e.g. the verdict on a rep) interrupts a routine one (priority 1).
 * @returns {boolean} whether it was spoken or queued
 */
export function speakCue(text, { minGapMs = 2500, priority = 1 } = {}) {
  if (!cuesSupported() || !text) return false;
  const now = Date.now();
  try {
    const synth = window.speechSynthesis;
    const stale = curPriority && now - curStartedAt > 8000; // a flag stuck on by an engine that never reported the end
    const busy = (synth.speaking || synth.pending || curPriority) && !stale;
    if (health.silent) { synth.cancel(); health.silent = false; setTimeout(() => say(text, priority), 80); lastAt = now; return true; }
    if (busy) {
      if (priority <= curPriority) return false;
      synth.cancel();
      setTimeout(() => say(text, priority), 80); // cancel() straight into speak() loses the new cue on Android
      lastAt = now;
      return true;
    }
    if (now - lastAt < minGapMs && priority < 2) return false;
    say(text, priority);
    lastAt = now;
    return true;
  } catch {
    return false;
  }
}

export function cancelCue() {
  if (!cuesSupported()) return;
  curPriority = 0;
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
}

// ─── tones: the fallback when speech can't be heard, and always available ───
function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  } catch { /* no audio: the screen still coaches */ }
  return audioCtx;
}

/** A short tone: "good" is a quick rising pair, "flag" is one low note. */
export function tone(kind) {
  const ctx = ensureAudio();
  if (!ctx) return false;
  try {
    const notes = kind === "good" ? [[660, 0, 0.09], [880, 0.1, 0.12]] : [[220, 0, 0.22]];
    const t0 = ctx.currentTime;
    for (const [freq, at, len] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "good" ? "sine" : "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0 + at); osc.stop(t0 + at + len + 0.02);
    }
    return true;
  } catch { return false; }
}

/**
 * Deliver one coach cue from ai/liveCoach: spoken when the browser can speak, as a tone when
 * it can't (or when the engine started but stayed silent). `enabled` is the sound button.
 */
export function deliverCue(co, enabled) {
  if (!co || !co.say || !enabled) return;
  const h = voiceHealth();
  if (!h.supported || h.silent) tone(co.tone);
  else speakCue(co.say, { minGapMs: 0, priority: 1 });
}
