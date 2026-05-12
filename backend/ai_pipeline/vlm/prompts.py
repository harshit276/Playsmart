"""Per-sport prompts + JSON schemas for VLM shot classification.

Pulls the shot vocabulary from the same place the frontend uses
(playsmart/frontend/src/ai/constants.js). Keep these in sync.
"""
from __future__ import annotations


# Shot vocabularies — must match Playsmart/frontend/src/ai/constants.js:SHOT_TYPES
SHOT_VOCAB: dict[str, list[str]] = {
    "badminton":    ["clear", "drop", "smash", "net_shot", "drive",
                     "serve", "lift", "block"],
    "tennis":       ["forehand", "backhand", "serve", "volley",
                     "overhead", "drop_shot", "slice", "lob"],
    "table_tennis": ["forehand_loop", "backhand_loop", "forehand_drive",
                     "backhand_drive", "push", "chop", "serve",
                     "smash", "flick", "block"],
    "pickleball":   ["dink", "drive", "drop", "serve", "volley",
                     "lob", "overhead", "third_shot_drop"],
    "cricket":      ["forward_defense", "back_foot_defense", "straight_drive",
                     "cover_drive", "pull", "cut", "sweep", "bowling_action"],
}


# Brief shot definitions to disambiguate similar shots (smash vs clear vs drop).
# Concise — these go in every prompt, so they cost tokens.
SHOT_DEFINITIONS: dict[str, dict[str, str]] = {
    "badminton": {
        "clear":    "Overhead shot, racket arcs UP, shuttle goes high and deep to opponent's back court.",
        "drop":     "Overhead shot, soft touch, shuttle drops gently just over the net to opponent's front court.",
        "smash":    "Overhead shot, racket arcs DOWN sharply, shuttle goes fast and steeply downward.",
        "net_shot": "Played near the net, racket head up, gentle wrist tap, shuttle just clears net.",
        "drive":    "Flat horizontal shot at shoulder height, fast forearm whip, racket in front of body.",
        "serve":    "Service motion, contact below the waist, used to start the rally.",
        "lift":     "Underarm shot, racket scoops shuttle UP and back to opponent's back court (defensive).",
        "block":    "Soft defensive return at the net, almost no swing — letting the shuttle rebound.",
    },
    "tennis": {
        "forehand":   "Stroke on the dominant side, racket swings across the body.",
        "backhand":   "Stroke on the non-dominant side, can be one or two-handed.",
        "serve":      "Overhead service motion to start the point.",
        "volley":     "Hit before the ball bounces, usually at the net.",
        "overhead":   "High overhead smash, similar to a serve.",
        "drop_shot":  "Soft shot just over the net.",
        "slice":      "Cut/underspin stroke.",
        "lob":        "High shot over the opponent.",
    },
    "table_tennis": {
        "forehand_loop":  "Forehand topspin attack, racket brushes UP and forward over the ball, full body rotation, contact above table level.",
        "backhand_loop":  "Backhand topspin attack from in front of body, racket brushes UP, contact near table.",
        "forehand_drive": "Forehand flat hit, racket moves FORWARD horizontally with little spin, contact at peak of bounce.",
        "backhand_drive": "Backhand flat hit, short forward push from elbow, racket horizontal.",
        "push":           "Defensive backspin shot close to table, racket angle open, gentle forward+down brush, ball stays low.",
        "chop":           "Heavy backspin defensive shot from far back, racket cuts DOWN under the ball, ball floats long and low.",
        "serve":          "Service motion: ball tossed from open palm, contact below table edge, used to start the point.",
        "smash":          "Aggressive overhead/forearm slam on a high ball, racket comes DOWN sharply, fastest TT shot.",
        "flick":          "Aggressive over-the-table attack on a short ball, wrist snaps UP, contact near net.",
        "block":          "Passive return holding racket still in path of incoming attack, no swing.",
    },
    "pickleball": {
        "dink":            "Soft shot at the net (kitchen line), gentle lift just over the net, ball lands in opponent's NVZ.",
        "drive":           "Hard groundstroke from baseline, flat low trajectory, used to push opponents back.",
        "drop":            "Soft shot from baseline that lands in opponent's kitchen, used to approach the net.",
        "serve":           "Underhand service motion below waist, flat or slightly lifted, starts the rally.",
        "volley":          "Hit out of the air at the net, no bounce, short punch motion.",
        "lob":             "High arcing shot over opponents at the net, sends them back to baseline.",
        "overhead":        "Smash on a high ball, racket comes DOWN sharply, similar to a tennis overhead.",
        "third_shot_drop": "Specific tactic: third shot of rally, soft drop into kitchen to allow advancing to net.",
    },
    "cricket": {
        "forward_defense":   "Front-foot defensive block, bat angled DOWN toward ground, soft hands, ball drops at feet.",
        "back_foot_defense": "Back-foot defensive block, bat held vertical close to body, ball plays into the leg side or at feet.",
        "straight_drive":    "Front-foot attacking shot straight back at the bowler, bat swings through full arc, head over ball.",
        "cover_drive":       "Front-foot attacking shot through the off side (cover region), bat angled to send ball wide of mid-off.",
        "pull":              "Back-foot horizontal swing across the body, hits short-pitched ball through the leg side.",
        "cut":               "Back-foot horizontal swing on the off side, slashes wide deliveries through point/gully.",
        "sweep":             "Down-on-one-knee shot, bat sweeps across the body, used against spin to score on the leg side.",
        "bowling_action":    "Bowler delivering the ball: run-up, jump, arm rotation, release. Not a batting shot.",
    },
}


def shot_vocabulary(sport: str) -> list[str]:
    return SHOT_VOCAB.get(sport, ["unknown"])


def _format_definitions(sport: str) -> str:
    defs = SHOT_DEFINITIONS.get(sport, {})
    if not defs:
        # Generic fallback — list shots without definitions
        return "\n".join(f"- {s}" for s in shot_vocabulary(sport))
    return "\n".join(f"- {k}: {v}" for k, v in defs.items())


def system_prompt(sport: str) -> str:
    """The instruction prompt for the VLM. Same across many calls — should be
    cached when the backend supports it."""
    vocab = shot_vocabulary(sport)
    defs = _format_definitions(sport)
    return f"""You are an expert {sport} coach analyzing a single shot from a player.

You will be shown {{n_frames}} keyframes from a single shot moment. The middle frame is approximately the contact instant.

Identify the shot type from this list of {len(vocab)} options:
{defs}

Respond with valid JSON ONLY (no markdown fences, no prose) matching this schema:
{{
  "shot_type": "<one of: {', '.join(vocab)}>",
  "confidence": <float 0.0-1.0>,
  "reasoning": "<one or two sentences explaining what visual cues led you to this shot type>",
  "alternatives": [
    {{"shot": "<second-most-likely>", "confidence": <float>}},
    {{"shot": "<third-most-likely>", "confidence": <float>}}
  ],
  "form_feedback": {{
    "strengths": ["<short bullet>", "..."],
    "weaknesses": ["<short bullet>", "..."],
    "tip": "<one actionable coaching tip>"
  }},
  "estimated_skill": "<Beginner|Intermediate|Advanced|Pro>",
  "power_level": "<soft|medium|hard|max>"
}}

For power_level, judge the racket-head speed and force at contact: soft (gentle touch, no swing), medium (controlled stroke), hard (committed full swing), max (explosive whip — top-end pro power).

If you cannot determine the shot from the frames (no player visible, blurry, etc.), set shot_type to "unknown" and confidence to 0.0."""


def user_message(sport: str, n_frames: int, target_player: str = "auto") -> str:
    """Per-call user message. Short — the system prompt has the heavy lifting."""
    where = ""
    if target_player == "near":
        where = " (focus on the bottom-half player closest to camera)"
    elif target_player == "far":
        where = " (focus on the top-half player far from camera)"
    return f"""Analyze the following {n_frames} keyframes of a single {sport} shot{where}. Output ONLY the JSON described in the system prompt."""


def system_prompt_batch(sport: str) -> str:
    """Batch variant — classify N shots in one call to save API quota.

    Each shot is shown as a sequence of keyframes; the user message marks where
    one shot ends and the next begins. The model returns a JSON object with a
    'shots' array of length exactly N (one entry per shot in order)."""
    vocab = shot_vocabulary(sport)
    defs = _format_definitions(sport)
    return f"""You are an expert {sport} coach analyzing multiple shot moments from a single video.

You will be shown {{n_shots}} shot moments back-to-back, each consisting of a few keyframes. The user message tells you exactly how many frames belong to each shot. Treat each shot independently — do not merge them.

For EACH shot, identify the shot type from this list:
{defs}

Respond with valid JSON ONLY (no markdown fences) matching this schema:
{{
  "shots": [
    {{
      "shot_index": 1,
      "shot_type": "<one of: {', '.join(vocab)}>",
      "confidence": <float 0.0-1.0>,
      "reasoning": "<one or two sentences referencing visual cues>",
      "alternatives": [
        {{"shot": "<second-most-likely>", "confidence": <float>}}
      ],
      "form_feedback": {{
        "strengths": ["<short bullet>", "..."],
        "weaknesses": ["<short bullet>", "..."],
        "tip": "<one actionable coaching tip>"
      }},
      "estimated_skill": "<Beginner|Intermediate|Advanced|Pro>",
      "power_level": "<soft|medium|hard|max>"
    }}
  ]
}}

The 'shots' array MUST have exactly {{n_shots}} entries in the same order as the frames you were shown. If a shot is unclear, set shot_type="unknown" and confidence=0.0 — never skip an entry.

For power_level: soft=gentle touch/no swing, medium=controlled stroke, hard=committed full swing, max=explosive whip / pro top-end power."""


def _box_focus_hint(target_box: dict | None, target_player: str = "auto") -> str:
    """Translate a normalized {x,y,width,height} bbox into a natural-language
    spatial hint Gemini can use to focus on the right player in a crowded
    (doubles/multi-player) frame. Falls back to the simpler quadrant string
    when no box is provided."""
    if isinstance(target_box, dict):
        try:
            cx = float(target_box.get("x", 0)) + float(target_box.get("width", 0)) / 2
            cy = float(target_box.get("y", 0)) + float(target_box.get("height", 0)) / 2
            v_zone = "top" if cy < 0.4 else "bottom" if cy > 0.6 else "middle"
            h_zone = "left" if cx < 0.4 else "right" if cx > 0.6 else "center"
            corner = f"{v_zone}-{h_zone}".replace("middle-center", "center")
            return (
                f"\n\nIMPORTANT — TARGET PLAYER ISOLATION:\n"
                f"Multiple players are visible. Track ONLY the player whose initial "
                f"position is at the {corner} area of the frame (normalized coords "
                f"~{cx:.2f}, {cy:.2f}). Identify this player by their court side, "
                f"clothing color, and body type, and track them through the entire video.\n\n"
                f"STRICT RULES:\n"
                f"1. If a shot is hit by ANYONE who is NOT the target player, "
                f"DO NOT include it. Skip it entirely — do not add it with shot_type='unknown'.\n"
                f"2. In your reasoning, ALWAYS reference the target player explicitly "
                f"(e.g., 'the target player in the bottom-left makes contact with...'). "
                f"If you can't confirm it's the target player, skip the shot.\n"
                f"3. When in doubt, fewer shots is better than wrong shots. Quality over quantity.\n"
                f"4. If the target player moves out of frame, just don't include shots "
                f"from that period — pick them back up when the target returns to view."
            )
        except Exception:
            pass
    if target_player == "near":
        return " (focus on the bottom-half player closest to camera)"
    if target_player == "far":
        return " (focus on the top-half player far from camera)"
    return ""


def user_message_batch(
    sport: str, frames_per_shot: list[int], target_player: str = "auto",
    target_box: dict | None = None,
) -> str:
    """Tells the model how the interleaved frames are grouped + which player
    to focus on. Pass target_box for doubles/multi-player frames so Gemini
    knows the exact spatial region of the target player and ignores others."""
    where = _box_focus_hint(target_box, target_player)
    layout = ", ".join(f"shot {i+1} = {n} frames" for i, n in enumerate(frames_per_shot))
    total = sum(frames_per_shot)
    return (
        f"You will receive {total} {sport} keyframes total, grouped as: {layout}.{where} "
        f"Output ONLY the JSON object with the 'shots' array described in the system prompt."
    )


GENERIC_SCHEMA_KEYS = {"shot_type", "confidence", "reasoning",
                       "alternatives", "form_feedback", "estimated_skill"}
