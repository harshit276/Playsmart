import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Video, Dumbbell, ShoppingBag, ArrowRight, Check, Zap, Target, Activity, Trophy,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }),
};

const FEATURES = [
  {
    icon: Target,
    title: "Shot Analyzer",
    desc: "AI classifies every dink, drive, drop, volley, ATP, and Erne so you see your shot mix and win patterns.",
  },
  {
    icon: Zap,
    title: "Third-Shot Drop Coach",
    desc: "Get detailed feedback on arguably the most important shot in pickleball — the third-shot drop.",
  },
  {
    icon: Video,
    title: "Video Breakdown",
    desc: "Frame-by-frame review of your paddle position, footwork in the kitchen, and transitions.",
  },
  {
    icon: Dumbbell,
    title: "Pickleball Training Plans",
    desc: "Personalized drills for dinking, resets, speed-ups, stacking, and singles strategy.",
  },
  {
    icon: ShoppingBag,
    title: "Paddle Recommendations",
    desc: "Smart suggestions across Selkirk, Joola, Paddletek, and Six Zero based on your style and budget.",
  },
  {
    icon: Activity,
    title: "Highlight Reels",
    desc: "Auto-generate highlights of your best rallies and share them with your pickleball group.",
  },
];

const TIPS = [
  { title: "Ready Position", desc: "Paddle up and in front, knees bent, weight on the balls of your feet — especially at the kitchen line." },
  { title: "Grip", desc: "Use a continental grip and a loose hold (3-4 on a 10 scale) for quick hand battles and soft dinks." },
  { title: "Third-Shot Drop", desc: "Contact low, lift with your legs, and aim to land the ball softly into the non-volley zone." },
  { title: "Dink Discipline", desc: "Stay patient at the kitchen, move opponents side to side, and wait for the right ball to attack." },
  { title: "Footwork", desc: "Split-step as your opponent contacts the ball and move with small, balanced steps." },
  { title: "Stacking & Positioning", desc: "Learn stacking strategies in doubles to keep your stronger side in the middle." },
];

const PADDLES = [
  { name: "Joola Ben Johns Perseus", role: "All-court power", price: "₹22,000+" },
  { name: "Selkirk Vanguard Power Air", role: "Control baseliners", price: "₹20,000+" },
  { name: "Paddletek Bantam TS-5", role: "Soft-game specialists", price: "₹14,000+" },
  { name: "Six Zero Double Black Diamond", role: "Pop + spin", price: "₹16,500+" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Dinking cross-court and straight-ahead" },
  { day: "Tue", focus: "Third-shot drop and drop-to-drive transition" },
  { day: "Wed", focus: "Rest / mobility" },
  { day: "Thu", focus: "Resets from mid-court and hand speed drills" },
  { day: "Fri", focus: "Match play with AI video review" },
  { day: "Sat", focus: "Stacking patterns and serve variations" },
  { day: "Sun", focus: "Recovery and tactical video study" },
];

const FAQS = [
  {
    q: "Can AI analyze my pickleball game?",
    a: "Yes. AthlyticAI's pickleball shot analyzer tags dinks, drives, drops, and volleys from any phone video and surfaces patterns like where you're attacking vs. getting attacked.",
  },
  {
    q: "What is the best pickleball paddle for intermediate players?",
    a: "For intermediates, look for a 13-16mm thick thermoformed paddle with good control and forgiveness. Top picks include the Joola Ben Johns Perseus, Selkirk Vanguard Power Air, and Six Zero Double Black Diamond.",
  },
  {
    q: "How do I improve my third-shot drop?",
    a: "Contact the ball low with a loose grip, lift gently with your legs (not your wrist), and aim to land the ball in the middle of the non-volley zone. AthlyticAI can grade your drops from video and suggest drills.",
  },
  {
    q: "How often should I play pickleball to improve?",
    a: "Most improving players play 3-4 times a week and add one or two dedicated drill sessions. Our training plans blend match play, drills, and fitness automatically.",
  },
  {
    q: "Is the pickleball training app free?",
    a: "Yes. Video analysis, training plans, and paddle recommendations are free to get started. No credit card required.",
  },
];

export default function PickleballPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="pickleball-page">
      <SEO
        title="AI Pickleball Coach - Shot Analyzer & Training App"
        description="Free AI pickleball coach: analyze your dinks, drops, and drives, get personalized training plans, and find the best pickleball paddles for your game."
        keywords="pickleball training app, pickleball shot analyzer, best pickleball paddle, AI pickleball coach, third shot drop, pickleball video analysis, pickleball drills"
        url="https://athlyticai.com/pickleball"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Pickleball Coach - Shot Analysis & Training",
          description: "AI-powered pickleball shot analyzer, training plans, and paddle recommendations.",
          url: "https://athlyticai.com/pickleball",
          mainEntity: {
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
        }}
      />

      {/* Hero */}
      <section className="relative py-24 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-400/5 via-zinc-950 to-zinc-950" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Badge className="bg-emerald-400/10 text-emerald-400 border border-emerald-400/30 mb-6">
              ⚡ Pickleball Specialist
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-emerald-400">Pickleball</span> Coach<br />Improve Your Game
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            AI shot analysis, third-shot drop feedback, personalized training plans, and smart paddle
            recommendations — everything you need to climb from 3.0 to 4.5 and beyond.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="bg-emerald-400 text-black hover:bg-emerald-500 font-bold uppercase tracking-wide">
              <Link to="/analyze?sport=pickleball">Analyze Your Game</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/equipment?sport=pickleball">View Paddles</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-emerald-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Features</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">
              Built for Pickleball Players
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              From kitchen battles to third-shot drops, every tool is tuned for pickleball-specific tactics.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                variants={fadeUp}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-emerald-400/30 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-emerald-400/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-emerald-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-heading font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Technique */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-emerald-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Technique Guide</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Pickleball Fundamentals Every Player Needs
            </h2>
            <p className="text-zinc-400">
              Master these six fundamentals and you'll instantly win more points at the kitchen line.
            </p>
          </div>
          <ol className="space-y-4">
            {TIPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center text-emerald-400 font-heading font-bold">
                  {i + 1}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">{s.title}</h3>
                  <p className="text-zinc-400 text-sm">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 text-center">
            <Link
              to="/analyze?sport=pickleball"
              className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-semibold"
            >
              Analyze your game with AI <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Paddles */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-emerald-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Gear</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Best Pickleball Paddles in 2026
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              A preview of top paddles across styles. Our AI equipment finder will match the right paddle
              to your swing and budget.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PADDLES.map((r) => (
              <div key={r.name} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div>
                  <div className="text-white font-semibold">{r.name}</div>
                  <div className="text-zinc-500 text-sm">Ideal for: {r.role}</div>
                </div>
                <div className="text-emerald-400 font-heading font-bold">{r.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild className="bg-emerald-400 text-black hover:bg-emerald-500">
              <Link to="/equipment?sport=pickleball">See All Paddle Recommendations</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Plan */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-emerald-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Training</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Sample Weekly Pickleball Training Plan
            </h2>
            <p className="text-zinc-400">
              A snapshot for a 3.5-to-4.0 player. AthlyticAI adjusts your real plan based on goals,
              schedule, and video analysis.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {PLAN_SAMPLE.map((p) => (
              <div key={p.day} className="flex items-center gap-4 px-5 py-4">
                <div className="w-12 text-emerald-400 font-heading font-bold uppercase">{p.day}</div>
                <div className="flex-1 text-zinc-300 text-sm">{p.focus}</div>
                <Check className="w-4 h-4 text-zinc-600" />
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button asChild variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=pickleball">Generate My Full Training Plan</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-emerald-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Pickleball FAQs</h2>
          </div>
          <div className="space-y-5">
            {FAQS.map((f) => (
              <div key={f.q} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-white mb-2">{f.q}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <Trophy className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4 uppercase tracking-tight">
            Ready to Win More Points?
          </h2>
          <p className="text-zinc-400 mb-8">
            Upload your next rec game and let AI show you exactly where your shot selection is costing you.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-emerald-400 text-black hover:bg-emerald-500 font-bold uppercase">
              <Link to="/analyze?sport=pickleball">Start Analysis (Free)</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=pickleball">Get Training Plan</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center gap-6 text-sm text-zinc-500">
            <Link to="/badminton" className="hover:text-emerald-400">Badminton Coach</Link>
            <Link to="/tennis" className="hover:text-emerald-400">Tennis Coach</Link>
            <Link to="/table-tennis" className="hover:text-emerald-400">Table Tennis Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
