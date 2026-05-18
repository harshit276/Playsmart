"""
Single source of truth for pricing — subscription tiers, per-mode token
costs, and the existing one-off token packs.

Indian market positioning:
- Free tier: 3 lifetime analyses (Flash). Aggressive enough to let users
  feel the product, not so generous that we bleed.
- Starter (₹199/mo): casual hobbyists — 10 Flash analyses, history,
  drills. Margin: ~90% even at full usage.
- Pro (₹499/mo): regular players — 20 mixed analyses (Flash + Premium).
  Premium unlocks Gemini 2.5 Pro for harder clips. Margin: ~85%.
- Elite (₹1499/mo): academies + serious athletes — 60 Premium analyses,
  priority support, coach review notes. Margin: ~88%.

Per-analysis token cost varies by accuracy mode:
- Flash (Gemini 2.5 Flash):   100 tokens — current default, fast/cheap
- Premium (Gemini 2.5 Pro):   250 tokens — slower, sharper detection

Per-token rupee value is derived from the cheapest pack:
500 tokens / ₹99 = ₹0.198 per token, so 100 tokens = ~₹20, 250 = ~₹50.
"""
from __future__ import annotations
from typing import Literal


# ─── Per-mode analysis cost (tokens) ──────────────────────────────────
ANALYSIS_TOKEN_COST = {
    "keyframes": 100,   # browser-extracted keyframes + Flash classifier
    "video":     100,   # whole-video Flash analysis
    "universal": 100,   # whole-video Flash, sport-agnostic
    "premium":   250,   # whole-video Pro (gemini-2.5-pro)
}


# ─── Subscription tiers ──────────────────────────────────────────────
# All amounts are MONTHLY INR unless noted. Annual = 10× monthly (2 months
# free) when annual_price_inr is shown.
SUBSCRIPTION_PLANS = [
    {
        "key": "free",
        "name": "Free",
        "price_inr": 0,
        "annual_price_inr": 0,
        "tagline": "Try it — no card needed",
        "tokens_per_month": 0,
        "signup_grant": 300,          # 3 Flash analyses on signup, lifetime
        "max_analyses_per_month": 3,
        "premium_unlocked": False,
        "features": [
            "3 lifetime analyses (signup grant)",
            "Standard accuracy (Gemini Flash)",
            "Shot detection + per-shot coaching",
            "Drill recommendations from our catalog",
            "Save your last 5 analyses",
        ],
        "limits": [
            "No reanalysis vs previous clips",
            "No premium (Gemini 2.5 Pro) analyses",
            "History capped at 5 entries",
        ],
    },
    {
        "key": "starter",
        "name": "Starter",
        "price_inr": 199,
        "annual_price_inr": 1990,    # ~17% off (2 months free)
        "tagline": "Casual practice tracking",
        "tokens_per_month": 1000,    # 10 Flash analyses
        "max_analyses_per_month": 10,
        "premium_unlocked": False,
        "features": [
            "10 analyses every month (Gemini Flash)",
            "Full history with progress tracking",
            "Reanalyze any past video to track improvement",
            "Personalized drill recommendations",
            "7-day training plan generation",
        ],
        "limits": [
            "Standard accuracy only — no Gemini Pro",
            "Up to 10 analyses per month (rolls over up to 30)",
        ],
    },
    {
        "key": "pro",
        "name": "Pro",
        "price_inr": 499,
        "annual_price_inr": 4990,    # ~17% off
        "tagline": "Regular players + coaches",
        "tokens_per_month": 2500,    # 25 Flash OR 10 Premium OR mix
        "max_analyses_per_month": 25,
        "premium_unlocked": True,
        "highlight": True,            # rendered as "most popular"
        "features": [
            "25 analyses every month",
            "Premium accuracy (Gemini 2.5 Pro) — catches every shot",
            "Multi-shot match analysis",
            "Side-by-side comparison reports",
            "Full per-shot AI coach feedback",
            "Priority video processing",
            "All Starter features included",
        ],
        "limits": [
            "Premium analyses count as 2.5× a standard analysis",
            "Up to 25 standard or 10 premium per month",
        ],
    },
    {
        "key": "elite",
        "name": "Elite",
        "price_inr": 1499,
        "annual_price_inr": 14990,
        "tagline": "Academies + serious athletes",
        "tokens_per_month": 15000,   # 60 Premium / 150 Flash / mix
        "max_analyses_per_month": 100,
        "premium_unlocked": True,
        "features": [
            "Up to 60 Premium analyses per month (or 150 Standard)",
            "Coach review notes appended to every analysis",
            "Branded PDF reports for share with parents/coaches",
            "Bulk upload (5+ videos at a time)",
            "WhatsApp delivery of analysis summaries",
            "All Pro features included",
        ],
        "limits": [
            "Fair-use cap at 100 analyses/month — contact us above that",
        ],
    },
]


# ─── One-off token packs ─────────────────────────────────────────────
# Already defined in server.py (TOKEN_PACKS); re-exported here so the
# pricing page can render packs + subscriptions in one /api/plans call.
ONE_OFF_PACKS = [
    {"key": "pack_500",   "tokens":   500, "price_inr":   99,
     "label": "Starter Pack", "per_token_inr": 0.198,
     "analyses_flash": 5, "analyses_premium": 2},
    {"key": "pack_1500",  "tokens":  1500, "price_inr":  249,
     "label": "Best Value", "highlight": True, "per_token_inr": 0.166,
     "analyses_flash": 15, "analyses_premium": 6},
    {"key": "pack_5000",  "tokens":  5000, "price_inr":  699,
     "label": "Power Pack", "per_token_inr": 0.140,
     "analyses_flash": 50, "analyses_premium": 20},
    {"key": "pack_15000", "tokens": 15000, "price_inr": 1499,
     "label": "Mega Pack", "per_token_inr": 0.100,
     "analyses_flash": 150, "analyses_premium": 60},
]


def get_plan(plan_key: str) -> dict | None:
    return next((p for p in SUBSCRIPTION_PLANS if p["key"] == plan_key), None)


def analysis_cost(mode: Literal["keyframes", "video", "universal", "premium"] = "keyframes") -> int:
    return ANALYSIS_TOKEN_COST.get(mode, 100)


def premium_unlocked_for(plan_key: str | None) -> bool:
    p = get_plan(plan_key or "free")
    return bool(p and p.get("premium_unlocked"))
