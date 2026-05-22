"""tag_drills.py — one-shot script to add `focus_areas` arrays to videos.

Run from backend dir:
    python scripts/tag_drills.py

For each sport's videos.json, walk each video entry and add a `focus_areas`
list inferred from the video title + skill_id, but ONLY when confident.
Skips an entry if no rule matches with confidence. Preserves all other
fields and the surrounding JSON formatting (we re-serialize with indent=2).

This file is a curation tool — not loaded at runtime. Safe to delete after
the tags land in the catalog, but kept around for re-tagging.
"""

from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent / "research"
SPORTS = ["badminton", "table_tennis", "tennis", "pickleball",
          "cricket", "football", "swimming"]

# Same vocabulary as drill_matcher._TITLE_TAG_PATTERNS but with EXPLICIT
# per-rule tags. We're more conservative here (curation) than the runtime
# fallback (which is permissive). Each rule fires only when its strict
# regex matches the title.
RULES: list[tuple[re.Pattern, list[str]]] = [
    # Grip
    (re.compile(r"\bgrip\b", re.I), ["grip", "wrist"]),
    # Footwork & movement
    (re.compile(r"\bfootwork\b", re.I), ["footwork", "movement"]),
    (re.compile(r"\bsplit[\s-]?step\b", re.I), ["footwork", "preparation"]),
    (re.compile(r"\bchasse\s*step\b", re.I), ["footwork", "movement"]),
    (re.compile(r"\bagility\b", re.I), ["agility", "footwork"]),
    (re.compile(r"\b4\s*corner\b", re.I), ["footwork", "movement"]),
    (re.compile(r"\blunge\b", re.I), ["footwork", "balance"]),
    # Power / smash / overhead
    (re.compile(r"\bsmash\b", re.I), ["smash", "power", "rotation"]),
    (re.compile(r"\bjump\s*smash\b", re.I), ["smash", "power", "knees"]),
    (re.compile(r"\bstick\s*smash\b", re.I), ["smash", "wrist", "timing"]),
    (re.compile(r"\boverhead\b", re.I), ["smash", "power", "rotation"]),
    (re.compile(r"\bpronation\b", re.I), ["wrist", "rotation", "power"]),
    # Other shot types
    (re.compile(r"\bclear\b", re.I), ["clear", "power", "rotation"]),
    (re.compile(r"\bdrop\b", re.I), ["drop", "control", "contact"]),
    (re.compile(r"\bdrive\b", re.I), ["drive", "wrist", "contact"]),
    (re.compile(r"\bnet\s*(shot|play)\b", re.I), ["net_play", "control", "contact"]),
    (re.compile(r"\bdefen[ds]e\b", re.I), ["defense", "balance", "wrist"]),
    (re.compile(r"\bdeception\b", re.I), ["control", "preparation"]),
    # Serve
    (re.compile(r"\bserve|serving|service\b", re.I), ["serve", "consistency", "control"]),
    (re.compile(r"\bflick\s*serve\b", re.I), ["serve", "control", "preparation"]),
    # Tennis / paddle shots
    (re.compile(r"\bforehand\b", re.I), ["control", "rotation"]),
    (re.compile(r"\bbackhand\b", re.I), ["control", "rotation"]),
    (re.compile(r"\btopspin\b", re.I), ["wrist", "rotation", "power"]),
    (re.compile(r"\bslice\b", re.I), ["wrist", "control"]),
    (re.compile(r"\bvolley\b", re.I), ["net_play", "preparation", "timing"]),
    (re.compile(r"\breturn\b", re.I), ["preparation", "timing", "contact"]),
    # Conditioning / mental
    (re.compile(r"\bwarm[-\s]?up\b", re.I), ["fitness"]),
    (re.compile(r"\bcool[-\s]?down\b", re.I), ["fitness"]),
    (re.compile(r"\bstretch\b", re.I), ["fitness"]),
    (re.compile(r"\bfitness\b", re.I), ["fitness", "agility"]),
    (re.compile(r"\bmental|focus|flow\b", re.I), ["mental"]),
    (re.compile(r"\btactic|strategy|singles|doubles\b", re.I), ["mental", "rally"]),
    (re.compile(r"\bwrist|forearm\b", re.I), ["wrist", "power"]),
    # Cricket
    (re.compile(r"\bbat(ting)?\b", re.I), ["timing", "control", "balance"]),
    (re.compile(r"\bbowl(ing)?\b", re.I), ["rotation", "power", "consistency"]),
    (re.compile(r"\bcatch(ing)?\b", re.I), ["agility", "preparation"]),
    (re.compile(r"\bfield\b", re.I), ["agility", "movement"]),
    # Pickleball
    (re.compile(r"\bdink\b", re.I), ["net_play", "control", "contact"]),
    (re.compile(r"\bthird[-\s]?shot\b", re.I), ["control", "preparation"]),
    # Football
    (re.compile(r"\bkick|shoot\b", re.I), ["power", "control"]),
    (re.compile(r"\bpass(ing)?\b", re.I), ["control", "preparation"]),
    (re.compile(r"\bdribbl(e|ing)\b", re.I), ["control", "agility"]),
    # Swimming
    (re.compile(r"\bfreestyle|breaststroke|butterfly|backstroke\b", re.I),
     ["consistency", "control"]),
    (re.compile(r"\bflip\s*turn|\bturn\b", re.I), ["timing", "agility"]),
    (re.compile(r"\bbreath(ing)?\b", re.I), ["consistency", "fitness"]),
    # Skill id mapping (last-resort, fires when title is generic)
    (re.compile(r"_grip\b", re.I), ["grip", "wrist"]),
    (re.compile(r"_footwork\b", re.I), ["footwork", "movement"]),
    (re.compile(r"_smash\b", re.I), ["smash", "power", "rotation"]),
    (re.compile(r"_clear\b", re.I), ["clear", "power"]),
    (re.compile(r"_drop\b", re.I), ["drop", "control"]),
    (re.compile(r"_drive\b", re.I), ["drive", "wrist"]),
    (re.compile(r"_serve\b", re.I), ["serve", "consistency"]),
    (re.compile(r"_defense\b", re.I), ["defense", "wrist"]),
    (re.compile(r"_net_play\b", re.I), ["net_play"]),
    (re.compile(r"_deception\b", re.I), ["control"]),
    (re.compile(r"_(warmup|recovery)\b", re.I), ["fitness"]),
    (re.compile(r"_fitness\b", re.I), ["fitness", "agility"]),
    (re.compile(r"_mental_game\b", re.I), ["mental"]),
    (re.compile(r"_(singles|doubles)_(tactics|strategy)\b", re.I),
     ["mental", "rally"]),
]


def infer_tags_for(video: dict) -> list[str]:
    blob = " ".join(filter(None, [
        video.get("title", ""),
        video.get("skill_id", ""),
    ]))
    tags: list[str] = []
    seen: set[str] = set()
    for pat, ts in RULES:
        if pat.search(blob):
            for t in ts:
                if t not in seen:
                    seen.add(t)
                    tags.append(t)
    return tags


def main() -> None:
    grand_total = 0
    grand_tagged = 0
    for sport in SPORTS:
        path = ROOT / sport / "videos.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        videos = data.get("videos") or []
        tagged = 0
        for v in videos:
            tags = infer_tags_for(v)
            if tags:
                v["focus_areas"] = tags
                tagged += 1
            else:
                # Leave alone — better to fall through to runtime regex
                # inference than to slap a noisy tag on it.
                v.pop("focus_areas", None)
        path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"  {sport}: tagged {tagged}/{len(videos)} videos")
        grand_total += len(videos)
        grand_tagged += tagged
    print(f"\nTOTAL: tagged {grand_tagged}/{grand_total} videos across "
          f"{len(SPORTS)} sports")


if __name__ == "__main__":
    main()
