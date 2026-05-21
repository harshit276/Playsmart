"""Hybrid equipment recommender — the proprietary engine.

Pipeline:
    1. Optional: parse user's free-text description into structured tags via Gemini
    2. Filter the catalog by sport + category + budget
    3. Deterministic weighted scoring against the query (uses fit_profile)
    4. Take top N, ask Gemini to produce a why-this-fits chain per item
    5. Return ranked list + one-paragraph rationale

LLM is the bookend (intent parsing + explanation generation), never the
ranker. Scoring is reproducible + auditable + cheap.
"""
from __future__ import annotations

import json
import os
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("equipment_recommend")


def _pick_gemini_model() -> str:
    """gemini-2.0-flash is retired for new accounts. If env still has the
    old name (left over from earlier work) silently upgrade to 2.5-flash."""
    m = (os.getenv("GEMINI_MODEL") or "").strip()
    if not m or m == "gemini-2.0-flash":
        return "gemini-2.5-flash"
    return m

# ─── Catalog loading ─────────────────────────────────────────────────

# We look for sport JSONs in 2 places — prefer the frontend copy (kept fresh
# by the enrichment script) and fall back to backend research dir.
_CATALOG_PATHS = [
    Path(__file__).parent.parent / "frontend" / "public" / "data" / "equipment",
    Path(__file__).parent / "research",
]

_CATALOG_CACHE: Dict[str, List[dict]] = {}


def _load_sport_catalog(sport: str) -> List[dict]:
    """Return a flat list of items for one sport, with _sport + _category injected."""
    if sport in _CATALOG_CACHE:
        return _CATALOG_CACHE[sport]
    for base in _CATALOG_PATHS:
        # frontend uses <sport>.json directly; backend research uses <sport>/equipment.json
        candidates = [base / f"{sport}.json", base / sport / "equipment.json"]
        for p in candidates:
            if not p.exists():
                continue
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"failed to parse {p}: {e}")
                continue
            items = []
            for cat in data.get("equipment_categories") or []:
                for it in cat.get("items") or []:
                    items.append({**it, "_sport": sport, "_category": cat.get("category")})
            _CATALOG_CACHE[sport] = items
            return items
    _CATALOG_CACHE[sport] = []
    return []


def invalidate_catalog(sport: Optional[str] = None) -> None:
    if sport:
        _CATALOG_CACHE.pop(sport, None)
    else:
        _CATALOG_CACHE.clear()


# ─── Pricing helper ─────────────────────────────────────────────────

def _lowest_price(item: dict) -> Optional[int]:
    prices = [p.get("price") for p in (item.get("marketplace_prices") or []) if isinstance(p.get("price"), (int, float))]
    if prices:
        return int(min(prices))
    rng = (item.get("price_ranges") or {}).get("INR")
    if rng and rng.get("min"):
        return int(rng["min"])
    return None


# ─── Free-text intent parsing (LLM) ─────────────────────────────────

# Vocabularies — keep in sync with equipment_fit_schema.py
_CONTEXTS = [
    "office_casual", "garden_backyard", "school_college", "club_recreational",
    "club_competitive", "academy_training", "tournament_open", "tournament_elite",
    "beach_outdoor",
]
_STYLES = [
    "all_round", "attacker", "defender", "counter_attacker", "looper",
    "blocker", "serve_volley", "baseline", "power_hitter", "control_focused",
    "speed_focused", "spin_focused",
]
_GOALS = ["improve_technique", "win_matches", "stay_fit", "casual_fun", "kids_starter"]
_BODY = [
    "junior_or_light", "average_adult", "heavy_player", "small_hand_grip",
    "wide_hand_grip", "wrist_problem_friendly",
]

_INTENT_PROMPT = """You are an equipment recommender's intent parser. Given a sport and a
short, conversational description of the user's situation, extract structured tags.

Output ONLY a JSON object with these keys (omit any you can't infer):
- inferred_skill_level: one of "beginner" | "intermediate" | "advanced" | "pro"
- inferred_goal: one of {goals}
- inferred_context: one of {contexts}
- inferred_styles: array (subset of {styles})
- inferred_body_fit: array (subset of {body})
- emphasis: array of free-text keywords from the description that should boost
  matching attributes (e.g. ["forehand", "power", "lightweight", "durable"])
- budget_hint_inr: integer if the user mentions a budget; else null
- avoid_keywords: array of free-text the user says they DON'T want
- notes: one short sentence summarising what the user is really asking for

Sport: {sport}
User description: {description}
"""


def parse_intent(description: str, sport: str) -> Dict[str, Any]:
    """LLM-assisted: convert "I play in office basement, twice a week, want
    power on forehand" into structured tags. Returns {} on failure — caller
    treats absence as "no extra signal" rather than erroring."""
    if not description or len(description.strip()) < 4:
        return {}
    if not os.environ.get("GEMINI_API_KEY"):
        return {}
    try:
        import google.generativeai as genai
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(_pick_gemini_model())
        prompt = _INTENT_PROMPT.format(
            sport=sport,
            description=description[:600],
            goals=json.dumps(_GOALS),
            contexts=json.dumps(_CONTEXTS),
            styles=json.dumps(_STYLES),
            body=json.dumps(_BODY),
        )
        resp = model.generate_content(
            [{"text": prompt}],
            generation_config={"temperature": 0.0, "response_mime_type": "application/json"},
        )
        return json.loads(resp.text or "{}")
    except Exception as e:
        logger.warning(f"parse_intent failed: {e}")
        return {}


# ─── Deterministic scoring ──────────────────────────────────────────

# Tier order used for skill-level distance
_TIERS = ["beginner", "intermediate", "advanced", "pro"]


def _skill_score(item_levels: List[str], user_level: Optional[str]) -> int:
    if not user_level:
        return 70
    if not item_levels:
        # Fall back to item.level if no fit_profile
        return 70
    ui = _TIERS.index(user_level) if user_level in _TIERS else -1
    if ui < 0:
        return 70
    # Best match: exact level present. ±1 tier: 75. ±2: 45.
    best = 0
    for lvl in item_levels:
        if lvl not in _TIERS:
            continue
        gap = abs(_TIERS.index(lvl) - ui)
        score = 100 if gap == 0 else 75 if gap == 1 else 45 if gap == 2 else 20
        best = max(best, score)
    return best or 70


def _budget_score(item: dict, lo: Optional[int], hi: Optional[int]) -> int:
    price = _lowest_price(item)
    if price is None:
        return 60
    if lo is None and hi is None:
        return 80
    lo = lo or 0
    hi = hi or 10**9
    if price < lo:
        # cheaper than asked — fine, slight penalty for being TOO cheap (quality concern)
        return 75
    if price > hi:
        over = price / max(hi, 1)
        if over < 1.2:
            return 50
        if over < 1.5:
            return 25
        return 10
    span = hi - lo or 1
    pct = (price - lo) / span  # 0..1, lower end = better value
    return int(100 - pct * 25)


def _list_overlap_score(item_list: List[str], target: Optional[str]) -> int:
    if not target:
        return 70
    if not item_list:
        return 60
    return 100 if target in item_list else 30


def _context_score(profile: dict, user_context: Optional[str]) -> int:
    if not user_context:
        return 70
    anti = profile.get("anti_contexts") or []
    if user_context in anti:
        return 15
    ok = profile.get("playing_contexts") or []
    return 95 if user_context in ok else 55


def _body_score(profile_body: List[str], user_body: Optional[List[str]]) -> int:
    if not user_body:
        return 70
    if not profile_body:
        return 65
    hits = sum(1 for b in user_body if b in profile_body)
    return min(100, 60 + hits * 20)


def _emphasis_attribute_boost(attrs: Dict[str, int], emphasis: List[str]) -> int:
    """Convert user-described emphasis keywords into a 0-100 attribute boost.

    Example: emphasis=["power", "fast"] -> high score if item has power+speed
    > 70. Maps loose keywords to known attribute axes.
    """
    if not emphasis or not attrs:
        return 70
    keyword_to_attr = {
        "power": "power", "powerful": "power", "smash": "power", "attacking": "power",
        "control": "control", "consistent": "control", "accuracy": "control", "placement": "control",
        "speed": "speed", "fast": "speed", "light": "speed", "lightweight": "speed", "quick": "speed",
        "spin": "spin", "topspin": "spin", "loop": "spin",
        "forgiving": "forgiveness", "beginner": "forgiveness", "easy": "forgiveness",
        "durable": "durability", "lasts": "durability", "tough": "durability",
    }
    matched = []
    for kw in emphasis or []:
        k = (kw or "").lower()
        attr = keyword_to_attr.get(k)
        if attr and attr in attrs:
            matched.append(attrs[attr])
    if not matched:
        return 70
    return int(sum(matched) / len(matched))


def score_item(item: dict, query: dict, parsed: Dict[str, Any]) -> Tuple[int, Dict[str, int], List[str], List[str]]:
    """Deterministic scoring. Returns (overall_score, breakdown, fits, careful).
    `fits` and `careful` are short bullets derived from why each axis scored
    well/poorly — these are the FALLBACK reasoning if LLM enrichment fails."""
    profile = item.get("fit_profile") or {}
    attrs = profile.get("attributes") or {}

    # Resolve user signals (structured query > LLM-parsed)
    user_skill = query.get("skill_level") or parsed.get("inferred_skill_level")
    user_goal = query.get("goal") or parsed.get("inferred_goal")
    user_context = query.get("context") or parsed.get("inferred_context")
    user_body = query.get("body_fit") or parsed.get("inferred_body_fit") or []
    user_style = (query.get("play_style") or "").lower() or None
    inferred_styles = parsed.get("inferred_styles") or []
    if not user_style and inferred_styles:
        user_style = inferred_styles[0]
    emphasis = parsed.get("emphasis") or []
    lo = query.get("budget_inr_min")
    hi = query.get("budget_inr_max")
    hint = parsed.get("budget_hint_inr")
    if hi is None and isinstance(hint, (int, float)):
        hi = int(hint)  # tight ceiling from text

    # Source skill levels: fit_profile.skill_levels first, fall back to legacy single `level`
    item_skill_levels = profile.get("skill_levels") or (
        [item["level"].lower()] if item.get("level") else []
    )

    skill = _skill_score(item_skill_levels, user_skill)
    budget = _budget_score(item, lo, hi)
    goal = _list_overlap_score(profile.get("goal_fit") or [], user_goal)
    context = _context_score(profile, user_context)
    style = _list_overlap_score(profile.get("playing_styles") or [], user_style)
    body = _body_score(profile.get("body_fit") or [], user_body if isinstance(user_body, list) else [user_body])
    emphasis_score = _emphasis_attribute_boost(attrs, emphasis)

    # Weighted blend — skill + budget dominate; emphasis injects user voice
    overall = int(
        skill * 0.28 +
        budget * 0.22 +
        goal * 0.14 +
        context * 0.12 +
        style * 0.08 +
        emphasis_score * 0.10 +
        body * 0.06
    )

    breakdown = {
        "skill": skill, "budget": budget, "goal": goal,
        "context": context, "style": style, "body": body,
        "emphasis": emphasis_score,
    }

    # Build fallback reasoning bullets — these get replaced by the LLM
    # enrichment step but always exist so the UI never goes empty.
    fits, careful = [], []
    if skill >= 80:
        fits.append(f"Designed for {(user_skill or 'your').lower()}-level play")
    elif skill <= 45:
        careful.append(f"This is sized for {item_skill_levels[0] if item_skill_levels else 'other'} players — likely a stretch")
    if budget >= 80:
        fits.append("Sits comfortably inside your budget")
    elif budget <= 30:
        careful.append("Above your budget — premium pick")
    if context == 95:
        fits.append(f"Well-suited to {user_context.replace('_', ' ')} play")
    elif context == 15:
        careful.append(f"Not the best match for {user_context.replace('_', ' ')} — better for serious play")
    if profile.get("standout_qualities"):
        fits.extend(profile["standout_qualities"][:1])
    if profile.get("common_complaints") and skill < 80:
        careful.extend(profile["common_complaints"][:1])

    return overall, breakdown, fits[:4], careful[:2]


# ─── Explanation enrichment (LLM) ───────────────────────────────────

_EXPLAIN_PROMPT = """You are a sports equipment expert writing a 2-3 sentence reasoning
chain for each pick on a recommendation page. Be concrete, honest, and helpful.

For each candidate item, output exactly:
- 2-3 "why_this_fits" bullets (each ≤14 words, concrete, references the item's
  actual specs/pros not generic platitudes)
- 0-2 "why_to_be_careful" bullets (≤14 words; only include real caveats)

User context: {context_summary}
Query budget: {budget_summary}
Goal: {goal}

Output JSON: {{"items": [{{"item_id": "...", "why_this_fits": [...], "why_to_be_careful": [...]}}, ...]}}

Candidates (top {n}):
{candidates}
"""


def enrich_reasoning(items: List[dict], query: dict, parsed: Dict[str, Any]) -> Dict[str, dict]:
    """Ask Gemini to write per-item reasoning chains. Returns {item_id: {fits, careful}}.
    Empty dict on failure — caller uses deterministic fallbacks."""
    if not items or not os.environ.get("GEMINI_API_KEY"):
        return {}
    try:
        import google.generativeai as genai
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel(_pick_gemini_model())

        # Compress each candidate so the prompt stays small
        def _slim(it):
            p = it.get("fit_profile") or {}
            return {
                "item_id": it.get("id"),
                "name": it.get("name"),
                "brand": it.get("brand"),
                "category": it.get("_category"),
                "price_inr": _lowest_price(it),
                "level": it.get("level"),
                "type": it.get("type"),
                "pros": (it.get("pros") or [])[:3],
                "cons": (it.get("cons") or [])[:2],
                "fit_attributes": p.get("attributes"),
                "best_for_persona": p.get("best_for_persona"),
                "not_for_persona": p.get("not_for_persona"),
                "playing_contexts": p.get("playing_contexts"),
                "anti_contexts": p.get("anti_contexts"),
            }

        prompt = _EXPLAIN_PROMPT.format(
            context_summary=parsed.get("notes") or query.get("description") or "no extra context",
            budget_summary=f"₹{query.get('budget_inr_min', 0)}-{query.get('budget_inr_max', 'any')}",
            goal=query.get("goal") or parsed.get("inferred_goal") or "general",
            n=len(items),
            candidates=json.dumps([_slim(it) for it in items], indent=1),
        )
        resp = model.generate_content(
            [{"text": prompt}],
            generation_config={"temperature": 0.1, "response_mime_type": "application/json"},
        )
        data = json.loads(resp.text or "{}")
        out = {}
        for entry in data.get("items") or []:
            iid = entry.get("item_id")
            if iid:
                out[iid] = {
                    "why_this_fits": entry.get("why_this_fits") or [],
                    "why_to_be_careful": entry.get("why_to_be_careful") or [],
                }
        return out
    except Exception as e:
        logger.warning(f"enrich_reasoning failed: {e}")
        return {}


# ─── Main entry point ───────────────────────────────────────────────

def recommend(query: dict) -> dict:
    """Run the full pipeline. `query` is a dict matching RecommendQuery."""
    sport = query.get("sport")
    if not sport:
        raise ValueError("sport is required")

    catalog = _load_sport_catalog(sport)
    parsed = parse_intent(query.get("description", ""), sport) if query.get("description") else {}

    # Filter by category if specified
    cat = query.get("category")
    pool = [it for it in catalog if not cat or it.get("_category") == cat]

    if not pool:
        return {
            "query": query,
            "parsed_intent": parsed,
            "items": [],
            "rationale": f"No catalog items found for sport={sport}" + (f", category={cat}" if cat else ""),
        }

    # Score everything
    scored: List[Tuple[int, Dict[str, int], List[str], List[str], dict]] = []
    for it in pool:
        s, brk, fits, careful = score_item(it, query, parsed)
        scored.append((s, brk, fits, careful, it))
    scored.sort(key=lambda t: t[0], reverse=True)

    # Take top N
    limit = int(query.get("limit", 5))
    top = scored[:limit]
    top_items = [t[4] for t in top]

    # LLM-enrich the top reasoning chains (best-effort — falls back to deterministic)
    enriched = enrich_reasoning(top_items, query, parsed)

    result_items = []
    for score, breakdown, fits, careful, item in top:
        iid = item.get("id")
        en = enriched.get(iid) or {}
        result_items.append({
            "item_id": iid,
            "sport": sport,
            "category": item.get("_category"),
            "name": item.get("name"),
            "brand": item.get("brand"),
            "cheapest_price_inr": _lowest_price(item),
            "fit_score": score,
            "score_breakdown": breakdown,
            "why_this_fits": en.get("why_this_fits") or fits,
            "why_to_be_careful": en.get("why_to_be_careful") or careful,
            "item": item,
        })

    # 1-line rationale at the top
    rationale = parsed.get("notes") or (
        f"Top {len(result_items)} picks for "
        f"{query.get('skill_level') or 'any-level'} player"
        + (f", budget ₹{query.get('budget_inr_min', 0)}-{query.get('budget_inr_max', '')}" if query.get('budget_inr_max') else "")
        + (f", goal: {query.get('goal')}" if query.get('goal') else "")
        + "."
    )

    return {
        "query": query,
        "parsed_intent": parsed,
        "items": result_items,
        "rationale": rationale,
    }
