"""
Route-level tests for the practice routes and the pass branches of verify / webhook.

server.py cannot be imported in a plain checkout (it needs the whole production environment), so this loads the
REAL source of just the functions under test out of server.py (by name, with ast) and runs them with FastAPI's
TestClient against an in-memory fake database. If someone renames or restructures those functions, this fails
loudly, which is the point.

Run:  python test_practice_routes.py     (needs: pip install fastapi httpx)
"""
import ast
import asyncio
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import httpx as _real_httpx
from fastapi import APIRouter, FastAPI, Header, HTTPException, Request
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
from typing import Optional

from test_practice_access import FakeCollection, DuplicateKeyError  # the same minimal fake

SRC = Path(__file__).with_name("server.py").read_text(encoding="utf-8")
TREE = ast.parse(SRC)

WANT = {
    # practice block
    "PRACTICE_PAYWALL", "PRACTICE_FREE_EMAILS", "_practice_indexed", "_pa", "_practice_exempt", "_practice_intl", "_practice_use_usd", "_practice_plans_for",
    "_practice_store", "_practice_grant_for_order", "practice_plans", "practice_access_status", "PracticeSessionStart",
    "PracticeSessionBeat", "practice_session_start", "practice_session_beat", "CreatePassOrderRequest",
    "razorpay_create_pass_order", "AdminPracticeGrantRequest", "admin_practice_grant",
    # the payment paths that gained a pass branch, and what they use
    "RazorpayVerifyRequest", "_find_payment_order", "razorpay_verify", "razorpay_webhook", "_get_pack",
}


def build():
    """A namespace with the wanted server.py definitions, wired to fakes."""
    api_router = APIRouter(prefix="/api")

    class Db:
        def __init__(self):
            self.payment_orders = FakeCollection()
            self.practice_access = FakeCollection()
            self.practice_sessions = FakeCollection()
            self.practice_grants = FakeCollection()
            self.users = FakeCollection()
            self.token_transactions = FakeCollection()

    for c in ("practice_access", "practice_sessions"):
        async def _noop(*a, **k):
            return None
        setattr(getattr(Db(), c), "create_index", _noop)
    db = Db()
    for coll in (db.practice_access, db.practice_sessions):
        async def create_index(*a, **k):
            return None
        coll.create_index = create_index

    notices = []

    async def _notify_admin_now(subject, body, timeout=8.0):
        notices.append((subject, body))

    async def get_current_user(authorization: str = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Not authenticated")
        uid = authorization.split(" ")[1]
        return {"id": uid, "email": f"{uid}@example.com", "phone": ""}

    class FakeResp:
        def __init__(self, data, status=200):
            self._d, self.status_code, self.text = data, status, json.dumps(data)

        def json(self):
            return self._d

    razorpay_calls = []

    class FakeAsyncClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, auth=None, json=None):
            razorpay_calls.append({"url": url, "auth": auth, "json": json})
            return FakeResp({"id": f"order_{len(razorpay_calls)}", "amount": json["amount"], "currency": json["currency"]})

    class FakeHttpx:
        AsyncClient = FakeAsyncClient

    ns = dict(
        api_router=api_router, db=db, APIRouter=APIRouter, Header=Header, HTTPException=HTTPException, Request=Request,
        BaseModel=BaseModel, Field=Field, Optional=Optional, datetime=datetime, timezone=timezone, timedelta=timedelta,
        uuid=uuid, asyncio=asyncio, json=json, os=__import__("os"), _time=time, httpx=FakeHttpx,
        logger=__import__("logging").getLogger("test"), get_current_user=get_current_user,
        _notify_admin_now=_notify_admin_now, _require_admin=lambda k: (_ for _ in ()).throw(HTTPException(403, "no")) if k != "adminkey" else None,
        _user_id_for_email=lambda e: "derived-" + e, _is_india=lambda r: (r.headers.get("x-vercel-ip-country") or "IN") == "IN",
        _request_country=lambda r: (r.headers.get("x-vercel-ip-country") or "").strip().upper(),
        INTERNATIONAL_CHARGING=False, DEMO_ACCOUNT_EMAIL="demo@formanti.com", DEMO_USER_EMAIL="demo@formanti.com",
        DEMO_USER_ID="demo-user-id", RAZORPAY_KEY_ID="rzp_test_x", RAZORPAY_KEY_SECRET="secret123", RAZORPAY_DEMO=False,
        RAZORPAY_WEBHOOK_SECRET="whsecret", _credit_tokens=None, _get_balance=None, _credit_razorpay_order=None,
        TOKEN_PACKS=[{"key": "pack_100", "tokens": 100, "price_inr": 30, "price_usd": 1}],
    )
    ns["_hl_unused"] = hashlib
    # execute the wanted top-level nodes in file order
    for node in TREE.body:
        name = getattr(node, "name", None)
        if name is None and isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
        if name in WANT:
            code = compile(ast.Module(body=[node], type_ignores=[]), "server.py", "exec")
            exec(code, ns)
    missing = [w for w in WANT if w not in ns and w not in ("_practice_indexed",)]
    assert not missing, f"not found in server.py: {missing}"
    app = FastAPI()
    app.include_router(api_router)
    return app, ns, db, notices, razorpay_calls


def auth(uid):
    return {"Authorization": f"Bearer {uid}"}


def sign(secret, msg):
    return hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()


def test_plans_and_access_and_trial_flow():
    app, ns, db, _n, _c = build()
    c = TestClient(app)
    r = c.get("/api/practice/plans").json()
    assert r["trial_seconds"] == 600 and r["paywall"] is True and r["autorenew"] is False
    assert [p["key"] for p in r["plans"]] == ["practice_week", "practice_month", "practice_year"]
    assert all(p["currency"] == "INR" for p in r["plans"])
    assert c.get("/api/practice/access").status_code == 401
    a = c.get("/api/practice/access", headers=auth("u1")).json()
    assert a["allowed"] and a["reason"] == "trial" and a["trial_seconds_left"] == 600
    s = c.post("/api/practice/session/start", json={"sport": "badminton", "shot": "smash"}, headers=auth("u1"))
    assert s.status_code == 200 and s.json()["session_id"]
    sid = s.json()["session_id"]
    b = c.post("/api/practice/session/beat", json={"session_id": sid}, headers=auth("u1")).json()
    assert b["session_known"] and b["access"]["allowed"]
    # use up the trial by rewinding the stored counter (the unit tests cover the time arithmetic)
    db.practice_access.rows[0]["trial_seconds_used"] = 600
    s2 = c.post("/api/practice/session/start", json={"sport": "badminton", "shot": "smash"}, headers=auth("u1"))
    assert s2.status_code == 402 and s2.json()["detail"]["code"] == "trial_over"
    assert s2.json()["detail"]["access"]["trial_seconds_left"] == 0
    assert c.post("/api/practice/session/start", json={}, headers={}).status_code == 401


def test_staff_and_kill_switch():
    app, ns, db, _n, _c = build()
    c = TestClient(app)
    db.practice_access.rows.append({"user_id": "demo-user-id", "trial_seconds_used": 600})
    a = c.get("/api/practice/access", headers=auth("demo-user-id")).json()
    assert a["allowed"] and a["reason"] == "staff"
    ns["PRACTICE_FREE_EMAILS"].add("u9@example.com")
    db.practice_access.rows.append({"user_id": "u9", "trial_seconds_used": 600})
    assert c.get("/api/practice/access", headers=auth("u9")).json()["reason"] == "staff"
    db.practice_access.rows.append({"user_id": "u3", "trial_seconds_used": 600})
    assert c.get("/api/practice/access", headers=auth("u3")).json()["allowed"] is False
    ns["PRACTICE_PAYWALL"] = False
    a = c.get("/api/practice/access", headers=auth("u3")).json()
    assert a["allowed"] and a["reason"] == "open"


def test_pass_purchase_live_mode_verify_then_webhook_is_idempotent():
    app, ns, db, notices, calls = build()
    c = TestClient(app)
    db.practice_access.rows.append({"user_id": "u1", "trial_seconds_used": 600})
    o = c.post("/api/payments/razorpay/create-pass-order", json={"plan_key": "practice_month"}, headers=auth("u1")).json()
    assert o["order_id"].startswith("order_") and o["amount"] == 40000 and o["currency"] == "INR" and o["key_id"] == "rzp_test_x"
    sent = calls[-1]["json"]
    assert sent["amount"] == 40000 and sent["notes"]["plan_key"] == "practice_month" and sent["notes"]["kind"] == "practice_pass"
    assert calls[-1]["url"] == "https://api.razorpay.com/v1/orders" and calls[-1]["auth"] == ("rzp_test_x", "secret123")
    row = db.payment_orders.rows[0]
    assert row["plan_key"] == "practice_month" and row["days"] == 30 and row["user_id"] == "u1" and row["status"] == "created"
    # a wrong signature is refused and opens nothing
    bad = c.post("/api/payments/razorpay/verify", json={"razorpay_order_id": o["order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": "nope"}, headers=auth("u1"))
    assert bad.status_code == 400
    assert c.get("/api/practice/access", headers=auth("u1")).json()["allowed"] is False
    # someone else cannot verify this order
    sig = sign("secret123", f"{o['order_id']}|pay_1")
    other = c.post("/api/payments/razorpay/verify", json={"razorpay_order_id": o["order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": sig}, headers=auth("u2"))
    assert other.status_code == 403
    # the real thing
    v = c.post("/api/payments/razorpay/verify", json={"razorpay_order_id": o["order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": sig}, headers=auth("u1"))
    assert v.status_code == 200, v.text
    body = v.json()
    assert body["ok"] and body["kind"] == "practice_pass" and body["access"]["allowed"] and body["access"]["reason"] == "pass"
    assert body["access"]["plan_key"] == "practice_month" and body["access"]["days_left"] in (29, 30)
    assert db.payment_orders.rows[0]["status"] == "paid" and db.payment_orders.rows[0]["razorpay_payment_id"] == "pay_1"
    assert len(notices) == 1 and "Practice pass" in notices[0][0]
    until = body["access"]["pass_until"]
    # the same payment again, from verify (a retry) and from the webhook: nothing more is granted
    v2 = c.post("/api/payments/razorpay/verify", json={"razorpay_order_id": o["order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": sig}, headers=auth("u1"))
    assert v2.status_code == 200 and v2.json()["access"]["pass_until"] == until
    wh_body = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_1", "order_id": o["order_id"]}}}})
    wh = c.post("/api/payments/razorpay/webhook", content=wh_body, headers={"x-razorpay-signature": sign("whsecret", wh_body)})
    assert wh.status_code == 200 and wh.json()["credited"] is False and wh.json()["kind"] == "practice_pass"
    assert c.get("/api/practice/access", headers=auth("u1")).json()["pass_until"] == until
    assert len(notices) == 1  # one purchase, one alert


def test_webhook_refuses_unsigned_calls_and_an_unconfigured_secret():
    """The forged-payment hole: with no secret set, an unsigned payment.captured used to be credited."""
    app, ns, db, notices, calls = build()
    c = TestClient(app)
    o = c.post("/api/payments/razorpay/create-pass-order", json={"plan_key": "practice_year"}, headers=auth("evil")).json()
    forged = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_fake", "order_id": o["order_id"]}}}})
    # no signature header at all, secret configured
    assert c.post("/api/payments/razorpay/webhook", content=forged).status_code == 400
    # a signature made with the wrong secret
    assert c.post("/api/payments/razorpay/webhook", content=forged, headers={"x-razorpay-signature": sign("guess", forged)}).status_code == 400
    assert c.get("/api/practice/access", headers=auth("evil")).json()["reason"] == "trial"
    # secret not configured on the server: refuse everything, even with a signature
    ns["RAZORPAY_WEBHOOK_SECRET"] = ""
    assert c.post("/api/payments/razorpay/webhook", content=forged).status_code == 503
    assert c.post("/api/payments/razorpay/webhook", content=forged, headers={"x-razorpay-signature": sign("", forged)}).status_code == 503
    assert c.get("/api/practice/access", headers=auth("evil")).json()["reason"] == "trial"


def test_webhook_alone_opens_the_pass_when_the_browser_never_came_back():
    app, ns, db, notices, calls = build()
    c = TestClient(app)
    o = c.post("/api/payments/razorpay/create-pass-order", json={"plan_key": "practice_week"}, headers=auth("u7")).json()
    wh_body = json.dumps({"event": "order.paid", "payload": {"payment": {"entity": {"id": "pay_77", "order_id": o["order_id"]}}}})
    assert c.post("/api/payments/razorpay/webhook", content=wh_body, headers={"x-razorpay-signature": "bad"}).status_code == 400
    wh = c.post("/api/payments/razorpay/webhook", content=wh_body, headers={"x-razorpay-signature": sign("whsecret", wh_body)})
    assert wh.status_code == 200 and wh.json()["credited"] is True
    a = c.get("/api/practice/access", headers=auth("u7")).json()
    assert a["allowed"] and a["reason"] == "pass" and a["plan_key"] == "practice_week"


def test_a_database_failure_during_grant_is_retryable_and_the_retry_finishes_it():
    app, ns, db, notices, calls = build()
    c = TestClient(app)
    o = c.post("/api/payments/razorpay/create-pass-order", json={"plan_key": "practice_week"}, headers=auth("u1")).json()
    sig = sign("secret123", f"{o['order_id']}|pay_5")
    payload = {"razorpay_order_id": o["order_id"], "razorpay_payment_id": "pay_5", "razorpay_signature": sig}
    # the access update fails on every try
    real = db.practice_access.update_one

    async def down(*a, **k):
        raise RuntimeError("atlas unreachable")

    db.practice_access.update_one = down
    r = c.post("/api/payments/razorpay/verify", json=payload, headers=auth("u1"))
    assert r.status_code == 503 and "payment went through" in r.json()["detail"]
    db.practice_access.update_one = real
    r = c.post("/api/payments/razorpay/verify", json=payload, headers=auth("u1"))
    assert r.status_code == 200 and r.json()["access"]["reason"] == "pass"


def test_order_that_cannot_be_saved_is_not_sold():
    app, ns, db, notices, calls = build()
    c = TestClient(app)

    async def down(*a, **k):
        raise RuntimeError("atlas unreachable")

    db.payment_orders.insert_one = down
    r = c.post("/api/payments/razorpay/create-pass-order", json={"plan_key": "practice_week"}, headers=auth("u1"))
    assert r.status_code == 503


def test_unknown_plan_and_demo_mode():
    app, ns, db, notices, calls = build()
    c = TestClient(app)
    assert c.post("/api/payments/razorpay/create-pass-order", json={"plan_key": "practice_forever"}, headers=auth("u1")).status_code == 400
    assert c.post("/api/payments/razorpay/create-pass-order", json={"plan_key": "practice_week"}).status_code == 401
    # demo mode (server without Razorpay keys): the demo order opens a pass without a charge, and only for its owner
    ns["RAZORPAY_DEMO"] = True
    o = c.post("/api/payments/razorpay/create-pass-order", json={"plan_key": "practice_week"}, headers=auth("u1")).json()
    assert o["demo_mode"] and o["order_id"].startswith("DEMO_practice_week_")
    assert c.post("/api/payments/razorpay/verify", json={"order_id": o["order_id"]}, headers=auth("u2")).status_code == 404
    v = c.post("/api/payments/razorpay/verify", json={"order_id": o["order_id"]}, headers=auth("u1"))
    assert v.status_code == 200 and v.json()["access"]["reason"] == "pass"
    # and in live mode a DEMO_ order is rejected outright (the old free-credit hole)
    ns["RAZORPAY_DEMO"] = False
    assert c.post("/api/payments/razorpay/verify", json={"order_id": o["order_id"]}, headers=auth("u1")).status_code == 400


def order_for(c, country, plan="practice_month"):
    h = {**auth("u1")}
    if country:
        h["x-vercel-ip-country"] = country
    return c.post("/api/payments/razorpay/create-pass-order", json={"plan_key": plan}, headers=h).json()


def test_international_visitors_pay_double_and_cheap_countries_pay_the_india_price():
    app, ns, db, notices, calls = build()
    c = TestClient(app)
    prices = lambda country: [(p["price"], p["currency"]) for p in c.get("/api/practice/plans", headers={"x-vercel-ip-country": country} if country else {}).json()["plans"]]
    # dollar charging is OFF (the state of the live account today): rupees everywhere, doubled for the expensive countries
    assert prices("IN") == [(200, "INR"), (400, "INR"), (3500, "INR")]
    assert prices("") == prices("IN")                      # unknown country = India
    assert prices("NG") == prices("IN") and prices("BD") == prices("IN") and prices("PH") == prices("IN")  # cheap countries
    assert prices("DE") == [(400, "INR"), (800, "INR"), (7000, "INR")]
    assert prices("US") == prices("DE") and prices("ZA") == prices("DE")
    # and the ORDER charges exactly what the cards showed
    assert order_for(c, "IN")["amount"] == 40000 and order_for(c, "BD")["amount"] == 40000
    o = order_for(c, "DE")
    assert o["amount"] == 80000 and o["currency"] == "INR" and calls[-1]["json"]["amount"] == 80000
    assert order_for(c, "DE", "practice_week")["amount"] == 40000 and order_for(c, "DE", "practice_year")["amount"] == 700000
    # dollar charging ON: only the expensive countries are charged in dollars
    ns["INTERNATIONAL_CHARGING"] = True
    assert prices("DE") == [(5, "USD"), (10, "USD"), (80, "USD")]
    assert prices("NG") == prices("IN") == [(200, "INR"), (400, "INR"), (3500, "INR")]
    o = order_for(c, "DE")
    assert o["currency"] == "USD" and o["amount"] == 1000
    o = order_for(c, "NG")
    assert o["currency"] == "INR" and o["amount"] == 40000
    # the stored order says what was charged
    rows = [r for r in db.payment_orders.rows if r.get("tier") == "intl"]
    assert rows and rows[-1]["currency"] == "USD" and rows[-1]["amount"] == 10


def test_admin_grant():
    app, ns, db, notices, calls = build()
    c = TestClient(app)
    db.users.rows.append({"id": "u1", "email": "a@b.com"})

    # the fake collection has no $or: give users.find_one a tiny one
    real = db.users.find_one

    async def find_one(flt, projection=None):
        if "$or" in flt:
            for sub in flt["$or"]:
                r = await real(sub, projection)
                if r:
                    return r
            return None
        return await real(flt, projection)

    db.users.find_one = find_one
    assert c.post("/api/admin/practice-grant", json={"identifier": "a@b.com", "days": 10}, headers={"X-Admin-Key": "wrong"}).status_code == 403
    r = c.post("/api/admin/practice-grant", json={"identifier": "a@b.com", "days": 10, "note": "comp"}, headers={"X-Admin-Key": "adminkey"})
    assert r.status_code == 200 and r.json()["access"]["reason"] == "pass" and r.json()["user_id"] == "u1"
    assert c.post("/api/admin/practice-grant", json={"identifier": "a@b.com", "days": 0}, headers={"X-Admin-Key": "adminkey"}).status_code == 422


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for f in fns:
        f()
        print("ok  ", f.__name__)
    print(f"\nall {len(fns)} passed")
