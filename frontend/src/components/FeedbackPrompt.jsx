import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from "@/lib/api";

/**
 * Post-analysis feedback, asked as a bottom-sheet at a HIGH-INTENT moment
 * rather than as a card the user scrolls past.
 *
 * Why it's a prompt and not a static tab: feedback is the earliest signal that
 * the product is wrong, and it's the one thing users almost never volunteer.
 * A real user had to type "its a leg spin, analysys telling fast bowling" for
 * us to discover a defect affecting every ambiguous shot in every sport — that
 * report was worth more than any metric we had. So we ask at the two moments
 * the user has actually formed an opinion:
 *   • they've scrolled deep into their results (read enough to judge)
 *   • they're downloading the PDF (high intent — they value the output)
 *
 * Per-aspect stars, not one blended score: "1 star" told us someone was
 * unhappy but never WHICH surface failed. Rating shots / coach / PDF
 * separately makes a low score immediately actionable.
 *
 * Asked at most ONCE per analysis (persisted), and never re-asked after it's
 * been answered or dismissed — nagging costs more trust than the data is worth.
 */

const ASKED_KEY = "formanti_feedback_asked";   // { [analysisId]: true }

function askedMap() {
  try { return JSON.parse(localStorage.getItem(ASKED_KEY) || "{}"); } catch { return {}; }
}
function markAsked(id) {
  try {
    const m = askedMap();
    m[id || "_last"] = true;
    localStorage.setItem(ASKED_KEY, JSON.stringify(m));
  } catch { /* storage disabled — worst case we ask again next session */ }
}
export function hasBeenAsked(id) {
  return !!askedMap()[id || "_last"];
}

const ASPECTS = [
  { key: "rating", label: "Overall analysis", hint: "Was the read on your game useful?" },
  { key: "rating_shots", label: "Shot breakdown", hint: "Were the shots named + timed correctly?" },
  { key: "rating_coach", label: "Talk to Coach", hint: "Only if you used it" },
  { key: "rating_pdf", label: "PDF report", hint: "Only if you downloaded it" },
];

function StarRow({ label, hint, value, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-white leading-tight">{label}</p>
        {hint && <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{hint}</p>}
      </div>
      <div className="flex gap-0.5 shrink-0" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n === value ? 0 : n)}
            className="p-0.5"
          >
            <Star
              className={`w-6 h-6 sm:w-5 sm:h-5 transition-colors ${
                n <= shown ? "text-amber-400 fill-amber-400" : "text-zinc-700"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FeedbackPrompt({ analysisId, sport, trigger, open, onClose }) {
  const [ratings, setRatings] = useState({ rating: 0, rating_shots: 0, rating_coach: 0, rating_pdf: 0 });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const close = useCallback((answered) => {
    markAsked(analysisId);          // never re-ask, answered or not
    onClose?.(answered);
  }, [analysisId, onClose]);

  const submit = async () => {
    if (!ratings.rating && !comment.trim()) {
      toast.error("Give the overall analysis a rating first");
      return;
    }
    setBusy(true);
    try {
      await api.post("/analysis-feedback", {
        analysis_id: analysisId || null,
        sport: sport || null,
        trigger: trigger || null,
        comment: comment.trim(),
        ...ratings,
      }, { timeout: 10000 });
      toast.success("Thanks — this genuinely helps us fix things.");
      close(true);
    } catch {
      // Never block the user on our telemetry failing.
      close(true);
    }
    setBusy(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => close(false)}
            className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[71] bg-zinc-950 border-t border-zinc-800 rounded-t-3xl max-h-[92vh] overflow-y-auto"
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-zinc-700 mt-3 mb-1" />
            <div className="px-5 pb-6 pt-2 max-w-lg mx-auto">
              <div className="flex items-start gap-3 mb-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading font-bold text-xl text-white uppercase tracking-tight">
                    How was this analysis?
                  </h2>
                  <p className="text-[12px] text-zinc-400 mt-1">
                    Takes 10 seconds. If something was wrong, this is how we find out.
                  </p>
                </div>
                <button onClick={() => close(false)} aria-label="Close"
                  className="p-1.5 text-zinc-500 hover:text-white shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="divide-y divide-zinc-800/70 mb-3">
                {ASPECTS.map((a) => (
                  <StarRow
                    key={a.key}
                    label={a.label}
                    hint={a.hint}
                    value={ratings[a.key]}
                    onChange={(v) => setRatings((r) => ({ ...r, [a.key]: v }))}
                  />
                ))}
              </div>

              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Anything wrong or missing? e.g. 'it called my leg spin a fast delivery'"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-lime-400 focus:outline-none resize-none mb-3"
              />

              <div className="flex gap-2">
                <Button onClick={submit} disabled={busy}
                  className="flex-1 h-11 bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-xl">
                  {busy ? "Sending…" : "Send feedback"}
                </Button>
                <Button variant="ghost" onClick={() => close(false)}
                  className="text-zinc-500 hover:text-white rounded-xl px-4">
                  Not now
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Fires `onTrigger(reason)` once when the user scrolls past `depth` of the
 * page. Used to catch someone who has read enough of their results to have an
 * opinion. Passive listener so it never costs scroll performance.
 */
export function useScrollDepthTrigger(enabled, depth, onTrigger) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (!enabled || firedRef.current) return undefined;
    const onScroll = () => {
      const el = document.documentElement;
      const scrolled = (window.scrollY + window.innerHeight) / (el.scrollHeight || 1);
      if (scrolled >= depth && !firedRef.current) {
        firedRef.current = true;
        window.removeEventListener("scroll", onScroll);
        onTrigger("scroll");
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();   // in case the results already fit without scrolling
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled, depth, onTrigger]);
}
