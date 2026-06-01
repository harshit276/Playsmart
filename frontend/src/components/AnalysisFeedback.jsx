import { useState, useEffect } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

/**
 * AnalysisFeedback — a small "how accurate was this analysis?" rating prompt
 * shown once per analysis on the results page. Captures a 1-5 star rating +
 * optional comment and posts to /analysis-feedback (which also alerts the
 * admin on low ratings). Persists per analysis_id so we don't re-prompt the
 * same analysis after a reload.
 */
function feedbackKey(id) { return `playsmart_feedback_${id || "last"}`; }

export default function AnalysisFeedback({ analysisId, sport }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Already rated this analysis? Don't show again.
  useEffect(() => {
    try {
      if (localStorage.getItem(feedbackKey(analysisId)) === "1") setDone(true);
    } catch { /* ignore */ }
  }, [analysisId]);

  const submit = async () => {
    if (submitting || rating < 1) return;
    setSubmitting(true);
    try {
      await api.post("/analysis-feedback", {
        analysis_id: analysisId || null,
        rating,
        comment: comment.trim() || null,
        sport: sport || null,
      });
    } catch { /* don't block the user on a feedback failure */ }
    try { localStorage.setItem(feedbackKey(analysisId), "1"); } catch {}
    setSubmitting(false);
    setDone(true);
    toast.success("Thanks for the feedback! 🙌");
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" />
        <p className="text-xs text-zinc-400">Thanks for rating this analysis.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-sm font-semibold text-white mb-0.5">How accurate was this analysis?</p>
      <p className="text-[11px] text-zinc-500 mb-2">Your rating helps us improve the AI coach.</p>
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            className="p-1"
          >
            <Star
              className={`w-6 h-6 transition-colors ${
                n <= (hover || rating) ? "text-amber-400 fill-amber-400" : "text-zinc-600"
              }`}
            />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <div className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 1000))}
            placeholder={rating <= 2 ? "What did we get wrong? (optional)" : "Anything to add? (optional)"}
            rows={2}
            className="w-full rounded-xl bg-zinc-800/80 border border-zinc-700 text-sm text-white placeholder:text-zinc-500 p-2.5 focus:outline-none focus:border-lime-400/50 resize-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 rounded-full bg-lime-400 text-black font-bold text-xs disabled:opacity-50 hover:bg-lime-500"
          >
            {submitting ? "Sending…" : "Submit feedback"}
          </button>
        </div>
      )}
    </div>
  );
}
