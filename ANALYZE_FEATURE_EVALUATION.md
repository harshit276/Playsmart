# Atheonics — "Analyze" Feature Evaluation

**Tested live on https://atheonics.com using the Demo Account (5,000 tokens) — June 27, 2026.**
Two real badminton clips were run through the full Analyze flow, plus a code-level review of the upload + analysis pipeline.

---

## What I tested

| # | Input | Size / Length | Result |
|---|-------|---------------|--------|
| 1 | "How to improve SMASH" YouTube tutorial (as provided) | 9.2 MB · 17.5s · 1080p/60fps | ❌ **Stuck at 23% for 6+ minutes**, never completed |
| 2 | Same clip, trimmed to a clean single segment | 1.2 MB · 8s · 540p | ✅ **Completed in ~80s** with a full, accurate coach report |

The difference between the two is the **single most important finding** below.

---

## The headline problem: the upload can hang forever

Clip #1 (9.2 MB) sat at **23% / "Uploading your video…"** for over six minutes and never moved. Clip #2, which I made small enough (<2 MB) to bypass the upload path entirely, sailed through in ~80 seconds and produced an excellent result.

**Root cause (confirmed in code):** for any clip ≥2 MB, the browser uploads the file directly to Cloudinary via a raw `XMLHttpRequest` in `frontend/src/lib/cloudinaryUpload.js`. That request has:

- **no `xhr.timeout`**
- **no `ontimeout` handler**
- **no retry**
- **no abort / cancel path**

So if the upload stalls (flaky Wi-Fi, a dropped TCP connection, Cloudinary throttling), the request never errors and never resolves — the whole flow hangs at ~23% indefinitely. Meanwhile the UI reassures the user **"this won't fail silently"** and **"it'll finish on its own"** — which is the opposite of what actually happens. This is the worst kind of failure: invisible, unrecoverable, and on the very first step a new user hits.

This alone likely explains a large share of "I uploaded a video and nothing happened" drop-off.

---

## User perspective

### Pros
- **Onboarding is excellent.** "Try Demo Account (5,000 tokens, no signup)" is a frictionless way to experience the product. Dashboard, sport profile, and the "Run your first analysis" nudge are all clear.
- **The analysis output is genuinely impressive.** On the clean clip it correctly identified the sport (badminton, 90% confidence) and even understood the *context* — "a high hand-feeding drill designed to isolate and improve the player's overhead smash." It returned a level verdict (Advanced), best shot, what's-working, top fix, consistency %, tempo/recovery metrics, a detailed "Coach's Read," plus tabs for Shot Analysis, Rally Breakdown, Tactical Mistakes, Pro Comparison, Audio Coaching, a Metrics Dashboard, a downloadable PDF, and a "Talk to Virtual Coach" voice option. For 100 tokens (~₹20) this is a lot of value.
- **The player-picker is a standout.** "4 Players Detected" with plain-language descriptions ("black shirt with yellow sleeves, near court, left side") is a smart, accessible way to focus the analysis.
- **Progress UI looks polished** — staged SCAN → ANALYZE → COACH → SAVE, a percentage, elapsed timer, and a clear "you can leave, we'll notify you" milestone once work moves to the cloud.
- **Reassuring tone** during waits, and the "Notify me when ready" option is the right pattern for a slow job.

### Cons
1. **Upload can hang with no escape (critical).** See above. No timeout, no retry, no cancel button, no error. The user is simply stuck.
2. **The progress bar lies.** The percentage froze at 23% the entire time while flavor text ("Locating players in frame…", "Tracking court positions…") kept rotating. Those substep messages are purely cosmetic timers, not tied to real progress — so the user can't tell "slow but working" from "hung." There's no way to know it's dead.
3. **Real-world videos fail; only "ideal" clips succeed.** The clip the user actually provided (a normal 17s YouTube tutorial) failed, while a hand-trimmed, downscaled clip worked. Most users will bring exactly the kind of video that fails, then blame themselves.
4. **No "Cancel" / "Start over" during analysis.** Once it's running (or stuck), the only recourse is a manual page refresh.
5. **Inconsistent/duplicated controls.** On page load the two "Doubles Match" toggles showed **conflicting states** (top off, bottom on). They do sync once touched, but the initial mismatch is confusing. There are also two parallel navigation systems on the results page (a top tab bar *and* a right sidebar) with overlapping-but-different items.
6. **Misleading copy.** With singles mode selected, the wait message still said "busy doubles rallies are the slowest to analyze." Small, but it erodes trust during the most anxious moment.
7. **No upfront expectation-setting on size/length.** The dropzone says "up to a few minutes," but anything ≥2 MB routes through the fragile upload, and the "best results" tips (5–30s, side-angle) are below the fold.

---

## Developer perspective

### Pros
- **Thoughtful, well-commented pipeline.** The tiered upload logic (inline base64 <2 MB → Cloudinary original 2–130 MB → ffmpeg.wasm downscale >130 MB) is pragmatic, and the comments capture hard-won lessons (WebCodecs output being unanalyzable by Gemini, Cloudinary's synchronous-transform latency, WhatsApp codec quirks).
- **Sensible model choice.** Gemini Flash at 100 tokens is fast and cheap; a Premium (Gemini Pro, 250 tokens) tier exists for hard clips. Backend abstracts Gemini/Anthropic/OpenAI/local behind one interface.
- **Graceful-degradation mindset** elsewhere (e.g. Mongo stub so the app still boots, heuristic fallback when the model artifact is missing).
- **Strong result schema** — the output object is rich and drives a lot of UI from one analysis.

### Cons
1. **Upload XHR has zero resilience** (the critical bug). One `try/catch` around `xhr.onerror` is not enough — a *stall* is not an error.
2. **Progress is decoupled from reality.** `displayProgress` "creeps" toward a phase boundary on a 120 ms timer regardless of actual work, and substep hints are timer-driven. Good for perceived smoothness, bad for diagnosing hangs — and there's no client-side watchdog that surfaces "this is taking unusually long, retry?"
3. **`backend/server.py` is a 15.8k-line monolith** with ~130 routes — hard to test and maintain. The Analyze flow alone spans many endpoints (`/analyze-video-stream`, `/upload-video-url`, `/analyze-jobs/*`, player detection, etc.).
4. **Hardcoded secrets.** `CLOUDINARY_API_SECRET` (and key/cloud name) are committed as literal fallbacks in `server.py` with a `TODO: move to env`. These should be rotated and removed from source.
5. **No observability on the failure.** Because the stall is a silent client-side hang, there's likely no server log or error metric capturing it — so the team may not even see how often this happens.
6. **Token accounting is murky on the happy path.** The banner says "costs 100 tokens" but the demo balance stayed at 5,000 across analyses — either demo accounts don't deduct or the balance UI doesn't refresh. Worth confirming real accounts deduct/refresh correctly.

---

## Pricing observations
- **Free:** 300 tokens on signup = 3 lifetime analyses (Flash). Reasonable hook.
- **Per analysis:** Flash = 100 tokens (~₹20), Premium/Gemini Pro = 250 tokens (~₹50).
- **Packs:** 500 tokens / ₹99 ≈ ₹0.198/token.
- **Subscriptions:** Starter ₹199/mo (10 analyses), Pro ₹499/mo (20 mixed), Elite ₹1,499/mo (60 Premium).

The value-for-money on a *successful* analysis is high. The risk is that the **upload reliability problem destroys the value perception before the user ever sees it** — and a hung upload may still feel, to the user, like they "wasted" effort/tokens. Reliability is the highest-leverage thing to fix before any pricing optimization.

---

## Prioritized fix list (report-first — nothing changed yet)

**P0 — Reliability (do these first)**
1. Add a **timeout + `ontimeout` + automatic retry (with backoff)** to the Cloudinary upload XHR. A stalled upload should fail fast and retry, not hang.
2. Add a **stall watchdog**: if no upload progress for ~20–30s, show a real error with a **Retry** and **Cancel** button instead of the false "won't fail silently" message.
3. Add a **Cancel / Start over** control that's available during the entire analysis (including the stuck state).

**P1 — Honesty & expectation-setting**
4. Make the progress bar reflect **real** upload progress during the upload phase (it's already available via `xhr.upload.onprogress`), and stop the cosmetic creep from masking a stall.
5. Fix misleading copy (don't mention "doubles rallies" in singles mode); make wait messages reflect the actual selected mode.
6. Fix the **Doubles Match default-state mismatch** so both toggles agree on load.

**P2 — Robustness for real-world clips**
7. Pre-flight the file: if it's large/long/high-fps, **auto-downscale before upload** (or warn + offer auto-trim) so normal YouTube/phone clips don't hit the fragile path.
8. Consider de-duplicating the results-page navigation (one tab system, not two).

**P3 — Hygiene**
9. Move Cloudinary credentials to env vars and **rotate the exposed secret**.
10. Add client + server logging/metrics around upload failures so the hang is measurable.

---

## Suggested next step
The P0 upload fixes (timeout + retry + cancel + real progress) are tightly scoped to `cloudinaryUpload.js` and `AnalyzePage.jsx` and would address the highest-impact problem I found. Say the word and I'll implement them.

*Note: I focused depth on badminton (two clips) because the findings were strong and the upload bottleneck/pipeline are sport-agnostic. Happy to extend the live test to tennis or another sport on request.*
