"""
AthlyticAI Explanation Layer

Uses OpenAI to generate natural language explanations for:
- Equipment recommendations
- Coaching feedback summaries
- Training plan reasoning

Rules decide. LLM explains. Never invents data.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

_openai_client = None


def _get_openai():
    """Lazy-init OpenAI client."""
    global _openai_client
    if _openai_client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return None
        from openai import OpenAI
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def _call_llm(system_msg, user_msg, max_tokens=150):
    """Call OpenAI with fallback to None on any failure."""
    try:
        client = _get_openai()
        if not client:
            return None
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=max_tokens,
            temperature=0.7,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return None


async def generate_explanation(profile, equipment, score_breakdown):
    """Explain why a piece of equipment is recommended. LLM or template fallback."""
    prompt = (
        f"Player: {profile.get('skill_level')} level, {profile.get('play_style')} style, "
        f"Budget: {profile.get('budget_range')}, Goal: {profile.get('primary_goal')}\n"
        f"Equipment: {equipment.get('brand')} {equipment.get('model')}, "
        f"{equipment.get('weight_category')}, {equipment.get('balance_type')} balance, "
        f"{equipment.get('shaft_flexibility')} shaft\n"
        f"Match Score: {score_breakdown.get('total')}/100 "
        f"(Skill {score_breakdown.get('skill_match')}/40, Style {score_breakdown.get('play_style_match')}/30, "
        f"Budget {score_breakdown.get('budget_match')}/20, Performance {score_breakdown.get('performance_fit')}/10)\n"
        f"Explain in 2-3 short sentences why this equipment suits this player. Be specific and friendly."
    )

    system = (
        "You are a professional badminton coach. Explain equipment recommendations "
        "in simple, friendly language. Only reference the data provided. "
        "Never make up specs or prices. Keep it to 2-3 sentences max."
    )

    # OpenAI disabled — use template explanations
    return _template_explanation(profile, equipment, score_breakdown)


async def generate_coaching_summary(profile, analysis_result):
    """Generate a natural language coaching summary from AI analysis results."""
    shot = analysis_result.get("shot_analysis", {})
    metrics = analysis_result.get("metrics", {})

    prompt = (
        f"Player: {profile.get('skill_level')} level, {profile.get('play_style')} style\n"
        f"Shot detected: {shot.get('shot_name', 'Unknown')} (grade: {shot.get('grade', 'N/A')})\n"
        f"Weaknesses found: {', '.join(w.get('area', '') for w in shot.get('weaknesses', []) if isinstance(w, dict))}\n"
        f"Write 2-3 sentences of encouraging coaching advice. Be specific about what to work on."
    )

    system = (
        "You are a friendly badminton coach giving feedback after watching a player's video. "
        "Be encouraging but honest. Give one specific thing they're doing well and one thing to improve. "
        "Keep it simple - no jargon. 2-3 sentences max."
    )

    return _call_llm(system, prompt)


async def generate_plan_summary(profile, plan, weaknesses=None):
    """Explain why a training plan was built the way it was."""
    weak_text = ""
    if weaknesses:
        areas = [w.get("area", "") for w in weaknesses if isinstance(w, dict)]
        if areas:
            weak_text = f"AI analysis detected weaknesses in: {', '.join(areas)}. "

    prompt = (
        f"Player: {profile.get('skill_level')} level, {profile.get('play_style')} style, "
        f"Goal: {profile.get('primary_goal')}\n"
        f"Injury concerns: {profile.get('injury_history', 'none')}\n"
        f"{weak_text}"
        f"Plan: {plan.get('name')} - {plan.get('description', '')}\n"
        f"Write 2-3 sentences explaining why this plan was created for this player. Be encouraging."
    )

    system = (
        "You are a badminton coach explaining a personalized training plan. "
        "Mention why specific focus areas were chosen based on the player's profile. "
        "Keep it simple and motivating. 2-3 sentences."
    )

    return _call_llm(system, prompt)


def _template_explanation(profile, equipment, score_breakdown):
    """Fallback template when OpenAI is unavailable."""
    skill = profile.get('skill_level', 'Intermediate')
    style = profile.get('play_style', 'All-round')
    brand = equipment.get('brand', '')
    model = equipment.get('model', '')
    balance = equipment.get('balance_type', 'even')
    flex = equipment.get('shaft_flexibility', 'medium')
    weight = equipment.get('weight_category', '4U')

    parts = [f"The {brand} {model} is a strong match for your {skill} level {style} play style."]

    balance_desc = {
        "head heavy": "Its head-heavy balance delivers extra power on overhead smashes.",
        "head light": "The head-light design enables quick racket recovery for fast exchanges.",
        "slightly head heavy": "The slightly head-heavy balance gives a nice blend of power and maneuverability.",
        "even": "The even balance provides versatility for both attack and defense.",
    }
    parts.append(balance_desc.get(balance, "Its balanced design suits various play styles."))

    flex_desc = {
        "flexible": f"The flexible {weight} shaft is forgiving and helps generate power with developing technique.",
        "medium": f"At {weight} with medium flex, it offers a great balance of power and control for your level.",
        "stiff": f"The stiff shaft provides precise control and direct power transfer for experienced technique.",
        "extra stiff": f"The extra stiff shaft maximizes energy transfer for players with advanced technique.",
    }
    parts.append(flex_desc.get(flex, f"The {flex} shaft suits your current playing style well."))

    return " ".join(parts)
