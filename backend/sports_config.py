"""
Multi-sport configuration for AthlyticAI.
Defines sport-specific options for assessment, equipment, and training.
"""

SUPPORTED_SPORTS = {
    "badminton": {
        "name": "Badminton",
        "icon": "Feather",
        "color": "lime",
        "video_analysis": True,
        "play_styles": [
            {"value": "Power", "label": "Power", "desc": "Aggressive smashes and attacking play"},
            {"value": "Control", "label": "Control", "desc": "Precise placement and deception"},
            {"value": "Speed", "label": "Speed", "desc": "Fast rallies, quick reactions"},
            {"value": "All-round", "label": "All-round", "desc": "Balanced mix of all styles"},
            {"value": "Defense", "label": "Defense", "desc": "Solid returns and counter-attacks"},
        ],
        "skill_levels": [
            {"value": "Beginner", "label": "Beginner", "desc": "Just starting out, learning basic shots"},
            {"value": "Beginner+", "label": "Beginner+", "desc": "Know basics, developing consistency"},
            {"value": "Intermediate", "label": "Intermediate", "desc": "Comfortable in rallies, working on strategy"},
            {"value": "Advanced", "label": "Advanced", "desc": "Competitive player with strong technique"},
        ],
        "equipment_categories": ["racket", "shoes", "shuttlecock", "string", "grip", "bag"],
    },
    "table_tennis": {
        "name": "Table Tennis",
        "icon": "CircleDot",
        "color": "sky",
        "video_analysis": True,
        "play_styles": [
            {"value": "Offensive", "label": "Offensive", "desc": "Aggressive loops and smashes"},
            {"value": "Defensive", "label": "Defensive", "desc": "Chopping, blocking, counter-spin"},
            {"value": "All-round", "label": "All-round", "desc": "Mix of attack and defense"},
            {"value": "Penhold", "label": "Penhold", "desc": "Penhold grip style player"},
        ],
        "skill_levels": [
            {"value": "Beginner", "label": "Beginner", "desc": "Learning basic strokes and spin"},
            {"value": "Beginner+", "label": "Beginner+", "desc": "Can rally, learning to serve with spin"},
            {"value": "Intermediate", "label": "Intermediate", "desc": "Good spin control, developing tactics"},
            {"value": "Advanced", "label": "Advanced", "desc": "Tournament-level technique and strategy"},
        ],
        "equipment_categories": ["tt_blade", "tt_rubber", "tt_ball", "tt_bag"],
    },
    "tennis": {
        "name": "Tennis",
        "icon": "Target",
        "color": "amber",
        "video_analysis": True,
        "play_styles": [
            {"value": "Baseliner", "label": "Baseliner", "desc": "Powerful groundstrokes from the back"},
            {"value": "Serve & Volley", "label": "Serve & Volley", "desc": "Aggressive net play after serve"},
            {"value": "All-Court", "label": "All-Court", "desc": "Comfortable anywhere on the court"},
            {"value": "Counter-Puncher", "label": "Counter-Puncher", "desc": "Defensive, returns everything"},
        ],
        "skill_levels": [
            {"value": "Beginner", "label": "Beginner", "desc": "Learning strokes and basic rally"},
            {"value": "Beginner+", "label": "Beginner+", "desc": "Can serve and rally consistently"},
            {"value": "Intermediate", "label": "Intermediate", "desc": "Good technique, developing match play"},
            {"value": "Advanced", "label": "Advanced", "desc": "Tournament player with complete game"},
        ],
        "equipment_categories": ["tennis_racket", "tennis_shoes", "tennis_string", "tennis_ball", "tennis_bag"],
    },
    "pickleball": {
        "name": "Pickleball",
        "icon": "Zap",
        "color": "emerald",
        "video_analysis": True,
        "play_styles": [
            {"value": "Power", "label": "Power", "desc": "Hard drives and put-away shots"},
            {"value": "Soft Game", "label": "Soft Game", "desc": "Dinks, drops, and kitchen play"},
            {"value": "All-round", "label": "All-round", "desc": "Mix of power and finesse"},
        ],
        "skill_levels": [
            {"value": "Beginner", "label": "Beginner", "desc": "New to pickleball, learning rules"},
            {"value": "Beginner+", "label": "Beginner+", "desc": "Can rally, learning the kitchen"},
            {"value": "Intermediate", "label": "Intermediate", "desc": "Good dink game, developing strategy"},
            {"value": "Advanced", "label": "Advanced", "desc": "Tournament-ready with full shot arsenal"},
        ],
        "equipment_categories": ["pb_paddle", "pb_ball", "pb_shoes", "pb_bag"],
    },
    "cricket": {
        "name": "Cricket",
        "icon": "Disc",
        "color": "blue",
        "video_analysis": False,
        "play_styles": [
            {"value": "Aggressive Batsman", "label": "Aggressive Batsman", "desc": "Big shots, fast scoring, dominate bowling"},
            {"value": "Anchor Batsman", "label": "Anchor Batsman", "desc": "Steady innings, build partnerships"},
            {"value": "Fast Bowler", "label": "Fast Bowler", "desc": "Pace, swing, and bounce"},
            {"value": "Spin Bowler", "label": "Spin Bowler", "desc": "Turn, flight, and deception"},
            {"value": "All-rounder", "label": "All-rounder", "desc": "Contribute with bat, ball, and fielding"},
            {"value": "Wicketkeeper", "label": "Wicketkeeper", "desc": "Glovework, stumping, and batting"},
        ],
        "skill_levels": [
            {"value": "Beginner", "label": "Beginner", "desc": "Learning basic batting and bowling"},
            {"value": "Beginner+", "label": "Beginner+", "desc": "Can bat and bowl with basic technique"},
            {"value": "Intermediate", "label": "Intermediate", "desc": "Club-level player with solid fundamentals"},
            {"value": "Advanced", "label": "Advanced", "desc": "District/state-level competitive player"},
        ],
        "equipment_categories": ["cricket_bat", "cricket_ball", "cricket_pads", "cricket_gloves", "cricket_helmet", "cricket_shoes"],
    },
    "football": {
        "name": "Football",
        "icon": "Circle",
        "color": "green",
        "video_analysis": False,
        "play_styles": [
            {"value": "Speed Merchant", "label": "Speed Merchant", "desc": "Pace, dribbling, and counter-attacks"},
            {"value": "Playmaker", "label": "Playmaker", "desc": "Vision, passing, and controlling tempo"},
            {"value": "Target Forward", "label": "Target Forward", "desc": "Hold-up play, heading, and finishing"},
            {"value": "Box-to-Box", "label": "Box-to-Box", "desc": "All-action midfielder, attack and defend"},
            {"value": "Defensive Wall", "label": "Defensive Wall", "desc": "Tackling, positioning, and leadership"},
            {"value": "Goalkeeper", "label": "Goalkeeper", "desc": "Shot-stopping, distribution, and command"},
        ],
        "skill_levels": [
            {"value": "Beginner", "label": "Beginner", "desc": "Learning ball control and basic rules"},
            {"value": "Beginner+", "label": "Beginner+", "desc": "Can pass and dribble with basic ability"},
            {"value": "Intermediate", "label": "Intermediate", "desc": "Good technique, plays in local leagues"},
            {"value": "Advanced", "label": "Advanced", "desc": "Competitive player with tactical awareness"},
        ],
        "equipment_categories": ["football_boots", "football", "football_gloves", "football_shinguards"],
    },
    "swimming": {
        "name": "Swimming",
        "icon": "Waves",
        "color": "cyan",
        "video_analysis": False,
        "play_styles": [
            {"value": "Sprinter", "label": "Sprinter", "desc": "Explosive speed over short distances"},
            {"value": "Distance", "label": "Distance", "desc": "Endurance and pacing for long events"},
            {"value": "IM Specialist", "label": "IM Specialist", "desc": "Proficient in all four strokes"},
            {"value": "Fitness Swimmer", "label": "Fitness Swimmer", "desc": "Swimming for health and exercise"},
            {"value": "Open Water", "label": "Open Water", "desc": "Lake, river, and ocean swimming"},
        ],
        "skill_levels": [
            {"value": "Beginner", "label": "Beginner", "desc": "Learning to float and basic strokes"},
            {"value": "Beginner+", "label": "Beginner+", "desc": "Can swim 25m, learning breathing"},
            {"value": "Intermediate", "label": "Intermediate", "desc": "Comfortable swimming laps, refining technique"},
            {"value": "Advanced", "label": "Advanced", "desc": "Competitive swimmer with strong technique"},
        ],
        "equipment_categories": ["swimsuit", "goggles", "swim_cap", "fins", "kickboard", "pull_buoy"],
    },
}

MAX_SPORTS = 3


def get_sport_config(sport_key):
    return SUPPORTED_SPORTS.get(sport_key)


def get_all_sports_summary():
    """Return list for the sport selection grid."""
    return [
        {"key": k, "name": v["name"], "icon": v["icon"], "color": v["color"], "video_analysis": v["video_analysis"]}
        for k, v in SUPPORTED_SPORTS.items()
    ]
