"""
Practice access: who may use live practice, for how long, and what a pass buys.

The rules (founder, 2026-10-17):
  * Live practice needs an account (the routes in server.py require login).
  * Every account gets ONE free trial of PRACTICE_TRIAL_SECONDS (10 minutes) of camera time, counted
    across sessions, once per account. After that: a pass.
  * A pass is a one-time payment that opens practice for N days. Buying again while one is running adds
    the days on the end (it never overlaps and never loses days).

How trial time is counted: the phone sends a heartbeat every ~15 s while the camera is live, and the
server adds the time since the previous heartbeat (capped, so a sleeping tab does not burn minutes and a
gap cannot be exploited either way). The pose tracking itself runs on the phone, so this is a gate on the
UI, not a vault: a determined person can bypass it by editing the page. It is meant to be honest, fair and
hard to stumble past, not unbreakable.

Money: passes are paid through the existing Razorpay order flow (create-order -> Checkout -> verify, with the
webhook as the backstop). The grant is idempotent per payment id and RE-RUNNABLE: a grant row is written first
with the date it will extend to, then the user's access is raised with $max, then the row is marked applied. If
anything fails between those steps, the retry (the client's verify retry, or Razorpay's webhook retry) lands on
the same row and finishes the job without extending twice.

Auto-renewing subscriptions are NOT built here. They need Razorpay Subscriptions enabled on the account, plan
ids, subscription.* webhooks and an e-mandate flow, and cannot be tested without Razorpay test keys.

The store takes the Mongo database as an argument, so it can be tested against a fake.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from pricing_config import PRACTICE_PLANS, PRACTICE_TRIAL_SECONDS

TRIAL_SECONDS = PRACTICE_TRIAL_SECONDS
BEAT_MAX_GAP_S = 45          # one heartbeat counts for at most this much (they come every ~15 s)
_ISO = "%Y-%m-%dT%H:%M:%SZ"  # fixed width, so $max on these strings is a date comparison
ADMIN_GRANT = "admin_grant"


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime(_ISO)


def parse(s) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.strptime(str(s)[:19] + "Z", _ISO).replace(tzinfo=timezone.utc)
    except Exception:
        return None


def get_plan(key: str) -> Optional[dict]:
    return next((p for p in PRACTICE_PLANS if p["key"] == key), None)


def plans_for(use_usd: bool = False) -> list:
    """The plans as the pricing UI shows them. `price` is in `currency`; per_day is for the 'about Rs X a day' line."""
    out = []
    for p in PRACTICE_PLANS:
        usd = use_usd and p.get("price_usd")
        price = p["price_usd"] if usd else p["price_inr"]
        out.append({
            "key": p["key"], "label": p["label"], "days": p["days"],
            "price": price, "currency": "USD" if usd else "INR",
            "price_inr": p["price_inr"], "price_usd": p.get("price_usd"),
            "per_day": round(price / p["days"], 2), "highlight": bool(p.get("highlight")),
        })
    return out


def compute_access(doc: Optional[dict], now: datetime, *, exempt: Optional[str] = None, paywall: bool = True) -> dict:
    """What this account may do right now.

    allowed: may start / keep practising.
    reason:  "open" (paywall switched off), "staff" (exempt account), "pass", "trial", "trial_over" (never paid),
             "pass_expired" (paid before, ran out).
    """
    doc = doc or {}
    used = max(0, int(doc.get("trial_seconds_used") or 0))
    left = max(0, TRIAL_SECONDS - used)
    until = parse(doc.get("pass_until"))
    out = {
        "allowed": False, "reason": "trial_over",
        "trial_seconds_total": TRIAL_SECONDS, "trial_seconds_left": left,
        "pass_until": iso(until) if until else None, "plan_key": doc.get("pass_plan"),
        "days_left": None,
    }
    if not paywall:
        out.update(allowed=True, reason="open")
    elif exempt:
        out.update(allowed=True, reason="staff")
    elif until and until > now:
        out.update(allowed=True, reason="pass", days_left=max(1, -(-int((until - now).total_seconds()) // 86400)))
    elif left > 0:
        out.update(allowed=True, reason="trial")
    elif until:
        out.update(reason="pass_expired")
    return out


def _is_duplicate(exc: Exception) -> bool:
    return exc.__class__.__name__ == "DuplicateKeyError" or "E11000" in str(exc)


async def _retry(make_call, tries: int = 3, timeout: float = 10.0):
    """A cold serverless container plus a cold Atlas connection is slow, not broken (see payment-credit-bug-2026-08):
    ask a few times before giving up, and let the last error out."""
    last = None
    for i in range(tries):
        try:
            return await asyncio.wait_for(make_call(), timeout=timeout)
        except Exception as exc:  # timeout, connection reset, election
            if _is_duplicate(exc):
                raise
            last = exc
            if i < tries - 1:
                await asyncio.sleep(0.5 * (i + 1))
    raise last


class PracticeStore:
    def __init__(self, db):
        self.access = db.practice_access
        self.sessions = db.practice_sessions
        self.grants = db.practice_grants

    async def doc(self, user_id: str) -> Optional[dict]:
        return await _retry(lambda: self.access.find_one({"user_id": user_id}, {"_id": 0}))

    async def get_access(self, user_id: str, now: datetime, **kw) -> dict:
        return compute_access(await self.doc(user_id), now, **kw)

    async def start_session(self, user_id: str, sport: str, shot: str, now: datetime, **kw):
        """-> (access, session_id or None). None means: not allowed (trial over, no pass)."""
        doc = await self.doc(user_id)
        acc = compute_access(doc, now, **kw)
        if not acc["allowed"]:
            return acc, None
        sid = str(uuid.uuid4())
        await _retry(lambda: self.sessions.insert_one({
            "id": sid, "user_id": user_id, "sport": (sport or "")[:30], "shot": (shot or "")[:40],
            "started_at": iso(now), "last_beat_ts": now.timestamp(), "seconds": 0, "reason": acc["reason"], "ended": False}))
        await _retry(lambda: self.access.update_one(
            {"user_id": user_id},
            {"$set": {"last_session_at": iso(now)}, "$inc": {"sessions": 1}, "$setOnInsert": {"created_at": iso(now), "trial_seconds_used": 0}},
            upsert=True))
        return acc, sid

    async def beat(self, user_id: str, session_id: str, now: datetime, *, final: bool = False, **kw):
        """Count the time since the last heartbeat. -> (access, session_known)."""
        s = await _retry(lambda: self.sessions.find_one({"id": session_id, "user_id": user_id}, {"_id": 0}))
        doc = await self.doc(user_id)
        acc = compute_access(doc, now, **kw)
        if not s:
            return acc, False
        delta = int(max(0.0, min(now.timestamp() - float(s.get("last_beat_ts") or now.timestamp()), BEAT_MAX_GAP_S)))
        # only trial time is counted: with a pass running (or staff / paywall off) the minutes are free
        if delta and acc["reason"] == "trial" and not s.get("ended"):
            await _retry(lambda: self.access.update_one({"user_id": user_id}, {"$inc": {"trial_seconds_used": delta}}))
            doc = await self.doc(user_id)
            acc = compute_access(doc, now, **kw)
        await _retry(lambda: self.sessions.update_one(
            {"id": session_id, "user_id": user_id},
            {"$set": {"last_beat_ts": now.timestamp(), "ended": bool(final) or bool(s.get("ended"))}, "$inc": {"seconds": delta}}))
        return acc, True

    async def grant_pass(self, user_id: str, plan_key: str, payment_id: str, now: datetime, *, order_id: str = "", amount=None, currency: str = "INR", days: Optional[int] = None):
        """Open (or extend) practice for the plan's days, once per payment id. Re-runnable: see the module docstring.
        `plan_key == "admin_grant"` takes its length from `days` (support and comp passes, no payment behind it).
        -> (newly_granted, access)."""
        plan = get_plan(plan_key)
        if not plan and plan_key == ADMIN_GRANT and days and 1 <= int(days) <= 366:
            plan = {"key": ADMIN_GRANT, "days": int(days)}
        if not plan:
            raise ValueError(f"unknown practice plan {plan_key!r}")
        doc = await self.doc(user_id)
        cur = parse((doc or {}).get("pass_until"))
        start = cur if cur and cur > now else now
        new_until = iso(start + timedelta(days=plan["days"]))
        fresh = True
        try:
            await _retry(lambda: self.grants.insert_one({
                "_id": payment_id, "user_id": user_id, "plan_key": plan_key, "days": plan["days"], "order_id": order_id,
                "amount": amount, "currency": currency, "new_until": new_until, "applied": False, "created_at": iso(now)}))
        except Exception as exc:
            if not _is_duplicate(exc):
                raise
            # this payment was already seen: finish what it started, with the date it was given
            fresh = False
            prior = await _retry(lambda: self.grants.find_one({"_id": payment_id}, {}))
            if prior and prior.get("user_id") not in (None, user_id):
                raise ValueError("payment belongs to another account")
            new_until = (prior or {}).get("new_until") or new_until
            if prior and prior.get("applied"):
                return False, await self.get_access(user_id, now)
        await _retry(lambda: self.access.update_one(
            {"user_id": user_id},
            {"$max": {"pass_until": new_until}, "$set": {"pass_plan": plan_key, "last_grant_at": iso(now)},
             "$push": {"passes": {"$each": [{"payment_id": payment_id, "plan_key": plan_key, "days": plan["days"], "until": new_until, "at": iso(now)}], "$slice": -20}},
             "$setOnInsert": {"created_at": iso(now), "trial_seconds_used": 0}},
            upsert=True))
        await _retry(lambda: self.grants.update_one({"_id": payment_id}, {"$set": {"applied": True, "applied_at": iso(now)}}))
        return fresh, await self.get_access(user_id, now)
