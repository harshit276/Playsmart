/**
 * PostHog reverse proxy — Cloudflare Worker for Atheonics.
 *
 * WHY: ad-blockers block requests to *.i.posthog.com, silently dropping
 * ~10–25% of analytics events. Serving PostHog from a first-party subdomain
 * (ph.atheonics.com) routes data through our own domain so it isn't blocked.
 *
 * ROUTES:
 *   /static/*        -> eu-assets.i.posthog.com   (array.js, recorder bundle, etc.)
 *   everything else  -> eu.i.posthog.com          (event ingestion, /decide, /e, etc.)
 *
 * DEPLOY: see cloudflare/POSTHOG_REVERSE_PROXY.md
 *
 * After this Worker is live on https://ph.atheonics.com, the PostHog init in
 * public/index.html must use:
 *   api_host: "https://ph.atheonics.com"
 *   ui_host:  "https://eu.posthog.com"
 *
 * EU PostHog hosts are hardcoded — change only if the PostHog project region changes.
 */
const API_HOST = "eu.i.posthog.com";
const ASSET_HOST = "eu-assets.i.posthog.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathWithParams = url.pathname + url.search;
    if (url.pathname.startsWith("/static/")) {
      return retrieveStatic(request, pathWithParams, ctx);
    }
    return forwardRequest(request, pathWithParams);
  },
};

// Static assets (JS bundles) — cache at the edge so we don't re-fetch every load.
async function retrieveStatic(request, pathWithParams, ctx) {
  let response = await caches.default.match(request);
  if (!response) {
    response = await fetch(`https://${ASSET_HOST}${pathWithParams}`);
    ctx.waitUntil(caches.default.put(request, response.clone()));
  }
  return response;
}

// Event ingestion + API — forward verbatim, strip the cookie header for privacy.
async function forwardRequest(request, pathWithParams) {
  const originRequest = new Request(request);
  originRequest.headers.delete("cookie");
  return await fetch(`https://${API_HOST}${pathWithParams}`, originRequest);
}
