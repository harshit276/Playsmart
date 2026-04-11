import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Video, Dumbbell, ShoppingBag, Sparkles, Trophy, ArrowRight, Check, Zap, Target, Activity,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }),
};

const FEATURES = [
  {
    icon: Zap,
    title: "Smash Speed Detection",
    desc: "Measure the speed of every smash from your video. See how you compare to pros and track improvement over time.",
  },
  {
    icon: Target,
    title: "Shot Classification",
    desc: "AI automatically identifies every shot you play — smash, clear, drop, drive, and net shot — and breaks down your shot selection.",
  },
  {
    icon: Video,
    title: "Frame-by-Frame Analysis",
    desc: "Get detailed technique feedback on grip, footwork, wind-up, contact point, and follow-through for every rally.",
  },
  {
    icon: Dumbbell,
    title: "Badminton Training Plans",
    desc: "Personalized weekly drills for smash power, defensive clears, deceptive net play, and court movement.",
  },
  {
    icon: ShoppingBag,
    title: "Racket Recommendations",
    desc: "Get racket suggestions tuned to your playing style and budget — from Yonex and Li-Ning to Victor and Babolat.",
  },
  {
    icon: Activity,
    title: "Match Highlight Reels",
    desc: "Auto-generate highlight clips of your best rallies to share with friends, coaches, or on social media.",
  },
];

const SMASH_STEPS = [
  { title: "Grip", desc: "Use the forehand grip with your thumb on the bevel for maximum power and control." },
  { title: "Footwork", desc: "Get behind the shuttle early with your non-racket foot forward and body sideways to the net." },
  { title: "Wind-up", desc: "Rotate your shoulders fully, raise your racket arm with elbow high, and load your non-racket arm up for balance." },
  { title: "Contact", desc: "Hit the shuttle at the highest point, slightly in front of your body, with the racket face angled downward." },
  { title: "Follow-through", desc: "Snap your wrist downward at contact and let the racket follow across your body for the final acceleration." },
  { title: "Recovery", desc: "Return to base position immediately so you're ready for the next shot." },
];

const RACKETS = [
  { name: "Yonex Astrox 99 Pro", role: "Power smashers", price: "₹18,000+" },
  { name: "Li-Ning Axforce 90", role: "Attacking players", price: "₹14,000+" },
  { name: "Victor Thruster K Falcon", role: "All-round aggressive", price: "₹9,500+" },
  { name: "Yonex Muscle Power 29", role: "Beginners", price: "₹1,400+" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Smash power & footwork ladder drills" },
  { day: "Tue", focus: "Defensive clears and lift consistency" },
  { day: "Wed", focus: "Rest / mobility work" },
  { day: "Thu", focus: "Net play deception and tumbling shots" },
  { day: "Fri", focus: "Match simulation with AI video analysis" },
  { day: "Sat", focus: "Multi-shuttle drills and endurance" },
  { day: "Sun", focus: "Recovery and video review" },
];

const FAQS = [
  {
    q: "How fast is a professional badminton smash?",
    a: "The fastest recorded smash exceeds 500 km/h (Mads Pieler Kolding). Most professional men smash at 350-420 km/h and recreational players typically hit 100-200 km/h. AthlyticAI's badminton video analyzer estimates your smash speed directly from footage.",
  },
  {
    q: "Can I use my phone to analyze my badminton game?",
    a: "Yes. Record any rally from the back of the court with your phone, upload it to AthlyticAI, and our AI badminton coach will classify every shot, measure smash speed, and suggest drills — no extra sensors required.",
  },
  {
    q: "What is the best badminton racket for beginners?",
    a: "Beginners should pick a head-light, medium-flex racket weighing 80-85g. Good value options include the Yonex Muscle Power 29, Li-Ning XP 2020, and Cosco CBX-450. See all recommendations on our equipment page.",
  },
  {
    q: "How often should I train to improve at badminton?",
    a: "Most improving players train 3-5 times per week, mixing technical drills, footwork, match play, and strength work. Our AI-generated badminton training plans balance these automatically based on your goals and schedule.",
  },
  {
    q: "Is the AthlyticAI badminton training app free?",
    a: "Yes, you can analyze videos, generate training plans, and browse equipment recommendations completely free. No credit card required to get started.",
  },
];

export default function BadmintonPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="badminton-page">
      <SEO
        title="AI Badminton Coach - Video Analysis & Training App"
        description="Free AI badminton coach: analyze your smash speed, get shot classification, personalized training plans, and racket recommendations. Upload any video and improve fast."
        keywords="badminton video analysis, AI badminton coach, badminton training app, badminton shot analyzer, smash speed measurement, badminton drills, best badminton racket India"
        url="https://athlyticai.com/badminton"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Badminton Coach - Video Analysis & Training",
          description: "AI-powered badminton video analysis, smash speed detection, shot classification, and personalized training plans.",
          url: "https://athlyticai.com/badminton",
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
        <div className="absolute inset-0 bg-gradient-to-b from-lime-400/5 via-zinc-950 to-zinc-950" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Badge className="bg-lime-400/10 text-lime-400 border border-lime-400/30 mb-6">
              🏸 Badminton Specialist
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-lime-400">Badminton</span> Coach<br />Analyze Your Game
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            Master your badminton game with AI-powered video analysis, smash speed detection,
            personalized training plans, and smart racket recommendations — built specifically for
            badminton players.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide">
              <Link to="/analyze?sport=badminton">Analyze Your Game</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/equipment?sport=badminton">View Rackets</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features for badminton */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Features</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">
              Built for Badminton Players
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              Every tool on AthlyticAI is tuned to the pace, geometry, and technique of badminton.
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
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-lime-400/30 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-lime-400/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-lime-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-heading font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How to improve smash */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Technique Guide</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              How to Improve Your Badminton Smash
            </h2>
            <p className="text-zinc-400">
              The smash is the most powerful shot in badminton. Nail these six elements and your attack
              will become significantly harder to defend against.
            </p>
          </div>
          <ol className="space-y-4">
            {SMASH_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-lime-400/10 border border-lime-400/30 flex items-center justify-center text-lime-400 font-heading font-bold">
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
              to="/analyze?sport=badminton"
              className="inline-flex items-center gap-2 text-lime-400 hover:text-lime-300 font-semibold"
            >
              Analyze your smash technique with AI <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Racket recommendations */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Gear</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Best Badminton Rackets in 2026
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              A quick preview of top-rated rackets across skill levels. Our AI equipment finder matches
              rackets to your swing, hand size, and style.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {RACKETS.map((r) => (
              <div key={r.name} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div>
                  <div className="text-white font-semibold">{r.name}</div>
                  <div className="text-zinc-500 text-sm">Ideal for: {r.role}</div>
                </div>
                <div className="text-lime-400 font-heading font-bold">{r.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild className="bg-lime-400 text-black hover:bg-lime-500">
              <Link to="/equipment?sport=badminton">See All Racket Recommendations</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Training plan preview */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Training</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Sample Weekly Badminton Training Plan
            </h2>
            <p className="text-zinc-400">
              A snapshot of what an AI-generated badminton training plan looks like for an intermediate
              singles player. Your actual plan adapts to your level, goals, and available time.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {PLAN_SAMPLE.map((p) => (
              <div key={p.day} className="flex items-center gap-4 px-5 py-4">
                <div className="w-12 text-lime-400 font-heading font-bold uppercase">{p.day}</div>
                <div className="flex-1 text-zinc-300 text-sm">{p.focus}</div>
                <Check className="w-4 h-4 text-zinc-600" />
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button asChild variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=badminton">Generate My Full Training Plan</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Badminton FAQs</h2>
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
          <Trophy className="w-12 h-12 text-lime-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4 uppercase tracking-tight">
            Ready to Improve Your Badminton?
          </h2>
          <p className="text-zinc-400 mb-8">
            Upload a video, get instant AI feedback, and start training like the pros. Free to try — no
            credit card needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase">
              <Link to="/analyze?sport=badminton">Start Analysis (Free)</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=badminton">Get Training Plan</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center gap-6 text-sm text-zinc-500">
            <Link to="/tennis" className="hover:text-lime-400">Tennis Coach</Link>
            <Link to="/table-tennis" className="hover:text-lime-400">Table Tennis Coach</Link>
            <Link to="/pickleball" className="hover:text-lime-400">Pickleball Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
