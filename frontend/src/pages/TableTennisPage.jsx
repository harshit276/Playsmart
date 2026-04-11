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
    title: "Stroke Classification",
    desc: "AI tags every forehand drive, backhand drive, loop, chop, smash, push, and flick across your match footage.",
  },
  {
    icon: Zap,
    title: "Spin Technique Tips",
    desc: "Breakdowns of topspin, backspin, sidespin, and no-spin — including brush angle, contact point, and wrist snap.",
  },
  {
    icon: Video,
    title: "Frame-by-Frame Analysis",
    desc: "Review your stance, body rotation, bat angle, and follow-through on every stroke with slow-motion playback.",
  },
  {
    icon: Dumbbell,
    title: "Training Programs",
    desc: "Personalized drills for footwork, multiball, third-ball attack, serve-and-receive, and match tactics.",
  },
  {
    icon: ShoppingBag,
    title: "Paddle & Rubber Guide",
    desc: "Smart recommendations on blades, rubbers, and sponges across Butterfly, Stiga, Yasaka, and more.",
  },
  {
    icon: Activity,
    title: "Highlight Reels",
    desc: "Generate highlights of your best rallies automatically and share them with your training partners.",
  },
];

const STROKE_TIPS = [
  { title: "Stance", desc: "Knees bent, weight on the balls of your feet, and body square to the direction you want to hit." },
  { title: "Bat Angle", desc: "Closed for topspin loops, open for backspin pushes and chops — adjust to incoming spin." },
  { title: "Contact Point", desc: "Contact the ball in front of your body, between waist and chest height, at the peak of the bounce." },
  { title: "Body Rotation", desc: "Power comes from hips and core rotating through the shot — not just the arm." },
  { title: "Follow-through", desc: "Finish high and across your body on loops; short and controlled on blocks." },
  { title: "Recovery", desc: "Return bat to neutral position immediately so you can react to the next ball." },
];

const PADDLES = [
  { name: "Butterfly Timo Boll ALC", role: "All-round attackers", price: "₹16,000+" },
  { name: "Stiga Carbonado 145", role: "Offensive loopers", price: "₹13,500+" },
  { name: "Yasaka Ma Lin Extra Offensive", role: "Classic wood feel", price: "₹8,000+" },
  { name: "Butterfly Addoy Pre-assembled", role: "Beginners", price: "₹1,800+" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Forehand topspin against backspin drills" },
  { day: "Tue", focus: "Footwork: Falkenberg and side-to-side" },
  { day: "Wed", focus: "Serve variations and third-ball attack" },
  { day: "Thu", focus: "Backhand flick and over-the-table play" },
  { day: "Fri", focus: "Multiball intensity with AI video review" },
  { day: "Sat", focus: "Match simulation and tactical play" },
  { day: "Sun", focus: "Rest and video review" },
];

const FAQS = [
  {
    q: "Can AI really analyze table tennis video?",
    a: "Yes. AthlyticAI's table tennis video analysis detects the ball and both players, classifies every stroke, and provides technique feedback even from a standard phone video filmed from the end of the table.",
  },
  {
    q: "How do I generate more spin on my forehand loop?",
    a: "Brush the ball with a thin contact using forward-and-up motion, accelerate the bat through contact with a fast wrist snap, and drive power from your legs and core rotation rather than just your arm.",
  },
  {
    q: "What is the best table tennis paddle for beginners?",
    a: "Start with a pre-assembled ALL or ALL+ blade with inverted rubbers rated around 80 in speed. Popular choices include the Butterfly Addoy, Stiga Evolution, and Yasaka Sweden Extra.",
  },
  {
    q: "How fast are professional table tennis smashes?",
    a: "Professional smashes can reach 110-130 km/h at the bat, and loop drives spin the ball at over 150 rotations per second — which is why precise spin analysis is critical for improvement.",
  },
  {
    q: "Is the ping pong coach app free?",
    a: "Yes. Video analysis, stroke classification, training plans, and equipment recommendations are all free to try — no credit card required.",
  },
];

export default function TableTennisPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="table-tennis-page">
      <SEO
        title="AI Table Tennis Coach - Stroke Analysis & Training App"
        description="Free AI table tennis coach: analyze every forehand, backhand, loop, and chop from video. Get personalized drills, spin breakdowns, and paddle recommendations."
        keywords="table tennis video analysis, table tennis stroke analyzer, ping pong coach app, best table tennis paddle, table tennis training app, ping pong video analyzer, forehand loop technique"
        url="https://athlyticai.com/table-tennis"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Table Tennis Coach - Stroke Analysis & Training",
          description: "AI-powered table tennis video analysis, stroke classification, spin breakdowns, and training plans.",
          url: "https://athlyticai.com/table-tennis",
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
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/5 via-zinc-950 to-zinc-950" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Badge className="bg-sky-400/10 text-sky-400 border border-sky-400/30 mb-6">
              🏓 Table Tennis Specialist
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-sky-400">Table Tennis</span> Coach<br />Analyze Your Strokes
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            Upload any training session or match. Get stroke-by-stroke classification, spin and technique
            breakdowns, training programs, and paddle recommendations — all powered by AI.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="bg-sky-400 text-black hover:bg-sky-500 font-bold uppercase tracking-wide">
              <Link to="/analyze?sport=table_tennis">Analyze Your Game</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/equipment?sport=table_tennis">View Paddles</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Features</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">
              Built for Ping Pong Players
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              Stroke classification, spin detection, and pro-level drills — all in one table tennis app.
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
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-sky-400/30 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-sky-400/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-sky-400" strokeWidth={1.5} />
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
            <span className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Technique Guide</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Table Tennis Stroke Fundamentals
            </h2>
            <p className="text-zinc-400">
              Whether you're drilling forehand loops or backhand blocks, these six principles apply to
              every stroke in table tennis.
            </p>
          </div>
          <ol className="space-y-4">
            {STROKE_TIPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-400/10 border border-sky-400/30 flex items-center justify-center text-sky-400 font-heading font-bold">
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
              to="/analyze?sport=table_tennis"
              className="inline-flex items-center gap-2 text-sky-400 hover:text-sky-300 font-semibold"
            >
              Analyze your strokes with AI <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Equipment */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Gear</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Best Table Tennis Paddles in 2026
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              Quick picks across blades, rubbers, and budgets. Our AI equipment finder suggests the right
              combo for your playstyle.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PADDLES.map((r) => (
              <div key={r.name} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div>
                  <div className="text-white font-semibold">{r.name}</div>
                  <div className="text-zinc-500 text-sm">Ideal for: {r.role}</div>
                </div>
                <div className="text-sky-400 font-heading font-bold">{r.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild className="bg-sky-400 text-black hover:bg-sky-500">
              <Link to="/equipment?sport=table_tennis">See All Paddle Recommendations</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Plan */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Training</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Sample Weekly Table Tennis Training Plan
            </h2>
            <p className="text-zinc-400">
              Example week for an intermediate looper. AthlyticAI adapts the full plan to your level,
              schedule, and video analysis.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {PLAN_SAMPLE.map((p) => (
              <div key={p.day} className="flex items-center gap-4 px-5 py-4">
                <div className="w-12 text-sky-400 font-heading font-bold uppercase">{p.day}</div>
                <div className="flex-1 text-zinc-300 text-sm">{p.focus}</div>
                <Check className="w-4 h-4 text-zinc-600" />
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button asChild variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=table_tennis">Generate My Full Training Plan</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Table Tennis FAQs</h2>
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
          <Trophy className="w-12 h-12 text-sky-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4 uppercase tracking-tight">
            Ready to Master Your Strokes?
          </h2>
          <p className="text-zinc-400 mb-8">
            Upload a match, get AI feedback, and train with the best paddles and drills.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-sky-400 text-black hover:bg-sky-500 font-bold uppercase">
              <Link to="/analyze?sport=table_tennis">Start Analysis (Free)</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=table_tennis">Get Training Plan</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center gap-6 text-sm text-zinc-500">
            <Link to="/badminton" className="hover:text-sky-400">Badminton Coach</Link>
            <Link to="/tennis" className="hover:text-sky-400">Tennis Coach</Link>
            <Link to="/pickleball" className="hover:text-sky-400">Pickleball Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
