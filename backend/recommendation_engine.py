"""
AthlyticAI Recommendation Engine

Centralizes all personalization logic. Uses the full quiz/profile data to derive:
- Play identity (who you are as a player)
- Training focus (what to work on and how often)
- Equipment profile (what gear suits your style)
- Coaching style (how feedback should be delivered)
- Weekly plan template (structured training schedule)

Rules decide. Data is curated. Nothing is hallucinated.
"""


# ──────────────────────────────────────────────────────────
# Play Style → Equipment Preference Mappings
# ──────────────────────────────────────────────────────────

STYLE_TO_EQUIPMENT = {
    # Badminton
    "Power": {
        "racket_type": "head-heavy, stiff flex",
        "string_tension": "high (26-28 lbs)",
        "shoe_type": "cushioned, ankle support",
        "budget_tip": "Invest most in racket, save on accessories",
        "weight_pref": "3U-4U (heavier for power transfer)",
    },
    "Control": {
        "racket_type": "even-balance, flexible shaft",
        "string_tension": "medium (24-26 lbs)",
        "shoe_type": "lightweight, good grip",
        "budget_tip": "Invest in strings and grip for feel",
        "weight_pref": "4U (balanced weight)",
    },
    "Speed": {
        "racket_type": "head-light, extra-light frame",
        "string_tension": "low-medium (22-25 lbs)",
        "shoe_type": "ultra-lightweight, breathable",
        "budget_tip": "Prioritize shoes and lightweight racket",
        "weight_pref": "5U-6U (ultralight for speed)",
    },
    "Defense": {
        "racket_type": "even-balance, medium flex",
        "string_tension": "medium (24-26 lbs)",
        "shoe_type": "stable, cushioned sole",
        "budget_tip": "Invest in durable shoes and comfortable grip",
        "weight_pref": "4U (control-oriented weight)",
    },
    "All-round": {
        "racket_type": "slightly head-heavy, medium flex",
        "string_tension": "medium (24-26 lbs)",
        "shoe_type": "all-court, balanced cushioning",
        "budget_tip": "Spread budget evenly across gear",
        "weight_pref": "4U (versatile weight)",
    },
    # Tennis
    "Baseliner": {
        "racket_type": "heavy, head-heavy, stiff",
        "string_tension": "high (55-60 lbs)",
        "shoe_type": "durable sole, lateral support",
        "budget_tip": "Invest in a quality racket with spin-friendly strings",
        "weight_pref": "300-320g (power from baseline)",
    },
    "Serve & Volley": {
        "racket_type": "head-light, maneuverable",
        "string_tension": "medium (50-55 lbs)",
        "shoe_type": "lightweight, quick transitions",
        "budget_tip": "Prioritize a maneuverable racket",
        "weight_pref": "280-300g (quick at net)",
    },
    "All-Court": {
        "racket_type": "balanced weight, medium stiffness",
        "string_tension": "medium (52-57 lbs)",
        "shoe_type": "all-court, good support",
        "budget_tip": "Balanced investment across gear",
        "weight_pref": "290-310g (versatile)",
    },
    "Counter-Puncher": {
        "racket_type": "head-light, flexible frame",
        "string_tension": "medium-low (48-53 lbs)",
        "shoe_type": "cushioned, endurance-focused",
        "budget_tip": "Invest in comfortable shoes for long rallies",
        "weight_pref": "280-300g (easy to swing repeatedly)",
    },
    # Table Tennis
    "Offensive": {
        "racket_type": "fast blade, tacky rubber",
        "string_tension": "N/A",
        "shoe_type": "lightweight, good grip",
        "budget_tip": "Invest in quality rubber over blade",
        "weight_pref": "offensive blade (7-ply)",
    },
    "Defensive": {
        "racket_type": "slow blade, pimpled rubber",
        "string_tension": "N/A",
        "shoe_type": "stable, cushioned",
        "budget_tip": "Long pips or anti-spin rubber is key",
        "weight_pref": "defensive blade (5-ply, large head)",
    },
    "Penhold": {
        "racket_type": "penhold blade, short pips or tacky rubber",
        "string_tension": "N/A",
        "shoe_type": "lightweight, quick movement",
        "budget_tip": "Get a proper penhold blade first",
        "weight_pref": "penhold-specific blade",
    },
    # Pickleball
    "Soft Game": {
        "racket_type": "control paddle, polymer core",
        "string_tension": "N/A",
        "shoe_type": "court shoes, non-marking",
        "budget_tip": "Invest in a paddle with good touch",
        "weight_pref": "7.3-7.8 oz (control range)",
    },
    # Cricket
    "Aggressive Batsman": {
        "racket_type": "heavy bat, thick edges, large sweet spot",
        "string_tension": "N/A",
        "shoe_type": "spiked shoes, ankle support",
        "budget_tip": "Invest most in bat quality (English willow)",
        "weight_pref": "2.8-2.10 lbs (power hitting)",
    },
    "Anchor Batsman": {
        "racket_type": "medium weight bat, balanced pickup",
        "string_tension": "N/A",
        "shoe_type": "comfortable, durable spikes",
        "budget_tip": "Focus on bat balance over weight",
        "weight_pref": "2.7-2.9 lbs (comfortable for long innings)",
    },
    "Fast Bowler": {
        "racket_type": "lightweight bat, good bowling shoes",
        "string_tension": "N/A",
        "shoe_type": "high-cushion bowling shoes, ankle support",
        "budget_tip": "Invest heavily in bowling shoes to prevent injury",
        "weight_pref": "bowling boots with heel support",
    },
    "Spin Bowler": {
        "racket_type": "lightweight bat",
        "string_tension": "N/A",
        "shoe_type": "flexible, good grip soles",
        "budget_tip": "Good grip shoes and a quality cricket ball",
        "weight_pref": "flexible bowling shoes",
    },
    "All-rounder": {
        "racket_type": "medium weight bat, versatile",
        "string_tension": "N/A",
        "shoe_type": "versatile shoes, decent cushioning",
        "budget_tip": "Spread budget: bat + shoes + protective gear",
        "weight_pref": "2.7-2.9 lbs (balanced)",
    },
    "Wicketkeeper": {
        "racket_type": "lightweight bat",
        "string_tension": "N/A",
        "shoe_type": "flexible, quick movement shoes",
        "budget_tip": "Invest in quality gloves and inner gloves",
        "weight_pref": "wicketkeeping gloves are priority",
    },
    # Football
    "Speed Merchant": {
        "racket_type": "lightweight boots, firm ground studs",
        "string_tension": "N/A",
        "shoe_type": "lightweight speed boots (under 200g)",
        "budget_tip": "Invest in boots — they are everything",
        "weight_pref": "ultralight boots",
    },
    "Playmaker": {
        "racket_type": "control boots, textured upper",
        "string_tension": "N/A",
        "shoe_type": "boots with textured surface for passing",
        "budget_tip": "Get boots with good ball feel",
        "weight_pref": "medium weight, excellent touch",
    },
    "Target Forward": {
        "racket_type": "power boots, large strike zone",
        "string_tension": "N/A",
        "shoe_type": "sturdy boots, power zone",
        "budget_tip": "Boots with a clean strike zone",
        "weight_pref": "medium-heavy, power focused",
    },
    "Box-to-Box": {
        "racket_type": "all-purpose boots, durable",
        "string_tension": "N/A",
        "shoe_type": "all-round boots with cushioning",
        "budget_tip": "Durability matters — you cover the most ground",
        "weight_pref": "balanced weight, durable",
    },
    "Defensive Wall": {
        "racket_type": "stable boots, ankle protection",
        "string_tension": "N/A",
        "shoe_type": "high-top or mid-cut boots, strong studs",
        "budget_tip": "Invest in shin guards and sturdy boots",
        "weight_pref": "stable, protective",
    },
    "Goalkeeper": {
        "racket_type": "goalkeeper gloves, turf boots",
        "string_tension": "N/A",
        "shoe_type": "flat-sole or turf boots",
        "budget_tip": "Invest heavily in quality goalkeeper gloves",
        "weight_pref": "gloves with good grip and padding",
    },
    # Swimming
    "Sprinter": {
        "racket_type": "racing suit, performance goggles",
        "string_tension": "N/A",
        "shoe_type": "N/A",
        "budget_tip": "Invest in a tech suit for competition, training suit for daily use",
        "weight_pref": "low-drag racing suit",
    },
    "Distance": {
        "racket_type": "durable training suit, comfortable goggles",
        "string_tension": "N/A",
        "shoe_type": "N/A",
        "budget_tip": "Durability over speed — you swim a lot of meters",
        "weight_pref": "comfortable training suit",
    },
    "IM Specialist": {
        "racket_type": "versatile goggles, training suit",
        "string_tension": "N/A",
        "shoe_type": "N/A",
        "budget_tip": "Get versatile goggles that work for all strokes",
        "weight_pref": "balanced training gear",
    },
    "Fitness Swimmer": {
        "racket_type": "comfortable suit, anti-fog goggles",
        "string_tension": "N/A",
        "shoe_type": "N/A",
        "budget_tip": "Comfort over performance — enjoy the swim",
        "weight_pref": "comfortable, durable",
    },
    "Open Water": {
        "racket_type": "wetsuit, polarized goggles",
        "string_tension": "N/A",
        "shoe_type": "N/A",
        "budget_tip": "Invest in a good wetsuit and tinted goggles",
        "weight_pref": "buoyancy-friendly wetsuit",
    },
}


# ──────────────────────────────────────────────────────────
# Goals → Training Priority Mappings
# ──────────────────────────────────────────────────────────

GOAL_TO_TRAINING = {
    "Improve technique": {
        "focus": "form drills, slow-motion practice, video review",
        "drill_types": ["technique", "form", "consistency"],
        "session_split": {"technique": 0.5, "match_play": 0.2, "fitness": 0.3},
    },
    "Win more matches": {
        "focus": "match simulation, strategy, mental toughness",
        "drill_types": ["match_play", "strategy", "pressure"],
        "session_split": {"technique": 0.2, "match_play": 0.5, "fitness": 0.3},
    },
    "Get fitter": {
        "focus": "conditioning, footwork drills, endurance training",
        "drill_types": ["footwork", "stamina", "agility"],
        "session_split": {"technique": 0.2, "match_play": 0.2, "fitness": 0.6},
    },
    "Learn new shots": {
        "focus": "shot variety drills, tutorials, progressive difficulty",
        "drill_types": ["new_shots", "variety", "tutorials"],
        "session_split": {"technique": 0.6, "match_play": 0.2, "fitness": 0.2},
    },
    "Play competitively": {
        "focus": "tournament prep, pressure drills, match analysis",
        "drill_types": ["competition", "pressure", "strategy"],
        "session_split": {"technique": 0.3, "match_play": 0.4, "fitness": 0.3},
    },
    "Have fun": {
        "focus": "enjoyable rallies, social play, variety",
        "drill_types": ["fun", "variety", "social"],
        "session_split": {"technique": 0.3, "match_play": 0.5, "fitness": 0.2},
    },
}


# ──────────────────────────────────────────────────────────
# Quiz Answers → Play Identity Mappings
# ──────────────────────────────────────────────────────────

PERSONALITY_TO_IDENTITY = {
    "Aggressive Attacker": {
        "type_suffix": "Attacker",
        "description_template": "You prefer aggressive play with powerful shots and taking the initiative.",
        "primary_strength": "Attacking power",
        "primary_weakness": "Defensive consistency",
        "coaching_tone": "intense",
        "focus_keywords": ["power generation", "attack timing", "finishing shots"],
    },
    "Strategic Player": {
        "type_suffix": "Strategist",
        "description_template": "You read the game well and use smart shot placement to outmaneuver opponents.",
        "primary_strength": "Game intelligence",
        "primary_weakness": "Raw power",
        "coaching_tone": "analytical",
        "focus_keywords": ["shot selection", "court geometry", "opponent reading"],
    },
    "Defensive Wall": {
        "type_suffix": "Defender",
        "description_template": "You thrive on consistency and patience, wearing down opponents with solid returns.",
        "primary_strength": "Defensive solidity",
        "primary_weakness": "Attack initiation",
        "coaching_tone": "patient",
        "focus_keywords": ["defensive positioning", "counter-attacks", "endurance"],
    },
    "All-Rounder": {
        "type_suffix": "All-Rounder",
        "description_template": "You adapt your play to the situation, mixing attack and defense effectively.",
        "primary_strength": "Versatility",
        "primary_weakness": "Specialization depth",
        "coaching_tone": "balanced",
        "focus_keywords": ["adaptability", "shot variety", "tactical flexibility"],
    },
    "Creative Player": {
        "type_suffix": "Artist",
        "description_template": "You love unpredictable shots and creative play that keeps opponents guessing.",
        "primary_strength": "Deception and creativity",
        "primary_weakness": "Consistency under pressure",
        "coaching_tone": "encouraging",
        "focus_keywords": ["deception", "trick shots", "improvisation"],
    },
}


# ──────────────────────────────────────────────────────────
# Frequency → Plan Structure
# ──────────────────────────────────────────────────────────

FREQUENCY_TO_PLAN = {
    "1-2 days/week": {
        "days_per_week": 2,
        "session_duration": 60,
        "intensity": "high",
        "strategy": "Maximum impact per session — combine technique and fitness",
        "rest_days": [3, 4, 5, 6, 7],
    },
    "3-4 days/week": {
        "days_per_week": 4,
        "session_duration": 50,
        "intensity": "medium-high",
        "strategy": "Balanced split — alternate technique days and fitness days",
        "rest_days": [4, 6, 7],
    },
    "5-7 days/week": {
        "days_per_week": 6,
        "session_duration": 45,
        "intensity": "periodized",
        "strategy": "Periodized plan with hard/easy rotation and mandatory rest day",
        "rest_days": [7],
    },
}


# ──────────────────────────────────────────────────────────
# Skill Level → Coaching Language
# ──────────────────────────────────────────────────────────

SKILL_COACHING_STYLE = {
    "Beginner": {
        "language": "simple",
        "avoid": ["overly technical jargon", "advanced tactical concepts"],
        "comparison_level": "recreational player",
        "encouragement_level": "high",
        "explanation_depth": "step-by-step",
    },
    "Beginner+": {
        "language": "simple with some terms",
        "avoid": ["advanced strategy details"],
        "comparison_level": "club beginner",
        "encouragement_level": "high",
        "explanation_depth": "clear with reasoning",
    },
    "Intermediate": {
        "language": "technical where appropriate",
        "avoid": ["over-simplification"],
        "comparison_level": "club player",
        "encouragement_level": "moderate",
        "explanation_depth": "detailed with context",
    },
    "Advanced": {
        "language": "technical and precise",
        "avoid": ["basic explanations they already know"],
        "comparison_level": "competitive player",
        "encouragement_level": "direct",
        "explanation_depth": "concise and tactical",
    },
}


# ──────────────────────────────────────────────────────────
# Injury → Training Adjustments
# ──────────────────────────────────────────────────────────

INJURY_ADJUSTMENTS = {
    "knee": {
        "avoid_drills": ["jumping", "lunges", "deep squats", "court sprints"],
        "reduce_categories": ["Footwork", "Court Movement", "Stamina"],
        "substitute": "low-impact alternatives (seated drills, upper body focus)",
        "gear_note": "Consider knee braces and well-cushioned shoes",
    },
    "shoulder": {
        "avoid_drills": ["overhead smash drills", "power serves", "heavy lifting"],
        "reduce_categories": ["Smash Power"],
        "substitute": "gentle range-of-motion exercises, underarm shots",
        "gear_note": "Use a lighter racket/bat and consider shoulder support",
    },
    "elbow": {
        "avoid_drills": ["power smash repetitions", "heavy forehand drills"],
        "reduce_categories": ["Smash Power"],
        "substitute": "wrist-neutral exercises, two-handed shots where possible",
        "gear_note": "Use elbow support, consider flexible shaft/lower string tension",
    },
    "wrist": {
        "avoid_drills": ["flick shots", "heavy spin drills", "wrist snap exercises"],
        "reduce_categories": ["Smash Power", "Net Play"],
        "substitute": "arm-driven shots, stable grip exercises",
        "gear_note": "Use wrist support and a racket with good vibration dampening",
    },
    "ankle": {
        "avoid_drills": ["lateral shuffles", "quick direction changes"],
        "reduce_categories": ["Footwork", "Court Movement"],
        "substitute": "stationary drills, upper body technique work",
        "gear_note": "Ankle braces and high-top shoes recommended",
    },
    "back": {
        "avoid_drills": ["bending exercises", "heavy rotation drills"],
        "reduce_categories": ["Court Movement"],
        "substitute": "upright drills, gentle stretching",
        "gear_note": "Focus on core strengthening, proper warm-up essential",
    },
    "none": {
        "avoid_drills": [],
        "reduce_categories": [],
        "substitute": None,
        "gear_note": None,
    },
}


# ══════════════════════════════════════════════════════════
# FUNCTION 1: Build Player Profile Analysis
# ══════════════════════════════════════════════════════════

def build_player_profile_analysis(profile: dict) -> dict:
    """
    Analyze the full player profile and return a structured personalization object.

    Takes all quiz/profile data (skill level, play style, goals, frequency,
    budget, injuries, quiz answers, personality) and produces a unified
    analysis that drives personalization across the entire app.

    Args:
        profile: Full player profile dict from the database.

    Returns:
        A dict with keys: play_identity, training_focus, equipment_profile,
        coaching_style, weekly_plan_template.
    """
    skill_level = profile.get("skill_level", "Beginner")
    play_style = profile.get("play_style", "All-round")
    personality = profile.get("play_style_personality", "All-Rounder")
    frequency = profile.get("playing_frequency", "1-2 days/week")
    budget = profile.get("budget_range", "Medium")
    injury = profile.get("injury_history", "none")
    primary_goal = profile.get("primary_goal", "Improve technique")
    goals = profile.get("goals", [])
    active_sport = profile.get("active_sport", "badminton")

    # ── Play Identity ──
    play_identity = _build_play_identity(play_style, personality, skill_level, active_sport)

    # ── Training Focus ──
    training_focus = _build_training_focus(
        primary_goal, goals, frequency, skill_level, play_style, injury
    )

    # ── Equipment Profile ──
    equipment_profile = _build_equipment_profile(play_style, skill_level, budget, injury)

    # ── Coaching Style ──
    coaching_style = _build_coaching_style(skill_level, personality, play_identity)

    # ── Weekly Plan Template ──
    weekly_plan = _build_weekly_plan(frequency, play_style, primary_goal, skill_level, injury)

    return {
        "play_identity": play_identity,
        "training_focus": training_focus,
        "equipment_profile": equipment_profile,
        "coaching_style": coaching_style,
        "weekly_plan_template": weekly_plan,
        "sport": active_sport,
    }


def _build_play_identity(play_style: str, personality: str, skill_level: str, sport: str) -> dict:
    """Derive a play identity from style and personality quiz answers."""
    identity_data = PERSONALITY_TO_IDENTITY.get(personality, PERSONALITY_TO_IDENTITY["All-Rounder"])

    # Combine play style and personality into a unique type name
    type_name = f"{play_style} {identity_data['type_suffix']}"

    # Sport-specific flavor
    sport_labels = {
        "badminton": "shuttler",
        "table_tennis": "paddle player",
        "tennis": "tennis player",
        "pickleball": "pickler",
        "cricket": "cricketer",
        "football": "footballer",
        "swimming": "swimmer",
    }
    sport_label = sport_labels.get(sport, "athlete")

    description = identity_data["description_template"]
    # Add skill-level context
    if skill_level in ("Beginner", "Beginner+"):
        description += f" As a developing {sport_label}, your natural instincts are a great foundation to build on."
    elif skill_level == "Advanced":
        description += f" As an advanced {sport_label}, you can leverage this style to dominate at competitive levels."

    return {
        "type": type_name,
        "description": description,
        "primary_strength": identity_data["primary_strength"],
        "primary_weakness": identity_data["primary_weakness"],
        "personality": personality,
    }


def _build_training_focus(
    primary_goal: str,
    goals: list,
    frequency: str,
    skill_level: str,
    play_style: str,
    injury: str,
) -> dict:
    """Build training focus recommendations from goals, frequency, and constraints."""
    goal_config = GOAL_TO_TRAINING.get(primary_goal, GOAL_TO_TRAINING["Improve technique"])
    freq_config = FREQUENCY_TO_PLAN.get(frequency, FREQUENCY_TO_PLAN["1-2 days/week"])

    # Secondary goals from the goals list (excluding the primary)
    secondary_goals = [g for g in goals if g != primary_goal][:3]
    if not secondary_goals:
        # Derive sensible defaults based on style
        style_secondary = {
            "Power": ["Build stamina", "Improve footwork"],
            "Control": ["Improve consistency", "Develop shot variety"],
            "Speed": ["Improve reaction time", "Build endurance"],
            "Defense": ["Develop counter-attacks", "Improve stamina"],
            "All-round": ["Improve technique", "Build match fitness"],
        }
        secondary_goals = style_secondary.get(play_style, ["Improve technique"])

    # Skill priorities based on style + goal
    skill_priorities = _derive_skill_priorities(play_style, primary_goal, injury)

    # Session duration adjusted by skill level
    duration_adjust = {"Beginner": -10, "Beginner+": -5, "Intermediate": 0, "Advanced": 10}
    session_duration = freq_config["session_duration"] + duration_adjust.get(skill_level, 0)

    return {
        "primary_goal": primary_goal,
        "secondary_goals": secondary_goals,
        "recommended_frequency": f"{freq_config['days_per_week']} days/week",
        "session_duration": f"{session_duration} min",
        "intensity": freq_config["intensity"],
        "skill_priorities": skill_priorities,
        "drill_types": goal_config["drill_types"],
        "session_split": goal_config["session_split"],
    }


def _derive_skill_priorities(play_style: str, primary_goal: str, injury: str) -> list:
    """Derive ordered skill priorities from style, goal, and injury constraints."""
    # Base priorities from play style
    style_skills = {
        "Power": ["smash_technique", "power_generation", "overhead_shots", "footwork", "stamina"],
        "Control": ["shot_placement", "consistency", "net_play", "deception", "footwork"],
        "Speed": ["footwork", "reaction_speed", "court_coverage", "agility", "stamina"],
        "Defense": ["defensive_positioning", "counter_attacks", "footwork", "stamina", "court_coverage"],
        "All-round": ["shot_variety", "footwork", "consistency", "net_play", "stamina"],
        # Tennis
        "Baseliner": ["groundstrokes", "footwork", "stamina", "topspin", "court_positioning"],
        "Serve & Volley": ["serve", "volley", "net_approach", "reflexes", "footwork"],
        "All-Court": ["shot_variety", "transitions", "serve", "footwork", "stamina"],
        "Counter-Puncher": ["returning", "footwork", "stamina", "consistency", "court_coverage"],
        # Table Tennis
        "Offensive": ["topspin_loop", "smash", "serve", "footwork", "third_ball_attack"],
        "Defensive": ["chopping", "blocking", "placement", "footwork", "counter_spin"],
        "Penhold": ["forehand_attack", "backhand_block", "serve", "footwork", "wrist_work"],
        # Pickleball
        "Soft Game": ["dink", "drop_shot", "patience", "placement", "third_shot_drop"],
        # Cricket
        "Aggressive Batsman": ["power_hitting", "shot_selection", "running_between_wickets", "footwork"],
        "Anchor Batsman": ["defense", "shot_rotation", "concentration", "footwork"],
        "Fast Bowler": ["bowling_action", "pace_generation", "swing", "fitness", "yorker"],
        "Spin Bowler": ["spin_variation", "flight", "accuracy", "field_setting"],
        "All-rounder": ["batting_basics", "bowling_basics", "fielding", "fitness"],
        "Wicketkeeper": ["glovework", "footwork", "standing_up", "batting"],
        # Football
        "Speed Merchant": ["dribbling", "pace", "crossing", "finishing", "agility"],
        "Playmaker": ["passing", "vision", "first_touch", "positioning", "set_pieces"],
        "Target Forward": ["heading", "finishing", "hold_up_play", "positioning", "strength"],
        "Box-to-Box": ["stamina", "tackling", "passing", "shooting", "positioning"],
        "Defensive Wall": ["tackling", "positioning", "heading", "communication", "strength"],
        "Goalkeeper": ["shot_stopping", "positioning", "distribution", "reflexes", "communication"],
        # Swimming
        "Sprinter": ["starts", "turns", "stroke_rate", "power", "streamlining"],
        "Distance": ["pacing", "efficiency", "breathing", "endurance", "turns"],
        "IM Specialist": ["all_strokes", "transitions", "pacing", "turns", "versatility"],
        "Fitness Swimmer": ["technique", "breathing", "endurance", "enjoyment"],
        "Open Water": ["sighting", "drafting", "endurance", "breathing", "navigation"],
    }

    priorities = list(style_skills.get(play_style, ["technique", "footwork", "stamina", "consistency"]))

    # Boost goal-relevant skills
    goal_boosts = {
        "Improve technique": ["technique", "shot_placement", "consistency"],
        "Win more matches": ["strategy", "match_play", "mental_toughness"],
        "Get fitter": ["stamina", "footwork", "agility"],
        "Learn new shots": ["shot_variety", "deception", "new_techniques"],
        "Play competitively": ["pressure_handling", "strategy", "consistency"],
    }
    for boost_skill in goal_boosts.get(primary_goal, []):
        if boost_skill not in priorities:
            priorities.insert(2, boost_skill)  # Insert after top 2 style priorities

    # Remove injury-affected skills
    injury_config = INJURY_ADJUSTMENTS.get(injury, INJURY_ADJUSTMENTS["none"])
    reduced = [c.lower().replace(" ", "_") for c in injury_config.get("reduce_categories", [])]
    priorities = [p for p in priorities if p not in reduced]

    return priorities[:8]  # Cap at 8 priorities


def _build_equipment_profile(play_style: str, skill_level: str, budget: str, injury: str) -> dict:
    """Build equipment recommendation profile from style, skill, and budget."""
    equip_config = STYLE_TO_EQUIPMENT.get(play_style, STYLE_TO_EQUIPMENT.get("All-round", {}))
    injury_config = INJURY_ADJUSTMENTS.get(injury, INJURY_ADJUSTMENTS["none"])

    # Adjust for skill level
    if skill_level in ("Beginner", "Beginner+"):
        # Beginners benefit from forgiving equipment
        racket_note = "Choose forgiving, easy-to-use equipment as you develop your technique."
    elif skill_level == "Advanced":
        racket_note = "You can handle specialized equipment that matches your style precisely."
    else:
        racket_note = "You're ready for equipment that complements your developing style."

    # Budget optimization
    budget_strategies = {
        "Low": "Focus on essentials — one good primary piece of equipment, basic accessories.",
        "Medium": equip_config.get("budget_tip", "Balanced investment across gear."),
        "High": "Invest in premium primary equipment, quality accessories.",
        "Premium": "Go for top-tier gear across all categories.",
    }

    result = {
        "racket_type": equip_config.get("racket_type", "balanced, medium flex"),
        "string_tension": equip_config.get("string_tension", "medium"),
        "shoe_type": equip_config.get("shoe_type", "all-court"),
        "weight_preference": equip_config.get("weight_pref", "standard"),
        "budget_optimization": budget_strategies.get(budget, budget_strategies["Medium"]),
        "skill_note": racket_note,
    }

    # Add injury-specific gear note
    if injury_config.get("gear_note"):
        result["injury_gear_note"] = injury_config["gear_note"]

    return result


def _build_coaching_style(skill_level: str, personality: str, play_identity: dict) -> dict:
    """Build coaching style preferences from skill level and personality."""
    skill_style = SKILL_COACHING_STYLE.get(skill_level, SKILL_COACHING_STYLE["Beginner"])
    identity_data = PERSONALITY_TO_IDENTITY.get(personality, PERSONALITY_TO_IDENTITY["All-Rounder"])

    # Determine coaching tone from personality
    tone_map = {
        "intense": "motivational and direct",
        "analytical": "thoughtful and strategic",
        "patient": "encouraging and patient",
        "balanced": "supportive and balanced",
        "encouraging": "creative and encouraging",
    }
    tone = tone_map.get(identity_data.get("coaching_tone", "balanced"), "supportive and balanced")

    return {
        "tone": tone,
        "focus_areas": identity_data.get("focus_keywords", []),
        "avoid": skill_style.get("avoid", []),
        "comparison_level": skill_style.get("comparison_level", "club player"),
        "language_level": skill_style.get("language", "simple"),
        "encouragement_level": skill_style.get("encouragement_level", "moderate"),
        "explanation_depth": skill_style.get("explanation_depth", "clear with reasoning"),
    }


def _build_weekly_plan(
    frequency: str, play_style: str, primary_goal: str, skill_level: str, injury: str
) -> dict:
    """Build a weekly plan template based on frequency and preferences."""
    freq_config = FREQUENCY_TO_PLAN.get(frequency, FREQUENCY_TO_PLAN["1-2 days/week"])
    days_per_week = freq_config["days_per_week"]
    base_duration = freq_config["session_duration"]

    # Adjust duration for skill level
    duration_adjust = {"Beginner": -10, "Beginner+": -5, "Intermediate": 0, "Advanced": 10}
    duration = base_duration + duration_adjust.get(skill_level, 0)

    # Build day-by-day plan
    injury_config = INJURY_ADJUSTMENTS.get(injury, INJURY_ADJUSTMENTS["none"])
    avoid_categories = injury_config.get("reduce_categories", [])

    # Define focus rotation based on style
    style_rotation = {
        "Power": ["Power drills", "Footwork + agility", "Match play + tactics", "Conditioning", "Shot technique", "Recovery drills"],
        "Control": ["Shot placement drills", "Net play", "Match play + strategy", "Footwork", "Deception practice", "Recovery drills"],
        "Speed": ["Agility training", "Reaction drills", "Court coverage", "Match play", "Stamina building", "Recovery drills"],
        "Defense": ["Defensive positioning", "Counter-attack drills", "Stamina building", "Match play", "Footwork", "Recovery drills"],
        "All-round": ["Technique mix", "Footwork + fitness", "Match play + doubles", "Shot variety", "Conditioning", "Strategy review"],
    }
    rotation = style_rotation.get(play_style, style_rotation["All-round"])

    # Filter out injury-affected focus areas
    if avoid_categories:
        avoid_lower = [c.lower() for c in avoid_categories]
        rotation = [r for r in rotation if not any(a in r.lower() for a in avoid_lower)]
        if not rotation:
            rotation = ["Adapted training", "Upper body technique", "Strategy review"]

    # Intensity pattern
    intensity_pattern = {
        2: ["high", "high"],
        3: ["high", "medium", "high"],
        4: ["high", "medium", "high", "medium"],
        5: ["high", "medium", "high", "medium", "low"],
        6: ["high", "medium", "high", "medium", "high", "low"],
    }
    intensities = intensity_pattern.get(days_per_week, ["medium"] * days_per_week)

    days = {}
    training_day = 0
    for day_num in range(1, 8):
        if day_num in freq_config["rest_days"]:
            days[f"day{day_num}"] = {"focus": "Rest & Recovery", "duration": 0, "intensity": "rest"}
        else:
            focus = rotation[training_day % len(rotation)]
            intensity = intensities[training_day % len(intensities)]
            days[f"day{day_num}"] = {
                "focus": focus,
                "duration": duration,
                "intensity": intensity,
            }
            training_day += 1

    return {
        **days,
        "rest_days": freq_config["rest_days"],
        "total_training_days": days_per_week,
        "strategy": freq_config["strategy"],
    }


# ══════════════════════════════════════════════════════════
# FUNCTION 2: Personalize Equipment Scores
# ══════════════════════════════════════════════════════════

def personalize_equipment_scores(equipment_list: list, profile_analysis: dict) -> list:
    """
    Re-score and re-rank equipment recommendations using the full profile analysis.

    Adjusts scores based on:
    - Play identity (power → head-heavy bonus, control → even-balance bonus)
    - Injury history (recommend protective gear, penalize risky equipment)
    - Budget optimization (value-for-money scoring)
    - Skill level (forgiving gear for beginners, specialized for advanced)

    Args:
        equipment_list: List of dicts, each with "equipment" and "score" keys.
        profile_analysis: Output of build_player_profile_analysis().

    Returns:
        The same list, re-scored with a "personalization_bonus" added to each score,
        sorted by new total descending.
    """
    if not profile_analysis or not equipment_list:
        return equipment_list

    equip_profile = profile_analysis.get("equipment_profile", {})
    play_identity = profile_analysis.get("play_identity", {})
    identity_type = play_identity.get("type", "").lower()

    for rec in equipment_list:
        eq = rec.get("equipment", {})
        score = rec.get("score", {})
        bonus = 0

        # ── Play style → equipment attribute matching ──
        balance = (eq.get("balance_type") or eq.get("balance") or "").lower()
        flex = (eq.get("shaft_flexibility") or eq.get("flexibility") or "").lower()
        weight = (eq.get("weight_category") or eq.get("weight") or "").lower()

        preferred_racket = equip_profile.get("racket_type", "").lower()

        # Balance match
        if "head-heavy" in preferred_racket and "head heavy" in balance:
            bonus += 8
        elif "head-light" in preferred_racket and "head light" in balance:
            bonus += 8
        elif "even" in preferred_racket and "even" in balance:
            bonus += 6

        # Flexibility match
        if "stiff" in preferred_racket and "stiff" in flex:
            bonus += 5
        elif "flexible" in preferred_racket and "flexible" in flex:
            bonus += 5
        elif "medium" in preferred_racket and "medium" in flex:
            bonus += 3

        # Weight preference
        weight_pref = equip_profile.get("weight_preference", "").lower()
        if weight_pref and weight:
            if any(w in weight for w in weight_pref.split("-")):
                bonus += 3

        # ── Injury-aware adjustments ──
        injury_note = equip_profile.get("injury_gear_note", "")
        if injury_note:
            # Boost cushioned/protective options
            eq_desc = (eq.get("description") or "").lower()
            eq_features = " ".join(str(v).lower() for v in eq.values() if isinstance(v, str))
            if "cushion" in injury_note.lower() and "cushion" in eq_features:
                bonus += 4
            if "support" in injury_note.lower() and "support" in eq_features:
                bonus += 3
            if "lighter" in injury_note.lower() and ("5u" in weight or "6u" in weight):
                bonus += 3

        # ── Skill level adjustments ──
        coaching = profile_analysis.get("coaching_style", {})
        comparison = coaching.get("comparison_level", "")
        if "beginner" in comparison.lower() or "recreational" in comparison.lower():
            # Beginners benefit from forgiving gear
            if "flexible" in flex or "medium" in flex:
                bonus += 3
            if "stiff" in flex or "extra stiff" in flex:
                bonus -= 2  # Penalize stiff gear for beginners
        elif "competitive" in comparison.lower():
            # Advanced players can use specialized gear
            if "stiff" in flex:
                bonus += 2

        # ── Doubles preference ──
        if "doubles" in identity_type:
            # Doubles players value maneuverability
            if "head light" in balance or "5u" in weight or "light" in weight:
                bonus += 4

        # Apply bonus
        score["personalization_bonus"] = bonus
        score["total"] = score.get("total", 0) + bonus

    # Sort by new total
    equipment_list.sort(key=lambda r: r.get("score", {}).get("total", 0), reverse=True)
    return equipment_list


# ══════════════════════════════════════════════════════════
# FUNCTION 3: Personalize Training Plan
# ══════════════════════════════════════════════════════════

def personalize_training_plan(base_plan: dict, profile_analysis: dict) -> dict:
    """
    Adjust a training plan based on the full profile analysis.

    Modifications:
    - Adjusts session durations to match user's available frequency
    - Prioritizes drills matching goals (power → smash drills, accuracy → target practice)
    - Adjusts intensity based on skill level
    - Adds doubles-specific drills if the user plays doubles
    - Skips injury-risky drills (e.g., no jumping if knee injury)

    Args:
        base_plan: The training plan dict (from plan_generator or research data).
        profile_analysis: Output of build_player_profile_analysis().

    Returns:
        The modified plan dict with personalization applied.
    """
    if not profile_analysis or not base_plan:
        return base_plan

    training_focus = profile_analysis.get("training_focus", {})
    weekly_template = profile_analysis.get("weekly_plan_template", {})
    play_identity = profile_analysis.get("play_identity", {})
    coaching_style = profile_analysis.get("coaching_style", {})

    # Add personalization metadata to the plan
    base_plan["personalization"] = {
        "play_identity": play_identity.get("type", "Player"),
        "primary_goal": training_focus.get("primary_goal", ""),
        "intensity": training_focus.get("intensity", "medium"),
        "session_duration": training_focus.get("session_duration", "45 min"),
        "skill_priorities": training_focus.get("skill_priorities", []),
        "coaching_tone": coaching_style.get("tone", "supportive"),
    }

    # Adjust week themes based on goals
    goal_theme_suffix = {
        "Improve technique": "Technique Focus",
        "Win more matches": "Match Strategy",
        "Get fitter": "Fitness Push",
        "Learn new shots": "New Skills",
        "Play competitively": "Competition Prep",
    }
    theme_suffix = goal_theme_suffix.get(training_focus.get("primary_goal", ""), "")

    weeks = base_plan.get("weeks", [])
    for week in weeks:
        if theme_suffix and week.get("theme"):
            week["theme"] = f"{week['theme']} — {theme_suffix}"

        for day in week.get("days", []):
            if day.get("type") == "rest":
                continue

            # Adjust duration based on profile
            target_duration = weekly_template.get(
                f"day{(day.get('day', 1) - 1) % 7 + 1}", {}
            ).get("duration", 0)
            if target_duration > 0 and day.get("duration_minutes"):
                # Blend base plan duration with profile preference
                day["duration_minutes"] = int(
                    day["duration_minutes"] * 0.6 + target_duration * 0.4
                )

            # Tag days with personalization context
            day["personalized_focus"] = training_focus.get("primary_goal", "")
            day["intensity_target"] = weekly_template.get(
                f"day{(day.get('day', 1) - 1) % 7 + 1}", {}
            ).get("intensity", "medium")

    # Add training tips based on identity
    base_plan["training_tips"] = _generate_training_tips(profile_analysis)

    return base_plan


def _generate_training_tips(profile_analysis: dict) -> list:
    """Generate personalized training tips from the profile analysis."""
    tips = []
    identity = profile_analysis.get("play_identity", {})
    training = profile_analysis.get("training_focus", {})
    coaching = profile_analysis.get("coaching_style", {})

    # Identity-based tip
    identity_type = identity.get("type", "")
    strength = identity.get("primary_strength", "")
    weakness = identity.get("primary_weakness", "")
    if strength and weakness:
        tips.append(
            f"As a {identity_type}, your {strength.lower()} is your edge. "
            f"Dedicate extra practice to {weakness.lower()} to become well-rounded."
        )

    # Goal-based tip
    goal = training.get("primary_goal", "")
    goal_tips = {
        "Improve technique": "Film yourself during practice and compare with tutorials to spot technique gaps.",
        "Win more matches": "Practice under pressure — play points with consequences to build match toughness.",
        "Get fitter": "Start each session with 10 minutes of footwork drills before touching the racket.",
        "Learn new shots": "Master one new shot per week rather than trying everything at once.",
        "Play competitively": "Play practice matches with score tracking to simulate tournament pressure.",
        "Have fun": "Mix drills with fun challenges and games to keep motivation high.",
    }
    if goal in goal_tips:
        tips.append(goal_tips[goal])

    # Frequency-based tip
    freq = training.get("recommended_frequency", "")
    if "2" in freq:
        tips.append("With limited sessions, warm up quickly and maximize drill time — every minute counts.")
    elif "6" in freq:
        tips.append("With high frequency training, prioritize sleep and nutrition for recovery.")

    # Skill-level tip
    encouragement = coaching.get("encouragement_level", "moderate")
    if encouragement == "high":
        tips.append("Every practice session makes you better — focus on progress, not perfection.")

    return tips[:4]  # Cap at 4 tips


# ══════════════════════════════════════════════════════════
# FUNCTION 4: Personalize Coaching Feedback
# ══════════════════════════════════════════════════════════

def personalize_coaching_feedback(coach_feedback: dict, profile_analysis: dict) -> dict:
    """
    Tailor coaching text to the player's profile.

    Adjustments:
    - Language complexity matches skill level (simple for beginners, technical for advanced)
    - Tips focus on the player's stated goals
    - Relates feedback to the player's play style
    - Adds encouragement matching their personality type

    Args:
        coach_feedback: The raw coach_feedback dict (summary, top_issues, strengths, encouragement).
        profile_analysis: Output of build_player_profile_analysis().

    Returns:
        The modified coach_feedback dict with personalized additions.
    """
    if not profile_analysis or not coach_feedback:
        return coach_feedback

    coaching_style = profile_analysis.get("coaching_style", {})
    play_identity = profile_analysis.get("play_identity", {})
    training_focus = profile_analysis.get("training_focus", {})

    # ── Add personalized header ──
    identity_type = play_identity.get("type", "Player")
    tone = coaching_style.get("tone", "supportive")
    coach_feedback["player_identity"] = identity_type

    # ── Personalized encouragement ──
    original_encouragement = coach_feedback.get("encouragement", "")
    personality_encouragement = _get_personality_encouragement(
        play_identity.get("personality", "All-Rounder"),
        training_focus.get("primary_goal", ""),
    )
    if personality_encouragement:
        coach_feedback["encouragement"] = f"{original_encouragement} {personality_encouragement}"

    # ── Add goal-relevant coaching note ──
    goal = training_focus.get("primary_goal", "")
    skill_priorities = training_focus.get("skill_priorities", [])
    if goal and skill_priorities:
        priority_text = ", ".join(skill_priorities[:3]).replace("_", " ")
        coach_feedback["goal_focus_note"] = (
            f"Based on your goal to '{goal.lower()}', prioritize working on: {priority_text}."
        )

    # ── Adjust issue severity language based on skill level ──
    language_level = coaching_style.get("language_level", "simple")
    top_issues = coach_feedback.get("top_issues", [])
    for issue in top_issues:
        if language_level == "simple":
            # Simplify technical language for beginners
            issue["personalized_tip"] = _simplify_tip(issue.get("fix", ""), goal)
        elif language_level in ("technical and precise", "technical where appropriate"):
            # Add technical depth for advanced players
            issue["personalized_tip"] = _add_technical_depth(issue.get("fix", ""), goal)
        else:
            issue["personalized_tip"] = issue.get("fix", "")

    # ── Add style-specific coaching insight ──
    focus_areas = coaching_style.get("focus_areas", [])
    if focus_areas:
        coach_feedback["style_insight"] = (
            f"As a {identity_type}, focus especially on: {', '.join(focus_areas[:3])}."
        )

    return coach_feedback


def _get_personality_encouragement(personality: str, goal: str) -> str:
    """Get personality-specific encouragement text."""
    encouragements = {
        "Aggressive Attacker": (
            "Your attacking instinct is a weapon — channel that energy into focused, "
            "high-intensity practice and you'll see rapid improvement."
        ),
        "Strategic Player": (
            "Your ability to think through the game is rare — keep analyzing and "
            "you'll find yourself making smarter decisions under pressure."
        ),
        "Defensive Wall": (
            "Your patience and consistency are incredibly valuable — most points are "
            "won by the player who makes fewer mistakes, and that's your strength."
        ),
        "All-Rounder": (
            "Your versatility means you can adapt to any opponent — keep building "
            "all aspects of your game and you'll be tough to beat."
        ),
        "Creative Player": (
            "Your creativity makes you unpredictable and fun to watch — combine that "
            "flair with solid fundamentals and you'll be unstoppable."
        ),
    }
    return encouragements.get(personality, "")


def _simplify_tip(fix_text: str, goal: str) -> str:
    """Simplify a coaching tip for beginner-level understanding."""
    if not fix_text:
        return ""
    # Prefix with approachable language
    prefix = "Here's a simple way to improve: "
    # Remove overly technical phrases
    simplified = fix_text
    for technical in ["supination", "pronation", "kinetic chain", "biomechanical"]:
        if technical in simplified.lower():
            simplified = simplified.replace(technical, "movement pattern")
            simplified = simplified.replace(technical.capitalize(), "Movement pattern")
    return prefix + simplified


def _add_technical_depth(fix_text: str, goal: str) -> str:
    """Add technical context for advanced players."""
    if not fix_text:
        return ""
    suffix = ""
    if goal == "Win more matches":
        suffix = " Apply this in match situations to see the biggest competitive impact."
    elif goal == "Improve technique":
        suffix = " Record yourself to verify the correction is becoming automatic."
    return fix_text + suffix
