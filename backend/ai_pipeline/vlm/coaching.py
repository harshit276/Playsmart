"""VLM-driven text-only helpers: progress comparison + personalized coaching.

Both functions reuse the existing backend abstraction (Gemini/Anthropic/OpenAI/
local) but pass an empty image list — text-only calls are ~10x cheaper than
the image-based shot classification.
"""
from __future__ import annotations

import json
import re
from typing import Any

from .backends import pick_backend


_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _parse_json_safe(raw: str) -> dict:
    if not raw or not raw.strip():
        return {}
    text = raw.strip()
    m = _FENCE_RE.search(text)
    if m:
        text = m.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        s, e = text.find("{"), text.rfind("}")
        if s >= 0 and e > s:
            try:
                return json.loads(text[s : e + 1])
            except json.JSONDecodeError:
                return {}
    return {}


def _build_video_parts(sys_prompt: str, user_msg: str, video_bytes: bytes,
                       mime_type: str, fps: float = 3.0) -> list:
    """Build the parts list for a Gemini whole-video call with explicit
    FPS sampling. Tries the SDK's proto types first (where the
    video_metadata.fps field is supported), falls back to plain dict
    parts if the SDK / API version doesn't support fps override.
    Higher FPS catches short shot contact moments that default 1 fps
    sampling misses — critical for sports analysis."""
    try:
        import google.generativeai as genai  # type: ignore
        # SDK proto-based path (preferred — explicit VideoMetadata)
        try:
            video_meta = genai.protos.VideoMetadata(fps=fps)  # type: ignore[attr-defined]
            video_part = genai.protos.Part(
                inline_data=genai.protos.Blob(mime_type=mime_type, data=video_bytes),
                video_metadata=video_meta,
            )
            return [{"text": sys_prompt}, {"text": user_msg}, video_part]
        except (AttributeError, TypeError):
            pass
        # Dict-shape fallback — some SDK versions accept video_metadata
        # as a sibling key on the part dict.
        return [
            {"text": sys_prompt}, {"text": user_msg},
            {
                "inline_data": {"mime_type": mime_type, "data": video_bytes},
                "video_metadata": {"fps": fps},
            },
        ]
    except Exception:
        # Last resort: default sampling, no fps control.
        return [
            {"text": sys_prompt}, {"text": user_msg},
            {"mime_type": mime_type, "data": video_bytes},
        ]


def _summarize_analysis(a: dict) -> dict:
    """Boil down a stored analysis to the fields a coach actually cares about.

    Crucial for cross-session comparison: we include the per-shot AI Coach
    reasoning + ALL form_feedback bullets (strengths/weaknesses/tip), since
    that's the only signal of technique-level changes when no video/keyframes
    are stored.
    """
    sa = a.get("shot_analysis") or {}
    metrics = a.get("performance_scores") or a.get("detailed_metrics") or {}
    shots = a.get("shots") or []
    return {
        "date": a.get("date") or a.get("created_at") or a.get("timestamp"),
        "sport": a.get("sport"),
        "skill_level": a.get("skill_level"),
        "primary_shot": sa.get("shot_name") or sa.get("shot_type"),
        "overall_score": sa.get("score") or sa.get("assessment", {}).get("overall_score"),
        "grade": sa.get("grade") or sa.get("assessment", {}).get("grade"),
        "weaknesses": [w.get("issue") for w in (sa.get("weaknesses") or []) if w.get("issue")][:5],
        "metrics": {k: v for k, v in metrics.items() if isinstance(v, (int, float))},
        "shots": [
            {
                "type": s.get("shot_type") or s.get("type"),
                "score": s.get("overall_score") or s.get("score"),
                "confidence": s.get("confidence"),
                "power_level": s.get("power_level") or s.get("powerLevel"),
                "speed_kmh": (s.get("speed") or {}).get("estimated_speed_kmh") if isinstance(s.get("speed"), dict) else s.get("speed"),
                "reasoning": s.get("reasoning"),
                "form_strengths": (s.get("form_feedback") or s.get("formFeedback") or {}).get("strengths") or [],
                "form_weaknesses": (s.get("form_feedback") or s.get("formFeedback") or {}).get("weaknesses") or [],
                "form_tip": (s.get("form_feedback") or s.get("formFeedback") or {}).get("tip"),
            }
            for s in shots[:8]
        ],
    }


def compare_analyses(
    old_analysis: dict, new_analysis: dict, days_between: int,
    backend: str = "auto",
) -> dict:
    """Ask the VLM to produce a coach-quality comparison narrative.
    Returns: {improved, regressed, next_focus, summary, score_delta, _meta}.
    """
    old = _summarize_analysis(old_analysis)
    new = _summarize_analysis(new_analysis)
    sport = new.get("sport") or old.get("sport") or "badminton"

    sys_prompt = (
        f"You are an expert {sport} coach reviewing a player's progress between two practice "
        f"sessions {days_between} days apart. The player is the same person.\n\n"
        f"You don't have video — you have the AI-judged per-shot reasoning, form_strengths, "
        f"form_weaknesses, and form_tip text from each session, plus the numeric scores. "
        f"That's enough to detect real technique changes:\n"
        f"- If the SAME weakness appears in both sessions, it's PERSISTENT.\n"
        f"- If a weakness in OLD is missing from NEW, they likely improved (cite which one).\n"
        f"- If NEW has a weakness OLD didn't, it's a NEW issue or a regression.\n"
        f"- If reasoning text describes the SAME technique element (e.g. 'open stance') "
        f"with different qualifiers ('slightly open' vs 'corrected'), call out the change.\n\n"
        f"Be specific and grounded. Don't fabricate improvements that aren't visible in the text. "
        f"If shot types differ between sessions, note that the comparison is partial.\n\n"
        f"Respond with valid JSON ONLY (no markdown fences) matching:\n"
        '{\n'
        '  "improved": ["<specific change citing OLD vs NEW evidence>", "..."],\n'
        '  "regressed": ["<specific negative change citing evidence>", "..."],\n'
        '  "persistent_issues": ["<weakness present in both sessions>", "..."],\n'
        '  "next_focus": "<the ONE thing they should focus on for the next session>",\n'
        '  "summary": "<2-3 sentence motivational coach-voice summary>",\n'
        '  "score_delta_explanation": "<why the score changed (or didn\'t)>"\n'
        '}\n'
    )
    user_msg = (
        f"OLD SESSION ({old.get('date')}):\n{json.dumps(old, indent=2, default=str)}\n\n"
        f"NEW SESSION ({new.get('date')}):\n{json.dumps(new, indent=2, default=str)}"
    )

    backend_obj = pick_backend(backend)
    raw = backend_obj.call(sys_prompt, user_msg, [])
    data = _parse_json_safe(raw)

    score_old = old.get("overall_score") or 0
    score_new = new.get("overall_score") or 0
    return {
        "improved": [str(x) for x in (data.get("improved") or [])][:5],
        "regressed": [str(x) for x in (data.get("regressed") or [])][:5],
        "persistent_issues": [str(x) for x in (data.get("persistent_issues") or [])][:5],
        "next_focus": str(data.get("next_focus", "")),
        "summary": str(data.get("summary", "")),
        "score_delta_explanation": str(data.get("score_delta_explanation", "")),
        "score_old": float(score_old) if score_old else 0.0,
        "score_new": float(score_new) if score_new else 0.0,
        "score_delta": round(float(score_new) - float(score_old), 1) if (score_old and score_new) else 0.0,
        "days_between": days_between,
        "_meta": {
            "backend": backend_obj.name,
            "model": backend_obj.model_name,
        },
    }


SUPPORTED_SPORTS = ["badminton", "tennis", "table_tennis", "pickleball", "cricket"]


def generic_drill_set(
    sport: str, skill_level: str, focus: str | None = None,
    video_pool: list[dict] | None = None,
    backend: str = "auto",
) -> dict:
    """Generate a sport+level-aware drill set when we don't have a recent
    analysis to personalize against. Used by the training page so guests
    and profile-less users get content that actually changes when they
    flip sport / level filters. Cached server-side by (sport, level).

    video_pool: optional list of {id, title, channel, url, thumbnail} dicts
        — when provided, the AI Coach picks the single best matching video
        for each drill from this pool. Saves us from inventing video IDs
        we don't actually have. Frontend uses the matched id for the
        thumbnail URL.

    Returns: {drills: [{name, why, instructions, duration_min,
                        equipment_needed, level, video_id, video_url,
                        thumbnail_url}], _meta}.
    """
    sport = (sport or "badminton").lower()
    level = (skill_level or "Beginner").title()

    video_block = ""
    pool_by_id: dict[str, dict] = {}
    if video_pool:
        slim = []
        for v in video_pool[:40]:
            vid = v.get("id") or v.get("video_id") or ""
            if not vid:
                continue
            slim.append({
                "id": vid,
                "title": v.get("title", "")[:120],
                "channel": v.get("channel", "")[:60],
                "skill_areas": v.get("skill_areas", []),
            })
            pool_by_id[vid] = v
        if slim:
            video_block = (
                "\n\nVIDEO POOL — for each drill, pick the SINGLE best matching "
                "video_id from this list (or null if no video clearly fits). "
                "Do NOT invent ids — only choose from the list:\n"
                + json.dumps(slim, indent=2)
            )

    sys_prompt = (
        f"You are an expert {sport} coach. List the 6 highest-impact drills "
        f"a {level}-level player should be doing right now. Each drill must "
        f"be appropriate for the level — beginners get fundamentals, "
        f"intermediates get pattern work, advanced get pressure/tempo drills, "
        f"pros get tactical refinement. Be concrete and specific to {sport}."
        + (f" Focus area: {focus}." if focus else "")
        + "\n\n"
        "Respond with valid JSON only:\n"
        '{\n'
        '  "drills": [\n'
        '    {\n'
        '      "name": "<drill name>",\n'
        '      "why": "<one sentence why this drill matters at this level>",\n'
        '      "instructions": "<2-3 sentence how-to>",\n'
        '      "duration_min": <int 5-30>,\n'
        '      "equipment_needed": ["<simple item>"],\n'
        '      "level": "<beginner|intermediate|advanced|pro>",\n'
        '      "video_id": "<id from video pool OR null if no clear match>"\n'
        '    }\n'
        '  ]\n'
        '}'
        + video_block
    )
    user_msg = f"6 best drills for a {level} {sport} player."

    backend_obj = pick_backend(backend)
    try:
        raw = backend_obj.call(sys_prompt, user_msg, [])
    except Exception as exc:
        return {"drills": [], "_meta": {"error": str(exc)[:200], "backend": backend_obj.name}}

    data = _parse_json_safe(raw)
    drills = []
    for d in (data.get("drills") or [])[:6]:
        if not isinstance(d, dict):
            continue
        vid = d.get("video_id")
        if vid and not isinstance(vid, str):
            vid = None
        # Validate the matched id actually exists in the pool we passed
        video_meta = pool_by_id.get(vid or "") if vid else None
        drills.append({
            "name": str(d.get("name", ""))[:120],
            "why": str(d.get("why", ""))[:200],
            "instructions": str(d.get("instructions", ""))[:400],
            "duration_min": int(d.get("duration_min") or 15),
            "equipment_needed": [str(x)[:60] for x in (d.get("equipment_needed") or [])][:5],
            "level": str(d.get("level", level)).lower(),
            "video_id": video_meta.get("id") if video_meta else None,
            "video_url": (video_meta.get("url") if video_meta else None),
            "thumbnail_url": (
                video_meta.get("thumbnail") or video_meta.get("thumbnail_url")
                if video_meta else None
            ),
            "video_title": video_meta.get("title") if video_meta else None,
        })
    return {"drills": drills, "_meta": {"backend": backend_obj.name, "model": backend_obj.model_name}}


def quiz_personalization(
    quiz_data: dict, backend: str = "auto",
    equipment_catalog: list[dict] | None = None,
) -> dict:
    """Take onboarding-quiz answers, return AI-personalized starter profile.

    Cheaper than the full personalized_coaching call (text only, no per-shot
    data) — used right after a player completes the equipment quiz.

    Returns: {intro_message, strengths, focus_areas, equipment_picks,
              starter_plan, _meta}.
    """
    sport = (quiz_data.get("sport") or "badminton").lower()
    skill = quiz_data.get("skill_level") or "Beginner"
    style = quiz_data.get("play_style") or "All-round"
    freq = quiz_data.get("playing_frequency") or "weekly"
    budget = quiz_data.get("budget_range") or "any"
    notes = quiz_data.get("specific_preferences") or "none"

    catalog_block = ""
    if equipment_catalog:
        slim = [
            {k: v for k, v in item.items()
             if k in ("id", "name", "category", "level", "price_inr", "good_for")}
            for item in equipment_catalog[:60]
        ]
        catalog_block = (
            "\n\nAVAILABLE EQUIPMENT (recommend by id from this list — "
            "do NOT invent products):\n" + json.dumps(slim, indent=2)
        )

    sys_prompt = (
        f"You are an expert {sport} coach onboarding a new player. They've just "
        f"answered a setup quiz. Generate personalized starter recommendations "
        f"that match their actual stated preferences. Be specific, not generic.\n\n"
        "Respond with valid JSON only (no markdown):\n"
        '{\n'
        '  "intro_message": "<2 sentences welcoming the player + naming what we will work on>",\n'
        '  "strengths": ["<2-3 short bullets they likely have based on style + skill>"],\n'
        '  "focus_areas": ["<3-4 short bullets they should improve next, ordered by priority>"],\n'
        '  "equipment_picks": [\n'
        '    {\n'
        '      "item_id": "<id from catalog OR null>",\n'
        '      "category": "<racket | paddle | shoes | apparel | accessory>",\n'
        '      "name": "<product or category recommendation>",\n'
        '      "why": "<why this fits THIS player\'s skill+style+budget>"\n'
        '    }\n'
        '  ],\n'
        '  "starter_plan": [\n'
        '    {"day": 1, "focus": "<...>", "drills": ["<drill>"], "minutes": <int>}\n'
        '  ]\n'
        '}\n\n'
        "starter_plan = exactly 7 days. equipment_picks = 2-4 items. "
        "Tailor everything to the player's specific level + style + budget."
        f"{catalog_block}"
    )
    user_msg = (
        f"PLAYER QUIZ ANSWERS:\n"
        f"- Sport: {sport}\n"
        f"- Skill level: {skill}\n"
        f"- Play style: {style}\n"
        f"- Playing frequency: {freq}\n"
        f"- Budget: {budget}\n"
        f"- Other preferences: {notes}"
    )

    backend_obj = pick_backend(backend)
    try:
        raw = backend_obj.call(sys_prompt, user_msg, [])
    except Exception as exc:
        return {"_meta": {"error": str(exc)[:200], "backend": backend_obj.name}}

    data = _parse_json_safe(raw)
    return {
        "intro_message": str(data.get("intro_message", ""))[:500],
        "strengths": [str(x)[:120] for x in (data.get("strengths") or [])][:4],
        "focus_areas": [str(x)[:120] for x in (data.get("focus_areas") or [])][:5],
        "equipment_picks": [e for e in (data.get("equipment_picks") or []) if isinstance(e, dict)][:5],
        "starter_plan": [d for d in (data.get("starter_plan") or []) if isinstance(d, dict)][:7],
        "_meta": {"backend": backend_obj.name, "model": backend_obj.model_name},
    }


def coach_chat(
    question: str, sport: str | None = None, history: list[dict] | None = None,
    context_docs: list[dict] | None = None, backend: str = "auto",
) -> dict:
    """Sport-coach chatbot reply via the same VLM backend the analyze pipeline
    uses. Used as a fallback when Groq isn't configured.

    Returns: {answer, _meta}.
    """
    history = history or []
    context_docs = context_docs or []

    ctx_block = ""
    if context_docs:
        ctx_block = "\n\nRELEVANT KNOWLEDGE BASE EXCERPTS:\n"
        for d in context_docs[:5]:
            title = (d.get("meta") or {}).get("name") or (d.get("meta") or {}).get("title", "")
            ctx_block += f"- {d.get('kind', 'doc')}: {title}\n  {str(d.get('content', ''))[:300]}\n"

    sys_prompt = (
        "You are AthlyticAI's Virtual Coach. You help players with sports questions: "
        "equipment recommendations, training, technique, rules, and player advice. "
        "If the player asks something off-topic (cooking, politics, etc.), gently steer "
        "them back to sports. Keep replies under 200 words. Use markdown lists for "
        "structure when helpful. Cite specific products when context provides them."
        + ((" Player's primary sport: " + sport) if sport else "")
        + ctx_block
    )

    history_block = ""
    if history:
        for h in history[-6:]:
            role = h.get("role", "user")
            content = str(h.get("content", ""))[:500]
            history_block += f"\n{role.upper()}: {content}"
        history_block = "\n\nPREVIOUS TURNS:" + history_block + "\n\n"

    user_msg = f"{history_block}USER QUESTION: {question}"

    backend_obj = pick_backend(backend)
    try:
        raw = backend_obj.call(sys_prompt, user_msg, [])
    except Exception as exc:
        return {"answer": f"AI coach unavailable: {exc.__class__.__name__}",
                "_meta": {"error": str(exc)[:200], "backend": backend_obj.name}}

    return {
        "answer": (raw or "").strip(),
        "_meta": {"backend": backend_obj.name, "model": backend_obj.model_name},
    }


def analyze_video_full(
    video_bytes: bytes, mime_type: str, sport: str,
    target_player: str = "auto", target_box: dict | None = None,
    backend: str = "auto",
) -> dict:
    """Send the whole video to Gemini in one inline-data request. Gemini
    identifies shot moments AND classifies each one — eliminates the
    browser-side wrist-speed heuristic that was missing serves and
    triggering on stagnant frames.

    Returns: {shots: [{timestamp_sec, shot_type, confidence, reasoning,
                       alternatives, form_feedback, estimated_skill,
                       power_level}], _meta}.

    Cost: ~258 input tokens per second of video. A 20s clip = ~5K tokens
    in, ~1K out. Total ~$0.005-0.02 per analysis on gemini-2.5-flash.
    """
    sport = (sport or "badminton").lower()
    # Reuse the existing vocab/definitions from prompts.py without exporting
    # the helpers — keep coaching.py self-contained.
    from .prompts import SHOT_VOCAB, SHOT_DEFINITIONS
    vocab = SHOT_VOCAB.get(sport, ["unknown"])
    if sport in SHOT_DEFINITIONS:
        defs = "\n".join(f"- {k}: {v}" for k, v in SHOT_DEFINITIONS[sport].items())
    else:
        defs = "\n".join(f"- {s}" for s in vocab)

    box_hint = ""
    if isinstance(target_box, dict):
        try:
            cx = float(target_box.get("x", 0)) + float(target_box.get("width", 0)) / 2
            cy = float(target_box.get("y", 0)) + float(target_box.get("height", 0)) / 2
            v_zone = "top" if cy < 0.4 else "bottom" if cy > 0.6 else "middle"
            h_zone = "left" if cx < 0.4 else "right" if cx > 0.6 else "center"
            corner = f"{v_zone}-{h_zone}".replace("middle-center", "center")
            box_hint = (
                f"\n\nIMPORTANT — TARGET PLAYER:\n"
                f"Identify the {sport} player initially positioned at the {corner} "
                f"area of the frame (normalized ~{cx:.2f}, {cy:.2f}). Note their "
                f"clothing color, body type, and court side. Track that same "
                f"player throughout the entire video.\n\n"
                f"USE THE FULL FRAME for shot context:\n"
                f"- Shuttle/ball trajectory, landing zone, and net clearance are "
                f"how you distinguish smash vs drop vs clear vs drive vs lift.\n"
                f"- Opponent position and reaction inform shot intent.\n"
                f"- The target player's identity tells you WHO; the rest of the "
                f"frame tells you WHAT shot it was and how good it was.\n\n"
                f"STRICT RULES for shot inclusion:\n"
                f"1. ONLY include shots hit by the target player. Skip every shot "
                f"hit by any other player on the court.\n"
                f"2. In each shot's reasoning, REFERENCE the target player "
                f"explicitly (e.g., 'the target player wearing X in the {corner}') "
                f"AND the shuttle/ball trajectory (e.g., 'the shuttle arcs steeply "
                f"down to the front court — a clear smash').\n"
                f"3. If you can't confirm a shot belongs to the target player, "
                f"SKIP it. Quality > quantity."
            )
        except Exception:
            pass

    sys_prompt = (
        f"You are an expert {sport} coach watching a player's practice video. "
        f"Identify EVERY shot played in the video, in chronological order. "
        f"For each shot, provide the timestamp (in seconds from video start) "
        f"and a full coach-quality analysis.\n\n"
        # ── SHOT LABELING — describe FIRST, categorise SECOND ────────────
        # The old prompt forced every shot into a small enum, which made
        # the model collapse "defensive lift that fell short" + "diving
        # block" + "textbook clear" all into the same label. We now ask
        # for a free-text descriptor (what the coach would actually call
        # it on the sideline) AND a canonical category from a controlled
        # list (used downstream for trend tracking, drill matching, and
        # pro-reference lookup). Both fields are required.
        f"For each shot you produce TWO labels — shot_label is what the "
        f"user sees, shot_category is for internal routing:\n\n"
        f"1. shot_label — a natural, concrete description of the shot a "
        f"coach would say out loud. 2-6 words. Include the INTENT or "
        f"OUTCOME when visible. THIS IS THE PRIMARY USER-FACING LABEL — "
        f"make it specific and useful. Examples:\n"
        f"   • 'Defensive lift (short)' — when a lift falls mid-court\n"
        f"   • 'Cross-court smash — winner'\n"
        f"   • 'Diving backhand block'\n"
        f"   • 'Net kill — winner'\n"
        f"   • 'Forehand drive — neutral rally'\n"
        f"   • 'Flat backhand drive at body'\n"
        f"   Do NOT just use the canonical category as the label (don't write plain 'Clear' or 'Drive'). Describe what actually happened.\n\n"
        f"2. shot_category — a single snake_case keyword for the technique. "
        f"PREFER one of these familiar terms (used internally for drill "
        f"matching and pro-reference lookup):\n{defs}\n"
        f"But if the shot genuinely doesn't fit any of them, use your own "
        f"snake_case label (e.g. 'forehand_drive', 'backhand_block', "
        f"'cross_court_drop') and set confidence < 0.7 — better an honest "
        f"out-of-vocab label than a wrong-bucket label.\n\n"
        f"Also classify each shot's INTENT and OUTCOME:\n"
        f"   • intent: 'attacking' | 'defensive' | 'neutral'\n"
        f"   • outcome: 'winner' | 'forced_error' | 'continued_rally' | 'lost_point' | 'unknown'\n"
        f"   • quality_observation: one short sentence on whether this shot was "
        f"     well-executed for its intent (NOT for every shot — be concrete; "
        f"     e.g. 'Lift was short, gave opponent the smash angle' or "
        f"     'Clean contact, smash landed deep and unreturnable')\n\n"
        f"If a moment isn't clearly a shot (player is walking, recovering, or "
        f"just preparing), DON'T list it. Only include moments where the player "
        f"makes contact with the ball/shuttle. Order shots by timestamp.\n\n"
        f"CRITICAL — DO NOT DEFAULT TO 'serve' FOR RALLY-STARTING SHOTS:\n"
        f"A serve requires ALL of these: (1) ball/shuttle starts stationary "
        f"in the non-racket hand, (2) a visible toss or drop by that hand "
        f"just before contact, (3) NO incoming ball from the opponent at "
        f"contact, (4) racket starts low / by the side, not in a ready or "
        f"blocking position. If ANY of those is missing, the shot is a "
        f"drive / clear / smash / drop / loop / push — NEVER a serve. "
        f"Practice clips against a wall, robot, or feeder coach are never "
        f"serves. When uncertain, classify as a drive and set confidence "
        f"< 0.7 — never invent a serve.\n\n"
        + (
            # Badminton-only — the most common misclassification in
            # practice is calling a flat DRIVE a "clear" because both
            # can travel deep. The contact HEIGHT and shuttle TRAJECTORY
            # are the only reliable disambiguators; lock the model onto
            # them.
            (
              f"CRITICAL — DRIVE vs CLEAR (badminton):\n"
              f"These two are the most-commonly-confused shots. Use this exact rule:\n"
              f"  • CLEAR: contact happens ABOVE THE HEAD with the racket arm "
              f"fully extended UP; shuttle then arcs HIGH (peaks well above the "
              f"players, often near the ceiling for indoor footage) and lands "
              f"in the back court. No high arc = NOT a clear.\n"
              f"  • DRIVE: contact at SHOULDER/CHEST height with a short, "
              f"punchy forearm whip; shuttle stays FLAT and travels horizontally "
              f"just over the net. Used in fast mid-court rallies. Flat "
              f"trajectory = drive even if it reaches the back court.\n"
              f"In any flat exchange or drill where players are facing each "
              f"other at the mid-court and trading shots at shoulder level, "
              f"the shots are DRIVES — do not label them clears just because "
              f"they travel deep.\n\n"
            ) if sport == "badminton" else ""
          )
        +
        f""
        f"CRITICAL — ONE SWING = ONE SHOT:\n"
        f"A single physical shot has a windup, contact, and follow-through "
        f"that span 0.5-2 seconds. Report each physical swing AS ONE SHOT, "
        f"using the timestamp of the CONTACT moment. Do NOT emit multiple "
        f"entries for the same swing (e.g. one for windup, one for contact, "
        f"one for follow-through). If two consecutive timestamps are within "
        f"~1.5 seconds AND the same shot_category, they are almost certainly "
        f"the same physical shot — merge them into one entry at the contact "
        f"moment. Count carefully: if the player physically swung the racket "
        f"3 times, the array must have 3 entries, not 9.{box_hint}\n\n"
        f"Respond with valid JSON ONLY (no markdown):\n"
        '{\n'
        '  "shots": [\n'
        '    {\n'
        f'      "timestamp_sec": <float, when contact happens>,\n'
        f'      "shot_label": "<natural 2-5 word description>",\n'
        f'      "shot_category": "<one of: {", ".join(vocab)}>",\n'
        '      "intent": "<attacking|defensive|neutral>",\n'
        '      "outcome": "<winner|forced_error|continued_rally|lost_point|unknown>",\n'
        '      "quality_observation": "<one specific sentence>",\n'
        '      "confidence": <0-1>,\n'
        '      "reasoning": "<one sentence — what you saw>",\n'
        '      "alternatives": [{"shot": "<...>", "confidence": <0-1>}],\n'
        '      "form_feedback": {\n'
        '        "strengths": ["<bullet>", "..."],\n'
        '        "weaknesses": ["<bullet>", "..."],\n'
        '        "tip": "<one actionable tip>"\n'
        '      },\n'
        '      "estimated_skill": "<Beginner|Intermediate|Advanced|Pro>",\n'
        '      "power_level": "<soft|medium|hard|max>"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        # Backward-compat: many downstream consumers still read `shot_type`.
        # Always set shot_type = shot_category so old code keeps working.
        'IMPORTANT: ALSO include `shot_type` set to the same value as `shot_category` '
        'in every shot object (for backward compatibility with existing UI code).'
    )
    user_msg = (
        f"Watch this {sport} video. Identify every shot the player made, "
        f"in chronological order, with timestamps."
    )

    backend_obj = pick_backend(backend)
    try:
        import google.generativeai as genai  # type: ignore
        model = backend_obj._get() if hasattr(backend_obj, "_get") else None
        if model is None:
            import os as _os
            genai.configure(api_key=_os.environ["GEMINI_API_KEY"])
            model = genai.GenerativeModel(backend_obj.model_name)
        # IMPORTANT: Gemini samples video at 1 fps by default, which means
        # short shots (badminton smashes ~0.3-0.5s) often fall ENTIRELY
        # between sampled frames → the model literally never sees the
        # contact moment, so it can only describe windup/follow-through
        # and counts fewer shots than actually happened. Boost to 3 fps
        # so every shot's contact frame is captured. Cost goes from
        # ~258 tokens/sec to ~774 tokens/sec — still cheap (~$0.005-0.02
        # per analysis on Flash). Falls back to default sampling if the
        # SDK version doesn't expose VideoMetadata.
        parts = _build_video_parts(sys_prompt, user_msg, video_bytes, mime_type or "video/mp4", fps=3.0)
        resp = model.generate_content(
            parts,
            generation_config={"temperature": 0.0, "response_mime_type": "application/json"},
        )
        raw = resp.text
    except Exception as exc:
        return {"shots": [], "_meta": {"error": str(exc)[:300], "backend": backend_obj.name}}

    data = _parse_json_safe(raw)
    shots_out = []
    for s in (data.get("shots") or [])[:20]:
        if not isinstance(s, dict):
            continue

        # PHILOSOPHY: trust Gemini's labels. Old code took Gemini's
        # natural language ("Cross-court drive — winner") and collapsed
        # it into our 8-shot vocab via substring matching, which
        # routinely mis-bucketed drives as clears because "clear"
        # appears earlier than "drive" in the vocab. The new flow:
        #   • shot_label   — Gemini's free-text description (PRIMARY display).
        #   • shot_category — Gemini's snake_case category as returned.
        #   • shot_type    — same as shot_category (back-compat alias).
        #   • _lookup_category — longest-match vocab entry used ONLY for
        #     internal lookups (pro reference, drill matching). Never
        #     displayed. Falls through to None when no vocab match.

        raw_label = str(s.get("shot_label") or "").strip()
        raw_category = (
            str(s.get("shot_category") or s.get("shot_type") or "unknown")
            .lower().strip().replace("-", "_").replace(" ", "_")
        )
        raw_category = "".join(ch for ch in raw_category if ch.isalnum() or ch == "_").strip("_") or "unknown"

        # Vocab lookup — longest-match wins so "low_drive_clear" → "drive",
        # not "clear" (which was the production bug). Returns None when
        # Gemini's category is genuinely outside our curated vocab; we
        # surface it as-is and rely on downstream (pro ref) to fall back
        # gracefully.
        lookup_category = None
        if raw_category in vocab:
            lookup_category = raw_category
        elif vocab:
            candidates = [v for v in vocab if v in raw_category or raw_category in v]
            if candidates:
                lookup_category = max(candidates, key=len)

        conf = max(0.0, min(1.0, float(s.get("confidence", 0.0) or 0.0)))
        skill = str(s.get("estimated_skill", "Intermediate")).strip().title()
        if skill not in ("Beginner", "Intermediate", "Advanced", "Pro"):
            skill = "Intermediate"
        power = str(s.get("power_level", "medium")).strip().lower()
        if power not in ("soft", "medium", "hard", "max"):
            power = "medium"

        ff = s.get("form_feedback") or {}
        if not isinstance(ff, dict):
            ff = {}
        ff = {
            "strengths": [str(x) for x in (ff.get("strengths") or [])[:5]],
            "weaknesses": [str(x) for x in (ff.get("weaknesses") or [])[:5]],
            "tip": str(ff.get("tip", "")),
        }

        alts = []
        for a in (s.get("alternatives") or [])[:3]:
            if isinstance(a, dict) and "shot" in a:
                a_shot = str(a["shot"]).lower().strip().replace(" ", "_")
                # Keep alternatives even when outside vocab — they're
                # informational and the UI just displays the name.
                alts.append({
                    "shot": a_shot,
                    "confidence": max(0.0, min(1.0, float(a.get("confidence", 0.0) or 0.0))),
                })

        intent = str(s.get("intent", "neutral")).strip().lower()
        if intent not in ("attacking", "defensive", "neutral"):
            intent = "neutral"
        outcome = str(s.get("outcome", "unknown")).strip().lower()
        if outcome not in ("winner", "forced_error", "continued_rally", "lost_point", "unknown"):
            outcome = "unknown"

        try:
            ts = float(s.get("timestamp_sec") or 0.0)
        except Exception:
            ts = 0.0

        # Display label hierarchy: rich free-text from Gemini if it gave
        # us one, otherwise titlecased category, otherwise "Shot".
        display_label = raw_label or (raw_category.replace("_", " ").title() if raw_category != "unknown" else "Shot")

        shots_out.append({
            "timestamp_sec": ts,
            # Primary user-visible label — Gemini's natural language.
            "shot_label": display_label,
            # Category (Gemini's snake_case) preserved as-is.
            "shot_category": raw_category,
            # Back-compat alias for downstream code that reads shot_type.
            "shot_type": raw_category,
            # Vocab-mapped key — internal use only (pro-ref / drill lookup).
            "_lookup_category": lookup_category,
            "confidence": conf,
            "reasoning": str(s.get("reasoning", ""))[:500],
            "description": str(s.get("description", ""))[:400],
            "quality_observation": str(s.get("quality_observation", ""))[:400],
            "intent": intent,
            "outcome": outcome,
            "alternatives": alts,
            "form_feedback": ff,
            "estimated_skill": skill,
            "power_level": power,
        })
    return {
        "shots": shots_out,
        "_meta": {"backend": backend_obj.name, "model": backend_obj.model_name,
                  "video_bytes": len(video_bytes), "mime_type": mime_type},
    }


def _build_universal_prompt(target_player_description: str | None = None) -> tuple[str, str]:
    """Build the (sys_prompt, user_msg) for the universal sport-agnostic
    analysis call. Extracted so the streaming variant can reuse it without
    duplicating ~150 lines of prompt text."""
    # If no target description, default to "the player closest to the
    # camera / in the foreground" — gives Gemini a deterministic anchor
    # in 2-player clips so it doesn't randomly mix shots from both sides.
    described = target_player_description or "the player closest to the camera (foreground)"
    box_hint = (
        f"\n\n━━━ TARGET PERSON (STRICT) ━━━\n"
        f"You are analyzing ONLY this person: {described}.\n"
        f"\n"
        f"HARD RULES — these override every other instruction in this prompt:\n"
        f"\n"
        f"1. ONLY include events performed by the target person. Skip every "
        f"   event performed by anyone else in the frame (opponent, doubles "
        f"   partner, coach, feeder, bystander). Quality > quantity. It is "
        f"   better to return 2 confirmed target-person events than 8 "
        f"   events of mixed provenance.\n"
        f"\n"
        f"2. In EVERY event's `reasoning` field, you must explicitly reference "
        f"   the target person and what makes you confident this event was "
        f"   theirs (e.g. 'Target player in red shirt swings the racket and "
        f"   makes contact at 0:04'). If your reasoning cannot name the target "
        f"   in this way, DROP that event from the array.\n"
        f"\n"
        f"3. In rally / two-player sports (badminton, tennis, TT, pickleball, "
        f"   squash), opponents will hit shots too. NEVER attribute opponent "
        f"   shots to the target person. If an attacking shot (smash, kill, "
        f"   winner) is hit AT the target person, it belongs to the opponent — "
        f"   skip it. The target's response (block, return, lift) is what "
        f"   counts as the target's event.\n"
        f"\n"
        f"4. If a moment is ambiguous (camera angle hides the contact, multiple "
        f"   players in frame, motion blur), SKIP it. Do not guess.\n"
        f"\n"
        f"5. After producing the events array, re-read each one and ask 'am I "
        f"   100% sure this was the target person?' — if no, delete it. The "
        f"   final array should contain ONLY events you would defend to a coach.\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    )

    sys_prompt = (
        "You are an expert sports coach. The video may be from ANY sport — "
        "racquet, ball, swimming, combat, weightlifting, snooker, golf, "
        "running, gymnastics, etc. Do NOT assume it's a racquet sport.\n\n"
        "Step 1: identify the sport.\n"
        "Step 2: identify every meaningful EVENT in the video where the "
        "athlete performs a discrete technique (one shot, one stroke "
        "cycle, one rep, one pot, etc.) — NOT idle motion or recovery.\n"
        "Step 3: for each event, give a brief coach-quality analysis.\n\n"
        "For each event you must produce TWO labels:\n\n"
        "1. shot_label — a natural, concrete 2-5 word description a coach "
        "would actually say out loud. Include the INTENT or OUTCOME when "
        "visible. Examples (generic — adapt wording to the sport you see):\n"
        "   • 'Compact flat drive (cooperative pace)'\n"
        "   • 'Defensive lift — fell short'\n"
        "   • 'Net kill — winner'\n"
        "   • 'Counter-attacking backhand'\n"
        "   • 'Long pot — top pocket'\n"
        "   • 'Freestyle stroke — high elbow catch'\n"
        "   DO NOT use the canonical category name as the shot_label — be "
        "specific. A label of just 'Drive' or just 'Forehand' is WRONG; "
        "the shot_label must describe what actually happened, not the "
        "category bucket.\n"
        "   For cooperative drill clips where every shot is similar, "
        "distinguish them by sequence number, intent, or quality "
        "(e.g. 'Forehand drive 1 — clean contact', 'Forehand drive 2 — "
        "slightly late', 'Forehand drive 3 — rushed footwork').\n\n"
        "2. shot_category — a single snake_case keyword for the canonical "
        "technique (used internally for trend tracking and drill matching). "
        "Examples: 'forehand_drive', 'smash', 'backhand_loop', 'long_pot', "
        "'freestyle_stroke', 'deadlift', 'tee_shot'. Use lowercase, "
        "underscores instead of spaces, no punctuation. Pick a name that "
        "is standard for the sport you detected — if you're unsure, use "
        "the closest common term and keep `confidence < 0.7`.\n\n"
        "Also classify each event's INTENT and OUTCOME:\n"
        "   • intent: 'attacking' | 'defensive' | 'neutral'\n"
        "   • outcome: 'winner' | 'forced_error' | 'continued_rally' | "
        "'lost_point' | 'unknown' (for non-rally sports like swimming or "
        "weightlifting, use 'continued_rally' for clean reps and "
        "'unknown' when you can't tell).\n"
        "   • quality_observation: one SHORT, SPECIFIC sentence on what "
        "made this rep good or bad. Be concrete — say what you actually "
        "saw. BAD: 'Player executes a forehand drive' (that's just "
        "restating the category). GOOD: 'Contact slightly late, ball "
        "floated above net height' or 'Hips fully rotated, clean punch "
        "through the line.'\n\n"
        "CRITICAL — ONE TECHNIQUE = ONE EVENT:\n"
        "A single physical motion (windup/contact/follow-through, or one "
        "full stroke cycle in swimming) is ONE event at the moment of "
        "execution. Do NOT emit multiple entries for phases of the same "
        "motion. If two consecutive timestamps are within ~1.5 seconds "
        "AND the same shot_category, they are almost certainly the same "
        "physical motion — merge them into one entry at the contact "
        "moment. If the athlete performed 3 reps/shots/strokes, the "
        "events array must have 3 entries, not 9.\n\n"
        "CRITICAL — DO NOT DEFAULT TO 'SERVE' FOR RALLY-STARTING SHOTS:\n"
        "A SERVE has ALL of these traits:\n"
        "  1. Ball/shuttle starts STATIONARY in the player's non-racket hand,\n"
        "  2. There is a visible TOSS or DROP of the ball/shuttle by that hand\n"
        "     immediately before contact,\n"
        "  3. There is NO incoming ball from the opponent at the moment\n"
        "     of contact (because the rally hasn't started yet),\n"
        "  4. The racket starts low / by the side of the body, not in a\n"
        "     ready/blocking position.\n"
        "If any of those four traits is NOT present, the shot is a DRIVE, "
        "LOOP, PUSH, CLEAR, SMASH, or DROP — never a serve. Practice "
        "drills against a wall, robot, or coach feeding shots are NEVER "
        "serves even if they look like the rally start. When in doubt, "
        "classify as a drive/stroke and put `confidence < 0.7` so the "
        "user knows it's tentative — do not invent a serve.\n\n"
        "CRITICAL — FLAT-EXCHANGE DRILLS ARE DRIVES, NOT CLEARS:\n"
        "If you see two players (or a player and a feeder) trading shots "
        "at SHOULDER/CHEST height with FLAT shuttle trajectory just over "
        "the net — that is a flat drive exchange drill. Every shot in it "
        "is a DRIVE (or forehand_drive / backhand_drive). It is NOT a "
        "clear. A CLEAR requires contact ABOVE THE HEAD with the racket "
        "arm fully extended UP, and the shuttle then arcs HIGH (peaks "
        "well above the players) into the back court. No high arc + no "
        "overhead contact = NOT a clear, even if the shuttle eventually "
        "reaches a deep landing zone. Use the actual shuttle path, not "
        "the landing depth, to decide.\n"
        f"{box_hint}\n\n"
        "Respond with valid JSON ONLY (no markdown):\n"
        '{\n'
        '  "sport_detected": "<sport name in your own words>",\n'
        '  "summary": "<2-3 sentence overall coach take on the session>",\n'
        '  "overall_skill_level": "<Beginner|Intermediate|Advanced|Pro>",\n'
        '  "events": [\n'
        '    {\n'
        '      "timestamp_sec": <float, when the action happens>,\n'
        '      "shot_label": "<natural 2-5 word description — see rules above>",\n'
        '      "shot_category": "<snake_case canonical name>",\n'
        '      "intent": "<attacking|defensive|neutral>",\n'
        '      "outcome": "<winner|forced_error|continued_rally|lost_point|unknown>",\n'
        '      "quality_observation": "<one specific sentence — what made '
        'this rep good or bad>",\n'
        '      "description": "<one sentence what happened>",\n'
        '      "strengths": ["<bullet>", "..."],\n'
        '      "weaknesses": ["<bullet>", "..."],\n'
        '      "tip": "<one actionable improvement>",\n'
        '      "confidence": <0-1 — how sure are you about this event>,\n'
        '      "skill_level": "<Beginner|Intermediate|Advanced|Pro>"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        "Keep events array under 20 entries. The shot_label is free text "
        "tailored to the sport you detected — do not constrain yourself "
        "to a fixed vocabulary.\n\n"
        "IMPORTANT: ALSO include `shot_type` AND `event_type` set to the "
        "same value as `shot_category` in every event object (for backward "
        "compatibility with existing UI code)."
    )
    user_msg = (
        "Watch the whole video and analyze the athlete's performance "
        "using the schema above. Be honest — if the video is unclear or "
        "the action is hard to read, say so in 'summary' and emit fewer "
        "events rather than guessing."
    )
    return sys_prompt, user_msg


def _belongs_to_target(e: dict, target_player_description: str | None) -> bool:
    """Belt-and-suspenders filter — even with strict prompt rules, Gemini
    sometimes ignores them and emits opponent shots in 2-player clips. We
    look at reasoning + description and require it to mention the target
    person OR a self-referential cue ('the player', 'they', 'their racket').
    If we have a target description with concrete tokens (colors, names,
    positions), require at least one of those tokens to appear too.

    Returns True when the event is plausibly the target's. Permissive on
    purpose — only the most-obvious "opponent attacks target" wording gets
    filtered out.
    """
    if not target_player_description:
        return True  # No filter active
    text = " ".join([
        str(e.get("reasoning", "")),
        str(e.get("description", "")),
    ]).lower()
    if not text:
        return True  # nothing to filter against, give benefit of the doubt
    # Drop obvious opponent-shot phrasings
    opponent_markers = [
        "opponent hits", "opponent's smash", "opponent smash",
        "opponent kills", "opponent's kill", "from the opponent",
        "the other player hits", "other player smashes", "other player kills",
        "received by the target", "hit at the target", "shot at the player",
        "incoming smash", "incoming attack",
    ]
    for marker in opponent_markers:
        if marker in text:
            return False
    # Look for affirmative target tokens (color/name/position words from the
    # target description). E.g. "the player in the blue shirt" → ["blue", "shirt"].
    tokens = [t for t in target_player_description.lower().split() if len(t) >= 4]
    # Filter out generic English filler words that don't disambiguate
    skip = {"the", "player", "person", "with", "who", "wearing", "shirt",
            "shorts", "near", "court", "side", "center", "foreground",
            "background", "closest", "camera", "court", "patterned"}
    tokens = [t for t in tokens if t not in skip]
    if not tokens:
        return True  # description was all generic — no concrete anchor
    # If we have anchor tokens (colors, names), require at least one to
    # appear in the reasoning/description.
    return any(tok in text for tok in tokens)


def _normalize_universal_event(e: dict, sport_vocab: list, target_player_description: str | None = None) -> dict | None:
    """Normalize one raw event dict from Gemini into the stable output
    schema. Returns None if `e` isn't usable OR if the strict target-player
    filter says this event belongs to someone else. Extracted so the
    streaming variant can normalize per-event as objects stream in."""
    if not isinstance(e, dict):
        return None
    # Strict filter — drop events the target person clearly didn't perform.
    # Permissive when no target description: returns True.
    if not _belongs_to_target(e, target_player_description):
        return None
    try:
        ts = float(e.get("timestamp_sec") or 0.0)
    except Exception:
        ts = 0.0
    conf = max(0.0, min(1.0, float(e.get("confidence", 0.7) or 0.7)))
    skill = str(e.get("skill_level", "Intermediate")).strip().title()
    if skill not in ("Beginner", "Intermediate", "Advanced", "Pro"):
        skill = "Intermediate"
    # PHILOSOPHY: preserve Gemini's free-text labels. We compute a
    # vocab-mapped `_lookup_category` for pro-ref / drill lookups but
    # never use it as the display field — the rich Gemini label
    # ("Cross-court drive — winner") is far more useful to the user
    # than the canonical 8-shot bucket name.
    category_raw = e.get("shot_category") or e.get("event_type") or "event"
    s = str(category_raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    s = "".join(ch for ch in s if ch.isalnum() or ch == "_").strip("_") or "unknown"

    lookup_category = None
    if sport_vocab:
        if s in sport_vocab:
            lookup_category = s
        else:
            candidates = [v for v in sport_vocab if v in s or s in v]
            if candidates:
                lookup_category = max(candidates, key=len)

    # shot_category passed through as-is (Gemini's snake_case). We do
    # NOT collapse it to the vocab — that was the source of the
    # drive→clear misclassification users were seeing.
    shot_category = s
    shot_label = str(e.get("shot_label") or e.get("event_type") or shot_category.replace("_", " ").title())[:120].strip()
    intent = str(e.get("intent", "neutral")).strip().lower()
    if intent not in ("attacking", "defensive", "neutral"):
        intent = "neutral"
    outcome = str(e.get("outcome", "unknown")).strip().lower()
    if outcome not in ("winner", "forced_error", "continued_rally", "lost_point", "unknown"):
        outcome = "unknown"
    quality_observation = str(e.get("quality_observation", ""))[:400].strip()
    return {
        "timestamp_sec": ts,
        "shot_type": shot_category,
        "event_type": shot_category,
        "shot_label": shot_label,
        "shot_category": shot_category,
        # Internal lookup key. UI must NOT display this — it's only for
        # routing to pro-ref / drill lookups that need the controlled
        # vocab. None when Gemini's category genuinely doesn't fit.
        "_lookup_category": lookup_category,
        "intent": intent,
        "outcome": outcome,
        "quality_observation": quality_observation,
        "description": str(e.get("description", ""))[:400],
        "strengths": [str(x)[:200] for x in (e.get("strengths") or [])[:5]],
        "weaknesses": [str(x)[:200] for x in (e.get("weaknesses") or [])[:5]],
        "tip": str(e.get("tip", ""))[:300],
        "confidence": conf,
        "skill_level": skill,
    }


def _get_sport_vocab(detected_sport: str) -> list:
    try:
        from .prompts import SHOT_VOCAB  # type: ignore
    except Exception:
        SHOT_VOCAB = {}  # type: ignore
    key = (detected_sport or "").strip().lower()
    return SHOT_VOCAB.get(key, []) if isinstance(SHOT_VOCAB, dict) else []


def analyze_video_universal(
    video_bytes: bytes, mime_type: str,
    target_player_description: str | None = None,
    backend: str = "auto",
    tier: str = "standard",
) -> dict:
    """Sport-agnostic whole-video analysis. Sends the video to Gemini with
    an OPEN-ENDED prompt (no hardcoded shot vocab, no per-sport metric
    schema) so it works for swimming, snooker, golf, weightlifting, etc.
    in addition to the racquet sports we have curated content for.

    Output schema is intentionally generic — `events[]` instead of
    `shots[]` and each event has free-form `event_type` text. The
    frontend renders these as a simple timestamped event list.

    Returns: {sport_detected, events: [{timestamp_sec, event_type,
                description, technique_observations, strength, weakness,
                tip, skill_level}], summary, _meta}.
    """
    sys_prompt, user_msg = _build_universal_prompt(target_player_description)

    # Premium tier swaps Gemini 2.5 Flash → Gemini 2.5 Pro for sharper
    # detection on noisy / fast-action / multi-shot clips. Costs ~5× more
    # in tokens but typically catches every shot vs Flash sometimes missing.
    model_override = "gemini-2.5-pro" if (tier or "").lower() == "premium" else None
    backend_obj = pick_backend(backend, model=model_override) if model_override else pick_backend(backend)
    try:
        import google.generativeai as genai  # type: ignore
        model = backend_obj._get() if hasattr(backend_obj, "_get") else None
        if model is None:
            import os as _os
            genai.configure(api_key=_os.environ["GEMINI_API_KEY"])
            model = genai.GenerativeModel(backend_obj.model_name)
        parts = _build_video_parts(sys_prompt, user_msg, video_bytes, mime_type or "video/mp4", fps=3.0)
        resp = model.generate_content(
            parts,
            generation_config={"temperature": 0.0, "response_mime_type": "application/json"},
        )
        raw = resp.text
    except Exception as exc:
        return {
            "sport_detected": "unknown", "summary": "",
            "events": [], "_meta": {"error": str(exc)[:300], "backend": backend_obj.name},
        }

    data = _parse_json_safe(raw)
    events_out = []
    # Optionally pull the sport's curated vocab to validate shot_category
    # when the detected sport is one we have pre-defined. If not, accept
    # any free-form lowercase snake_case category.
    try:
        from .prompts import SHOT_VOCAB  # type: ignore
    except Exception:
        SHOT_VOCAB = {}  # type: ignore
    detected_sport_raw = str(data.get("sport_detected", "")).strip().lower()
    sport_vocab = SHOT_VOCAB.get(detected_sport_raw, []) if isinstance(SHOT_VOCAB, dict) else []

    def _normalize_category(raw_val: str) -> str:
        s = str(raw_val or "").strip().lower().replace("-", "_").replace(" ", "_")
        # Strip anything that's not a-z/0-9/_ so we always get clean snake_case
        s = "".join(ch for ch in s if ch.isalnum() or ch == "_").strip("_")
        if not s:
            return "unknown"
        # If we have a curated vocab for this sport and the model strayed,
        # try a soft match before giving up.
        if sport_vocab and s not in sport_vocab:
            match = next((v for v in sport_vocab if v in s or s in v), None)
            if match:
                return match
        return s

    for e in (data.get("events") or [])[:20]:
        if not isinstance(e, dict):
            continue
        # Strict target-player filter — drop events the target person clearly
        # didn't perform. Belt-and-suspenders for when Gemini ignores the
        # prompt-level rules in 2-player rally clips.
        if not _belongs_to_target(e, target_player_description):
            continue
        try:
            ts = float(e.get("timestamp_sec") or 0.0)
        except Exception:
            ts = 0.0
        conf = max(0.0, min(1.0, float(e.get("confidence", 0.7) or 0.7)))
        skill = str(e.get("skill_level", "Intermediate")).strip().title()
        if skill not in ("Beginner", "Intermediate", "Advanced", "Pro"):
            skill = "Intermediate"
        # New richer fields. Fall back to legacy `event_type` when the
        # model returned the old shape so we never drop an event.
        category_raw = e.get("shot_category") or e.get("event_type") or "event"
        shot_category = _normalize_category(category_raw)
        shot_label = str(e.get("shot_label") or e.get("event_type") or shot_category)[:120].strip()
        intent = str(e.get("intent", "neutral")).strip().lower()
        if intent not in ("attacking", "defensive", "neutral"):
            intent = "neutral"
        outcome = str(e.get("outcome", "unknown")).strip().lower()
        if outcome not in ("winner", "forced_error", "continued_rally", "lost_point", "unknown"):
            outcome = "unknown"
        quality_observation = str(e.get("quality_observation", ""))[:400].strip()
        events_out.append({
            "timestamp_sec": ts,
            # Backward compat: shot_type / event_type mirror shot_category so
            # legacy UI code reading either field keeps working.
            "shot_type": shot_category,
            "event_type": shot_category,
            "shot_label": shot_label,
            "shot_category": shot_category,
            "intent": intent,
            "outcome": outcome,
            "quality_observation": quality_observation,
            "description": str(e.get("description", ""))[:400],
            "strengths": [str(x)[:200] for x in (e.get("strengths") or [])[:5]],
            "weaknesses": [str(x)[:200] for x in (e.get("weaknesses") or [])[:5]],
            "tip": str(e.get("tip", ""))[:300],
            "confidence": conf,
            "skill_level": skill,
        })
    return {
        "sport_detected": str(data.get("sport_detected", "unknown"))[:60],
        "summary": str(data.get("summary", ""))[:600],
        "overall_skill_level": str(data.get("overall_skill_level", "Intermediate")).strip().title(),
        "events": events_out,
        "_meta": {
            "backend": backend_obj.name, "model": backend_obj.model_name,
            "video_bytes": len(video_bytes), "mime_type": mime_type,
            "mode": "universal", "tier": tier,
        },
    }


# ──────────────────────────────────────────────────────────────────────
# Streaming variant — yields events as Gemini produces them
# ──────────────────────────────────────────────────────────────────────
def _find_complete_event_objects(buf: str, start_pos: int) -> tuple[list[str], int]:
    """Walk the buffer starting at `start_pos` looking for top-level JSON
    object literals (one event). Returns (list_of_json_strings,
    new_start_pos). Quote/escape-aware so commas/braces inside strings
    don't confuse the depth counter. The new_start_pos is the index right
    after the last complete object we extracted — callers should pass it
    back as start_pos on the next invocation."""
    out: list[str] = []
    i = start_pos
    n = len(buf)
    while i < n:
        # Find next opening brace
        while i < n and buf[i] != "{":
            # Bail out of the array entirely
            if buf[i] == "]":
                return out, i
            i += 1
        if i >= n:
            break
        # Scan for matching close
        depth = 0
        in_str = False
        esc = False
        j = i
        complete = False
        while j < n:
            ch = buf[j]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        complete = True
                        j += 1
                        break
            j += 1
        if not complete:
            # Partial — stop here; caller buffers more
            break
        out.append(buf[i:j])
        i = j
    return out, i


def stream_analyze_video_universal(
    video_bytes: bytes, mime_type: str,
    target_player_description: str | None = None,
    backend: str = "auto",
    tier: str = "standard",
):
    """Generator wrapper around analyze_video_universal that yields
    progress dicts as the Gemini response streams in.

    Yields dicts of shape:
      {"kind": "shot", "event": <normalized event>, "index": N}
      {"kind": "complete", "result": <full payload identical to
                                       analyze_video_universal's return>}
      {"kind": "error", "msg": "..."}

    The caller wraps each yielded dict in an SSE frame. The terminal
    `complete` event carries the same shape the non-streaming endpoint
    returns so downstream consumers get the exact same data.
    """
    sys_prompt, user_msg = _build_universal_prompt(target_player_description)
    model_override = "gemini-2.5-pro" if (tier or "").lower() == "premium" else None
    backend_obj = (
        pick_backend(backend, model=model_override) if model_override
        else pick_backend(backend)
    )

    try:
        import google.generativeai as genai  # type: ignore
        model = backend_obj._get() if hasattr(backend_obj, "_get") else None
        if model is None:
            import os as _os
            genai.configure(api_key=_os.environ["GEMINI_API_KEY"])
            model = genai.GenerativeModel(backend_obj.model_name)
        parts = _build_video_parts(
            sys_prompt, user_msg, video_bytes,
            mime_type or "video/mp4", fps=3.0,
        )
        try:
            stream_iter = model.generate_content(
                parts,
                stream=True,
                generation_config={
                    "temperature": 0.0,
                    "response_mime_type": "application/json",
                },
            )
        except Exception as exc:
            yield {"kind": "error", "msg": f"gemini_call_failed: {str(exc)[:200]}"}
            return
    except Exception as exc:
        yield {"kind": "error", "msg": f"gemini_init_failed: {str(exc)[:200]}"}
        return

    raw_buffer = ""
    events_scan_pos = -1   # index of the "[" after "events"
    next_obj_pos = 0       # where to resume scanning for objects
    emitted_indices: list[int] = []
    sport_vocab: list = []

    try:
        for chunk in stream_iter:
            try:
                txt = chunk.text or ""
            except Exception:
                # Some chunks have no .text (safety / function-call only); skip
                txt = ""
            if not txt:
                continue
            raw_buffer += txt

            # Lazy-resolve sport vocab once we've seen sport_detected
            if not sport_vocab and '"sport_detected"' in raw_buffer:
                # Quick regex-free pluck: find the value after "sport_detected"
                key = '"sport_detected"'
                k = raw_buffer.find(key)
                if k >= 0:
                    seg = raw_buffer[k + len(key):k + len(key) + 80]
                    # find first quoted string
                    q1 = seg.find('"')
                    q2 = seg.find('"', q1 + 1) if q1 >= 0 else -1
                    if q1 >= 0 and q2 > q1:
                        sport_vocab = _get_sport_vocab(seg[q1 + 1:q2])

            # Locate the events array opener once
            if events_scan_pos < 0:
                key = '"events"'
                k = raw_buffer.find(key)
                if k >= 0:
                    bracket = raw_buffer.find("[", k)
                    if bracket >= 0:
                        events_scan_pos = bracket + 1
                        next_obj_pos = events_scan_pos
            if events_scan_pos < 0:
                continue

            # Try to pull out any newly-complete event objects
            objs, new_pos = _find_complete_event_objects(raw_buffer, next_obj_pos)
            next_obj_pos = new_pos
            for raw_obj in objs:
                try:
                    parsed = json.loads(raw_obj)
                except Exception:
                    continue
                norm = _normalize_universal_event(parsed, sport_vocab, target_player_description)
                if not norm:
                    continue
                emitted_indices.append(len(emitted_indices))
                yield {
                    "kind": "shot",
                    "event": norm,
                    "index": len(emitted_indices) - 1,
                }
    except Exception as exc:
        # Streaming aborted partway through. Fall through to final parse —
        # raw_buffer may still hold useful partial content.
        yield {"kind": "error", "msg": f"stream_aborted: {str(exc)[:200]}"}

    # Final pass: parse the whole accumulated buffer for the authoritative
    # answer (covers fields outside events[] like summary, sport_detected,
    # and catches any events we missed via incremental scan).
    data = _parse_json_safe(raw_buffer)
    if not sport_vocab:
        sport_vocab = _get_sport_vocab(str(data.get("sport_detected", "")))
    events_out: list = []
    for e in (data.get("events") or [])[:20]:
        norm = _normalize_universal_event(e, sport_vocab, target_player_description)
        if norm:
            events_out.append(norm)

    # If incremental scanning missed everything, we still emit the full
    # batch here so the client renders something.
    if not emitted_indices and events_out:
        for idx, ev in enumerate(events_out):
            yield {"kind": "shot", "event": ev, "index": idx}

    payload = {
        "sport_detected": str(data.get("sport_detected", "unknown"))[:60],
        "summary": str(data.get("summary", ""))[:600],
        "overall_skill_level": str(data.get("overall_skill_level", "Intermediate")).strip().title(),
        "events": events_out,
        "_meta": {
            "backend": backend_obj.name,
            "model": backend_obj.model_name,
            "video_bytes": len(video_bytes),
            "mime_type": mime_type,
            "mode": "universal_stream",
            "tier": tier,
            "stream_incremental_emits": len(emitted_indices),
        },
    }
    yield {"kind": "complete", "result": payload}


def describe_players_in_video(
    video_bytes: bytes, mime_type: str,
    backend: str = "auto",
) -> dict:
    """List the people in a video with descriptions the user can choose
    between. The user picks one, then we pass that description as the
    target_player_description into subsequent analysis calls so Gemini
    anchors on the right person instead of guessing from a bbox.

    Returns: {players: [{id, description, court_position, clothing,
                          is_likely_athlete}], _meta}.
    """
    sys_prompt = (
        "List every visible PERSON in this video. For each, give a short, "
        "specific description the viewer can use to identify them.\n\n"
        "CRITICAL — RESPECTFUL DESCRIPTORS ONLY:\n"
        "Use ONLY these attribute categories to describe each person:\n"
        "  - clothing colors and styles (top + bottom)\n"
        "  - court / playing area position (near / far + left / right / center)\n"
        "  - jersey or shirt number when visible\n"
        "  - equipment they're holding (racket type, paddle, bat)\n"
        "  - relative height / build using neutral terms ONLY if helpful "
        "(e.g. 'taller player', 'shorter player') and only when needed to "
        "disambiguate two players in similar clothing\n\n"
        "DO NOT use skin tone, race, hair color/style, facial features, "
        "age, gender, ethnicity, or any descriptors based on physical "
        "appearance beyond the neutral height/build above. These are "
        "irrelevant to identifying who to analyze in a sports clip, and "
        "users have flagged them as inappropriate.\n\n"
        "Order players by visual prominence (most likely the main subject "
        "first). Skip referees, ball boys, audience, coaches on the "
        "sideline — only list ATHLETES who are actively playing.\n\n"
        "For each player also estimate a BOUNDING BOX in normalized "
        "[0..1] coordinates anchored on a representative frame near the "
        "middle of the video. The box should tightly enclose the full "
        "body (head-to-feet).\n\n"
        "Respond with valid JSON ONLY:\n"
        '{\n'
        '  "players": [\n'
        '    {\n'
        '      "id": "p1",\n'
        '      "description": "<concise, equipment + clothing + position '
        'only — e.g. \'Player in red shirt and black shorts, near court, '
        'right side\' or \'Player with number 7 jersey, far court, left\'>",\n'
        '      "clothing": "<top + bottom colors>",\n'
        '      "court_position": "<near/far + left/center/right>",\n'
        '      "bbox": {"x": <0-1>, "y": <0-1>, "width": <0-1>, "height": <0-1>},\n'
        '      "is_likely_athlete": <true|false>\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        "Limit to 6 players max. If only one person is visible, return one entry. "
        "bbox is optional — omit only if you genuinely can't estimate it."
    )
    user_msg = "Identify and describe the athletes in this video."

    backend_obj = pick_backend(backend)
    try:
        import google.generativeai as genai  # type: ignore
        model = backend_obj._get() if hasattr(backend_obj, "_get") else None
        if model is None:
            import os as _os
            genai.configure(api_key=_os.environ["GEMINI_API_KEY"])
            model = genai.GenerativeModel(backend_obj.model_name)
        # Lower 1.5 fps is plenty for describing static visual features
        # (clothing/position) — players don't change appearance shot-to-shot.
        parts = _build_video_parts(sys_prompt, user_msg, video_bytes, mime_type or "video/mp4", fps=1.5)
        resp = model.generate_content(
            parts,
            generation_config={"temperature": 0.0, "response_mime_type": "application/json"},
        )
        raw = resp.text
    except Exception as exc:
        return {"players": [], "_meta": {"error": str(exc)[:300], "backend": backend_obj.name}}

    # Safety net: even with the prompt rules above, Gemini occasionally
    # slips skin-tone / racial / hair / age / gender descriptors into the
    # `description`. Strip those phrases server-side before they reach the
    # UI so users never see them, regardless of the model's behavior.
    import re as _re
    # Phrases to DELETE entirely (with their connecting glue words like
    # "with" or "and"). Order matters — match longer phrases first.
    _SCRUB_RX = [
        # "Player with dark skin and long dark hair" → "Player"
        _re.compile(r"\b(?:player|person|man|woman|athlete)\s+with\s+"
                    r"(?:[a-z\-\s]+?\s+(?:skin|skinned|complexion|complexioned|hair|hair\s+style)|"
                    r"[a-z\-]+\s+beard(?:ed)?)\s*"
                    r"(?:,?\s*and\s+[a-z\-\s]+?(?:skin|hair|beard|complexion))*", _re.IGNORECASE),
        # ", with dark skin," / ", with long brown hair," embedded mid-sentence
        _re.compile(r"[,\s]+with\s+(?:[a-z\-\s]+?(?:skin|skinned|complexion|complexioned|hair)"
                    r"(?:[,\s]+and\s+[a-z\-\s]+?(?:skin|hair|complexion|beard))*)", _re.IGNORECASE),
        # "African / Asian / Indian / etc player|man|woman" — race + person
        _re.compile(r"\b(?:African|Caucasian|Asian|South[-\s]?Asian|Indian|Hispanic|Latin[oa]?|"
                    r"European|Middle[-\s]?Eastern|Black|White)\s+(?=(?:player|man|woman|person|boy|girl|male|female|athlete)\b)", _re.IGNORECASE),
        # Standalone skin/hair/beard phrases ("dark-skinned", "long hair", etc.)
        _re.compile(r"\b(?:dark|light|fair|tan|tanned|pale|olive|brown|black|white)[-\s]?(?:skin|skinned|complexion|complexioned|toned)\b[,]?", _re.IGNORECASE),
        _re.compile(r"\b(?:long|short|curly|straight|wavy|dark|light|blonde|brown|red|grey|gray|black)\s+(?:dark\s+)?hair\b[,]?", _re.IGNORECASE),
        _re.compile(r"\b(?:bald|balding|shaved\s+head|bearded|beard|moustache|mustache|clean[-\s]?shaven|stubble|goatee)\b[,]?", _re.IGNORECASE),
        # Age / gender adjectives in front of "player|man|...":
        _re.compile(r"\b(?:young|old|elder|teen|teenage|adult|middle[-\s]?aged|senior)\s+(?=(?:player|man|woman|person|boy|girl|male|female|athlete)\b)", _re.IGNORECASE),
        _re.compile(r"\b(?:male|female)\s+(?=(?:player|athlete|person)\b)", _re.IGNORECASE),
    ]

    def _scrub(s: str) -> str:
        if not s:
            return s
        out_s = s
        for rx in _SCRUB_RX:
            out_s = rx.sub("Player" if "player|person|man|woman|athlete" in rx.pattern else "", out_s)
        # Tidy up the connective tissue left behind.
        out_s = _re.sub(r"\s*,\s*,+", ",", out_s)          # ", ," → ","
        out_s = _re.sub(r"\s+and\s+,", ",", out_s)         # "and ," → ","
        out_s = _re.sub(r",\s+and\s+(wearing|in|with)\b", r" \1", out_s)  # ", and wearing" → " wearing"
        out_s = _re.sub(r"^\s*,\s*", "", out_s)            # leading comma
        out_s = _re.sub(r"\s+,", ",", out_s)               # space-before-comma
        out_s = _re.sub(r"\s{2,}", " ", out_s).strip(" ,.")
        # If we destroyed too much, fall back rather than ship a stub.
        if len(out_s) < 8 or out_s.lower() in {"player", "player ."}:
            return "Player on court"
        return out_s

    data = _parse_json_safe(raw)
    out = []
    for i, p in enumerate((data.get("players") or [])[:6]):
        if not isinstance(p, dict):
            continue
        entry = {
            "id": str(p.get("id") or f"p{i+1}"),
            "description": _scrub(str(p.get("description", "")))[:200],
            "clothing": _scrub(str(p.get("clothing", "")))[:80],
            "court_position": str(p.get("court_position", ""))[:80],
            "is_likely_athlete": bool(p.get("is_likely_athlete", True)),
        }
        # Pass bbox through (sanitized) so the frontend can crop a
        # per-player thumbnail from the video.
        bb = p.get("bbox") or p.get("bounding_box")
        if isinstance(bb, dict):
            try:
                entry["bbox"] = {
                    "x": max(0.0, min(1.0, float(bb.get("x", 0)))),
                    "y": max(0.0, min(1.0, float(bb.get("y", 0)))),
                    "width": max(0.05, min(1.0, float(bb.get("width", 0)))),
                    "height": max(0.05, min(1.0, float(bb.get("height", 0)))),
                }
            except (TypeError, ValueError):
                pass
        out.append(entry)
    return {
        "players": out,
        "_meta": {"backend": backend_obj.name, "model": backend_obj.model_name},
    }


def detect_sport(frames_jpeg: list[bytes], backend: str = "auto") -> dict:
    """Quick VLM call: which of our 5 sports is this video?

    Send 1-2 keyframes, get back the sport name + confidence. ~$0.0001 per call.
    Returns: {sport, confidence, _meta}.
    """
    if not frames_jpeg:
        return {"sport": "badminton", "confidence": 0.0, "_meta": {"error": "no frames"}}

    sys_prompt = (
        "Identify which racquet/bat sport is shown in these frames. "
        f"Choose exactly one of: {', '.join(SUPPORTED_SPORTS)}. "
        "Look for the playing surface, equipment (racket size, ball type, court markings), "
        "and player stance.\n\n"
        "Respond with valid JSON only:\n"
        '{"sport": "<one of the listed sports>", "confidence": <float 0-1>, "reasoning": "<one sentence>"}'
    )
    usr_msg = "Identify the sport in these keyframes."

    backend_obj = pick_backend(backend)
    try:
        raw = backend_obj.call(sys_prompt, usr_msg, frames_jpeg[:2])
    except Exception as exc:
        return {"sport": "badminton", "confidence": 0.0,
                "_meta": {"error": str(exc)[:200], "backend": backend_obj.name}}

    data = _parse_json_safe(raw)
    sport = str(data.get("sport", "badminton")).lower().strip().replace(" ", "_")
    if sport not in SUPPORTED_SPORTS:
        # Fuzzy match (e.g. "ping_pong" -> "table_tennis")
        synonyms = {"ping_pong": "table_tennis", "padel": "tennis"}
        sport = synonyms.get(sport, "badminton")
    return {
        "sport": sport,
        "confidence": max(0.0, min(1.0, float(data.get("confidence", 0.5) or 0.5))),
        "reasoning": str(data.get("reasoning", ""))[:200],
        "_meta": {"backend": backend_obj.name, "model": backend_obj.model_name},
    }


def personalized_coaching(
    analysis: dict, equipment_catalog: list[dict] | None = None,
    drill_catalog: list[dict] | None = None,
    backend: str = "auto",
) -> dict:
    """Generate VLM-tailored drills + equipment + weekly plan based on the
    player's actual weaknesses + per-shot reasoning. Replaces template-based
    suggestions with specific, evidence-grounded coaching.

    equipment_catalog: optional list of {id, name, category, level, price_inr,
                                          good_for: [tags]} so the VLM picks
                                          real SKUs instead of inventing them.
    drill_catalog: optional list of {id, title, channel, url, level,
                                       skill_areas, description} from the
                                       per-sport research videos. When
                                       present the VLM MUST pick drill IDs
                                       from this list (RAG-style grounding)
                                       so users always get real, curated
                                       video links — never hallucinated ones.

    Returns: {priority_drills, equipment_recommendations, seven_day_plan,
              key_focus_areas, motivational_message, _meta}.
    Each priority_drill carries: name, why, duration_min, instructions,
    equipment_needed, AND video_url/channel/level when sourced from
    drill_catalog.
    """
    summary = _summarize_analysis(analysis)
    sport = summary.get("sport") or "badminton"
    skill = summary.get("skill_level") or "Intermediate"

    catalog_block = ""
    if equipment_catalog:
        # Send a trimmed catalog so the VLM picks from real SKUs we sell.
        slim = [
            {k: v for k, v in item.items()
             if k in ("id", "name", "category", "level", "price_inr", "good_for")}
            for item in equipment_catalog[:60]
        ]
        catalog_block += (
            "\n\nAVAILABLE EQUIPMENT (recommend by id from this list — "
            "do NOT invent products):\n" + json.dumps(slim, indent=2)
        )

    # Build a slim drill catalog the VLM can index. Map id -> full record so
    # we can hydrate the picks back into URLs/channels post-call.
    drill_lookup: dict[str, dict] = {}
    if drill_catalog:
        slim_drills = []
        for d in drill_catalog[:80]:
            if not isinstance(d, dict) or not d.get("id"):
                continue
            drill_lookup[d["id"]] = d
            slim_drills.append({
                "id": d["id"],
                "title": d.get("title") or d.get("name") or "",
                "level": d.get("level", ""),
                "skill_areas": d.get("skill_areas", []),
                "description": (d.get("description") or "")[:240],
            })
        if slim_drills:
            catalog_block += (
                "\n\nAVAILABLE DRILL VIDEOS (pick drill_video_ids from this "
                "curated list — these are the ONLY drills you may recommend; "
                "do NOT invent generic drill names):\n"
                + json.dumps(slim_drills, indent=2)
            )

    drill_schema_field = (
        '      "drill_video_id": "<id from AVAILABLE DRILL VIDEOS list — REQUIRED>",\n'
        '      "addresses_weakness": "<exact weakness phrase this drill fixes, quoted from weaknesses_observed above>",\n'
        if drill_lookup else
        '      "addresses_weakness": "<exact weakness phrase this drill fixes, quoted from weaknesses_observed above>",\n'
    )
    drill_rule = (
        "DRILL SELECTION RULES (read carefully — most failures here):\n"
        "1. First, list the player's TOP weaknesses in `weaknesses_observed` "
        "(verbatim from the analysis — e.g. 'inconsistent contact point', "
        "'limited shoulder rotation'). Do NOT invent weaknesses.\n"
        "2. For EACH priority_drill, you MUST set `addresses_weakness` to "
        "ONE of those exact weakness phrases. If you can't tie a drill to "
        "a specific listed weakness, DROP it — fewer high-relevance drills "
        "beats more loosely-matched ones.\n"
        + ("3. Pick drill_video_id ONLY from AVAILABLE DRILL VIDEOS — "
           "match by skill_areas + description text. If none of the "
           "catalog entries is a good match for a given weakness, OMIT "
           "that drill rather than picking a marginal one.\n"
           if drill_lookup else "")
        + "4. Return 2-4 drills max. Quality > quantity. An empty priority_drills "
        "list is acceptable if nothing in the catalog matches the weaknesses.\n\n"
    )

    # Build the list of distinct shot types the player produced — used to
    # ask Gemini for a one-sentence biomechanical compare-to-pro per shot
    # type. We piggy-back on this VLM call (no extra Gemini round-trip,
    # latency unchanged) instead of firing a second call.
    shot_types_seen: list[str] = []
    _seen_types: set[str] = set()
    for _s in (summary.get("shots") or []):
        t = (_s.get("type") or "").strip()
        if t and t not in _seen_types:
            _seen_types.add(t)
            shot_types_seen.append(t)
    shot_types_seen = shot_types_seen[:6]  # cap so prompt doesn't bloat

    pro_compare_rule = (
        "\nPRO COMPARISON RULES:\n"
        "1. For EACH distinct shot type the player produced (listed below), "
        "write ONE concise sentence comparing this player's mechanics to a "
        "pro at the same biomechanical moment (contact / release / impact). "
        "Cite a SPECIFIC measurable difference: an angle, a body part "
        "position, a timing element, a sequencing flaw. Example: "
        "\"Hip rotation at contact ~25° vs Ma Long ~60° — that delta is "
        "where most of his extra topspin comes from.\"\n"
        "2. If you cannot make a specific, evidence-grounded statement for "
        "a given shot type (because the per-shot reasoning is too sparse), "
        "OMIT that shot type. Do NOT write generic filler like \"the pro is "
        "smoother\" or \"work on form.\"\n"
        f"3. Shot types to consider: {shot_types_seen}\n\n"
        if shot_types_seen else ""
    )

    pro_compare_schema = (
        '  "pro_comparisons": [\n'
        '    {\n'
        '      "shot_type": "<one of the shot types listed above>",\n'
        '      "comparison": "<one sentence with a SPECIFIC biomechanical '
        'difference vs a pro, citing an angle / body part / timing>"\n'
        '    }\n'
        '  ],\n'
        if shot_types_seen else ""
    )

    sys_prompt = (
        f"You are an expert {sport} coach building a personalized practice plan. "
        f"Use ONLY the player's actual weaknesses and per-shot reasoning below. "
        f"Never recommend generic advice — every recommendation must trace "
        f"back to a specific observed weakness.\n\n"
        f"{drill_rule}"
        f"{pro_compare_rule}"
        f"Respond with valid JSON ONLY:\n"
        '{\n'
        '  "weaknesses_observed": ["<verbatim weakness from analysis>", "<...>"],\n'
        '  "key_focus_areas": ["<short tag>", "<short tag>", "<short tag>"],\n'
        + pro_compare_schema +
        '  "priority_drills": [\n'
        '    {\n'
        '      "name": "<drill name>",\n'
        + drill_schema_field +
        '      "why": "<one sentence: why THIS drill fixes THAT weakness>",\n'
        '      "duration_min": <int 5-30>,\n'
        '      "instructions": "<2-3 sentences how to do it>",\n'
        '      "equipment_needed": ["<simple item>", "..."]\n'
        '    }\n'
        '  ],\n'
        '  "equipment_recommendations": [\n'
        '    {\n'
        '      "item_id": "<id from catalog OR null if catalog empty>",\n'
        '      "name": "<product or category>",\n'
        '      "addresses_weakness": "<exact phrase from weaknesses_observed>",\n'
        '      "why": "<why this helps THAT specific weakness>"\n'
        '    }\n'
        '  ],\n'
        '  "seven_day_plan": [\n'
        '    {\n'
        '      "day": 1,\n'
        '      "label": "<one-word type: Focus / Drill / Rest / Review>",\n'
        '      "focus": "<the exact weakness this day targets, or '
        '\'Active recovery\' for rest days>",\n'
        '      "title": "<short title for the day, e.g. \'Wrist snap '
        'drill block\'>",\n'
        '      "description": "<2-sentence what + why>",\n'
        '      "drill_video_ids": ["<id(s) from AVAILABLE DRILL VIDEOS '
        'if this is a drill day, else []>"],\n'
        '      "minutes": <int 0-60, 0 for rest>\n'
        '    }\n'
        '  ],\n'
        '  "motivational_message": "<2 sentences in coach voice>"\n'
        '}\n\n'
        "Return 2-4 drills, 0-3 equipment recs, exactly 7 days in the plan. "
        "If the player's weaknesses can't be addressed by the catalog, return "
        "an EMPTY priority_drills list — do NOT fabricate."
        f"{catalog_block}"
    )
    user_msg = (
        f"PLAYER ANALYSIS ({skill} {sport} player):\n"
        f"{json.dumps(summary, indent=2, default=str)}"
    )

    backend_obj = pick_backend(backend)
    raw = backend_obj.call(sys_prompt, user_msg, [])
    data = _parse_json_safe(raw)

    # Hydrate drill picks with real video URLs/channels from the catalog.
    # Drop drills whose addresses_weakness is missing, too generic, or
    # doesn't actually match one of the weaknesses_observed.
    weaknesses_observed = [str(x).strip() for x in (data.get("weaknesses_observed") or []) if str(x).strip()][:6]
    weaknesses_normalized = [w.lower() for w in weaknesses_observed]

    # Generic / lazy phrases that look like a real match but mean nothing.
    # Note: "consistency" and "training" are kept OFF this list since they
    # CAN be real weaknesses ("inconsistent contact point", "match-day
    # training fatigue"). Token-overlap still rejects bare "consistency".
    GENERIC_BAD = {
        "technique", "better technique", "form", "better form",
        "improvement", "general improvement", "skill", "skills",
        "everything", "all", "general", "various", "overall",
        "practice", "play", "game",
    }

    def _valid_weakness_link(addr: str) -> bool:
        addr = addr.strip()
        if len(addr) < 8:
            return False
        if addr.lower() in GENERIC_BAD:
            return False
        # Must overlap with at least one observed weakness phrase.
        # Substring match in either direction OR shared 4+-char token.
        # Was 5 chars → made some valid drills (e.g. "wrist snap" matching
        # "limited wrist") drop unnecessarily. 4 char tokens are still
        # specific enough to reject generic words.
        addr_l = addr.lower()
        for w in weaknesses_normalized:
            if addr_l in w or w in addr_l:
                return True
            tokens_a = {t for t in addr_l.split() if len(t) >= 4 and t not in GENERIC_BAD}
            tokens_w = {t for t in w.split() if len(t) >= 4 and t not in GENERIC_BAD}
            if tokens_a & tokens_w:
                return True
        return False

    raw_drills = [d for d in (data.get("priority_drills") or []) if isinstance(d, dict)][:6]
    hydrated_drills = []
    drills_dropped_reasons = []
    for d in raw_drills:
        addr = str(d.get("addresses_weakness") or "").strip()
        if not _valid_weakness_link(addr):
            drills_dropped_reasons.append(f"weak-link:{addr[:40]!r}")
            continue
        dv_id = d.get("drill_video_id") or d.get("video_id")
        if dv_id and dv_id in drill_lookup:
            ref = drill_lookup[dv_id]
            d["video_id"] = ref["id"]
            d["video_url"] = ref.get("url")
            d["video_channel"] = ref.get("channel")
            d["video_level"] = ref.get("level")
            if not d.get("name"):
                d["name"] = ref.get("title") or ref.get("name")
        elif drill_lookup:
            # Catalog was provided but Gemini didn't pick from it → drop,
            # don't ship a generic drill without a real curated video.
            drills_dropped_reasons.append(f"no-catalog-id:{(d.get('name') or '')[:40]!r}")
            continue
        hydrated_drills.append(d)
    hydrated_drills = hydrated_drills[:4]  # Cap at 4 for quality-over-quantity

    # Same gate for equipment: must reference a real observed weakness.
    raw_equip = [e for e in (data.get("equipment_recommendations") or []) if isinstance(e, dict)][:5]
    filtered_equip = [
        e for e in raw_equip
        if _valid_weakness_link(str(e.get("addresses_weakness") or ""))
    ][:3]

    # Hydrate per-day drill IDs into {id,name,url,channel} entries so the
    # frontend renders concrete clickable drills inside each day card.
    raw_plan = [d for d in (data.get("seven_day_plan") or []) if isinstance(d, dict)][:7]
    hydrated_plan = []
    for day in raw_plan:
        day_drills = []
        for vid_id in (day.get("drill_video_ids") or []):
            if vid_id and vid_id in drill_lookup:
                ref = drill_lookup[vid_id]
                day_drills.append({
                    "id": ref["id"],
                    "name": ref.get("title") or ref.get("name") or vid_id,
                    "url": ref.get("url"),
                    "channel": ref.get("channel"),
                })
        # Keep the original `drills` list (names only) as a fallback.
        if day.get("drills") and not day_drills:
            day_drills = [{"name": str(n)} for n in (day.get("drills") or []) if n]
        day["drills_detailed"] = day_drills
        hydrated_plan.append(day)

    # Pro comparisons: clean + reject fluff. We pre-built `shot_types_seen`
    # so we can drop entries Gemini hallucinates outside the actual shot
    # set, and reject sentences that smell like generic praise instead of
    # a specific biomechanical observation.
    raw_compares = [c for c in (data.get("pro_comparisons") or []) if isinstance(c, dict)]
    valid_types = set((t or "").lower() for t in shot_types_seen)
    GENERIC_COMPARE_BAD = (
        "the pro is better", "pros are smoother", "needs work",
        "work on your form", "keep practicing", "needs improvement",
        "pro is more consistent", "improve your technique",
    )

    def _looks_specific(text: str) -> bool:
        """Heuristic: a real biomechanical comparison contains either a
        numeric/angle reference OR names a specific body part / phase.
        Otherwise it's filler and we drop it."""
        if not text or len(text) < 30:
            return False
        tl = text.lower()
        if any(g in tl for g in GENERIC_COMPARE_BAD):
            return False
        body_words = (
            "hip", "shoulder", "elbow", "wrist", "knee", "ankle", "foot",
            "stance", "rotation", "contact", "follow-through", "back-swing",
            "backswing", "extension", "racket face", "racquet face", "paddle",
            "bat", "trophy", "loading", "drop", "swing path", "angle",
            "degree", "°", "tempo", "timing", "weight transfer",
        )
        has_body_term = any(w in tl for w in body_words)
        has_number = any(ch.isdigit() for ch in text)
        return has_body_term or has_number

    pro_comparisons: list[dict] = []
    for c in raw_compares:
        st = str(c.get("shot_type") or "").strip().lower()
        cmp_text = str(c.get("comparison") or "").strip()
        if not st or not cmp_text:
            continue
        # If we have a known shot-type allowlist, enforce it; otherwise
        # accept any (small catalogs may not surface a complete list).
        if valid_types and st not in valid_types:
            # Allow substring fuzzy match — e.g. "smash" against "forehand_smash"
            if not any(st in vt or vt in st for vt in valid_types):
                continue
        if not _looks_specific(cmp_text):
            continue
        # Trim to a tight 1-2 sentence ceiling for the UI card.
        if len(cmp_text) > 240:
            cmp_text = cmp_text[:240].rsplit(".", 1)[0] + "."
        pro_comparisons.append({"shot_type": st, "comparison": cmp_text})

    return {
        "weaknesses_observed": weaknesses_observed,
        "key_focus_areas": [str(x) for x in (data.get("key_focus_areas") or [])][:5],
        "priority_drills": hydrated_drills,
        "equipment_recommendations": filtered_equip,
        "seven_day_plan": hydrated_plan,
        "motivational_message": str(data.get("motivational_message", "")),
        # Per-shot-type biomechanical comparisons used by the per-shot
        # "VS PRO" panel on the analysis result. Filtered to only specific,
        # evidence-grounded sentences — generic fluff is dropped (see
        # _looks_specific above). Empty list when Gemini can't produce
        # anything specific.
        "pro_comparisons": pro_comparisons,
        "_meta": {
            "backend": backend_obj.name,
            "model": backend_obj.model_name,
            "drill_catalog_size": len(drill_lookup),
            "drills_picked": len(hydrated_drills),
            "drills_dropped": len(raw_drills) - len(hydrated_drills),
            "drills_drop_reasons": drills_dropped_reasons[:8],
            "pro_comparisons_picked": len(pro_comparisons),
            "pro_comparisons_raw": len(raw_compares),
        },
    }
