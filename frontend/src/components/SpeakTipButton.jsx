import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2, Square } from "lucide-react";

// Per-shot "Listen" — speaks one or more conversational coaching lines
// via window.speechSynthesis. Zero-dep, zero-cost, works offline.
//
// Built deliberately small (~5-15s of speech per shot) so users can
// stack multiple plays without context-bleed. We pick the same kind of
// voice the session-level VoiceCoachButton prefers (local + premium-ish)
// so the timbre stays consistent across the page.

function pickVoice(voices) {
  if (!voices?.length) return null;
  const en = voices.filter((v) => /^en[-_]?/i.test(v.lang || ""));
  const pool = en.length ? en : voices;
  const local = pool.filter((v) => v.localService);
  const base = local.length ? local : pool;
  const premium = base.filter((v) =>
    /(natural|neural|premium|enhanced|siri|aria|jenny|guy)/i.test(v.name || "")
  );
  return premium[0] || base[0];
}

function cleanForSpeech(s) {
  return String(s || "")
    .replace(/[#*_`~>]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function SpeakTipButton({
  text,
  prefix = "",
  className = "",
  size = "sm",
  label = "Listen",
}) {
  const supported = typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof window.SpeechSynthesisUtterance !== "undefined";

  const [voices, setVoices] = useState([]);
  const [state, setState] = useState("idle"); // idle | playing
  const utteranceRef = useRef(null);

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices() || []);
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, [supported]);

  useEffect(() => {
    return () => {
      if (!supported) return;
      try { window.speechSynthesis.cancel(); } catch {}
    };
  }, [supported]);

  const voice = useMemo(() => pickVoice(voices), [voices]);

  const script = useMemo(() => {
    const body = cleanForSpeech(text);
    if (!body) return "";
    const pre = cleanForSpeech(prefix);
    if (!pre) return body;
    return /[.!?]$/.test(pre) ? `${pre} ${body}` : `${pre}. ${body}`;
  }, [text, prefix]);

  const stop = useCallback(() => {
    if (!supported) return;
    try { window.speechSynthesis.cancel(); } catch {}
    utteranceRef.current = null;
    setState("idle");
  }, [supported]);

  const play = useCallback((e) => {
    if (e) e.stopPropagation();
    if (!supported || !script) return;
    // Always cancel anything in flight — TTS wedges otherwise (especially Chrome).
    try { window.speechSynthesis.cancel(); } catch {}

    const u = new SpeechSynthesisUtterance(script);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "en-US";
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;
    u.onstart = () => setState("playing");
    u.onend = () => { utteranceRef.current = null; setState("idle"); };
    u.onerror = () => { utteranceRef.current = null; setState("idle"); };
    utteranceRef.current = u;
    // Synchronous speak() is required for iOS Safari to actually fire.
    window.speechSynthesis.speak(u);
  }, [supported, script, voice]);

  if (!supported || !script) return null;

  const sizeClasses = size === "xs"
    ? "px-2 py-0.5 text-[10px]"
    : "px-2.5 py-1 text-[11px]";

  if (state === "playing") {
    return (
      <button
        type="button"
        onClick={stop}
        aria-label="Stop coach voice"
        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded-full bg-lime-400/15 border border-lime-400/50 text-lime-300 hover:bg-lime-400/25 transition-colors ${sizeClasses} ${className}`}
      >
        <Square className="w-3 h-3 fill-current" />
        Stop
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={play}
      aria-label={`${label} — coach voice`}
      title="Hear this tip in the coach's voice"
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded-full bg-zinc-800/80 border border-lime-400/30 text-lime-300 hover:bg-lime-400/10 hover:border-lime-400/60 transition-colors ${sizeClasses} ${className}`}
    >
      <Volume2 className="w-3 h-3" />
      {label}
    </button>
  );
}
