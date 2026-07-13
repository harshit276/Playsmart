import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Video, Dumbbell, ShoppingBag, Trophy, ArrowRight, Check, TrendingUp, Target, Activity,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }),
};

const FEATURES = [
  {
    icon: TrendingUp,
    title: "Bar Path Tracking",
    desc: "AI traces the bar's path through your lift so you can see exactly where it drifts forward or stalls — the #1 cause of missed lifts.",
  },
  {
    icon: Target,
    title: "Lift Classification",
    desc: "Automatically identifies squat, bench, deadlift, snatch, and clean & jerk from your video and applies the right technique checkpoints.",
  },
  {
    icon: Dumbbell,
    title: "Depth & Lockout Check",
    desc: "Get flagged on partial squats, soft lockouts, or early hip extension on Olympic lifts — the details judges and coaches look for.",
  },
  {
    icon: Video,
    title: "Frame-by-Frame Playback",
    desc: "Scrub through your lift frame by frame to catch technique breakdowns that happen too fast to see in real time.",
  },
  {
    icon: ShoppingBag,
    title: "Equipment Recommendations",
    desc: "Get weightlifting shoe, belt, and chalk recommendations matched to your lifts, federation rules, and budget.",
  },
  {
    icon: Activity,
    title: "Strength Progress Tracking",
    desc: "Track your form and estimated working weights across sessions to see real progress, not just a single lift.",
  },
];

const DEADLIFT_STEPS = [
  { title: "Setup", desc: "Bar over mid-foot, shins close to the bar, feet hip-width apart, grip just outside your legs." },
  { title: "Brace", desc: "Take a full breath, brace your core, and pull the slack out of the bar before it leaves the floor." },
  { title: "Pull", desc: "Drive through the floor with your legs while keeping your back angle constant — the bar should travel in a straight line." },
  { title: "Lockout", desc: "Finish by driving your hips forward to full extension, without leaning back or hyperextending your spine." },
  { title: "Lower", desc: "Reverse the movement under control — push your hips back first, then bend your knees once the bar passes them." },
  { title: "Reset", desc: "Let the bar settle fully between reps rather than bouncing, unless you're specifically training touch-and-go." },
];

const GEAR = [
  { name: "Weightlifting Shoes", role: "Olympic lifts & squats", price: "₹6,000+" },
  { name: "7mm Lever Belt", role: "Max-effort squats & deadlifts", price: "₹3,500+" },
  { name: "Chalk / Liquid Chalk", role: "Grip security on pulls", price: "₹300+" },
  { name: "Bar Collars", role: "Safety on all barbell lifts", price: "₹800+" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Squat — heavy triples + AI bar-path check" },
  { day: "Tue", focus: "Bench press — volume work + accessories" },
  { day: "Wed", focus: "Rest / mobility work" },
  { day: "Thu", focus: "Deadlift — heavy singles/doubles + AI form check" },
  { day: "Fri", focus: "Olympic lift technique — snatch or clean & jerk drills" },
  { day: "Sat", focus: "Accessory work — posterior chain & grip" },
  { day: "Sun", focus: "Recovery and video review" },
];

const FAQS = [
  {
    q: "Can AI analyze my deadlift or squat form from a video?",
    a: "Yes. Record your lift from the side with your full body and the barbell in frame, upload it to Formanti, and our AI tracks bar path, depth, and lockout to flag technique issues.",
  },
  {
    q: "Does Formanti work for Olympic weightlifting (snatch, clean & jerk)?",
    a: "Formanti can analyze snatch and clean & jerk attempts, checking bar path, receiving position, and lockout. For competition-level coaching, use it alongside a certified weightlifting coach.",
  },
  {
    q: "What's the best camera angle to film a lift for analysis?",
    a: "Film from directly to the side for squats and deadlifts (to see bar path and back angle), and from a 3/4 front angle for bench press and overhead lifts.",
  },
  {
    q: "Is Formanti a replacement for a strength coach?",
    a: "No. Formanti is a technique-feedback tool, not a certified coach or medical professional. Use it to spot form issues between coaching sessions, and always progress load gradually.",
  },
  {
    q: "Is the AI weightlifting analyzer free to use?",
    a: "You get free tokens on signup to analyze your lifts, and training plans and equipment recommendations are free to browse. No credit card required to get started.",
  },
];

export default function WeightLiftingPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="weight-lifting-page">
      <SEO
        title="AI Weightlifting Coach - Bar Path & Lift Technique Analysis"
        description="Free AI weightlifting coach: analyze your squat, bench, deadlift, snatch, and clean & jerk technique with bar path tracking and personalized programming."
        keywords="AI weightlifting coach, weightlifting technique analysis, bar path tracking app, powerlifting form checker, snatch technique analysis, clean and jerk analysis, deadlift form check India"
        url="https://www.formanti.com/weight-lifting"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Weightlifting Coach - Bar Path & Lift Technique Analysis",
          description: "AI-powered weightlifting video analysis with bar path tracking, lift classification, and personalized programming.",
          url: "https://www.formanti.com/weight-lifting",
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
              🏋️ Weightlifting &amp; Powerlifting
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-lime-400">Weightlifting</span> Coach<br />Track Every Lift
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            Upload your squat, bench, deadlift, or Olympic lift and get AI-powered bar path tracking,
            technique feedback, and a training plan built around your numbers.
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
              <Link to="/marketplace">View Lifting Gear</Link>
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
              Built for Weightlifters
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              Every tool on Formanti is tuned to the bar path, timing, and precision that competitive lifting demands.
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
              How to Perfect Your Deadlift Form
            </h2>
            <p className="text-zinc-400">
              The deadlift is unforgiving on bad technique. Nail these six checkpoints and your pull
              stays safe and efficient as the weight climbs.
            </p>
          </div>
          <ol className="space-y-4">
            {DEADLIFT_STEPS.map((s, i) => (
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
              Analyze your deadlift technique with AI <ArrowRight className="w-4 h-4" />
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
              Essential Weightlifting Gear
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              A quick preview of the gear serious lifters rely on. Our equipment finder matches gear to
              your lifts, federation rules, and budget.
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
              <Link to="/marketplace">See All Weightlifting Gear</Link>
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
              Sample Weekly Weightlifting Plan
            </h2>
            <p className="text-zinc-400">
              A snapshot of what an AI-generated weightlifting plan looks like for an intermediate lifter.
              Your actual plan adapts to your level, goals, and competition schedule.
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
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Weightlifting FAQs</h2>
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
          <Link to="/blog/ai-weightlifting-technique-analysis" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-all">
            <Badge className="mb-2 bg-lime-400/10 text-lime-400">Training</Badge>
            <h3 className="font-bold text-white mb-1">Improve Your Snatch, Clean & Jerk with AI</h3>
            <p className="text-xs text-zinc-400">Bar path breakdown for Olympic and powerlifting lifts</p>
          </Link>
          <Link to="/gym" className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-all">
            <Badge className="mb-2 bg-lime-400/10 text-lime-400">Gym</Badge>
            <h3 className="font-bold text-white mb-1">AI Gym Workout Form Checker</h3>
            <p className="text-xs text-zinc-400">Fix your squat, deadlift, and bench form</p>
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
            Ready to Track Your Lifts?
          </h2>
          <p className="text-zinc-400 mb-8">
            Upload a lift, get instant AI feedback on your technique, and train with confidence. Free
            to try — no credit card needed.
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
            <Link to="/gym" className="hover:text-lime-400">Gym Form Checker</Link>
            <Link to="/physiotherapy" className="hover:text-lime-400">Physio Exercise Tracker</Link>
            <Link to="/badminton" className="hover:text-lime-400">Badminton Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
