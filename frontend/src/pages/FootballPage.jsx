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
    title: "Shooting & Striking Analysis",
    desc: "Upload training video and get feedback on your plant foot, body shape, and strike contact to shoot with more power and accuracy.",
  },
  {
    icon: Target,
    title: "Dribbling & Ball Control",
    desc: "AI reviews your touch, close control, and change of direction so you keep the ball under pressure and beat defenders.",
  },
  {
    icon: Activity,
    title: "Movement & Agility",
    desc: "Analyze your acceleration, balance, and first step. Spot the movement habits that slow you down on the pitch.",
  },
  {
    icon: Video,
    title: "Frame-by-Frame Technique",
    desc: "Detailed feedback on passing, first touch, and shooting mechanics through every phase of the action.",
  },
  {
    icon: Dumbbell,
    title: "Football Training Plans",
    desc: "Personalized weekly drills for dribbling, finishing, passing, stamina, and speed & agility.",
  },
  {
    icon: ShoppingBag,
    title: "Boot Recommendations",
    desc: "Get football boot suggestions matched to your position, surface, and budget — firm ground, astro turf, and more.",
  },
];

const SHOOTING_STEPS = [
  { title: "Approach", desc: "Approach the ball at a slight angle with controlled steps so you arrive balanced, not stretching for the strike." },
  { title: "Plant foot", desc: "Place your non-kicking foot beside the ball, pointing at your target — this sets your direction and balance." },
  { title: "Body shape", desc: "Lean slightly over the ball to keep your shot down; lock your ankle and keep your eyes on the ball, not the goal." },
  { title: "Contact", desc: "Strike through the middle of the ball with your laces for power, or the inside of the foot for placement and accuracy." },
  { title: "Follow-through", desc: "Swing your kicking leg through towards the target and land on your kicking foot to transfer full momentum into the shot." },
  { title: "Recovery", desc: "Reset your balance immediately and be ready to follow up the rebound or get back into position." },
];

const BOOTS = [
  { name: "Nike Mercurial Vapor", role: "Speed / forwards", price: "₹8,000+" },
  { name: "adidas Predator", role: "Control / midfielders", price: "₹7,000+" },
  { name: "Puma Future", role: "All-round players", price: "₹5,000+" },
  { name: "Nike Tiempo (entry)", role: "Beginners / comfort", price: "₹2,500+" },
];

const PLAN_SAMPLE = [
  { day: "Mon", focus: "Dribbling and close-control cone drills" },
  { day: "Tue", focus: "Finishing — shooting from different angles" },
  { day: "Wed", focus: "Rest / mobility and recovery" },
  { day: "Thu", focus: "Passing accuracy and first-touch drills" },
  { day: "Fri", focus: "Small-sided game with AI video analysis" },
  { day: "Sat", focus: "Speed, agility, and stamina conditioning" },
  { day: "Sun", focus: "Light recovery and video review" },
];

const FAQS = [
  {
    q: "How can I improve my football skills at home?",
    a: "Focus on high-touch ball mastery: wall passes, cone dribbling, juggling, and both-foot control. Short, daily sessions beat occasional long ones. Film yourself and upload to AthlyticAI so the AI football coach can flag technique habits to fix.",
  },
  {
    q: "How do I shoot a football with more power and accuracy?",
    a: "Power and accuracy come from a firm plant foot pointed at the target, leaning over the ball, a locked ankle, striking through the centre with your laces, and a full follow-through onto your kicking foot. Our AI breaks down each of these from your video.",
  },
  {
    q: "How do I improve my first touch and ball control?",
    a: "Cushion the ball by relaxing the receiving surface on contact, and take your touch into space away from pressure. Practise receiving with both feet, thigh, and chest. Consistent reps build the soft, directional touch that separates good players.",
  },
  {
    q: "What football boots should a beginner buy?",
    a: "Beginners should prioritise comfort and the right surface: firm-ground (FG) studs for natural grass, and astro/turf (TF) soles for artificial pitches. A comfortable, well-fitting entry model like the Nike Tiempo or Puma Future is better than an expensive boot that doesn't fit.",
  },
  {
    q: "Is the AthlyticAI football app free?",
    a: "Yes. You can analyze videos, generate training plans, and browse boot recommendations for free. No credit card required to get started.",
  },
];

export default function FootballPage() {
  return (
    <div className="min-h-screen bg-zinc-950" data-testid="football-page">
      <SEO
        title="AI Football Coach - Skills & Technique Video Analysis App"
        description="Free AI football coach: analyze your shooting, dribbling, and ball control, get personalized training plans and boot recommendations. Upload a training video and improve fast."
        keywords="football video analysis, AI football coach, soccer skills, how to improve football skills, dribbling drills, shooting technique, football training plan, best football boots"
        url="https://athlyticai.com/football"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "AI Football Coach - Skills & Technique Video Analysis",
          description: "AI-powered football video analysis, shooting and dribbling breakdown, ball-control feedback, and personalized training plans.",
          url: "https://athlyticai.com/football",
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
        <div className="absolute inset-0 bg-gradient-to-b from-green-400/5 via-zinc-950 to-zinc-950" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <Badge className="bg-green-400/10 text-green-400 border border-green-400/30 mb-6">
              ⚽ Football Specialist
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-heading font-black text-5xl md:text-6xl lg:text-7xl uppercase tracking-tighter text-white mb-6"
          >
            AI <span className="text-green-400">Football</span> Coach<br />Analyze Your Game
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8"
          >
            Level up your game with AI-powered video analysis of your shooting, dribbling, and ball
            control, plus personalized training plans and smart boot recommendations — built for footballers.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg" className="bg-green-400 text-black hover:bg-green-500 font-bold uppercase tracking-wide">
              <Link to="/analyze?sport=football">Analyze Your Game</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/equipment?sport=football">View Boots</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-green-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Features</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">
              Built for Footballers
            </h2>
            <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
              Every tool on AthlyticAI is tuned to the technique, movement, and skills that win games.
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
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-green-400/30 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-green-400/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-green-400" strokeWidth={1.5} />
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
            <span className="text-green-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Technique Guide</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              How to Improve Your Shooting
            </h2>
            <p className="text-zinc-400">
              Goals come from clean, repeatable technique. Master these six elements and you will strike
              the ball with more power and accuracy under pressure.
            </p>
          </div>
          <ol className="space-y-4">
            {SHOOTING_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-400/10 border border-green-400/30 flex items-center justify-center text-green-400 font-heading font-bold">
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
              to="/analyze?sport=football"
              className="inline-flex items-center gap-2 text-green-400 hover:text-green-300 font-semibold"
            >
              Analyze your shooting technique with AI <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Boot recommendations */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-green-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Gear</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Best Football Boots in 2026
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              A quick preview of top boots across positions and budgets. Our AI equipment finder matches
              boots to your position, surface, and price range.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {BOOTS.map((r) => (
              <div key={r.name} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div>
                  <div className="text-white font-semibold">{r.name}</div>
                  <div className="text-zinc-500 text-sm">Ideal for: {r.role}</div>
                </div>
                <div className="text-green-400 font-heading font-bold whitespace-nowrap ml-3">{r.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild className="bg-green-400 text-black hover:bg-green-500">
              <Link to="/equipment?sport=football">See All Boot Recommendations</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Training plan preview */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-green-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Training</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4">
              Sample Weekly Football Training Plan
            </h2>
            <p className="text-zinc-400">
              A snapshot of what an AI-generated football plan looks like for an improving outfield
              player. Your actual plan adapts to your position, level, and available time.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {PLAN_SAMPLE.map((p) => (
              <div key={p.day} className="flex items-center gap-4 px-5 py-4">
                <div className="w-12 text-green-400 font-heading font-bold uppercase">{p.day}</div>
                <div className="flex-1 text-zinc-300 text-sm">{p.focus}</div>
                <Check className="w-4 h-4 text-zinc-600" />
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button asChild variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=football">Generate My Full Training Plan</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-green-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white">Football FAQs</h2>
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
          <Trophy className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4 uppercase tracking-tight">
            Ready to Improve Your Football?
          </h2>
          <p className="text-zinc-400 mb-8">
            Upload a training video, get instant AI feedback, and start improving faster. Free to try —
            no credit card needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-green-400 text-black hover:bg-green-500 font-bold uppercase">
              <Link to="/analyze?sport=football">Start Analysis (Free)</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-zinc-700 text-white hover:bg-zinc-900">
              <Link to="/training?sport=football">Get Training Plan</Link>
            </Button>
          </div>
          <div className="mt-10 flex justify-center gap-6 text-sm text-zinc-500">
            <Link to="/badminton" className="hover:text-green-400">Badminton Coach</Link>
            <Link to="/cricket" className="hover:text-green-400">Cricket Coach</Link>
            <Link to="/swimming" className="hover:text-green-400">Swimming Coach</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
