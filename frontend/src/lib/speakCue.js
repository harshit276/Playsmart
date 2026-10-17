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
 *
 * The coach's own lines (ai/coachPhrases) are played from recordings (lib/coachVoice) through speakPhrase(); the
 * browser's speech engine is the fallback for any line without a recording and for people who choose "Phone voice".
 */
import { ensureAudioContext, clipState, stopClips, playParts, hasClip, clipVoice, loadManifest, audioClipsSupported } from "@/lib/coachVoice";
import { phraseForText } from "@/ai/coachPhrases";

let lastAt = 0;
let curPriority = 0;
let curStartedAt = 0;
let unlocked = false;
let voice = null;
let watchdog = 0;

const health = { supported: false, started: 0, spoken: 0, errors: 0, lastError: null, silent: false, locked: false };
const listeners = new Set();
const emit = () => listeners.forEach((f) => { try { f({ ...health }); } catch { /* a listener must never break speech */ } });

function synthSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined";
}
/** Can this device give spoken cues at all: recorded lines (any browser with Web Audio) or the phone's speech engine. */
export function cuesSupported() {
  return synthSupported() || audioClipsSupported();
}
health.supported = cuesSupported();

/** What the speech engine is doing, for the UI: { supported, started, spoken, errors, lastError, silent, locked }. */
export const voiceHealth = () => ({ ...health });
/** Be told when voiceHealth changes. Returns an unsubscribe. */
export function subscribeVoice(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ─── voice choice ───
function pickVoice() {
  if (!synthSupported()) return;
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
if (synthSupported()) {
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
  loadManifest();
  if (!cuesSupported() || unlocked) return;
  unlocked = true;
  try {
    if (clipVoice()) {
      if (synthSupported()) {
        // the phone's speech engine still has to be woken from this tap (iOS), silently: the greeting is a recording
        const u = new window.SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
      // the recordings' list has to be here first, or the greeting would fall back to the phone's voice
      const greeting = phraseForText("Coach is on. Take your stance, and swing when you're ready.");
      loadManifest().then(() => speakPhrase(greeting ? [greeting] : [], { fallbackText: "Voice coach on.", priority: 2, minGapMs: 0 }));
    } else if (synthSupported()) say("Voice coach on.", 2);
    lastAt = Date.now();
  } catch { /* noop */ }
}

/** Say a short confirmation: for the sound button, so tapping it proves whether audio works. */
export function speakTest() {
  ensureAudio();
  if (!cuesSupported()) return false;
  try {
    if (clipVoice()) {
      const p = phraseForText("Voice on.");
      loadManifest().then(() => speakPhrase(p ? [p] : [], { fallbackText: "Voice on.", priority: 2, minGapMs: 0 }));
      lastAt = Date.now();
      return true;
    }
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
  if (!synthSupported() || !text) return false;
  const now = Date.now();
  try {
    const synth = window.speechSynthesis;
    const stale = curPriority && now - curStartedAt > 8000; // a flag stuck on by an engine that never reported the end
    const clip = clipState();
    const busy = ((synth.speaking || synth.pending || curPriority) && !stale) || clip.busy;
    if (health.silent) { synth.cancel(); health.silent = false; setTimeout(() => say(text, priority), 80); lastAt = now; return true; }
    if (busy) {
      if (priority <= Math.max(curPriority, clip.busy ? clip.priority : 0)) return false;
      stopClips();
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

/**
 * Say a coach line: from its recording when there is one for the chosen voice (parts = [{id, text}] from
 * ai/coachPhrases), otherwise with the phone's voice (`fallbackText`, or the parts' text). Same rules as speakCue:
 * never over something as important, a more important line interrupts, and a minimum gap for routine ones. With
 * neither recordings nor speech available it plays a tone (`tone`: "good" | "flag").
 * @returns {boolean} whether it was started or queued
 */
export function speakPhrase(parts, { fallbackText = null, minGapMs = 2500, priority = 1, tone: toneKind = null } = {}) {
  const text = fallbackText || parts.map((p) => p.text).join(" ");
  if (!text) return false;
  const v = clipVoice();
  const now = Date.now();
  const canClip = !!v && audioClipsSupported() && parts.length > 0 && parts.every((p) => p.id && hasClip(p.id, v));
  if (!canClip) {
    if (synthSupported()) return speakCue(text, { minGapMs, priority });
    if (toneKind) tone(toneKind);
    return false;
  }
  try {
    const synthBusy = synthSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
    const clip = clipState();
    const busy = clip.busy || synthBusy || curPriority;
    if (busy) {
      if (priority <= Math.max(clip.busy ? clip.priority : 0, curPriority)) return false;
      stopClips();
      if (synthSupported()) { curPriority = 0; try { window.speechSynthesis.cancel(); } catch { /* noop */ } }
    } else if (now - lastAt < minGapMs && priority < 2) return false;
    lastAt = now;
    playParts(parts, { priority }).then((ok) => {
      if (ok) { health.started++; health.spoken++; if (health.silent || health.locked) { health.silent = false; health.locked = false; } emit(); return; }
      if (synthSupported()) speakCue(text, { minGapMs: 0, priority }); // a clip was not ready in time: the phone says it instead
      else if (toneKind) tone(toneKind);
    });
    return true;
  } catch {
    return false;
  }
}

export function cancelCue() {
  stopClips();
  if (!synthSupported()) return;
  curPriority = 0;
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
}

/** True while any cue (recording or speech) is being spoken. */
export function cueBusy() {
  try { return clipState().busy || (synthSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) || curPriority > 0; } catch { return false; }
}

// ─── tones: the fallback when speech can't be heard, and always available ───
function ensureAudio() {
  return ensureAudioContext();
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
export function deliverCue(co, enabled, vary = null) {
  if (!co || !co.say || !enabled) return;
  const h = voiceHealth();
  if (!h.supported || (h.silent && !clipVoice())) { tone(co.tone); return; }
  if (vary) {
    // the coach's own wording, varied, in the recorded voice
    const p = vary(co.say, co.tone);
    speakPhrase(p?.id ? [p] : [], { fallbackText: p?.text || co.say, minGapMs: 0, priority: 1, tone: co.tone });
  } else speakCue(co.say, { minGapMs: 0, priority: 1 });
}
