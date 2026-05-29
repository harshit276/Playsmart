import { useState, useEffect, useRef, useMemo } from "react";
import { Volume2, StopCircle } from "lucide-react";
import { speakWithCoachVoice } from "@/lib/voiceCoach";

/**
 * VoiceCoachButton (auto-narration)
 * ---------------------------------
 * Used to be a click-to-play "Listen to coach" button using the browser's
 * speechSynthesis. Now: as soon as the analysis result lands, it speaks a
 * tight 2-3 line summary through the same Sarvam / ElevenLabs path the
 * Talk-to-Virtual-Coach pill uses — so the user hears a real human voice
 * the moment the page renders, without needing to find and click anything.
 *
 * The render is a small "Coach is reading…" pill with a single Stop
 * control. Once the narration finishes (or the user stops it), the
 * component renders nothing.
 *
 * Props:
 *   result    — analysis result object (used to build the 2-3 line summary)
 *   narrative — optional coaching-narrative payload (preferred source if
 *               present; falls back to result fields when absent)
 */

// Build a 2-3 sentence spoken summary. Kept SHORT on purpose — this fires
// automatically on page load, so a long narration would be intrusive.
function buildAutoSummary(result, narrative) {
  if (!result) return "";
  const r = result;
  const n = narrative || {};
  const shotsArr = Array.isArray(r.shots) ? r.shots : (Array.isArray(r.events) ? r.events : []);
  const shotCount = shotsArr.length || r.total_shots || 0;
  const skill =
    r.overall_skill_level || r.skill_level || r.shot_analysis?.skill_level || "";
  const sport = r.sport || r.sport_detected || "";

  // Prefer the explicit narrative paragraphs from the universal/premium
  // Gemini pass — they're the most coaching-grade text we have.
  const cn = r.coach_narrative || {};
  const intro = String(cn.intro || "").trim();
  const takeaway = String(cn.takeaway || "").trim();
  const improvements = String(cn.improvements_paragraph || "").trim();

  // Pull a single concrete strength + a single concrete fix from whichever
  // source has them. Order: narrative props > coach_narrative paragraphs >
  // generic strings on the result object.
  const firstSentence = (s) => {
    const m = String(s || "").match(/[^.!?]+[.!?]+/);
    return m ? m[0].trim() : String(s || "").trim();
  };

  const opener = shotCount > 0
    ? `Watched your ${shotCount} ${shotCount === 1 ? "shot" : "shots"}${sport ? ` of ${sport}` : ""}${skill ? ` at ${skill} level` : ""}.`
    : `Here's the read on your clip${sport ? ` (${sport})` : ""}.`;

  // Strength line — pull the first sentence of strengths_paragraph or
  // narrative.strengths so we don't dump a paragraph.
  const strength = firstSentence(
    cn.strengths_paragraph || (Array.isArray(n.strengths) ? n.strengths[0] : n.strengths) || ""
  );

  // Fix line — same trim. Prefer the takeaway (already short by design),
  // fall back to first sentence of improvements_paragraph.
  const fix = firstSentence(
    takeaway || (Array.isArray(n.improvements) ? n.improvements[0] : n.improvements) || firstSentence(improvements) || ""
  );

  const lines = [opener];
  if (strength) lines.push(strength);
  if (fix && fix !== strength) lines.push(fix);

  // If we still only have the opener, fall back to the first sentence of
  // result.summary so the user always hears something concrete.
  if (lines.length === 1) {
    const sumFirst = firstSentence(r.summary || intro || "");
    if (sumFirst) lines.push(sumFirst);
  }

  return lines
    .join(" ")
    .replace(/[#*_`~>]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function VoiceCoachButton({ result, narrative }) {
  const summary = useMemo(
    () => buildAutoSummary(result, narrative),
    [result, narrative],
  );
  const [state, setState] = useState("idle"); // idle | playing | done
  const controllerRef = useRef(null);
  // Guard against React's StrictMode double-mount in dev — without this
  // the narration would fire twice on every page load locally.
  const firedRef = useRef(false);

  useEffect(() => {
    if (!summary) return undefined;
    if (firedRef.current) return undefined;
    firedRef.current = true;

    setState("playing");
    const ctrl = speakWithCoachVoice(summary, {
      onStart: () => setState("playing"),
      onEnd: () => setState("done"),
    });
    controllerRef.current = ctrl;
    ctrl.then(() => setState("done")).catch(() => setState("done"));

    return () => {
      try { ctrl.cancel?.(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const handleStop = () => {
    try { controllerRef.current?.cancel?.(); } catch { /* noop */ }
    setState("done");
  };

  if (state !== "playing") return null;

  return (
    <div className="inline-flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-full
                    bg-zinc-900 border border-lime-400/40 text-lime-300 text-sm font-semibold">
      <Volume2 className="w-4 h-4 shrink-0 animate-pulse" />
      <span className="hidden sm:inline">Coach is reading your analysis…</span>
      <span className="sm:hidden">Coach is reading…</span>
      <button
        type="button"
        onClick={handleStop}
        aria-label="Stop coach narration"
        className="inline-flex items-center justify-center w-8 h-8 rounded-full
                   bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white shrink-0"
      >
        <StopCircle className="w-4 h-4" />
      </button>
    </div>
  );
}
