import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { motion, useReducedMotion } from "framer-motion";
import SEO from "@/components/SEO";
import PoseDemo from "@/components/PoseDemo";
import HomeHeader from "@/components/HomeHeader";
import StickyCta from "@/components/StickyCta";
import ResultPreview from "@/components/ResultPreview";
import HomeVideo from "@/components/HomeVideo";
import PracticeBreakdownSection from "@/components/ShotBreakdown";
import Shuttle3D from "@/components/Shuttle3D";
import Court3D from "@/components/Court3D";
import Tilt3D from "@/components/Tilt3D";
import { useHomeTracking } from "@/lib/homeTracking";
import EarnTokensSection from "@/components/EarnTokensSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import QuickSignupCTA from "@/components/QuickSignupCTA";
import FeatureShowcase from "@/components/FeatureShowcase";
import {
  Zap, Play, ChevronRight, Sparkles, TrendingUp, Upload,
  ArrowRight, Clock, Timer, Smartphone, Activity, Shield, ShieldCheck, ChevronDown
} from "lucide-react";
import { FormantiIcon } from "@/components/FormantiLogo";
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

// How it works, told once. Mirrors what actually happens: handleCTA() drops users straight into /analyze (no intake
// quiz before the first analysis). Each step carries the way in to try it: a clip, a real result, live practice.
// (This replaces two sections that said the same thing: "Three ways to improve" and "How it works".)
const HOW_IT_WORKS = [
  { step: "01", icon: Upload, title: "Film 10–30 seconds", desc: "Any phone, any angle where your body is clearly in frame. A single rally or a couple of reps is plenty. No tripod, no full match.", cta: "Start with a clip", to: "/analyze", id: "how_film" },
  { step: "02", icon: Sparkles, title: "Our AI breaks it down", desc: "Your shots found and timed, your pose redrawn where it's off, a coach's read and a drill to fix first. It runs on our servers, so once the upload finishes you can lock your phone and walk away.", cta: "See a real analysis", to: "/demo", id: "how_demo" },
  { step: "03", icon: Activity, title: "Practise, then film again", desc: "Work the drills, or prop your phone up for live practice: a skeleton follows you, tracking 33 points in 3D, green where you're right, and a voice says what to fix, and the first 10 minutes are free. Then film the same shot again and see both sessions side by side.", cta: "Try live practice", to: "/practice", id: "how_practice", isNew: true },
];

const FOOTER_COLS = [
  { title: "Product", links: [["/auth", "Video Analysis"], ["/practice", "Live Practice"], ["/auth", "Training Plans"], ["/auth", "Equipment Finder"], ["/pricing", "Pricing"], ["/download", "Install the App"], ["/community", "Community Games"]] },
  { title: "Sports", links: [["/badminton", "🏸 Badminton Coach"], ["/tennis", "🎾 Tennis Coach"], ["/table-tennis", "🏓 Table Tennis Coach"], ["/pickleball", "⚡ Pickleball Coach"], ["/basketball", "🏀 Basketball Coach"], ["/cricket", "🏏 Cricket Coach"], ["/football", "⚽ Football Coach"], ["/swimming", "🏊 Swimming Coach"], ["/gym", "🏋️ Gym"], ["/weight-lifting", "🔩 Weight Lifting"], ["/physiotherapy", "🩹 Physiotherapy"]] },
  { title: "Resources", links: [["/blog", "Blog"], ["/auth", "Sign Up"], ["/auth", "Login"], ["/community", "Community"], ["/privacy", "Privacy Policy"], ["/terms", "Terms & Conditions"], ["/refund", "Refund Policy"], ["/cancellation", "Cancellation Policy"]] },
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
    a: "You can get started for free: new users get 2 free analyses. After that it is ₹49 per analysis, cheaper in bigger packs, and analyses never expire. Analyses have no subscription. Live practice is free for your first 10 minutes with an account, then a pass from ₹200 for a week (one payment, nothing renews on its own). Equipment recommendations and training content are free. See our Pricing page for the packs.",
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
//   2 analyses ........ backend server.py TOKEN_RULES "signup_grant": 200
//                       (100 tokens = 1 analysis)
//   10–30s ............ the clip-length guidance AnalyzePage gives on oversize
//                       uploads ("Trim it to your key 10–30 seconds")
//   ~5MB .............. DownloadPage's stated PWA install size
// Do NOT re-add user counts, satisfaction percentages, or star ratings.
const FACTS = [
  { icon: Activity, value: String(SPORTS.length), label: "Sports with sport-tuned analysis", short: "Sports" },
  { icon: Zap, value: "2", label: "Free analyses when you sign up", short: "Free analyses" },
  { icon: Timer, value: "10–30s", label: "That's all the clip we need", short: "Clip needed" },
  { icon: Smartphone, value: "~5MB", label: "Installs as an app, no store", short: "App, no store" },
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
  useHomeTracking();

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

      <HomeHeader />

      {/* ============ HERO ============
          Shows the product doing its thing in the first screen: the skeleton replay is real tracked data
          (see PoseDemo). The headline promises what that shows. CTA first on phones, the demo right after;
          no entrance delays, so nothing here waits on an animation before it can be read or tapped. */}
      <main id="main">
      <section data-section="hero" className="relative overflow-hidden pt-4 sm:pt-12 lg:pt-16 pb-8 sm:pb-14">
        {/* Background: lime bloom + a cool counterweight + a faint grid. (The stock photo this used to sit
            on was a dead link on every load.) */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[42rem] h-[42rem] max-w-full bg-lime-400/10 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-[30rem] h-[30rem] bg-sky-500/5 rounded-full blur-3xl" />
        {/* a badminton court floor receding into the distance (CSS 3D; stands still for reduced motion) */}
        <Court3D className="hidden sm:block" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 72%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 72%)",
          }} />

        <div className="relative z-10 container mx-auto px-4 max-w-6xl w-full">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 sm:gap-10 lg:gap-14 items-center">

            {/* copy + calls to action */}
            <div className="w-full text-center lg:text-left">
              <div className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lime-400/10 border border-lime-400/25 mb-4 lg:mb-5" data-testid="hero-badge">
                <Zap className="w-3.5 h-3.5 text-lime-400 shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-lime-300 tracking-wide uppercase">AI coach for badminton, tennis, table tennis, cricket and gym</span>
              </div>

              <h1 className="font-heading font-black text-[2.15rem] leading-[0.95] sm:text-6xl lg:text-7xl tracking-tighter uppercase" data-testid="hero-heading">
                <span className="block text-white">Film one rally.</span>
                <span className="block neon-glow text-lime-400">See your form corrected.</span>
              </h1>

              <p className="text-[15px] sm:text-lg text-zinc-300 max-w-xl mx-auto lg:mx-0 mt-3 sm:mt-5 leading-snug sm:leading-relaxed" data-testid="hero-subtitle">
                <span className="sm:hidden">An AI coach for badminton, tennis and more. It redraws your pose in green where it's off.</span>
                <span className="hidden sm:inline">Formanti finds your shots, redraws your pose in green where it's off, and gives you a drill to fix first.</span>
              </p>

              <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4">
                <Button onClick={handleCTA} size="lg" data-testid="hero-cta-btn" data-cta="hero_analyze"
                  className="w-full sm:w-auto max-w-[340px] bg-lime-400 text-black hover:bg-lime-300 font-bold uppercase tracking-wide px-8 sm:px-10 py-6 text-base sm:text-lg rounded-full shadow-[0_0_30px_rgba(163,230,53,0.25)] hover:shadow-[0_0_45px_rgba(163,230,53,0.45)] transition-all hover:scale-[1.03] active:scale-95">
                  Analyze my first clip, free <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
                <Button onClick={() => navigate("/practice")} variant="ghost" size="lg" data-testid="hero-practice-btn" data-cta="hero_practice"
                  className="hidden sm:inline-flex w-full sm:w-auto max-w-[340px] text-white bg-zinc-900/60 border border-zinc-600 hover:border-lime-400/60 hover:bg-zinc-900 rounded-full px-8 py-6 text-base sm:text-lg transition-all">
                  <Activity className="w-5 h-5 mr-1.5 text-lime-400" /> Try live practice
                </Button>
              </div>

              <p className="text-[13px] sm:text-sm text-lime-300 font-medium mt-3 sm:mt-4">
                2 free analyses · no card · your video isn't kept after analysis
              </p>

              {/* Phones: the film is the hero visual, right under the button. Everything else waits below it. */}
              <div className="sm:hidden mt-4" data-testid="hero-film-phone">
                <p className="mb-2 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-zinc-300">
                  <Play className="w-3.5 h-3.5 text-lime-400" fill="currentColor" aria-hidden="true" /> 25-second film · tap it for sound
                </p>
                <HomeVideo eager testId="home-video-hero" />
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6">
                  <Link to="/practice" data-cta="hero_phone_practice" className="inline-flex items-center gap-1.5 min-h-11 text-[15px] font-semibold text-lime-300 underline underline-offset-4 decoration-lime-400/50">
                    <Activity className="w-4 h-4" /> Try live practice
                  </Link>
                  <Link to="/demo" data-cta="hero_phone_demo" className="inline-flex items-center min-h-11 text-[15px] text-zinc-300 underline underline-offset-4 decoration-zinc-500">See a real analysis</Link>
                </div>
              </div>
              <div className="mt-1 hidden sm:flex flex-wrap items-center justify-center lg:justify-start gap-x-6">
                <a href="#watch" onClick={(e) => { e.preventDefault(); document.getElementById("watch")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  className="inline-flex items-center gap-1.5 min-h-11 text-[15px] font-semibold text-lime-300 underline underline-offset-4 decoration-lime-400/50 hover:text-lime-200" data-testid="hero-watch-link" data-cta="hero_watch">
                  <Play className="w-4 h-4" fill="currentColor" /> Watch the 25-second film
                </a>
                <Link to="/demo" data-cta="hero_demo" className="inline-flex items-center gap-1.5 min-h-11 text-[15px] text-zinc-300 underline underline-offset-4 decoration-zinc-500 hover:text-white">
                  See a real analysis first
                </Link>
              </div>

              {/* Sport pills — quieter than the headline. */}
              <div className="hidden sm:flex flex-wrap justify-center lg:justify-start gap-2 mt-4 max-w-xl mx-auto lg:mx-0">
                {SPORTS.map(s => (
                  <span key={s.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300">
                    <span aria-hidden="true">{s.emoji}</span> {s.label}
                  </span>
                ))}
              </div>
            </div>

            {/* the product, working */}
            <div className="relative hidden sm:flex justify-center lg:justify-end">
              <Tilt3D max={5} className="w-full max-w-[320px] rounded-[1.5rem]"><PoseDemo /></Tilt3D>
              {/* a shuttlecock in 3D, spinning slowly and leaning toward the pointer (canvas, no WebGL) */}
              <Shuttle3D size={210} className="hidden lg:block absolute -top-14 -right-8 z-20" />
            </div>
          </div>

          {/* FACTS — the proof strip under the hero. */}
          <div className="mt-10 lg:mt-14 grid grid-cols-4 gap-x-2 sm:gap-x-4 border-t border-zinc-800/60 pt-6 sm:pt-8">
            {FACTS.map((f) => (
              <div key={f.label} className="flex flex-col items-center text-center px-0.5 sm:px-2">
                <f.icon className="hidden sm:block w-4 h-4 text-lime-400/70 mb-2" strokeWidth={1.75} />
                <div className="font-heading font-black text-xl sm:text-2xl md:text-3xl text-white tracking-tight mb-0.5 sm:mb-1">{f.value}</div>
                <div className="text-zinc-400 text-[11px] leading-tight sm:leading-snug max-w-[10rem]">
                  <span className="sm:hidden">{f.short}</span>
                  <span className="hidden sm:inline">{f.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ THE FILM ============
          25 seconds that show what Formanti does. One film in two cuts: 16:9 on computers and tablets, 9:16 on phones
          (components/HomeVideo.jsx). Loads nothing until it is near the screen. */}
      <section id="watch" data-section="film" className="relative scroll-mt-20 hidden sm:block py-10 sm:py-14 bg-zinc-950" aria-labelledby="watch-heading">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-6 sm:mb-9">
            <span className="inline-flex items-center gap-2 text-lime-400 text-xs font-semibold uppercase tracking-[0.2em] mb-3">
              <span className="w-8 h-px bg-lime-400/60" /> Watch it work <span className="w-8 h-px bg-lime-400/60" />
            </span>
            <h2 id="watch-heading" className="font-heading font-black text-3xl md:text-5xl tracking-tighter uppercase text-white leading-[0.95]">
              The whole thing in <span className="text-lime-400">25 seconds.</span>
            </h2>
          </div>
          <HomeVideo />
          <p className="text-center text-sm text-zinc-400 mt-5 max-w-xl mx-auto">
            Film a rally, get the breakdown, see your pose in 3D, practise the fix. Tap the video for sound.
          </p>
        </div>
      </section>

      {/* (Facts bar folded into the hero above — no longer a separate strip.) */}

      {/* ============ WHAT YOU GET BACK ============
          One real result in four named parts (shots, 3D pose, coach, practise). See components/ResultPreview.jsx. */}
      <div data-section="result"><ResultPreview rise={rise} /></div>

      {/* ============ HOW IT WORKS ============
          The three steps, each with the way in to try it (a clip, a real result, live practice). Swipeable on phones so
          it doesn't add a screen of scrolling; the cards lean toward the pointer on computers. */}
      <section data-section="how" className="relative py-10 md:py-20 bg-zinc-950 overflow-hidden" aria-labelledby="how-heading">
        <div className="pointer-events-none absolute -left-40 top-1/4 w-[30rem] h-[30rem] bg-lime-400/[0.04] rounded-full blur-3xl" />
        <div className="relative container mx-auto px-4 max-w-6xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise} className="mb-7 md:mb-12">
            <span className="inline-flex items-center gap-2 text-lime-400 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
              <span className="w-8 h-px bg-lime-400/60" /> How it works
            </span>
            <h2 id="how-heading" className="font-heading font-black text-4xl md:text-6xl tracking-tighter uppercase text-white leading-[0.95]">
              Three steps.<br />No coach required.
            </h2>
          </motion.div>
          <div className="-mx-4 px-4 scroll-px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:pb-0"
            style={{ scrollbarWidth: "none" }}>
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="snap-start shrink-0 w-[84%] sm:w-[60%] md:w-auto flex">
                <Tilt3D max={5} className="flex w-full rounded-3xl">
                  <Link to={item.to} data-cta={item.id}
                    className="group flex w-full flex-col rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-900/40 p-5 md:p-6 hover:border-lime-400/40 transition-colors">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="w-12 h-12 rounded-2xl bg-zinc-900 border border-lime-400/25 flex items-center justify-center shadow-lg shadow-lime-400/5">
                        <item.icon className="w-6 h-6 text-lime-400" strokeWidth={1.5} />
                      </span>
                      <span className="font-mono text-xs text-lime-400/70 tracking-widest">STEP {item.step}</span>
                      {item.isNew && <span className="text-[9px] font-black uppercase tracking-wide bg-lime-400 text-black rounded px-1 py-px leading-none">New</span>}
                    </div>
                    <h3 className="font-heading font-bold text-xl md:text-2xl text-white tracking-tight mb-2">{item.title}</h3>
                    <p className="text-sm md:text-[15px] text-zinc-300 leading-relaxed flex-1">{item.desc}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 min-h-11 text-[15px] font-bold text-lime-300 group-hover:text-lime-200">
                      {item.cta} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </Tilt3D>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-lime-400 shrink-0" strokeWidth={1.75} />
            Live practice runs on your phone and nothing is uploaded. Free for 10 minutes with an account.
          </p>
        </div>
      </section>

      {/* ============ PRACTICE, SHOT BY SHOT ============
          What live practice checks, says and drills for each shot, built from the engine's own data (lib/practiceBreakdown). */}
      <PracticeBreakdownSection />

      {/* ============ FEATURE SHOWCASE — SECTION 2: what you get ============ */}
      {/* Moved to be the SECOND thing a visitor sees. The whole point of the
          page is that the product is far more than analysis, and this was
          getting buried five sections down. Everything here maps to shipped
          code — see the header comment in that file. */}
      <div id="features" data-section="features" data-testid="features-section">
        <FeatureShowcase />
      </div>

      {/* (Walkthrough demo now lives in the hero — see DemoPhone in the hero.) */}

      {/* ============ SPORTS SECTION ============ */}
      <section data-section="sports" className="relative py-10 md:py-28 bg-zinc-900/40 border-y border-zinc-800/50 overflow-hidden">
        <div className="pointer-events-none absolute -right-40 top-1/3 w-[32rem] h-[32rem] bg-sky-500/5 rounded-full blur-3xl" />
        <div className="relative container mx-auto px-4 max-w-5xl">
          {/* Left-aligned header — the page was every-section-centred, which
              flattened the rhythm. Alternating alignment gives it a pulse. */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}
            className="max-w-2xl mb-7 md:mb-14">
            <span className="inline-flex items-center gap-2 text-lime-400 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
              <span className="w-8 h-px bg-lime-400/60" /> Multi-sport
            </span>
            <h2 className="font-heading font-black text-4xl md:text-6xl tracking-tighter uppercase text-white leading-[0.95] mb-4">
              One app.<br />Every session.
            </h2>
            <p className="text-zinc-400 text-base md:text-lg leading-relaxed">
              Eight sports get sport-tuned analysis, drills and coaching, and anything
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
            <div className="relative overflow-hidden rounded-3xl border border-lime-400/25 bg-gradient-to-br from-lime-400/[0.12] via-zinc-900 to-zinc-900 p-5 md:p-10">
              <div className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 bg-lime-400/10 rounded-full blur-3xl" />
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-lime-400/50 to-transparent" />
              <div className="relative flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
                <div className="hidden md:block text-7xl shrink-0 leading-none">🏋️</div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading font-black text-2xl md:text-4xl uppercase tracking-tighter text-white leading-[0.95] mb-3">
                    <span className="md:hidden mr-2">🏋️</span>Lifting? Get a<br className="hidden sm:block" /> <span className="text-lime-400">form check</span> on every set.
                  </h3>
                  <p className="text-zinc-300 text-sm md:text-base leading-relaxed mb-4 md:mb-5 max-w-xl">
                    Film a set on your phone and get honest feedback on your form — what looked
                    solid, what broke down, and what to fix before your next session. Squats,
                    deadlifts, presses, and the rest.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {MORE_ACTIVITIES.map((a) => (
                      <Link key={a.key} to={a.path}
                        className="inline-flex items-center gap-2 min-h-11 px-3.5 md:px-4 py-2 rounded-full bg-zinc-950/60 border border-zinc-700 hover:border-lime-400/50 hover:bg-zinc-900 text-zinc-200 hover:text-white text-xs md:text-sm font-medium transition-all">
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
            <div className="mt-5 flex items-start gap-2.5 max-w-2xl text-zinc-400 text-sm leading-relaxed">
              <Shield className="w-4 h-4 shrink-0 mt-0.5 text-zinc-500" strokeWidth={1.75} />
              <p>
                Analysis works on any activity where the movement is clearly visible in frame.
                The eight sports below additionally get sport-tuned shot detection, drills, and
                the joint-angle posture tracker — for gym and lifting you get overall form
                feedback, not measured angles.
              </p>
            </div>
          </motion.div>

          <div className="grid grid-cols-4 gap-2 sm:gap-4">
            {SPORTS.map((s, i) => (
              <motion.div key={s.key} initial="hidden" whileInView="visible" custom={i}
                viewport={{ once: true }} variants={rise}>
                <Tilt3D max={7} className="rounded-2xl">
                <Link to={s.path}
                  className={`group relative block overflow-hidden bg-gradient-to-b from-zinc-900 to-zinc-900/40 border ${s.border} rounded-2xl px-1 py-3 sm:p-6 text-center hover:-translate-y-1.5 hover:border-zinc-600 hover:shadow-xl hover:shadow-black/50 transition-all duration-300 ease-out will-change-transform`}>
                  {/* Sport-tinted wash on hover. Note: every colour class used
                      here comes verbatim from the SPORTS table above, so
                      Tailwind's source scan can see it — never build a class
                      name by string concatenation or it gets purged. */}
                  <div className={`pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${s.bg}`} />
                  <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                  <div className="relative text-2xl sm:text-4xl mb-1 sm:mb-3 transition-transform duration-300 group-hover:scale-110" aria-hidden="true">{s.emoji}</div>
                  <h3 className={`relative font-heading font-semibold text-[12px] leading-tight sm:text-lg ${s.color}`}>{s.label}</h3>
                </Link>
                </Tilt3D>
              </motion.div>
            ))}
            {/* "More coming" card */}
            <motion.div initial="hidden" whileInView="visible" custom={SPORTS.length}
              viewport={{ once: true }} variants={rise}
              className="hidden sm:flex col-span-4 sm:col-span-1 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-2xl p-5 sm:p-6 text-center flex-col items-center justify-center">
              <div className="text-3xl sm:text-4xl mb-3 opacity-50">🎯</div>
              <h3 className="font-heading font-semibold text-sm sm:text-lg text-zinc-400">More Coming</h3>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      {/* Renders nothing until PLACEHOLDER_TESTIMONIALS has real, approved
          user quotes — see the constant definition above for why. */}
      <TestimonialsSection testimonials={PLACEHOLDER_TESTIMONIALS} />

      {/* ============ FAQ ============ */}
      <section data-section="faq" className="py-10 md:py-28 bg-zinc-900/40 border-y border-zinc-800/50">
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
                className="group rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-900/40 open:border-lime-400/30 hover:border-zinc-700 transition-colors">
                <summary className="cursor-pointer list-none p-5 min-h-11 font-heading font-semibold text-white text-base md:text-lg flex items-start justify-between gap-4">
                  <span className="min-w-0">{f.q}</span>
                  <ChevronRight className="w-5 h-5 text-lime-400 group-open:rotate-90 transition-transform flex-shrink-0 mt-0.5" />
                </summary>
                <p className="text-zinc-300 text-sm leading-relaxed px-5 pb-5 -mt-1 pr-12">{f.a}</p>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      {/* ============ TOKEN ECONOMY — after the FAQ ========== */}
      <div data-section="free"><EarnTokensSection /></div>

      {/* ============ BLOG PREVIEW ============ */}
      {blogPosts.length > 0 && (
        <section data-section="blog" className="py-14 md:py-24 bg-zinc-950">
          <div className="container mx-auto px-4 max-w-7xl">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}
              className="text-center mb-8 md:mb-16">
              <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Blog</span>
              <h2 className="font-heading font-bold text-3xl md:text-5xl tracking-tight uppercase text-white mb-4">
                Latest from Our Blog
              </h2>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                Tips, guides, and insights to help you play smarter.
              </p>
            </motion.div>

            {/* Phones: swipe sideways through the three posts instead of
                three full-width image cards stacked down the page. */}
            <div className="-mx-4 px-4 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0"
              style={{ scrollbarWidth: "none" }}>
              {blogPosts.slice(0, 3).map((post, i) => (
                <motion.div key={post.id} initial="hidden" whileInView="visible" custom={i}
                  viewport={{ once: true }} variants={rise}
                  className="snap-start shrink-0 w-[80%] sm:w-[60%] md:w-auto">
                  <Link to={`/blog/${post.id}`}
                    className="group block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-lime-400/30 transition-all duration-300">
                    {post.cover_image && (
                      <div className="aspect-video overflow-hidden">
                        <img src={post.cover_image} alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                        {post.sport && <span className="text-lime-400 uppercase font-semibold">{post.sport}</span>}
                        {post.category && <span>· {post.category}</span>}
                        {post.read_time && (
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.read_time}</span>
                        )}
                      </div>
                      <h3 className="font-heading font-semibold text-white text-lg mb-2 group-hover:text-lime-400 transition-colors line-clamp-2">
                        {post.title}
                      </h3>
                      <p className="text-zinc-400 text-sm line-clamp-2">{post.description}</p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-6 md:mt-10">
              <Link to="/blog"
                className="inline-flex items-center gap-2 text-lime-400 hover:text-lime-300 font-semibold transition-colors">
                View All Posts <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ============ FINAL CTA ============ */}
      <section data-section="final" className="relative py-14 md:py-32 bg-zinc-950 border-t border-zinc-800/50 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -bottom-40 h-96 bg-lime-400/[0.07] blur-3xl rounded-full" />
        <Court3D className="h-[70%]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime-400/30 to-transparent" />
        <div className="relative container mx-auto px-4 max-w-3xl text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}>
            <div className="flex justify-center -mb-2 sm:-mb-6"><Shuttle3D size={190} /></div>
            <FormantiIcon className="h-10 mx-auto mb-6 opacity-90" />
            <h2 className="font-heading font-black text-4xl md:text-6xl uppercase tracking-tighter text-white leading-[0.95] mb-5">
              Your next session<br /><span className="text-lime-400">can be your best one.</span>
            </h2>
            {/* No user counts here. We don't have a number worth printing and
                inventing one is how you earn a 1-star. */}
            <p className="text-zinc-400 text-base md:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
              Film 10–30 seconds today and see what our AI finds. No credit card, no app store —
              your first 2 analyses are on us.
            </p>
            <Button onClick={handleCTA} size="lg" data-testid="cta-bottom-btn" data-cta="final_analyze"
              className="w-full sm:w-auto bg-lime-400 text-black hover:bg-lime-300 font-bold uppercase tracking-wide px-10 py-6 text-base sm:text-lg rounded-full shadow-[0_0_30px_rgba(163,230,53,0.25)] hover:shadow-[0_0_45px_rgba(163,230,53,0.45)] hover:scale-[1.03] transition-all active:scale-95">
              Analyze my first clip, free <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
            <p className="mt-4 text-[15px] text-zinc-300">
              or <Link to="/practice" data-cta="final_practice" className="inline-flex items-center min-h-11 text-lime-300 font-semibold underline underline-offset-4 decoration-lime-400/50 hover:text-lime-200">try 10 minutes of live practice, free</Link>
            </p>
            <div className="mt-6 max-w-sm mx-auto">
              <QuickSignupCTA source="home" />
            </div>
          </motion.div>
        </div>
      </section>

      </main>

      {!isAuthenticated && (
        <StickyCta onClick={handleCTA} heroSelector="[data-testid='hero-cta-btn']" endSelectors={["[data-testid='cta-bottom-btn']", "[data-testid='home-video']", "footer"]} />
      )}

      {/* ============ FOOTER ============ */}
      <footer className="py-10 md:py-16 border-t border-zinc-800/50 bg-zinc-950">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Phones: one tap-to-open row per group (the open footer was a screen and a half). */}
          <div className="md:hidden mb-8">
            <div className="flex items-center gap-2 mb-4">
              <FormantiIcon className="h-5" />
              <span className="font-heading font-bold text-lg uppercase tracking-wide text-white">Formanti</span>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
              AI-powered sports coaching platform. Train smarter across every sport you love.
            </p>
            {FOOTER_COLS.map((c) => (
              <details key={c.title} className="group border-t border-zinc-800/70 last:border-b">
                <summary className="flex items-center justify-between min-h-12 py-3 cursor-pointer list-none text-white font-semibold text-sm uppercase tracking-wider">
                  {c.title}
                  <ChevronDown className="w-4 h-4 text-lime-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <ul className="pb-3 grid grid-cols-2 gap-x-4">
                  {c.links.map(([to, label]) => (
                    <li key={label}><Link to={to} className="text-zinc-300 hover:text-lime-400 text-sm transition-colors inline-flex items-center min-h-11">{label}</Link></li>
                  ))}
                </ul>
              </details>
            ))}
          </div>

          {/* md and up: four columns. */}
          <div className="hidden md:grid md:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <FormantiIcon className="h-5" />
                <span className="font-heading font-bold text-lg uppercase tracking-wide text-white">Formanti</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">
                AI-powered sports coaching platform. Train smarter across every sport you love.
              </p>
            </div>
            {FOOTER_COLS.map((c) => (
              <div key={c.title}>
                <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">{c.title}</h2>
                <ul className="space-y-1">
                  {c.links.map(([to, label]) => (
                    <li key={label}><Link to={to} className="text-zinc-400 hover:text-lime-400 text-sm transition-colors py-1 inline-block">{label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-zinc-800/50 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-zinc-500 text-xs">&copy; {new Date().getFullYear()} Formanti. All rights reserved.</p>
              <Link to="/privacy" className="text-zinc-400 hover:text-zinc-200 text-xs transition-colors py-2 inline-block">Privacy Policy</Link>
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
