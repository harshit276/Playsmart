# CLAUDE.md — Atheonics project guide & session handoff

> Claude Code auto-loads this file as project memory. It onboards you on the
> codebase, how to build/deploy, the gotchas, and the work-in-progress from the
> prior Cowork session. Trim the "Session handoff" section once it's stale.

---

## 1. What Atheonics is

AI multi-sport coaching web/mobile app (DB name `athlyticai`, domain
**atheonics.com**). Upload a short clip → Gemini analyzes technique → per-shot
feedback, coach narrative, drills, equipment picks, progress tracking. Sports:
badminton (primary), tennis, table tennis, pickleball, cricket, swimming,
football, basketball.

**Stack**
- **Backend:** FastAPI monolith `backend/server.py` (~15.9k lines, ~130 routes),
  MongoDB (Motor), JWT/Firebase/OTP auth. Deployed serverless on Vercel via
  `api/index.py` (exposes the FastAPI `app`).
- **Frontend:** React (CRA + CRACO), React Router, Tailwind + Radix, Firebase,
  recharts, framer-motion. Wrapped as an Android app via **Capacitor**
  (`frontend/android/`, appId `com.atheonics.app`). PWA + push.
- **AI:** Gemini (default `gemini-3.5-flash` via `GEMINI_MODEL`) for video
  analysis; `ai_pipeline/` has a pose/TCN fallback. Coach text uses
  `gemini-2.5-flash`. VLM layer in `backend/ai_pipeline/vlm/`.

Key frontend files: `src/pages/AnalyzePage.jsx` (the analyze flow, ~6k lines),
`src/lib/cloudinaryUpload.js`, `src/lib/webcodecsTranscode.js`,
`src/lib/videoRotation.js`, `src/pages/ProgressPage.jsx`,
`src/components/LiveVoiceCoach.jsx`.

---

## 2. Build & deploy

- Frontend build: `cd frontend && npm run build` (script is `CI=false craco build`).
  ⚠️ On **Windows cmd** the `CI=false craco build` form fails ("'CI' is not
  recognized"); call the local binary instead: `set "CI=false"` then
  `node_modules\.bin\craco.cmd build`. (`deploy.bat` already does this.)
- **`deploy.bat`** (repo root) is the one-click deploy: clears any stale git
  lock, sets git identity if missing, builds, commits the changed files, and
  pushes to the branch set at the top (`BRANCH=...`). Push → Vercel auto-builds.
- Vercel project: `athlyticai` (team `harshit276s-projects`), git repo
  `github.com/harshit276/Playsmart`. **Plan: Hobby.** `vercel.json` sets the
  Python function `maxDuration: 300`.
- **Branches:** production is `main` (→ atheonics.com). Current WIP is on
  **`fix/upload-resilience`** (deployed only to Vercel *preview* URLs so far —
  NOT yet merged to `main`, so atheonics.com still runs the old code).

### Environment gotchas (important)
- **Repo lives in OneDrive** → two recurring problems: (a) stale
  `.git/index.lock` ("another git process is running") — delete the lock;
  (b) the whole working tree shows as modified because files are **CRLF** on
  disk while committed blobs are **LF** — use `git diff --ignore-cr-at-eol` to
  see real changes. Consider moving the repo out of OneDrive.
- **Env vars (Vercel):** `MONGO_URL`, `DB_NAME=athlyticai`, `GEMINI_API_KEY`,
  optional `GROQ_API_KEY` (coach), `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`
  (now **env-only** — see §4), TTS keys (`SARVAM_API_KEY`/`ELEVENLABS_API_KEY`),
  Razorpay keys. Coach model override: `GEMINI_COACH_MODEL`.

---

## 3. Session handoff — what changed and why (branch `fix/upload-resilience`)

A prior Cowork session evaluated the Analyze feature and other features live,
then made these changes. Most are committed on `fix/upload-resilience`; the
**last round (coach fixes, portrait, >150 MB guard, duplicate-sports) may still
be uncommitted in the working tree — run `deploy.bat` to commit+push.**

**Upload reliability (`cloudinaryUpload.js`, `AnalyzePage.jsx`)**
- Cloudinary upload XHR had **no timeout/retry** → a stalled upload hung forever
  at "23%". Added a stall-watchdog (25s), retry w/ backoff, `AbortSignal`.
- Added a **"Cancel and start over"** control during analysis (works on a stuck
  upload — validated live).
- Honest, mode-aware progress copy (no false "won't fail silently").

**Upload speed — on-device transcode (`webcodecsTranscode.js`, `cloudinaryUpload.js`)**
- Re-enabled the hardware **WebCodecs → 720p H.264** transcode (Mediabunny) to
  shrink big uploads. Set `fastStart:'in-memory'` (moov at front, so Gemini can
  decode), `QUALITY_HIGH`, `frameRate:30`, `hardwareAcceleration:'prefer-hardware'`,
  `allowRotationMetadata:false` (bakes rotation → portrait clips work), and a
  **decode-verify** step (re-opens output, confirms frames decode) before
  trusting it — the safeguard the *previous* (reverted) attempt lacked.
- **Gated to MOBILE only** (`/Mobi|Android|iPhone|iPad|iPod/`): desktop Chrome
  often software-encodes H.264 → a 60fps clip took 100s+ and couldn't be
  cancelled. Phones have hardware encoders (iPhone 124 MB clip ≈ 70s — works).
- Transcode window **20–150 MB**. Clips **>150 MB on mobile** are blocked in
  `AnalyzePage.analyze()` with a "trim to 10–30s" message (they hung otherwise).
- **Direct browser→Gemini upload is CORS-blocked** — built but flagged OFF
  (`ENABLE_DIRECT_GEMINI=false`); Gemini's resumable URL rejects a browser PUT.
- Note: `TRANSCODE_MIN_MB` is currently low for testing — consider raising
  toward ~25–30 for prod so small clips skip the re-encode.

**Coach fixes**
- Global "Ask Coach" (`/coach/ask` → `coach_chat` in `ai_pipeline/vlm/coaching.py`)
  returned blog-link lists, not answers, because the Gemini call used the
  analysis model and **didn't set `BLOCK_NONE` safety** (sports words tripped
  the filter → empty → retrieval-only). Fixed: dedicated `gemini-2.5-flash` +
  `BLOCK_NONE`.
- Live Coach (`/coach/voice-chat`, `LiveVoiceCoach.jsx`) replies **truncated
  mid-sentence**. Backend flushes its trailing buffer correctly; the frontend
  was **swallowing SSE error frames** (a `throw` caught by the JSON-parse
  `catch`) — fixed so errors surface. Added backend **`finish_reason` logging**:
  the likely cause is Gemini **RECITATION/SAFETY** stopping generation, possibly
  specific to *real pro-match* demo clips. **Confirm on a real user clip.**

**Other**
- `ProgressPage.jsx`: `canonicalSport()` normalizer so auto-detected duplicates
  ("Strength Training" vs "Gym / Strength Training") merge into one group.
- `server.py`: hardcoded **Cloudinary secret removed** → env-only (see §4).

Detailed write-ups live in `ANALYZE_FEATURE_EVALUATION.md` and
`UPLOAD_SPEED_RESEARCH.md` (repo root).

---

## 4. Open items / next steps

1. **Deploy + verify** `fix/upload-resilience` on a preview, then merge to
   `main`. Re-test on a phone: portrait clip transcodes upright + Gemini returns
   shots; >150 MB shows the trim message; Ask Coach gives real answers; Live
   Coach completes on a non-pro-match clip.
2. **Rotate the Cloudinary secret** — the old key (`mK2zxGmm...`) is in git
   history; treat as compromised. Set the 3 `CLOUDINARY_*` env vars in Vercel.
3. **Real downloadable PDF** — "Get PDF" currently calls `window.print()`
   (clunky on mobile). Recommended: client-side `jsPDF` + `html2canvas`. Not yet
   built.
4. **True background upload** ("lock screen & walk away") — only possible via
   the native app (Android Capacitor + a background-upload plugin / foreground
   service; Android Chrome also supports Background Fetch). iOS web can't (Safari
   suspends background tabs). The analysis itself already runs server-side after
   upload ("you can leave").
5. **Demo-account token bug** — the demo login UI says "5000 tokens" but
   `/api/tokens/balance` returned 0 on a fresh preview; grant isn't applied.
6. **Reanalyse** ("Re-analyze to compare") — entry points + `/compare-analyses`
   exist but an end-to-end comparison run was never verified.
7. Consider splitting `server.py` (15.9k-line monolith).

---

## 5. Conventions

- Keep edits CRLF (match the working tree) so diffs stay clean.
- Frontend: no localStorage misuse issues; Tailwind core classes only in any
  new artifacts.
- After backend edits, `python3 -c "import ast; ast.parse(open('backend/server.py').read())"`
  to sanity-check (no full env to run it in the sandbox).
- Token-saving: prefer focused sessions; this guide exists so you don't have to
  re-read large files to get context.
