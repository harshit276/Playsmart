
# ── Feedback nudge: ask AFTER they have lived with the result ──────────
# Nobody was leaving feedback. The in-page prompt only reaches someone who is
# still on the tab, and it fires while they are mid-read. A nudge sent a little
# later catches them once they have actually formed an opinion.
#
# There is no scheduler here on purpose: Vercel Hobby allows a single daily
# cron, so a true "T+10min" job is not available. Instead we derive the queue
# from data we already store — a finished analysis with no feedback row is a
# nudge that is due — and run the sweep from the daily cron plus opportunistically
# off ordinary traffic. With the current volume that lands within minutes.
FEEDBACK_NUDGE_DELAY_MIN = int(os.environ.get("FEEDBACK_NUDGE_DELAY_MIN", "10"))
FEEDBACK_NUDGE_MAX_AGE_H = int(os.environ.get("FEEDBACK_NUDGE_MAX_AGE_H", "48"))
FEEDBACK_REWARD_TOKENS = int(os.environ.get("FEEDBACK_REWARD_TOKENS", "200"))
# Early-adopter offer: only the first N users to leave feedback get paid for it.
FEEDBACK_REWARD_MAX_USERS = int(os.environ.get("FEEDBACK_REWARD_MAX_USERS", "100"))

_last_nudge_sweep = {"at": 0.0}


def _feedback_email_html(name: str, sport: str, reward: int) -> tuple:
    who = (name or "there").split(" ")[0][:40]
    sport_txt = (sport or "").replace("_", " ").title() or "your session"
    bonus_html = ""
    bonus_text = ""
    if reward:
        bonus_html = (
            '<p style="margin:18px 0;padding:14px 16px;background:#1a2e05;'
            'border:1px solid #4d7c0f;border-radius:10px;color:#d9f99d;">'
            '<strong>{} free tokens</strong> land in your account as soon as you '
            'send it — that is another full analysis, on us. Honest criticism is '
            'worth more to us than praise, and it pays the same.</p>'.format(reward))
        bonus_text = ("\n{} free tokens are added as soon as you send it — "
                      "another full analysis. Honest criticism pays the same as "
                      "praise.\n".format(reward))
    html = (
        '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;'
        'max-width:520px;margin:0 auto;padding:24px;color:#e4e4e7;'
        'background:#09090b;">'
        '<h2 style="color:#a3e635;margin:0 0 12px;">Was your {} analysis any good?</h2>'
        '<p style="line-height:1.6;">Hi {},</p>'
        '<p style="line-height:1.6;">You ran an analysis on Formanti a little '
        'while ago. We are early, and we would rather hear what was wrong with '
        'it than have you quietly not come back.</p>'
        '<p style="line-height:1.6;">Two questions, thirty seconds:<br>'
        '<strong>Did it find the right shots? Was the coaching actually useful?</strong></p>'
        '{}'
        '<p style="margin:24px 0;"><a href="https://www.formanti.com/analyze?feedback=1" '
        'style="background:#a3e635;color:#000;padding:12px 22px;border-radius:999px;'
        'text-decoration:none;font-weight:700;">Give feedback</a></p>'
        '<p style="color:#71717a;font-size:12px;line-height:1.5;">You are getting '
        'this because you analysed a clip. We only send it once per analysis.</p>'
        '</div>'
    ).format(sport_txt, who, bonus_html)
    text = (
        "Was your {} analysis any good?\n\nHi {},\n\nYou ran an analysis on "
        "Formanti a little while ago. We are early, and we would rather hear "
        "what was wrong with it than have you quietly not come back.\n\n"
        "Did it find the right shots? Was the coaching useful?\n{}\n"
        "Give feedback: https://www.formanti.com/analyze?feedback=1\n"
    ).format(sport_txt, who, bonus_text)
    return html, text


async def _feedback_reward_available() -> bool:
    """True while the early-adopter reward is still on offer."""
    if FEEDBACK_REWARD_TOKENS <= 0:
        return False
    try:
        n = await asyncio.wait_for(db.token_transactions.count_documents(
            {"kind": "feedback_reward"}), timeout=3.0)
        return n < FEEDBACK_REWARD_MAX_USERS
    except Exception:
        return False   # can't confirm → don't promise what we may not pay


async def _process_feedback_nudges(limit: int = 20) -> dict:
    """Email + push anyone whose analysis is old enough to have an opinion
    about, and who has not already told us what they think."""
    now = datetime.now(timezone.utc)
    due_before = (now - timedelta(minutes=FEEDBACK_NUDGE_DELAY_MIN)).isoformat()
    too_old = (now - timedelta(hours=FEEDBACK_NUDGE_MAX_AGE_H)).isoformat()
    sent = skipped = 0
    try:
        rows = await asyncio.wait_for(db.video_analyses.find(
            {"date": {"$lt": due_before, "$gt": too_old},
             "user_id": {"$nin": [None, "", "guest"]},
             "feedback_nudged_at": {"$exists": False}},
            {"_id": 0, "id": 1, "user_id": 1, "sport": 1}
        ).to_list(length=limit), timeout=8.0)
    except Exception as exc:
        logger.warning("feedback nudge: query failed: %s", str(exc)[:160])
        return {"sent": 0, "skipped": 0, "error": "query_failed"}

    reward_on = await _feedback_reward_available()
    for row in rows or []:
        aid, uid = row.get("id"), row.get("user_id")
        # Mark FIRST. A crash mid-send must not turn into repeat nudges — an
        # unsent nudge is a missed signal, a repeated one is spam.
        try:
            await asyncio.wait_for(db.video_analyses.update_one(
                {"id": aid}, {"$set": {"feedback_nudged_at": now.isoformat()}}),
                timeout=4.0)
        except Exception:
            continue
        try:
            already = await asyncio.wait_for(db.analysis_feedback.find_one(
                {"analysis_id": aid}, {"_id": 0, "id": 1}), timeout=3.0)
            if already:
                skipped += 1
                continue
            user = await asyncio.wait_for(
                db.users.find_one({"id": uid}, {"_id": 0, "email": 1, "name": 1}),
                timeout=3.0)
        except Exception:
            continue
        if not user:
            skipped += 1
            continue
        reward = FEEDBACK_REWARD_TOKENS if reward_on else 0
        try:
            # _notify_job_done already fans out to every device this user has
            # registered; it only needs user_id in the job dict.
            await _notify_job_done({"user_id": uid}, {
                "title": "How was your analysis?",
                "body": ("Tell us in 30 seconds — {} free tokens for early "
                         "feedback.".format(reward) if reward
                        else "Tell us in 30 seconds what worked and what didn't."),
                "url": "/analyze?feedback=1",
            })
        except Exception:
            pass
        email = (user.get("email") or "").strip()
        if email:
            try:
                html, text = _feedback_email_html(user.get("name"), row.get("sport"), reward)
                await _send_user_email(
                    email, "Was your Formanti analysis any good?", html, text,
                    from_addr=MAIL_FROM_INFO)
            except Exception:
                pass
        sent += 1
    return {"sent": sent, "skipped": skipped, "considered": len(rows or [])}


async def _maybe_sweep_feedback_nudges():
    """Opportunistic sweep, throttled to once every few minutes.

    Fire-and-forget from ordinary traffic. Hobby's one-cron-a-day limit means
    this is what actually makes the nudge land ~10 minutes after an analysis
    rather than the next morning.
    """
    now = _time.time()
    if now - _last_nudge_sweep["at"] < 300:      # at most once per 5 min
        return
    _last_nudge_sweep["at"] = now
    try:
        await asyncio.wait_for(_process_feedback_nudges(limit=10), timeout=25.0)
    except Exception:
        pass


@api_router.get("/cron/feedback-nudges")
async def cron_feedback_nudges(request: Request):
    """Guaranteed backstop for the sweep above (wired to the daily cron)."""
    return await _process_feedback_nudges(limit=50)

