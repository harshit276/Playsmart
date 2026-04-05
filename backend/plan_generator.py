"""
AthlyticAI Dynamic Training Plan Generator

Creates personalized 30-day plans by selecting from the curated drill database
based on: skill level, play style, goals, injuries, and AI-detected weaknesses.

Rules decide. Data is curated. Nothing is hallucinated.
"""

import random


# === Play style → which drill categories to prioritize ===
STYLE_FOCUS = {
    "Power": {
        "primary": ["Smash Power", "Stamina"],
        "secondary": ["Footwork", "Defense"],
        "ratio": {"Smash Power": 0.25, "Stamina": 0.20, "Footwork": 0.15, "Defense": 0.15, "Shot Consistency": 0.10, "Net Play": 0.10, "Court Movement": 0.05},
    },
    "Speed": {
        "primary": ["Footwork", "Court Movement"],
        "secondary": ["Reaction Speed", "Stamina"],
        "ratio": {"Footwork": 0.25, "Court Movement": 0.20, "Reaction Speed": 0.15, "Stamina": 0.15, "Shot Consistency": 0.10, "Net Play": 0.10, "Smash Power": 0.05},
    },
    "Control": {
        "primary": ["Shot Consistency", "Net Play"],
        "secondary": ["Footwork", "Defense"],
        "ratio": {"Shot Consistency": 0.25, "Net Play": 0.20, "Footwork": 0.15, "Defense": 0.15, "Stamina": 0.10, "Court Movement": 0.10, "Smash Power": 0.05},
    },
    "Defense": {
        "primary": ["Defense", "Footwork"],
        "secondary": ["Stamina", "Court Movement"],
        "ratio": {"Defense": 0.25, "Footwork": 0.20, "Stamina": 0.15, "Court Movement": 0.15, "Shot Consistency": 0.10, "Net Play": 0.10, "Smash Power": 0.05},
    },
    "All-round": {
        "primary": ["Shot Consistency", "Footwork"],
        "secondary": ["Net Play", "Stamina"],
        "ratio": {"Shot Consistency": 0.18, "Footwork": 0.16, "Net Play": 0.14, "Stamina": 0.14, "Defense": 0.12, "Court Movement": 0.12, "Smash Power": 0.10, "Reaction Speed": 0.04},
    },
}

# === Skill level → allowed drill difficulties ===
SKILL_DIFFICULTIES = {
    "Beginner": ["Beginner"],
    "Beginner+": ["Beginner", "Beginner+"],
    "Intermediate": ["Beginner+", "Intermediate"],
    "Advanced": ["Intermediate", "Advanced"],
}

# === Injury → categories to reduce/avoid ===
INJURY_AVOID = {
    "elbow": ["Smash Power"],
    "shoulder": ["Smash Power"],
    "wrist": ["Smash Power", "Net Play"],
    "knee": ["Footwork", "Court Movement", "Stamina"],
    "none": [],
}

# === AI weakness area → drill skill_focus mapping ===
WEAKNESS_TO_FOCUS = {
    "technique": "Shot Consistency",
    "footwork": "Footwork",
    "stance": "Footwork",
    "posture": "Court Movement",
    "reach": "Net Play",
    "power": "Smash Power",
    "speed": "Footwork",
    "endurance": "Stamina",
    "defense": "Defense",
    "reaction": "Reaction Speed",
}

# === Weekly themes by skill level ===
WEEKLY_THEMES = {
    "Beginner": ["Learning the Basics", "Building Consistency", "Adding Variety", "Putting It Together"],
    "Beginner+": ["Foundation Strengthening", "Shot Development", "Game Awareness", "Match Preparation"],
    "Intermediate": ["Technical Refinement", "Tactical Development", "Power & Speed", "Competition Ready"],
    "Advanced": ["Explosive Performance", "Tactical Mastery", "Peak Conditioning", "Tournament Ready"],
}


def generate_personalized_plan(profile, drills, weaknesses=None):
    """
    Generate a personalized 30-day training plan.

    Args:
        profile: Player profile dict (skill_level, play_style, primary_goal, injury_history)
        drills: List of all drill dicts from database
        weaknesses: Optional list of weakness dicts from AI video analysis

    Returns:
        Plan dict with weeks, days, drill IDs, and metadata
    """
    skill = profile.get("skill_level", "Beginner")
    style = profile.get("play_style", "All-round")
    goal = profile.get("primary_goal", "Consistency")
    injury = profile.get("injury_history", "none")

    # Get config
    allowed_diffs = SKILL_DIFFICULTIES.get(skill, ["Beginner", "Beginner+"])
    style_config = STYLE_FOCUS.get(style, STYLE_FOCUS["All-round"])
    avoid_categories = INJURY_AVOID.get(injury, [])
    themes = WEEKLY_THEMES.get(skill, WEEKLY_THEMES["Beginner"])

    # Build drill pool: filter by difficulty and remove injury-risky ones
    drill_pool = {}
    for d in drills:
        if d.get("difficulty") not in allowed_diffs:
            continue
        focus = d.get("skill_focus", "")
        if focus in avoid_categories:
            continue
        drill_pool.setdefault(focus, []).append(d)

    # Adjust ratios based on AI-detected weaknesses
    ratios = dict(style_config["ratio"])

    if weaknesses:
        for w in weaknesses:
            area = w.get("area", "").lower() if isinstance(w, dict) else ""
            mapped_focus = WEAKNESS_TO_FOCUS.get(area)
            if mapped_focus and mapped_focus in ratios and mapped_focus not in avoid_categories:
                # Boost weak areas by 50%
                ratios[mapped_focus] = ratios.get(mapped_focus, 0.10) * 1.5

    # Normalize ratios
    total = sum(ratios.values())
    if total > 0:
        ratios = {k: v / total for k, v in ratios.items()}

    # Calculate how many drill slots per category across 30 days
    # ~20 training days (10 rest days), 3 drills per day = ~60 drill slots
    total_slots = 60
    category_slots = {cat: max(1, round(ratio * total_slots)) for cat, ratio in ratios.items()}

    # Pick drills for each category (cycle through available drills, repeat as needed)
    selected = {}
    for cat, count in category_slots.items():
        pool = drill_pool.get(cat, [])
        if not pool:
            continue
        random.seed(hash(profile.get("user_id", "") + cat))  # Deterministic per user
        shuffled = list(pool)
        random.shuffle(shuffled)
        picks = []
        for i in range(count):
            picks.append(shuffled[i % len(shuffled)])
        selected[cat] = picks

    # Build 30-day plan
    plan_name = _get_plan_name(skill, style)
    plan_desc = _get_plan_description(skill, style, goal, weaknesses)

    # Session duration by skill
    base_duration = {"Beginner": 25, "Beginner+": 30, "Intermediate": 40, "Advanced": 50}.get(skill, 30)

    weeks = []
    drill_index = {cat: 0 for cat in selected}
    day_num = 0

    for week_num in range(1, 5):
        theme = themes[week_num - 1] if week_num <= len(themes) else "Training"
        days = []
        days_in_week = 7 if week_num < 4 else 9  # Week 4 has days 22-30

        for d in range(days_in_week):
            day_num += 1
            if day_num > 30:
                break

            # Rest pattern: every 2-3 training days
            is_rest = (day_num % 3 == 0) or (day_num % 7 == 0 and day_num % 3 != 0)

            if is_rest:
                days.append({
                    "day": day_num,
                    "focus_area": "Recovery",
                    "drills": [],
                    "duration_minutes": 0,
                    "type": "rest",
                })
                continue

            # Pick 3 drills for this day from prioritized categories
            day_drills = []
            day_focus = _get_day_focus(day_num, week_num, style_config, weaknesses)
            used_ids = set()

            # Pick from prioritized categories
            for cat in day_focus:
                if cat in selected:
                    idx = drill_index.get(cat, 0) % len(selected[cat])
                    drill = selected[cat][idx]
                    if drill["id"] not in used_ids:
                        day_drills.append(drill)
                        used_ids.add(drill["id"])
                        drill_index[cat] = idx + 1
                if len(day_drills) >= 3:
                    break

            # Fill up to 3 drills from any category
            if len(day_drills) < 3:
                for cat in selected:
                    if len(day_drills) >= 3:
                        break
                    idx = drill_index.get(cat, 0) % len(selected[cat])
                    drill = selected[cat][idx]
                    if drill["id"] not in used_ids:
                        day_drills.append(drill)
                        used_ids.add(drill["id"])
                        drill_index[cat] = idx + 1

            # Progression: increase duration slightly each week
            duration = base_duration + (week_num - 1) * 5

            focus_area = day_drills[0]["skill_focus"] if day_drills else "General"
            if len(day_drills) > 1 and day_drills[0]["skill_focus"] != day_drills[1]["skill_focus"]:
                focus_area = f"{day_drills[0]['skill_focus']} + {day_drills[1]['skill_focus']}"

            days.append({
                "day": day_num,
                "focus_area": focus_area,
                "drills": [d["id"] for d in day_drills],
                "duration_minutes": duration,
                "type": "training",
            })

        weeks.append({
            "week": week_num,
            "theme": theme,
            "days": days,
        })

    plan = {
        "id": f"tp_personal_{profile.get('user_id', 'x')[:8]}",
        "name": plan_name,
        "level": skill,
        "duration_days": 30,
        "description": plan_desc,
        "personalized": True,
        "play_style": style,
        "primary_goal": goal,
        "weeks": weeks,
    }

    return plan


def _get_plan_name(skill, style):
    names = {
        ("Beginner", "Power"): "Power Foundations",
        ("Beginner", "Speed"): "Speed Starter",
        ("Beginner", "Control"): "Control Basics",
        ("Beginner", "Defense"): "Defensive Foundations",
        ("Intermediate", "Power"): "Power Builder",
        ("Intermediate", "Speed"): "Speed Surge",
        ("Intermediate", "Control"): "Precision Training",
        ("Intermediate", "Defense"): "Iron Wall Program",
        ("Advanced", "Power"): "Elite Power",
        ("Advanced", "Speed"): "Lightning Speed",
        ("Advanced", "Control"): "Master Control",
        ("Advanced", "Defense"): "Fortress Defense",
    }
    return names.get((skill, style), f"{skill} {style} Program")


def _get_plan_description(skill, style, goal, weaknesses):
    base = f"A personalized 30-day plan designed for {skill} level players with a {style} play style."

    if goal:
        goal_desc = {
            "Power": "Focused on building explosive smash power and overhead strength.",
            "Speed": "Emphasizes quick footwork, court coverage, and reaction time.",
            "Control": "Develops shot placement, consistency, and tactical awareness.",
            "Consistency": "Builds reliable technique and reduces unforced errors.",
            "Defense": "Strengthens defensive positioning and counter-attack ability.",
        }
        base += " " + goal_desc.get(goal, "")

    if weaknesses:
        weak_areas = [w.get("area", "") for w in weaknesses if isinstance(w, dict)][:2]
        if weak_areas:
            base += f" Extra focus on: {', '.join(weak_areas).lower()}."

    return base


def _get_day_focus(day_num, week_num, style_config, weaknesses):
    """Determine which categories to prioritize for a given day."""
    primary = style_config["primary"]
    secondary = style_config["secondary"]

    # Rotate focus across the week
    cycle = day_num % 4
    if cycle == 0:
        focus = primary + secondary
    elif cycle == 1:
        focus = primary + ["Stamina"]
    elif cycle == 2:
        focus = secondary + primary
    else:
        focus = list(style_config["ratio"].keys())

    # If we have AI weaknesses, inject them into every other day
    if weaknesses and day_num % 2 == 0:
        for w in weaknesses[:2]:
            area = w.get("area", "").lower() if isinstance(w, dict) else ""
            mapped = WEAKNESS_TO_FOCUS.get(area)
            if mapped:
                focus.insert(0, mapped)

    return focus
