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
                f"\n\nFOCUS player: the {sport} player initially positioned at the "
                f"{corner} area of the frame (normalized ~{cx:.2f}, {cy:.2f}). "
                f"Track them through the video and only classify shots THEY hit. "
                f"Ignore shots by other players."
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
        f"ball/shuttle. Order shots by timestamp.{box_hint}\n\n"
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
    # Pass video as an inline_data part. The Gemini backend.call() accepts
    # arbitrary parts via frames_jpeg — but we need to bypass that and send
    # a video MIME type. Direct SDK use:
    try:
        import google.generativeai as genai  # type: ignore
        model = backend_obj._get() if hasattr(backend_obj, "_get") else None
        if model is None:
            # Fall back: build a model on the fly
            import os as _os
            genai.configure(api_key=_os.environ["GEMINI_API_KEY"])
            model = genai.GenerativeModel(backend_obj.model_name)
        parts: list = [{"text": sys_prompt}, {"text": user_msg},
                       {"mime_type": mime_type or "video/mp4", "data": video_bytes}]
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
    backend: str = "auto",
) -> dict:
    """Generate VLM-tailored drills + equipment + weekly plan based on the
    player's actual weaknesses + per-shot reasoning. Replaces template-based
    suggestions with specific, evidence-grounded coaching.

    equipment_catalog: optional list of {id, name, category, level, price_inr,
                                          good_for: [tags]} so the VLM can recommend
                                          actual SKUs instead of inventing them.
    Returns: {priority_drills, equipment_recommendations, seven_day_plan,
              key_focus_areas, motivational_message, _meta}.
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
        catalog_block = (
            "\n\nAVAILABLE EQUIPMENT (recommend by id from this list — "
            "do NOT invent products):\n" + json.dumps(slim, indent=2)
        )

    sys_prompt = (
        f"You are an expert {sport} coach building a personalized practice plan. "
        f"Use ONLY the player's actual weaknesses and per-shot reasoning below. "
        f"Be specific — name drills the player can do today, not generic advice. "
        f"Prioritize drills that directly address the named weaknesses.\n\n"
        f"Respond with valid JSON ONLY:\n"
        '{\n'
        '  "key_focus_areas": ["<short tag>", "<short tag>", "<short tag>"],\n'
        '  "priority_drills": [\n'
        '    {\n'
        '      "name": "<drill name>",\n'
        '      "why": "<why this drill, citing the weakness it fixes>",\n'
        '      "duration_min": <int 5-30>,\n'
        '      "instructions": "<2-3 sentences how to do it>",\n'
        '      "equipment_needed": ["<simple item>", "..."]\n'
        '    }\n'
        '  ],\n'
        '  "equipment_recommendations": [\n'
        '    {\n'
        '      "item_id": "<id from catalog OR null if catalog empty>",\n'
        '      "name": "<product or category>",\n'
        '      "why": "<why this helps THIS player\'s weakness>"\n'
        '    }\n'
        '  ],\n'
        '  "seven_day_plan": [\n'
        '    {"day": 1, "focus": "<...>", "drills": ["<drill name>"], "minutes": <int>}\n'
        '  ],\n'
        '  "motivational_message": "<2 sentences in coach voice>"\n'
        '}\n\n'
        "Return 3-5 drills, 1-3 equipment recs, exactly 7 days in the plan."
        f"{catalog_block}"
    )
    user_msg = (
        f"PLAYER ANALYSIS ({skill} {sport} player):\n"
        f"{json.dumps(summary, indent=2, default=str)}"
    )

    backend_obj = pick_backend(backend)
    raw = backend_obj.call(sys_prompt, user_msg, [])
    data = _parse_json_safe(raw)

    return {
        "key_focus_areas": [str(x) for x in (data.get("key_focus_areas") or [])][:5],
        "priority_drills": [d for d in (data.get("priority_drills") or []) if isinstance(d, dict)][:6],
        "equipment_recommendations": [e for e in (data.get("equipment_recommendations") or []) if isinstance(e, dict)][:5],
        "seven_day_plan": [d for d in (data.get("seven_day_plan") or []) if isinstance(d, dict)][:7],
        "motivational_message": str(data.get("motivational_message", "")),
        "_meta": {
            "backend": backend_obj.name,
            "model": backend_obj.model_name,
        },
    }
