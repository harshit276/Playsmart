
# ── One-off feedback campaign to existing users ────────────────────────
# Asking our own users what they thought of a service they used is defensible
# without prior marketing consent, but only if it is genuinely one-off and they
# can stop it. One of our users is in Spain, so GDPR applies: every campaign
# mail carries a working one-click unsubscribe, we honour it before sending,
# and no user is ever mailed twice by the same campaign.
#
# Sending is ADMIN-TRIGGERED and defaults to a dry run. Bulk mail is not
# something to fire automatically: a mistake here reaches real inboxes, cannot
# be recalled, and burns the sending domain's reputation.
CAMPAIGN_ID = "feedback_200_2026_08"


def _unsub_token(user_id: str) -> str:
    """Signed so an unsubscribe link cannot be forged or enumerated."""
    import hmac as _hmac, hashlib as _hl
    return _hmac.new(JWT_SECRET.encode(),
                     ("unsub:" + str(user_id)).encode(), _hl.sha256).hexdigest()[:32]


@api_router.get("/unsubscribe")
async def unsubscribe(u: str = "", t: str = ""):
    """One-click opt-out. GET on purpose — it has to work from a mail client."""
    import hmac as _hmac
    ok = bool(u) and bool(t) and _hmac.compare_digest(_unsub_token(u), t)
    if ok:
        try:
            await asyncio.wait_for(db.users.update_one(
                {"id": u}, {"$set": {"email_opt_out": True,
                                     "email_opt_out_at": datetime.now(timezone.utc).isoformat()}}),
                timeout=5.0)
        except Exception:
            ok = False
    body = (
        "<div style='font-family:system-ui,sans-serif;background:#09090b;color:#e4e4e7;"
        "padding:48px 24px;text-align:center;min-height:100vh'>"
        + ("<h2 style='color:#a3e635'>You're unsubscribed</h2>"
           "<p>We won't email you about feedback again. Account and payment "
           "emails still work as normal.</p>"
           if ok else
           "<h2 style='color:#f87171'>That link didn't work</h2>"
           "<p>Reply to the email and we'll remove you by hand.</p>")
        + "<p style='margin-top:28px'><a href='https://www.formanti.com' "
          "style='color:#a3e635'>formanti.com</a></p></div>"
    )
    return FastAPIResponse(content=body, media_type="text/html")


def _campaign_email_html(name: str, reward: int, user_id: str) -> tuple:
    who = (name or "there").split(" ")[0][:40]
    unsub = "https://www.formanti.com/api/unsubscribe?u={}&t={}".format(user_id, _unsub_token(user_id))
    html = (
        "<div style=\"font-family:system-ui,-apple-system,Segoe UI,sans-serif;"
        "max-width:520px;margin:0 auto;padding:24px;color:#e4e4e7;background:#09090b;\">"
        "<h2 style=\"color:#a3e635;margin:0 0 12px;\">Can you tell us what was wrong with it?</h2>"
        "<p style=\"line-height:1.6;\">Hi {},</p>"
        "<p style=\"line-height:1.6;\">You tried Formanti recently — thank you. We're a "
        "very small team and you're one of our first users, so your honest read "
        "matters more than any amount of guessing on our side.</p>"
        "<p style=\"line-height:1.6;\"><strong>Did the analysis find the right shots? "
        "Was the coaching actually useful, or generic?</strong> Thirty seconds is plenty.</p>"
        "<p style=\"margin:18px 0;padding:14px 16px;background:#1a2e05;border:1px solid "
        "#4d7c0f;border-radius:10px;color:#d9f99d;\"><strong>{} free tokens</strong> are "
        "added to your account the moment you send it — another full analysis, on us. "
        "We pay the same for criticism as for praise; criticism is worth more to us.</p>"
        "<p style=\"margin:24px 0;\"><a href=\"https://www.formanti.com/analyze?feedback=1\" "
        "style=\"background:#a3e635;color:#000;padding:12px 22px;border-radius:999px;"
        "text-decoration:none;font-weight:700;\">Tell us in 30 seconds</a></p>"
        "<p style=\"color:#71717a;font-size:12px;line-height:1.5;border-top:1px solid #27272a;"
        "padding-top:14px;\">You're getting this once because you have a Formanti account. "
        "<a href=\"{}\" style=\"color:#a1a1aa;\">Unsubscribe</a></p>"
        "</div>"
    ).format(who, reward, unsub)
    text = (
        "Can you tell us what was wrong with it?\n\nHi {},\n\nYou tried Formanti "
        "recently. We're a very small team and you're one of our first users, so "
        "your honest read matters more than our guessing.\n\n"
        "Did the analysis find the right shots? Was the coaching useful, or generic?\n\n"
        "{} free tokens are added the moment you send it — another full analysis. "
        "We pay the same for criticism as for praise.\n\n"
        "https://www.formanti.com/analyze?feedback=1\n\n"
        "Unsubscribe: {}\n"
    ).format(who, reward, unsub)
    return html, text


class FeedbackCampaignRequest(BaseModel):
    dry_run: bool = True     # never send unless explicitly told to
    limit: int = 50
    only_with_analysis: bool = True   # people who actually used it


@api_router.post("/admin/feedback-campaign")
async def admin_feedback_campaign(
    req: FeedbackCampaignRequest, x_admin_key: str = Header(None, alias="X-Admin-Key"),
):
    """Ask existing users for feedback, once, with an opt-out.

    Defaults to a DRY RUN that reports exactly who would be mailed. Bulk email
    cannot be unsent, so the recipient list gets reviewed before anything goes.
    """
    _require_admin(x_admin_key)
    limit = max(1, min(200, int(req.limit or 50)))
    try:
        users = await asyncio.wait_for(db.users.find(
            {"email": {"$nin": [None, ""]},
             "email_opt_out": {"$ne": True},
             "campaigns_sent": {"$ne": CAMPAIGN_ID}},
            {"_id": 0, "id": 1, "email": 1, "name": 1}
        ).to_list(length=limit * 3), timeout=10.0)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="user query failed: {}".format(str(exc)[:120]))

    targets = []
    for u in users or []:
        if len(targets) >= limit:
            break
        if req.only_with_analysis:
            try:
                n = await asyncio.wait_for(db.video_analyses.count_documents(
                    {"user_id": u["id"]}), timeout=4.0)
            except Exception:
                continue
            if not n:
                continue
        targets.append(u)

    def _mask(e):
        e = e or ""
        head, _, dom = e.partition("@")
        return (head[:2] + "***@" + dom) if dom else "***"

    if req.dry_run:
        return {"dry_run": True, "campaign": CAMPAIGN_ID,
                "would_send": len(targets),
                "recipients": [_mask(u.get("email")) for u in targets]}

    sent, failed = 0, 0
    for u in targets:
        # Mark BEFORE sending: a duplicate marketing email is far worse than a
        # missed one, and a crash mid-loop must not re-mail the whole list.
        try:
            await asyncio.wait_for(db.users.update_one(
                {"id": u["id"]}, {"$addToSet": {"campaigns_sent": CAMPAIGN_ID}}),
                timeout=4.0)
        except Exception:
            continue
        try:
            html, text = _campaign_email_html(
                u.get("name"), FEEDBACK_REWARD_TOKENS, u["id"])
            ok = await _send_user_email(
                u["email"], "Can you tell us what was wrong with it?",
                html, text, from_addr=MAIL_FROM_INFO)
            sent += 1 if ok else 0
            failed += 0 if ok else 1
        except Exception:
            failed += 1
    return {"dry_run": False, "campaign": CAMPAIGN_ID, "sent": sent, "failed": failed}

