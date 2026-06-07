# PostHog Reverse Proxy — Deployment Guide

Serves PostHog from a first-party subdomain (`ph.atheonics.com`) so ad-blockers
can't block `*.i.posthog.com`. Recovers ~10–25% of otherwise-dropped events.

Worker source: [`posthog-proxy.worker.js`](./posthog-proxy.worker.js)

**Prerequisite:** `atheonics.com` must be managed in Cloudflare DNS (it is — the
site runs on Cloudflare Pages). A Worker custom domain auto-creates the DNS record.

---

## Step 1 — Create the Worker

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it `posthog-proxy` → **Deploy** (it deploys a placeholder).
3. Click **Edit code**, delete the placeholder, and paste the entire contents of
   `cloudflare/posthog-proxy.worker.js`.
4. **Deploy**.

## Step 2 — Bind the subdomain `ph.atheonics.com`

1. In the Worker → **Settings** → **Domains & Routes** → **Add** → **Custom Domain**.
2. Enter `ph.atheonics.com` → **Add domain**.
   Cloudflare auto-creates the DNS record and TLS certificate (takes ~1–2 min).

## Step 3 — Verify the proxy works

Once the cert is issued, test it (browser or terminal):

```
https://ph.atheonics.com/static/array.js
```
- ✅ Returns JavaScript (the PostHog snippet bundle) → proxy is working.
- ❌ 522/525/SSL error → wait for the cert, or check the custom domain status.

You can also check ingestion:
```
https://ph.atheonics.com/decide/?v=3
```
should return JSON (not an error page).

## Step 4 — Tell Claude "proxy is live"

Once `ph.atheonics.com/static/array.js` returns JS, the last step is a one-line
change to the PostHog init in `public/index.html`:

```js
posthog.init("phc_t3XzfD9ATXMh9SUKDayEaf8Mubo9fsuRbpW6rb2e2pxW", {
    api_host: "https://ph.atheonics.com",   // was: https://eu.i.posthog.com
    ui_host: "https://eu.posthog.com",        // so dashboard links still point to PostHog
    person_profiles: "identified_only",
    session_recording: { recordCrossOriginIframes: true, capturePerformance: false },
});
```

Claude will make that change and push it (Cloudflare Pages redeploys ~2–3 min).

> **Order matters:** do NOT change `api_host` to `ph.atheonics.com` until the
> Worker + custom domain are live and Step 3 passes — otherwise events go to a
> domain that doesn't resolve yet and tracking breaks until the proxy exists.

---

## Notes
- The PostHog snippet derives its asset URL from `api_host`, so with
  `api_host: https://ph.atheonics.com` the bundle loads from
  `ph.atheonics.com/static/array.js`, which the Worker routes to `eu-assets`.
- `ui_host` keeps "view recording / open in PostHog" links pointing at the real
  PostHog UI (`eu.posthog.com`) instead of the proxy.
- Region is EU. If the PostHog project region ever changes, update `API_HOST` and
  `ASSET_HOST` in the Worker.
- When the in-progress `src/lib/analytics.js` (env-driven) becomes the single init
  path, set `REACT_APP_POSTHOG_HOST=https://ph.atheonics.com` and remove the
  hardcoded snippet from `index.html` to avoid double-init.
