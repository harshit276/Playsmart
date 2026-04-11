import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import SEO from "@/components/SEO";
import {
  Zap, Target, Dumbbell, BarChart3, Play, ChevronRight,
  Video, Sparkles, TrendingUp, Film, Upload, UserPlus,
  ArrowRight, BookOpen, Star, Users, Clock
} from "lucide-react";
import { useState, useEffect } from "react";
import api from "@/lib/api";

const FEATURES = [
  { icon: Video, title: "AI Video Analysis", desc: "Upload any match or practice video and get instant, frame-by-frame technique feedback powered by computer vision.", color: "text-lime-400", bg: "bg-lime-400/10" },
  { icon: Dumbbell, title: "Smart Training Plans", desc: "Personalized weekly training programs that adapt to your skill level, goals, and available time.", color: "text-sky-400", bg: "bg-sky-400/10" },
  { icon: Target, title: "Equipment Recommendations", desc: "AI-powered gear suggestions based on your playing style, level, and budget — with price comparisons.", color: "text-purple-400", bg: "bg-purple-400/10" },
  { icon: Film, title: "Highlight Reels", desc: "Auto-generate match highlights from your uploaded videos. Share your best moments instantly.", color: "text-amber-400", bg: "bg-amber-400/10" },
  { icon: TrendingUp, title: "Progress Tracking", desc: "Track improvement over time with detailed stats, streak tracking, and skill development charts.", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  { icon: Sparkles, title: "Multi-Sport Support", desc: "Full support for 7 sports with sport-specific AI models, drills, and coaching insights.", color: "text-rose-400", bg: "bg-rose-400/10" },
];

const SPORTS = [
  { key: "badminton", emoji: "🏸", label: "Badminton", color: "text-lime-400", border: "border-lime-400/30", bg: "bg-lime-400/5" },
  { key: "tennis", emoji: "🎾", label: "Tennis", color: "text-amber-400", border: "border-amber-400/30", bg: "bg-amber-400/5" },
  { key: "table_tennis", emoji: "🏓", label: "Table Tennis", color: "text-sky-400", border: "border-sky-400/30", bg: "bg-sky-400/5" },
  { key: "cricket", emoji: "🏏", label: "Cricket", color: "text-blue-400", border: "border-blue-400/30", bg: "bg-blue-400/5" },
  { key: "football", emoji: "⚽", label: "Football", color: "text-green-400", border: "border-green-400/30", bg: "bg-green-400/5" },
  { key: "swimming", emoji: "🏊", label: "Swimming", color: "text-cyan-400", border: "border-cyan-400/30", bg: "bg-cyan-400/5" },
  { key: "pickleball", emoji: "⚡", label: "Pickleball", color: "text-emerald-400", border: "border-emerald-400/30", bg: "bg-emerald-400/5" },
];

const HOW_IT_WORKS = [
  { step: "01", icon: UserPlus, title: "Sign Up & Choose Your Sports", desc: "Create your free account and select the sports you play. Tell us your skill level and goals." },
  { step: "02", icon: Upload, title: "Upload Videos or Explore Plans", desc: "Upload match footage for AI analysis, or dive into personalized training plans and equipment recommendations." },
  { step: "03", icon: TrendingUp, title: "Get Feedback & Improve", desc: "Receive detailed AI-powered insights, track your progress over time, and level up your game." },
];

const FAQS = [
  {
    q: "How does AI video analysis work?",
    a: "AthlyticAI uses pose detection AI (MoveNet) to track your body movements in the video. It identifies your shots (smashes, drives, etc.), measures speed, evaluates technique, and provides personalized improvement tips.",
  },
  {
    q: "Which sports does AthlyticAI support?",
    a: "We currently support badminton, tennis, table tennis, pickleball, cricket, football, and swimming. Video analysis is best for racket sports.",
  },
  {
    q: "Is AthlyticAI free?",
    a: "Yes, AthlyticAI is completely free to use. You can analyze videos, get equipment recommendations, training plans, and create highlight reels at no cost.",
  },
  {
    q: "Do I need to upload my video?",
    a: "No. All video analysis happens directly in your browser using TensorFlow.js. Your video never leaves your device, ensuring complete privacy.",
  },
];

const APP_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AthlyticAI",
  operatingSystem: "Web, Android, iOS",
  applicationCategory: "SportsApplication",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", ratingCount: "127" },
  description: "AI-powered sports video analysis, training plans, and highlight reel generation",
  url: "https://athlyticai.com",
  featureList: [
    "AI Video Analysis",
    "Personalized Training Plans",
    "Equipment Recommendations",
    "Highlight Reel Generation",
    "Multi-Sport Support",
  ],
};

const FAQ_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const STATS = [
  { value: "7", label: "Sports Supported" },
  { value: "10K+", label: "Analyses Performed" },
  { value: "500+", label: "Training Drills" },
  { value: "98%", label: "User Satisfaction" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1 } }),
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuth();
  const [blogPosts, setBlogPosts] = useState([]);

  useEffect(() => {
    api.get("/api/blog/posts?limit=3").then(r => setBlogPosts(r.data?.posts || [])).catch(() => {});
  }, []);

  const handleCTA = () => {
    if (isAuthenticated && profile) navigate("/dashboard");
    else navigate("/assessment");
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <SEO
        title="AI Sports Coach for Badminton, Tennis & More"
        description="Get instant AI video analysis, personalized training plans, smart equipment recommendations, and auto-generated highlight reels for badminton, tennis, table tennis, and more. Free to use."
        keywords="AI sports coach, badminton video analysis, tennis coach app, table tennis training, sports highlights generator, badminton training plan, sports equipment recommendations India, AI shot analysis"
        url="https://athlyticai.com/"
        structuredData={APP_STRUCTURED_DATA}
      />

      {/* ============ HERO ============ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-900/50 to-zinc-950" />
        <div className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1461896836934-bd45ba8a0a58?w=1920&q=60')",
            backgroundSize: "cover", backgroundPosition: "center"
          }} />
        <div className="absolute inset-0 bg-zinc-950/70" />

        {/* Decorative gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-lime-400/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-400/5 rounded-full blur-3xl" />

        <div className="relative z-10 container mx-auto px-4 max-w-5xl text-center">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lime-400/10 border border-lime-400/20 mb-8" data-testid="hero-badge">
              <Zap className="w-4 h-4 text-lime-400" />
              <span className="text-sm font-medium text-lime-400 tracking-wide">AI-Powered Sports Coaching Platform</span>
            </div>
          </motion.div>

          <motion.h1 initial="hidden" animate="visible" custom={0.1} variants={fadeUp}
            className="font-heading font-black text-5xl md:text-7xl lg:text-8xl tracking-tighter uppercase leading-[0.9] mb-6" data-testid="hero-heading">
            <span className="text-white">Your</span> <span className="neon-glow text-lime-400">AI</span><br />
            <span className="text-white">Sports Coach</span>
          </motion.h1>

          <motion.p initial="hidden" animate="visible" custom={0.3} variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-6 leading-relaxed" data-testid="hero-subtitle">
            Upload a video. Get instant technique analysis, personalized training plans, and smart gear recommendations — like having a pro coach in your pocket.
          </motion.p>

          {/* Sport pills */}
          <motion.div initial="hidden" animate="visible" custom={0.4} variants={fadeUp}
            className="flex flex-wrap justify-center gap-2 mb-10">
            {SPORTS.map(s => (
              <span key={s.key} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${s.border} ${s.bg} text-sm ${s.color}`}>
                <span>{s.emoji}</span> {s.label}
              </span>
            ))}
          </motion.div>

          <motion.div initial="hidden" animate="visible" custom={0.5} variants={fadeUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button onClick={handleCTA} size="lg" data-testid="hero-cta-btn"
              className="bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide px-10 py-6 text-lg rounded-full shadow-[0_0_20px_rgba(190,242,100,0.3)] hover:shadow-[0_0_30px_rgba(190,242,100,0.5)] transition-all hover:scale-105 active:scale-95">
              Get Started Free <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
            <Button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              variant="ghost" size="lg"
              className="text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-full px-8 py-6 text-lg transition-all">
              See Features <ArrowRight className="w-5 h-5 ml-1" />
            </Button>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }}
            className="w-6 h-10 border-2 border-zinc-600 rounded-full flex justify-center pt-2">
            <div className="w-1.5 h-1.5 bg-lime-400 rounded-full" />
          </motion.div>
        </motion.div>
      </section>

      {/* ============ STATS BAR ============ */}
      <section className="py-12 bg-zinc-900 border-y border-zinc-800/50">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((s, i) => (
              <motion.div key={s.label} initial="hidden" whileInView="visible" custom={i}
                viewport={{ once: true }} variants={fadeUp} className="text-center">
                <div className="font-heading font-black text-3xl md:text-4xl text-lime-400 mb-1">{s.value}</div>
                <div className="text-zinc-400 text-sm uppercase tracking-wider">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="py-24 bg-zinc-950" data-testid="features-section">
        <div className="container mx-auto px-4 max-w-7xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="text-center mb-16">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Features</span>
            <h2 className="font-heading font-bold text-3xl md:text-5xl tracking-tight uppercase text-white mb-4">
              Everything You Need to Dominate
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              From AI-powered video breakdowns to smart gear recommendations — tools built to elevate every aspect of your game.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial="hidden" whileInView="visible" custom={i}
                viewport={{ once: true }} variants={fadeUp}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-lime-400/30 transition-all duration-300 card-glow cursor-pointer"
                data-testid={`feature-card-${i}`}>
                <div className={`w-12 h-12 rounded-lg ${f.bg} flex items-center justify-center mb-4`}>
                  <f.icon className={`w-6 h-6 ${f.color}`} strokeWidth={1.5} />
                </div>
                <h3 className="font-heading font-semibold text-xl text-white mb-2 tracking-tight">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SPORTS SECTION ============ */}
      <section className="py-24 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="text-center mb-16">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Multi-Sport</span>
            <h2 className="font-heading font-bold text-3xl md:text-5xl tracking-tight uppercase text-white mb-4">
              One Platform. Seven Sports.
            </h2>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto">
              Specialized AI models, drills, and coaching for every sport you play.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {SPORTS.map((s, i) => (
              <motion.div key={s.key} initial="hidden" whileInView="visible" custom={i}
                viewport={{ once: true }} variants={fadeUp}
                className={`group bg-zinc-900 border ${s.border} rounded-xl p-6 text-center hover:scale-105 transition-all duration-300 cursor-pointer`}>
                <div className="text-4xl mb-3">{s.emoji}</div>
                <h3 className={`font-heading font-semibold text-lg ${s.color}`}>{s.label}</h3>
              </motion.div>
            ))}
            {/* "More coming" card */}
            <motion.div initial="hidden" whileInView="visible" custom={7}
              viewport={{ once: true }} variants={fadeUp}
              className="group bg-zinc-900 border border-dashed border-zinc-700 rounded-xl p-6 text-center hover:border-lime-400/30 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="font-heading font-semibold text-lg text-zinc-500">More Coming</h3>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="py-24 bg-zinc-950">
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="text-center mb-16">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">How It Works</span>
            <h2 className="font-heading font-bold text-3xl md:text-5xl tracking-tight uppercase text-white mb-4">
              Three Steps to Better Performance
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((item, i) => (
              <motion.div key={item.step} initial="hidden" whileInView="visible" custom={i}
                viewport={{ once: true }} variants={fadeUp}
                className="relative text-center">
                {/* Connector line for desktop */}
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-gradient-to-r from-zinc-700 to-transparent" />
                )}
                <div className="w-16 h-16 rounded-full bg-lime-400/10 border border-lime-400/20 flex items-center justify-center mx-auto mb-6">
                  <item.icon className="w-7 h-7 text-lime-400" strokeWidth={1.5} />
                </div>
                <div className="text-lime-400/40 font-heading font-black text-5xl absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 select-none pointer-events-none">
                  {item.step}
                </div>
                <h3 className="font-heading font-semibold text-xl text-white mb-3">{item.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed max-w-xs mx-auto">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SOCIAL PROOF ============ */}
      <section className="py-24 bg-zinc-900/50 border-y border-zinc-800/50">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="flex justify-center gap-1 mb-6">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-6 h-6 text-amber-400 fill-amber-400" />
              ))}
            </div>
            <blockquote className="text-xl md:text-2xl text-white font-medium leading-relaxed mb-6 italic">
              "AthlyticAI completely changed how I train. The video analysis caught technique flaws I never noticed, and the training plans keep me consistent."
            </blockquote>
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-lime-400/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-lime-400" />
              </div>
              <div className="text-left">
                <div className="text-white font-semibold text-sm">Thousands of Athletes</div>
                <div className="text-zinc-500 text-xs">Trust AthlyticAI for their training</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ============ BLOG PREVIEW ============ */}
      {blogPosts.length > 0 && (
        <section className="py-24 bg-zinc-950">
          <div className="container mx-auto px-4 max-w-7xl">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
              className="text-center mb-16">
              <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Blog</span>
              <h2 className="font-heading font-bold text-3xl md:text-5xl tracking-tight uppercase text-white mb-4">
                Latest from Our Blog
              </h2>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                Tips, guides, and insights to help you play smarter.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {blogPosts.slice(0, 3).map((post, i) => (
                <motion.div key={post.slug} initial="hidden" whileInView="visible" custom={i}
                  viewport={{ once: true }} variants={fadeUp}>
                  <Link to={`/blog/${post.slug}`}
                    className="group block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-lime-400/30 transition-all duration-300">
                    {post.cover_image && (
                      <div className="aspect-video overflow-hidden">
                        <img src={post.cover_image} alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                        {post.sport && <span className="text-lime-400 uppercase font-semibold">{post.sport}</span>}
                        {post.category && <span>· {post.category}</span>}
                        {post.read_time && (
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.read_time}</span>
                        )}
                      </div>
                      <h3 className="font-heading font-semibold text-white text-lg mb-2 group-hover:text-lime-400 transition-colors line-clamp-2">
                        {post.title}
                      </h3>
                      <p className="text-zinc-400 text-sm line-clamp-2">{post.excerpt}</p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-10">
              <Link to="/blog"
                className="inline-flex items-center gap-2 text-lime-400 hover:text-lime-300 font-semibold transition-colors">
                View All Posts <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ============ FAQ ============ */}
      <section className="py-24 bg-zinc-900/40 border-y border-zinc-800/50">
        <div className="container mx-auto px-4 max-w-3xl">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_STRUCTURED_DATA) }} />
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="text-center mb-12">
            <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">FAQ</span>
            <h2 className="font-heading font-bold text-3xl md:text-5xl tracking-tight uppercase text-white mb-4">
              Frequently Asked Questions
            </h2>
          </motion.div>
          <div className="space-y-4">
            {FAQS.map((f, i) => (
              <motion.details key={i} initial="hidden" whileInView="visible" custom={i}
                viewport={{ once: true }} variants={fadeUp}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-lime-400/30 transition-all">
                <summary className="cursor-pointer font-heading font-semibold text-white text-lg flex items-center justify-between gap-4">
                  <span>{f.q}</span>
                  <ChevronRight className="w-5 h-5 text-lime-400 group-open:rotate-90 transition-transform flex-shrink-0" />
                </summary>
                <p className="text-zinc-400 text-sm leading-relaxed mt-3">{f.a}</p>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="py-24 bg-zinc-950 border-t border-zinc-800/50">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lime-400/10 border border-lime-400/20 mb-8">
              <Zap className="w-4 h-4 text-lime-400" />
              <span className="text-sm font-medium text-lime-400">Free to get started</span>
            </div>
            <h2 className="font-heading font-bold text-3xl md:text-5xl uppercase tracking-tight text-white mb-4">
              Start Your Journey Today
            </h2>
            <p className="text-zinc-400 text-lg mb-8 max-w-xl mx-auto">
              Join athletes across 7 sports who are training smarter with AI-powered coaching. No credit card required.
            </p>
            <Button onClick={handleCTA} size="lg" data-testid="cta-bottom-btn"
              className="bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide px-10 py-6 text-lg rounded-full shadow-[0_0_20px_rgba(190,242,100,0.3)] hover:shadow-[0_0_30px_rgba(190,242,100,0.5)] hover:scale-105 transition-all active:scale-95">
              Get Started Free <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="py-16 border-t border-zinc-800/50 bg-zinc-950">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 text-lime-400" />
                <span className="font-heading font-bold text-lg uppercase tracking-wide text-white">AthlyticAI</span>
              </div>
              <p className="text-zinc-500 text-sm leading-relaxed">
                AI-powered sports coaching platform. Train smarter across every sport you love.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Product</h4>
              <ul className="space-y-2">
                <li><Link to="/auth" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Video Analysis</Link></li>
                <li><Link to="/auth" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Training Plans</Link></li>
                <li><Link to="/auth" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Equipment Finder</Link></li>
                <li><Link to="/auth" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Highlight Reels</Link></li>
              </ul>
            </div>

            {/* Sports */}
            <div>
              <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Sports</h4>
              <ul className="space-y-2">
                <li><Link to="/badminton" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">🏸 Badminton Coach</Link></li>
                <li><Link to="/tennis" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">🎾 Tennis Coach</Link></li>
                <li><Link to="/table-tennis" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">🏓 Table Tennis Coach</Link></li>
                <li><Link to="/pickleball" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">⚡ Pickleball Coach</Link></li>
                <li><span className="text-zinc-500 text-sm">+ Cricket, Football, Swimming</span></li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Resources</h4>
              <ul className="space-y-2">
                <li><Link to="/blog" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Blog</Link></li>
                <li><Link to="/auth" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Sign Up</Link></li>
                <li><Link to="/auth" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Login</Link></li>
                <li><Link to="/community" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Community</Link></li>
                <li><Link to="/privacy" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-zinc-800/50 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-zinc-600 text-xs">&copy; {new Date().getFullYear()} AthlyticAI. All rights reserved.</p>
              <Link to="/privacy" className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors">Privacy Policy</Link>
            </div>
            <div className="flex items-center gap-1">
              {SPORTS.map(s => (
                <span key={s.key} className="text-lg" title={s.label}>{s.emoji}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
