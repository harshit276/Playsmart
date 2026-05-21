"""One-shot script: walk every equipment JSON and add a `fit_profile` block
to each item that doesn't have one yet. Uses Gemini to derive the profile
from the item's existing pros/cons/specs/level/description.

Run from the backend directory:
    GEMINI_API_KEY=... python scripts/enrich_equipment.py
    GEMINI_API_KEY=... python scripts/enrich_equipment.py --sport badminton
    GEMINI_API_KEY=... python scripts/enrich_equipment.py --force  # re-enrich existing

Writes back to both:
  - backend/research/<sport>/equipment.json (if exists)
  - frontend/public/data/equipment/<sport>.json

After running, restart the backend so the recommender's catalog cache is
refreshed (or call POST /recommend/equipment which lazy-loads on first hit).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Force UTF-8 stdout on Windows so emoji prints don't crash with cp1252
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# Resolve project paths regardless of cwd
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

FRONTEND_DATA = PROJECT_ROOT / "frontend" / "public" / "data" / "equipment"
BACKEND_DATA = BACKEND_DIR / "research"

SPORTS = ["badminton", "tennis", "table_tennis", "pickleball", "cricket", "football", "swimming"]

_FIT_PROMPT = """You are a sports equipment expert generating a structured fit_profile
for a recommendation engine. Given the item's existing data, derive the
profile honestly and concretely.

CRITICAL RULES:
- Be honest. If an item is "budget beginner", don't tag it for tournaments.
- The 6 attributes (power, control, speed, spin, forgiveness, durability)
  are scored 0-100 RELATIVE TO THE CATEGORY (a beginner racket can score 90
  for forgiveness even though it scores 30 for power).
- best_for_persona must be ≤25 words, concrete. NOT "great for everyone".
- not_for_persona must name a real user this is wrong for.
- standout_qualities + common_complaints come from the existing pros/cons
  but rephrased as short, generic statements (not marketing copy).

VOCABULARIES (use only these exact strings):
- skill_levels: ["beginner","intermediate","advanced","pro"]
- playing_contexts: ["office_casual","garden_backyard","school_college",
  "club_recreational","club_competitive","academy_training","tournament_open",
  "tournament_elite","beach_outdoor"]
- anti_contexts: same vocabulary — contexts where this item is a BAD choice
- playing_styles: ["all_round","attacker","defender","counter_attacker",
  "looper","blocker","serve_volley","baseline","power_hitter",
  "control_focused","speed_focused","spin_focused"]
- goal_fit: ["improve_technique","win_matches","stay_fit","casual_fun","kids_starter"]
- body_fit: ["junior_or_light","average_adult","heavy_player",
  "small_hand_grip","wide_hand_grip","wrist_problem_friendly"]
- confidence: "low" | "medium" | "high" (default "medium" for LLM-derived)

Output ONLY a JSON object matching this shape (omit keys with no data):
{{
  "skill_levels": [...],
  "playing_styles": [...],
  "playing_contexts": [...],
  "anti_contexts": [...],
  "body_fit": [...],
  "goal_fit": [...],
  "attributes": {{"power": int, "control": int, "speed": int, "spin": int, "forgiveness": int, "durability": int}},
  "best_for_persona": "...",
  "not_for_persona": "...",
  "learning_curve_hours": int_or_null,
  "upgrade_after_months": int_or_null,
  "common_complaints": [...],
  "standout_qualities": [...],
  "confidence": "medium",
  "source": "llm_derived"
}}

ITEM:
sport: {sport}
category: {category}
name: {name}
brand: {brand}
type: {type}
level: {level}
specs: {specs}
description: {description}
pros: {pros}
cons: {cons}
price_inr_range: {price}
"""


def _pick_model() -> str:
    m = (os.getenv("GEMINI_MODEL") or "").strip()
    if not m or m == "gemini-2.0-flash":
        return "gemini-2.5-flash"
    return m


def _call_gemini(prompt: str) -> Dict[str, Any]:
    import google.generativeai as genai
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel(_pick_model())
    resp = model.generate_content(
        [{"text": prompt}],
        generation_config={"temperature": 0.1, "response_mime_type": "application/json"},
    )
    return json.loads(resp.text or "{}")


def _derive_profile(item: Dict[str, Any], sport: str, category: str) -> Optional[Dict[str, Any]]:
    price_inr = (item.get("price_ranges") or {}).get("INR") or {}
    prompt = _FIT_PROMPT.format(
        sport=sport,
        category=category,
        name=item.get("name") or "",
        brand=item.get("brand") or "",
        type=item.get("type") or "",
        level=item.get("level") or "",
        specs=json.dumps(item.get("specs") or {}),
        description=(item.get("description") or "")[:300],
        pros=json.dumps(item.get("pros") or []),
        cons=json.dumps(item.get("cons") or []),
        price=f"₹{price_inr.get('min', '?')}-{price_inr.get('max', '?')}",
    )
    try:
        return _call_gemini(prompt)
    except Exception as e:
        print(f"  ! gemini failed for {item.get('id')}: {e}", file=sys.stderr)
        return None


def _enrich_file(path: Path, sport: str, force: bool, throttle: float) -> tuple[int, int]:
    """Returns (added, skipped). Writes file in place."""
    if not path.exists():
        return 0, 0
    data = json.loads(path.read_text(encoding="utf-8"))
    added = 0
    skipped = 0
    for cat in data.get("equipment_categories") or []:
        category = cat.get("category")
        for it in cat.get("items") or []:
            if it.get("fit_profile") and not force:
                skipped += 1
                continue
            print(f"  → {it.get('id')} {it.get('name')[:50]}", flush=True)
            profile = _derive_profile(it, sport, category)
            if profile:
                it["fit_profile"] = profile
                added += 1
            if throttle:
                time.sleep(throttle)
    # Pretty-write back
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return added, skipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sport", help="Only enrich one sport (e.g. table_tennis)")
    ap.add_argument("--force", action="store_true", help="Re-enrich items that already have fit_profile")
    ap.add_argument("--throttle", type=float, default=0.3, help="Sleep between Gemini calls (sec)")
    args = ap.parse_args()

    if not os.environ.get("GEMINI_API_KEY"):
        print("ERROR: GEMINI_API_KEY env var required", file=sys.stderr)
        sys.exit(1)

    sports = [args.sport] if args.sport else SPORTS
    total_added = total_skipped = 0

    for sport in sports:
        # Prefer frontend (canonical for the recommender's cache) then mirror to backend research
        for base in [FRONTEND_DATA, BACKEND_DATA]:
            candidates = [base / f"{sport}.json", base / sport / "equipment.json"]
            for path in candidates:
                if not path.exists():
                    continue
                print(f"\n📦 {path}")
                a, s = _enrich_file(path, sport, args.force, args.throttle)
                print(f"   added={a} skipped={s}")
                total_added += a
                total_skipped += s

    print(f"\nDone. Added fit_profile to {total_added} items, skipped {total_skipped}.")


if __name__ == "__main__":
    main()
