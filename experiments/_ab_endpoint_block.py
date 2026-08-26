# ══════════════════════════════════════════════════════════════════════
# TEMPORARY EXPERIMENT — prompt A/B/C. DELETE THIS BLOCK WHEN DONE.
# Added 2026-08-25 to answer, with measurements rather than opinion, whether
# the ~23k-char analysis prompt earns its keep, and what actually drives the
# run-to-run instability users report.
#
# Round 1 result: production prompt found ~86% more shots than a 900-char
# minimal one (3.25 vs 1.75), so the rules DO earn their keep on recall. But
# both under-detect badly, and the LABELS differ between runs even with
# byte-identical input at temperature 0 — the count is stable, the content is
# not. Higher fps did not help recall.
#
# Round 2 (arm C) tests the hypothesis that this is a task-overload problem:
# one call is asked to detect contacts, classify strokes, judge quality,
# attribute players and emit JSON simultaneously. Arm C splits it —
#   pass 1: find contact timestamps only, optimised for recall
#   pass 2: label those timestamps
# so each call has one job.
#
# It lives on the server rather than in a local script only because
# GEMINI_API_KEY is in Vercel's environment and cannot be read back out.
#
# SAFETY: disabled unless PROMPT_AB_KEY is set AND presented as X-Admin-Key,
# so it is inert until deliberately enabled. Model calls per request are
# capped so a stray or repeated call cannot run up a Gemini bill.
# ══════════════════════════════════════════════════════════════════════
PROMPT_AB_KEY = os.environ.get("PROMPT_AB_KEY", "").strip()

_AB_MAX_CALLS = 16   # hard ceiling on MODEL CALLS per request (C costs 2 each)


class PromptABRequest(BaseModel):
    file_name: str                       # Gemini Files API handle
    roster: list                         # [{id, description}, ...]
    target_player_id: str = "p1"
    arms: list | None = None             # subset of ["A", "B", "C"]
    fps_list: list | None = None         # e.g. [4, 8]
    runs: int = 2
    mime_type: str = "video/mp4"
    nonce: bool = False   # prepend a unique token to defeat prefix caching


def _ab_roster_lines(roster: list, target_id: str):
    nl = chr(10)
    target = next((p for p in roster if str(p.get("id")) == target_id), roster[0])
    others = nl.join(
        "  [{}] {}".format(p.get("id"), p.get("description", ""))
        for p in roster if str(p.get("id")) != target_id)
    return target, others, nl


def _ab_minimal_prompt(roster: list, target_id: str):
    """Arm B — schema, who to watch, and 'report only what you can see'."""
    target, others, nl = _ab_roster_lines(roster, target_id)
    schema = (
        '{"sport_detected":"<sport>","events":[{"timestamp_sec":<number>,'
        '"shot_label":"<what a coach would call it>",'
        '"player_id":"<roster id or unsure>","confidence":<0-1>,'
        '"reasoning":"<what you saw at contact>"}]}'
    )
    sysp = (
        "You are analysing a sports video." + nl + nl
        + "TARGET PLAYER: [{}] {}".format(target_id, target.get("description", "")) + nl
        + "OTHER PEOPLE ON COURT:" + nl + others + nl + nl
        + "List every shot the TARGET player hits, in time order. Report only "
          "what you can actually see. If you cannot tell something, say so "
          "rather than guessing: write the shot name without a "
          "forehand/backhand qualifier and lower the confidence." + nl + nl
        + "Tag every shot with player_id: the roster id of whoever hit it, "
          'or "unsure".' + nl + nl
        + "Return JSON only:" + nl + schema
    )
    return sysp, "Analyse this video and return the JSON described."


def _ab_detect_prompt(roster: list, target_id: str):
    """Arm C pass 1 — ONE job: when does a racket meet the shuttle?

    No classification, no quality judgement, no coaching. Recall is the whole
    objective here, because a contact missed in this pass can never be
    recovered later; a false positive can be dropped in pass 2.
    """
    target, others, nl = _ab_roster_lines(roster, target_id)
    schema = (
        '{"contacts":[{"timestamp_sec":<number>,'
        '"player_id":"<roster id or unsure>",'
        '"seen":"<a few words on what you saw at that instant>"}]}'
    )
    sysp = (
        "You are watching a sports video frame by frame. You have exactly ONE "
        "job: find every moment the athlete executes a distinct technique "
        "action." + nl + nl
        + "WHAT COUNTS AS AN ACTION depends on the sport. Identify the sport "
          "first, then look for its unit of action:" + nl
        + "  - racket sports: the racket meets the shuttle/ball" + nl
        + "  - cricket: the bowler releases the ball, or bat meets ball" + nl
        + "  - football: a touch, pass or shot" + nl
        + "  - basketball: a shot, pass or drive to the basket" + nl
        + "  - swimming: each stroke cycle" + nl
        + "  - gym / weightlifting: each repetition" + nl
        + "  - anything else: each discrete repetition of the movement "
          "being practised" + nl + nl
        + "TARGET PLAYER: [{}] {}".format(target_id, target.get("description", "")) + nl
        + "OTHER PEOPLE ON COURT:" + nl + others + nl + nl
        + "Do NOT classify the shots. Do NOT judge technique or quality. Do NOT "
          "write coaching advice. Only locate contacts in time." + nl + nl
        + "Actions come faster than you expect: in a rally, contacts "
          "alternate between players every 0.5-1.5s; in a drill or a bowling "
          "spell, repetitions come every few seconds. Expect MANY. Include a "
          "moment even if you are unsure who performed it — mark that one "
          '"unsure". A later step filters; an action you omit here is lost '
          "for good." + nl + nl
        + "Return JSON only:" + nl + schema
    )
    return sysp, "Find every technique action in this video."


def _ab_label_prompt(roster: list, target_id: str, contacts: list):
    """Arm C pass 2 — label the contacts pass 1 found. Also one job."""
    target, others, nl = _ab_roster_lines(roster, target_id)
    listing = nl.join(
        "  - {:.2f}s ({})".format(float(c.get("timestamp_sec") or 0.0),
                                  str(c.get("seen") or "")[:60])
        for c in contacts)
    schema = (
        '{"events":[{"timestamp_sec":<number>,'
        '"shot_label":"<what a coach would call it>",'
        '"player_id":"<roster id or unsure>","confidence":<0-1>,'
        '"reasoning":"<what you saw at contact>"}]}'
    )
    sysp = (
        "You are labelling shots in a sports video. Another pass already "
        "located the contact moments; your job is to name each one." + nl + nl
        + "TARGET PLAYER: [{}] {}".format(target_id, target.get("description", "")) + nl
        + "OTHER PEOPLE ON COURT:" + nl + others + nl + nl
        + "CONTACTS FOUND:" + nl + listing + nl + nl
        + "For EACH contact above, look at that moment in the video and name "
          "the shot as a coach would (2-5 words), and say who hit it." + nl + nl
        + "FOR RACKET SPORTS ONLY, read the stroke side from where contact "
          "happens relative to the "
          "racket arm: out on the racket-arm side is FOREHAND; reached across "
          "the body with the back of the hand leading is BACKHAND. If the "
          "contact is blurred or hidden, name the shot WITHOUT a side "
          "('Clear', 'Drive', 'Net shot', 'Lift') and set confidence below "
          "0.6. Never guess a side to sound precise." + nl + nl
        + "Keep every contact the target player hit. Drop only those clearly "
          "hit by someone else." + nl + nl
        + "Return JSON only:" + nl + schema
    )
    return sysp, "Label each contact listed above."


def _ab_label_prompt_v2(roster: list, target_id: str, contacts: list):
    """Arm D pass 2 — same job as _ab_label_prompt, restructured so the stroke
    side CANNOT default.

    In arm C every shot came back "Forehand X". The side was living inside a
    free-text label, so the model filled it in as prose rather than deciding
    it. Two structural changes:
      * the side is its own required enum with "unknown" listed FIRST, and the
        label itself is forbidden from containing the words forehand/backhand
      * the model must write what it SAW at contact before naming the side,
        so the conclusion follows evidence instead of leading it
    """
    target, others, nl = _ab_roster_lines(roster, target_id)
    listing = nl.join(
        "  - {:.2f}s ({})".format(float(c.get("timestamp_sec") or 0.0),
                                  str(c.get("seen") or "")[:60])
        for c in contacts)
    schema = (
        '{"events":[{"timestamp_sec":<number>,'
        '"contact_evidence":"<what you SEE at the instant of contact: where the '
        'racket meets the shuttle relative to the body, which way the shoulder '
        'and hand face; or say the contact is not visible>",'
        '"stroke_side":"unknown|forehand|backhand",'
        '"shot_label":"<2-5 words. MUST NOT contain the word forehand or '
        'backhand>","player_id":"<roster id or unsure>","confidence":<0-1>}]}'
    )
    sysp = (
        "You are labelling shots in a sports video. Another pass already "
        "located the contact moments; your job is to name each one." + nl + nl
        + "TARGET PLAYER: [{}] {}".format(target_id, target.get("description", "")) + nl
        + "OTHER PEOPLE ON COURT:" + nl + others + nl + nl
        + "CONTACTS FOUND:" + nl + listing + nl + nl
        + "For EACH contact, work in this order:" + nl
        + "1. contact_evidence — describe ONLY what is visible at that instant. "
          "If the contact is blurred, hidden behind a player, or simply not "
          "captured in a frame, say exactly that." + nl
        + "2. stroke_side — decide from the evidence you just wrote. Contact "
          "out on the racket-arm side of the body is forehand. Contact reached "
          "ACROSS the body, back of the hand leading, shoulder closed, is "
          "backhand. If your evidence line did not establish which side of the "
          'body contact happened on, stroke_side MUST be "unknown".' + nl
        + "3. shot_label — the stroke name only (Clear, Drive, Smash, Net "
          "shot, Lift, Block, Push, Drop). The side is recorded separately, so "
          "the label must NOT contain the word forehand or backhand." + nl + nl
        + '"unknown" is a correct, expected answer and costs you nothing. '
          "Choosing a side you did not actually see is the one error that "
          "makes a player distrust every other line in the analysis." + nl + nl
        + "Keep every contact the target player hit. Drop only those clearly "
          "hit by someone else." + nl + nl
        + "Return JSON only:" + nl + schema
    )
    return sysp, "Label each contact listed above, evidence first."


@api_router.post("/admin/prompt-ab")
async def admin_prompt_ab(
    req: PromptABRequest, x_admin_key: str = Header(None, alias="X-Admin-Key"),
):
    """Run one clip through several prompting strategies and return per-run
    shot counts, so 'do the rules help?' is settled by measurement."""
    if not PROMPT_AB_KEY or x_admin_key != PROMPT_AB_KEY:
        raise HTTPException(status_code=403, detail="forbidden")

    import re as _re
    from collections import Counter as _Counter
    try:
        from ai_pipeline.vlm import files_api_get
        from ai_pipeline.vlm.coaching import (
            _build_universal_prompt, _new_sdk_video_call, _parse_json_safe)
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="engine unavailable: {}".format(exc))

    roster = [p for p in (req.roster or []) if isinstance(p, dict) and p.get("id")]
    # 1 is legitimate: cricket bowling, swimming, gym reps are single-athlete.
    # The contrastive block simply does not engage there.
    if not roster:
        raise HTTPException(status_code=400, detail="roster needs at least 1 player")
    target_id = str(req.target_player_id or "p1")
    arms = [a for a in (req.arms or ["A", "C"]) if a in ("A", "B", "C", "D")] or ["A", "C"]
    fps_list = [float(f) for f in (req.fps_list or [4.0])][:3]
    runs = max(1, min(5, int(req.runs or 2)))
    cost = sum(2 if a in ("C", "D") else 1 for a in arms) * len(fps_list) * runs
    if cost > _AB_MAX_CALLS:
        raise HTTPException(
            status_code=400,
            detail="that is {} model calls; max {}".format(cost, _AB_MAX_CALLS))

    loop = asyncio.get_event_loop()
    file_ref = await loop.run_in_executor(None, lambda: files_api_get(req.file_name))
    model = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
    side_re = _re.compile(r"\b(fore|back)hand\b", _re.I)

    target_desc = next(
        (p.get("description") for p in roster if str(p.get("id")) == target_id), None)

    def _mk_nonce():
        # PREPENDED, not appended: prefix caching keys on the leading
        # tokens, so a trailing nonce would still hit the cache and we
        # would keep measuring cached replies instead of determinism.
        return "[run {}]".format(uuid.uuid4().hex[:10]) + chr(10) if req.nonce else ""

    async def _call(sysp, usr, fps):
        def _go():
            return _new_sdk_video_call(
                model, _mk_nonce() + sysp, usr, None, req.mime_type,
                file_ref=file_ref, fps=fps, tier="standard",
                stream=False, max_tries=1)
        resp = await loop.run_in_executor(None, _go)
        return resp.text

    def _score(evs, prompt_chars, extra=None):
        labels = [str(e.get("shot_label") or "") for e in evs]
        sides = _Counter()
        for e, lab in zip(evs, labels):
            # Arm D reports the side in its own field; A/B/C bake it into
            # the label text, so fall back to reading the prose.
            explicit = str(e.get("stroke_side") or "").strip().lower()
            if explicit in ("forehand", "backhand"):
                sides[explicit[:4]] += 1
            elif explicit == "unknown":
                sides["none"] += 1
            else:
                m = side_re.search(lab)
                sides[m.group(1).lower() if m else "none"] += 1
        ids = _Counter(str(e.get("player_id") or "missing").lower() for e in evs)
        row = {
            "prompt_chars": prompt_chars,
            "n": len(evs),
            "mine": ids.get(target_id, 0),
            "other": sum(v for k, v in ids.items()
                         if k not in (target_id, "unsure", "missing")),
            "unsure": ids.get("unsure", 0) + ids.get("missing", 0),
            "fore": sides["fore"], "back": sides["back"], "no_side": sides["none"],
            "labels": labels[:24],
        }
        if extra:
            row.update(extra)
        return row

    rows = []
    for arm in arms:
        for fps in fps_list:
            for r in range(runs):
                started = _time.time()
                try:
                    if arm in ("C", "D"):
                        d_sys, d_usr = _ab_detect_prompt(roster, target_id)
                        raw1 = await _call(d_sys, d_usr, fps)
                        d1 = _parse_json_safe(raw1) or {}
                        contacts = [c for c in (d1.get("contacts") or [])
                                    if isinstance(c, dict)][:40]
                        if not contacts:
                            rows.append({"arm": arm, "fps": fps, "run": r + 1,
                                         "n": 0, "pass1": 0,
                                         "error": "pass1 found no contacts"})
                            continue
                        l_sys, l_usr = (_ab_label_prompt_v2 if arm == "D"
                                        else _ab_label_prompt)(roster, target_id, contacts)
                        raw2 = await _call(l_sys, l_usr, fps)
                        d2 = _parse_json_safe(raw2) or {}
                        evs = [e for e in (d2.get("events") or []) if isinstance(e, dict)]
                        row = _score(evs, len(d_sys) + len(l_sys),
                                     {"pass1": len(contacts)})
                    else:
                        if arm == "A":
                            sysp, usr = _build_universal_prompt(
                                target_desc, doubles_mode=False,
                                player_roster=roster, target_player_id=target_id)
                        else:
                            sysp, usr = _ab_minimal_prompt(roster, target_id)
                        raw = await _call(sysp, usr, fps)
                        data = _parse_json_safe(raw) or {}
                        evs = [e for e in (data.get("events") or []) if isinstance(e, dict)]
                        row = _score(evs, len(sysp))
                    row.update(arm=arm, fps=fps, run=r + 1,
                               secs=round(_time.time() - started, 1))
                    rows.append(row)
                except Exception as exc:
                    rows.append({
                        "arm": arm, "fps": fps, "run": r + 1,
                        "error": "{}: {}".format(type(exc).__name__, str(exc)[:200]),
                    })
    return {"model": model, "target_player_id": target_id, "rows": rows}


