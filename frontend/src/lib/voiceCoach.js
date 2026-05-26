// voiceCoach.js
// ──────────────────────────────────────────────────────────────────────
// Browser-native speech helpers used by the Live Voice Coach experience.
// Zero dependencies, zero server cost — we lean on the Web Speech API
// (SpeechRecognition + speechSynthesis) so v1 ships without Whisper or
// any cloud STT. The whole module degrades gracefully: every function
// no-ops or returns null when the browser doesn't expose the APIs.
//
// Exports:
//   - pickVoice(voices, pref) — same logic SpeakTipButton has always
//     used (local + premium English voice), now shared so LiveVoiceCoach
//     sounds identical to the rest of the page.
//   - cleanForSpeech(text) — strips markdown/emoji so TTS reads cleanly.
//   - speak(text, opts) — returns a Promise<void> that resolves on
//     speech-end. .cancel() on the returned controller stops playback.
//   - class SpeechRecognizer — thin wrapper around webkitSpeechRecognition
//     with start/stop/onPartial/onFinal/dispose. Continuous mode flag.
//   - saveTranscript(analysisId, messages) / loadTranscripts(analysisId)
//     — localStorage helpers, capped at 3 history entries per analysis.

const VOICE_PREF_KEY = "athlytic_voice_pref_v1";
const TRANSCRIPT_KEY_PREFIX = "athlytic_voice_transcript_";
const MAX_HISTORY_PER_ANALYSIS = 3;

// ─── Voice selection ────────────────────────────────────────────────
// Mirrors the (formerly private) pickVoice() in SpeakTipButton.jsx —
// English voices first, prefer local (offline) ones, prefer the
// premium/neural OS-shipped voices for a less robotic timbre.
export function pickVoice(voices, pref = "auto") {
  if (!voices?.length) return null;
  const en = voices.filter((v) => /^en[-_]?/i.test(v.lang || ""));
  const pool = en.length ? en : voices;
  const local = pool.filter((v) => v.localService);
  const base = local.length ? local : pool;
  const isPremium = (v) =>
    /(natural|neural|premium|enhanced|siri|aria|jenny|guy)/i.test(v.name || "");
  const isFemale = (v) =>
    /(female|woman|aria|jenny|samantha|zira|allison|susan|tessa|kate|moira|fiona|google us english)/i.test(
      v.name || ""
    );
  const isMale = (v) =>
    /(male|man|guy|david|mark|alex|daniel|fred|tom|oliver)/i.test(v.name || "");

  let candidates = base;
  if (pref === "female") {
    const f = base.filter(isFemale);
    if (f.length) candidates = f;
  } else if (pref === "male") {
    const m = base.filter(isMale);
    if (m.length) candidates = m;
  }
  const premium = candidates.filter(isPremium);
  return premium[0] || candidates[0] || base[0];
}

export function cleanForSpeech(text) {
  return String(text || "")
    .replace(/[#*_`~>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // markdown links → label only
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getVoicePref() {
  try {
    return localStorage.getItem(VOICE_PREF_KEY) || "auto";
  } catch {
    return "auto";
  }
}

export function setVoicePref(pref) {
  try {
    localStorage.setItem(VOICE_PREF_KEY, pref);
  } catch {
    /* noop */
  }
}

// ─── TTS support detection ──────────────────────────────────────────
export function ttsSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

// ─── STT support detection ──────────────────────────────────────────
export function sttSupported() {
  if (typeof window === "undefined") return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// ─── speak() ────────────────────────────────────────────────────────
// Returns a Promise<void> that resolves on speech-end OR on cancel.
// The controller (mutated on the returned object) exposes .cancel().
// We keep speak() synchronous from the click handler to satisfy
// iOS Safari, but the actual Promise wraps onend/onerror.
export function speak(text, opts = {}) {
  const controller = {
    cancel: () => {
      try {
        if (ttsSupported()) window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
    },
  };

  const cleaned = cleanForSpeech(text);
  if (!cleaned || !ttsSupported()) {
    return Object.assign(Promise.resolve(), controller);
  }

  // Cancel anything in flight — Chrome wedges otherwise.
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* noop */
  }

  const pref = opts.voicePref || getVoicePref();
  const voices = window.speechSynthesis.getVoices() || [];
  const voice = opts.voice || pickVoice(voices, pref);

  const u = new SpeechSynthesisUtterance(cleaned);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || "en-US";
  u.rate = typeof opts.rate === "number" ? opts.rate : 1.0;
  u.pitch = typeof opts.pitch === "number" ? opts.pitch : 1.0;
  u.volume = typeof opts.volume === "number" ? opts.volume : 1.0;

  const promise = new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        opts.onEnd?.();
      } catch {
        /* noop */
      }
      resolve();
    };
    u.onstart = () => {
      try {
        opts.onStart?.();
      } catch {
        /* noop */
      }
    };
    u.onend = finish;
    u.onerror = finish;
  });

  // Synchronous speak() — required for iOS Safari to actually fire.
  try {
    window.speechSynthesis.speak(u);
  } catch {
    /* noop — promise still resolves via onerror */
  }
  return Object.assign(promise, controller);
}

// ─── SpeechRecognizer ───────────────────────────────────────────────
// Thin wrapper over webkitSpeechRecognition. Two modes:
//   - push-to-talk: start() then stop() when the user releases.
//   - continuous: pass { continuous: true } so it keeps listening until
//     stop() / dispose().
// Callbacks:
//   - onPartial(text) — fires on every interim result so callers can
//     show "live" transcription text while the user is still speaking.
//   - onFinal(text)   — fires when an utterance is final.
//   - onError(err)    — best-effort error notification.
//   - onEnd()         — fires when recognition stops (timeout or stop()).
export class SpeechRecognizer {
  constructor(opts = {}) {
    this.opts = opts;
    this.recognition = null;
    this.listening = false;
    this._disposed = false;
    this._restartOnEnd = false;
    this._lastFinalText = "";
    this._init();
  }

  _init() {
    const Ctor =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Ctor) {
      this.recognition = null;
      return;
    }
    const rec = new Ctor();
    rec.continuous = !!this.opts.continuous;
    rec.interimResults = true;
    rec.lang = this.opts.lang || "en-US";
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      if (this._disposed) return;
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const txt = (r[0]?.transcript || "").trim();
        if (!txt) continue;
        if (r.isFinal) {
          final += (final ? " " : "") + txt;
        } else {
          interim += (interim ? " " : "") + txt;
        }
      }
      if (interim) {
        try {
          this.opts.onPartial?.(interim);
        } catch {
          /* noop */
        }
      }
      if (final) {
        this._lastFinalText = final;
        try {
          this.opts.onFinal?.(final);
        } catch {
          /* noop */
        }
      }
    };

    rec.onerror = (e) => {
      // "no-speech" / "aborted" are routine. Surface everything to the
      // caller but don't treat them as fatal — onend will fire next.
      try {
        this.opts.onError?.(e?.error || "unknown");
      } catch {
        /* noop */
      }
    };

    rec.onend = () => {
      this.listening = false;
      // Continuous mode auto-stops on long silence in some browsers;
      // restart unless the caller explicitly stopped us.
      if (this._restartOnEnd && !this._disposed) {
        try {
          rec.start();
          this.listening = true;
          return;
        } catch {
          /* noop — fall through to onEnd */
        }
      }
      try {
        this.opts.onEnd?.();
      } catch {
        /* noop */
      }
    };

    this.recognition = rec;
  }

  isSupported() {
    return !!this.recognition;
  }

  start() {
    if (!this.recognition || this.listening || this._disposed) return false;
    this._restartOnEnd = !!this.opts.continuous;
    try {
      this.recognition.start();
      this.listening = true;
      return true;
    } catch {
      // start() throws "already started" if called twice — treat as ok.
      return this.listening;
    }
  }

  stop() {
    if (!this.recognition) return;
    this._restartOnEnd = false;
    try {
      this.recognition.stop();
    } catch {
      /* noop */
    }
  }

  abort() {
    if (!this.recognition) return;
    this._restartOnEnd = false;
    try {
      this.recognition.abort();
    } catch {
      /* noop */
    }
  }

  dispose() {
    this._disposed = true;
    this._restartOnEnd = false;
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {
        /* noop */
      }
    }
    this.recognition = null;
  }
}

// ─── Transcript persistence ─────────────────────────────────────────
function transcriptKey(analysisId) {
  return `${TRANSCRIPT_KEY_PREFIX}${analysisId || "default"}`;
}

export function saveTranscript(analysisId, messages) {
  if (!analysisId) return;
  if (!Array.isArray(messages) || messages.length === 0) return;
  try {
    const key = transcriptKey(analysisId);
    const raw = localStorage.getItem(key);
    const history = raw ? JSON.parse(raw) : [];
    const next = [
      {
        saved_at: new Date().toISOString(),
        messages: messages.slice(-40), // cap per session
      },
      ...(Array.isArray(history) ? history : []),
    ].slice(0, MAX_HISTORY_PER_ANALYSIS);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export function loadTranscripts(analysisId) {
  if (!analysisId) return [];
  try {
    const raw = localStorage.getItem(transcriptKey(analysisId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearTranscripts(analysisId) {
  if (!analysisId) return;
  try {
    localStorage.removeItem(transcriptKey(analysisId));
  } catch {
    /* noop */
  }
}

// ─── Helper: build a session id ─────────────────────────────────────
export function newSessionId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* noop */
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
