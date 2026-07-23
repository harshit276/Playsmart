import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { motion, useReducedMotion } from "framer-motion";
import SEO from "@/components/SEO";
import DemoVideo from "@/components/DemoVideo";
import EarnTokensSection from "@/components/EarnTokensSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import FeatureShowcase from "@/components/FeatureShowcase";
import {
  Zap, Play, ChevronRight, Sparkles, TrendingUp, Upload,
  ArrowRight, Clock, Timer, Smartphone, Activity, Shield
} from "lucide-react";
import { FormantiIcon, FormantiLogo } from "@/components/FormantiLogo";
import { useState, useEffect } from "react";
import api from "@/lib/api";

const SPORTS = [
  { key: "badminton", emoji: "🏸", label: "Badminton", path: "/badminton", color: "text-lime-400", border: "border-lime-400/30", bg: "bg-lime-400/5" },
  { key: "tennis", emoji: "🎾", label: "Tennis", path: "/tennis", color: "text-amber-400", border: "border-amber-400/30", bg: "bg-amber-400/5" },
  { key: "table_tennis", emoji: "🏓", label: "Table Tennis", path: "/table-tennis", color: "text-sky-400", border: "border-sky-400/30", bg: "bg-sky-400/5" },
  { key: "cricket", emoji: "🏏", label: "Cricket", path: "/cricket", color: "text-blue-400", border: "border-blue-400/30", bg: "bg-blue-400/5" },
  { key: "football", emoji: "⚽", label: "Football", path: "/football", color: "text-green-400", border: "border-green-400/30", bg: "bg-green-400/5" },
  { key: "swimming", emoji: "🏊", label: "Swimming", path: "/swimming", color: "text-cyan-400", border: "border-cyan-400/30", bg: "bg-cyan-400/5" },
  { key: "pickleball", emoji: "⚡", label: "Pickleball", path: "/pickleball", color: "text-emerald-400", border: "border-emerald-400/30", bg: "bg-emerald-400/5" },
  { key: "basketball", emoji: "🏀", label: "Basketball", path: "/basketball", color: "text-orange-400", border: "border-orange-400/30", bg: "bg-orange-400/5" },
];

// Landing pages that exist but are NOT sport-specific AI analysis models like
// the ones above — the video analysis engine is purpose-built for the
// racket/ball sports in SPORTS. These get training guides, technique tips,
// and equipment picks, presented honestly as a separate, lighter-weight
// grouping (do not imply identical purpose-built analysis).
const MORE_ACTIVITIES = [
  { key: "gym", emoji: "🏋️", label: "Gym", path: "/gym" },
  { key: "weight_lifting", emoji: "🔩", label: "Weight Lifting", path: "/weight-lifting" },
  { key: "physiotherapy", emoji: "🩹", label: "Physiotherapy", path: "/physiotherapy" },
];

// Mirrors what actually happens: handleCTA() drops users straight into
// /analyze — there is no intake quiz before the first analysis any more, so
// don't describe one.
const HOW_IT_WORKS = [
  { step: "01", icon: Upload, title: "Film 10–30 seconds", desc: "Any phone, any angle where your body is clearly in frame. A single rally or a couple of reps is plenty — you don't need a tripod or a full match." },
  { step: "02", icon: Sparkles, title: "Our AI breaks it down", desc: "Shot by shot with timestamps, posture on the contact frame, and a coach's read on what's working and what isn't. Analysis runs on our servers, so you can lock your phone and walk away." },
  { step: "03", icon: TrendingUp, title: "Train on it, then re-check", desc: "Work the drills and weekly plan it gives you, then re-analyze a later clip and compare the two sessions side by side." },
];

const FAQS = [
  {
    q: "How does AI video analysis work?",
    // Don't name the underlying model vendor here — it's deliberately not
    // disclosed anywhere in the product. "Our AI" is the house phrasing.
    a: "You upload a short clip and our AI breaks it into individual shots with timestamps — what you were trying to do with each one and how it turned out. On racket and ball sports it also runs pose detection on the contact frame, drawing a skeleton overlay and measuring your joint angles against ideal ranges. From that it writes a coach narrative, drills, and a weekly plan.",
  },
  {
    q: "Which sports does Formanti support?",
    a: "Badminton, tennis, table tennis, pickleball, cricket, football, swimming and basketball get sport-specific analysis — shot-by-shot detection, drills and equipment matched to how you actually play. Beyond those, the AI reads any activity where the movement is clearly visible in frame, which makes it genuinely useful for gym and weight lifting: film a set and get a coach's read on your form instead of paying for a personal trainer. That feedback is about movement quality and what to fix, rather than sport-tuned shot detection.",
  },
  {
    q: "Is Formanti free?",
    a: "You can get started for free — new users receive free tokens to try video analysis. Beyond that, analyses use tokens, which you can top up in affordable packs. Browsing equipment recommendations and training content is free. See our Pricing page for token pack details.",
  },
  {
    q: "What happens to the video I upload?",
    a: "Your video is uploaded over an encrypted connection so our AI can analyze it. Where your device supports it, the video is compressed on your device first to speed up the upload. We don't keep your raw video after your analysis is generated — only your results are saved. See our Privacy Policy for details.",
  },
];

const APP_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Formanti",
  operatingSystem: "Web, Android, iOS",
  applicationCategory: "SportsApplication",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  // No aggregateRating here on purpose — we don't have a real, verifiable
  // rating to publish yet. Don't add one without real data backing it (see
  // PLACEHOLDER_TESTIMONIALS below for the same rule on the testimonials UI).
  description: "AI-powered sports video analysis, training plans, and highlight reel generation",
  url: "https://www.formanti.com",
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

// PLACEHOLDER — replace with REAL user quotes before launch. Do not ship
// invented testimonials, names, photos, or ratings. There is currently no
// public endpoint that returns real approved user feedback (the backend's
// /analysis-feedback endpoint is write-only; the only reader of that data,
// GET /admin/stats, is admin-key gated). Once real quotes are collected and
// approved (either via a new public read endpoint, or manually curated with
// user permission), populate this array — TestimonialsSection renders
// nothing while it stays empty. Shape: { name, quote, rating (1-5), sport }.
const PLACEHOLDER_TESTIMONIALS = [
  // { name: "<name>", quote: "<real user quote here>", rating: 5, sport: "<sport>" },
];

// Facts bar — same rule as PLACEHOLDER_TESTIMONIALS and APP_STRUCTURED_DATA
// below: nothing goes on this page that we cannot point at in the code or in a
// real user's account. This band previously shipped invented metrics ("10K+
// Analyses Performed", "500+ Training Drills", "98% User Satisfaction"); none
// were backed by anything, and the only real rating the product has received
// so far is a 1-star. They are gone. Every entry here is checkable:
//   sports count ...... SPORTS.length, derived so it cannot drift
//   100 tokens ........ backend server.py TOKEN grants: "signup_grant": 100,
//                       commented "once per user — exactly 1 free analysis"
//   10–30s ............ the clip-length guidance AnalyzePage gives on oversize
//                       uploads ("Trim it to your key 10–30 seconds")
//   ~5MB .............. DownloadPage's stated PWA install size
// Do NOT re-add user counts, satisfaction percentages, or star ratings.
const FACTS = [
  { icon: Activity, value: String(SPORTS.length), label: "Sports with sport-tuned analysis" },
  { icon: Zap, value: "100", label: "Free tokens on signup — 1 analysis" },
  { icon: Timer, value: "10–30s", label: "That's all the clip we need" },
  { icon: Smartphone, value: "~5MB", label: "Installs as an app, no store" },
];

// Premium scroll-in: a little more travel, a subtle scale-settle, and an
// ease-out-expo curve (fast in, soft landing) instead of the default. No blur
// filter on purpose — animating blur across the 8 sport tiles at once janks on
// low-end Android, and the scale+ease already reads as "premium".
const EASE_PREMIUM = [0.16, 1, 0.3, 1];
const fadeUp = {
  hidden: { opacity: 0, y: 40, scale: 0.96 },
  visible: (i = 0) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.7, delay: i * 0.08, ease: EASE_PREMIUM },
  }),
};

const fadeUpStill = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuth();
  const [blogPosts, setBlogPosts] = useState([]);
  // Respect prefers-reduced-motion: same layout, no travel/fade.
  const reduceMotion = useReducedMotion();
  const rise = reduceMotion ? fadeUpStill : fadeUp;

  useEffect(() => {
    api.get("/blog", { timeout: 5000 })
      .then(r => setBlogPosts((r.data || []).slice(0, 3)))
      .catch(() => {});
    // Preload Firebase auth chunk + the AuthPage bundle so the Google
    // sign-in popup is INSTANT on first click. Without this, the user
    // sees a ~1-2s chunk download after clicking before the popup opens.
    if (!isAuthenticated) {
      const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 800));
      idle(() => {
        import("firebase/auth").catch(() => {});
        import("@/lib/firebase").catch(() => {});
        import("@/pages/AuthPage").catch(() => {});
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCTA = () => {
    // Skip the heavy intake quiz — drop users straight into the value
    // (the analyze page). Profile capture happens AFTER the first analysis
    // when we can offer an auto-filled, evidence-based profile.
    if (isAuthenticated && profile) navigate("/dashboard");
    else navigate("/analyze");
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <SEO
        title="AI Sports Coach for Badminton, Tennis & More"
        description="Get instant AI video analysis, personalized training plans, smart equipment recommendations, and auto-generated highlight reels for badminton, tennis, table tennis, and more. Free to get started."
        keywords="AI sports coach, badminton video analysis, tennis coach app, table tennis training, sports highlights generator, badminton training plan, sports equipment recommendations India, AI shot analysis"
        url="https://www.formanti.com/"
        structuredData={APP_STRUCTURED_DATA}
      />

      {/* ============ HERO ============ */}
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden pt-24 pb-16">
        {/* Background stack: photo → wash → vignette → lime bloom → grid.
            Layering (rather than a single flat gradient) is what stops the
            hero reading as "text on a dark rectangle". */}
        <div className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1461896836934-bd45ba8a0a58?w=1920&q=60')",
            backgroundSize: "cover", backgroundPosition: "center"
          }} />
        <div className="absolute inset-0 bg-zinc-950/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-transparent to-zinc-950" />
        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-950 via-transparent to-zinc-950/60" />

        {/* Lime bloom behind the headline + a cool counterweight */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[42rem] h-[42rem] max-w-full bg-lime-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] bg-sky-500/5 rounded-full blur-3xl" />

        {/* Faint grid — texture, not decoration you can consciously see */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 72%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 72%)",
          }} />

        <div className="relative z-10 container mx-auto px-4 max-w-5xl text-center">
          {/* Brand mark above the fold — the hero previously opened straight
              into a generic badge, so a first-time visitor met the product
              before they met the name. */}
          <motion.div initial="hidden" animate="visible" variants={rise}>
            <FormantiLogo className="h-10 md:h-12 mx-auto mb-7" markClassName="h-9 md:h-11"
              textClassName="font-heading font-bold text-2xl md:text-3xl uppercase tracking-tight text-white" />
          </motion.div>

          <motion.div initial="hidden" animate="visible" custom={0.05} variants={rise}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lime-400/10 border border-lime-400/25 mb-7 backdrop-blur-sm" data-testid="hero-badge">
              <Zap className="w-3.5 h-3.5 text-lime-400" />
              <span className="text-xs sm:text-sm font-medium text-lime-300 tracking-wide uppercase">AI Sports Coaching</span>
            </div>
          </motion.div>

          <motion.h1 initial="hidden" animate="visible" custom={0.1} variants={rise}
            className="font-heading font-black text-[3.25rem] leading-[0.85] sm:text-7xl lg:text-8xl tracking-tighter uppercase mb-6" data-testid="hero-heading">
            <span className="block text-zinc-500 text-2xl sm:text-3xl lg:text-4xl tracking-tight mb-2 sm:mb-3">Film one rally.</span>
            <span className="block text-white">Get coached</span>
            <span className="block neon-glow text-lime-400">like a pro.</span>
          </motion.h1>

          <motion.p initial="hidden" animate="visible" custom={0.3} variants={rise}
            className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-7 leading-relaxed" data-testid="hero-subtitle">
            Our AI breaks your clip down shot by shot, shows you the posture behind each one,
            and turns it into drills, a plan and a written report.
          </motion.p>

          {/* Sport pills — one flowing row, quieter so they support the
              headline instead of competing with it. */}
          <motion.div initial="hidden" animate="visible" custom={0.4} variants={rise}
            className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mb-9 max-w-2xl mx-auto">
            {SPORTS.map(s => (
              <span key={s.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm text-[11px] sm:text-xs text-zinc-300">
                <span>{s.emoji}</span> {s.label}
              </span>
            ))}
          </motion.div>

          <motion.div initial="hidden" animate="visible" custom={0.5} variants={rise}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Button onClick={handleCTA} size="lg" data-testid="hero-cta-btn"
              className="w-full sm:w-auto bg-lime-400 text-black hover:bg-lime-300 font-bold uppercase tracking-wide px-8 sm:px-10 py-6 text-base sm:text-lg rounded-full shadow-[0_0_30px_rgba(163,230,53,0.25)] hover:shadow-[0_0_45px_rgba(163,230,53,0.45)] transition-all hover:scale-[1.03] active:scale-95">
              Analyze my first clip <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
            <Button onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
              variant="ghost" size="lg"
              className="w-full sm:w-auto text-zinc-300 hover:text-white bg-zinc-900/50 backdrop-blur-sm border border-zinc-700 hover:border-zinc-500 rounded-full px-8 py-6 text-base sm:text-lg transition-all">
              <Play className="w-5 h-5 mr-1.5" /> Watch the demo
            </Button>
          </motion.div>

          <motion.p initial="hidden" animate="visible" custom={0.55} variants={rise}
            className="text-sm text-lime-400/90 font-medium mt-4">
            🪙 Free to start — 100 tokens on signup, enough for 1 analysis.
          </motion.p>

          <motion.div initial="hidden" animate="visible" custom={0.6} variants={rise}
            className="mt-6 flex flex-col items-center">
            <Link
              to="/download"
              className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-900/70 border border-zinc-800 hover:border-lime-400/40 text-zinc-300 hover:text-white text-sm transition-all"
              data-testid="hero-get-app"
            >
              <Sparkles className="w-4 h-4 text-lime-400" />
              <span>Install as an app — ~5MB, no store</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </motion.div>
        </div>

        {/* Scroll indicator — desktop only; on a phone it collides with the
            CTA stack and adds nothing. */}
        {!reduceMotion && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
            className="hidden md:block absolute bottom-8 left-1/2 -translate-x-1/2">
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }}
              className="w-6 h-10 border-2 border-zinc-700 rounded-full flex justify-center pt-2">
              <div className="w-1.5 h-1.5 bg-lime-400 rounded-full" />
            </motion.div>
          </motion.div>
        )}
      </section>

      {/* ============ FACTS BAR ============ */}
      <section className="relative py-10 md:py-12 bg-zinc-900/60 border-y border-zinc-800/60 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime-400/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
            {FACTS.map((s, i) => (
              <motion.div key={s.label} initial="hidden" whileInView="visible" custom={i}
                viewport={{ once: true }} variants={rise}
                className="flex flex-col items-center text-center md:border-r md:last:border-r-0 border-zinc-800/60 px-2">
                <s.icon className="w-4 h-4 text-lime-400/70 mb-2" strokeWidth={1.75} />
                <div className="font-heading font-black text-3xl md:text-4xl text-white tracking-tight mb-1">{s.value}</div>
                <div className="text-zinc-500 text-[11px] sm:text-xs leading-snug max-w-[10rem]">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ DEMO VIDEO ============ */}
      <DemoVideo />

      {/* ============ TOKEN ECONOMY ============ */}
      <EarnTokensSection />

      {/* ============ FEATURE SHOWCASE ============ */}
      {/* Replaces the old six flat "Features" cards, which described the
          product in generic marketing terms and left most of it undiscovered.
          Everything in FeatureShowcase maps to shipped code — see the header
          comment in that file for the feature → source mapping. */}
      <div id="features" data-testid="features-section">
        <FeatureShowcase />
      </div>

      {/* ============ SPORTS SECTION ============ */}
      <section className="relative py-20 md:py-28 bg-zinc-900/40 border-y border-zinc-800/50 overflow-hidden">
        <div className="pointer-events-none absolute -right-40 top-1/3 w-[32rem] h-[32rem] bg-sky-500/5 rounded-full blur-3xl" />
        <div className="relative container mx-auto px-4 max-w-5xl">
          {/* Left-aligned header — the page was every-section-centred, which
              flattened the rhythm. Alternating alignment gives it a pulse. */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}
            className="max-w-2xl mb-10 md:mb-14">
            <span className="inline-flex items-center gap-2 text-lime-400 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
              <span className="w-8 h-px bg-lime-400/60" /> Multi-sport
            </span>
            <h2 className="font-heading font-black text-4xl md:text-6xl tracking-tighter uppercase text-white leading-[0.95] mb-4">
              One app.<br />Every session.
            </h2>
            <p className="text-zinc-400 text-base md:text-lg leading-relaxed">
              Eight sports get purpose-built AI models, drills and coaching — and anything
              else you film, from a squat rack to a swim lane, gets a coach's read on your form.
            </p>
          </motion.div>

          {/* Gym / lifting leads the section — it's the strongest pitch on the
              page (a trainer is ~₹10,000/month, a phone is free), so it sits
              ABOVE the sport grid rather than under it. Copy promises FORM
              FEEDBACK, not joint-angle measurement — the angle tracker is off
              for lifting until the bilateral-load work lands, and over-claiming
              here is exactly what earns a 1-star. */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}
            className="mb-10 md:mb-14">
            <div className="relative overflow-hidden rounded-3xl border border-lime-400/25 bg-gradient-to-br from-lime-400/[0.12] via-zinc-900 to-zinc-900 p-6 md:p-10">
              <div className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 bg-lime-400/10 rounded-full blur-3xl" />
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-lime-400/50 to-transparent" />
              <div className="relative flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
                <div className="text-6xl md:text-7xl shrink-0 leading-none">🏋️</div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading font-black text-3xl md:text-4xl uppercase tracking-tighter text-white leading-[0.95] mb-3">
                    Lifting? Skip the<br className="hidden sm:block" /> <span className="text-lime-400">₹10,000</span> trainer.
                  </h3>
                  <p className="text-zinc-300 leading-relaxed mb-5 max-w-xl">
                    Film a set on your phone and get honest feedback on your form — what looked
                    solid, what broke down, and what to fix before your next session. Squats,
                    deadlifts, presses, and the rest.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {MORE_ACTIVITIES.map((a) => (
                      <Link key={a.key} to={a.path}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-950/60 border border-zinc-700 hover:border-lime-400/50 hover:bg-zinc-900 text-zinc-200 hover:text-white text-sm font-medium transition-all">
                        <span>{a.emoji}</span> {a.label}
                        <ArrowRight className="w-3.5 h-3.5 opacity-50" />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Scope note stays. This is the exact spot where over-claiming
                would cost us: lifting gets FORM FEEDBACK, not joint angles. */}
            <div className="mt-5 flex items-start gap-2.5 max-w-2xl text-zinc-500 text-xs leading-relaxed">
              <Shield className="w-4 h-4 shrink-0 mt-px text-zinc-600" strokeWidth={1.75} />
              <p>
                Analysis works on any activity where the movement is clearly visible in frame.
                The eight sports below additionally get sport-tuned shot detection, drills, and
                the joint-angle posture tracker — for gym and lifting you get overall form
                feedback, not measured angles.
              </p>
            </div>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {SPORTS.map((s, i) => (
              <motion.div key={s.key} initial="hidden" whileInView="visible" custom={i}
                viewport={{ once: true }} variants={rise}>
                <Link to={s.path}
                  className={`group relative block overflow-hidden bg-gradient-to-b from-zinc-900 to-zinc-900/40 border ${s.border} rounded-2xl p-5 sm:p-6 text-center hover:-translate-y-1.5 hover:border-zinc-600 hover:shadow-xl hover:shadow-black/50 transition-all duration-300 ease-out will-change-transform`}>
                  {/* Sport-tinted wash on hover. Note: every colour class used
                      here comes verbatim from the SPORTS table above, so
                      Tailwind's source scan can see it — never build a class
                      name by string concatenation or it gets purged. */}
                  <div className={`pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${s.bg}`} />
                  <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                  <div className="relative text-3xl sm:text-4xl mb-3 transition-transform duration-300 group-hover:scale-110">{s.emoji}</div>
                  <h3 className={`relative font-heading font-semibold text-sm sm:text-lg ${s.color}`}>{s.label}</h3>
                </Link>
              </motion.div>
            ))}
            {/* "More coming" card */}
            <motion.div initial="hidden" whileInView="visible" custom={SPORTS.length}
              viewport={{ once: true }} variants={rise}
              className="bg-zinc-900/30 border border-dashed border-zinc-800 rounded-2xl p-5 sm:p-6 text-center flex flex-col items-center justify-center">
              <div className="text-3xl sm:text-4xl mb-3 opacity-50">🎯</div>
              <h3 className="font-heading font-semibold text-sm sm:text-lg text-zinc-600">More Coming</h3>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      {/* Vertical numbered rail rather than a third three-across grid — the
          page needs a change of shape here, and a sequence reads better as a
          sequence than as parallel columns. */}
      <section className="relative py-20 md:py-28 bg-zinc-950 overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-1/4 w-[30rem] h-[30rem] bg-lime-400/[0.04] rounded-full blur-3xl" />
        <div className="relative container mx-auto px-4 max-w-3xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}
            className="mb-12 md:mb-16">
            <span className="inline-flex items-center gap-2 text-lime-400 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
              <span className="w-8 h-px bg-lime-400/60" /> How it works
            </span>
            <h2 className="font-heading font-black text-4xl md:text-6xl tracking-tighter uppercase text-white leading-[0.95]">
              Three steps.<br />No coach required.
            </h2>
          </motion.div>

          <div className="relative">
            {/* the rail */}
            <div className="absolute left-6 md:left-8 top-4 bottom-6 w-px bg-gradient-to-b from-lime-400/40 via-zinc-800 to-transparent" />
            <div className="space-y-8 md:space-y-12">
              {HOW_IT_WORKS.map((item, i) => (
                <motion.div key={item.step} initial="hidden" whileInView="visible" custom={i}
                  viewport={{ once: true, amount: 0.5 }} variants={rise}
                  className="relative flex gap-5 md:gap-8">
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-zinc-900 border border-lime-400/25 flex items-center justify-center shadow-lg shadow-lime-400/5">
                      <item.icon className="w-5 h-5 md:w-7 md:h-7 text-lime-400" strokeWidth={1.5} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <span className="font-mono text-xs text-lime-400/60 tracking-widest">{item.step}</span>
                    <h3 className="font-heading font-bold text-xl md:text-2xl text-white tracking-tight mt-1 mb-2">{item.title}</h3>
                    <p className="text-zinc-400 text-sm md:text-base leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      {/* Renders nothing until PLACEHOLDER_TESTIMONIALS has real, approved
          user quotes — see the constant definition above for why. */}
      <TestimonialsSection testimonials={PLACEHOLDER_TESTIMONIALS} />

      {/* ============ BLOG PREVIEW ============ */}
      {blogPosts.length > 0 && (
        <section className="py-24 bg-zinc-950">
          <div className="container mx-auto px-4 max-w-7xl">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}
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
                  viewport={{ once: true }} variants={rise}>
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
      <section className="py-20 md:py-28 bg-zinc-900/40 border-y border-zinc-800/50">
        <div className="container mx-auto px-4 max-w-3xl">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_STRUCTURED_DATA) }} />
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}
            className="mb-10 md:mb-12">
            <span className="inline-flex items-center gap-2 text-lime-400 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
              <span className="w-8 h-px bg-lime-400/60" /> FAQ
            </span>
            <h2 className="font-heading font-black text-4xl md:text-5xl tracking-tighter uppercase text-white leading-[0.95]">
              Straight answers
            </h2>
          </motion.div>
          <div className="space-y-3">
            {FAQS.map((f, i) => (
              <motion.details key={i} initial="hidden" whileInView="visible" custom={i}
                viewport={{ once: true }} variants={rise}
                className="group rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-900/40 p-5 open:border-lime-400/30 hover:border-zinc-700 transition-colors">
                <summary className="cursor-pointer list-none font-heading font-semibold text-white text-base md:text-lg flex items-start justify-between gap-4">
                  <span className="min-w-0">{f.q}</span>
                  <ChevronRight className="w-5 h-5 text-lime-400 group-open:rotate-90 transition-transform flex-shrink-0 mt-0.5" />
                </summary>
                <p className="text-zinc-400 text-sm leading-relaxed mt-3 pr-8">{f.a}</p>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="relative py-24 md:py-32 bg-zinc-950 border-t border-zinc-800/50 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -bottom-40 h-96 bg-lime-400/[0.07] blur-3xl rounded-full" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime-400/30 to-transparent" />
        <div className="relative container mx-auto px-4 max-w-3xl text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}>
            <FormantiIcon className="h-10 mx-auto mb-6 opacity-90" />
            <h2 className="font-heading font-black text-4xl md:text-6xl uppercase tracking-tighter text-white leading-[0.95] mb-5">
              Your next session<br /><span className="text-lime-400">can be your best one.</span>
            </h2>
            {/* No user counts here. We don't have a number worth printing and
                inventing one is how you earn a 1-star. */}
            <p className="text-zinc-400 text-base md:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
              Film 10–30 seconds today and see what our AI finds. No credit card, no app store,
              100 free tokens on signup.
            </p>
            <Button onClick={handleCTA} size="lg" data-testid="cta-bottom-btn"
              className="w-full sm:w-auto bg-lime-400 text-black hover:bg-lime-300 font-bold uppercase tracking-wide px-10 py-6 text-base sm:text-lg rounded-full shadow-[0_0_30px_rgba(163,230,53,0.25)] hover:shadow-[0_0_45px_rgba(163,230,53,0.45)] hover:scale-[1.03] transition-all active:scale-95">
              Analyze my first clip <ChevronRight className="w-5 h-5 ml-1" />
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
                <FormantiIcon className="h-5" />
                <span className="font-heading font-bold text-lg uppercase tracking-wide text-white">Formanti</span>
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
                <li><Link to="/wallet" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Tokens & Wallet</Link></li>
                <li><Link to="/community" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Community Games</Link></li>
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
                <li><Link to="/basketball" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">🏀 Basketball Coach</Link></li>
                <li><span className="text-zinc-500 text-sm">+ Cricket, Football, Swimming</span></li>
                <li>
                  <span className="text-zinc-600 text-xs">Also: </span>
                  <Link to="/gym" className="text-zinc-500 hover:text-lime-400 text-xs transition-colors">Gym</Link>
                  <span className="text-zinc-600 text-xs">, </span>
                  <Link to="/weight-lifting" className="text-zinc-500 hover:text-lime-400 text-xs transition-colors">Weight Lifting</Link>
                  <span className="text-zinc-600 text-xs">, </span>
                  <Link to="/physiotherapy" className="text-zinc-500 hover:text-lime-400 text-xs transition-colors">Physiotherapy</Link>
                </li>
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
                <li><Link to="/terms" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Terms &amp; Conditions</Link></li>
                <li><Link to="/refund" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Refund Policy</Link></li>
                <li><Link to="/cancellation" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Cancellation Policy</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-zinc-800/50 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-zinc-600 text-xs">&copy; {new Date().getFullYear()} Formanti. All rights reserved.</p>
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
