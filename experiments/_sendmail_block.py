
class AdminSendEmailRequest(BaseModel):
    user_ids: list = Field(default_factory=list)   # explicit picks from the UI
    subject: str = Field(..., max_length=200)
    body: str = Field(..., max_length=20000)       # plain text; newlines kept
    dry_run: bool = True


def _admin_email_html(body: str, user_id: str) -> str:
    """Wrap the admin's plain text in the house template + unsubscribe."""
    import html as _html
    unsub = "https://www.formanti.com/api/unsubscribe?u={}&t={}".format(
        user_id, _unsub_token(user_id))
    paras = "".join(
        '<p style="line-height:1.6;margin:0 0 14px;">{}</p>'.format(
            _html.escape(p).replace(chr(10), "<br>"))
        for p in (body or "").split(chr(10) + chr(10)) if p.strip())
    return (
        '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;'
        'max-width:520px;margin:0 auto;padding:24px;color:#e4e4e7;background:#09090b;">'
        '<p style="margin:0 0 18px;"><span style="color:#a3e635;font-weight:800;'
        'font-size:18px;letter-spacing:-0.02em;">FORMANTI</span></p>'
        + paras +
        '<p style="color:#71717a;font-size:12px;line-height:1.5;border-top:1px solid '
        '#27272a;padding-top:14px;margin-top:22px;">You are receiving this because you '
        'have a Formanti account. <a href="{}" style="color:#a1a1aa;">Unsubscribe</a></p>'
        '</div>'
    ).format(unsub)


@api_router.post("/admin/send-email")
async def admin_send_email(
    req: AdminSendEmailRequest, x_admin_key: str = Header(None, alias="X-Admin-Key"),
):
    """Send a hand-written email to selected users, from the admin panel.

    Dry run by default — mail cannot be recalled, and a wrong recipient list or
    a half-written body is not fixable after the fact. Opt-outs are honoured
    even here: someone who unsubscribed must not receive manual mail either,
    or the unsubscribe link is a lie.
    """
    _require_admin(x_admin_key)
    ids = [str(u) for u in (req.user_ids or []) if str(u).strip()][:200]
    if not ids:
        raise HTTPException(status_code=400, detail="Pick at least one recipient")
    if not req.subject.strip() or not req.body.strip():
        raise HTTPException(status_code=400, detail="Subject and body are required")

    try:
        users = await asyncio.wait_for(db.users.find(
            {"id": {"$in": ids}, "email": {"$nin": [None, ""]}},
            {"_id": 0, "id": 1, "email": 1, "name": 1, "email_opt_out": 1}
        ).to_list(length=200), timeout=10.0)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="DB error: {}".format(str(exc)[:120]))

    send_to = [u for u in users if not u.get("email_opt_out")]
    opted_out = [u.get("email") for u in users if u.get("email_opt_out")]
    no_email = len(ids) - len(users)

    if req.dry_run:
        return {"dry_run": True, "would_send": len(send_to),
                "recipients": [u.get("email") for u in send_to],
                "skipped_opted_out": opted_out, "no_email": no_email}

    sent, failed = 0, []
    for u in send_to:
        try:
            # {name} is the only substitution — keep it obvious and safe.
            body = (req.body or "").replace(
                "{name}", (u.get("name") or "there").split(" ")[0])
            ok = await _send_user_email(
                u["email"], req.subject.strip(),
                _admin_email_html(body, u["id"]), body,
                from_addr=MAIL_FROM_INFO)
            if ok:
                sent += 1
            else:
                failed.append(u.get("email"))
        except Exception:
            failed.append(u.get("email"))
    return {"dry_run": False, "sent": sent, "failed": failed,
            "skipped_opted_out": opted_out}

