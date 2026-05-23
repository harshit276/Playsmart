import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, ChevronRight, Sparkles } from "lucide-react";
import SpeakTipButton from "@/components/SpeakTipButton";

// "Improvement Cards" — top 2-3 actionable fixes lifted out of the
// per-shot coaching feedback and surfaced at the top of the analysis.
//
// The per-shot section already has this information, but it's buried
// inside N collapsible cards. A user who just wants to know "what's
// the ONE thing I should work on?" shouldn't have to scroll through
// every shot to find it. These cards answer that question first.
//
// Selection logic:
//   - Group identical-or-near-identical tips across shots.
//   - Score = (#shots affected) × (avg shot weakness signal).
//   - Show top 2-3 distinct ones, each tagged with the shots they came
//     from (so the user can jump to a concrete example).
//
// Honest: this is pure aggregation of existing data — no new AI call.

// Normalize a tip for grouping. Collapses whitespace + lowercases +
// strips trailing punctuation, so "Recover faster" and "recover faster."
// land in the same bucket.
function _norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.!?;,:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Roughly group by edit distance — if two tips share their first 3
// significant words (length >= 4) we treat them as the same fix.
function _signature(tip) {
  return _norm(tip)
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 3)
    .join(" ");
}

function _pickTip(shot) {
  const ff = shot?.formFeedback || shot?.form_feedback || {};
  if (ff.tip) return String(ff.tip);
  if (Array.isArray(ff.weaknesses) && ff.weaknesses[0]) return String(ff.weaknesses[0]);
  return "";
}

function _bestExample(shotsForTip) {
  // Lowest-confidence example shows the user a clip that most needed the fix.
  return [...shotsForTip].sort(
    (a, b) => (a.confidence || 0) - (b.confidence || 0)
  )[0];
}

function _jumpTo(shot) {
  if (!shot || typeof shot.timestamp !== "number") return;
  window.dispatchEvent(new CustomEvent("playsmart:seek", { detail: { time: shot.timestamp } }));
  const v = document.querySelector("video[data-playsmart-clip]");
  if (v) {
    try { v.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
  }
  if (typeof shot._id === "number") {
    window.dispatchEvent(new CustomEvent("playsmart:active-shot", {
      detail: { id: shot._id, source: "improvement-card", scroll: false },
    }));
  }
}

export default function ImprovementCards({ shots = [], sport, maxCards = 3 }) {
  const [openIdx, setOpenIdx] = useState(0);

  const cards = useMemo(() => {
    const indexed = (shots || []).map((s, i) => ({
      ...s,
      _id: typeof s._id === "number" ? s._id : i,
    }));

    // Bucket shots by tip signature.
    const buckets = new Map();
    for (const s of indexed) {
      const tip = _pickTip(s);
      if (!tip || tip.length < 8) continue;
      const sig = _signature(tip);
      if (!sig) continue;
      if (!buckets.has(sig)) buckets.set(sig, { tip, shots: [] });
      const b = buckets.get(sig);
      b.shots.push(s);
      // Prefer the longer / more specific phrasing as the visible tip.
      if (tip.length > b.tip.length) b.tip = tip;
    }

    return Array.from(buckets.values())
      .map((b) => ({
        tip: b.tip,
        affected: b.shots.length,
        shotTypes: Array.from(new Set(b.shots.map((s) => (s.name || s.type || "shot").toString().toLowerCase().replace(/_/g, " ")))).slice(0, 3),
        example: _bestExample(b.shots),
      }))
      // Rank by impact: more shots affected first, ties broken by tip length (more specific wins).
      .sort((a, b) => (b.affected - a.affected) || (b.tip.length - a.tip.length))
      .slice(0, maxCards);
  }, [shots, maxCards]);

  if (cards.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-gradient-to-br from-lime-400/8 via-zinc-900/60 to-zinc-900/60 border border-lime-400/25 rounded-2xl p-4 mb-4"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-lime-400/15 border border-lime-400/40 flex items-center justify-center">
            <Target className="w-3.5 h-3.5 text-lime-300" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold leading-tight">
              Coach's priority fixes
            </p>
            <p className="text-[11px] text-zinc-400 leading-tight">
              Work on these {cards.length === 1 ? "first" : "in order"} for the biggest jump next session.
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[10px] text-zinc-500">
          <Sparkles className="w-3 h-3 text-lime-400" /> Aggregated from your shots
        </div>
      </div>

      <div className="space-y-2">
        {cards.map((c, i) => {
          const isOpen = openIdx === i;
          const rank = i + 1;
          const canJump = c.example
            && typeof c.example.timestamp === "number"
            && Number.isFinite(c.example.timestamp);

          return (
            <div
              key={`fix-${i}`}
              className={`bg-zinc-900/70 border ${isOpen ? "border-lime-400/40" : "border-zinc-800"} rounded-xl overflow-hidden transition-colors`}
            >
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="w-full text-left flex items-start gap-3 p-3 hover:bg-zinc-800/30 transition-colors"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-[12px] ${
                  rank === 1 ? "bg-lime-400 text-black"
                  : rank === 2 ? "bg-sky-400 text-black"
                  : "bg-amber-400 text-black"
                }`}>
                  {rank}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-snug">{c.tip}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Seen on {c.affected} {c.affected === 1 ? "shot" : "shots"}
                    {c.shotTypes.length > 0 && (
                      <> · <span className="capitalize">{c.shotTypes.join(", ")}</span></>
                    )}
                  </p>
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-zinc-500 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden border-t border-zinc-800/60"
                  >
                    <div className="p-3 flex items-center gap-2 flex-wrap">
                      <SpeakTipButton
                        text={c.tip}
                        prefix={`Priority fix number ${rank}.`}
                        label="Hear it"
                      />
                      {canJump && (
                        <button
                          type="button"
                          onClick={() => _jumpTo(c.example)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-full bg-sky-400/10 hover:bg-sky-400/20 text-sky-300 border border-sky-400/30 transition-colors"
                        >
                          Show me on video
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                      <span className="text-[10px] text-zinc-500 ml-auto">
                        Sport: <span className="capitalize text-zinc-400">{sport || "—"}</span>
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
