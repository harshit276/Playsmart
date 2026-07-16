/**
 * TestimonialsSection — renders REAL user feedback only.
 *
 * There is currently no public endpoint that returns approved/aggregate
 * user feedback (backend/server.py's POST /analysis-feedback is write-only,
 * and the only reader of the `analysis_feedback` collection is the
 * admin-key-gated GET /admin/stats). Until a public read endpoint exists
 * (or quotes are manually curated from real users with their permission),
 * the caller MUST pass an empty `testimonials` array so this section
 * renders nothing. See PLACEHOLDER_TESTIMONIALS in LandingPage.jsx.
 *
 * Do NOT hardcode fake names/quotes/ratings in this file.
 */
import { motion } from "framer-motion";
import { Star } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }),
};

export default function TestimonialsSection({ testimonials = [] }) {
  if (!Array.isArray(testimonials) || testimonials.length === 0) {
    // Intentionally render nothing — no real user quotes are wired up yet.
    return null;
  }

  return (
    <section className="py-24 bg-zinc-900/50 border-y border-zinc-800/50" data-testid="testimonials-section">
      <div className="container mx-auto px-4 max-w-6xl">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
          className="text-center mb-16">
          <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">From Our Athletes</span>
          <h2 className="font-heading font-bold text-3xl md:text-5xl tracking-tight uppercase text-white mb-4">
            What Users Are Saying
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.slice(0, 6).map((t, i) => (
            <motion.div key={t.name || i} initial="hidden" whileInView="visible" custom={i}
              viewport={{ once: true }} variants={fadeUp}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              {t.rating ? (
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, s) => (
                    <Star key={s} className={`w-4 h-4 ${s < t.rating ? "text-amber-400 fill-amber-400" : "text-zinc-700"}`} />
                  ))}
                </div>
              ) : null}
              <p className="text-zinc-300 text-sm leading-relaxed mb-4 italic">&ldquo;{t.quote}&rdquo;</p>
              <div className="text-white font-semibold text-sm">{t.name}</div>
              {t.sport && <div className="text-zinc-500 text-xs">{t.sport}</div>}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
