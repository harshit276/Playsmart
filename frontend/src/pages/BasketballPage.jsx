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
    title: "Shooting Form Analysis",
    desc: "Upload video and get feedback on your stance, elbow alignment, release point, and follow-through so your jumper becomes repeatable.",
  },
  {
    icon: Target,
    title: "Dribbling & Ball Handling",
    desc: "AI reviews your crossover, control, and change of pace so you protect the ball and beat defenders off the dribble.",
  },
  {
    icon: Activity,
    title: "Vertical & Athleticism",
    desc: "Analyze your jump mechanics, landing, and first step. Spot the movement habits that limit your hops and explosiveness.",
  },
  {
    icon: Video,
    title: "Frame-by-Frame Breakdown",
    desc: "Detailed feedback on shooting, layups, and footwork through every phase of the motion.",
  },
  {
    icon: Dumbbell,
    title: "Basketball Training Plans",
    desc: "Personalized weekly drills for shooting reps, ball handling, finishing, and vertical-jump strength work.",
  },
  {
    icon: ShoppingBag,
    title: "Shoe & Gear Recommendations",
    desc: "Get basketball shoe suggestions matched to your position, court surface, and budget — indoor and outdoor.",
  },
];

const SHOOTING_STEPS = [
  { title: "Stance & balance", desc: "Set your feet shoulder-width apart, slightly staggered with your shooting foot forward, knees bent and weight balanced." },
  { title: "Grip", desc: "Place your shooting hand under the ball with fingers spread; your guide hand rests on the side and never pushes the shot." },
  { title: "Elbow alignment", desc: "Tuck your shooting elbow in under the ball so your forearm is vertical — elbow, wrist, and rim form a straight line." },
  { title: "Dip & rise", desc: "Dip into a smooth shooting pocket, then rise in one motion, transferring power from your legs up through your body." },
  { title: "Release", desc: "Release at the top of your jump with a high, quick set point and a flicked wrist for soft backspin." },
  { title: "Follow-through", desc: "Hold the follow-through with your fingers pointing at the rim ('reach into the cookie jar') until the ball lands." },
];

const SHOES = [
  { name: "Nike LeBron / KD line", role: "All-round / forwards", price: "₹9,000+" },
  { name: "adidas Dame", role: "Guards / speed", price: "₹7,000+" },
  { name: "Puma MB / Court Rider", role: "Value performance", price: "₹5,000+" },
  { name: "Nivia / outdoor models", role: "Beginners / outdoor courts", price: "₹2,000+" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Form shooting and free-throw routine" },
  { day: "Tue", focus: "Ball-handling and two-ball dribbling drills" },
  { day: "Wed", focus: "Rest / mobility and recovery" },
  { day: "Thu", focus: "Finishing at the rim and layup footwork" },
  { day: "Fri", focus: "Game-speed shooting with AI video analysis" },
  { day: "Sat", focus: "Vertical jump and lower-body strength" },
  { day: "Sun", focus: "Light recovery and video review" },
];

const FAQS = [
  {
    q: "How do I improve my basketball shooting form?",
    a: "Build a repeatable motion: balanced stance, shooting elbow tucked under the ball, a smooth dip-and-rise in one motion powered by your legs, a high release point, and a held follow-through. Shoot close to the basket first to groove the form, then extend range. Formanti's analysis flags form breaks directly from your video.",
  },
  {
    q: "How can I analyze my shooting form at home?",
    a: "Film yourself shooting from the side with your phone, upload the clip to Formanti, and the AI basketball coach will break down your stance, elbow alignment, release point, and follow-through with frame-by-frame feedback — no trainer required.",
  },
  {
    q: "How do I jump higher for basketball?",
    a: "Vertical jump improves with lower-body strength (squats, lunges), explosive power (jump squats, box jumps), and good jump mechanics — a deep arm swing and full hip extension. Consistent strength work plus plyometrics over several weeks adds the most inches.",
  },
  {
    q: "What basketball shoes should a beginner buy?",
    a: "Beginners should prioritise ankle support, cushioning, and grip for their surface — outdoor courts need a more durable rubber outsole than indoor shoes. A comfortable, well-fitting mid- or high-top in your budget beats an expensive shoe that doesn't fit.",
  },
  {
    q: "Is the Formanti basketball app free?",
    a: "Yes. You can analyze videos, generate training plans, and browse shoe recommendations for free. No credit card required to get started.",
  },
];

export default function BasketballPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="basketball-page">
      <SEO
        title="AI Basketball Coach - Shooting Form & Skills Video Analysis"
        description="Free AI basketball coach: analyze your shooting form, dribbling, and vertical, get personalized training plans and shoe recommendations. Upload a video and improve your game fast."
        keywords="basketball video analysis, AI basketball coach, basketball shooting form, how to improve basketball shooting, dribbling drills, vertical jump, basketball training plan, best basketball shoes"
        url="https://formanti.com/basketball"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Basketball Coach - Shooting Form & Skills Video Analysis",
          description: "AI-powered basketball video analysis, shooting-form breakdown, ball-handling feedback, and personalized training plans.",
          url: "https://formanti.com/basketball",
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
        <div className="absolute inset-0 bg-gradient-to-b from-orange-400/5 via-zinc-950 to-zinc-950" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Badge className="bg-orange-400/10 text-orange-400 border border-orange-400/30 mb-6">
              🏀 Basketball Specialist
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-orange-400">Basketball</span> Coach<br />Analyze Your Game
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            Improve your game with AI-powered analysis of your shooting form, ball handling, and
            vertical, plus personalized training plans and smart shoe recommendations — built for ballers.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="bg-orange-400 text-black hover:bg-orange-500 font-bold uppercase tracking-wide">
              <Link to="/analyze?sport=basketball">Analyze Your Game</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/equipment?sport=basketball">View Shoes</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-orange-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Features</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">
              Built for Ballers
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              Every tool on Formanti is tuned to the technique, movement, and skills that win on the court.
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
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-orange-400/30 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-orange-400/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-orange-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-heading font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How to improve shooting */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-orange-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Technique Guide</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              How to Improve Your Shooting Form
            </h2>
            <p className="text-zinc-400">
              A great jumper is built on a repeatable motion. Master these six elements and your shot
              will hold up under pressure and from range.
            </p>
          </div>
          <ol className="space-y-4">
            {SHOOTING_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-400/10 border border-orange-400/30 flex items-center justify-center text-orange-400 font-heading font-bold">
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
              to="/analyze?sport=basketball"
              className="inline-flex items-center gap-2 text-orange-400 hover:text-orange-300 font-semibold"
            >
              Analyze your shooting form with AI <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Shoe recommendations */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-orange-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Gear</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Best Basketball Shoes in 2026
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              A quick preview of top shoes across positions and budgets. Our AI equipment finder matches
              shoes to your position, surface, and price range.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SHOES.map((r) => (
              <div key={r.name} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div>
                  <div className="text-white font-semibold">{r.name}</div>
                  <div className="text-zinc-500 text-sm">Ideal for: {r.role}</div>
                </div>
                <div className="text-orange-400 font-heading font-bold whitespace-nowrap ml-3">{r.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild className="bg-orange-400 text-black hover:bg-orange-500">
              <Link to="/equipment?sport=basketball">See All Shoe Recommendations</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Training plan preview */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-orange-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Training</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Sample Weekly Basketball Training Plan
            </h2>
            <p className="text-zinc-400">
              A snapshot of what an AI-generated basketball plan looks like for an improving player. Your
              actual plan adapts to your position, level, and available time.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {PLAN_SAMPLE.map((p) => (
              <div key={p.day} className="flex items-center gap-4 px-5 py-4">
                <div className="w-12 text-orange-400 font-heading font-bold uppercase">{p.day}</div>
                <div className="flex-1 text-zinc-300 text-sm">{p.focus}</div>
                <Check className="w-4 h-4 text-zinc-600" />
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button asChild variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=basketball">Generate My Full Training Plan</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-orange-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Basketball FAQs</h2>
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
          <Trophy className="w-12 h-12 text-orange-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4 uppercase tracking-tight">
            Ready to Improve Your Basketball?
          </h2>
          <p className="text-zinc-400 mb-8">
            Upload a video, get instant AI feedback, and start training smarter. Free to try — no credit
            card needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-orange-400 text-black hover:bg-orange-500 font-bold uppercase">
              <Link to="/analyze?sport=basketball">Start Analysis (Free)</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=basketball">Get Training Plan</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center gap-6 text-sm text-zinc-500">
            <Link to="/football" className="hover:text-orange-400">Football Coach</Link>
            <Link to="/cricket" className="hover:text-orange-400">Cricket Coach</Link>
            <Link to="/badminton" className="hover:text-orange-400">Badminton Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
