"""
drill_matcher.py — Keyword-based drill personalization.

Given a list of per-shot `top_fix` strings (e.g. "Engage your core and hips
more actively", "Stiff wrist on contact"), score each drill in the sport's
video catalog (`research/<sport>/videos.json`) against the fixes and return
the top-N ranked drills, each annotated with a `why_recommended` blurb so
the UI can show *why* this drill is on screen for THIS user.

Design choices:
  - Deterministic, no LLM calls. Pure keyword matching — runs in <10ms.
  - Falls back to the legacy "top-N by level" behaviour when `top_fixes` is
    empty / None, so existing callers / empty states aren't regressed.
  - The matcher reads a `focus_areas: [...]` array on each video when
    present (we tag them in the catalog), AND falls back to lexical hits
    on the title + skill_id so untagged videos still get reasonable
    matches.

The focus-area vocabulary is closed: FOCUS_AREAS below. A given video can
carry multiple tags. Fixes that don't map to any tag still return useful
results via the title-substring fallback.
"""

from __future__ import annotations

import re
from typing import Iterable, List, Optional

# ─── Focus-area vocabulary ─────────────────────────────────────────────
# Each key is the focus_area tag that goes on a drill. The list under it
# is the set of fix-string keyword stems that map to that tag. Order
# inside a list does not matter; stems are substring-matched against the
# lower-cased fix text.
#
# Keep this VOCABULARY tight and orthogonal. Don't add overlapping
# concepts — a fix should usually map to 1-3 focus areas, not 8. The
# matcher scores videos by SUM of focus-area hits, so vague tags water
# down rankings.
FIX_KEYWORDS_TO_FOCUS: dict[str, list[str]] = {
    # ─ Body mechanics
    "hip": ["hip", "hip rotation", "hip drive", "hip turn"],
    "core": ["core", "trunk", "abdominal", "torso"],
    "rotation": ["rotat", "trunk turn", "shoulder turn", "uncoiling",
                 "uncoil"],
    "power": ["power", "harder", "more force", "more pace",
              "explosive", "drive through", "extra power"],
    "wrist": ["wrist", "wrist snap", "stiff wrist", "loose wrist"],
    "grip": ["grip", "racket hold", "paddle hold", "frying pan"],
    "shoulder": ["shoulder", "shoulder turn", "scapula"],
    "elbow": ["elbow", "bent arm", "straight arm", "elbow angle"],
    "knees": ["knees", "knee bend", "low stance"],
    "balance": ["balance", "off-balance", "off balance", "stabili",
                "wobbl"],
    # ─ Footwork / movement
    "footwork": ["footwork", "foot work", "step", "stepping",
                 "split-step", "split step", "lunge", "chasse",
                 "shuffle"],
    "movement": ["move earlier", "get to the", "court coverage",
                 "positioning", "covering the court", "reaching",
                 "move quicker"],
    "agility": ["agility", "quickness", "fast feet", "explosive feet"],
    "recovery": ["recovery", "recover to base", "reset", "return to centre",
                 "return to center"],
    # ─ Contact / timing
    "timing": ["timing", "late", "early", "rushed", "too quick",
               "behind the ball", "behind the shuttle"],
    "contact": ["contact point", "point of contact", "make contact",
                "in front of body", "hit the ball later",
                "meet the shuttle"],
    "preparation": ["prepar", "ready position", "racket back",
                    "early backswing", "set up earlier"],
    "follow_through": ["follow-through", "follow through", "extension after",
                       "finish the swing"],
    # ─ Touch / consistency
    "consistency": ["consisten", "repeat", "same shot every time",
                    "every shot the same"],
    "control": ["control", "accuracy", "placement", "land it in",
                "where you aim"],
    "rally": ["rally", "build the rally", "stay in the point"],
    # ─ Defense / shot-type specific (so a fix about defense pulls defense drills)
    "defense": ["defense", "defensive", "defending", "block"],
    "attack": ["attack", "attacking", "aggressive", "go for the kill"],
    "net_play": ["net", "tight net", "net shot"],
    "serve": ["serve", "serving"],
    "smash": ["smash", "overhead", "kill shot"],
    "clear": ["clear", "high deep"],
    "drop": ["drop shot", "drop"],
    "drive": ["drive"],
    # ─ Conditioning / mindset (rarely surfaced as top_fix but valid)
    "fitness": ["stamina", "tired", "endurance", "out of breath"],
    "mental": ["focus", "concentration", "anxious", "nervous", "rushed shot"],
}

# Reverse map for fast scan: for each keyword, the focus_area(s) it implies.
# A keyword can imply multiple areas (e.g. "shoulder turn" → shoulder +
# rotation), and we want both to fire so the matcher pulls drills tagged
# with either.
_KEYWORD_TO_AREAS: list[tuple[str, str]] = []
for area, kws in FIX_KEYWORDS_TO_FOCUS.items():
    for kw in kws:
        _KEYWORD_TO_AREAS.append((kw.lower(), area))

# Human-readable labels for the `why_recommended` blurb. Keep these
# short — the UI renders them in a small accent strip under the drill
# title.
_FOCUS_AREA_LABEL = {
    "hip": "hip rotation",
    "core": "core engagement",
    "rotation": "trunk rotation",
    "power": "shot power",
    "wrist": "wrist action",
    "grip": "grip technique",
    "shoulder": "shoulder mechanics",
    "elbow": "elbow position",
    "knees": "leg drive",
    "balance": "balance & stance",
    "footwork": "footwork",
    "movement": "court movement",
    "agility": "agility",
    "recovery": "recovery to base",
    "timing": "shot timing",
    "contact": "contact point",
    "preparation": "early preparation",
    "follow_through": "follow-through",
    "consistency": "consistency",
    "control": "shot control",
    "rally": "rally building",
    "defense": "defense",
    "attack": "attacking play",
    "net_play": "net play",
    "serve": "serve technique",
    "smash": "smash",
    "clear": "the clear",
    "drop": "drop shots",
    "drive": "drives",
    "fitness": "stamina",
    "mental": "mental game",
}


# ─── Fix-string → focus-area extraction ────────────────────────────────

# Expansion map: when a fix triggers a focus area, ALSO consider these
# related areas. This bridges the gap between fix vocabulary (which uses
# body-part language: "hip", "core", "wrist") and drill-catalog tags
# (which often use shot-mechanic language: "rotation", "power", "smash").
# Example: a fix about engaging the hips should also pull up smash /
# clear / rotation drills since those are where hip drive lives in
# practice.
_AREA_EXPANSION: dict[str, list[str]] = {
    "hip": ["rotation", "power"],
    "core": ["rotation", "power"],
    "shoulder": ["rotation"],
    "trunk": ["rotation"],  # not a key in FIX_KEYWORDS_TO_FOCUS but harmless
    "wrist": ["power"],
    "footwork": ["movement", "agility"],
    "movement": ["footwork"],
    "timing": ["preparation", "contact"],
    "contact": ["timing", "preparation"],
    "preparation": ["timing"],
    "control": ["consistency"],
    "consistency": ["control"],
}


def extract_focus_areas(top_fixes: Iterable[str]) -> list[str]:
    """Scan the collected per-shot fix strings and return the set of
    focus-area tags they touch, ordered by frequency (most-hit first).

    Robust to None / empty / duplicate / mixed-case input.

    Each direct-hit area is expanded via _AREA_EXPANSION so a fix about
    "hips" also surfaces rotation/power drills (since that's where hip
    drive lives in catalog tags). Expansion hits count less than direct
    hits so they don't dominate ranking.
    """
    if not top_fixes:
        return []

    counts: dict[str, float] = {}
    for fix in top_fixes:
        if not fix:
            continue
        text = str(fix).lower()
        # Direct hits first.
        hit = set()
        for kw, area in _KEYWORD_TO_AREAS:
            if kw in text and area not in hit:
                hit.add(area)
                counts[area] = counts.get(area, 0) + 1.0
        # Now spread: each direct hit also nudges its related areas.
        for area in list(hit):
            for related in _AREA_EXPANSION.get(area, []):
                if related not in hit:  # don't double-count direct hits
                    counts[related] = counts.get(related, 0) + 0.5

    # Sort areas by hit-count desc, then alphabetically for stability.
    return sorted(counts, key=lambda a: (-counts[a], a))


# ─── Drill-tagging fallback ────────────────────────────────────────────
# When the catalog's video entries don't carry focus_areas tags (legacy
# data), infer tags from the video's title + skill_id so the matcher
# still works. This keeps personalization non-zero even before the
# catalog is fully re-tagged.

_TITLE_TAG_PATTERNS: list[tuple[re.Pattern, list[str]]] = [
    (re.compile(r"\bfootwork|footstep|split[\s-]?step|chasse|lunge|shuffle\b", re.I),
     ["footwork", "movement", "agility"]),
    (re.compile(r"\bagility|speed\b", re.I), ["agility"]),
    (re.compile(r"\bsmash|overhead\b", re.I), ["smash", "power", "rotation"]),
    (re.compile(r"\bjump\s+smash\b", re.I), ["smash", "power", "knees"]),
    (re.compile(r"\bclear\b", re.I), ["clear", "power"]),
    (re.compile(r"\bdrop\b", re.I), ["drop", "control", "contact"]),
    (re.compile(r"\bdrive\b", re.I), ["drive", "wrist"]),
    (re.compile(r"\bnet\b", re.I), ["net_play", "control"]),
    (re.compile(r"\bdefen[ds]e\b", re.I), ["defense", "balance", "wrist"]),
    (re.compile(r"\bgrip\b", re.I), ["grip", "wrist"]),
    (re.compile(r"\bserve|serving|service\b", re.I), ["serve", "consistency"]),
    (re.compile(r"\bwrist|forearm\b", re.I), ["wrist", "power"]),
    (re.compile(r"\bbackhand\b", re.I), ["control"]),
    (re.compile(r"\bforehand\b", re.I), ["control"]),
    (re.compile(r"\brotation|hip|core|trunk|pronation|uncoil\b", re.I),
     ["rotation", "hip", "core", "power"]),
    (re.compile(r"\bbalance|stance\b", re.I), ["balance"]),
    (re.compile(r"\bdeception\b", re.I), ["control"]),
    (re.compile(r"\btactic|strategy|singles|doubles\b", re.I),
     ["mental", "rally"]),
    (re.compile(r"\bwarm[-\s]?up|stretch\b", re.I), ["fitness"]),
    (re.compile(r"\bfitness|agility|drill|conditioning|train\b", re.I),
     ["fitness", "agility"]),
    (re.compile(r"\bmental|flow|focus\b", re.I), ["mental"]),
    (re.compile(r"\bcool[-\s]?down\b", re.I), ["fitness"]),
    (re.compile(r"\btiming\b", re.I), ["timing"]),
    (re.compile(r"\btopspin|spin\b", re.I), ["wrist", "rotation"]),
    (re.compile(r"\bvolley\b", re.I), ["net_play", "preparation"]),
    (re.compile(r"\bslice\b", re.I), ["wrist", "control"]),
    (re.compile(r"\breturn\b", re.I), ["preparation", "timing"]),
    (re.compile(r"\bbowl|bowling\b", re.I), ["rotation", "power", "consistency"]),
    (re.compile(r"\bbat|batting\b", re.I), ["timing", "control", "balance"]),
    (re.compile(r"\bcatch|catching|field\b", re.I), ["agility", "preparation"]),
    (re.compile(r"\bdink\b", re.I), ["net_play", "control"]),
    (re.compile(r"\bthird[-\s]?shot\b", re.I), ["control", "preparation"]),
    (re.compile(r"\bkick|shoot|pass\b", re.I), ["power", "control"]),
    (re.compile(r"\bdribble\b", re.I), ["control", "agility"]),
    (re.compile(r"\bstroke|freestyle|breaststroke|butterfly|backstroke\b", re.I),
     ["consistency", "control"]),
    (re.compile(r"\bturn|flip[-\s]?turn\b", re.I), ["timing", "agility"]),
    (re.compile(r"\bbreath\b", re.I), ["consistency", "fitness"]),
]


def infer_focus_areas_from_video(video: dict) -> list[str]:
    """Last-resort tag inference for catalog entries without focus_areas.
    Returns a deduped list of focus-area tags based on title + skill_id.
    """
    bag = " ".join([
        str(video.get("title") or ""),
        str(video.get("skill_id") or ""),
        str(video.get("content_type") or ""),
    ])
    tags: list[str] = []
    seen: set[str] = set()
    for pat, areas in _TITLE_TAG_PATTERNS:
        if pat.search(bag):
            for a in areas:
                if a not in seen:
                    seen.add(a)
                    tags.append(a)
    return tags


# ─── Scoring + selection ───────────────────────────────────────────────

def _video_areas(video: dict) -> list[str]:
    """Effective focus-area list for a video — catalog tags first, fall
    back to title-inferred tags. (We don't merge: explicit tags WIN so
    curated tags aren't watered down by noisy regex hits.)"""
    explicit = video.get("focus_areas")
    if isinstance(explicit, list) and explicit:
        return [str(a).lower() for a in explicit]
    return infer_focus_areas_from_video(video)


def _level_rank(level: str | None) -> int:
    """Lower = beginner-er. Used to keep generic top-N somewhat ordered."""
    return {"beginner": 0, "intermediate": 1, "advanced": 2}.get(
        (level or "").lower(), 1
    )


def score_videos(
    videos: list[dict],
    needed_areas: list[str],
    level: Optional[str] = None,
) -> list[tuple[dict, float, list[str]]]:
    """Score every video against the needed focus areas. Returns a list
    of (video, score, matched_areas) sorted by score desc, level affinity,
    then catalog order.

    Scoring rule:
      - +3 per matched explicit focus_areas hit
      - +1 per matched title-inferred area
      - small level affinity bonus (so a beginner doesn't get an advanced
        drill first when both score equally)
    """
    need_set = set(a.lower() for a in needed_areas)
    desired_rank = _level_rank(level)

    out: list[tuple[dict, float, list[str]]] = []
    for v in videos:
        explicit = v.get("focus_areas")
        explicit_set = set(str(a).lower() for a in explicit) if isinstance(explicit, list) else set()
        inferred_set = set(infer_focus_areas_from_video(v)) if not explicit_set else set()

        matched_explicit = explicit_set & need_set
        matched_inferred = inferred_set & need_set

        score = 3.0 * len(matched_explicit) + 1.0 * len(matched_inferred)
        if score <= 0:
            continue

        # Level affinity — penalty for distance from desired level.
        v_rank = _level_rank(v.get("level"))
        affinity = -0.1 * abs(v_rank - desired_rank)
        score += affinity

        matched = sorted(matched_explicit | matched_inferred)
        out.append((v, score, matched))

    out.sort(key=lambda t: (-t[1], _level_rank(t[0].get("level"))))
    return out


def _build_why(matched_areas: list[str], top_fixes: list[str] | None) -> str:
    """Short human blurb that goes under the drill title. Mentions the
    1-2 strongest matched focus areas so the user sees WHY this drill
    is here, not generic filler."""
    if not matched_areas:
        return ""
    labels = [_FOCUS_AREA_LABEL.get(a, a.replace("_", " ")) for a in matched_areas[:2]]
    if len(labels) == 1:
        return f"Helps fix: {labels[0]}"
    return f"Helps fix: {labels[0]} and {labels[1]}"


def pick_drills(
    videos: list[dict],
    top_fixes: list[str] | None,
    level: Optional[str] = None,
    limit: int = 5,
) -> tuple[list[dict], bool]:
    """Main entrypoint.

    Returns (drills, personalized) where:
      - drills is a list of catalog video dicts each annotated with
        `why_recommended` (string) and `matched_focus_areas` (list).
      - personalized is True iff we used the top_fixes to rank.

    When `top_fixes` is empty/None OR no drill scores > 0 (i.e. fixes
    don't map to any catalog area), we fall back to the legacy
    "top-N by level" behaviour and set personalized=False so the UI can
    show a "general drills" caption.
    """
    if not videos:
        return [], False

    needed = extract_focus_areas(top_fixes or [])
    if needed:
        scored = score_videos(videos, needed, level=level)
        if scored:
            picked: list[dict] = []
            for v, _score, matched in scored[:limit]:
                copy = dict(v)
                copy["why_recommended"] = _build_why(matched, top_fixes)
                copy["matched_focus_areas"] = matched
                picked.append(copy)
            return picked, True

    # ─── Fallback: generic top-N (level-matched first, then any) ─────
    desired_rank = _level_rank(level)
    sorted_videos = sorted(
        videos,
        key=lambda v: (abs(_level_rank(v.get("level")) - desired_rank),
                       videos.index(v)),
    )
    picked = []
    for v in sorted_videos[:limit]:
        copy = dict(v)
        copy["why_recommended"] = ""
        copy["matched_focus_areas"] = []
        picked.append(copy)
    return picked, False


# ─── Exports ───────────────────────────────────────────────────────────

__all__ = [
    "FIX_KEYWORDS_TO_FOCUS",
    "extract_focus_areas",
    "infer_focus_areas_from_video",
    "score_videos",
    "pick_drills",
]
