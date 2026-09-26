# Analysis result sections + "Film again & compare": test results and plan

Tested live on formanti.com on 26 Sep 2026 with the founder's account, plus a read of the code on `main`.
The account mixes clips of many different players, so **cross-session trends in its history mean nothing**.
Everything below is either about a single analysis, or about a controlled compare test where the
player was known to be the same.

## 1. What was tested

| Test | Clip | How |
|---|---|---|
| Cricket (fresh) | Leg-spin bowler warm-up in nets, 12.9 s, 360×548, filmed from behind | New upload |
| Gym (fresh) | "How to do a Squat", 32 s, instructional clip with 2 people | New upload, picked the lifter |
| Basketball | Jump-shot session from 24 Aug (10 shots) | Saved analysis, full JSON via `/api/analysis/{id}` |
| Gym, cricket history | 12 saved analyses (tricep pushdown, squats, leg press, lat pulldown, bowling) | Saved JSON |
| Reanalyse | Baseline: 25 Sep tournament rally analysis (79/100, Advanced). New clip: **first 15 s of the same video** | "Film again & compare" from History |

Credits used: 3 (cricket, gym, compare).

## 2. Findings

### 2.1 The score is not a measurement (all universal-mode sports)
`_derive_universal_score()` in `backend/server.py`: base by level label (Beginner 55, Intermediate 70,
Advanced 82, Pro 92) **+ 3 × (number of strengths − number of improvements)**, clamped 40–98.
Improvements include one weakness per shot.

- Cricket 22 Jul: Intermediate 70 + 3 × (2 − 4) = **64** (the saved score is exactly 64).
- The more shots/reps in a clip, the lower the score, whatever the technique. Gym history:
  3 reps → 76, 10 reps → 43, 17 reps → 40. (One older 16-rep session scored 70, likely an earlier pipeline.)
- Basketball: 9 jump shots each graded **A / 90**, session score **40/100**.

### 2.2 Per-shot grades and outcomes
- Every shot/rep gets 90 (A) almost regardless of content: 10 tricep reps, each with a different flaw, all 90/A.
- Racquet vocabulary leaks into other sports: gym reps are `continued_rally`, basketball misses are
  `lost_point`, makes are `winner`.

### 2.3 Sections that don't fit the sport
- **Court positioning & movement** shows for gym ("court coverage 0%", "recovery to base: excellent")
  and cricket nets ("court coverage 15%"). Two different badminton clips (30 s and 15 s) both reported
  **8.5 m distance / 45% coverage**, so these numbers are not measured.
- "Doubles match: analyse both near-court players" is offered on a gym upload.
- Loading copy says "Tracking court positions…" on a cricket clip.
- The **shot timeline** shows "No timestamped shots in this session" for gym (3 reps found) and cricket.

### 2.4 Labels
- Cricket: the clip is titled as leg-spin; the analysis called it a **"Seam-up delivery"**. Pace and spin
  coaching differ, so a wrong delivery type undermines the advice. (Not verifiable from 1 fps frames
  alone, but a coach would check this first.)
- Sport label for the **same squat video**: "strength_training" and "WEIGHTLIFTING" (4 Sep), "Weightlifting"
  (26 Sep). This is why history splits into separate buckets.

### 2.5 What was genuinely good
The **coach's read** ("what's working / where to focus / next session focus") was relevant in every sport:
- **Cricket:** brace the front leg, head falling to the off side.
- **Gym:** depth, knee tracking, chest up, foot pressure.
- **Basketball:** follow-through, leg drive, set-point drift.
- **Badminton:** racket carriage between shots, which the video confirms.

Gym **reps / pace / time per rep** were sensible.

### 2.6 Navigation
The section rail listed "Pro Comparison" and "Audio Coaching" (wrappers mount empty) plus sections that
never mount. `AnalysisScroller` intentionally rendered all items. Fixed on this branch (see §5).

## 3. Which sections to show

Legend: **Keep**, **Fix first**, or **Hide** (until the data behind it is real).

| Section | Racquet | Cricket | Gym | Basketball | Decision |
|---|---|---|---|---|---|
| Coach's read: working / focus / next | good | good | good | good (saved) | **Keep and lead with it** |
| Top fix | good | good | good | good | **Keep as the hero** |
| Player detection / picker | needed for doubles | ok | useful with 2 people | ok | **Keep**; print the description once, not 3 times |
| Session metrics | tempo, variety ok; aggression, recovery, FH/BH shaky | "attempts: 1" ok | reps / pace / per-rep good | not rendered | **Keep** gym reps/pace and racquet tempo/variety; hide the rest |
| Shot / rep timeline (video + markers) | works on a fresh result only | empty | empty | not rendered | **Fix first**: persist clip + timestamps for all sports |
| Per-shot / per-rep feedback text | useful | useful | useful | useful | **Keep the text; drop the per-shot 90/A grade**; sport vocabulary (rep n; made/missed) |
| Overall score /100, level /10 gauge | derived | derived | derived, falls with rep count | 40 with all-A shots | **Hide the number**, or relabel as an "AI level estimate" |
| Best / worst shot, "% sure" | all ~90 | 90 | 98 | 90 | **Hide** |
| Consistency % | contradicts itself (100% vs 66%) | "need 3+" ok | 96%, basis unclear | — | **Hide** until computed from pose |
| Court map & movement | positions wrong; same numbers on 2 clips | irrelevant | irrelevant | estimated | **Hidden for non-court sports (done)**; racquet/basketball: hide until court calibration, or label "estimate" |
| Pro comparison | usually empty | empty | empty | empty | **Hide** until a reference library exists (removed from nav, done) |
| Audio coaching | button only | same | same | same | **Keep inline**, not a nav section (done) |
| Drills | smash videos for a drive fix (earlier test) | not checked | not checked | not checked | **Keep only when linked to the top fix** |
| Coach report PDF | `window.print()` | | | | **Keep**; real PDF later |
| Rate it | ok | ok | ok | ok | **Keep** at the end |
| Next step: film again | 4 CTAs + "Upload next" + "Track progress" | same | same | same | **Keep one CTA**; merge the duplicates |
| Score pop-up "10 OUT OF" tile | unclear | | | | **Remove** |
| "Doubles match" upload option | ok | wrong | wrong | wrong | **Racquet only** |

## 4. "Film again & compare": test result

Same player, same camera, the new clip is part of the baseline video. The compare card said:

- **REGRESSED**, score **79 → 58 (−21)**, level **Advanced → Intermediate**.
- "Racket carriage drops too low…" marked **RESOLVED**, while the new analysis's own "Where to focus" says
  "Racket head drops slightly after the forehand drive at 0:09", and the "⚠ New" list repeats it.
- "Hip rotation on the overhead clear at 0:25" marked **RESOLVED**. The new clip has no overhead; the
  coach's own text says "No overhead clears were performed in this clip".
- Speed "0 → 0 (0)"; "1 days".

The **written "Since last session" paragraph was accurate**. The badges and numbers around it were not.

**Root causes (code):**
1. Score/level deltas compare derived numbers (§2.1), so the delta is noise in wording and bullet counts.
2. "Resolved / New" = exact-string set difference of AI-written phrases. The same issue is worded differently
   each run, so it lands on both sides.
3. Drill attribution matched when **any** word (including "the", "a", "to") appeared in both texts, as a
   substring, so nearly everything was "resolved".
4. The nudge link (`/analyze?src=…&n=…`) opened a plain upload page, not compare mode. The new clip was
   analysed with nothing to compare it to, unless the user found the old card in History.
5. The nudge named `sorted(weaknesses)[0]`, the alphabetically first phrase, not the #1 fix.
6. `/reanalysis-suggestions` (shots due for a re-check) exists but **nothing in the frontend calls it**.
7. The frontend "Can't compare across sports" modal is dead code: `setReanalyzeMismatch` is only ever
   called with `null`.

## 5. Changes on this branch

| File | Change |
|---|---|
| `backend/ai_pipeline/vlm/coaching.py` | The compare prompt now receives the old session's fixes and returns `focus_status`: **resolved / still_there / not_observable** with evidence from the new session. |
| `backend/server.py` | `drill_attribution` built from `focus_status`. The fallback matcher needs 2+ shared content words and never claims "resolved". New `score_is_derived` flag. The nudge names the #1 fix and links to `/analyze?…&compare=<id>` (push and email). Reminder queries fetch `vlm_coaching`. |
| `frontend/src/pages/AnalyzePage.jsx` | Compare verdict comes from the per-fix checks. Score/level deltas are hidden when derived, with a one-line explanation. Speed tile only when measured. Exact-text Resolved/New lists removed. "same day / 1 day / N days". `?compare=<id>` deep link loads the baseline and enters compare mode after sign-in. Court map + movement only for court sports. |
| `frontend/src/components/AnalysisScroller.jsx` | The rail and jump bar list only sections that exist **and have content**. |

## 6. Plan: make people come back to re-check

**Trust first.** A comparison that tells someone who practised "you regressed −21" makes them quit.

1. **Done here:** per-fix check with evidence; no derived deltas; no text-diff lists.
2. **Pre-select the baseline player** in compare mode (match the saved description). Warn when the new
   clip's player description differs a lot.
3. **Store both clips (720p)** and show them side by side, synced at contact. The prototype's "synced at the
   impact sound" does this. Seeing is more convincing than text.
4. **Replace the derived score with one measured metric per fix.** Example from the prototype:
   "racket hand low between shots: 77% of rally time".
5. **Deterministic re-reads:** temperature 0 plus caching on `video_hash`, so the same clip reads the same.

**Discovery.**

1. **Done here:** reminder taps open compare mode with the baseline loaded, and the reminder names the #1 fix.
2. End every result with **"Re-check this fix on <date>"** and a Remind-me button (push / email / WhatsApp;
   phone numbers are already collected).
3. Dashboard **Fix tracker**: open fixes, their status, and a "Re-check" button. Wire up the unused
   `/reanalysis-suggestions`.
4. Time the reminder to practice: after N training days, or 5–7 days, whichever comes first.
5. Test a cheaper re-check (e.g. the first re-check of a fix is free). The funnel is already in PostHog:
   `compare_started` → `compare_completed` → purchase.

**Measure.**
- PostHog: `nudge_clicked`, `compare_started` / `compare_completed` with `source` (`nudge_link` is new).
- Admin → Stats → re-engagement (sent / tapped / returned).
- `_scan_and_send_reengagement` returns early when VAPID keys are missing. That also skips the **email**
  fallback, so confirm the keys are set in production.

## 7. Decisions for the founder

1. **Hide the /100 score and /10 level everywhere**, not only in compare, until something measured replaces
   them? Recommended: yes. Keep a plain "level estimate" word.
2. **Racquet court map:** hide until court-line calibration exists, or keep it labelled "estimate"?
3. **Canonical sport IDs on the server** at save time, plus a one-time migration. `ProgressPage`'s
   `canonicalSport()` only merges on the client.
