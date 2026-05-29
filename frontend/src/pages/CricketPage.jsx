import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Video, Dumbbell, ShoppingBag, Trophy, ArrowRight, Check, Zap, Target, Activity,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }),
};

const FEATURES = [
  {
    icon: Zap,
    title: "Bat Swing & Timing Analysis",
    desc: "Upload a net or match video and get feedback on your backlift, downswing path, and contact point so you time the ball cleaner.",
  },
  {
    icon: Target,
    title: "Shot Recognition",
    desc: "AI identifies your strokes — cover drive, pull, cut, flick, and defensive shots — and breaks down your shot selection and balance.",
  },
  {
    icon: Activity,
    title: "Bowling Action Breakdown",
    desc: "Analyze your run-up, load-up, and release for pace and accuracy. Spot front-arm and follow-through faults that leak runs.",
  },
  {
    icon: Video,
    title: "Frame-by-Frame Technique",
    desc: "Detailed feedback on head position, foot movement, and bat face angle through every phase of the shot.",
  },
  {
    icon: Dumbbell,
    title: "Cricket Training Plans",
    desc: "Personalized weekly drills for batting timing, footwork, bowling consistency, and fielding reflexes.",
  },
  {
    icon: ShoppingBag,
    title: "Bat & Gear Recommendations",
    desc: "Get bat suggestions matched to your height, playing style, and budget — from Kashmir willow starters to pro English willow.",
  },
];

const BATTING_STEPS = [
  { title: "Stance", desc: "Stand side-on with feet shoulder-width apart, knees slightly flexed, and weight balanced on the balls of your feet." },
  { title: "Grip", desc: "Form a 'V' down the back of the bat with both hands close together for control and full swing range." },
  { title: "Backlift", desc: "Take the bat back straight towards the stumps with hands rising, keeping your head still and eyes level." },
  { title: "Foot movement", desc: "Move decisively — front foot to the pitch of fuller balls, back foot for short balls — to get to the line of the ball." },
  { title: "Contact", desc: "Meet the ball under your eyes with a straight bat and soft hands, letting the ball come to you for timing over power." },
  { title: "Follow-through", desc: "Complete the swing in the direction of the shot and hold your shape — a balanced finish means a balanced shot." },
];

const BATS = [
  { name: "SS Ton Player Edition (English Willow)", role: "Advanced batters", price: "₹12,000+" },
  { name: "SG Sierra 250 (English Willow)", role: "Intermediate club players", price: "₹6,500+" },
  { name: "MRF Genius (Kashmir Willow)", role: "All-round value", price: "₹3,000+" },
  { name: "Kookaburra Beast (Kashmir Willow)", role: "Beginners", price: "₹1,800+" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Batting timing — throwdowns and shadow drills" },
  { day: "Tue", focus: "Bowling run-up rhythm and target practice" },
  { day: "Wed", focus: "Rest / mobility and core work" },
  { day: "Thu", focus: "Footwork against spin and pace variations" },
  { day: "Fri", focus: "Match-situation net with AI video analysis" },
  { day: "Sat", focus: "Fielding drills and throwing accuracy" },
  { day: "Sun", focus: "Recovery and video review" },
];

const FAQS = [
  {
    q: "What size cricket bat should I use?",
    a: "Bat size is based on height. For example, a player 5'6\"–5'9\" usually needs a Harrow or full-size Short Handle bat, while players under 4'11\" use sizes 4–6. Pick a bat you can pick up and swing comfortably without straining. AthlyticAI's gear finder matches a size and weight to your height and style.",
  },
  {
    q: "Kashmir willow or English willow — which is better?",
    a: "English willow offers better performance, more 'ping', and a larger sweet spot, making it ideal for serious players, but it costs more and needs knocking-in. Kashmir willow is harder, more durable, and far cheaper — perfect for beginners and tennis-ball/occasional cricket.",
  },
  {
    q: "How can I analyze my batting technique at home?",
    a: "Record yourself batting in the nets from side-on with your phone, upload it to AthlyticAI, and the AI cricket coach will break down your stance, backlift, footwork, and contact point with frame-by-frame feedback — no coach required.",
  },
  {
    q: "How do I bowl faster?",
    a: "Pace comes from a smooth, accelerating run-up, a strong braced front leg, full hip and shoulder rotation, and a high, fast bowling arm. Strength and mobility work add to it. Our AI analyzes your action to flag the faults that cost you speed.",
  },
  {
    q: "Is the AthlyticAI cricket app free?",
    a: "Yes. You can analyze videos, generate training plans, and browse bat and gear recommendations for free. No credit card required to start.",
  },
];

export default function CricketPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="cricket-page">
      <SEO
        title="AI Cricket Coach - Batting & Bowling Video Analysis App"
        description="Free AI cricket coach: analyze your batting technique and bowling action, get shot recognition, personalized training plans, and bat recommendations. Upload a net video and improve fast."
        keywords="cricket video analysis, AI cricket coach, batting technique analysis, bowling action analysis, cricket training app, best cricket bat for beginners, cricket drills"
        url="https://athlyticai.com/cricket"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Cricket Coach - Batting & Bowling Video Analysis",
          description: "AI-powered cricket video analysis, batting technique breakdown, bowling action analysis, and personalized training plans.",
          url: "https://athlyticai.com/cricket",
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
        <div className="absolute inset-0 bg-gradient-to-b from-blue-400/5 via-zinc-950 to-zinc-950" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Badge className="bg-blue-400/10 text-blue-400 border border-blue-400/30 mb-6">
              🏏 Cricket Specialist
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-blue-400">Cricket</span> Coach<br />Analyze Your Game
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            Sharpen your batting and bowling with AI-powered video analysis, shot recognition,
            personalized training plans, and smart bat recommendations — built specifically for
            cricketers.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="bg-blue-400 text-black hover:bg-blue-500 font-bold uppercase tracking-wide">
              <Link to="/analyze?sport=cricket">Analyze Your Game</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/equipment?sport=cricket">View Bats</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Features</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">
              Built for Cricketers
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              Every tool on AthlyticAI is tuned to the technique and demands of batting, bowling, and fielding.
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
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-blue-400/30 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-400/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-blue-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-heading font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How to improve batting */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Technique Guide</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              How to Improve Your Batting Technique
            </h2>
            <p className="text-zinc-400">
              Consistent run-scoring is built on solid fundamentals. Master these six elements and you
              will time the ball better and play with more control.
            </p>
          </div>
          <ol className="space-y-4">
            {BATTING_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-400/10 border border-blue-400/30 flex items-center justify-center text-blue-400 font-heading font-bold">
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
              to="/analyze?sport=cricket"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-semibold"
            >
              Analyze your batting technique with AI <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Bat recommendations */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Gear</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Best Cricket Bats in 2026
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              A quick preview of top-rated bats across skill levels and budgets. Our AI equipment finder
              matches a bat to your height, style, and price range.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {BATS.map((r) => (
              <div key={r.name} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div>
                  <div className="text-white font-semibold">{r.name}</div>
                  <div className="text-zinc-500 text-sm">Ideal for: {r.role}</div>
                </div>
                <div className="text-blue-400 font-heading font-bold whitespace-nowrap ml-3">{r.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild className="bg-blue-400 text-black hover:bg-blue-500">
              <Link to="/equipment?sport=cricket">See All Bat Recommendations</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Training plan preview */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Training</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Sample Weekly Cricket Training Plan
            </h2>
            <p className="text-zinc-400">
              A snapshot of what an AI-generated cricket training plan looks like for an improving
              all-rounder. Your actual plan adapts to your role, level, and available time.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {PLAN_SAMPLE.map((p) => (
              <div key={p.day} className="flex items-center gap-4 px-5 py-4">
                <div className="w-12 text-blue-400 font-heading font-bold uppercase">{p.day}</div>
                <div className="flex-1 text-zinc-300 text-sm">{p.focus}</div>
                <Check className="w-4 h-4 text-zinc-600" />
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button asChild variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=cricket">Generate My Full Training Plan</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Cricket FAQs</h2>
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
          <Trophy className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4 uppercase tracking-tight">
            Ready to Improve Your Cricket?
          </h2>
          <p className="text-zinc-400 mb-8">
            Upload a net or match video, get instant AI feedback, and start training smarter. Free to
            try — no credit card needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-blue-400 text-black hover:bg-blue-500 font-bold uppercase">
              <Link to="/analyze?sport=cricket">Start Analysis (Free)</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=cricket">Get Training Plan</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center gap-6 text-sm text-zinc-500">
            <Link to="/badminton" className="hover:text-blue-400">Badminton Coach</Link>
            <Link to="/tennis" className="hover:text-blue-400">Tennis Coach</Link>
            <Link to="/football" className="hover:text-blue-400">Football Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
