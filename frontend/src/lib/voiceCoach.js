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
const COACH_VOICE_PREF_KEY = "athlytic_coach_voice_v1";
const TRANSCRIPT_KEY_PREFIX = "athlytic_voice_transcript_";
const MAX_HISTORY_PER_ANALYSIS = 3;

// Mirror of backend `_COACH_VOICE_PRESETS` keys + blurbs. The UI uses
// these for the voice selector pill; the actual ElevenLabs voice_id
// mapping lives only on the server.
export const COACH_VOICE_PRESETS = [
  { key: "aria",  label: "Aria",  blurb: "Warm coach" },
  { key: "bryan", label: "Bryan", blurb: "Calm pro" },
  { key: "river", label: "River", blurb: "Energetic" },
];

export function getCoachVoicePref() {
  try {
    return localStorage.getItem(COACH_VOICE_PREF_KEY) || "aria";
  } catch {
    return "aria";
  }
}

export function setCoachVoicePref(key) {
  try {
    localStorage.setItem(COACH_VOICE_PREF_KEY, key);
  } catch {
    /* noop */
  }
}

// Cached availability ping. The Live Coach calls this once on mount so
// the voice selector only renders when the backend can actually deliver
// premium TTS (otherwise the picker is dead UI).
let _premiumVoiceAvailable = null;
export async function checkPremiumVoiceAvailable() {
  if (_premiumVoiceAvailable !== null) return _premiumVoiceAvailable;
  try {
    const backendUrl = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
    const res = await fetch(`${backendUrl}/api/coach/voice-tts/voices`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      _premiumVoiceAvailable = false;
      return false;
    }
    const j = await res.json();
    _premiumVoiceAvailable = !!j?.available;
    return _premiumVoiceAvailable;
  } catch {
    _premiumVoiceAvailable = false;
    return false;
  }
}

// ─── Voice selection ────────────────────────────────────────────────
// Mirrors the (formerly private) pickVoice() in SpeakTipButton.jsx —
// English voices first, prefer local (offline) ones, prefer the
// premium/neural OS-shipped voices for a less robotic timbre.
export function pickVoice(voices, pref = "auto") {
  if (!voices?.length) return null;
  const en = voices.filter((v) => /^en[-_]?/i.test(v.lang || ""));
  const pool = en.length ? en : voices;
  // Note: localService voices are offline-only and tend to be the
  // ROBOTIC defaults on most platforms. Prefer NETWORK voices because
  // those are the higher-quality cloud-backed Aria/Jenny/Eddy/Ava set.
  // Falls back to local when no network voices are exposed (offline
  // mode or some Linux configs).
  const network = pool.filter((v) => !v.localService);
  const local = pool.filter((v) => v.localService);
  const base = network.length ? network : local.length ? local : pool;

  // Tier-by-tier name matching. Ordered from most-natural to most-robotic.
  // We score every voice by which tier matches first and return the
  // highest-tier candidate. Names taken from real exposed voices on
  // Windows/Edge/macOS/Chrome 2024-2026.
  const TIERS = [
    // Tier 0 — the brand-new neural voices that sound nearly human.
    /(microsoft\s+(ava|aria|jenny|guy|emma|brian|christopher|eric|liam|michelle|nancy|sara|sonia|libby|tony|amber|ana|davis|jane|jason|monica|noah|olivia|tina)).*online.*natural/i,
    // Tier 1 — older "natural" / "neural" / "premium" tagged voices
    // (Google's "google uk english female", Microsoft's pre-2024 line,
    // Siri Voice 2 / Voice 3 on macOS).
    /(natural|neural|premium|enhanced|siri\s+voice|google\s+(uk|us)\s+english)/i,
    // Tier 2 — flagship platform voices by recognizable name.
    /(samantha|karen|moira|fiona|tessa|aria|jenny|guy|allison|ava|eddy|grandma|grandpa|reed|rocko|shelley)/i,
    // Tier 3 — common but more robotic platform voices.
    /(zira|david|mark|alex|daniel|fred|tom|oliver|susan|kate)/i,
  ];
  const isFemale = (v) =>
    /(female|woman|aria|jenny|samantha|zira|allison|ava|emma|monica|sara|sonia|libby|amber|ana|jane|olivia|tina|karen|moira|fiona|tessa|nancy|michelle|google.*english)/i.test(v.name || "");
  const isMale = (v) =>
    /(male|man|guy|david|mark|alex|daniel|fred|tom|oliver|brian|christopher|eric|liam|noah|reed|rocko|davis|jason|tony|eddy)/i.test(v.name || "");

  let candidates = base;
  if (pref === "female") {
    const f = base.filter(isFemale);
    if (f.length) candidates = f;
  } else if (pref === "male") {
    const m = base.filter(isMale);
    if (m.length) candidates = m;
  }

  // Walk tiers top-down; first non-empty match wins. Falls back to the
  // raw candidate list and finally to anything in base.
  for (const tierRx of TIERS) {
    const hit = candidates.find((v) => tierRx.test(v.name || ""));
    if (hit) return hit;
  }
  return candidates[0] || base[0];
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
//
// Chrome cut-off workaround:
//   The Chrome SpeechSynthesis engine on desktop stops playback after
//   ~15 seconds — a long-known bug (crbug.com/679437) that surfaces as
//   "the coach reads two sentences then goes silent". Mitigation: while
//   the utterance is speaking, periodically `pause()` + immediately
//   `resume()`. That keeps the engine's internal timer from expiring.
//   Mobile/iOS aren't affected by the timer but the pause/resume is a
//   harmless no-op there (we still guard against double-pause).
//
//   For very long utterances (>200 chars) we also split into sentence
//   chunks and queue them sequentially. Each chunk is well under the
//   timer limit, and queuing is reliable across browsers.
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

  // Split long text into sentence chunks. Each chunk gets its own
  // utterance queued back-to-back — gives the engine a chance to
  // recover between chunks and dodges the Chrome 15s cap.
  const chunks = _chunkForSpeech(cleaned, 200);

  let onStartFired = false;
  let chunkIndex = 0;
  let keepAliveTimer = null;

  // The Chrome pause/resume heartbeat. Fires every 5s while speaking
  // to keep the engine's internal timer from expiring. Harmless on
  // browsers that don't have the bug.
  const startKeepAlive = () => {
    if (keepAliveTimer) return;
    keepAliveTimer = setInterval(() => {
      try {
        if (!window.speechSynthesis.speaking) return;
        if (window.speechSynthesis.paused) return;
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      } catch {
        /* noop */
      }
    }, 5000);
  };
  const stopKeepAlive = () => {
    if (!keepAliveTimer) return;
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  };

  const promise = new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stopKeepAlive();
      try {
        opts.onEnd?.();
      } catch {
        /* noop */
      }
      resolve();
    };

    const speakChunk = () => {
      if (chunkIndex >= chunks.length) {
        finish();
        return;
      }
      const chunkText = chunks[chunkIndex];
      const u = new SpeechSynthesisUtterance(chunkText);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || "en-US";
      // Defaults tuned for the live coach: rate 0.92 reads at a calmer
      // pace than the browser default (1.0), which on Windows/Edge SAPI
      // voices reads noticeably fast. Slight pitch trim (0.97) makes
      // the default Microsoft Aria / Google voices feel less synthetic.
      // Callers can still override either via opts.
      u.rate = typeof opts.rate === "number" ? opts.rate : 0.92;
      u.pitch = typeof opts.pitch === "number" ? opts.pitch : 0.97;
      u.volume = typeof opts.volume === "number" ? opts.volume : 1.0;

      u.onstart = () => {
        if (!onStartFired) {
          onStartFired = true;
          try { opts.onStart?.(); } catch { /* noop */ }
        }
        startKeepAlive();
      };
      u.onend = () => {
        chunkIndex += 1;
        // Small inter-sentence pause (~140ms) — most engines play
        // chunks back-to-back with zero gap, which reads as rushed.
        // The pause approximates natural breath between thoughts.
        setTimeout(speakChunk, 140);
      };
      u.onerror = (e) => {
        // Cancel = expected (user/cancel button). Anything else: log
        // once and stop, don't keep trying further chunks.
        if (e && e.error && e.error !== "canceled" && e.error !== "interrupted") {
          // eslint-disable-next-line no-console
          console.warn("[speak] utterance error:", e.error);
        }
        finish();
      };

      try {
        window.speechSynthesis.speak(u);
      } catch {
        finish();
      }
    };

    speakChunk();
  });

  return Object.assign(promise, controller);
}

// ─── Remote TTS (ElevenLabs via backend proxy) ──────────────────────
// Plays a single MP3 blob returned by `/api/coach/voice-tts`. Returns
// a controller compatible with speak() — { cancel() } and the promise
// resolves on natural-end OR on cancel. Throws on any non-200 so the
// outer `speakWithCoachVoice` can fall back to the browser engine.
function _speakRemote(text, opts = {}) {
  const audio = new Audio();
  audio.preload = "auto";
  let cancelled = false;
  let urlToRevoke = null;

  const controller = {
    cancel: () => {
      cancelled = true;
      try {
        audio.pause();
        audio.src = "";
      } catch {
        /* noop */
      }
      if (urlToRevoke) {
        try {
          URL.revokeObjectURL(urlToRevoke);
        } catch {
          /* noop */
        }
        urlToRevoke = null;
      }
    },
  };

  const promise = (async () => {
    const backendUrl = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
    const token = (() => {
      try {
        return localStorage.getItem("playsmart_token");
      } catch {
        return null;
      }
    })();

    const res = await fetch(`${backendUrl}/api/coach/voice-tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        text,
        voice_id: opts.voiceKey || getCoachVoicePref(),
      }),
    });
    if (!res.ok) {
      const err = new Error(`tts_http_${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (cancelled) return;
    const blob = await res.blob();
    if (cancelled) return;
    urlToRevoke = URL.createObjectURL(blob);
    audio.src = urlToRevoke;

    await new Promise((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("audio_play_error"));
      audio
        .play()
        .then(() => {
          try {
            opts.onStart?.();
          } catch {
            /* noop */
          }
        })
        .catch((e) => reject(e || new Error("audio_play_blocked")));
    });

    if (urlToRevoke) {
      try {
        URL.revokeObjectURL(urlToRevoke);
      } catch {
        /* noop */
      }
      urlToRevoke = null;
    }
    try {
      opts.onEnd?.();
    } catch {
      /* noop */
    }
  })();

  return Object.assign(promise, controller);
}

// Unified TTS used by the Live Coach. Tries the backend ElevenLabs
// proxy first, falls back to browser speechSynthesis on ANY failure
// (no key configured, 401, 503, network drop, audio playback blocked).
// The returned controller's `engine` field is updated mid-flight so the
// UI can show a "Premium voice" vs "Device voice" badge after the call
// settles. `opts.onEngineFallback` fires the moment we switch.
export function speakWithCoachVoice(text, opts = {}) {
  const cleaned = cleanForSpeech(text);
  const controller = {
    cancel: () => {
      /* replaced below */
    },
    engine: "remote",
  };
  if (!cleaned) {
    return Object.assign(Promise.resolve(), controller);
  }

  let activeController = null;
  let cancelled = false;
  controller.cancel = () => {
    cancelled = true;
    try {
      activeController?.cancel?.();
    } catch {
      /* noop */
    }
  };

  const promise = (async () => {
    try {
      activeController = _speakRemote(cleaned, opts);
      await activeController;
      return;
    } catch (e) {
      // 401 / 503 / network / quota → silent fallback. Log only when the
      // server actually returned something unexpected so a misconfigured
      // backend is still visible during local development.
      if (e?.status && e.status !== 401 && e.status !== 503 && e.status !== 402) {
        // eslint-disable-next-line no-console
        console.warn("[speakWithCoachVoice] remote failed:", e.status);
      }
    }
    if (cancelled) return;
    controller.engine = "browser";
    try {
      opts.onEngineFallback?.();
    } catch {
      /* noop */
    }
    activeController = speak(cleaned, opts);
    await activeController;
  })();

  return Object.assign(promise, controller);
}

// Split text into ≤maxLen-character chunks, breaking at sentence
// boundaries where possible. Each chunk becomes its own utterance —
// keeping individual playbacks short enough to dodge the Chrome 15s
// cutoff bug AND gives a natural pause between sentences.
function _chunkForSpeech(text, maxLen = 200) {
  const out = [];
  // Split on sentence-terminating punctuation, keeping the punctuation
  // with the preceding clause.
  const sentences = String(text).match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  let buf = "";
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (!buf) {
      buf = trimmed;
    } else if (buf.length + 1 + trimmed.length <= maxLen) {
      buf += " " + trimmed;
    } else {
      out.push(buf);
      buf = trimmed;
    }
    // If a SINGLE sentence is itself longer than maxLen, push it
    // anyway — better one over-long chunk than a hard split mid-word.
    if (buf.length > maxLen * 1.5) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [text];
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
