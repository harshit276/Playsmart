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
  "/analyze": {
    title: "Free AI Sports Video Analysis - Upload & Get Feedback",
    description:
      "Upload a clip from your phone and get frame-by-frame technique feedback, shot-by-shot breakdown and drills to fix what is holding you back. Free to try.",
    h1: "Analyze Your Technique From Any Phone Video",
    blurb:
      "Record a rally, a serve, a delivery or a lift on any phone, upload it, and Formanti returns a shot-by-shot breakdown, a coach summary and the drills that fix your weakest link. No sensors, no wearables, no setup.",
    faqs: [
      ["What video do I need to upload?", "A 10-30 second clip filmed from the side or back of the court works best. Any modern phone camera is enough - no special equipment."],
      ["How long does analysis take?", "Most clips come back in under two minutes. You can close the tab while it runs; the analysis finishes on our servers."],
    ],
  },
  "/training": {
    title: "Personalized AI Training Plans for Your Sport",
    description:
      "Get a training plan built around your level, your goals and the time you actually have. Drills, progressions and weekly structure across badminton, tennis, cricket and more.",
    h1: "Training Plans Built Around Your Game",
    blurb:
      "Generic programs assume a player you are not. Formanti builds a weekly plan from your own analysis - your level, your weak links, and the hours you can genuinely commit - then adjusts as you improve.",
    faqs: [
      ["How is this different from a generic training plan?", "It starts from your own video analysis, so the drills target the specific technique gaps found in your footage rather than a generic curriculum."],
      ["How much time do I need per week?", "Plans scale from two short sessions a week upward. You set the time available and the plan is built to fit it."],
    ],
  },
  "/marketplace": {
    title: "Sports Equipment Finder - Rackets, Shoes & Gear Picks",
    description:
      "Find the right racket, shoes, rubbers or gear for your playing style, level and budget - matched by AI rather than sponsored rankings.",
    h1: "Find Equipment That Suits How You Actually Play",
    blurb:
      "Gear advice online is mostly affiliate rankings. Formanti matches rackets, shoes, strings and rubbers to your level, playing style and budget, using what your own analysis shows about your game.",
    faqs: [
      ["How are recommendations chosen?", "They are matched to your playing style, level and budget from your analysis - not ordered by commission."],
      ["Do I need an analysis first?", "No, you can browse by sport and budget. An analysis makes the match more specific to your technique."],
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

// Replace once, with a function so `$&`/`$1` inside article HTML stay literal.
function replaceOnce(html, re, replacement) {
  return html.replace(re, () => replacement);
}

// Swap the shell's homepage <head> tags for this page's. Shared by the
// landing pages and the blog so the two can never drift apart.
function renderMeta(template, { url, fullTitle, description }) {
  let html = template;
  // Guarded replacements - each only fires if its target exists; the file is
  // written regardless, so an explicit Vercel route to it can never 404.
  const swaps = [
    [/<title>[\s\S]*?<\/title>/, `<title>${esc(fullTitle)}</title>`],
    [/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(description)}" />`],
    [/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`],
    [/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`],
    [/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(fullTitle)}" />`],
    [/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`],
    [/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${esc(fullTitle)}" />`],
    [/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${esc(description)}" />`],
  ];
  for (const [re, out] of swaps) html = replaceOnce(html, re, out);
  return html;
}

function render(template, route, data) {
  const url = `${ORIGIN}${route}`;
  const fullTitle = `${data.title} | Formanti`;
  let html = renderMeta(template, { url, fullTitle, description: data.description });
  // Swap the homepage static fallback <main> for this page's content.
  html = replaceOnce(html, /<main[\s\S]*?<\/main>/, buildMain(data));
  return html;
}

/* ------------------------------------------------------------------ *
 * Blog articles.
 *
 * WHY THIS EXISTS: the 35 blog posts are served from the API, so before
 * this they had no static fallback at all — every /blog/<slug> fell
 * through vercel.json's catch-all to build/index.html and returned the
 * HOMEPAGE's title, description and body. To a crawler that is 35 URLs
 * of byte-identical duplicate content, which is worse than having no
 * blog: it buries the real articles and dilutes the domain. Most of the
 * badminton keyword coverage lives in those posts, which is why the
 * sports whose SEO rests on a landing page (cricket, basketball) were
 * the only ones showing up at all.
 *
 * The post bodies come from our own API at build time. That is a
 * network call inside the build, so it is written to degrade rather
 * than break: retries on the list, per-post failures isolated, and a
 * checked-in slug list (blogSlugs.json) as the floor. A file is ALWAYS
 * written for every known slug — vercel.json routes /blog/<slug>
 * straight at these files, so a missing one would 404 a live URL.
 * ------------------------------------------------------------------ */

const API = `${ORIGIN}/api`;
const SLUGS_FILE = path.join(__dirname, "blogSlugs.json");

function knownSlugs() {
  try {
    return JSON.parse(fs.readFileSync(SLUGS_FILE, "utf8"));
  } catch {
    return [];
  }
}

async function getJSON(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      // Generous timeout: this hits a cold serverless function.
      const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

// Strip tags for the meta description fallback / word count.
const stripTags = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function buildArticleMain(post) {
  const date = post.published_date || "";
  const meta = [date, post.read_time, post.sport].filter(Boolean).map(esc).join(" · ");
  // post.content is our own authored HTML — rendered as-is so the crawler
  // gets the real article, not a summary of it.
  return `<main style="max-width:760px;margin:0 auto;padding:48px 20px;font-family:Inter,system-ui,sans-serif;color:#e5e5e5;background:#0a0a0a;min-height:100vh">
                <p style="font-size:.85rem;color:#a3e635"><a href="/blog" style="color:#a3e635">&larr; Coaching guides &amp; blog</a></p>
                <h1 style="font-size:2rem;line-height:1.25;color:#fff">${esc(post.title)}</h1>
                <p style="font-size:.85rem;color:#9a9a9a">${meta}</p>
                <p style="font-size:1.05rem;color:#cfcfcf">${esc(post.description || "")}</p>
                <article style="line-height:1.8">${post.content || ""}</article>
                <p style="line-height:1.9;margin-top:32px"><a href="/analyze" style="color:#a3e635">Analyze your technique free</a> &middot; <a href="/training" style="color:#a3e635">Training plans</a> &middot; <a href="/marketplace" style="color:#a3e635">Equipment finder</a></p>
                <noscript><p style="color:#fbbf24">Enable JavaScript for the full interactive Formanti experience.</p></noscript>
            </main>`;
}

function articleSchema(post, url) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.published_date,
    dateModified: post.published_date,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "Formanti", url: ORIGIN },
    publisher: {
      "@type": "Organization",
      name: "Formanti",
      logo: { "@type": "ImageObject", url: OG_IMAGE },
    },
    keywords: (post.tags || []).join(", "),
    articleSection: post.category,
  });
}

function buildBlogIndexMain(posts) {
  // A real, crawlable link to every article — without this the posts are
  // reachable only through JS and the sitemap.
  const items = posts
    .map(
      (p) =>
        `<li style="margin-bottom:14px"><a href="/blog/${esc(p.id)}" style="color:#a3e635;font-weight:600">${esc(p.title)}</a><br><span style="color:#9a9a9a;font-size:.9rem">${esc(p.description || "")}</span></li>`
    )
    .join("");
  return `<main style="max-width:880px;margin:0 auto;padding:48px 20px;font-family:Inter,system-ui,sans-serif;color:#e5e5e5;background:#0a0a0a;min-height:100vh">
                <h1 style="font-size:2rem;line-height:1.2;color:#fff">Coaching Guides, Drills &amp; Gear Reviews</h1>
                <p style="font-size:1.05rem;color:#cfcfcf">Technique breakdowns, training plans and equipment guides for badminton, tennis, table tennis, cricket and more — written to be used on court, not just read.</p>
                <ul style="line-height:1.6;padding-left:18px">${items}</ul>
                <noscript><p style="color:#fbbf24">Enable JavaScript for the full interactive Formanti experience.</p></noscript>
            </main>`;
}

// Render one article page off the built index.html shell.
function renderArticle(template, post) {
  const url = `${ORIGIN}/blog/${post.id}`;
  const fullTitle = `${post.title} | Formanti`;
  const desc = post.description || stripTags(post.content).slice(0, 155);
  let html = renderMeta(template, { url, fullTitle, description: desc });
  html = replaceOnce(html, /<main[\s\S]*?<\/main>/, buildArticleMain(post));
  // Article structured data, injected just before </head>.
  html = replaceOnce(
    html,
    /<\/head>/,
    `<script type="application/ld+json">${articleSchema(post, url)}</script></head>`
  );
  return html;
}

async function buildBlog(template) {
  const outRoot = path.join(BUILD_DIR, "blog");
  const fallback = knownSlugs();
  let posts = [];

  try {
    const list = await getJSON(`${API}/blog`);
    posts = Array.isArray(list) ? list : list.posts || [];
  } catch (err) {
    console.warn(`[seo-fallbacks] blog list unavailable (${err.message}) — using ${fallback.length} checked-in slugs`);
  }

  const slugs = posts.length ? posts.map((p) => p.id) : fallback;
  const missing = fallback.filter((s) => !slugs.includes(s));
  if (posts.length && missing.length) {
    // The API dropped a slug we ship routes for; still write a page so the
    // URL does not start 404ing mid-deploy.
    console.warn(`[seo-fallbacks] ${missing.length} checked-in slug(s) absent from API: ${missing.join(", ")}`);
    slugs.push(...missing);
  }

  let ok = 0;
  for (const slug of slugs) {
    const outDir = path.join(outRoot, slug);
    fs.mkdirSync(outDir, { recursive: true });
    let html = template;
    try {
      const post = await getJSON(`${API}/blog/${slug}`, 2);
      if (!post || !post.title) throw new Error("empty post");
      html = renderArticle(template, { ...post, id: post.id || slug });
      ok++;
    } catch (err) {
      // Untouched shell: no worse than today, and the route still resolves.
      console.warn(`[seo-fallbacks] ✗ /blog/${slug} — ${err.message}`);
    }
    fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
  }

  // The listing page — the crawl path into all of the above.
  if (posts.length) {
    const url = `${ORIGIN}/blog`;
    const fullTitle = "Sports Coaching Guides, Drills & Gear Reviews | Formanti";
    const desc =
      "Technique guides, training drills and equipment reviews for badminton, tennis, table tennis, cricket and more — from the Formanti AI coaching team.";
    let html = renderMeta(template, { url, fullTitle, description: desc });
    html = replaceOnce(html, /<main[\s\S]*?<\/main>/, buildBlogIndexMain(posts));
    fs.mkdirSync(outRoot, { recursive: true });
    fs.writeFileSync(path.join(outRoot, "index.html"), html, "utf8");
  }

  console.log(`[seo-fallbacks] blog: ${ok}/${slugs.length} articles rendered with real content.`);
  writeSitemap(posts);
  if (ok === 0 && slugs.length) {
    // Every article fell back to the homepage shell. The deploy would ship
    // the exact duplicate-content bug this script exists to fix, so fail and
    // leave the previous deployment serving.
    console.error("[seo-fallbacks] blog API returned nothing — refusing to ship duplicate shells.");
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------------ *
 * sitemap.xml
 *
 * WHY GENERATED: the checked-in sitemap dated every URL to mid-July and
 * stayed there, so after the blog pages changed from homepage duplicates
 * into real articles the sitemap still told Google nothing had changed.
 * lastmod is a recrawl hint; a stale one asks a crawler to skip exactly
 * the pages that most need looking at again.
 *
 * NOT "today" on every build. A sitemap that claims every page changed
 * every deploy is noise, and Google learns to ignore lastmod entirely.
 * Instead each URL reports the later of its own content date and
 * TEMPLATE_REVISION - the date the served markup last materially changed.
 * Bump TEMPLATE_REVISION when the output actually changes; leave it alone
 * for code that does not alter what a crawler sees.
 * ------------------------------------------------------------------ */

// Last material change to the generated HTML these URLs serve.
const TEMPLATE_REVISION = "2026-08-30";

// Static routes: [path, changefreq, priority, content date]
const SITEMAP_STATIC = [
  ["/", "weekly", "1.0", TEMPLATE_REVISION],
  ["/analyze", "weekly", "0.9", TEMPLATE_REVISION],
  ["/demo", "monthly", "0.8", "2026-07-12"],
  ["/training", "weekly", "0.8", TEMPLATE_REVISION],
  ["/blog", "daily", "0.8", TEMPLATE_REVISION],
  ["/badminton", "weekly", "0.9", TEMPLATE_REVISION],
  ["/tennis", "weekly", "0.9", TEMPLATE_REVISION],
  ["/table-tennis", "weekly", "0.9", TEMPLATE_REVISION],
  ["/pickleball", "weekly", "0.8", TEMPLATE_REVISION],
  ["/cricket", "weekly", "0.9", TEMPLATE_REVISION],
  ["/swimming", "weekly", "0.8", TEMPLATE_REVISION],
  ["/football", "weekly", "0.8", TEMPLATE_REVISION],
  ["/basketball", "weekly", "0.8", TEMPLATE_REVISION],
  ["/gym", "weekly", "0.8", TEMPLATE_REVISION],
  ["/weight-lifting", "weekly", "0.8", TEMPLATE_REVISION],
  ["/physiotherapy", "weekly", "0.8", TEMPLATE_REVISION],
  ["/marketplace", "weekly", "0.7", TEMPLATE_REVISION],
  ["/pricing", "monthly", "0.7", "2026-07-08"],
  ["/download", "monthly", "0.6", "2026-07-08"],
  ["/help", "monthly", "0.5", "2026-07-08"],
  ["/contact", "monthly", "0.5", "2026-07-08"],
  ["/terms", "yearly", "0.3", "2026-07-08"],
  ["/refund", "yearly", "0.3", "2026-07-08"],
  ["/cancellation", "yearly", "0.3", "2026-07-08"],
  ["/shipping", "yearly", "0.3", "2026-07-08"],
];

const laterOf = (a, b) => (String(a || "") > String(b || "") ? a : b);

function writeSitemap(posts) {
  const rows = SITEMAP_STATIC.map(([loc, freq, pri, date]) => ({
    loc: `${ORIGIN}${loc === "/" ? "/" : loc}`,
    lastmod: date,
    freq,
    pri,
  }));

  // Articles carry their own publish date, floored at the template revision
  // because the markup they serve changed even when the words did not.
  const slugs = posts.length ? posts : knownSlugs().map((id) => ({ id }));
  for (const p of slugs) {
    rows.push({
      loc: `${ORIGIN}/blog/${p.id}`,
      lastmod: laterOf(p.published_date || "", TEMPLATE_REVISION),
      freq: "monthly",
      pri: "0.7",
    });
  }

  const body = rows
    .map(
      (r) =>
        `  <url>\n    <loc>${esc(r.loc)}</loc>\n    <lastmod>${r.lastmod}</lastmod>\n` +
        `    <changefreq>${r.freq}</changefreq>\n    <priority>${r.pri}</priority>\n  </url>`
    )
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

  fs.writeFileSync(path.join(BUILD_DIR, "sitemap.xml"), xml, "utf8");
  console.log(`[seo-fallbacks] sitemap.xml: ${rows.length} urls (revision ${TEMPLATE_REVISION}).`);
}

async function run() {
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
  await buildBlog(template);
  console.log(`[seo-fallbacks] done: ${ok}/${Object.keys(ROUTES).length} routes generated.`);
}

run();
