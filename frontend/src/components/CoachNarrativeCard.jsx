import { motion } from "framer-motion";
import { MessageSquareQuote, Sparkles, AlertTriangle, Target } from "lucide-react";
import SpeakTipButton from "@/components/SpeakTipButton";

// CoachNarrativeCard — renders Gemini's multi-paragraph coach voice as
// the very first block on the analyze result page.
//
// Why this exists:
//   User compared our app's output ("Compact swing") to the same clip
//   uploaded directly to Gemini Studio (a 4-paragraph coach debrief
//   covering racket carriage, strokes, backhand bias, weight transfer,
//   etc.). The gap wasn't model quality — it was that we only asked
//   Gemini for one-line `tip` fields. The new prompt asks for
//   `coach_narrative.{intro, strengths_paragraph, improvements_paragraph,
//   takeaway}`, and this component renders those paragraphs verbatim.
//
// Honest scope: NO further LLM calls, NO templates, NO bullet-ification.
//   Gemini's words pass straight through with light styling. If a field
//   is empty (cheap model, low confidence, or unclear video), we just
//   hide that block rather than insert filler.

export default function CoachNarrativeCard({ narrative, shotName }) {
  if (!narrative || typeof narrative !== "object") return null;

  const intro = (narrative.intro || "").trim();
  const strengths = (narrative.strengths_paragraph || "").trim();
  const improvements = (narrative.improvements_paragraph || "").trim();
  const takeaway = (narrative.takeaway || "").trim();

  // If Gemini gave us nothing, render nothing — better than an empty
  // skeleton card. The skinny SessionSummaryHero below us still anchors
  // the result with the at-a-glance shot mix chips.
  if (!intro && !strengths && !improvements && !takeaway) return null;

  // Stitch together the spoken version so the Listen button reads the
  // whole debrief, not just one section.
  const speakScript = [intro, strengths, improvements, takeaway]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-gradient-to-br from-lime-400/8 via-zinc-900 to-zinc-900 border border-lime-400/30 rounded-2xl p-3 sm:p-4 mb-4 shadow-lg shadow-lime-400/5"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-lime-400/15 border border-lime-400/40 flex items-center justify-center shrink-0">
          <MessageSquareQuote className="w-3.5 h-3.5 text-lime-300" />
        </div>
        <p className="flex-1 min-w-0 text-[10px] uppercase tracking-wider text-lime-300 font-bold leading-none flex items-center gap-1.5 flex-wrap">
          <Sparkles className="w-3 h-3 text-lime-400" /> Coach's read
        </p>
        {speakScript && (
          <div className="shrink-0">
            <SpeakTipButton text={speakScript} prefix="" size="xs" label="Listen" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        {intro && (
          <p className="text-[13px] sm:text-sm text-white leading-relaxed">
            {intro}
          </p>
        )}

        {strengths && (
          <Section
            label="What's working"
            color="lime"
            icon={Sparkles}
            body={strengths}
          />
        )}

        {improvements && (
          <Section
            label="Where to focus"
            color="amber"
            icon={AlertTriangle}
            body={improvements}
          />
        )}

        {takeaway && (
          <div className="bg-lime-400/8 border border-lime-400/30 rounded-lg p-2.5 flex items-start gap-2">
            <Target className="w-3.5 h-3.5 text-lime-300 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold mb-0.5">
                Next session focus
              </p>
              <p className="text-[13px] text-white leading-snug">{takeaway}</p>
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}

// Color-tinted section block. Renders Gemini's paragraph as prose, with
// a light label above it. We split paragraphs on \n\n so multi-paragraph
// outputs render with vertical breathing room instead of one wall of
// text, but we don't bullet-ify single paragraphs (that's the whole
// point — keep the coach voice intact).
function Section({ label, color, icon: Icon, body }) {
  const palette = {
    lime: {
      bg: "bg-lime-400/5",
      border: "border-lime-400/25",
      ring: "border-lime-400/40",
      label: "text-lime-300",
      iconBg: "bg-lime-400/15",
      iconBorder: "border-lime-400/40",
      iconColor: "text-lime-300",
    },
    amber: {
      bg: "bg-amber-400/5",
      border: "border-amber-400/25",
      ring: "border-amber-400/40",
      label: "text-amber-300",
      iconBg: "bg-amber-400/15",
      iconBorder: "border-amber-400/40",
      iconColor: "text-amber-300",
    },
  }[color] || {
    bg: "bg-zinc-800/30",
    border: "border-zinc-800",
    ring: "border-zinc-700",
    label: "text-zinc-300",
    iconBg: "bg-zinc-800",
    iconBorder: "border-zinc-700",
    iconColor: "text-zinc-300",
  };

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className={`${palette.bg} border ${palette.border} rounded-lg p-2.5 flex items-start gap-2`}>
      <div className={`w-6 h-6 rounded-md ${palette.iconBg} border ${palette.iconBorder} flex items-center justify-center shrink-0`}>
        <Icon className={`w-3 h-3 ${palette.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] uppercase tracking-wider font-bold ${palette.label} mb-1`}>
          {label}
        </p>
        <div className="space-y-1.5 text-[12.5px] text-zinc-100 leading-snug">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
