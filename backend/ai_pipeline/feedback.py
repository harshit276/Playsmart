"""Deterministic coach-style feedback from the prediction + metrics.

Every string here is hand-written and stable. The frontend can wrap or
replace this layer with research-backed copy from research_loader; this
module guarantees a non-empty baseline so `coaching.summary` is never blank.
"""
from __future__ import annotations

from typing import Any


SHOT_TIPS = {
    "smash":    "Drive your racket arm down hard at the contact point and follow through across your body.",
    "clear":    "Get fully under the shuttle and uncoil from the legs upward — wrist snaps up at contact.",
    "drop":     "Slow the racket head right at contact — same setup as a clear, but a deceptive soft touch.",
    "drive":    "Short backswing, racket in front of body, fast forearm whip — keep the shuttle flat.",
    "net_shot": "Get to the net early, racket head up, gentle wrist tap. Recover to base immediately.",
    "serve":    "Stable stance, contact below the waist, push the shuttle rather than swinging.",
    "lift":     "Open the racket face, brush up underneath the shuttle, full follow-through to the back court.",
    "block":    "Keep the racket up and stable — let the shuttle rebound cleanly without much wrist.",
}

LEVEL_TIPS = {
    "Beginner":     "Footwork and balanced stance first — power comes after.",
    "Intermediate": "Work on shot consistency and quicker recovery to base after each hit.",
    "Advanced":     "Refine deception and tempo control — small variations in pace are now your edge.",
    "Pro":          "Focus on tactical patterns and shot quality under fatigue.",
}

POSTURE_TIPS = {
    "good":    "Posture looks balanced and aligned — keep that base.",
    "average": "Try to keep shoulders, hips, and feet on the same line at the moment of contact.",
    "poor":    "You're leaning or off-balance. Drop your center of gravity and split-step before each shot.",
}


def _weakness_from_metric(name: str, score: float) -> dict[str, Any] | None:
    """Convert a low metric (≤50) into a structured weakness record."""
    if score is None or score > 50:
        return None
    catalog = {
        "form_score":         ("Shot form looks off",     "high",   "Review the centroid form for this shot type."),
        "consistency_score":  ("Inconsistent racket path", "medium", "Slow it down — shadow the swing in mirror first."),
        "range_of_motion":    ("Limited range of motion", "medium", "Stretch the shoulder; finish the follow-through."),
        "balance_score":      ("Off-balance at contact",  "high",   "Add a split-step drill before each rally."),
        "elbow_angle_quality":("Elbow angle suboptimal",  "medium", "Cue: elbow at chin height during backswing."),
        "wrist_action":       ("Soft wrist at contact",   "medium", "Snap drill: 30 short power flicks vs wall."),
        "footwork_score":     ("Footwork rusty",          "low",    "Shadow corner-step drill, 6 sets of 30s."),
    }
    label, severity, fix = catalog.get(name, (name, "low", "Practice this fundamental."))
    return {"issue": label, "severity": severity, "fix": fix}


def coach_summary(shot: str, level: str, posture: str, overall: float) -> str:
    return (
        f"This looks like a {shot or 'shot'} from a {level or 'unknown-level'} player "
        f"with {posture or 'unknown'} posture (overall score {overall:.0f}/100)."
    )


def build_coaching(
    shot: str | None,
    level: str | None,
    posture: str | None,
    overall: float,
    metrics_pct: dict[str, float],
) -> dict[str, Any]:
    weaknesses = []
    for name, score in (metrics_pct or {}).items():
        w = _weakness_from_metric(name, score)
        if w:
            weaknesses.append(w)
    weaknesses.sort(key=lambda w: {"high": 0, "medium": 1, "low": 2}[w["severity"]])

    strengths = []
    for name, score in (metrics_pct or {}).items():
        if score is not None and score >= 75:
            strengths.append(name.replace("_", " "))

    top_issues = []
    for w in weaknesses[:3]:
        top_issues.append({
            "issue": w["issue"],
            "coach_says": SHOT_TIPS.get(shot, "Slow the swing down and own the basics."),
            "fix": w["fix"],
            "drill": w["fix"],
            "severity": w["severity"],
        })

    return {
        "raw": {"skill_level": level},
        "summary": coach_summary(shot, level, posture, overall),
        "top_issues": top_issues,
        "strengths": strengths,
        "encouragement": LEVEL_TIPS.get(level, "Keep at it — small reps add up."),
        "shot_tip": SHOT_TIPS.get(shot, ""),
        "posture_tip": POSTURE_TIPS.get(posture, ""),
    }


def build_pro_comparison(level: str, overall: float, shot: str | None) -> dict[str, Any]:
    pro_player = {
        "smash":    "Lee Chong Wei",
        "clear":    "Viktor Axelsen",
        "drop":     "Lin Dan",
        "drive":    "Kento Momota",
        "net_shot": "Tai Tzu Ying",
        "serve":    "Kevin Sanjaya",
        "lift":     "PV Sindhu",
        "block":    "Chen Long",
    }.get(shot, "world-class players")
    return {
        "overall_score": overall,
        "level": level,
        "message": f"At your current level, the next jump is bridging the gap to {pro_player}'s {shot or 'shot'}.",
        "pro_tips": [SHOT_TIPS.get(shot, "")],
        "player_match": pro_player,
    }
