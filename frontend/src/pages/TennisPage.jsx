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
    icon: Zap,
    title: "Serve Speed Measurement",
    desc: "Measure every serve you hit directly from your phone video. Track first-serve average speed and consistency session to session.",
  },
  {
    icon: Target,
    title: "Shot Classification",
    desc: "AI tags every forehand, backhand, slice, volley, overhead, and serve — so you see exactly how you're winning and losing points.",
  },
  {
    icon: Video,
    title: "Technique Breakdown",
    desc: "Frame-by-frame analysis of your kinetic chain: unit turn, loading, racket drop, contact point, and follow-through.",
  },
  {
    icon: Dumbbell,
    title: "Tennis Training Plans",
    desc: "Personalized drills for serve power, topspin forehands, one- or two-handed backhands, net play, and movement.",
  },
  {
    icon: ShoppingBag,
    title: "Racquet Recommendations",
    desc: "Smart racquet and string suggestions based on your swing speed, style, and budget — across Wilson, Babolat, Head, and Yonex.",
  },
  {
    icon: Activity,
    title: "Match Highlight Reels",
    desc: "Auto-generate highlight clips from match footage and share your best winners and rallies.",
  },
];

const SERVE_STEPS = [
  { title: "Stance & Grip", desc: "Platform or pinpoint stance with a continental grip — your palm on the side bevel." },
  { title: "Toss", desc: "Release around eye level at roughly 12 o'clock, slightly inside the baseline. Consistent toss = consistent serve." },
  { title: "Trophy Position", desc: "Racket up, elbow bent around 90 degrees, tossing arm extended and hips loaded back." },
  { title: "Racket Drop", desc: "Let the racket head drop fully behind your back for maximum power through elastic energy." },
  { title: "Contact", desc: "Explode up into the ball with full extension. Pronate through contact to generate spin and pace." },
  { title: "Landing & Recovery", desc: "Land inside the baseline on your front foot, split-step, and prepare for the next shot." },
];

const RACQUETS = [
  { name: "Wilson Pro Staff 97 v14", role: "Advanced control players", price: "₹19,000+" },
  { name: "Babolat Pure Aero", role: "Topspin baseliners", price: "₹17,500+" },
  { name: "Head Speed MP", role: "All-court players", price: "₹16,000+" },
  { name: "Yonex Ezone 100", role: "Powerful intermediates", price: "₹15,500+" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Serve and forehand patterns with video review" },
  { day: "Tue", focus: "Backhand cross-court consistency and footwork" },
  { day: "Wed", focus: "Rest / mobility and shoulder prehab" },
  { day: "Thu", focus: "Net approaches and volley technique" },
  { day: "Fri", focus: "Live-ball point play and match simulation" },
  { day: "Sat", focus: "Serve-speed work and agility ladders" },
  { day: "Sun", focus: "Match play and highlight review" },
];

const FAQS = [
  {
    q: "How can I analyze my tennis serve with video?",
    a: "Record your serve from behind the baseline or 45° side view. Upload it to AthlyticAI and our AI tennis coach will break down trophy position, racket drop, contact point, and measure your serve speed.",
  },
  {
    q: "How fast is a professional tennis serve?",
    a: "Top ATP players regularly serve above 200 km/h; the record is around 263 km/h. Club players typically serve 120-160 km/h. AthlyticAI's tennis video analyzer estimates your serve speed from any smartphone footage.",
  },
  {
    q: "What is the best tennis racquet for intermediate players?",
    a: "Most intermediates benefit from 100 sq in heads around 300g strung, like the Babolat Pure Drive, Wilson Clash 100, or Head Speed MP. See full recommendations based on your swing.",
  },
  {
    q: "Can AthlyticAI coach forehand and backhand technique?",
    a: "Yes. Our AI models are trained on professional tennis footage and flag common issues like late prep, collapsed wrist at contact, closing the racket face early, and poor weight transfer.",
  },
  {
    q: "Is the tennis training app free to use?",
    a: "Yes. Video analysis, training plan generation, and equipment recommendations are all free to get started — no credit card required.",
  },
];

export default function TennisPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="tennis-page">
      <SEO
        title="AI Tennis Coach - Serve Analysis & Training App"
        description="Free AI tennis coach: measure serve speed, analyze forehand and backhand technique, get personalized training plans, and smart racquet recommendations."
        keywords="tennis video analyzer, tennis serve analysis, AI tennis coach, tennis training app, best tennis racquet, tennis shot analyzer, forehand analysis, backhand technique"
        url="https://athlyticai.com/tennis"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Tennis Coach - Video Analysis & Training",
          description: "AI-powered tennis video analysis, serve speed measurement, and personalized training plans.",
          url: "https://athlyticai.com/tennis",
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
        <div className="absolute inset-0 bg-gradient-to-b from-amber-400/5 via-zinc-950 to-zinc-950" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Badge className="bg-amber-400/10 text-amber-400 border border-amber-400/30 mb-6">
              🎾 Tennis Specialist
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-amber-400">Tennis</span> Coach<br />Improve Your Game
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            Upload any match or practice video. Get serve speed, forehand and backhand analysis,
            personalized training plans, and racquet recommendations — powered by computer vision.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="bg-amber-400 text-black hover:bg-amber-500 font-bold uppercase tracking-wide">
              <Link to="/analyze?sport=tennis">Analyze Your Serve</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/equipment?sport=tennis">View Racquets</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Features</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">
              Everything a Tennis Player Needs
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              From serve speed tracking to shot-by-shot pattern analysis, AthlyticAI is your always-on
              tennis coach.
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
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-amber-400/30 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-amber-400/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-amber-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-heading font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Serve guide */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Technique Guide</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              How to Improve Your Tennis Serve
            </h2>
            <p className="text-zinc-400">
              The serve is the only shot you completely control. Dial in these six phases and you'll add
              free points to every service game.
            </p>
          </div>
          <ol className="space-y-4">
            {SERVE_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 font-heading font-bold">
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
              to="/analyze?sport=tennis"
              className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 font-semibold"
            >
              Analyze your serve with AI <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Racquets */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Gear</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Best Tennis Racquets in 2026
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              Quick picks across styles. Our AI equipment finder personalizes racquet and string
              suggestions to your swing.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {RACQUETS.map((r) => (
              <div key={r.name} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div>
                  <div className="text-white font-semibold">{r.name}</div>
                  <div className="text-zinc-500 text-sm">Ideal for: {r.role}</div>
                </div>
                <div className="text-amber-400 font-heading font-bold">{r.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild className="bg-amber-400 text-black hover:bg-amber-500">
              <Link to="/equipment?sport=tennis">See All Racquet Recommendations</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Plan */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Training</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Sample Weekly Tennis Training Plan
            </h2>
            <p className="text-zinc-400">
              A snapshot for an intermediate singles player. Your real plan adapts to goals, availability,
              and video analysis results.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {PLAN_SAMPLE.map((p) => (
              <div key={p.day} className="flex items-center gap-4 px-5 py-4">
                <div className="w-12 text-amber-400 font-heading font-bold uppercase">{p.day}</div>
                <div className="flex-1 text-zinc-300 text-sm">{p.focus}</div>
                <Check className="w-4 h-4 text-zinc-600" />
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button asChild variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=tennis">Generate My Full Training Plan</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Tennis FAQs</h2>
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

      {/* Related Articles */}
      <section className="py-12 px-4 max-w-5xl mx-auto">
        <h2 className="text-2xl font-heading font-bold text-white mb-6 text-center">
          Related Articles
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/blog/tennis-serve-speed-tips" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-amber-400/30 transition-all">
            <Badge className="mb-2 bg-amber-400/10 text-amber-400">Training</Badge>
            <h3 className="font-bold text-white mb-1">How to Increase Your Tennis Serve Speed</h3>
            <p className="text-xs text-zinc-400">Mechanics and drills for a faster, more accurate serve</p>
          </Link>
          <Link to="/blog/best-tennis-racquet-under-5000-india" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-amber-400/30 transition-all">
            <Badge className="mb-2 bg-amber-400/10 text-amber-400">Gear</Badge>
            <h3 className="font-bold text-white mb-1">Best Tennis Racquets Under ₹5000 in India</h3>
            <p className="text-xs text-zinc-400">Affordable racquets for beginners and intermediate players</p>
          </Link>
          <Link to="/blog/tennis-injuries-prevention" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-amber-400/30 transition-all">
            <Badge className="mb-2 bg-amber-400/10 text-amber-400">Health</Badge>
            <h3 className="font-bold text-white mb-1">Common Tennis Injuries & How to Prevent Them</h3>
            <p className="text-xs text-zinc-400">Protect your shoulder, elbow, and knees on court</p>
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4 uppercase tracking-tight">
            Ready to Level Up Your Tennis?
          </h2>
          <p className="text-zinc-400 mb-8">
            Upload your next practice session and see exactly where you're winning and losing points.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-amber-400 text-black hover:bg-amber-500 font-bold uppercase">
              <Link to="/analyze?sport=tennis">Start Analysis (Free)</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=tennis">Get Training Plan</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center gap-6 text-sm text-zinc-500">
            <Link to="/badminton" className="hover:text-amber-400">Badminton Coach</Link>
            <Link to="/table-tennis" className="hover:text-amber-400">Table Tennis Coach</Link>
            <Link to="/pickleball" className="hover:text-amber-400">Pickleball Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
