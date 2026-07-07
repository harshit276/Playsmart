import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import api, { API_ORIGIN } from "@/lib/api";
import {
  Mic, MicOff, X, ChevronDown, Sparkles, StopCircle,
  Download, RefreshCw, Trash2, Radio, Volume2, History, Headphones,
} from "lucide-react";
import {
  SpeechRecognizer,
  speakWithCoachVoice,
  sttSupported,
  ttsSupported,
  saveTranscript,
  loadTranscripts,
  clearTranscripts,
  newSessionId,
  COACH_VOICE_PRESETS,
  getCoachVoicePref,
  setCoachVoicePref,
  checkPremiumVoiceAvailable,
} from "@/lib/voiceCoach";

// ──────────────────────────────────────────────────────────────────────
// LiveVoiceCoach
// ──────────────────────────────────────────────────────────────────────
// The headline post-analysis experience: a real conversation with the AI
// coach, grounded in the user's clip. UX goals:
//   - Floating "🎙 Talk to Your Coach" pill that ONLY appears once an
//     analysis has produced shots. It feels like the analyze page just
//     gained a coach you can ask anything.
//   - Tap → bottom-sheet (mobile) or right-side panel (desktop, ≥md).
//   - Push-to-talk by default (more reliable on all browsers); a toggle
//     enables continuous listening for hands-free flow.
//   - Real-time waveform (Web Audio AnalyserNode → canvas, 32 mirrored
//     lime bars) so the user can SEE their voice register.
//   - Coach replies stream as text in the transcript, then play through
//     window.speechSynthesis when the SSE `done` event arrives (browser
//     chunked TTS is too unreliable to read mid-stream).
//   - Interrupt button lets the user stop TTS mid-sentence.
//   - Local-only persistence (last 3 conversations per analysis_id),
//     keyed by `analysis_id || result.created_at || synthesized id`.
//
// Constraints honored:
//   - No new JS packages.
//   - The existing text VirtualCoach floating button is untouched.
//   - Unsupported browsers see a graceful fallback message, not a crash.

const WAVE_BARS = 32;
const MAX_CONTEXT_FIELD_CHARS = 600;
const MAX_HISTORY_TURNS_FOR_API = 12;
const MAX_USER_MESSAGE_CHARS = 800;

// ─── Helpers ────────────────────────────────────────────────────────
function clip(text, max = MAX_CONTEXT_FIELD_CHARS) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function buildAnalysisContext(result) {
  if (!result || typeof result !== "object") return {};
  const cn = result.coach_narrative || {};
  const shotsArr = Array.isArray(result.shots) ? result.shots.slice(0, 8) : [];

  return {
    sport: result.sport || result.sport_detected || "",
    overall_skill_level:
      result.overall_skill_level || result.skill_level || "",
    target_player_description: clip(
      result._target_player_description || result.target_player_description || "",
      240,
    ),
    coach_narrative: {
      intro: clip(cn.intro || ""),
      strengths_paragraph: clip(cn.strengths_paragraph || cn.strengths || ""),
      improvements_paragraph: clip(
        cn.improvements_paragraph || cn.improvements || "",
      ),
      takeaway: clip(cn.takeaway || cn.next_focus || ""),
    },
    shots: shotsArr.map((s, i) => ({
      idx: i,
      label: clip(s.label || s.type || s.shot_type || "", 60),
      timestamp_sec:
        typeof s.timestamp_sec === "number"
          ? Math.round(s.timestamp_sec * 10) / 10
          : null,
      top_fix: clip(
        s.formFeedback?.improvement ||
          s.form_feedback?.improvement ||
          (Array.isArray(s.formFeedback?.improvements)
            ? s.formFeedback.improvements[0]
            : null) ||
          s.top_fix ||
          "",
        180,
      ),
      reasoning: clip(s.reasoning || s.summary || "", 220),
    })),
  };
}

function deriveAnalysisId(result) {
  if (!result) return null;
  return (
    result.analysis_id ||
    result._analysis_id ||
    result.id ||
    result.created_at ||
    null
  );
}

function formatTranscriptForDownload(messages, ctx) {
  const stamp = new Date().toISOString();
  const header = [
    `Formanti — Live Coach Transcript`,
    `Saved: ${stamp}`,
    ctx?.sport ? `Sport: ${ctx.sport}` : null,
    ctx?.overall_skill_level ? `Level: ${ctx.overall_skill_level}` : null,
    "",
    "──────────────────────────────────",
    "",
  ]
    .filter(Boolean)
    .join("\n");
  const body = messages
    .map((m) => {
      const who = m.role === "user" ? "You" : "Coach";
      return `${who}: ${m.text}`;
    })
    .join("\n\n");
  return `${header}${body}\n`;
}

// ─── Waveform (Web Audio AnalyserNode → canvas) ────────────────────
function WaveformCanvas({ analyser, active }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const dataRef = useRef(null);

  useEffect(() => {
    if (!analyser || !active) {
      // Drain any in-flight animation frame so the canvas freezes
      // (visually shows the "muted" idle bars rendered below).
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return undefined;
    }
    const cvs = canvasRef.current;
    if (!cvs) return undefined;
    const ctx = cvs.getContext("2d");
    if (!ctx) return undefined;

    // AnalyserNode.fftSize must be a power of two; 64 → 32 useful bins.
    if (analyser.fftSize !== 64) {
      try {
        analyser.fftSize = 64;
      } catch {
        /* noop — fixed by browser */
      }
    }
    const bufferLength = analyser.frequencyBinCount; // 32
    dataRef.current = new Uint8Array(bufferLength);

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = cvs;
      cvs.width = Math.max(1, Math.floor(w * dpr));
      cvs.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();

    const draw = () => {
      const data = dataRef.current;
      if (!data) return;
      analyser.getByteFrequencyData(data);
      const w = cvs.width;
      const h = cvs.height;
      ctx.clearRect(0, 0, w, h);
      const bars = Math.min(WAVE_BARS, bufferLength);
      const gap = 2 * dpr;
      const barWidth = Math.max(2 * dpr, (w - gap * (bars - 1)) / bars);
      ctx.fillStyle = "rgba(190,242,100,0.95)"; // lime-300
      for (let i = 0; i < bars; i++) {
        const v = data[i] / 255; // 0..1
        const barH = Math.max(2 * dpr, v * h * 0.95);
        const x = i * (barWidth + gap);
        const yTop = (h - barH) / 2;
        ctx.fillRect(x, yTop, barWidth, barH);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [analyser, active]);

  return (
    <div className="relative w-full h-12 rounded-lg overflow-hidden bg-zinc-950/70 border border-zinc-800">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        aria-hidden
      />
      {!active && (
        // Idle placeholder — 32 muted bars so the strip never looks empty.
        <div className="absolute inset-0 flex items-center justify-center gap-[2px] px-2">
          {Array.from({ length: WAVE_BARS }).map((_, i) => (
            <span
              key={i}
              className="block w-[3px] rounded-full bg-zinc-700"
              style={{
                height: `${10 + ((i * 37) % 26)}%`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────
export default function LiveVoiceCoach({ result, onRequestReanalyze }) {
  const supported = useMemo(
    () => sttSupported() && ttsSupported(),
    [],
  );
  // Allow ONE coach-triggered re-analysis per result, when the user says the
  // sport/shots were misidentified.
  const reanalyzeFiredRef = useRef(false);
  useEffect(() => { reanalyzeFiredRef.current = false; }, [result]);

  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [coachTalking, setCoachTalking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  // Read coach replies aloud? Default OFF — replies are shown as text, so we
  // don't spend TTS (Sarvam/ElevenLabs) on every chat turn. Users can flip it
  // on for hands-free, and the first-time auto-narration still speaks. Pref
  // persists across sessions.
  const [readAloud, setReadAloud] = useState(() => {
    try { return localStorage.getItem("playsmart_coach_read_aloud") === "1"; }
    catch { return false; }
  });
  // Text-to-coach input (alternative to the mic).
  const [typedText, setTypedText] = useState("");
  useEffect(() => {
    try { localStorage.setItem("playsmart_coach_read_aloud", readAloud ? "1" : "0"); }
    catch { /* noop */ }
  }, [readAloud]);
  const [messages, setMessages] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [error, setError] = useState("");
  // Premium-voice plumbing. `premiumAvailable` controls whether the voice
  // selector renders at all; `coachVoiceKey` is the user's chosen preset;
  // `lastEngine` is set after each reply finishes and drives the
  // "Premium voice" vs "Device voice" badge shown under the speaking row.
  const [premiumAvailable, setPremiumAvailable] = useState(false);
  const [premiumProvider, setPremiumProvider] = useState("none");
  const [coachVoiceKey, setCoachVoiceKeyState] = useState(() => getCoachVoicePref());
  const [lastEngine, setLastEngine] = useState(null);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);

  // Voice / audio refs
  const recognizerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const ttsControllerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const sessionIdRef = useRef(newSessionId());
  const scrollRef = useRef(null);
  const lastFinalRef = useRef("");
  // sendUserMessage closure changes every render (depends on `messages`).
  // The recognizer is built once per `continuousMode` flip and its
  // `onFinal` callback captures whichever `sendUserMessage` existed at
  // build-time — that would be stale. We stash the latest function in
  // a ref so the callback always sees the current one.
  const sendUserMessageRef = useRef(null);

  const analysisId = useMemo(() => deriveAnalysisId(result), [result]);
  const analysisContext = useMemo(
    () => buildAnalysisContext(result),
    [result],
  );

  // Ping the backend once on mount to decide if we should show the
  // voice-selector pill. When ELEVENLABS_API_KEY isn't configured the
  // selector adds no value — every reply lands on browser TTS anyway.
  useEffect(() => {
    let active = true;
    checkPremiumVoiceAvailable().then((state) => {
      if (!active) return;
      setPremiumAvailable(!!state?.available);
      setPremiumProvider(state?.provider || "none");
    });
    return () => {
      active = false;
    };
  }, []);

  // Human-readable provider label for the HD badge + footer microcopy.
  const providerLabel = useMemo(() => {
    if (premiumProvider === "sarvam") return "Sarvam AI";
    if (premiumProvider === "elevenlabs") return "ElevenLabs";
    return null;
  }, [premiumProvider]);

  const handleSelectVoice = useCallback((key) => {
    setCoachVoiceKeyState(key);
    setCoachVoicePref(key);
    setShowVoiceMenu(false);
  }, []);

  const shotCount = Array.isArray(result?.shots) ? result.shots.length : 0;
  const sportLabel = result?.sport || result?.sport_detected || "";

  // ─── Persist transcript on update ────────────────────────────────
  useEffect(() => {
    if (!analysisId) return;
    if (messages.length === 0) return;
    // Save lightly debounced — every state tick is fine, this is local.
    saveTranscript(analysisId, messages);
  }, [messages, analysisId]);

  // Load history list when opening the history sub-panel.
  useEffect(() => {
    if (showHistory && analysisId) {
      setHistoryEntries(loadTranscripts(analysisId));
    }
  }, [showHistory, analysisId]);

  // Auto-scroll the transcript on new messages / interim text.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, interimText, streaming]);

  // ─── Cleanup on unmount / close ──────────────────────────────────
  const teardownAudio = useCallback(() => {
    try {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    } catch {
      /* noop */
    }
    micStreamRef.current = null;
    analyserRef.current = null;
    try {
      audioCtxRef.current?.close?.();
    } catch {
      /* noop */
    }
    audioCtxRef.current = null;
  }, []);

  const cancelTts = useCallback(() => {
    try {
      ttsControllerRef.current?.cancel?.();
    } catch {
      /* noop */
    }
    ttsControllerRef.current = null;
    setCoachTalking(false);
  }, []);

  const abortInFlight = useCallback(() => {
    try {
      abortControllerRef.current?.abort?.();
    } catch {
      /* noop */
    }
    abortControllerRef.current = null;
    setStreaming(false);
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognizerRef.current?.dispose?.();
      } catch {
        /* noop */
      }
      recognizerRef.current = null;
      cancelTts();
      abortInFlight();
      teardownAudio();
    };
  }, [cancelTts, abortInFlight, teardownAudio]);

  // When the panel closes, stop everything but keep the transcript.
  useEffect(() => {
    if (!open) {
      try {
        recognizerRef.current?.stop?.();
      } catch {
        /* noop */
      }
      cancelTts();
      abortInFlight();
      teardownAudio();
      setListening(false);
      setInterimText("");
      setShowHistory(false);
    }
  }, [open, cancelTts, abortInFlight, teardownAudio]);

  // ─── Start / stop microphone capture + AnalyserNode ──────────────
  const startMicAnalyser = useCallback(async () => {
    if (audioCtxRef.current && analyserRef.current && micStreamRef.current) {
      return true;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return true; // STT still works, just no waveform
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      analyserRef.current = analyser;
      return true;
    } catch (e) {
      setError("Mic access denied. Allow microphone in your browser to talk to the coach.");
      return false;
    }
  }, []);

  // ─── Recognition lifecycle ───────────────────────────────────────
  const ensureRecognizer = useCallback(() => {
    if (recognizerRef.current) return recognizerRef.current;
    const rec = new SpeechRecognizer({
      continuous: continuousMode,
      lang: "en-US",
      onPartial: (txt) => setInterimText(txt),
      onFinal: (txt) => {
        // In continuous mode we auto-send each final utterance.
        // In push-to-talk mode we accumulate the last final transcript
        // and send it when the user releases the mic.
        lastFinalRef.current = txt;
        setInterimText("");
        if (continuousMode) {
          // Use the ref so we always invoke the freshest sendUserMessage
          // (its closure depends on `messages`, which changes per render).
          sendUserMessageRef.current?.(txt);
        }
      },
      onError: (err) => {
        if (err && err !== "no-speech" && err !== "aborted") {
          setError(`Mic error: ${err}`);
        }
      },
      onEnd: () => {
        setListening(false);
      },
    });
    recognizerRef.current = rec;
    return rec;
  }, [continuousMode]);

  // Recreate recognizer whenever continuousMode changes.
  useEffect(() => {
    try {
      recognizerRef.current?.dispose?.();
    } catch {
      /* noop */
    }
    recognizerRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuousMode]);

  // ─── Send a user message → SSE coach reply ───────────────────────
  const sendUserMessage = useCallback(
    async (rawText) => {
      const text = (rawText || "").trim().slice(0, MAX_USER_MESSAGE_CHARS);
      if (!text) return;
      if (streaming) return; // Don't pile up requests; coach is mid-reply.

      // Coach-triggered re-analysis: if the user says the sport or the shots
      // were misidentified, RE-RUN the full Gemini analysis once (the chat
      // alone can't change the detected sport). Fires at most once per result.
      if (
        onRequestReanalyze && !reanalyzeFiredRef.current &&
        (
          /\b(re-?analy[sz]e|analy[sz]e again|scan again|check again|try again|do it again|watch again|look again)\b/i.test(text) ||
          (/(wrong|incorrect|not right|mis-?identif|mis-?label|that'?s not|this is ?n'?t|isn'?t)/i.test(text) &&
           /(sport|shot|shots|game|badminton|swimming|swim|basketball|tennis|football|soccer|cricket|volleyball|table[ -]?tennis|pickleball|squash|golf)/i.test(text))
        )
      ) {
        reanalyzeFiredRef.current = true;
        cancelTts();
        const ack = "Good catch — let me re-watch the full video and analyze it again from scratch. One moment…";
        setMessages((prev) => [
          ...prev,
          { role: "user", text, t: Date.now() },
          { role: "coach", text: ack, t: Date.now() },
        ]);
        if (readAloud) { try { speakWithCoachVoice(ack); } catch {} }
        onRequestReanalyze();
        return;
      }

      // Support / help / report-a-problem intent → forward to the support team
      // (Telegram admin alert + support@formanti.com) instead of trying to
      // answer it as a coaching question. Tight phrasing so normal "help me
      // improve my smash" doesn't trigger it.
      if (
        /\b(report (a |this )?(bug|problem|issue|error)|contact (support|a human|someone)|talk to (a )?(human|support|someone|person|agent)|customer (support|service|care)|raise a (ticket|complaint)|file a complaint|refund|money back|reach support|email support|app (is )?(not working|broken|crashing|down)|payment (issue|problem|failed|not working)|charged.*(twice|wrong|fail)|lost my tokens|tokens.*(missing|deducted|not added))\b/i.test(text)
      ) {
        cancelTts();
        const ctx = `sport=${analysisContext?.sport || ""}; shots=${Array.isArray(result?.shots) ? result.shots.length : 0}`;
        api.post("/support-request", { message: text, context: ctx }).catch(() => {});
        const ack = "I've passed this to our support team — they'll follow up at support@formanti.com. Is there anything about your analysis I can help with in the meantime?";
        setMessages((prev) => [
          ...prev,
          { role: "user", text, t: Date.now() },
          { role: "coach", text: ack, t: Date.now() },
        ]);
        if (readAloud) { try { speakWithCoachVoice(ack); } catch {} }
        return;
      }

      // Cancel any in-flight TTS so we hear the new reply, not the old one.
      cancelTts();
      setError("");

      const userMsg = { role: "user", text, t: Date.now() };
      const placeholder = {
        role: "coach",
        text: "",
        t: Date.now(),
        streaming: true,
      };
      // Build the history we send to the backend BEFORE appending the new
      // user message — server prompt format wants {history, user_message}.
      const historyForApi = messages
        .filter((m) => !m.streaming && m.text)
        .slice(-MAX_HISTORY_TURNS_FOR_API)
        .map((m) => ({ role: m.role, text: m.text }));

      setMessages((prev) => [...prev, userMsg, placeholder]);
      setStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const backendUrl = API_ORIGIN; // same-origin (see api.js) — avoids formanti→atheonics CORS
      const url = `${backendUrl}/api/coach/voice-chat`;
      const token = (() => {
        try {
          return localStorage.getItem("playsmart_token");
        } catch {
          return null;
        }
      })();

      // Audio strategy: stream the TEXT (so users see it appearing as
      // Gemini types) but speak the WHOLE reply in a single TTS call
      // once it's complete. Previously each sentence was its own TTS
      // request which left an audible gap after every full stop while
      // the next sentence's audio downloaded — users perceived it as
      // "the coach stopped". One call = the TTS engine handles all
      // internal punctuation with native prosody, zero seams.
      let fullText = "";
      let httpStatus = 0;
      try {
        const res = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            analysis_id: analysisId,
            session_id: sessionIdRef.current,
            history: historyForApi,
            user_message: text,
            analysis_context: analysisContext,
          }),
        });
        httpStatus = res.status;
        if (!res.ok || !res.body) {
          let detail = "";
          try {
            const j = await res.json();
            detail = j?.detail?.error || j?.detail || j?.error || "";
          } catch {
            /* noop */
          }
          if (res.status === 402) {
            throw new Error("You need more tokens to chat with the voice coach.");
          }
          throw new Error(detail || `Coach unavailable (HTTP ${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;
        while (!done) {
          const { value, done: rdDone } = await reader.read();
          if (rdDone) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by \n\n
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            // Parse first; ONLY a JSON-parse failure is "skip malformed frame".
            // Previously an error-frame `throw` was caught by this same try,
            // so backend errors (timeouts, Gemini stops) were silently
            // swallowed and the reply just appeared truncated with no reason.
            let evt;
            try {
              evt = JSON.parse(payload);
            } catch (parseErr) {
              continue; // malformed SSE frame — skip it, keep streaming
            }
            if (evt.done) {
              done = true;
              break;
            }
            if (typeof evt.chunk === "string" && evt.chunk) {
              fullText += evt.chunk;
              setMessages((prev) => {
                const copy = prev.slice();
                for (let i = copy.length - 1; i >= 0; i--) {
                  if (copy[i].streaming) {
                    copy[i] = { ...copy[i], text: fullText };
                    break;
                  }
                }
                return copy;
              });
            }
            if (evt.error) {
              // Propagates to the outer catch → surfaces to the user instead
              // of being hidden behind a half-finished reply.
              throw new Error(String(evt.error).slice(0, 200));
            }
          }
        }
      } catch (e) {
        const msg =
          e?.name === "AbortError"
            ? "Stopped."
            : e?.message || "Coach unavailable. Try again in a moment.";
        setMessages((prev) => {
          const copy = prev.slice();
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].streaming) {
              copy[i] = {
                role: "coach",
                text: fullText || msg,
                error: !fullText,
                t: copy[i].t,
              };
              break;
            }
          }
          return copy;
        });
        if (!fullText) setError(msg);
        setStreaming(false);
        abortControllerRef.current = null;
        if (httpStatus === 402) return;
        return;
      }

      // Finalise the streaming message → mark as complete.
      const finalText = fullText.trim();
      setMessages((prev) => {
        const copy = prev.slice();
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].streaming) {
            copy[i] = {
              role: "coach",
              text: finalText || "(no reply)",
              t: copy[i].t,
            };
            break;
          }
        }
        return copy;
      });
      setStreaming(false);
      abortControllerRef.current = null;

      // Speak the reply ONLY if the user turned "Read aloud" on. Default off:
      // the reply is already on screen as text, so we skip TTS to save cost.
      if (finalText && readAloud) {
        setCoachTalking(true);
        const ctrl = speakWithCoachVoice(finalText, {
          voiceKey: coachVoiceKey,
          onStart: () => setCoachTalking(true),
          onEnd: () => setCoachTalking(false),
          onEngineFallback: () => setLastEngine("browser"),
        });
        ttsControllerRef.current = ctrl;
        try {
          await ctrl;
          setLastEngine(ctrl.engine || null);
        } finally {
          setCoachTalking(false);
          if (ttsControllerRef.current === ctrl) {
            ttsControllerRef.current = null;
          }
        }
      }
    },
    [
      messages,
      analysisId,
      analysisContext,
      streaming,
      cancelTts,
      coachVoiceKey,
      onRequestReanalyze,
      readAloud,
    ],
  );

  // Keep the recognizer's onFinal closure pointed at the freshest
  // sendUserMessage (which captures the current `messages`).
  useEffect(() => {
    sendUserMessageRef.current = sendUserMessage;
  }, [sendUserMessage]);

  // ─── Push-to-talk handlers ───────────────────────────────────────
  const handleMicDown = useCallback(() => {
    if (!supported || streaming) return;
    cancelTts();
    setError("");
    setInterimText("");
    lastFinalRef.current = "";
    const rec = ensureRecognizer();
    if (!rec || !rec.isSupported()) {
      setError("Speech recognition unavailable in this browser.");
      return;
    }
    // Start recognition SYNCHRONOUSLY inside the tap gesture. Previously we
    // `await startMicAnalyser()` first, which yielded to the event loop and
    // dropped the user-gesture context — so the first press silently did
    // nothing and only the 2nd worked. The waveform analyser is cosmetic, so
    // we kick it off (fire-and-forget) AFTER recognition has started.
    try { rec.start(); } catch { /* already running */ }
    setListening(true);
    startMicAnalyser().catch(() => {});
  }, [supported, streaming, cancelTts, startMicAnalyser, ensureRecognizer]);

  const handleMicUp = useCallback(() => {
    if (continuousMode) return; // ignore; toggle handles it
    try {
      recognizerRef.current?.stop?.();
    } catch {
      /* noop */
    }
    setListening(false);
    // Tiny delay so the final result has a chance to land before send.
    setTimeout(() => {
      const txt = lastFinalRef.current || interimText;
      lastFinalRef.current = "";
      setInterimText("");
      if (txt && txt.trim().length >= 1) {
        sendUserMessage(txt);
      }
    }, 250);
  }, [continuousMode, interimText, sendUserMessage]);

  // Global pointer-up listener while the mic is held. The button's
  // own onPointerUp handler can miss the release event when:
  //   - finger slides off the button before lifting (mobile)
  //   - touch is cancelled by OS gesture (notification, call, etc.)
  //   - user clicks elsewhere while mouse button still down
  // Without this, the recognizer would stay listening indefinitely and
  // the UI would look frozen. We tear down on ANY release event while
  // listening, then let the existing handleMicUp handle the send.
  useEffect(() => {
    if (!listening || continuousMode) return undefined;
    const onAnyUp = () => {
      handleMicUp();
    };
    // 8-second hard cap. Speech-recognition timeouts vary by browser
    // (Chrome ~10s, Safari ~5s, sometimes infinite on iOS), so we own
    // the upper bound. If the user is still actively dictating after
    // 8s we'll have already received final results piecemeal.
    const watchdog = setTimeout(() => {
      handleMicUp();
    }, 8000);
    window.addEventListener("pointerup", onAnyUp);
    window.addEventListener("pointercancel", onAnyUp);
    window.addEventListener("blur", onAnyUp);
    return () => {
      window.removeEventListener("pointerup", onAnyUp);
      window.removeEventListener("pointercancel", onAnyUp);
      window.removeEventListener("blur", onAnyUp);
      clearTimeout(watchdog);
    };
  }, [listening, continuousMode, handleMicUp]);

  const toggleContinuous = useCallback(() => {
    setContinuousMode((prev) => {
      const next = !prev;
      // Stop any current session — recognizer will be rebuilt.
      try {
        recognizerRef.current?.stop?.();
      } catch {
        /* noop */
      }
      setListening(false);
      setInterimText("");
      return next;
    });
  }, []);

  const handleContinuousStart = useCallback(async () => {
    if (!continuousMode) return;
    if (listening || streaming) return;
    cancelTts();
    setError("");
    const ok = await startMicAnalyser();
    if (!ok) return;
    const rec = ensureRecognizer();
    if (!rec || !rec.isSupported()) return;
    rec.start();
    setListening(true);
  }, [
    continuousMode,
    listening,
    streaming,
    cancelTts,
    startMicAnalyser,
    ensureRecognizer,
  ]);

  const handleContinuousStop = useCallback(() => {
    try {
      recognizerRef.current?.stop?.();
    } catch {
      /* noop */
    }
    setListening(false);
  }, []);

  // ─── Session controls ────────────────────────────────────────────
  const handleNewConversation = useCallback(() => {
    cancelTts();
    abortInFlight();
    setMessages([]);
    setInterimText("");
    sessionIdRef.current = newSessionId();
  }, [cancelTts, abortInFlight]);

  const handleClearAll = useCallback(() => {
    handleNewConversation();
    if (analysisId) clearTranscripts(analysisId);
    setHistoryEntries([]);
  }, [analysisId, handleNewConversation]);

  const handleDownload = useCallback(() => {
    if (messages.length === 0) return;
    try {
      const blob = new Blob(
        [formatTranscriptForDownload(messages, analysisContext)],
        { type: "text/plain;charset=utf-8" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `athlytic-coach-transcript-${ts}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    }
  }, [messages, analysisContext]);

  // ─── Gate: only mount when an analysis with shots exists ─────────
  if (!result || shotCount === 0) return null;

  // ─── Floating pill (closed) ──────────────────────────────────────
  // Two anchors:
  //   - Desktop / tablet (>=sm): bottom-left so it doesn't fight the
  //     AnalysisScroller right-rail OR the existing VirtualCoach pill
  //     (both anchored right side). Left side is otherwise empty.
  //   - Mobile (<sm): bottom-center pill stacked above the scroller
  //     mobile pill. Both share the bottom rail but at different
  //     vertical offsets.
  // We also add a subtle continuous lime ring pulse so the button is
  // genuinely impossible to miss — the previous version blended into
  // the page on dark backgrounds.
  if (!open) {
    return (
      <>
        {/* Continuous attention-pulse — keyed off the button itself via
            an absolutely-positioned sibling so we don't fight the
            button's hover animation. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Talk to your coach"
          // Mobile: anchor well above the safe-area / browser chrome
          // (iOS Safari URL bar + home indicator combined eat ~80-120px
          // off the bottom; bottom-5 was hiding the pill behind them).
          // Desktop: original bottom-left position.
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          className="fixed z-50 group inline-flex items-center gap-2 bg-lime-400 hover:bg-lime-300 text-black rounded-full pl-3 pr-4 py-3 shadow-2xl shadow-lime-400/50 transition-all hover:scale-105 active:scale-95
                     left-4 bottom-24
                     sm:left-5 sm:bottom-5"
        >
          {/* Pulse halo behind the button — pointer-events-none so it
              doesn't intercept clicks. */}
          <span aria-hidden className="absolute inset-0 rounded-full bg-lime-400/40 animate-ping pointer-events-none" />
          <span className="relative inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/10">
            <Mic className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          </span>
          <span className="relative text-sm font-bold whitespace-nowrap">
            Talk to Virtual Coach
          </span>
        </button>
      </>
    );
  }

  // ─── Expanded panel ──────────────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        key="lvc-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex md:items-stretch md:justify-end items-end justify-center pointer-events-none"
      >
        {/* Backdrop — mobile only; desktop keeps the page interactive. */}
        <div
          className="absolute inset-0 bg-black/40 md:hidden pointer-events-auto"
          onClick={() => setOpen(false)}
          aria-hidden
        />
        <motion.div
          key="lvc-panel"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="relative pointer-events-auto bg-zinc-900 border border-zinc-700/80 text-zinc-100 shadow-2xl shadow-black/60
                     w-full md:w-[400px] md:h-screen md:rounded-none rounded-t-3xl
                     flex flex-col max-h-[88vh] md:max-h-screen"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-gradient-to-r from-lime-400/15 via-emerald-400/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-lime-300 to-emerald-500 flex items-center justify-center shadow-lg shadow-lime-500/30">
                <Sparkles className="w-4 h-4 text-black" />
                {coachTalking && (
                  <>
                    <motion.span
                      className="absolute inset-0 rounded-2xl ring-2 ring-lime-300"
                      initial={{ opacity: 0.7, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.6 }}
                      transition={{
                        duration: 1.3,
                        repeat: Infinity,
                        ease: "easeOut",
                      }}
                    />
                    <motion.span
                      className="absolute inset-0 rounded-2xl ring-2 ring-emerald-400/70"
                      initial={{ opacity: 0.5, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.85 }}
                      transition={{
                        duration: 1.3,
                        repeat: Infinity,
                        ease: "easeOut",
                        delay: 0.3,
                      }}
                    />
                  </>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">
                  Live Coach
                </p>
                <p className="text-[10px] text-zinc-500 leading-tight">
                  {sportLabel ? `${sportLabel} · ` : ""}
                  Grounded in your {shotCount} shot{shotCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                aria-label="Saved transcripts"
                title="Saved transcripts (last 3)"
                className={`p-1.5 rounded-lg hover:bg-zinc-800 ${
                  showHistory ? "text-lime-300" : "text-zinc-400 hover:text-white"
                }`}
              >
                <History className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close coach"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <ChevronDown className="w-4 h-4 md:hidden" />
                <X className="w-4 h-4 hidden md:block" />
              </button>
            </div>
          </div>

          {/* History sub-panel */}
          {showHistory && (
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
                Saved transcripts (this analysis)
              </p>
              {historyEntries.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Nothing saved yet — your conversation auto-saves locally.
                </p>
              ) : (
                <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {historyEntries.map((h, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-zinc-400 truncate">
                        {new Date(h.saved_at).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setMessages(
                            Array.isArray(h.messages) ? h.messages : [],
                          );
                          setShowHistory(false);
                        }}
                        className="text-lime-300 hover:text-lime-200 font-semibold uppercase tracking-wider text-[10px]"
                      >
                        Load
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Transcript */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm"
          >
            {!supported && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-amber-100 text-xs leading-relaxed">
                Voice mode isn't supported on your browser — try Chrome or
                Edge on desktop. You can still keep using the analysis
                results, and the regular Virtual Coach (text) chat works
                here.
              </div>
            )}

            {supported && messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-800/50 px-3.5 py-3">
                  <p className="text-white font-semibold text-sm mb-1">
                    Ask me about your session.
                  </p>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    I watched your clip. Press and hold the mic to ask
                    anything — like “why was my smash weak?” or “what
                    should I work on first?”.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "What should I work on first?",
                    "Why did you flag my form?",
                    "Give me one drill for tomorrow.",
                  ].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => sendUserMessage(s)}
                      disabled={streaming}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-800 hover:border-lime-400/40 text-zinc-300 hover:text-white disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] bg-lime-400 text-black rounded-2xl rounded-br-md px-3.5 py-2 text-sm font-medium"
                      : `max-w-[92%] ${
                          m.error
                            ? "bg-red-500/10 border border-red-500/30"
                            : "bg-zinc-800/70 border border-zinc-800"
                        } rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm text-zinc-100`
                  }
                >
                  {m.text || (
                    <span className="inline-flex items-center gap-1 text-zinc-400 text-xs">
                      <span className="inline-block w-1.5 h-1.5 bg-lime-400 rounded-full animate-pulse" />
                      Coach is thinking…
                    </span>
                  )}
                  {m.streaming && m.text && (
                    <span className="inline-block w-1.5 h-1.5 bg-lime-300 rounded-full ml-1 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            ))}

            {/* Live interim transcript bubble */}
            {interimText && (
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-lime-400/30 text-lime-50 rounded-2xl rounded-br-md px-3.5 py-2 text-sm italic">
                  {interimText}
                  <span className="inline-block w-1 h-1 bg-lime-300 rounded-full ml-1 animate-pulse align-middle" />
                </div>
              </div>
            )}
          </div>

          {/* Error strip */}
          {error && (
            <div className="px-4 pb-2">
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-[11px] text-red-200">
                {error}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="border-t border-zinc-800 px-4 pt-3 pb-4 bg-zinc-900">
            <WaveformCanvas analyser={analyserRef.current} active={listening} />

            <div className="mt-3 flex items-center justify-between gap-2">
              {/* Mic / continuous control */}
              {continuousMode ? (
                <button
                  type="button"
                  onClick={listening ? handleContinuousStop : handleContinuousStart}
                  disabled={!supported || streaming}
                  className={`flex items-center gap-2 px-4 h-12 rounded-full font-bold transition-colors ${
                    listening
                      ? "bg-red-500 hover:bg-red-400 text-white"
                      : "bg-lime-400 hover:bg-lime-300 text-black"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {listening ? (
                    <>
                      <MicOff className="w-4 h-4" /> Stop
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" /> Listen
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  // Pointer events unify mouse / touch / pen with a
                  // single code path — much more reliable than
                  // onMouse* + onTouch* duplication, especially on
                  // mobile Safari where touch handlers occasionally
                  // dropped onTouchEnd and left the mic stuck on.
                  // The window-level pointerup listener (declared
                  // above) covers releases that happen off-button.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleMicDown();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    handleMicUp();
                  }}
                  onPointerCancel={() => handleMicUp()}
                  // Touch fallback for browsers (rare) that don't
                  // synthesize pointer events. preventDefault stops
                  // iOS double-tap-zoom from firing.
                  onTouchStart={(e) => e.preventDefault()}
                  onTouchEnd={(e) => e.preventDefault()}
                  disabled={!supported || streaming}
                  className={`flex items-center gap-2 px-4 h-12 rounded-full font-bold transition-all select-none touch-none ${
                    listening
                      ? "bg-lime-400 text-black ring-4 ring-lime-400/30 scale-105"
                      : "bg-lime-400 hover:bg-lime-300 text-black"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-label={listening ? "Tap to stop and send" : "Hold to talk, or tap to start"}
                  title="Hold to talk · or tap to start / stop"
                >
                  <Mic className="w-4 h-4" />
                  {listening ? "Listening… (tap to send)" : "Hold to Talk"}
                </button>
              )}

              {/* Read-aloud toggle — default OFF: replies are shown as text,
                  so we don't spend TTS on every turn. Flip on for hands-free. */}
              <button
                type="button"
                onClick={() => { if (readAloud) cancelTts(); setReadAloud((v) => !v); }}
                aria-pressed={readAloud}
                title={readAloud ? "Coach reads replies aloud" : "Replies are text only"}
                className={`flex items-center gap-1.5 px-3 h-10 rounded-full text-xs font-semibold border transition-colors ${
                  readAloud
                    ? "bg-lime-400/15 border-lime-400/40 text-lime-200"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Volume2 className="w-4 h-4" />
                {readAloud ? "Voice on" : "Voice off"}
              </button>

              {/* Coach interrupt */}
              {coachTalking && (
                <button
                  type="button"
                  onClick={cancelTts}
                  className="flex items-center gap-1.5 px-3 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold"
                  aria-label="Interrupt coach"
                >
                  <StopCircle className="w-4 h-4" />
                  Interrupt
                </button>
              )}

              {/* Streaming indicator (waiting for first token) */}
              {!coachTalking && streaming && (
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span className="inline-block w-1.5 h-1.5 bg-lime-400 rounded-full animate-pulse" />
                  Coach is thinking…
                </div>
              )}

              {coachTalking && (
                <div className="flex items-center gap-1.5 text-[11px] text-lime-300">
                  <motion.span
                    className="inline-flex items-center gap-0.5"
                    aria-hidden
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="block w-[3px] h-3 rounded-full bg-lime-300"
                        animate={{ scaleY: [0.4, 1, 0.4] }}
                        transition={{
                          duration: 0.9,
                          repeat: Infinity,
                          delay: i * 0.15,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </motion.span>
                  <span>
                    {lastEngine === "browser"
                      ? "Coach is talking · device voice"
                      : "Coach is talking"}
                  </span>
                </div>
              )}
            </div>

            {/* Type-to-coach: a text box so users can chat without using the
                mic at all (mic STT is unreliable on first press in some
                browsers; typing always works). */}
            <form
              className="mt-3 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = (typedText || "").trim();
                if (!t || streaming) return;
                setTypedText("");
                sendUserMessage(t);
              }}
            >
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Type a question for your coach…"
                className="flex-1 min-w-0 h-10 px-3 rounded-full bg-zinc-800/80 border border-zinc-700 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
                disabled={streaming}
              />
              <button
                type="submit"
                disabled={streaming || !typedText.trim()}
                className="h-10 px-4 rounded-full bg-lime-400 text-black font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-lime-500"
              >
                Send
              </button>
            </form>

            {/* Mode + secondary controls */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleContinuous}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  continuousMode
                    ? "bg-lime-400/15 border border-lime-400/50 text-lime-300"
                    : "bg-zinc-800/70 border border-zinc-800 text-zinc-300 hover:text-white"
                }`}
                aria-pressed={continuousMode}
                title="Toggle continuous-listen mode"
              >
                <Radio className="w-3 h-3" />
                {continuousMode ? "Continuous" : "Push to talk"}
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleNewConversation}
                  className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                  aria-label="New conversation"
                  title="New conversation"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={messages.length === 0}
                  className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Save transcript"
                  title="Download transcript"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={messages.length === 0 && historyEntries.length === 0}
                  className="p-2 rounded-lg text-zinc-400 hover:text-red-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Clear all"
                  title="Clear current + saved transcripts"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-zinc-600 leading-relaxed">
              Type or talk to your coach · 5 tokens per reply.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
