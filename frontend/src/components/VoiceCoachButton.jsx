import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Volume2, Pause, Play, Square, Mic } from "lucide-react";

/**
 * VoiceCoachButton
 * ----------------
 * "Listen to coach" — speaks a 30-60s summary of the analysis using the
 * browser's native window.speechSynthesis API. Zero cost, zero deps,
 * works offline.
 *
 * Props:
 *   result    — analysis result object (shot_analysis, coach_feedback,
 *               vlm_coaching, coaching, shots, skill_level, sport, ...)
 *   narrative — optional coaching-narrative payload
 *               ({ summary, strengths[], improvements[], next_focus })
 *               that MatchInsights generates. Self-contained: if absent,
 *               we fall back to fields available on `result`.
 *
 * Browser quirks (documented honestly):
 *   - iOS Safari: speech only starts after a direct user gesture, so the
 *     click handler calls speechSynthesis.speak() synchronously.
 *   - Android Chrome: onboundary doesn't always fire. We fall back to a
 *     setInterval-based progress estimate that uses an estimated WPM.
 *   - Some Chrome builds cut off long utterances after ~15s. The script
 *     is intentionally kept under ~140 words (~45-50s) to stay safe.
 *   - getVoices() is async — it returns [] on first call in Chrome until
 *     the 'voiceschanged' event fires. We listen for it.
 */
export default function VoiceCoachButton({ result, narrative }) {
  // Detect TTS support. If unsupported, we render nothing.
  const supported = typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof window.SpeechSynthesisUtterance !== "undefined";

  const [state, setState] = useState("idle"); // idle | playing | paused
  const [voices, setVoices] = useState([]);
  const [voicePref, setVoicePref] = useState("auto"); // auto | female | male
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [estimatedMs, setEstimatedMs] = useState(45000);

  const utteranceRef = useRef(null);
  const startTimeRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pauseStartRef = useRef(0);
  const tickRef = useRef(null);

  // Load voices. Chrome returns [] until 'voiceschanged' fires.
  useEffect(() => {
    if (!supported) return;
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices() || [];
      setVoices(v);
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices);
    };
  }, [supported]);

  // Cleanup on unmount — never leave hanging speech.
  useEffect(() => {
    return () => {
      if (supported) {
        try { window.speechSynthesis.cancel(); } catch (_) { /* noop */ }
      }
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [supported]);

  // ── Script generation ────────────────────────────────────────────────
  // Built fresh on each click. Each section is independently skipped if
  // the underlying data is missing. Target: ~140 words / ~45s of speech.
  const buildScript = useCallback(() => {
    const lines = [];
    const r = result || {};
    const n = narrative || {};
    const shot = r.shot_analysis || {};
    const coach = r.coach_feedback || {};
    const vlm = r.vlm_coaching || {};
    const coaching = r.coaching || {};
    const shotsArr = Array.isArray(r.shots) ? r.shots : [];

    // 1. Opening — N shots watched.
    const shotCount = shotsArr.length || r.total_shots || 0;
    if (shotCount > 0) {
      lines.push(`Great session! I watched your ${shotCount} ${shotCount === 1 ? "shot" : "shots"} — here's what stood out.`);
    } else {
      lines.push("Great session! Here's what stood out from your clip.");
    }

    // 2. Skill level.
    const skill = r.skill_level || shot.skill_level || coach.skill_level;
    if (skill && /^[A-Za-z\s-]+$/.test(String(skill))) {
      lines.push(`I'd put you at ${skill} level for this clip.`);
    }

    // 3. What's working — prefer narrative.strengths, then coach_feedback.strengths,
    //    then vlm motivational_message, then coaching.header.summary.
    const strength = pickStrength({ narrative: n, coach, vlm, coaching });
    if (strength) lines.push(strength);

    // 4. Top fix — biggest thing to work on. Prefer narrative.improvements,
    //    then coach_feedback.top_issues / shot.weaknesses, then vlm key focus.
    const topFix = pickTopFix({ narrative: n, coach, vlm, shot });
    if (topFix) lines.push(`The biggest thing to work on is ${topFix}`);

    // 5. Drill prompt.
    const drill = pickDrill({ vlm, coaching, result: r });
    if (drill) lines.push(drill);

    // 6. Closing.
    lines.push("Upload your next session in a few days so I can track your progress.");

    // Stitch and lightly clean — strip emojis & markdown bullets that don't
    // belong in spoken audio.
    const text = lines
      .join(" ")
      .replace(/[#*_`~>]/g, "")
      .replace(/\s+/g, " ")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .trim();
    return text;
  }, [result, narrative]);

  // ── Voice selection ──────────────────────────────────────────────────
  const chosenVoice = useMemo(() => {
    if (!voices.length) return null;
    // English-only candidates, prefer local (no network call needed).
    const en = voices.filter((v) => /^en[-_]?/i.test(v.lang || ""));
    const pool = en.length ? en : voices;
    const local = pool.filter((v) => v.localService);
    const base = local.length ? local : pool;

    // Prefer "natural" / "neural" / "premium" voices when present —
    // these are the OS-shipped higher-quality voices (e.g. macOS Siri,
    // Microsoft Aria/Jenny Online).
    const isPremium = (v) => /(natural|neural|premium|enhanced|siri|aria|jenny|guy)/i.test(v.name || "");
    const isFemale = (v) => /(female|woman|aria|jenny|samantha|zira|allison|susan|tessa|kate|moira|fiona|google us english)/i.test(v.name || "");
    const isMale = (v) => /(male|man|guy|david|mark|alex|daniel|fred|tom|oliver)/i.test(v.name || "");

    let candidates = base;
    if (voicePref === "female") {
      const f = base.filter(isFemale);
      if (f.length) candidates = f;
    } else if (voicePref === "male") {
      const m = base.filter(isMale);
      if (m.length) candidates = m;
    }

    const premium = candidates.filter(isPremium);
    if (premium.length) return premium[0];
    return candidates[0];
  }, [voices, voicePref]);

  // ── Progress tracking ────────────────────────────────────────────────
  // Two paths: onboundary (per-word, Chrome desktop / Edge) and a tick
  // fallback (Android, some Safari versions). Either updates elapsedMs.
  const startTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      if (!startTimeRef.current) return;
      const now = performance.now();
      const elapsed = now - startTimeRef.current - pausedAccumRef.current;
      setElapsedMs(Math.max(0, elapsed));
    }, 200);
  }, []);

  const stopTick = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  // ── Playback control ─────────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    if (!supported) return;
    // Always cancel anything in flight — TTS can wedge if you don't.
    try { window.speechSynthesis.cancel(); } catch (_) { /* noop */ }

    const script = buildScript();
    if (!script || script.length < 5) return;

    // Word count → estimated duration at ~180 wpm (3 wps) for natural TTS.
    const words = script.split(/\s+/).filter(Boolean).length;
    const estMs = Math.max(8000, Math.round((words / 3) * 1000));
    setEstimatedMs(estMs);

    const u = new SpeechSynthesisUtterance(script);
    if (chosenVoice) u.voice = chosenVoice;
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;
    u.lang = chosenVoice?.lang || "en-US";

    u.onstart = () => {
      startTimeRef.current = performance.now();
      pausedAccumRef.current = 0;
      setElapsedMs(0);
      setState("playing");
      startTick();
    };
    u.onboundary = (e) => {
      // charIndex / script.length gives proportional progress — more
      // accurate than wall-clock when rate changes mid-stream.
      if (typeof e.charIndex === "number" && script.length > 0) {
        const ratio = Math.min(1, e.charIndex / script.length);
        setElapsedMs(ratio * estMs);
      }
    };
    u.onend = () => {
      stopTick();
      setElapsedMs(estMs);
      setState("idle");
      utteranceRef.current = null;
      // Brief pause so the user sees "complete" before resetting.
      setTimeout(() => setElapsedMs(0), 600);
    };
    u.onerror = () => {
      stopTick();
      setState("idle");
      utteranceRef.current = null;
      setElapsedMs(0);
    };

    utteranceRef.current = u;
    // CRITICAL: speak() must be called synchronously from the click handler
    // for iOS Safari. No setTimeout, no microtask deferral.
    window.speechSynthesis.speak(u);
  }, [supported, buildScript, chosenVoice, startTick, stopTick]);

  const handlePause = useCallback(() => {
    if (!supported) return;
    try {
      window.speechSynthesis.pause();
      pauseStartRef.current = performance.now();
      setState("paused");
    } catch (_) { /* noop */ }
  }, [supported]);

  const handleResume = useCallback(() => {
    if (!supported) return;
    try {
      window.speechSynthesis.resume();
      if (pauseStartRef.current) {
        pausedAccumRef.current += performance.now() - pauseStartRef.current;
        pauseStartRef.current = 0;
      }
      setState("playing");
    } catch (_) { /* noop */ }
  }, [supported]);

  const handleStop = useCallback(() => {
    if (!supported) return;
    try { window.speechSynthesis.cancel(); } catch (_) { /* noop */ }
    stopTick();
    setState("idle");
    setElapsedMs(0);
    utteranceRef.current = null;
  }, [supported, stopTick]);

  // Hide the component entirely on unsupported browsers.
  if (!supported) return null;

  const totalSec = Math.max(1, Math.round(estimatedMs / 1000));
  const elapsedSec = Math.min(totalSec, Math.round(elapsedMs / 1000));
  const progressPct = Math.min(100, (elapsedMs / estimatedMs) * 100);

  // ── Render ───────────────────────────────────────────────────────────
  if (state === "idle") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handlePlay}
          aria-label="Listen to coach summary"
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-full
                     bg-zinc-900/80 border border-lime-400/30 text-lime-300
                     hover:bg-lime-400/10 hover:border-lime-400/60 hover:text-lime-200
                     transition-colors text-sm font-semibold whitespace-nowrap"
        >
          <Volume2 className="w-4 h-4" />
          Listen to coach
          <span className="text-zinc-500 text-xs font-normal">(~{totalSec}s)</span>
        </button>
        <VoicePicker
          value={voicePref}
          onChange={setVoicePref}
          open={voicePickerOpen}
          setOpen={setVoicePickerOpen}
          chosenName={chosenVoice?.name}
        />
      </div>
    );
  }

  // playing / paused state — pill morphs into a player.
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div
        role="group"
        aria-label="Voice coach player"
        className="inline-flex items-center gap-2 min-h-[44px] pl-3 pr-2 py-2 rounded-full
                   bg-zinc-900 border border-lime-400/50 text-lime-300 max-w-full"
      >
        <button
          type="button"
          onClick={state === "playing" ? handlePause : handleResume}
          aria-label={state === "playing" ? "Pause" : "Resume"}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full
                     bg-lime-400/15 hover:bg-lime-400/25 text-lime-300"
        >
          {state === "playing" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
        </button>
        <div className="flex items-center gap-2 min-w-[120px]">
          <span className="text-xs font-mono tabular-nums text-zinc-300">
            {fmt(elapsedSec)} / {fmt(totalSec)}
          </span>
          <div className="w-16 sm:w-24 h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-lime-400 transition-[width] duration-200 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleStop}
          aria-label="Stop"
          className="inline-flex items-center justify-center w-8 h-8 rounded-full
                     bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
        >
          <Square className="w-3 h-3 fill-current" />
        </button>
      </div>
    </div>
  );
}

// ── Voice picker (secondary control) ───────────────────────────────────
function VoicePicker({ value, onChange, open, setOpen, chosenName }) {
  const label = value === "female" ? "Female" : value === "male" ? "Male" : "Auto";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Voice: ${label}`}
        title={chosenName ? `Voice: ${chosenName}` : `Voice preference: ${label}`}
        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-full
                   bg-zinc-900/60 border border-zinc-800 text-zinc-400
                   hover:border-zinc-700 hover:text-zinc-200 transition-colors text-xs"
      >
        <Mic className="w-3 h-3" />
        Voice: {label}
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-10 mt-1 right-0 min-w-[140px] rounded-xl border border-zinc-800
                     bg-zinc-900 shadow-lg overflow-hidden"
        >
          {["auto", "female", "male"].map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={value === opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`block w-full text-left px-3 py-2 text-xs capitalize
                          ${value === opt ? "bg-lime-400/10 text-lime-300" : "text-zinc-300 hover:bg-zinc-800"}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────
function fmt(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function endWithPeriod(s) {
  const trimmed = String(s || "").trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
  }
  return "";
}

function pickStrength({ narrative, coach, vlm, coaching }) {
  // From the narrative payload (coaching-narrative endpoint).
  const fromNarrative = firstNonEmpty(narrative?.strengths, narrative?.summary);
  if (fromNarrative) return `What's working: ${endWithPeriod(fromNarrative)}`;

  // From per-shot coach feedback aggregated upstream.
  const fromCoach = firstNonEmpty(coach?.strengths);
  if (fromCoach) return `On the upside, ${decap(endWithPeriod(fromCoach))}`;

  // From the VLM motivational line.
  const fromVlm = firstNonEmpty(vlm?.motivational_message);
  if (fromVlm) return endWithPeriod(fromVlm);

  // From the static coaching header summary.
  const fromCoaching = firstNonEmpty(coaching?.header?.summary);
  if (fromCoaching) return endWithPeriod(fromCoaching);
  return "";
}

function pickTopFix({ narrative, coach, vlm, shot }) {
  const fromNarrative = firstNonEmpty(narrative?.improvements, narrative?.next_focus);
  if (fromNarrative) return decap(endWithPeriod(fromNarrative));

  const fromCoach = firstNonEmpty(coach?.top_issues, shot?.weaknesses);
  if (fromCoach) return decap(endWithPeriod(fromCoach));

  const fromVlm = firstNonEmpty(vlm?.key_focus_areas);
  if (fromVlm) return decap(endWithPeriod(fromVlm));
  return "";
}

function pickDrill({ vlm, coaching, result }) {
  // Prefer VLM priority drills — these are tailored to the actual clip.
  const drills = Array.isArray(vlm?.priority_drills) ? vlm.priority_drills : [];
  const d = drills[0];
  if (d && d.name) {
    const mins = Number(d.duration_min);
    if (mins > 0) {
      return `Try a ${d.name} for ${mins} ${mins === 1 ? "minute" : "minutes"} — it'll target exactly what we found.`;
    }
    return `Try a ${d.name} — it'll target exactly what we found.`;
  }
  // Fallback: contextual drills generator already runs on the result, but
  // we don't have access to it here. Try coaching.drills / recommended.
  const cDrills = Array.isArray(coaching?.drills) ? coaching.drills : [];
  const cd = cDrills[0];
  if (cd && (cd.name || typeof cd === "string")) {
    const name = cd.name || cd;
    return `Try the ${name} drill — it'll target exactly what we found.`;
  }
  const recommended = Array.isArray(result?.recommended_drills) ? result.recommended_drills : [];
  const rd = recommended[0];
  if (rd && (rd.name || typeof rd === "string")) {
    const name = rd.name || rd;
    return `Try the ${name} drill — it'll target exactly what we found.`;
  }
  return "";
}

function decap(s) {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
