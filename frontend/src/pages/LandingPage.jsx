import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { motion, useReducedMotion } from "framer-motion";
import SEO from "@/components/SEO";
import DemoPhone from "@/components/DemoPhone";
import TestimonialsSection from "@/components/TestimonialsSection";
import {
  Play, ChevronRight, Sparkles, TrendingUp, Upload, ArrowRight,
  Crosshair, Repeat, Mic
} from "lucide-react";
import { FormantiIcon, FormantiLogo } from "@/components/FormantiLogo";
import { useEffect } from "react";
import demo from "@/data/demoAnalysis.json";
import samplePoster from "@/assets/demo/sample-badminton-poster.jpg";

// A lightweight, static taste of the REAL result — shown right on the home page
// so cold visitors see value before deciding to click through to the full
// interactive /demo. Pulls real fields from the same demoAnalysis.json the /demo
// page uses (no pose detection here — the heavy MatchInsights stays on /demo so
// the landing page loads fast on cheap phones). Everything is real sample data.
const PREVIEW_SHOTS = (demo.events || []).slice(0, 3).map((e) => ({
  t: `0:${String(Math.max(1, Math.round(e.timestamp_sec))).padStart(2, "0")}`,
  label: (e.shot_label || "Shot").replace(/\s+with\s+.*/i, ""), // trim "…with hip rotation"
  strength: (e.strengths && e.strengths[0]) || null,
  fix:
    (e.weaknesses && e.weaknesses[0] && !/^none/i.test(e.weaknesses[0])
      ? e.weaknesses[0]
      : e.tip) || null,
}));

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
  { step: "01", icon: Upload, title: "Film 10–30 seconds", desc: "Any phone, any angle where your body is clearly in frame. A rally or a couple of reps is plenty." },
  { step: "02", icon: Sparkles, title: "Get your one fix", desc: "Our AI breaks the clip down shot by shot and tells you what's working, what isn't, and what to fix first." },
  { step: "03", icon: TrendingUp, title: "Practise, then film again", desc: "Work the drills, film the same shot again, and see both sessions side by side." },
];

// The three features a player uses again after the first analysis. Each maps
// to shipped code: FormCompareView (pose correction), the compare-analyses
// flow (NextStepCard → /compare-analyses) and LiveVoiceCoach.
const KEY_FEATURES = [
  {
    icon: Crosshair,
    title: "Your pose, corrected",
    desc: "Your own body drawn next to the corrected position, joint by joint — not a pro video you can't copy.",
    note: "Racket and ball sports.",
  },
  {
    icon: Repeat,
    title: "Film again & compare",
    desc: "Practise the fix, film the same shot again, and see what actually changed: score, level, and each fix.",
  },
  {
    icon: Mic,
    title: "Ask the coach",
    desc: "Type or talk to a coach that has watched your clip. Ask why, ask how, ask what to drill next.",
  },
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
    a: "You can get started for free — new users get 3 free video analyses. After that, analyses come in affordable one-time packs that never expire. Browsing equipment recommendations and training content is free. See our Pricing page for details.",
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
  // Respect prefers-reduced-motion: same layout, no travel/fade.
  const reduceMotion = useReducedMotion();
  const rise = reduceMotion ? fadeUpStill : fadeUp;

  useEffect(() => {
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
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden pt-20 sm:pt-24 pb-12 sm:pb-16">
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

        <div className="relative z-10 container mx-auto px-4 max-w-6xl w-full">
          {/* Hero grid. Three blocks so MOBILE reads brand → hook → demo → CTA
              (a first-time ad visitor must see who we are and what they get
              before any scroll), while DESKTOP stays two columns with the demo
              spanning both rows on the right. */}
          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-y-5 lg:gap-x-12 lg:gap-y-0 items-center">

            {/* 1 — brand + headline */}
            <div className="order-1 w-full text-center lg:text-left lg:col-start-1 lg:row-start-1 lg:self-end">
              <motion.div initial="hidden" animate="visible" variants={rise}>
                <FormantiLogo className="h-8 sm:h-9 lg:h-11 mx-auto lg:mx-0 mb-4 lg:mb-5" markClassName="h-7 sm:h-8 lg:h-10"
                  textClassName="font-heading font-bold text-xl sm:text-2xl lg:text-3xl uppercase tracking-tight text-white" />
              </motion.div>

              <motion.h1 initial="hidden" animate="visible" custom={0.1} variants={rise}
                className="font-heading font-black text-[2.5rem] leading-[0.85] sm:text-6xl lg:text-7xl tracking-tighter uppercase" data-testid="hero-heading">
                <span className="block text-zinc-500 text-xl sm:text-3xl tracking-tight mb-1.5 sm:mb-3">Film one rally.</span>
                <span className="block text-white">Get coached</span>
                <span className="block neon-glow text-lime-400">like a pro.</span>
              </motion.h1>
            </div>

            {/* 2 — the demo, in a device frame (spans both rows on desktop) */}
            <motion.div initial="hidden" animate="visible" custom={0.35} variants={rise}
              className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 flex justify-center lg:justify-end lg:self-center">
              <DemoPhone />
            </motion.div>

            {/* 3 — pitch + CTA */}
            <div className="order-3 w-full text-center lg:text-left lg:col-start-1 lg:row-start-2 lg:self-start">
              {/* One sentence, visible on every screen size. The hero used to
                  stack a badge, sport pills, an install link and a four-stat
                  strip around the CTA; visitors couldn't tell what the product
                  does. Now it's: what you do, what you get, one button. */}
              <motion.p initial="hidden" animate="visible" custom={0.3} variants={rise}
                className="text-[15px] sm:text-lg text-zinc-300 max-w-xl mx-auto lg:mx-0 mb-4 sm:mb-6 mt-0 lg:mt-6 leading-snug sm:leading-relaxed" data-testid="hero-subtitle">
                {/* Phones get the short version so the button stays above the fold. */}
                <span className="sm:hidden">See your pose corrected and the one thing to fix first.</span>
                <span className="hidden sm:inline">
                  Film 10–30 seconds on your phone. Our AI finds every shot, shows your pose next to
                  the corrected one, and tells you the one thing to fix first.
                </span>
              </motion.p>

              <motion.div initial="hidden" animate="visible" custom={0.5} variants={rise}
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4">
                <Button onClick={handleCTA} size="lg" data-testid="hero-cta-btn"
                  className="w-full sm:w-auto max-w-[320px] bg-lime-400 text-black hover:bg-lime-300 font-bold uppercase tracking-wide px-8 sm:px-10 py-6 text-base sm:text-lg rounded-full shadow-[0_0_30px_rgba(163,230,53,0.25)] hover:shadow-[0_0_45px_rgba(163,230,53,0.45)] transition-all hover:scale-[1.03] active:scale-95">
                  Analyze my first clip <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
                <Button onClick={() => navigate("/demo")}
                  variant="ghost" size="lg"
                  className="w-full sm:w-auto max-w-[320px] text-zinc-300 hover:text-white bg-zinc-900/50 backdrop-blur-sm border border-zinc-700 hover:border-zinc-500 rounded-full px-8 py-6 text-base sm:text-lg transition-all">
                  <Play className="w-5 h-5 mr-1.5" /> See a real analysis
                </Button>
              </motion.div>

              <motion.p initial="hidden" animate="visible" custom={0.55} variants={rise}
                className="text-xs sm:text-sm text-lime-400/90 font-medium mt-3 lg:mt-4">
                3 free analyses when you sign up · no card needed
              </motion.p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ RESULT PREVIEW — a real result, right on the home page ==
          Cold ad traffic bounced off /analyze without ever seeing what the app
          produces. Rather than rely on them clicking "see a sample", we show a
          static taste of the REAL result here (clip + verdict + 3 real shot
          cards + coach line), then hand off to /demo for the full interactive
          version. Kept deliberately light — no pose detection on the landing
          page. All copy is real sample data; no provider named. */}
      <section className="relative py-16 md:py-24 bg-zinc-950 overflow-hidden">
        <div className="pointer-events-none absolute -right-40 top-0 w-[30rem] h-[30rem] bg-lime-400/[0.05] rounded-full blur-3xl" />
        <div className="relative container mx-auto px-4 max-w-4xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}
            className="mb-8 md:mb-10 text-center">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lime-400 text-black text-xs sm:text-sm font-black uppercase tracking-[0.15em] mb-4 shadow-[0_0_24px_rgba(163,230,53,0.35)]">
              <Sparkles className="w-3.5 h-3.5" /> See it first — real result
            </span>
            <h2 className="font-heading font-black text-4xl md:text-6xl tracking-tighter uppercase text-white leading-[0.95] mb-3">
              This is what you<br />get back.
            </h2>
            <p className="text-zinc-400 text-base md:text-lg max-w-xl mx-auto">
              A real result our AI produced from one short clip — every shot found,
              timed, and coached. Here's a taste; the full interactive version is one tap away.
            </p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}
            className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-4 sm:p-6 md:p-8">
            {/* Clip + verdict */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              {/* Poster image, NOT an autoplaying video — the hero already
                  carries a video, and a second ~1.3MB autoplay clip here was
                  roughly doubling mobile page weight and driving ad-click
                  bounces. Tapping opens the full interactive result on /demo. */}
              <Link to="/demo" className="group relative block rounded-2xl overflow-hidden border border-zinc-800 bg-black aspect-video">
                <img src={samplePoster} alt="Sample badminton analysis" loading="lazy"
                  className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="w-12 h-12 rounded-full bg-lime-400/90 group-hover:bg-lime-400 flex items-center justify-center shadow-lg shadow-lime-400/30 transition-transform group-hover:scale-105">
                    <Play className="w-5 h-5 text-black ml-0.5" fill="currentColor" />
                  </span>
                </div>
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-0.5 flex items-center gap-1">
                  <Play className="w-3 h-3 text-lime-400" />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-white">Sample clip</span>
                </div>
              </Link>
              <div className="rounded-2xl border border-lime-400/25 bg-gradient-to-br from-lime-400/10 to-zinc-900 p-4 flex flex-col justify-center gap-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <Sparkles className="w-4 h-4 text-lime-400" />
                  <span className="text-[10px] uppercase tracking-wider text-lime-300 font-bold">Detected</span>
                </div>
                <p className="font-heading font-black text-2xl md:text-3xl text-white capitalize leading-none">
                  {demo.sport_detected || "Badminton"}
                </p>
                <p className="text-zinc-400 text-sm">
                  Skill read: <span className="text-white font-semibold">{demo.overall_skill_level}</span>
                </p>
                <p className="text-zinc-400 text-sm">
                  <span className="text-white font-semibold">{(demo.events || []).length}</span> shots detected + timed
                </p>
              </div>
            </div>

            {/* 3 real shot cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {PREVIEW_SHOTS.map((s, i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-heading font-bold text-sm text-white truncate">{s.label}</span>
                    <span className="font-mono text-[10px] text-lime-400/70 shrink-0 ml-2">{s.t}</span>
                  </div>
                  {s.strength && (
                    <p className="text-[12px] text-zinc-300 leading-snug mb-1.5">
                      <span className="text-lime-400 font-bold">✓ </span>{s.strength}
                    </p>
                  )}
                  {s.fix && (
                    <p className="text-[12px] text-zinc-400 leading-snug">
                      <span className="text-amber-400 font-bold">→ </span>{s.fix}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Coach line */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 mb-6 flex gap-3">
              <span className="text-[10px] uppercase tracking-wider text-lime-300 font-bold shrink-0 pt-0.5">Coach</span>
              <p className="text-[13px] text-zinc-200 leading-relaxed">{demo.coach_narrative?.takeaway}</p>
            </div>

            {/* Hand off to the full interactive demo */}
            <div className="text-center">
              <Link to="/demo"
                className="inline-flex items-center justify-center gap-2 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-full px-6 py-3 text-sm shadow-[0_0_24px_rgba(190,242,100,0.25)] transition-colors">
                Open the full interactive analysis <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-[11px] text-zinc-500 mt-3">
                Shot-by-shot breakdown · coach chat · downloadable PDF — no signup to look.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ============ HOW IT WORKS — SECTION 3: how to run an analysis ======= */}
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

      {/* ============ KEY FEATURES — the three things people come back for ==
          Replaces a ten-feature showcase. Listing everything made the page
          read as a pile of features with no point; these three are what a
          player uses again after the first analysis. The rest is one line. */}
      <section id="features" data-testid="features-section" className="relative py-16 md:py-24 bg-zinc-900/40 border-y border-zinc-800/50">
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise}
            className="max-w-2xl mb-10">
            <span className="inline-flex items-center gap-2 text-lime-400 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
              <span className="w-8 h-px bg-lime-400/60" /> Why players come back
            </span>
            <h2 className="font-heading font-black text-4xl md:text-5xl tracking-tighter uppercase text-white leading-[0.95]">
              See it. Fix it.<br />Prove it.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {KEY_FEATURES.map((f, i) => (
              <motion.div key={f.title} initial="hidden" whileInView="visible" custom={i}
                viewport={{ once: true }} variants={rise}
                className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-900/40 p-6">
                <div className="w-11 h-11 rounded-xl bg-lime-400/10 border border-lime-400/25 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-lime-400" strokeWidth={1.75} />
                </div>
                <h3 className="font-heading font-bold text-xl text-white tracking-tight mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
                {f.note && <p className="text-zinc-600 text-[11px] mt-3">{f.note}</p>}
              </motion.div>
            ))}
          </div>

          <p className="text-zinc-500 text-sm mt-6">
            Every analysis also includes drills for your weak points, a PDF coach report, and gear
            matched to your level and budget.
          </p>
        </div>
      </section>

      {/* (Walkthrough demo now lives in the hero — see DemoPhone in the hero.) */}

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
              Pick your sport
            </h2>
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
          </div>

          {/* Gym, lifting and physio: linked, with the scope stated in one
              line. Lifting gets form feedback, not measured joint angles —
              over-claiming here is exactly what earns a 1-star. */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-zinc-500 text-sm mr-1">Also:</span>
            {MORE_ACTIVITIES.map((a) => (
              <Link key={a.key} to={a.path}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-950/60 border border-zinc-700 hover:border-lime-400/50 text-zinc-200 hover:text-white text-sm font-medium transition-all">
                <span>{a.emoji}</span> {a.label}
              </Link>
            ))}
          </div>
          <p className="mt-3 text-zinc-600 text-xs leading-relaxed max-w-2xl">
            Gym and lifting get overall form feedback; the pose tracker with measured angles is for the sports above.
          </p>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      {/* Renders nothing until PLACEHOLDER_TESTIMONIALS has real, approved
          user quotes — see the constant definition above for why. */}
      <TestimonialsSection testimonials={PLACEHOLDER_TESTIMONIALS} />

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
              Film 10–30 seconds today and see what our AI finds. No credit card, no app store —
              your first 3 analyses are on us.
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
                <li><Link to="/pricing" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Pricing</Link></li>
                <li><Link to="/download" className="text-zinc-500 hover:text-lime-400 text-sm transition-colors">Install the App</Link></li>
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
