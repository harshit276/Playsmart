"""
AthlyticAI Recommendation Rule Engine - Deterministic equipment recommendations.
"""


def get_recommendation_rules():
    return {
        "skill_rules": {
            "Beginner": {"weight": ["5U", "4U", "6U"], "balance": ["even", "head light"], "flex": ["flexible", "medium"]},
            "Beginner+": {"weight": ["4U", "5U"], "balance": ["even", "head light", "slightly head heavy"], "flex": ["flexible", "medium"]},
            "Intermediate": {"weight": ["4U", "3U"], "balance": ["even", "head heavy", "slightly head heavy", "head light"], "flex": ["medium", "stiff"]},
            "Advanced": {"weight": ["3U", "4U"], "balance": ["head heavy", "even", "head light", "slightly head heavy"], "flex": ["stiff", "extra stiff", "medium"]},
        },
        "style_rules": {
            "Power": {"balance": ["head heavy", "slightly head heavy"], "flex": ["stiff", "extra stiff"]},
            "Control": {"balance": ["even", "head light"], "flex": ["medium", "flexible"]},
            "Speed": {"balance": ["head light", "even"], "flex": ["medium", "stiff"]},
            "All-round": {"balance": ["even", "slightly head heavy", "head light"], "flex": ["medium"]},
            "Defense": {"balance": ["head light", "even"], "flex": ["flexible", "medium"]},
        },
        "injury_rules": {
            "elbow": {"avoid_flex": ["stiff", "extra stiff"], "prefer_flex": ["flexible", "medium"]},
            "shoulder": {"avoid_weight": ["3U"], "prefer_weight": ["5U", "4U", "6U"]},
            "wrist": {"avoid_balance": ["head heavy"], "prefer_balance": ["even", "head light"]},
            "knee": {},
            "none": {},
        },
        "budget_rules": {
            "Low": {"max_price": 3000},
            "Medium": {"max_price": 8000},
            "High": {"max_price": 15000},
            "Premium": {"max_price": 50000},
        },
    }


def calculate_compatibility_score(profile, equipment, rules):
    score = {"skill_match": 0, "play_style_match": 0, "budget_match": 0, "performance_fit": 0, "total": 0}

    skill_level = profile.get("skill_level", "Intermediate")
    play_style = profile.get("play_style", "All-round")
    budget = profile.get("budget_range", "Medium")
    injury = profile.get("injury_history", "none")

    # Skill match (max 40)
    skill_rule = rules["skill_rules"].get(skill_level, rules["skill_rules"]["Intermediate"])
    weight_match = equipment.get("weight_category", "") in skill_rule.get("weight", [])
    balance_match = equipment.get("balance_type", "") in skill_rule.get("balance", [])
    flex_match = equipment.get("shaft_flexibility", "") in skill_rule.get("flex", [])

    if weight_match:
        score["skill_match"] += 13
    if balance_match:
        score["skill_match"] += 13
    if flex_match:
        score["skill_match"] += 10

    rec_skills = equipment.get("recommended_skill_level", [])
    if isinstance(rec_skills, str):
        rec_skills = [rec_skills]
    if skill_level in rec_skills:
        score["skill_match"] = min(40, score["skill_match"] + 10)

    # Play style match (max 30)
    style_rule = rules["style_rules"].get(play_style, rules["style_rules"]["All-round"])
    if equipment.get("balance_type", "") in style_rule.get("balance", []):
        score["play_style_match"] += 12
    if equipment.get("shaft_flexibility", "") in style_rule.get("flex", []):
        score["play_style_match"] += 12

    rec_styles = equipment.get("recommended_play_style", [])
    if isinstance(rec_styles, str):
        rec_styles = [rec_styles]
    if play_style in rec_styles:
        score["play_style_match"] = min(30, score["play_style_match"] + 10)

    # Budget match (max 20)
    budget_rule = rules["budget_rules"].get(budget, rules["budget_rules"]["Medium"])
    equipment_price = equipment.get("price_range_value", 5000)
    max_budget = budget_rule.get("max_price", 8000)

    if equipment_price <= max_budget:
        budget_ratio = 1 - (equipment_price / max_budget) if max_budget > 0 else 1
        score["budget_match"] = min(20, int(10 + budget_ratio * 10))
    else:
        over_ratio = equipment_price / max_budget if max_budget > 0 else 2
        score["budget_match"] = max(0, int(20 - (over_ratio - 1) * 20))

    # Performance fit (max 10)
    primary_goal = profile.get("primary_goal", "Consistency")
    goal_map = {
        "Power": ("attack_score", 7),
        "Speed": ("speed_score", 7),
        "Control": ("control_score", 7),
        "Consistency": ("forgiveness_score", 6),
        "Defense": ("control_score", 6),
    }
    attr, threshold = goal_map.get(primary_goal, ("forgiveness_score", 6))
    if equipment.get(attr, 5) >= threshold:
        score["performance_fit"] = 10
    elif equipment.get(attr, 5) >= threshold - 2:
        score["performance_fit"] = 6
    else:
        score["performance_fit"] = 3

    # Injury penalty
    injury_rule = rules["injury_rules"].get(injury, {})
    if injury_rule:
        if equipment.get("shaft_flexibility", "") in injury_rule.get("avoid_flex", []):
            score["skill_match"] = max(0, score["skill_match"] - 15)
        if equipment.get("weight_category", "") in injury_rule.get("avoid_weight", []):
            score["skill_match"] = max(0, score["skill_match"] - 10)
        if equipment.get("balance_type", "") in injury_rule.get("avoid_balance", []):
            score["play_style_match"] = max(0, score["play_style_match"] - 10)

    score["total"] = score["skill_match"] + score["play_style_match"] + score["budget_match"] + score["performance_fit"]
    return score


def get_top_recommendations(profile, equipment_list, top_n=3):
    rules = get_recommendation_rules()
    scored = []
    for eq in equipment_list:
        sc = calculate_compatibility_score(profile, eq, rules)
        scored.append({"equipment": eq, "score": sc})
    scored.sort(key=lambda x: x["score"]["total"], reverse=True)
    return scored[:top_n]


def calculate_shoe_score(profile, shoe):
    score = {"skill_match": 0, "play_style_match": 0, "budget_match": 0, "performance_fit": 0, "total": 0}
    skill = profile.get("skill_level", "Intermediate")
    budget = profile.get("budget_range", "Medium")
    play_style = profile.get("play_style", "All-round")

    rec_levels = shoe.get("recommended_skill_level", [])
    if isinstance(rec_levels, str):
        rec_levels = [rec_levels]
    if skill in rec_levels:
        score["skill_match"] = 40
    elif any(l in rec_levels for l in ["Beginner", "Beginner+", "Intermediate", "Advanced"]):
        score["skill_match"] = 20

    weight = shoe.get("weight_grams", 300)
    support = shoe.get("ankle_support", "Mid")
    if play_style == "Speed" and weight < 300:
        score["play_style_match"] = 30
    elif play_style == "Power" and support in ["Mid", "High"]:
        score["play_style_match"] = 30
    elif play_style == "Defense" and shoe.get("durability", 5) >= 8:
        score["play_style_match"] = 25
    else:
        score["play_style_match"] = 20

    budget_rules = {"Low": 3500, "Medium": 6000, "High": 10000, "Premium": 50000}
    max_b = budget_rules.get(budget, 6000)
    price = shoe.get("price_range_value", 5000)
    if price <= max_b:
        score["budget_match"] = min(20, int(10 + (1 - price / max_b) * 10))
    else:
        score["budget_match"] = max(0, int(20 - (price / max_b - 1) * 20))

    cushion = shoe.get("cushioning", "")
    if cushion in ["Power Cushion+", "Power Cushion", "Gel", "Energymax", "Cloud"]:
        score["performance_fit"] = 10
    elif cushion in ["EVA", "Bounse+", "Kalensole", "Cloud Lite"]:
        score["performance_fit"] = 7
    else:
        score["performance_fit"] = 5

    score["total"] = score["skill_match"] + score["play_style_match"] + score["budget_match"] + score["performance_fit"]
    return score


def get_top_shoe_recommendations(profile, shoes_list, top_n=3):
    scored = []
    for shoe in shoes_list:
        sc = calculate_shoe_score(profile, shoe)
        scored.append({"equipment": shoe, "score": sc})
    scored.sort(key=lambda x: x["score"]["total"], reverse=True)
    return scored[:top_n]
