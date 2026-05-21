"""Equipment Fit Schema — the proprietary attribute layer.

Every catalog item gets a `fit_profile` block. This is the moat: a much
richer, opinionated tagging than the basic specs that come from product
data sheets. Fit attributes are normalised across sports so the same
recommender logic works for badminton/tennis/TT/pickleball.

Generated once via `scripts/enrich_equipment.py` (Gemini-assisted), then
hand-corrected over time as we learn from real customer outcomes.
"""

from __future__ import annotations
from typing import List, Optional, Literal, Dict
from pydantic import BaseModel, Field, conint


# Discrete vocabularies — keep small + opinionated so the LLM can map
# free-text user input reliably ("I play in office" -> "office_casual").

PLAYING_CONTEXT = [
    "office_casual",      # office basement / corporate gym, 1-2x/week
    "garden_backyard",    # informal home / society courts
    "school_college",     # student-level intra-college play
    "club_recreational",  # club members who play 2-4x/week, no league
    "club_competitive",   # club league / inter-club play
    "academy_training",   # academy student under a coach
    "tournament_open",    # district/state amateur tournaments
    "tournament_elite",   # national/state-A grade
    "beach_outdoor",      # outdoor only (relevant for pickleball/tennis)
]

PLAYING_STYLE = [
    "all_round", "attacker", "defender", "counter_attacker",
    "looper", "blocker", "serve_volley", "baseline", "power_hitter",
    "control_focused", "speed_focused", "spin_focused",
]

BODY_FIT = [
    "junior_or_light",        # children, lighter adults <60kg
    "average_adult",          # 60-80kg
    "heavy_player",           # >80kg
    "small_hand_grip",        # narrow handle preference
    "wide_hand_grip",         # broader handle preference
    "wrist_problem_friendly", # lighter / less torque on impact
]

GOAL_FIT = [
    "improve_technique",  # control / consistency
    "win_matches",        # tournament / competitive
    "stay_fit",           # fitness / regular play
    "casual_fun",         # weekend / social
    "kids_starter",       # parent buying for child
]


class FitAttributes(BaseModel):
    """Six normalised attributes scored 0-100. Same scale across sports
    so a "power: 80" racket and a "power: 80" paddle mean similar things.

    Scoring guidance:
      0-30   = noticeably low for this category
      30-60  = average
      60-80  = above average / clear strength
      80-100 = standout strength (rare; reserve for tournament gear)
    """
    power: conint(ge=0, le=100) = Field(50, description="Raw force / pace generated on impact")
    control: conint(ge=0, le=100) = Field(50, description="Accuracy + placement; predictability of bounce")
    speed: conint(ge=0, le=100) = Field(50, description="Maneuverability / reaction speed (lighter = faster usually)")
    spin: conint(ge=0, le=100) = Field(50, description="Spin generation (relevant: TT rubbers, badminton strings, tennis)")
    forgiveness: conint(ge=0, le=100) = Field(50, description="Tolerance for off-centre / mistimed hits — beginner-friendly")
    durability: conint(ge=0, le=100) = Field(50, description="Lifespan under regular use; less relevant for high-end consumables")


class FitProfile(BaseModel):
    """The proprietary attribute layer attached to every catalog item."""

    # Who this is for — discrete tags drive both filter + LLM intent matching
    skill_levels: List[Literal["beginner", "intermediate", "advanced", "pro"]] = Field(default_factory=list)
    playing_styles: List[str] = Field(default_factory=list)        # subset of PLAYING_STYLE
    playing_contexts: List[str] = Field(default_factory=list)      # subset of PLAYING_CONTEXT
    anti_contexts: List[str] = Field(default_factory=list)         # contexts to AVOID this for
    body_fit: List[str] = Field(default_factory=list)              # subset of BODY_FIT
    goal_fit: List[str] = Field(default_factory=list)              # subset of GOAL_FIT

    # The six attributes (normalised 0-100)
    attributes: FitAttributes = Field(default_factory=FitAttributes)

    # Human-readable personas (used by LLM to generate explanations + by
    # users to self-identify when scanning a card)
    best_for_persona: Optional[str] = Field(
        None, description="≤25 word description of the ideal user"
    )
    not_for_persona: Optional[str] = Field(
        None, description="≤25 word description of who should avoid this"
    )

    # Practical guidance
    learning_curve_hours: Optional[int] = Field(
        None, description="Rough hours of play before the user feels comfortable with this gear"
    )
    upgrade_after_months: Optional[int] = Field(
        None, description="Typical months before a serious player outgrows this"
    )

    # Free-form, item-specific honest notes — these don't fit any tag system
    common_complaints: List[str] = Field(default_factory=list, max_length=4)
    standout_qualities: List[str] = Field(default_factory=list, max_length=4)

    # Trust / source signals
    confidence: Literal["low", "medium", "high"] = Field(
        "medium",
        description=(
            "How confident we are in this fit_profile. 'high' means we have direct "
            "customer outcome data; 'medium' is LLM-derived from rich pros/cons + specs; "
            "'low' is LLM-derived with thin source data."
        ),
    )
    source: Literal["llm_derived", "expert_authored", "store_outcomes"] = "llm_derived"


# ─── Recommendation request / response types ──────────────────────

class RecommendQuery(BaseModel):
    """Hybrid input: structured tags + optional free text."""
    sport: str
    category: Optional[str] = None  # e.g. "rackets", "blades", "shoes"
    skill_level: Optional[str] = None
    play_style: Optional[str] = None
    goal: Optional[str] = None      # one of GOAL_FIT
    context: Optional[str] = None   # one of PLAYING_CONTEXT
    body_fit: Optional[List[str]] = None
    budget_inr_min: Optional[int] = None
    budget_inr_max: Optional[int] = None

    # The free-text field — the differentiator. LLM parses this into the
    # tags above + any extra keyword signals before retrieval.
    description: Optional[str] = Field(
        None,
        max_length=600,
        description="Free-text context, e.g. 'I play mostly in office basement, twice a week, my forehand is weak'",
    )

    # How many results to return
    limit: int = Field(5, ge=1, le=20)


class RecommendationItem(BaseModel):
    """One ranked pick returned to the client."""
    item_id: str
    sport: str
    category: str
    name: str
    brand: str
    cheapest_price_inr: Optional[int] = None

    # The score that ranked this item (0-100, weighted blend)
    fit_score: int
    score_breakdown: Dict[str, int]  # {skill: 90, budget: 80, goal: 75, context: 60, style: 70}

    # The reasoning chain — what made this a top pick
    why_this_fits: List[str]   # 2-4 bullets
    why_to_be_careful: List[str]  # 0-2 honest caveats

    # Full item passed through for the UI
    item: Dict


class RecommendationResponse(BaseModel):
    query: RecommendQuery
    parsed_intent: Dict   # what the LLM extracted from `description`
    items: List[RecommendationItem]
    rationale: Optional[str] = None  # 1-2 sentence summary of the overall recommendation
