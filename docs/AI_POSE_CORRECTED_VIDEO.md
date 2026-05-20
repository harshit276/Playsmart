# AI Pose-Corrected Video — Feature Plan

> **Status:** planning only. Not implemented. Tracked separately so we don't
> ship a half-broken expensive feature before the economics + quality bar are
> nailed down.

## What the user actually wants

A 3–5 second video clip of *the user themselves* performing the shot with
corrected form, generated AFTER analysis. They watch their wrong shot, then
watch their "fixed" shot — visually closing the gap between what they did
and what they should do.

This is qualitatively different from:
- **Pro reference video** (already shipped) — pro player, not user.
- **Pose overlay** (already shipped) — user's exact frame with green skeleton
  drawn on top. Informative but no motion correction.

## Honest technical reality (as of 2026-05)

There are three approaches, ordered by realism:

### Option A — Pose retargeting with diffusion (FEASIBLE, MID-COST)

Pipeline:
1. Extract the user's pose sequence from their shot window (~3s = ~90 frames
   at 30fps, but we'd typically downsample to 15fps = ~45 frames).
2. Generate a "corrected" pose sequence by:
   - Starting from the user's pose at frame 0 (preserves identity-relevant
     features like which side they're standing on),
   - Interpolating toward a canonical pro pose at the contact frame,
   - Smoothing the transitions before + after contact.
3. Feed (user's first frame + corrected pose sequence) into a pose-to-video
   diffusion model (e.g. MagicAnimate, AnimateDiff + OpenPose ControlNet,
   or commercial APIs like Wonder Dynamics).
4. Output: 3-5 second clip where the user's body executes the corrected
   pose sequence.

**Cost (realistic estimates):**
- Replicate / fal.ai hosted MagicAnimate: $0.05 per output frame ≈ $2-3 per
  3-second clip.
- Self-hosted on a single A100 ($1.5/hr cloud): ~30s per generation ≈ $0.10
  per clip *if* utilisation is ~100%. In practice batch-1 utilisation is
  20-40% → $0.30-0.50.

**Quality reality:**
- ~70-80% of frames look acceptable for body motion.
- Hands holding rackets are the weakest part — the model often drops or
  mangles the racket. Reasonable mitigation: blur or crop the racket region
  in the output, or composite the user's original racket pixels back in.
- The user's face/identity stays recognisable in ~60% of generations. The
  rest get an "uncanny" face that may be off-putting.

**Time:**
- Generation: 30s on A100, 1-2min on consumer GPU / Replicate cold start.
- We'd need to surface this as an async job ("generating your corrected
  shot... we'll notify you in 1-2 min"), not a synchronous request.

### Option B — Full text-to-video (Veo 3 / Sora) — NOT RECOMMENDED

Pros:
- High-quality realistic output.
- Easy API integration.

Cons:
- $1-5 per 5s clip on Veo 3 API.
- Cannot guarantee output looks anything like the actual user — it's
  generating from a text prompt, not from their video.
- Defeats the purpose: the user wants to see THEMSELVES with better form,
  not a generic pro.

**Verdict:** skip unless we narrow the value prop to "see what a pro looks
like doing this shot from your camera angle" — which is just a fancier Pro
Reference (already shipped).

### Option C — Frame-by-frame pose-overlay animation (FREE, MEDIUM VALUE)

Pipeline:
1. Take the user's shot video segment (already in browser memory).
2. For each frame, run MoveNet to extract the user's pose.
3. For each frame, ALSO compute the corresponding "ideal" pose at that
   phase of the swing (interpolate between key reference poses we curated).
4. Draw BOTH skeletons on the frame — user in red, ideal in green —
   simultaneously.
5. Encode the annotated frames to a WebM blob, save as a Blob URL.
6. Surface as a "Form coach replay" video next to the user's original.

**Cost:** zero (browser-only).

**Quality:** lower-tech than Option A but visually impactful in a different
way — the user can see exactly where their joints diverged from ideal frame
by frame.

**Time:** ~5-10 seconds in-browser (45 frames × 100ms MoveNet + canvas
draw), no server round-trip.

**Verdict:** Ship this FIRST as the "free" version of the feature. It's
honest about what we know (joint angles) instead of generating fictional
motion.

## Recommended phasing

**Phase 1 — Form coach replay (Option C) — free, ~2 days work**

- Extend the existing `PoseOverlayModal` from a single frame to a video.
- Loop the user's shot segment (already loaded for the Pro Reference panel).
- Overlay the dual skeletons (user in red, ideal in green) live, frame by
  frame.
- Display next to the pro reference for a 3-up comparison: user's raw clip
  + ideal-pose overlay + pro reference.
- Cost: zero. Risk: low. Value: clear coaching insight without the uncanny
  valley risk of generated faces.

**Phase 2 — AI pose-corrected clip (Option A) — paid, ~5-7 days work**

- Wire up Replicate or fal.ai MagicAnimate as a backend job.
- New endpoint `POST /api/generate-corrected-shot` returns a job_id; client
  polls `GET /api/job/{id}` until the clip is ready.
- Token gate: 500 tokens per generation (≈ ₹150 at our rate, healthy margin
  on ₹2-3 actual cost).
- Surface only on Premium and Elite plans, AND limit to 3 generations per
  month per user even on Elite (prevents one bored user costing us ₹500/mo
  in generation).
- Quality safeguards:
  - Crop the racket region in the output and composite the user's original
    racket frame back in (avoids "racket disappears" weirdness).
  - If the generated clip's pose-detected angles don't actually MATCH the
    corrected target by some margin, regenerate ONCE then fail gracefully
    with "AI couldn't generate a clean correction — try a clearer clip".
- Cache aggressively: same user+shot_type → return the cached clip for 7
  days. Saves repeat generation costs.

**Phase 3 — Iterate based on usage**

- If Phase 2 conversion is strong (>10% of paid users generate per session),
  invest in self-hosted GPU pipeline (~₹15k/mo cloud GPU is break-even at
  ~300 generations/mo).
- If Phase 2 quality complaints are high, swap MagicAnimate for whatever's
  state-of-the-art at that point. The interface stays the same.

## What this is NOT

- It is not "generate a perfect pro shot in the user's body" — that's an
  identity-preservation problem that current diffusion models can't solve
  cleanly. We're saying "here's your motion, corrected toward the ideal".
- It is not synchronous. Generation takes 30s-2min. The UX must reflect
  that — "we'll notify you when it's ready" pattern, not a spinner.
- It is not a replacement for the pose-overlay frozen-frame view or the
  pro reference video. It's an additional, premium-only signal.

## Decision needed before any code

1. Are we okay with sometimes shipping a clip where the racket looks broken
   or the user's face is slightly uncanny? (My honest take: yes, IF we
   label it as "AI-generated coaching visualization" and not "this is what
   you actually look like".)
2. ₹150 / generation cap on Phase 2 — comfortable, or push to ₹100?
3. Are we okay restricting generation to Premium + Elite plans only? Or
   should free / Standard get one trial generation per signup?

Once those are settled, Phase 1 (free overlay video) can ship inside a
week; Phase 2 (paid AI gen) a week after that.
