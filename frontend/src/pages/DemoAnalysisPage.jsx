import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Play, Sparkles, Zap, Trophy, ArrowRight, FileText,
  MessageSquareQuote, Send, Lock,
} from "lucide-react";
import SEO from "@/components/SEO";
import { FormantiLogo } from "@/components/FormantiLogo";
import MatchInsights from "@/components/MatchInsights";
import CoachNarrativeCard from "@/components/CoachNarrativeCard";
import { buildUniversalResult } from "@/lib/buildUniversalResult";
import { openCoachReport } from "@/lib/coachReport";
import demo from "@/data/demoAnalysis.json";
import sampleClip from "@/assets/demo/sample-badminton.mp4";

/**
 * DemoAnalysisPage — the "see the REAL result, no signup, no upload" page.
 *
 * WHY it exists: paid ad traffic was landing straight on /analyze (the deepest,
 * highest-friction page) and bouncing in seconds — 262 clicks, 0 signups. Cold
 * visitors won't find a clip on their phone and upload it before they've seen
 * any value.
 *
 * WHAT it renders: the ACTUAL analysis result UI a paying user sees — the same
 * `buildUniversalResult` transform, the same `CoachNarrativeCard`, the same
 * `MatchInsights` shot-by-shot component, the same PDF coach report — driven by
 * one baked real result (src/data/demoAnalysis.json, captured once from a real
 * clip through the real engine). No backend/AI call, no token cost, no signup.
 *
 * HONESTY: everything shown is real data from that one sample clip, clearly
 * labelled "Sample" and never presented as the visitor's own. The Talk-to-Coach
 * box shows a baked, representative exchange (the live coach endpoint is NOT
 * wired here — it costs money and this page is public/unauthenticated); the
 * input nudges signup. No provider is named anywhere ("our AI").
 */

// Build the exact result object a real analysis produces.
const RESULT = buildUniversalResult(demo, null, null);

// A representative Talk-to-Coach exchange, drawn straight from the sample's own
// coaching content (hip rotation + wrist snap on the smash) so it's consistent
// with what the visitor sees above — not an invented claim.
const COACH_SAMPLE = {
  question: "How do I get more power on my smash?",
  answer:
    "On this clip your power base is already good — the hip rotation and " +
    "scissor-kick weight transfer are doing a lot of the work. To add more, " +
    "focus on two things: keep your non-racket arm up a beat longer to stay " +
    "balanced into the shot, and sharpen the wrist snap right at the contact " +
    "point rather than swinging with the whole arm. That last-instant snap is " +
    "where the extra shuttle speed comes from.",
};

function SignupCTA({ label = "Analyse your own video — free" }) {
  return (
    <Link
      to="/auth"
      className="inline-flex items-center justify-center gap-2 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-full px-6 py-3 text-sm shadow-[0_0_24px_rgba(190,242,100,0.25)] transition-colors"
    >
      <Zap className="w-4 h-4" /> {label} <ArrowRight className="w-4 h-4" />
    </Link>
  );
}

export default function DemoAnalysisPage() {
  // MatchInsights runs client-side pose detection on the real clip, so it needs
  // a File/Blob. Fetch the bundled clip once and hand it over.
  const [videoFile, setVideoFile] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(sampleClip)
      .then((r) => r.blob())
      .then((blob) => {
        if (alive) setVideoFile(new File([blob], "sample.mp4", { type: "video/mp4" }));
      })
      .catch(() => { /* MatchInsights still renders shot data without pose */ });
    return () => { alive = false; };
  }, []);

  const handleDownloadReport = () => {
    openCoachReport(RESULT, { playerName: "Sample" });
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white">
      <SEO
        title="See a Sample AI Sports Analysis — Formanti"
        description="See exactly what Formanti's AI produces from a single clip: shot-by-shot breakdown, technique feedback, coach's read, and a downloadable report. Then analyse your own — free."
        url="https://www.formanti.com/demo"
      />

      <div className="container mx-auto px-4 max-w-3xl py-6 sm:py-10">
        {/* Header (Navbar is hidden on /demo — this page brings its own) */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/"><FormantiLogo className="h-7" /></Link>
          <Link to="/auth" className="text-xs text-zinc-400 hover:text-white">Sign in</Link>
        </div>

        {/* Framing */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-400/10 border border-lime-400/25 text-[10px] uppercase tracking-widest text-lime-300 font-bold mb-3">
            <Sparkles className="w-3 h-3" /> Sample analysis
          </div>
          <h1 className="font-heading font-black text-3xl sm:text-4xl uppercase tracking-tight leading-[0.95] mb-2">
            This is what Formanti<br /><span className="text-lime-400">sees in your game.</span>
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base">
            A real result our AI produced from one short sample clip — the exact
            breakdown you get, shown before you sign up. It isn't your game yet;
            your own analysis is one upload away.
          </p>
        </motion.div>

        {/* Clip + verdict */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-black aspect-video">
            <video
              src={sampleClip}
              muted
              autoPlay
              loop
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-0.5 flex items-center gap-1">
              <Play className="w-3 h-3 text-lime-400" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-white">The sample clip</span>
            </div>
          </div>
          <div className="rounded-2xl border border-lime-400/25 bg-gradient-to-br from-lime-400/10 to-zinc-900 p-4 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-lime-400" />
              <span className="text-[10px] uppercase tracking-wider text-lime-300 font-bold">Detected</span>
            </div>
            <p className="font-heading font-black text-2xl capitalize">{RESULT.sport || "Badminton"}</p>
            <p className="text-zinc-400 text-sm mt-0.5">
              Skill read: <span className="text-white font-semibold">{RESULT.skill_level}</span>
            </p>
            <p className="text-zinc-400 text-sm">
              <span className="text-white font-semibold">{RESULT.shots.length}</span> shots detected + timed
            </p>
          </div>
        </div>

        {/* Coach's read — the real CoachNarrativeCard component, same as /analyze */}
        <div className="mt-8">
          <CoachNarrativeCard narrative={RESULT.coach_narrative} />
        </div>

        {/* Coach Report (PDF) — the real client-side report generator */}
        <button
          onClick={handleDownloadReport}
          className="w-full flex items-center justify-between gap-3 bg-gradient-to-r from-amber-400/12 to-lime-400/12 border border-amber-400/40 rounded-2xl px-4 py-3 hover:from-amber-400/20 hover:to-lime-400/20 transition-colors text-left mb-4"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">📄</span>
            <span className="min-w-0">
              <span className="block text-white font-bold text-sm leading-tight">Download the coach report (PDF)</span>
              <span className="block text-zinc-400 text-[11px] leading-tight">
                Printable: verdict, priority fixes, shot-by-shot table — try it on this sample
              </span>
            </span>
          </span>
          <span className="shrink-0 bg-amber-400 text-black font-bold text-xs rounded-full px-3.5 h-9 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> Get PDF
          </span>
        </button>

        {/* Shot-by-shot — the REAL MatchInsights component, fully unlocked so the
            visitor sees everything (normally guests get this blurred). Feeds it
            the real clip so pose/technique extraction runs just like production. */}
        {RESULT.shots?.length > 0 && (
          <MatchInsights
            videoFile={videoFile}
            shots={RESULT.shots}
            sport={RESULT.sport}
            playerPosition="auto"
            fallbackSkillLevel={RESULT.skill_level}
            targetPlayerThumbnail={null}
            targetPlayerDescription={null}
            lockDetail={false}
          />
        )}

        {/* Talk to Coach — baked sample exchange. The live coach endpoint is NOT
            wired here (public page, costs money, abusable); the input nudges
            signup. Shows the feature honestly without being a live open endpoint. */}
        <section className="mt-8">
          <h2 className="font-heading font-bold text-lg uppercase tracking-tight mb-3 flex items-center gap-2">
            <MessageSquareQuote className="w-4 h-4 text-lime-400" /> Talk to your coach
          </h2>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
            {/* User question bubble */}
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-lime-400/15 border border-lime-400/25 rounded-2xl rounded-br-sm px-3.5 py-2 text-[13px] text-white">
                {COACH_SAMPLE.question}
              </div>
            </div>
            {/* Coach answer bubble */}
            <div className="flex justify-start">
              <div className="max-w-[90%] bg-zinc-800/70 border border-zinc-700 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold mb-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Coach
                </p>
                <p className="text-[13px] text-zinc-100 leading-relaxed">{COACH_SAMPLE.answer}</p>
              </div>
            </div>

            {/* Signup-gated input (looks real, doesn't hit the endpoint) */}
            <Link
              to="/auth"
              className="mt-1 flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950/60 pl-4 pr-1.5 py-1.5 hover:border-lime-400/40 transition-colors"
            >
              <Lock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="flex-1 text-[13px] text-zinc-500 truncate">
                Sign up to ask about your own clip…
              </span>
              <span className="shrink-0 bg-lime-400 text-black rounded-full w-8 h-8 flex items-center justify-center">
                <Send className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">
            Sample exchange based on this clip's analysis. Sign up to ask the
            coach anything about your own game.
          </p>
        </section>

        {/* Final CTA */}
        <div className="mt-10 rounded-2xl border border-lime-400/25 bg-gradient-to-br from-lime-400/[0.12] to-zinc-900 p-6 text-center">
          <h2 className="font-heading font-black text-2xl uppercase tracking-tight mb-2">
            Now do it with <span className="text-lime-400">your</span> clip
          </h2>
          <p className="text-zinc-300 text-sm mb-5 max-w-md mx-auto">
            Sign up free and get 100 tokens — enough for a full analysis of your
            own game. No card required.
          </p>
          <SignupCTA label="Analyse your own video — first one free" />
          <p className="text-[11px] text-zinc-500 mt-3">
            Works for badminton, tennis, cricket, pickleball and more — any clip
            where the action is clearly in frame.
          </p>
        </div>

        {/* honesty footnote */}
        <p className="text-[10px] text-zinc-600 text-center mt-6">
          A real analysis of a sample clip, shown so you can see the output
          before signing up. Not your own game.
        </p>
      </div>
    </div>
  );
}
