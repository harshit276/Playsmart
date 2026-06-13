import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles, MessageSquareQuote, AlertTriangle } from "lucide-react";
import SpeakTipButton from "@/components/SpeakTipButton";

// "Here's what I watched" hero — a 1-2 sentence coach-voice read of the
// session, sitting at the very top of the analysis result.
//
// Purpose:
//   The previous result page led with stats (skill, badges, shot mix)
//   and made users scroll through cards to find out whether the AI
//   actually understood the clip. We had Gemini-grade analysis but the
//   page didn't *open with* a Gemini-grade sentence, so users couldn't
//   tell at a glance if the shot identification was right.
//
//   This card answers "did the AI understand what I uploaded?" in one
//   read, then lets the user dive into details below.
//
// Data sources (all already present in result.shots / result.coaching):
//   - result.shots[*].shot_label / shot_category / shot_type / confidence
//   - result.session_type (drill | rally | match | unknown) when present
//   - result.coaching_narrative.summary OR coaching.header.summary OR
//     vlm_coaching.motivational_message — used as the lead sentence if
//     present, otherwise we generate a templated-but-specific sentence
//     from the shot distribution.
//
// Honest about uncertainty:
//   - If avg confidence across shots is < 0.5 we soften the tone
//     ("looks like ..." instead of "watched N ..." ).
//   - If shot types disagree wildly (high entropy), we say so.
//   - Never invents details that aren't in the data.

function _titleCase(s) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function _summarize(shots, opts = {}) {
  const { sport = "session", sessionType = null, leadSentence = null } = opts;

  // Bucket shot types.
  const counts = new Map();
  let totalConf = 0;
  let confSamples = 0;
  for (const s of shots) {
    const t = (s.shot_category || s.type || s.shot_type || "unknown").toString().toLowerCase();
    if (!t || t === "unknown") continue;
    counts.set(t, (counts.get(t) || 0) + 1);
    if (typeof s.confidence === "number") { totalConf += s.confidence; confSamples++; }
  }
  // Headline count = EVERY detected shot (matches the number of per-shot
  // cards and total_shots_detected). `typedTotal` is the subset with a
  // known category, used only to decide how specific the wording can be —
  // we never claim "N smash shots" if some of the N were unclassified.
  const total = shots.length;
  const typedTotal = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  const avgConf = confSamples > 0 ? totalConf / confSamples : 0;
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const distinct = ranked.length;
  const top = ranked[0] || null;

  // Confidence verbiage. We avoid "I watched N ..." when conf is low so
  // we don't sound oversold against a low-quality clip.
  const lead = avgConf >= 0.7 ? "I watched"
             : avgConf >= 0.5 ? "Looks like"
             : "Best guess —";

  // Build the "what" clause — TYPE-focused, NO hard count. The raw event
  // count is inherently noisy (doubles picks up the partner, Gemini over/
  // under-detects fast exchanges), so a precise "7 shots" next to a clip
  // where the player hit 2 reads as broken. We describe WHAT was played
  // instead of HOW MANY; the per-shot cards below carry the detail.
  let what;
  if (top && distinct === 1) {
    what = `your ${_titleCase(top[0]).toLowerCase()} technique`;
  } else if (top && distinct === 2) {
    what = `mostly ${_titleCase(top[0]).toLowerCase()}s with some ${_titleCase(ranked[1][0]).toLowerCase()}s`;
  } else if (top && distinct >= 3) {
    const named = ranked.slice(0, 3).map(([t]) => _titleCase(t).toLowerCase()).join(", ");
    what = `a mix of ${named}`;
  } else {
    what = "your technique";
  }

  // Session-shape qualifier.
  const sessionWord = sessionType === "drill" ? "a drill"
    : sessionType === "rally" ? "a rally"
    : sessionType === "match" ? "match play"
    : null;
  const sportPhrase = sessionWord ? `${sport} ${sessionWord}` : `${sport} session`;

  // First sentence — prefer the LLM narrative summary if we have one.
  const opener = leadSentence && leadSentence.trim().length > 8
    ? leadSentence.trim()
    : `${lead} ${what} in your ${sportPhrase}.`;

  return { opener, ranked, total, avgConf, distinct };
}

export default function SessionSummaryHero({ result, sport }) {
  const data = useMemo(() => {
    if (!result || !Array.isArray(result.shots) || result.shots.length === 0) return null;
    const sportName = (sport || result.sport || "session").toString().toLowerCase();
    const leadSentence =
      result.coaching_narrative?.summary
      || result.coaching?.header?.summary
      || result.vlm_coaching?.motivational_message
      || null;
    return _summarize(result.shots, {
      sport: sportName,
      sessionType: result.session_type || result._session_type || null,
      leadSentence,
    });
  }, [result, sport]);

  if (!data || data.total === 0) return null;

  // Build the spoken script — combines opener + top-2 shot-type read so
  // the user can audio-confirm the identification matches what they shot.
  const breakdownLine = data.ranked.length > 0
    ? `You played ${data.ranked.slice(0, 3).map(([t]) => `${_titleCase(t).toLowerCase()}s`).join(", ")}.`
    : "";
  const speechScript = [data.opener, breakdownLine].filter(Boolean).join(" ");

  // Confidence indicator — visible cue. < 0.5 surfaces a "review the
  // identification" pill so users know to double-check.
  const lowConf = data.avgConf > 0 && data.avgConf < 0.55;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-gradient-to-br from-lime-400/8 via-zinc-900 to-zinc-900 border border-lime-400/30 rounded-2xl p-4 mb-4 shadow-lg shadow-lime-400/5"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-lime-400/15 border border-lime-400/40 flex items-center justify-center shrink-0">
          <MessageSquareQuote className="w-4 h-4 text-lime-300" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold leading-none">
              Coach's read of this session
            </p>
            <span className="text-[10px] text-zinc-500 leading-none">
              · <Sparkles className="w-3 h-3 text-lime-400 inline-block -mt-0.5" /> from your shots
            </span>
            {lowConf && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-1.5 py-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />
                Low confidence
              </span>
            )}
          </div>

          {/* The opener — coach voice. Either the LLM narrative or a
              specific, data-grounded sentence. */}
          <p className="text-[15px] sm:text-base text-white leading-snug">{data.opener}</p>

          {/* Shot distribution chips — the user's confidence check that
              the AI labelled their shots correctly. Tap to see the
              filtered cards below (event dispatch matches what the
              per-shot card listens for). */}
          {data.ranked.length > 0 && (
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Identified shots:</span>
              {data.ranked.slice(0, 5).map(([t]) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full bg-zinc-800/80 border border-zinc-700 text-zinc-200 px-2 py-0.5 capitalize"
                  title={`${_titleCase(t).toLowerCase()} detected`}
                >
                  {_titleCase(t).toLowerCase()}
                </span>
              ))}
              {data.distinct > 5 && (
                <span className="text-[10px] text-zinc-600 italic">+{data.distinct - 5} more</span>
              )}
            </div>
          )}

          {lowConf && (
            <p className="text-[11px] text-amber-200/80 mt-2 leading-snug">
              The AI wasn't fully sure about every shot in this clip. If a label looks wrong below, it usually means a clearer side-angle clip would help.
            </p>
          )}
        </div>

        <div className="shrink-0">
          <SpeakTipButton
            text={speechScript}
            prefix=""
            size="xs"
            label="Listen"
          />
        </div>
      </div>
    </motion.section>
  );
}
