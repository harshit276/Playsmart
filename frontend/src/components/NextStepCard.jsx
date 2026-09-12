import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Repeat, Dumbbell, Camera, TrendingUp, Mic, Crosshair, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analysesFrom, analysisWord } from "@/lib/analyses";

/**
 * NextStepCard — the "what now?" block on a finished analysis.
 *
 * WHY: an analysis on its own is a one-time read, and that is how most people
 * used it — one clip, then gone. The part of the product that brings a player
 * back is the loop: practise the fix, film the same shot again, see whether it
 * changed. That compare flow already existed but was reachable only from a
 * small "Reanalyze" button on history cards, and a separate "Re-analyze"
 * button re-ran the SAME clip, which can never show improvement. So this card
 * states the loop in three steps, puts the compare action one tap away, and
 * says plainly that re-running the same video gives the same answer.
 *
 * @param {object}   result      the analysis on screen
 * @param {?number}  tokens      balance in tokens (null while loading / guest)
 * @param {boolean}  isGuest
 * @param {Function} onCompare   enter compare mode against this analysis (or
 *                               pick a baseline from History when it has no id)
 * @param {Function} onSignup
 */
export default function NextStepCard({ result, tokens, isGuest, onCompare, onSignup }) {
  const topFix = [
    ...(result?.vlm_coaching?.key_focus_areas || []),
    ...(result?.shot_analysis?.weaknesses || []),
  ].find((x) => typeof x === "string" && x.trim());
  const shotName = result?.shot_analysis?.shot_name || "shot";
  const left = tokens == null ? null : analysesFrom(tokens);

  const scrollTo = (...ids) => {
    const el = ids.map((id) => document.getElementById(id)).find(Boolean);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const steps = [
    {
      icon: Dumbbell,
      title: "Practise the fix",
      desc: topFix ? topFix : "Use the drills in this report.",
    },
    {
      icon: Camera,
      title: `Film the same ${shotName.toLowerCase()} again`,
      desc: "In a few days, from the same camera angle.",
    },
    {
      icon: TrendingUp,
      title: "See what changed",
      desc: "Score, level, and whether each fix improved or is still there.",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      id="analysis-section-next-step"
      className="scroll-mt-24 rounded-2xl border border-sky-400/30 bg-gradient-to-br from-sky-400/[0.07] via-zinc-900/80 to-zinc-900/80 p-5"
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-sky-300">Your next step</p>
      <h3 className="mt-1 font-heading text-xl font-bold leading-tight text-white sm:text-2xl">
        Fix one thing, then film again and compare
      </h3>

      {/* Plain list on phones (boxes tripled its height there); boxed
          columns from sm up. */}
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-2.5 sm:rounded-xl sm:border sm:border-zinc-800 sm:bg-zinc-900/60 sm:p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-[11px] font-bold text-sky-300">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <s.icon className="h-3.5 w-3.5 shrink-0 text-sky-300" /> {s.title}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400 line-clamp-2">{s.desc}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {isGuest ? (
          <Button onClick={onSignup} className="h-11 rounded-full bg-lime-400 px-5 font-bold text-black hover:bg-lime-500">
            Sign up to film again and compare <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={onCompare}
            className="h-11 rounded-full bg-lime-400 px-5 font-bold text-black hover:bg-lime-500"
          >
            <Repeat className="mr-1.5 h-4 w-4" /> Film again &amp; compare
          </Button>
        )}
        <p className="text-xs text-zinc-500">
          {isGuest
            ? "3 free analyses on signup."
            : `Uses 1 analysis${left != null ? ` · you have ${left.toLocaleString("en-IN")} ${analysisWord(left)} left` : ""}.`}
        </p>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        Re-running this same video gives the same result. Progress only shows on a new clip.
      </p>

      {/* The other reasons to come back, one tap each. */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
        <button
          type="button"
          onClick={() => scrollTo("analysis-section-form-compare", "analysis-section-shot-analysis")}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-lime-400/40 hover:text-lime-400"
        >
          <Crosshair className="h-3.5 w-3.5" /> See your pose corrected
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("formanti:open-coach"))}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-lime-400/40 hover:text-lime-400"
        >
          <Mic className="h-3.5 w-3.5" /> Ask the coach about this clip
        </button>
        {!isGuest && (
          <Link
            to="/progress"
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-lime-400/40 hover:text-lime-400"
          >
            <TrendingUp className="h-3.5 w-3.5" /> Your progress over time
          </Link>
        )}
      </div>
    </motion.div>
  );
}
