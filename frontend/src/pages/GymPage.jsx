import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Video, Dumbbell, ShoppingBag, Trophy, ArrowRight, Check, Flame, Target, Activity,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }),
};

const FEATURES = [
  {
    icon: Target,
    title: "Rep-by-Rep Form Breakdown",
    desc: "Upload a set from your phone and get feedback on every rep — bar path, joint angles, depth, and tempo, not just a rep count.",
  },
  {
    icon: Dumbbell,
    title: "Squat, Deadlift & Bench Detection",
    desc: "AI recognizes your lift and checks it against safe technique standards — stance width, back position, bar path, and lockout.",
  },
  {
    icon: Flame,
    title: "Injury-Risk Flagging",
    desc: "Get flagged on common risky patterns like knee cave, rounded lower back, or heels lifting — before they become an injury.",
  },
  {
    icon: Video,
    title: "Frame-by-Frame Playback",
    desc: "Scrub through your set frame by frame to see exactly where your form breaks down under fatigue.",
  },
  {
    icon: ShoppingBag,
    title: "Gym Gear Recommendations",
    desc: "Get equipment suggestions — belts, wraps, sleeves, shoes — matched to the lifts and weights you actually train.",
  },
  {
    icon: Activity,
    title: "Progress Tracking Over Time",
    desc: "See your form and strength trend across weeks, not just a single session, so you know your training is actually working.",
  },
];

const SQUAT_STEPS = [
  { title: "Setup", desc: "Feet shoulder-width apart, bar on your upper traps (or front rack), toes turned slightly out." },
  { title: "Brace", desc: "Take a deep breath into your belly, brace your core like you're about to be punched, before you move." },
  { title: "Descent", desc: "Push your hips back and bend your knees together, keeping your chest up and weight on your mid-foot." },
  { title: "Depth", desc: "Aim for hip crease below knee level (or your comfortable working depth) without your lower back rounding." },
  { title: "Drive", desc: "Drive through your whole foot, push the floor away, and keep your knees tracking over your toes." },
  { title: "Lockout", desc: "Finish with hips and knees fully extended — don't hyperextend your lower back to finish the rep." },
];

const GEAR = [
  { name: "Lifting Belt (4-inch)", role: "Squats & deadlifts, intermediate+", price: "₹1,500+" },
  { name: "Knee Sleeves", role: "Squat support & warmth", price: "₹1,800+" },
  { name: "Wrist Wraps", role: "Bench press & overhead pressing", price: "₹600+" },
  { name: "Flat Lifting Shoes", role: "Stable base for squats & deadlifts", price: "₹3,000+" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Lower body — squat pattern + AI form check" },
  { day: "Tue", focus: "Upper body push — bench, shoulders, triceps" },
  { day: "Wed", focus: "Rest / mobility work" },
  { day: "Thu", focus: "Lower body — deadlift pattern + AI form check" },
  { day: "Fri", focus: "Upper body pull — rows, pull-ups, biceps" },
  { day: "Sat", focus: "Full-body conditioning + accessory work" },
  { day: "Sun", focus: "Recovery and video review" },
];

const FAQS = [
  {
    q: "Can AI actually check my gym form from a phone video?",
    a: "Yes. Record your set from the side (for squats/deadlifts) or a 3/4 angle (for bench/press) with your phone, upload it to Formanti, and our AI breaks down your joint angles, bar path, and depth to flag technique issues.",
  },
  {
    q: "Which gym exercises can Formanti analyze?",
    a: "Formanti works best on barbell and dumbbell compound lifts — squats, deadlifts, bench press, overhead press, rows — as well as general bodyweight movements like push-ups and lunges.",
  },
  {
    q: "Is this a replacement for a personal trainer?",
    a: "No. Formanti is a technique-feedback tool, not a certified personal trainer or medical professional. It's built to help you spot form issues between sessions — always progress weight gradually and stop if something feels painful.",
  },
  {
    q: "Do I need any special equipment to use the AI form checker?",
    a: "No sensors or wearables needed — just record a set on your phone from a stable angle with your full body in frame. Good lighting and a clear view of the lift matter more than camera quality.",
  },
  {
    q: "Is the Formanti gym form checker free?",
    a: "You get free tokens on signup to analyze your lifts, and training plans and gear recommendations are free to browse. No credit card required to get started.",
  },
];

export default function GymPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="gym-page">
      <SEO
        title="AI Gym Workout Form Checker - Squat, Deadlift & Bench Analysis"
        description="Free AI gym form checker: upload a set and get feedback on your squat, deadlift, and bench press form, injury-risk flags, and personalized workout plans."
        keywords="gym form checker app, AI personal trainer app, squat form analyzer, deadlift form check, bench press technique analysis, workout form analysis app, gym technique AI, weight training form checker India"
        url="https://www.formanti.com/gym"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Gym Workout Form Checker - Squat, Deadlift & Bench Analysis",
          description: "AI-powered gym video analysis for squat, deadlift, and bench press form, injury-risk flagging, and personalized workout plans.",
          url: "https://www.formanti.com/gym",
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
              💪 Gym &amp; Strength Training
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-lime-400">Gym</span> Form Checker<br />Fix Every Lift
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            Upload a set of your squat, deadlift, or bench press and get instant AI feedback on your
            form, injury-risk flags, and a training plan built around what you need to fix.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide">
              <Link to="/analyze">Analyze Your Lift</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/marketplace">View Gym Gear</Link>
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
              Built for Gym Training
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              Every tool on Formanti is tuned to catch the form breakdowns that cause plateaus and injuries.
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
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Technique Guide</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              How to Perfect Your Squat Form
            </h2>
            <p className="text-zinc-400">
              The squat is the foundation lift most gym injuries trace back to. Nail these six checkpoints
              and your form holds up even as the weight gets heavy.
            </p>
          </div>
          <ol className="space-y-4">
            {SQUAT_STEPS.map((s, i) => (
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
              Analyze your squat technique with AI <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Gear */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Gear</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Essential Gym Gear for Lifters
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              A quick preview of the gear most lifters add as their weights climb. Our equipment finder
              matches gear to your lifts and goals.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GEAR.map((r) => (
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
              <Link to="/marketplace">See All Gym Gear Recommendations</Link>
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
              Sample Weekly Gym Training Plan
            </h2>
            <p className="text-zinc-400">
              A snapshot of what an AI-generated gym training plan looks like for an intermediate lifter.
              Your actual plan adapts to your level, goals, and available days.
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
              <Link to="/training">Generate My Full Training Plan</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Gym Training FAQs</h2>
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
          <Link to="/blog/ai-gym-workout-form-checker" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-all">
            <Badge className="mb-2 bg-lime-400/10 text-lime-400">Training</Badge>
            <h3 className="font-bold text-white mb-1">Fix Your Squat, Deadlift & Bench Form with AI</h3>
            <p className="text-xs text-zinc-400">A checklist for the most common gym form breakdowns</p>
          </Link>
          <Link to="/weight-lifting" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-all">
            <Badge className="mb-2 bg-lime-400/10 text-lime-400">Weightlifting</Badge>
            <h3 className="font-bold text-white mb-1">AI Weightlifting Coach</h3>
            <p className="text-xs text-zinc-400">Bar path, lift classification, and technique analysis</p>
          </Link>
          <Link to="/physiotherapy" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-all">
            <Badge className="mb-2 bg-lime-400/10 text-lime-400">Physio</Badge>
            <h3 className="font-bold text-white mb-1">AI Physiotherapy Exercise Tracker</h3>
            <p className="text-xs text-zinc-400">Track rehab exercises safely between sessions</p>
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <Trophy className="w-12 h-12 text-lime-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4 uppercase tracking-tight">
            Ready to Fix Your Lifts?
          </h2>
          <p className="text-zinc-400 mb-8">
            Upload a set, get instant AI feedback, and train with confidence. Free to try — no
            credit card needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase">
              <Link to="/analyze">Start Analysis (Free)</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training">Get Training Plan</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center gap-6 text-sm text-zinc-500">
            <Link to="/weight-lifting" className="hover:text-lime-400">Weightlifting Coach</Link>
            <Link to="/physiotherapy" className="hover:text-lime-400">Physio Exercise Tracker</Link>
            <Link to="/badminton" className="hover:text-lime-400">Badminton Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
