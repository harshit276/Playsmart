
class AdminBulkGrantRequest(BaseModel):
    identifiers: str = Field(..., max_length=20000)   # emails/phones/ids, any separator
    amount: int = Field(..., ge=-1_000_000, le=1_000_000)
    reason: str = Field("", max_length=200)
    dry_run: bool = True      # resolve and report first; credit only when told to
    notify: bool = False      # email each recipient that tokens were added


@api_router.post("/admin/grant-tokens-bulk")
async def admin_grant_tokens_bulk(
    req: AdminBulkGrantRequest, x_admin_key: str = Header(None, alias="X-Admin-Key"),
):
    """Credit (or debit) many accounts at once, pasted as a list.

    DRY RUN BY DEFAULT. Handing out tokens in bulk is not reversible in any way
    the recipient will not notice, and a typo'd amount or a list containing the
    wrong address is expensive, so the resolve step runs first and reports who
    was found, who was not, and what each balance would become.

    Like the single grant this is deliberately NOT idempotent — running it twice
    credits twice, because "give that batch another 200" is a legitimate thing
    to want. Every credit writes an admin_grant transaction carrying the reason.
    """
    _require_admin(x_admin_key)
    if req.amount == 0:
        raise HTTPException(status_code=400, detail="Amount cannot be zero")

    import re as _re
    raw = [t.strip() for t in _re.split(r"[\s,;]+", req.identifiers or "") if t.strip()]
    # Preserve order, drop duplicates — pasting a list twice should not double-pay.
    seen, idents = set(), []
    for t in raw:
        k = t.lower()
        if k not in seen:
            seen.add(k)
            idents.append(t)
    if not idents:
        raise HTTPException(status_code=400, detail="No identifiers found")
    if len(idents) > 500:
        raise HTTPException(status_code=400, detail="Too many at once (max 500)")

    resolved, missing = [], []
    for ident in idents:
        lower = ident.lower()
        try:
            user = await asyncio.wait_for(db.users.find_one(
                {"$or": [{"email": lower}, {"phone": ident}, {"id": ident}]},
                {"_id": 0, "id": 1, "email": 1, "phone": 1, "name": 1}), timeout=6.0)
        except Exception:
            user = None
        if not user and "@" in lower:
            # Same fallback as the single grant: accounts credited before their
            # user doc existed are only findable by the derived id.
            try:
                user = await asyncio.wait_for(db.users.find_one(
                    {"id": _user_id_for_email(lower)},
                    {"_id": 0, "id": 1, "email": 1, "name": 1}), timeout=4.0)
            except Exception:
                user = None
        if not user:
            missing.append(ident)
            continue
        before = await _get_balance(user["id"])
        resolved.append({"identifier": ident, "user_id": user["id"],
                         "email": user.get("email"), "name": user.get("name"),
                         "before": before, "after": before + req.amount})

    # A debit that would push someone negative is a mistake, not an intent.
    negatives = [r["identifier"] for r in resolved if r["after"] < 0]

    if req.dry_run:
        return {"dry_run": True, "amount": req.amount,
                "found": len(resolved), "not_found": missing,
                "would_go_negative": negatives,
                "preview": [{"email": r["email"], "before": r["before"],
                             "after": r["after"]} for r in resolved[:100]]}

    if negatives:
        raise HTTPException(
            status_code=400,
            detail="Refusing: {} account(s) would go below zero. Fix the list or "
                   "the amount first.".format(len(negatives)))

    credited, failed = [], []
    for r in resolved:
        try:
            bal = await _credit_tokens(r["user_id"], "admin_grant", req.amount, {
                "reason": (req.reason or "bulk admin grant")[:200],
                "bulk": True, "identifier": r["identifier"]})
            if bal is None:
                failed.append(r["identifier"])
                continue
            credited.append({"email": r["email"], "balance": bal})
            if req.notify and r.get("email"):
                try:
                    html, text = _token_grant_email_html(
                        r.get("name"), req.amount, bal, req.reason)
                    await _send_user_email(
                        r["email"], "We've added tokens to your Formanti account",
                        html, text, from_addr=MAIL_FROM_INFO)
                except Exception:
                    pass   # the tokens are what matter; mail is a courtesy
        except Exception:
            failed.append(r["identifier"])

    try:
        await _notify_admin_now(
            "\U0001fa99 Bulk token grant",
            "{} account(s) x {} tokens\nReason: {}\nFailed: {}".format(
                len(credited), req.amount, req.reason or "-", len(failed)))
    except Exception:
        pass
    return {"dry_run": False, "amount": req.amount, "credited": len(credited),
            "failed": failed, "not_found": missing, "accounts": credited[:100]}

