"""
PlaySmart AI Explanation Layer - Explains recommendations using LLM.
Only explains results, never invents them.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


async def generate_explanation(profile, equipment, score_breakdown):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            return _template_explanation(profile, equipment, score_breakdown)

        chat = LlmChat(
            api_key=api_key,
            session_id=f"explain-{equipment.get('id', 'x')}-{profile.get('user_id', 'anon')}",
            system_message="You are a professional badminton coach. Explain equipment recommendations in 2-3 concise sentences. Be specific about why the equipment matches the player. Only reference provided data."
        )

        prompt = f"""Player: {profile.get('skill_level')} level, {profile.get('play_style')} style, Budget: {profile.get('budget_range')}, Goal: {profile.get('primary_goal')}
Equipment: {equipment.get('brand')} {equipment.get('model')}, {equipment.get('weight_category')}, {equipment.get('balance_type')} balance, {equipment.get('shaft_flexibility')} shaft
Scores: Skill {score_breakdown.get('skill_match')}/40, Style {score_breakdown.get('play_style_match')}/30, Budget {score_breakdown.get('budget_match')}/20, Performance {score_breakdown.get('performance_fit')}/10, Total {score_breakdown.get('total')}/100
Explain in 2-3 sentences why this is recommended."""

        response = await chat.send_message(UserMessage(text=prompt))
        return response
    except Exception:
        return _template_explanation(profile, equipment, score_breakdown)


def _template_explanation(profile, equipment, score_breakdown):
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
