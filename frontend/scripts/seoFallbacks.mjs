/**
 * Deterministic SEO fallback generator for Formanti's static landing pages.
 *
 * WHY: the app is a client-rendered CRA SPA. Vercel serves the SAME
 * build/index.html for every route, whose static fallback describes the
 * HOMEPAGE — so crawlers/social scrapers that don't run JS see homepage
 * content (wrong <title>, <h1>, meta) on /badminton, /tennis, etc. Googlebot
 * renders JS and eventually sees the real page, but Bing, LLM crawlers and
 * link-preview bots do not.
 *
 * WHAT: after `craco build`, for each landing route this writes
 * build/<route>/index.html — a copy of the built index.html with the
 * <title>, <meta description>, <link canonical>, Open Graph tags and the
 * static <main> fallback body swapped for that page's real, crawlable content.
 * The React bundle (same hashed <script> tags, inherited from index.html)
 * still mounts over it, so users get the full interactive app.
 *
 * WHY NOT puppeteer: the previous prerender.mjs launched headless Chromium,
 * which is unreliable in Vercel's static-build container and cannot render the
 * API-driven blog. This script is pure Node string templating — no browser, no
 * network — so it runs deterministically in any CI. It ALWAYS writes a file per
 * route (even if a replacement silently no-ops), so the explicit Vercel routes
 * that serve these files can never 404.
 *
 * Vercel serves these via explicit routes in vercel.json (see the
 * "/frontend/<route>/index.html" entries). Keep ROUTES and those in sync.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(__dirname, "..", "build");
const ORIGIN = "https://www.formanti.com";
const OG_IMAGE = `${ORIGIN}/icons/og-card.svg`;

// Shared "What you get" block — identical across sports, keeps authoring light.
const WHAT_YOU_GET = [
  "AI video analysis — frame-by-frame technique feedback from any phone clip.",
  "Personalized training plans for your level, goals and available time.",
  "Smart equipment recommendations tuned to your style and budget.",
  "Progress tracking with stats and skill charts over time.",
];

// Per-route SEO content. Titles ~50-60 chars, descriptions ~150-160 chars.
const ROUTES = {
  "/badminton": {
    title: "AI Badminton Coach - Video Analysis & Training App",
    description:
      "Free AI badminton coach: analyze smash speed, get shot classification, personalized training plans and racket recommendations. Upload any video and improve fast.",
    h1: "AI Badminton Coach — Analyze Your Game",
    blurb:
      "Upload a rally from the back of the court and Formanti's AI classifies every shot, estimates your smash speed, and gives drills to improve — no sensors needed.",
    faqs: [
      ["How fast is a professional badminton smash?", "Pros smash at 350-420 km/h; recreational players 100-200 km/h. Formanti estimates your smash speed straight from footage."],
      ["Can I analyze my badminton game with just a phone?", "Yes — record any rally on your phone, upload it, and the AI badminton coach classifies shots and suggests drills."],
    ],
  },
  "/tennis": {
    title: "AI Tennis Coach - Serve & Stroke Video Analysis",
    description:
      "Free AI tennis coach: analyze your serve, forehand and backhand from video, get personalized training plans and racquet recommendations. Improve your technique fast.",
    h1: "AI Tennis Coach — Analyze Your Strokes",
    blurb:
      "Upload a clip of your serve or groundstrokes and Formanti breaks down your technique frame by frame, then builds a training plan to fix what's holding you back.",
    faqs: [
      ["Can AI analyze my tennis serve?", "Yes — upload a serve clip and Formanti reviews your toss, trophy position, contact point and follow-through with specific fixes."],
      ["What racquet should a beginner buy?", "Look for a light, forgiving frame with a larger head. Formanti's AI equipment finder matches racquets to your style and budget."],
    ],
  },
  "/table-tennis": {
    title: "AI Table Tennis Coach - Serve, Spin & Stroke Analysis",
    description:
      "Free AI table tennis coach: analyze your serve, spin, forehand and backhand from video, get training plans and rubber/blade recommendations. Improve your game fast.",
    h1: "AI Table Tennis Coach — Analyze Your Strokes",
    blurb:
      "Upload a clip and Formanti reviews your stroke mechanics, spin and footwork, then recommends drills and the right rubbers and blade for your style.",
    faqs: [
      ["Can AI help my table tennis technique?", "Yes — upload a rally and the AI breaks down your strokes, spin and positioning with targeted improvement tips."],
      ["How do I choose a table tennis rubber?", "Match rubber speed and spin to your playing style. Formanti's equipment finder suggests rubbers and blades for your level."],
    ],
  },
  "/pickleball": {
    title: "AI Pickleball Coach - Technique & Strategy Analysis",
    description:
      "Free AI pickleball coach: analyze your dinks, serves and volleys from video, get beginner-friendly training plans and paddle recommendations. Start improving today.",
    h1: "AI Pickleball Coach — Analyze Your Game",
    blurb:
      "Upload a clip and Formanti reviews your technique and shot selection, then builds a beginner-friendly plan and recommends a paddle that fits your style.",
    faqs: [
      ["Is Formanti good for pickleball beginners?", "Yes — it explains technique and strategy in plain language and builds a step-by-step plan from any phone video."],
      ["What paddle should a new player use?", "Start with a mid-weight, balanced paddle. Formanti's AI equipment finder narrows it to your grip, style and budget."],
    ],
  },
  "/cricket": {
    title: "AI Cricket Coach - Batting & Bowling Video Analysis",
    description:
      "Free AI cricket coach: analyze your batting stance, shots and bowling action from video, get training plans and gear recommendations. Improve your cricket technique fast.",
    h1: "AI Cricket Coach — Analyze Your Technique",
    blurb:
      "Upload a batting or bowling clip and Formanti breaks down your technique frame by frame, then builds drills to sharpen your shots or bowling action.",
    faqs: [
      ["Can AI analyze my batting technique?", "Yes — upload a clip and Formanti reviews your stance, backlift, footwork and shot execution with specific fixes."],
      ["Does it work for bowling too?", "Yes — it analyzes your run-up, load-up and release to help you build a smoother, more repeatable action."],
    ],
  },
  "/swimming": {
    title: "AI Swimming Coach - Stroke Technique Analysis",
    description:
      "Free AI swimming coach: analyze your freestyle and stroke technique from video, get personalized training plans and drills. Improve your efficiency and speed in the water.",
    h1: "AI Swimming Coach — Analyze Your Stroke",
    blurb:
      "Upload a clip of your stroke and Formanti reviews your body position, catch and timing, then recommends drills to swim more efficiently.",
    faqs: [
      ["Can AI analyze my swimming stroke?", "Yes — upload pool footage and Formanti reviews your body position, catch, pull and kick timing with targeted drills."],
      ["Which strokes are supported?", "Freestyle and the core strokes, with technique feedback and drills tailored to what your video shows."],
    ],
  },
  "/football": {
    title: "AI Football Coach - Dribbling & Shooting Analysis",
    description:
      "Free AI football coach: analyze your dribbling, shooting and ball control from video, get personalized training plans and drills. Improve your football skills fast.",
    h1: "AI Football Coach — Analyze Your Skills",
    blurb:
      "Upload a clip and Formanti breaks down your dribbling, shooting form and ball control, then builds drills to level up your technique.",
    faqs: [
      ["Can AI analyze my football technique?", "Yes — upload a clip and Formanti reviews your dribbling, striking technique and control with specific improvement tips."],
      ["Do I need special equipment?", "No — any phone video works. Record a drill or small-sided game and upload it to get feedback."],
    ],
  },
  "/basketball": {
    title: "AI Basketball Coach - Shooting Form Analysis",
    description:
      "Free AI basketball coach: analyze your shooting form, dribbling and vertical from video, get personalized training plans and drills. Improve your basketball game fast.",
    h1: "AI Basketball Coach — Analyze Your Game",
    blurb:
      "Upload a clip and Formanti reviews your shooting form, release and mechanics frame by frame, then builds drills to make your shot more consistent.",
    faqs: [
      ["Can AI fix my shooting form?", "Yes — upload a shooting clip and Formanti reviews your base, elbow alignment, release and follow-through with specific fixes."],
      ["Does it help with dribbling too?", "Yes — it analyzes handle and footwork from video and suggests drills to tighten your control."],
    ],
  },
  "/gym": {
    title: "AI Gym Form Checker - Workout Technique Analysis",
    description:
      "Free AI gym form checker: analyze your squat, deadlift, bench and other lifts from video to fix technique and train safely. Get personalized workout feedback fast.",
    h1: "AI Gym Form Checker — Analyze Your Lifts",
    blurb:
      "Upload a clip of your lift and Formanti checks your form frame by frame — depth, bar path, alignment — so you can train harder while staying injury-free.",
    faqs: [
      ["Can AI check my gym form?", "Yes — upload a set and Formanti reviews your technique on squats, deadlifts, presses and more with specific corrections."],
      ["Will it help me avoid injury?", "Good form is the foundation of safe training. Formanti flags common breakdowns so you can fix them early."],
    ],
  },
  "/weight-lifting": {
    title: "AI Weightlifting Coach - Lifting Technique Analysis",
    description:
      "Free AI weightlifting coach: analyze your snatch, clean & jerk and barbell lifts from video to fix technique and lift safely. Get personalized feedback and drills fast.",
    h1: "AI Weightlifting Coach — Analyze Your Lifts",
    blurb:
      "Upload a clip and Formanti breaks down your bar path, positions and timing frame by frame, then recommends drills to build cleaner, stronger lifts.",
    faqs: [
      ["Can AI analyze my Olympic lifts?", "Yes — upload a snatch or clean & jerk and Formanti reviews your pull, turnover and receiving position with targeted cues."],
      ["Do I need a coach as well?", "Formanti gives instant, objective feedback between sessions; it complements, not replaces, hands-on coaching."],
    ],
  },
  "/physiotherapy": {
    title: "AI Physiotherapy Tracker - Exercise Form Analysis",
    description:
      "Free AI physiotherapy tracker: analyze rehab exercise form from video, track reps and progress, and stay consistent with your recovery plan. Get objective feedback fast.",
    h1: "AI Physiotherapy Tracker — Analyze Your Exercises",
    blurb:
      "Upload a clip of your rehab exercises and Formanti reviews your form and range of motion, helping you stay consistent and progress safely between sessions.",
    faqs: [
      ["Can AI track my physio exercises?", "Yes — upload a clip and Formanti reviews your form and range of motion so you can perform your program correctly."],
      ["Does this replace my physiotherapist?", "No — it supports your recovery between appointments with objective feedback. Always follow your clinician's guidance."],
    ],
  },
};

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildMain(data) {
  const bullets = WHAT_YOU_GET.map((b) => `<li>${esc(b)}</li>`).join("");
  const faqs = (data.faqs || [])
    .map(([q, a]) => `<h3 style="color:#fff;font-size:1rem">${esc(q)}</h3><p>${esc(a)}</p>`)
    .join("");
  return `<main style="max-width:880px;margin:0 auto;padding:48px 20px;font-family:Inter,system-ui,sans-serif;color:#e5e5e5;background:#0a0a0a;min-height:100vh">
                <h1 style="font-size:2rem;line-height:1.2;color:#fff">${esc(data.h1)}</h1>
                <p style="font-size:1.05rem;color:#cfcfcf">${esc(data.blurb)}</p>
                <h2 style="color:#fff;margin-top:32px">What you get</h2>
                <ul style="line-height:1.9">${bullets}</ul>
                <p style="line-height:1.9"><a href="/analyze" style="color:#a3e635">Analyze a video</a> · <a href="/training" style="color:#a3e635">Training plans</a> · <a href="/marketplace" style="color:#a3e635">Equipment</a> · <a href="/blog" style="color:#a3e635">Coaching guides &amp; blog</a></p>
                ${faqs ? `<h2 style="color:#fff;margin-top:32px">Frequently asked questions</h2>${faqs}` : ""}
                <noscript><p style="color:#fbbf24">Enable JavaScript for the full interactive Formanti experience.</p></noscript>
            </main>`;
}

function render(template, route, data) {
  const url = `${ORIGIN}${route}`;
  const fullTitle = `${data.title} | Formanti`;
  let html = template;

  // Guarded replacements — each only fires if its target exists; the file is
  // written regardless, so an explicit Vercel route to it can never 404.
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(fullTitle)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/>/,
    `<meta name="description" content="${esc(data.description)}" />`
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${url}" />`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${url}" />`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${esc(fullTitle)}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${esc(data.description)}" />`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${esc(fullTitle)}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${esc(data.description)}" />`
  );
  // Swap the homepage static fallback <main> for this page's content.
  html = html.replace(/<main[\s\S]*?<\/main>/, buildMain(data));
  return html;
}

function run() {
  const indexPath = path.join(BUILD_DIR, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error("[seo-fallbacks] build/index.html not found — run `craco build` first.");
    process.exit(1);
  }
  const template = fs.readFileSync(indexPath, "utf8");

  let ok = 0;
  for (const [route, data] of Object.entries(ROUTES)) {
    try {
      const outDir = path.join(BUILD_DIR, route);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "index.html"), render(template, route, data), "utf8");
      console.log(`[seo-fallbacks] ✓ ${route}`);
      ok++;
    } catch (err) {
      console.warn(`[seo-fallbacks] ✗ ${route} — ${err.message}`);
      // Best-effort: still write the untouched template so the route never 404s.
      try {
        const outDir = path.join(BUILD_DIR, route);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, "index.html"), template, "utf8");
      } catch { /* ignore */ }
    }
  }
  console.log(`[seo-fallbacks] done: ${ok}/${Object.keys(ROUTES).length} routes generated.`);
}

run();
