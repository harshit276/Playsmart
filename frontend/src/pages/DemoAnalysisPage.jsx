import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Play, Sparkles, Check, TrendingUp, MessageSquare, FileText,
  ArrowRight, Zap, Trophy, Target,
} from "lucide-react";
import SEO from "@/components/SEO";
import { FormantiLogo } from "@/components/FormantiLogo";
import demo from "@/data/demoAnalysis.json";

/**
 * DemoAnalysisPage — the "see what you get, no signup, no upload" experience.
 *
 * WHY it exists: paid ad traffic was landing straight on /analyze (the deepest,
 * highest-friction page) and bouncing in seconds — 262 clicks, 0 signups. Cold
 * visitors won't find a clip on their phone and upload it before they've seen
 * any value. This page shows a REAL analysis result (captured once from a real
 * clip through the real engine — see src/data/demoAnalysis.json) so a stranger
 * gets the "wow" instantly, THEN is asked to sign up to analyse their own.
 *
 * Deliberately lightweight: it renders baked JSON + a bundled clip. No pose
 * detection, no ffmpeg, no backend, no AI call — so it loads fast on mobile
 * data and can never break or cost a token, no matter how much ad traffic hits
 * it. It's honest: real data, clearly labelled "Sample", never the visitor's.
 */

const CN = demo.coach_narrative || {};
// Dedupe repeated shot labels for a cleaner timeline while keeping the count.
const SHOTS = (demo.events || []).map((e, i) => ({
  n: i + 1,
  t: `0:${String(Math.round(e.timestamp_sec || 0)).padStart(2, "0")}`,
  label: e.shot_label || "Shot",
  intent: e.intent,
  outcome: e.outcome,
  note: e.quality_observation,
}));

const INTENT_TONE = {
  attacking: "text-lime-300 bg-lime-400/10 border-lime-400/20",
  defensive: "text-sky-300 bg-sky-400/10 border-sky-400/20",
  neutral: "text-zinc-300 bg-zinc-800 border-zinc-700",
};

function SignupCTA({ label = "Analyse your own video — free" }) {
  return (
    <Link to="/auth"
      className="inline-flex items-center justify-center gap-2 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-full px-6 py-3 text-sm shadow-[0_0_24px_rgba(190,242,100,0.25)] transition-colors">
      <Zap className="w-4 h-4" /> {label} <ArrowRight className="w-4 h-4" />
    </Link>
  );
}

export default function DemoAnalysisPage() {
  const [showAllShots, setShowAllShots] = useState(false);
  const shots = showAllShots ? SHOTS : SHOTS.slice(0, 3);

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white">
      <SEO
        title="See a Sample AI Sports Analysis — Formanti"
        description="See exactly what Formanti's AI produces from a single clip: shot-by-shot breakdown, technique feedback, and a coaching plan. Then analyse your own — free."
        url="https://www.formanti.com/demo"
      />

      <div className="container mx-auto px-4 max-w-3xl py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link to="/"><FormantiLogo className="h-7" /></Link>
          <Link to="/auth" className="text-xs text-zinc-400 hover:text-white">Sign in</Link>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-400/10 border border-lime-400/25 text-[10px] uppercase tracking-widest text-lime-300 font-bold mb-3">
            <Sparkles className="w-3 h-3" /> Sample analysis
          </div>
          <h1 className="font-heading font-black text-3xl sm:text-4xl uppercase tracking-tight leading-[0.95] mb-2">
            This is what Formanti<br /><span className="text-lime-400">sees in your game.</span>
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base">
            A real result from one short clip — no signup needed to look around. Your own analysis is one upload away.
          </p>
        </motion.div>

        {/* Clip + verdict */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-black aspect-video">
            <video
              src="/demo/sample-badminton.mp4"
              muted autoPlay loop playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-0.5 flex items-center gap-1">
              <Play className="w-3 h-3 text-lime-400" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-white">The clip</span>
            </div>
          </div>
          <div className="rounded-2xl border border-lime-400/25 bg-gradient-to-br from-lime-400/10 to-zinc-900 p-4 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-lime-400" />
              <span className="text-[10px] uppercase tracking-wider text-lime-300 font-bold">Detected</span>
            </div>
            <p className="font-heading font-black text-2xl capitalize">{demo.sport_detected || "Badminton"}</p>
            <p className="text-zinc-400 text-sm mt-0.5">
              Skill read: <span className="text-white font-semibold">{demo.overall_skill_level}</span>
            </p>
            <p className="text-zinc-400 text-sm">
              <span className="text-white font-semibold">{SHOTS.length}</span> shots detected + timed
            </p>
          </div>
        </div>

        {/* Shot-by-shot */}
        <section className="mt-8">
          <h2 className="font-heading font-bold text-lg uppercase tracking-tight mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-lime-400" /> Shot-by-shot breakdown
          </h2>
          <div className="space-y-2">
            {shots.map((s) => (
              <div key={s.n} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono text-[11px] text-lime-400 tabular-nums">{s.t}</span>
                  <span className="text-sm font-semibold text-white">{s.label}</span>
                  {s.intent && (
                    <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${INTENT_TONE[s.intent] || INTENT_TONE.neutral}`}>
                      {s.intent}
                    </span>
                  )}
                </div>
                {s.note && <p className="text-[12px] text-zinc-400 leading-relaxed">{s.note}</p>}
              </div>
            ))}
          </div>
          {SHOTS.length > 3 && (
            <button onClick={() => setShowAllShots((v) => !v)}
              className="text-[12px] text-lime-400 hover:text-lime-300 font-medium mt-2">
              {showAllShots ? "Show less" : `Show all ${SHOTS.length} shots`}
            </button>
          )}
        </section>

        {/* Coach verdict */}
        <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold mb-2">What's working</p>
            <ul className="space-y-2">
              {(CN.strengths_points || []).map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-zinc-300">
                  <Check className="w-3.5 h-3.5 text-lime-400 shrink-0 mt-0.5" /> {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold mb-2">Fix these next</p>
            <ul className="space-y-2">
              {(CN.improvements_points || []).map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-zinc-300">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /> {p}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {CN.takeaway && (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Coach's takeaway</p>
            <p className="text-sm text-zinc-200 leading-relaxed">{CN.takeaway}</p>
          </div>
        )}

        {/* What else comes with it */}
        <section className="mt-8">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-3">Every analysis also includes</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { icon: MessageSquare, label: "Ask the coach" },
              { icon: TrendingUp, label: "Progress tracking" },
              { icon: FileText, label: "PDF report" },
              { icon: Target, label: "Drills to fix it" },
            ].map((f) => (
              <div key={f.label} className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3 text-center">
                <f.icon className="w-4 h-4 text-lime-400 mx-auto mb-1.5" strokeWidth={1.6} />
                <p className="text-[11px] text-zinc-300 font-medium leading-tight">{f.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <div className="mt-10 rounded-2xl border border-lime-400/25 bg-gradient-to-br from-lime-400/[0.12] to-zinc-900 p-6 text-center">
          <h2 className="font-heading font-black text-2xl uppercase tracking-tight mb-2">
            Now do it with <span className="text-lime-400">your</span> clip
          </h2>
          <p className="text-zinc-300 text-sm mb-5 max-w-md mx-auto">
            Sign up free and get 100 tokens — enough for a full analysis of your own game. No card required.
          </p>
          <SignupCTA />
          <p className="text-[11px] text-zinc-500 mt-3">
            Works for badminton, tennis, cricket, pickleball and more — any clip where the action is clearly in frame.
          </p>
        </div>

        {/* honesty footnote */}
        <p className="text-[10px] text-zinc-600 text-center mt-6">
          A real analysis of a sample clip, shown so you can see the output before signing up.
        </p>
      </div>
    </div>
  );
}
