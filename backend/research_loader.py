"""
Research Data Loader for AthlyticAI.
Loads and indexes research JSON data (skills, videos, equipment) for all sports.
Data is loaded once at import time and cached in memory for fast lookups.
"""

import json
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# ─── Resolve research folder path ───
_BACKEND_DIR = Path(__file__).parent
# Try multiple locations: backend/research (Vercel), sportsapp/research (local)
RESEARCH_DIR = _BACKEND_DIR / "research"
if not RESEARCH_DIR.exists():
    RESEARCH_DIR = _BACKEND_DIR.parent.parent / "research"  # sportsapp/research

SUPPORTED_RESEARCH_SPORTS = [
    "badminton", "table_tennis", "tennis", "pickleball",
    "cricket", "football", "swimming",
]

# ─── In-memory data store ───
_skills_data: Dict[str, dict] = {}      # sport -> full skills.json content
_videos_data: Dict[str, dict] = {}      # sport -> full videos.json content
_equipment_data: Dict[str, dict] = {}   # sport -> full equipment.json content

# Indexed lookups (built after loading)
_skill_index: Dict[str, Dict[str, dict]] = {}       # sport -> {skill_id: skill}
_video_index: Dict[str, Dict[str, dict]] = {}       # sport -> {video_id: video}
_video_by_skill: Dict[str, Dict[str, list]] = {}    # sport -> {skill_id: [videos]}
_equipment_by_category: Dict[str, Dict[str, list]] = {}  # sport -> {category: [items]}

_loaded = False


def _load_all():
    """Load all 18 JSON files and build indexes. Called once."""
    global _loaded
    if _loaded:
        return

    if not RESEARCH_DIR.exists():
        logger.warning(f"Research directory not found at {RESEARCH_DIR}. Research features disabled.")
        _loaded = True
        return

    for sport in SUPPORTED_RESEARCH_SPORTS:
        sport_dir = RESEARCH_DIR / sport
        if not sport_dir.exists():
            logger.warning(f"Research folder missing for sport: {sport}")
            continue

        # Load skills
        skills_path = sport_dir / "skills.json"
        if skills_path.exists():
            try:
                with open(skills_path, "r", encoding="utf-8") as f:
                    _skills_data[sport] = json.load(f)
                # Build skill index
                _skill_index[sport] = {}
                for skill in _skills_data[sport].get("skill_areas", []):
                    _skill_index[sport][skill["id"]] = skill
            except Exception as e:
                logger.error(f"Failed to load {skills_path}: {e}")

        # Load videos
        videos_path = sport_dir / "videos.json"
        if videos_path.exists():
            try:
                with open(videos_path, "r", encoding="utf-8") as f:
                    _videos_data[sport] = json.load(f)
                # Build video index and skill->videos mapping
                _video_index[sport] = {}
                _video_by_skill[sport] = {}
                for video in _videos_data[sport].get("videos", []):
                    _video_index[sport][video["id"]] = video
                    for skill_id in video.get("skill_areas", []):
                        _video_by_skill[sport].setdefault(skill_id, []).append(video)
            except Exception as e:
                logger.error(f"Failed to load {videos_path}: {e}")

        # Load equipment
        equip_path = sport_dir / "equipment.json"
        if equip_path.exists():
            try:
                with open(equip_path, "r", encoding="utf-8") as f:
                    _equipment_data[sport] = json.load(f)
                # Build category index
                _equipment_by_category[sport] = {}
                for cat in _equipment_data[sport].get("equipment_categories", []):
                    cat_name = cat.get("category", "unknown")
                    items = cat.get("items", [])
                    _equipment_by_category[sport][cat_name] = items
            except Exception as e:
                logger.error(f"Failed to load {equip_path}: {e}")

    loaded_sports = list(_skills_data.keys())
    logger.info(f"Research data loaded for {len(loaded_sports)} sports: {loaded_sports}")
    _loaded = True


# ─── Auto-load on import ───
_load_all()


# ═══════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════


def get_videos_for_skill(
    sport: str,
    skill_id: str,
    level: Optional[str] = None,
    content_type: Optional[str] = None,
) -> List[dict]:
    """
    Return videos matching a specific skill area.
    Optionally filter by level (beginner/intermediate/advanced) and content_type.
    """
    _load_all()
    videos = _video_by_skill.get(sport, {}).get(skill_id, [])

    results = []
    for v in videos:
        if level and v.get("level", "").lower() != level.lower():
            continue
        if content_type and v.get("content_type", "").lower() != content_type.lower():
            continue
        results.append(v)

    return results


def get_all_videos(sport: str, level: Optional[str] = None) -> List[dict]:
    """Return all videos for a sport, optionally filtered by level."""
    _load_all()
    videos = _videos_data.get(sport, {}).get("videos", [])
    if level:
        videos = [v for v in videos if v.get("level", "").lower() == level.lower()]
    return videos


def get_equipment_by_budget(
    sport: str,
    category: str,
    budget_min: float,
    budget_max: float,
    level: Optional[str] = None,
) -> List[dict]:
    """
    Return equipment items within a budget range (INR).
    Strictly respects budget - never returns items above budget_max.
    """
    _load_all()
    sport_cats = _equipment_by_category.get(sport, {})
    items = sport_cats.get(category, [])
    # Try plural/singular variants if not found
    if not items:
        variants = {
            "racket": "rackets", "rackets": "racket",
            "shoe": "shoes", "shoes": "shoe",
            "string": "strings", "strings": "string",
            "grip": "grips", "grips": "grip",
            "shuttlecock": "shuttlecocks", "shuttlecocks": "shuttlecock",
            "ball": "balls", "balls": "ball",
            "rubber": "rubbers", "rubbers": "rubber",
            "blade": "blades", "blades": "blade",
            "paddle": "paddles", "paddles": "paddle",
            "bat": "bats", "bats": "bat",
            "accessory": "accessories", "accessories": "accessory",
            "ready_made_racket": "ready_made_rackets", "ready_made_rackets": "ready_made_racket",
            "premade_racket": "ready_made_rackets", "premade_rackets": "ready_made_rackets",
        }
        alt = variants.get(category)
        if alt:
            items = sport_cats.get(alt, [])

    results = []
    for item in items:
        price_range = item.get("price_ranges", {}).get("INR", {})
        item_min = price_range.get("min", 0)
        item_max = price_range.get("max", 999999)

        # Item must be affordable: its minimum price must be UNDER budget max
        if item_min >= budget_max:
            continue
        # Item shouldn't be too cheap for the range
        if budget_min > 0 and item_max < budget_min:
            continue

        # Level filter
        if level:
            item_level = item.get("level", "").lower()
            if item_level and item_level != level.lower():
                continue

        results.append(item)

    # Sort by price (cheapest first within budget)
    results.sort(key=lambda x: x.get("price_ranges", {}).get("INR", {}).get("min", 0))
    return results


def get_all_equipment_categories(sport: str) -> Dict[str, list]:
    """Return all equipment categories and items for a sport."""
    _load_all()
    return _equipment_by_category.get(sport, {})


def get_skill_progression(sport: str, skill_id: str) -> Optional[dict]:
    """Return the progression path for a specific skill."""
    _load_all()
    skill = _skill_index.get(sport, {}).get(skill_id)
    if not skill:
        return None

    progression = skill.get("progression_path", {})
    next_skills = []
    for next_id in progression.get("next", []):
        next_skill = _skill_index.get(sport, {}).get(next_id)
        if next_skill:
            next_skills.append({
                "id": next_id,
                "name": next_skill.get("name"),
                "level": next_skill.get("level"),
                "description": next_skill.get("description"),
            })

    return {
        "current": {
            "id": skill_id,
            "name": skill.get("name"),
            "level": skill.get("level"),
        },
        "next_steps": next_skills,
        "description": progression.get("description", ""),
    }


def get_drills_for_issues(sport: str, issues_list: List[str]) -> List[dict]:
    """
    Map detected issues (from video analysis) to relevant drills and videos.
    Searches pain_points and common_mistakes in skill areas for matches.
    """
    _load_all()
    skills = _skill_index.get(sport, {})
    if not skills:
        return []

    results = []
    seen_skills = set()

    for issue in issues_list:
        issue_lower = issue.lower()
        for skill_id, skill in skills.items():
            if skill_id in seen_skills:
                continue

            # Check pain_points
            pain_match = any(issue_lower in pp.lower() for pp in skill.get("pain_points", []))

            # Check common_mistakes
            mistake_match = False
            matched_fix = None
            for cm in skill.get("common_mistakes", []):
                if isinstance(cm, dict):
                    if issue_lower in cm.get("mistake", "").lower():
                        mistake_match = True
                        matched_fix = cm
                        break
                elif isinstance(cm, str):
                    if issue_lower in cm.lower():
                        mistake_match = True
                        break

            if pain_match or mistake_match:
                seen_skills.add(skill_id)
                # Get related videos
                videos = _video_by_skill.get(sport, {}).get(skill_id, [])[:3]

                entry = {
                    "skill_id": skill_id,
                    "skill_name": skill.get("name"),
                    "matched_issue": issue,
                    "drills": skill.get("drills", [])[:3],
                    "videos": [
                        {"id": v["id"], "title": v["title"], "channel": v["channel"],
                         "url": v["url"], "level": v.get("level"), "language": v.get("language")}
                        for v in videos
                    ],
                }
                if matched_fix and isinstance(matched_fix, dict):
                    entry["fix"] = matched_fix.get("fix", "")
                    # Also attach the specific video ref
                    ref = matched_fix.get("video_ref")
                    if ref and ref in _video_index.get(sport, {}):
                        ref_video = _video_index[sport][ref]
                        entry["fix_video"] = {
                            "id": ref_video["id"],
                            "title": ref_video["title"],
                            "channel": ref_video["channel"],
                            "url": ref_video["url"],
                        }

                results.append(entry)

    return results


def get_player_profile_recommendations(
    sport: str,
    personality_tags: List[str],
) -> dict:
    """
    Return recommended focus areas and skills based on player personality tags.
    Also returns the player_profiles and personality_profiles from skills.json.
    """
    _load_all()
    data = _skills_data.get(sport, {})
    all_skills = _skill_index.get(sport, {})

    # Find skills matching personality tags
    matching_skills = []
    for skill_id, skill in all_skills.items():
        skill_tags = skill.get("personality_tags", [])
        overlap = set(personality_tags) & set(skill_tags)
        if overlap or "all_players" in skill_tags:
            matching_skills.append({
                "id": skill_id,
                "name": skill.get("name"),
                "level": skill.get("level"),
                "description": skill.get("description"),
                "matched_tags": list(overlap) if overlap else ["all_players"],
            })

    # Get personality profiles
    personality_profiles = data.get("personality_profiles", {})
    matched_profiles = {}
    for tag in personality_tags:
        if tag in personality_profiles:
            matched_profiles[tag] = personality_profiles[tag]

    # Get player level profiles
    player_profiles = data.get("player_profiles", {})

    return {
        "recommended_skills": matching_skills,
        "personality_profiles": matched_profiles,
        "player_level_profiles": player_profiles,
    }


def get_all_skills(sport: str) -> dict:
    """Return the complete skills data for a sport."""
    _load_all()
    data = _skills_data.get(sport, {})
    return {
        "sport": sport,
        "skill_areas": data.get("skill_areas", []),
        "player_profiles": data.get("player_profiles", {}),
        "personality_profiles": data.get("personality_profiles", {}),
    }


def get_skill_by_id(sport: str, skill_id: str) -> Optional[dict]:
    """Get a single skill by ID."""
    _load_all()
    return _skill_index.get(sport, {}).get(skill_id)


def get_research_sports() -> List[str]:
    """Return list of sports that have research data loaded."""
    _load_all()
    return list(_skills_data.keys())


def get_videos_for_issues(
    sport: str,
    issues: List[str],
    level: Optional[str] = None,
    prefer_hindi: bool = False,
    prefer_shorts: bool = False,
    max_results: int = 10,
) -> List[dict]:
    """
    Find videos that address specific issues. Useful for training recommendations.
    Prioritizes Hindi/Indian content and Shorts if requested.
    """
    _load_all()
    drill_results = get_drills_for_issues(sport, issues)

    # Collect unique videos from drill results
    seen_ids = set()
    all_videos = []
    for dr in drill_results:
        for v in dr.get("videos", []):
            if v["id"] not in seen_ids:
                seen_ids.add(v["id"])
                all_videos.append(v)
        fix_v = dr.get("fix_video")
        if fix_v and fix_v["id"] not in seen_ids:
            seen_ids.add(fix_v["id"])
            all_videos.append(fix_v)

    # If not enough, supplement with level-matched videos
    if len(all_videos) < max_results and level:
        for v in get_all_videos(sport, level):
            if v["id"] not in seen_ids:
                seen_ids.add(v["id"])
                all_videos.append({
                    "id": v["id"], "title": v["title"], "channel": v["channel"],
                    "url": v["url"], "level": v.get("level"), "language": v.get("language"),
                    "has_shorts": v.get("has_shorts"), "content_type": v.get("content_type"),
                })
            if len(all_videos) >= max_results * 2:
                break

    # Score and sort
    def _score(v):
        s = 0
        if prefer_hindi and v.get("language", "").lower() in ("hindi", "hindi/english"):
            s += 10
        if prefer_shorts and v.get("has_shorts"):
            s += 5
        if prefer_shorts and v.get("content_type") == "shorts":
            s += 8
        if level and v.get("level", "").lower() == level.lower():
            s += 5
        return s

    all_videos.sort(key=_score, reverse=True)
    return all_videos[:max_results]


def build_weekly_plan_from_skills(
    sport: str,
    skill_level: str,
    focus_issues: List[str] = None,
    days_per_week: int = 5,
) -> List[dict]:
    """
    Build a weekly training plan using research data skills, drills, and videos.
    Returns a list of day plans.
    """
    _load_all()
    data = _skills_data.get(sport, {})
    player_profiles = data.get("player_profiles", {})
    level_key = skill_level.lower().replace("+", "").strip()

    # Get focus areas for this level
    level_profile = player_profiles.get(level_key, player_profiles.get("beginner", {}))
    focus_skill_ids = level_profile.get("focus_areas", [])

    # If we have specific issues, prioritize skills addressing them
    issue_skills = []
    if focus_issues:
        drill_results = get_drills_for_issues(sport, focus_issues)
        issue_skills = [dr["skill_id"] for dr in drill_results]

    # Merge: issue skills first, then level-appropriate skills
    ordered_skills = []
    seen = set()
    for sid in issue_skills + focus_skill_ids:
        if sid not in seen and sid in _skill_index.get(sport, {}):
            seen.add(sid)
            ordered_skills.append(sid)

    # If still short, add any remaining skills
    for sid in _skill_index.get(sport, {}):
        if sid not in seen:
            seen.add(sid)
            ordered_skills.append(sid)

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    plan = []

    for i in range(min(days_per_week, 7)):
        skill_idx = i % len(ordered_skills) if ordered_skills else 0
        skill_id = ordered_skills[skill_idx] if ordered_skills else None
        skill = _skill_index.get(sport, {}).get(skill_id) if skill_id else None

        if not skill:
            continue

        videos = _video_by_skill.get(sport, {}).get(skill_id, [])[:2]
        video_list = [
            {"id": v["id"], "title": v["title"], "channel": v["channel"],
             "url": v["url"], "level": v.get("level"), "language": v.get("language")}
            for v in videos
        ]

        plan.append({
            "day": day_names[i],
            "focus": skill.get("name", "General Training"),
            "skill_id": skill_id,
            "drills": skill.get("drills", [])[:3],
            "videos": video_list,
            "duration": "30-45 min",
        })

    return plan
