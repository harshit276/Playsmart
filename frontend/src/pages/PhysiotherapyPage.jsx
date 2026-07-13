import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Video, HeartPulse, ShoppingBag, Trophy, ArrowRight, Check, ShieldCheck, Target, Activity,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }),
};

const FEATURES = [
  {
    icon: Target,
    title: "Movement Compensation Detection",
    desc: "AI flags common compensation patterns — like favoring one side or limiting range of motion — while you do your prescribed exercises.",
  },
  {
    icon: Activity,
    title: "Range-of-Motion Tracking",
    desc: "See your joint angles on key movements over time, so you and your physiotherapist can track real recovery progress.",
  },
  {
    icon: Check,
    title: "Rep Counting for Rehab Exercises",
    desc: "Automatic rep and set counting for home exercise programs, so you always know you've completed what was prescribed.",
  },
  {
    icon: Video,
    title: "Progress Reports to Share",
    desc: "Export a simple video-based progress summary you can share with your physiotherapist at your next session.",
  },
  {
    icon: ShieldCheck,
    title: "Safe-Form Alerts",
    desc: "Get flagged if a movement looks rushed or out of the safe range, so you can slow down and stay within your prescribed limits.",
  },
  {
    icon: ShoppingBag,
    title: "Home Rehab Equipment Picks",
    desc: "Get resistance band, foam roller, and stability equipment suggestions matched to your recovery stage.",
  },
];

const REHAB_STEPS = [
  { title: "Positioning", desc: "Set up in the position your physiotherapist prescribed — good posture and alignment before you move matters more than the rep itself." },
  { title: "Controlled Start", desc: "Begin the movement slowly and under control rather than using momentum, especially early in a recovery program." },
  { title: "Respect Your Range", desc: "Move only through the pain-free range of motion your physiotherapist has cleared — never push into sharp pain." },
  { title: "Steady Tempo", desc: "Keep a consistent, unhurried tempo through the exercise so the AI (and you) can track your form accurately." },
  { title: "Monitor Sensation", desc: "Mild discomfort during rehab work can be normal, but sharp or worsening pain means stop and check with your physiotherapist." },
  { title: "Log the Session", desc: "Save the clip so you and your physiotherapist can compare form and range across weeks, not just remember how it felt." },
];

const EXERCISES = [
  { name: "Knee Rehab — Straight Leg Raises", role: "Post-injury / post-surgery knee programs", price: "Tracked free" },
  { name: "Shoulder Rehab — Wall Slides", role: "Rotator cuff & mobility recovery", price: "Tracked free" },
  { name: "Lower Back — Bird Dog & Bridges", role: "Core stability & back pain programs", price: "Tracked free" },
  { name: "Ankle Rehab — Balance & Proprioception", role: "Post-sprain recovery", price: "Tracked free" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Prescribed mobility set + AI form check" },
  { day: "Tue", focus: "Light strength/stability work (as cleared)" },
  { day: "Wed", focus: "Rest / gentle stretching" },
  { day: "Thu", focus: "Prescribed mobility set + AI form check" },
  { day: "Fri", focus: "Progressive strength work (as cleared)" },
  { day: "Sat", focus: "Active recovery — walking, light movement" },
  { day: "Sun", focus: "Rest and progress video review" },
];

const FAQS = [
  {
    q: "Can Formanti replace my physiotherapist?",
    a: "No. Formanti is a technique and progress-tracking tool, not a licensed physiotherapist or medical device. It's designed to help you follow your prescribed home exercise program correctly between sessions — always follow your physiotherapist's or doctor's guidance, and stop any exercise that causes pain.",
  },
  {
    q: "How does AI track my rehab exercise form?",
    a: "Record your exercise on your phone from a clear angle, upload it to Formanti, and our AI checks your movement pattern, range of motion, and rep count against the exercise you're performing.",
  },
  {
    q: "What if an exercise hurts when I try to do it?",
    a: "Stop immediately and consult your physiotherapist or doctor. Formanti can flag unusual movement patterns, but it cannot assess pain, medical risk, or whether an exercise is appropriate for your specific condition.",
  },
  {
    q: "Can I share my progress with my physiotherapist?",
    a: "Yes. You can save your session history and share a summary of your tracked exercises and range-of-motion trends with your physiotherapist at your next appointment.",
  },
  {
    q: "Is the physiotherapy exercise tracker free?",
    a: "You get free tokens on signup to track exercises, and browsing suggested home-rehab equipment is free. No credit card required to get started.",
  },
];

export default function PhysiotherapyPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="physiotherapy-page">
      <SEO
        title="AI Physiotherapy Exercise Tracker - Home Rehab Form Checker"
        description="Free AI physiotherapy exercise tracker: check your home rehab exercise form, track range of motion and reps, and share progress with your physiotherapist. Not a substitute for medical advice."
        keywords="AI physiotherapy app, physiotherapy exercise tracker, home rehab exercise app, rehab exercise form checker, range of motion tracking app, physio progress tracker India"
        url="https://www.formanti.com/physiotherapy"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Physiotherapy Exercise Tracker - Home Rehab Form Checker",
          description: "AI-powered tracking for home physiotherapy and rehab exercises — movement compensation detection, range-of-motion tracking, and rep counting.",
          url: "https://www.formanti.com/physiotherapy",
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
              🩺 Physiotherapy &amp; Rehab
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-lime-400">Physiotherapy</span> Exercise Tracker
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            Track your home rehab exercises between physiotherapy sessions — form, range of motion, and
            reps — and share your progress with your physiotherapist.
          </motion.p>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2.5}
            variants={fadeUp}
            className="text-xs text-zinc-500 max-w-xl mx-auto mb-8"
          >
            Formanti is a tracking tool, not a substitute for professional medical or physiotherapy advice.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide">
              <Link to="/analyze">Track Your Exercise</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/marketplace">View Rehab Equipment</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Features</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">
              Built to Support Your Rehab
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              Every tool on Formanti is designed to help you follow your prescribed program accurately
              between physiotherapy sessions.
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

      {/* Technique guide */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Guide</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              How to Do a Home Rehab Exercise Safely
            </h2>
            <p className="text-zinc-400">
              Good form matters even more in rehab than in sport. Follow these six checkpoints for any
              exercise your physiotherapist has prescribed.
            </p>
          </div>
          <ol className="space-y-4">
            {REHAB_STEPS.map((s, i) => (
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
              to="/analyze"
              className="inline-flex items-center gap-2 text-lime-400 hover:text-lime-300 font-semibold"
            >
              Track your rehab exercise with AI <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Common exercises tracked */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Exercises</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Common Rehab Exercises We Track
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              A preview of common home exercise program movements Formanti can track. Always follow your
              physiotherapist's specific prescription for your condition.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {EXERCISES.map((r) => (
              <div key={r.name} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div>
                  <div className="text-white font-semibold">{r.name}</div>
                  <div className="text-zinc-500 text-sm">Common use: {r.role}</div>
                </div>
                <div className="text-lime-400 font-heading font-bold text-sm">{r.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild className="bg-lime-400 text-black hover:bg-lime-500">
              <Link to="/marketplace">See Recommended Rehab Equipment</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Weekly plan preview */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Weekly Structure</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Sample Weekly Home Rehab Structure
            </h2>
            <p className="text-zinc-400">
              A general example of how a home exercise program might be spread across a week. Your actual
              program should come from your physiotherapist, not from this app.
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
              <Link to="/analyze">Track Today's Exercise</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Physiotherapy Tracker FAQs</h2>
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
          <Link to="/blog/ai-physiotherapy-exercise-tracking" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-all">
            <Badge className="mb-2 bg-lime-400/10 text-lime-400">Physio</Badge>
            <h3 className="font-bold text-white mb-1">How to Track Rehab Exercises Safely at Home</h3>
            <p className="text-xs text-zinc-400">What to look for when following a home exercise program</p>
          </Link>
          <Link to="/gym" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-all">
            <Badge className="mb-2 bg-lime-400/10 text-lime-400">Gym</Badge>
            <h3 className="font-bold text-white mb-1">AI Gym Workout Form Checker</h3>
            <p className="text-xs text-zinc-400">Fix your squat, deadlift, and bench form</p>
          </Link>
          <Link to="/weight-lifting" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-all">
            <Badge className="mb-2 bg-lime-400/10 text-lime-400">Weightlifting</Badge>
            <h3 className="font-bold text-white mb-1">AI Weightlifting Coach</h3>
            <p className="text-xs text-zinc-400">Bar path, lift classification, and technique analysis</p>
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <HeartPulse className="w-12 h-12 text-lime-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4 uppercase tracking-tight">
            Stay Consistent With Your Recovery
          </h2>
          <p className="text-zinc-400 mb-8">
            Track your prescribed exercises, see your progress over time, and bring it to your next
            physiotherapy session. Free to try — no credit card needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase">
              <Link to="/analyze">Start Tracking (Free)</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/marketplace">View Rehab Equipment</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center gap-6 text-sm text-zinc-500">
            <Link to="/gym" className="hover:text-lime-400">Gym Form Checker</Link>
            <Link to="/weight-lifting" className="hover:text-lime-400">Weightlifting Coach</Link>
            <Link to="/badminton" className="hover:text-lime-400">Badminton Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
