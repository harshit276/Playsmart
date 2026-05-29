/**
 * Static prerenderer for AthlyticAI's public routes.
 *
 * WHY: the app is a client-side React SPA — `build/index.html` is an empty
 * shell, so search engines and social scrapers see no content. react-snap was
 * evaluated and FAILS here (its bundled puppeteer@1.x Chromium can't parse the
 * React 19 bundle — see package.json `_reactSnapNote`). This script uses the
 * modern puppeteer@24 (already a devDependency) to render each public route to
 * real HTML written next to the SPA bundle, so crawlers get full content while
 * users still rehydrate into the live app.
 *
 * USAGE:  node scripts/prerender.mjs        (run AFTER `craco build`)
 *         npm run build:prerender           (build + prerender in one step)
 *
 * NOTE: prerendered pages render with the React app's `data-render` attr left
 * as set in index.html ("fallback"); src/index.js therefore re-mounts with
 * createRoot rather than hydrating. That's intentional and safe — the win is
 * the crawlable HTML in the served file. For zero-flash hydration, migrate the
 * content surface to Next.js (see seo/technical_seo_implementation.md Option A).
 */
import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(__dirname, "..", "build");
const PORT = 8745;

// Public, indexable routes only. Keep in sync with the sitemap.
// (Auth/dashboard/utility routes are intentionally excluded.)
const ROUTES = [
  "/",
  "/blog",
  "/badminton",
  "/tennis",
  "/table-tennis",
  "/pickleball",
  "/cricket",
  "/swimming",
  "/football",
  "/training",
  "/pricing",
  "/privacy",
  "/download",
  "/help",
];

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".map": "application/json",
};

// Minimal static file server with SPA fallback to index.html.
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      let filePath = path.join(BUILD_DIR, urlPath);
      if (!path.extname(filePath)) {
        // No extension → either a static index or an SPA route → serve index.html
        const asIndex = path.join(filePath, "index.html");
        filePath = existsSync(asIndex) ? asIndex : path.join(BUILD_DIR, "index.html");
      }
      if (!existsSync(filePath)) filePath = path.join(BUILD_DIR, "index.html");
      const type = MIME[path.extname(filePath)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function run() {
  if (!existsSync(path.join(BUILD_DIR, "index.html"))) {
    console.error("[prerender] build/index.html not found — run `craco build` first.");
    process.exit(1);
  }

  const server = await startServer();
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let ok = 0;
  for (const route of ROUTES) {
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${PORT}${route}`, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      // Wait until React has mounted real content into #root.
      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return root && root.innerText && root.innerText.trim().length > 50;
        },
        { timeout: 15000 }
      );
      const html = await page.content();
      const outDir =
        route === "/" ? BUILD_DIR : path.join(BUILD_DIR, route);
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");
      console.log(`[prerender] ✓ ${route}  (${(html.length / 1024).toFixed(0)} kB)`);
      ok++;
    } catch (err) {
      console.warn(`[prerender] ✗ ${route} — ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.close();
  console.log(`[prerender] done: ${ok}/${ROUTES.length} routes rendered.`);
  if (ok === 0) process.exit(1);
}

run().catch((err) => {
  console.error("[prerender] fatal:", err);
  process.exit(1);
});
