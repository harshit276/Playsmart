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
    title: "Stroke Technique Analysis",
    desc: "Upload poolside video and get feedback on your catch, pull, and recovery so you swim more efficiently with less effort.",
  },
  {
    icon: Target,
    title: "Body Position & Alignment",
    desc: "AI checks your head position, hip height, and body line — the biggest sources of drag for most swimmers.",
  },
  {
    icon: Activity,
    title: "Stroke Rate & Symmetry",
    desc: "See your stroke count, tempo, and left-vs-right symmetry to balance your stroke and build endurance.",
  },
  {
    icon: Video,
    title: "Frame-by-Frame Breakdown",
    desc: "Detailed feedback on hand entry, breathing timing, and kick through every phase of freestyle, breaststroke, and more.",
  },
  {
    icon: Dumbbell,
    title: "Swimming Training Plans",
    desc: "Personalized sets for technique, endurance, and speed — structured warm-up, drills, main set, and cool-down.",
  },
  {
    icon: ShoppingBag,
    title: "Gear Recommendations",
    desc: "Goggles, caps, fins, and training aids matched to your level and goals — from first laps to competitive swimming.",
  },
];

const FREESTYLE_STEPS = [
  { title: "Body position", desc: "Keep your body flat and streamlined at the surface with your head in line — look down, not forward, to lift your hips." },
  { title: "Catch", desc: "Enter the hand fingertips-first in front of your shoulder, then bend the elbow to 'catch' the water with the forearm." },
  { title: "Pull", desc: "Pull straight back along your centreline with a high elbow, accelerating the hand past your hip." },
  { title: "Recovery", desc: "Lead the recovery with a relaxed high elbow, swinging the arm forward without crossing the midline." },
  { title: "Breathing", desc: "Rotate from the core to breathe to the side as one arm recovers — keep one goggle in the water and exhale steadily underwater." },
  { title: "Kick", desc: "Use a steady, compact flutter kick from the hips — small, fast kicks for balance and propulsion, not big knee bends." },
];

const GEAR = [
  { name: "Speedo Vanquisher 2.0 Goggles", role: "Lap swimmers", price: "₹1,200+" },
  { name: "Arena Cobra Ultra Goggles", role: "Speed / competition", price: "₹3,500+" },
  { name: "Silicone Swim Cap", role: "All swimmers", price: "₹300+" },
  { name: "Training Fins", role: "Technique & kick work", price: "₹1,500+" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Technique — freestyle catch and body-position drills" },
  { day: "Tue", focus: "Endurance — steady aerobic distance set" },
  { day: "Wed", focus: "Rest / dryland mobility and core" },
  { day: "Thu", focus: "Breathing rhythm and bilateral breathing drills" },
  { day: "Fri", focus: "Speed intervals with AI video analysis" },
  { day: "Sat", focus: "Mixed-stroke set and kick work" },
  { day: "Sun", focus: "Easy recovery swim and video review" },
];

const FAQS = [
  {
    q: "What are the most common freestyle swimming mistakes?",
    a: "The most common mistakes are lifting the head too high (which sinks the hips), crossing the centreline on entry, a dropped elbow during the pull, holding your breath instead of exhaling underwater, and an over-big knee-bending kick. Atheonics's stroke analysis flags these directly from your video.",
  },
  {
    q: "How can I swim freestyle without getting tired so quickly?",
    a: "Efficiency beats effort. Improve your body position to cut drag, exhale fully underwater so each breath is relaxed, and lengthen your stroke instead of thrashing. A steady, compact kick and a smooth catch save huge amounts of energy.",
  },
  {
    q: "How do I analyze my swimming technique?",
    a: "Have someone film you from the side of the pool (above and, if possible, below the surface), upload the clip to Atheonics, and the AI swimming coach will break down your body position, catch, pull, and breathing with frame-by-frame feedback.",
  },
  {
    q: "How do I breathe properly while swimming freestyle?",
    a: "Breathe by rotating your whole body to the side as one arm recovers — keep your head low with one goggle still in the water. Exhale continuously through your nose and mouth while your face is down so you only need to inhale when you turn.",
  },
  {
    q: "Is the Atheonics swimming app free?",
    a: "Yes. You can analyze stroke videos, generate training plans, and browse gear recommendations for free. No credit card required to get started.",
  },
];

export default function SwimmingPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="swimming-page">
      <SEO
        title="AI Swimming Coach - Stroke & Freestyle Technique Analysis"
        description="Free AI swimming coach: analyze your freestyle and stroke technique, fix common mistakes, get personalized training plans and gear recommendations. Upload a poolside video and swim faster."
        keywords="swimming video analysis, AI swimming coach, freestyle technique, swimming stroke analysis, swimming mistakes, swimming training plan, how to swim faster, best swimming goggles"
        url="https://atheonics.com/swimming"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Swimming Coach - Stroke & Freestyle Technique Analysis",
          description: "AI-powered swimming video analysis, stroke technique breakdown, body-position feedback, and personalized training plans.",
          url: "https://atheonics.com/swimming",
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
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-400/5 via-zinc-950 to-zinc-950" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Badge className="bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 mb-6">
              🏊 Swimming Specialist
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-cyan-400">Swimming</span> Coach<br />Analyze Your Stroke
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            Swim faster and smoother with AI-powered stroke analysis, body-position feedback,
            personalized training plans, and gear recommendations — built specifically for swimmers.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="bg-cyan-400 text-black hover:bg-cyan-500 font-bold uppercase tracking-wide">
              <Link to="/analyze?sport=swimming">Analyze Your Stroke</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/equipment?sport=swimming">View Gear</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-cyan-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Features</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">
              Built for Swimmers
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              Every tool on Atheonics is tuned to stroke efficiency, body position, and the technique that makes you faster.
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
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-cyan-400/30 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-cyan-400/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-cyan-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-heading font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How to improve freestyle */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-cyan-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Technique Guide</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              How to Improve Your Freestyle Technique
            </h2>
            <p className="text-zinc-400">
              Efficient freestyle is about reducing drag and maximizing each stroke. Get these six
              elements right and you will swim faster while using less energy.
            </p>
          </div>
          <ol className="space-y-4">
            {FREESTYLE_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 font-heading font-bold">
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
              to="/analyze?sport=swimming"
              className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              Analyze your stroke technique with AI <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Gear recommendations */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-cyan-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Gear</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Best Swimming Gear in 2026
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              A quick preview of essentials across levels. Our AI equipment finder matches goggles and
              training aids to your goals and budget.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GEAR.map((r) => (
              <div key={r.name} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div>
                  <div className="text-white font-semibold">{r.name}</div>
                  <div className="text-zinc-500 text-sm">Ideal for: {r.role}</div>
                </div>
                <div className="text-cyan-400 font-heading font-bold whitespace-nowrap ml-3">{r.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild className="bg-cyan-400 text-black hover:bg-cyan-500">
              <Link to="/equipment?sport=swimming">See All Gear Recommendations</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Training plan preview */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-cyan-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Training</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Sample Weekly Swimming Training Plan
            </h2>
            <p className="text-zinc-400">
              A snapshot of what an AI-generated swimming plan looks like for an improving lap swimmer.
              Your actual plan adapts to your level, goals, and available pool time.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {PLAN_SAMPLE.map((p) => (
              <div key={p.day} className="flex items-center gap-4 px-5 py-4">
                <div className="w-12 text-cyan-400 font-heading font-bold uppercase">{p.day}</div>
                <div className="flex-1 text-zinc-300 text-sm">{p.focus}</div>
                <Check className="w-4 h-4 text-zinc-600" />
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button asChild variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=swimming">Generate My Full Training Plan</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-cyan-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Swimming FAQs</h2>
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
          <Trophy className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4 uppercase tracking-tight">
            Ready to Improve Your Swimming?
          </h2>
          <p className="text-zinc-400 mb-8">
            Upload a poolside video, get instant AI feedback, and start swimming more efficiently. Free
            to try — no credit card needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-cyan-400 text-black hover:bg-cyan-500 font-bold uppercase">
              <Link to="/analyze?sport=swimming">Start Analysis (Free)</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=swimming">Get Training Plan</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center gap-6 text-sm text-zinc-500">
            <Link to="/badminton" className="hover:text-cyan-400">Badminton Coach</Link>
            <Link to="/cricket" className="hover:text-cyan-400">Cricket Coach</Link>
            <Link to="/football" className="hover:text-cyan-400">Football Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
