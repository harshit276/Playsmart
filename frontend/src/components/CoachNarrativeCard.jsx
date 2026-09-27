import { useState } from "react";
import { motion } from "framer-motion";
import { MessageSquareQuote, Sparkles, AlertTriangle, Target, History, ChevronDown, Play } from "lucide-react";
import SpeakTipButton from "@/components/SpeakTipButton";
import { seekMainVideo, parseClock } from "@/lib/seekMainVideo";

// CoachNarrativeCard — Gemini's coach voice (intro / strengths /
// improvements / takeaway), rendered near the top of the result.
//
// Honest scope: NO further LLM calls, NO templates. Gemini's words pass
// through as written; empty fields hide their block.
//
// Layout (users found the old stacked boxes a wall of text):
//   - the intro's first sentence is the headline; the rest folds away
//   - What's working / Where to focus are tabs, one list at a time
//   - any "0:25"-style time in the text is a button that jumps the video
//   - the takeaway is the goal card at the bottom

export default function CoachNarrativeCard({ narrative }) {
  const [tab, setTab] = useState(null);
  const [introOpen, setIntroOpen] = useState(false);
  if (!narrative || typeof narrative !== "object") return null;

  const intro = (narrative.intro || "").trim();
  const takeaway = (narrative.takeaway || "").trim();
  // Session continuity — only present when the analysis request carried
  // previous_session_focus.
  const progressUpdate = (narrative.progress_update || "").trim();

  // Prefer the bullet arrays; older/cached responses only have prose
  // paragraphs, so split those into sentences.
  const toPoints = (arr, paragraph) => {
    if (Array.isArray(arr) && arr.length) return arr.map((s) => String(s).trim()).filter(Boolean);
    const p = (paragraph || "").trim();
    return p ? p.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean) : [];
  };
  const strengthsPoints = toPoints(narrative.strengths_points, narrative.strengths_paragraph);
  const improvementsPoints = toPoints(narrative.improvements_points, narrative.improvements_paragraph);

  if (!intro && !strengthsPoints.length && !improvementsPoints.length && !takeaway) return null;

  const speakScript = [progressUpdate, intro, ...strengthsPoints, ...improvementsPoints, takeaway]
    .filter(Boolean)
    .join(" ");

  const introSentences = intro ? intro.split(/(?<=[.!?])\s+/).filter(Boolean) : [];
  const introLead = introSentences[0] || "";
  const introRest = introSentences.slice(1).join(" ");
  const introFolds = introRest.length > 160;

  const tabs = [
    strengthsPoints.length > 0 && {
      key: "working", label: "What's working", icon: Sparkles, points: strengthsPoints,
      on: "bg-lime-400/15 text-lime-200 border-lime-400/50", num: "bg-lime-400/15 text-lime-300 border-lime-400/40",
    },
    improvementsPoints.length > 0 && {
      key: "focus", label: "Where to focus", icon: AlertTriangle, points: improvementsPoints,
      on: "bg-amber-400/15 text-amber-200 border-amber-400/50", num: "bg-amber-400/15 text-amber-300 border-amber-400/40",
    },
  ].filter(Boolean);
  const active = tabs.find((t) => t.key === tab) || tabs[0] || null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-gradient-to-br from-lime-400/10 via-zinc-900 to-zinc-900 border border-lime-400/30 rounded-2xl p-3 sm:p-4 mb-4 shadow-lg shadow-lime-400/5"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-lime-400/15 border border-lime-400/40 flex items-center justify-center shrink-0">
          <MessageSquareQuote className="w-3.5 h-3.5 text-lime-300" />
        </div>
        <p className="flex-1 min-w-0 text-[11px] uppercase tracking-wider text-lime-300 font-bold">Coach's read</p>
        {speakScript && (
          <div className="shrink-0">
            <SpeakTipButton text={speakScript} prefix="" size="xs" label="Listen" />
          </div>
        )}
      </div>

      <div className="space-y-3">
        {/* "Since last session" — the coach checks last time's fixes; this is
            what makes the app feel like it remembers the player, so it leads. */}
        {progressUpdate && (
          <div className="bg-sky-400/10 border border-sky-400/30 rounded-xl p-3 flex items-start gap-2.5">
            <History className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-sky-300 font-bold mb-0.5">Since last session</p>
              <p className="text-[13px] text-white leading-snug"><TimedText text={progressUpdate} /></p>
            </div>
          </div>
        )}

        {introLead && (
          <div>
            <p className="text-[15px] sm:text-base text-white font-semibold leading-snug">
              <TimedText text={introLead} />
            </p>
            {introRest && (!introFolds || introOpen) && (
              <p className="text-[13px] text-zinc-300 leading-relaxed mt-1.5"><TimedText text={introRest} /></p>
            )}
            {introFolds && (
              <button
                type="button"
                onClick={() => setIntroOpen((o) => !o)}
                className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-lime-300 hover:text-lime-200"
              >
                {introOpen ? "Show less" : "Read more"}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${introOpen ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        )}

        {active && (
          <div>
            {tabs.length > 1 && (
              <div className="flex gap-1.5 mb-2" role="tablist">
                {tabs.map((t) => {
                  const Icon = t.icon;
                  const on = t.key === active.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setTab(t.key)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[12px] font-bold transition-colors ${
                        on ? t.on : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                      <span className="text-[10px] font-mono opacity-80">{t.points.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {tabs.length === 1 && (
              <p className={`text-[10px] uppercase tracking-wider font-bold mb-1.5 ${active.key === "focus" ? "text-amber-300" : "text-lime-300"}`}>
                {active.label}
              </p>
            )}
            {/* Swapped instantly on purpose: an exit-then-enter animation left
                the old list on screen whenever animation frames were paused. */}
            <ol key={active.key} className="space-y-1.5">
              {active.points.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5 bg-zinc-950/50 border border-zinc-800 rounded-xl px-3 py-2.5">
                  <span className={`w-5 h-5 rounded-md border text-[11px] font-bold flex items-center justify-center shrink-0 ${active.num}`}>
                    {i + 1}
                  </span>
                  <span className="text-[13px] text-zinc-100 leading-snug min-w-0"><TimedText text={p} /></span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {takeaway && (
          <div className="rounded-xl border border-lime-400/40 bg-gradient-to-br from-lime-400/15 via-lime-400/5 to-transparent p-3 flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-lime-400 flex items-center justify-center shrink-0">
              <Target className="w-4 h-4 text-black" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold">Your goal for next session</p>
              <p className="text-[13.5px] text-white leading-snug mt-0.5"><TimedText text={takeaway} /></p>
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}

// Text with every "m:ss" time turned into a chip that jumps the video there.
function TimedText({ text }) {
  const parts = String(text || "").split(/(\b\d{1,2}:\d{2}\b)/g);
  return parts.map((part, i) => {
    const sec = i % 2 === 1 ? parseClock(part) : null;
    if (sec === null) return <span key={i}>{part}</span>;
    return (
      <button
        key={i}
        type="button"
        onClick={() => seekMainVideo(sec)}
        title={`Watch ${part}`}
        className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 rounded-md bg-sky-400/15 text-sky-300 border border-sky-400/30 hover:bg-sky-400/25 text-[11px] font-mono font-bold leading-5 align-baseline"
      >
        <Play className="w-2.5 h-2.5 fill-current" />
        {part}
      </button>
    );
  });
}
