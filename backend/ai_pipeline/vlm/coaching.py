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
        f"Use these shot types ONLY:\n{defs}\n\n"
        f"Do NOT invent shot types. If a moment isn't clearly a shot (player "
        f"is walking, recovering, or just preparing), DON'T list it. Only "
        f"include moments where the player makes contact with the "
        f"ball/shuttle. Order shots by timestamp.\n\n"
        f"CRITICAL — DO NOT DEFAULT TO 'SERVE' FOR RALLY-STARTING SHOTS:\n"
        f"A serve requires ALL of these: (1) ball/shuttle starts stationary "
        f"in the non-racket hand, (2) a visible toss or drop by that hand "
        f"just before contact, (3) NO incoming ball from the opponent at "
        f"contact, (4) racket starts low / by the side, not in a ready or "
        f"blocking position. If ANY of those is missing, the shot is a "
        f"drive / clear / smash / drop / loop / push — NEVER a serve. "
        f"Practice clips against a wall, robot, or feeder coach are never "
        f"serves. When uncertain, classify as a drive and set confidence "
        f"< 0.7 — never invent a serve.\n\n"
        f"CRITICAL — ONE SWING = ONE SHOT:\n"
        f"A single physical shot has a windup, contact, and follow-through "
        f"that span 0.5-2 seconds. Report each physical swing AS ONE SHOT, "
        f"using the timestamp of the CONTACT moment. Do NOT emit multiple "
        f"entries for the same swing (e.g. one for windup, one for contact, "
        f"one for follow-through). If two consecutive timestamps are within "
        f"~1.5 seconds AND the same shot_type, they are almost certainly the "
        f"same physical shot — merge them into one entry at the contact "
        f"moment. Count carefully: if the player physically swung the racket "
        f"3 times, the array must have 3 entries, not 9.{box_hint}\n\n"
        f"Respond with valid JSON ONLY (no markdown):\n"
        '{\n'
        '  "shots": [\n'
        '    {\n'
        f'      "timestamp_sec": <float, when contact happens>,\n'
        f'      "shot_type": "<one of: {", ".join(vocab)}>",\n'
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
        '}'
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
        shot = str(s.get("shot_type", "unknown")).lower().strip().replace(" ", "_")
        if shot not in vocab and shot != "unknown":
            match = next((v for v in vocab if v in shot or shot in v), None)
            shot = match or "unknown"
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
                if a_shot in vocab:
                    alts.append({
                        "shot": a_shot,
                        "confidence": max(0.0, min(1.0, float(a.get("confidence", 0.0) or 0.0))),
                    })
        try:
            ts = float(s.get("timestamp_sec") or 0.0)
        except Exception:
            ts = 0.0
        shots_out.append({
            "timestamp_sec": ts,
            "shot_type": shot,
            "confidence": conf,
            "reasoning": str(s.get("reasoning", ""))[:500],
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
    box_hint = ""
    if target_player_description:
        box_hint = (
            f"\n\nTARGET PERSON: focus on '{target_player_description}'. "
            f"Only include events performed by that person. Skip events "
            f"by anyone else in the frame."
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
        "CRITICAL — ONE TECHNIQUE = ONE EVENT:\n"
        "A single physical motion (windup/contact/follow-through, or one "
        "full stroke cycle in swimming) is ONE event at the moment of "
        "execution. Do NOT emit multiple entries for phases of the same "
        "motion. If the athlete performed 3 reps/shots/strokes, the "
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
        "user knows it's tentative — do not invent a serve.\n"
        f"{box_hint}\n\n"
        "Respond with valid JSON ONLY (no markdown):\n"
        '{\n'
        '  "sport_detected": "<sport name in your own words>",\n'
        '  "summary": "<2-3 sentence overall coach take on the session>",\n'
        '  "overall_skill_level": "<Beginner|Intermediate|Advanced|Pro>",\n'
        '  "events": [\n'
        '    {\n'
        '      "timestamp_sec": <float, when the action happens>,\n'
        '      "event_type": "<your label e.g. forehand, freestyle stroke, '
        'long pot, deadlift rep, golf swing>",\n'
        '      "description": "<one sentence what happened>",\n'
        '      "strengths": ["<bullet>", "..."],\n'
        '      "weaknesses": ["<bullet>", "..."],\n'
        '      "tip": "<one actionable improvement>",\n'
        '      "confidence": <0-1 — how sure are you about this event>,\n'
        '      "skill_level": "<Beginner|Intermediate|Advanced|Pro>"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        "Keep events array under 20 entries. Use whichever event_type "
        "wording naturally fits the sport — no fixed vocabulary."
    )
    user_msg = (
        "Watch the whole video and analyze the athlete's performance "
        "using the schema above. Be honest — if the video is unclear or "
        "the action is hard to read, say so in 'summary' and emit fewer "
        "events rather than guessing."
    )

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
    for e in (data.get("events") or [])[:20]:
        if not isinstance(e, dict):
            continue
        try:
            ts = float(e.get("timestamp_sec") or 0.0)
        except Exception:
            ts = 0.0
        conf = max(0.0, min(1.0, float(e.get("confidence", 0.7) or 0.7)))
        skill = str(e.get("skill_level", "Intermediate")).strip().title()
        if skill not in ("Beginner", "Intermediate", "Advanced", "Pro"):
            skill = "Intermediate"
        events_out.append({
            "timestamp_sec": ts,
            "event_type": str(e.get("event_type", "event"))[:80],
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

    sys_prompt = (
        f"You are an expert {sport} coach building a personalized practice plan. "
        f"Use ONLY the player's actual weaknesses and per-shot reasoning below. "
        f"Never recommend generic advice — every recommendation must trace "
        f"back to a specific observed weakness.\n\n"
        f"{drill_rule}"
        f"Respond with valid JSON ONLY:\n"
        '{\n'
        '  "weaknesses_observed": ["<verbatim weakness from analysis>", "<...>"],\n'
        '  "key_focus_areas": ["<short tag>", "<short tag>", "<short tag>"],\n'
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

    return {
        "weaknesses_observed": weaknesses_observed,
        "key_focus_areas": [str(x) for x in (data.get("key_focus_areas") or [])][:5],
        "priority_drills": hydrated_drills,
        "equipment_recommendations": filtered_equip,
        "seven_day_plan": hydrated_plan,
        "motivational_message": str(data.get("motivational_message", "")),
        "_meta": {
            "backend": backend_obj.name,
            "model": backend_obj.model_name,
            "drill_catalog_size": len(drill_lookup),
            "drills_picked": len(hydrated_drills),
            "drills_dropped": len(raw_drills) - len(hydrated_drills),
            "drills_drop_reasons": drills_dropped_reasons[:8],
        },
    }
