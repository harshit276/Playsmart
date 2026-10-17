"""
Tests for practice_access against an in-memory fake of the Mongo collections it uses.
Run:  python test_practice_access.py     (or pytest)
"""
import asyncio
import copy
from datetime import datetime, timedelta, timezone

import practice_access as pa
from practice_access import PracticeStore, compute_access, iso


class DuplicateKeyError(Exception):  # same class name as pymongo's: the store recognises it by name
    pass


class FakeCollection:
    """Just enough of motor's collection: equality filters, $set/$inc/$max/$push/$setOnInsert, upsert, unique _id."""

    def __init__(self):
        self.rows = []
        self.fail_next = []  # exceptions to raise on the next calls, to simulate the database hiccuping

    def _maybe_fail(self):
        if self.fail_next:
            raise self.fail_next.pop(0)

    def _match(self, row, flt):
        return all(row.get(k) == v for k, v in flt.items())

    async def find_one(self, flt, projection=None):
        self._maybe_fail()
        for r in self.rows:
            if self._match(r, flt):
                out = copy.deepcopy(r)
                if projection and projection.get("_id") == 0:
                    out.pop("_id", None)
                return out
        return None

    async def insert_one(self, row):
        self._maybe_fail()
        if "_id" in row and any(r.get("_id") == row["_id"] for r in self.rows):
            raise DuplicateKeyError("E11000 duplicate key error")
        self.rows.append(copy.deepcopy(row))

    async def update_one(self, flt, upd, upsert=False):
        self._maybe_fail()
        row = next((r for r in self.rows if self._match(r, flt)), None)
        if row is None:
            if not upsert:
                return
            row = {k: v for k, v in flt.items()}
            row.update(copy.deepcopy(upd.get("$setOnInsert", {})))
            self.rows.append(row)
        for k, v in upd.get("$set", {}).items():
            row[k] = v
        for k, v in upd.get("$inc", {}).items():
            row[k] = row.get(k, 0) + v
        for k, v in upd.get("$max", {}).items():
            row[k] = v if k not in row or v > row[k] else row[k]
        for k, spec in upd.get("$push", {}).items():
            arr = row.setdefault(k, [])
            arr.extend(copy.deepcopy(spec["$each"]))
            if "$slice" in spec and spec["$slice"] < 0:
                del arr[: max(0, len(arr) + spec["$slice"])]


class FakeDb:
    def __init__(self):
        self.practice_access = FakeCollection()
        self.practice_sessions = FakeCollection()
        self.practice_grants = FakeCollection()


T0 = datetime(2026, 10, 17, 12, 0, 0, tzinfo=timezone.utc)
at = lambda s: T0 + timedelta(seconds=s)


def run(coro):
    return asyncio.run(coro)


def test_plans():
    ps = pa.plans_for()
    assert [p["key"] for p in ps] == ["practice_week", "practice_month", "practice_year"]
    assert all(p["currency"] == "INR" and p["price"] == p["price_inr"] for p in ps)
    assert ps[1]["highlight"] and not ps[0]["highlight"]
    usd = pa.plans_for(use_usd=True)
    assert all(p["currency"] == "USD" and p["price"] == p["price_usd"] for p in usd)
    assert pa.get_plan("nope") is None


def test_compute_access_states():
    a = compute_access(None, T0)
    assert a["allowed"] and a["reason"] == "trial" and a["trial_seconds_left"] == 600 and a["trial_seconds_total"] == 600
    a = compute_access({"trial_seconds_used": 250}, T0)
    assert a["allowed"] and a["trial_seconds_left"] == 350
    a = compute_access({"trial_seconds_used": 600}, T0)
    assert not a["allowed"] and a["reason"] == "trial_over" and a["trial_seconds_left"] == 0
    a = compute_access({"trial_seconds_used": 9999}, T0)
    assert not a["allowed"] and a["trial_seconds_left"] == 0
    a = compute_access({"trial_seconds_used": 600, "pass_until": iso(at(86400 * 3)), "pass_plan": "practice_week"}, T0)
    assert a["allowed"] and a["reason"] == "pass" and a["days_left"] == 3 and a["plan_key"] == "practice_week"
    a = compute_access({"trial_seconds_used": 600, "pass_until": iso(at(-5))}, T0)
    assert not a["allowed"] and a["reason"] == "pass_expired"
    a = compute_access({"trial_seconds_used": 600}, T0, exempt="staff@x")
    assert a["allowed"] and a["reason"] == "staff"
    a = compute_access({"trial_seconds_used": 600}, T0, paywall=False)
    assert a["allowed"] and a["reason"] == "open"
    # a pass that ends in 1 second still says 1 day left, never 0
    assert compute_access({"pass_until": iso(at(1)), "trial_seconds_used": 600}, T0)["days_left"] == 1


def test_trial_is_counted_by_heartbeats_and_ends():
    store = PracticeStore(FakeDb())

    async def go():
        acc, sid = await store.start_session("u1", "badminton", "smash", at(0))
        assert sid and acc["reason"] == "trial" and acc["trial_seconds_left"] == 600
        t = 0
        for _ in range(10):  # 10 heartbeats, 15 s apart: 150 s
            t += 15
            acc, known = await store.beat("u1", sid, at(t))
            assert known and acc["allowed"]
        assert acc["trial_seconds_left"] == 450
        # a heartbeat after a long silence (tab asleep) counts for at most BEAT_MAX_GAP_S
        acc, _ = await store.beat("u1", sid, at(t + 3600))
        assert acc["trial_seconds_left"] == 450 - pa.BEAT_MAX_GAP_S
        # run it out
        t += 3600
        while acc["allowed"]:
            t += 40
            acc, _ = await store.beat("u1", sid, at(t))
        assert acc["reason"] == "trial_over" and acc["trial_seconds_left"] == 0
        # a new session is refused, with the reason
        acc2, sid2 = await store.start_session("u1", "badminton", "smash", at(t + 5))
        assert sid2 is None and not acc2["allowed"] and acc2["reason"] == "trial_over"
        # time is per account: someone else still has their trial
        acc3, sid3 = await store.start_session("u2", "badminton", "smash", at(t + 5))
        assert sid3 and acc3["trial_seconds_left"] == 600

    run(go())


def test_unknown_session_and_other_users_session():
    store = PracticeStore(FakeDb())

    async def go():
        _, sid = await store.start_session("u1", "badminton", "smash", at(0))
        acc, known = await store.beat("u1", "does-not-exist", at(10))
        assert not known and acc["allowed"]
        acc, known = await store.beat("u2", sid, at(10))  # another user cannot spend or poke u1's session
        assert not known

    run(go())


def test_pass_time_is_free_and_not_counted():
    db = FakeDb()
    store = PracticeStore(db)

    async def go():
        _, sid = await store.start_session("u1", "badminton", "smash", at(0))
        await store.beat("u1", sid, at(30))
        left_before = (await store.get_access("u1", at(30)))["trial_seconds_left"]
        await store.grant_pass("u1", "practice_week", "pay_1", at(31))
        acc, _ = await store.beat("u1", sid, at(60))
        assert acc["reason"] == "pass"
        assert acc["trial_seconds_left"] == left_before  # minutes under a pass are not taken from the trial

    run(go())


def test_grant_extends_and_is_idempotent():
    db = FakeDb()
    store = PracticeStore(db)

    async def go():
        fresh, acc = await store.grant_pass("u1", "practice_week", "pay_1", at(0), order_id="order_1", amount=49)
        assert fresh and acc["allowed"] and acc["reason"] == "pass"
        assert acc["pass_until"] == iso(at(7 * 86400)) and acc["plan_key"] == "practice_week"
        # the same payment again (verify + webhook both arrive): nothing changes
        fresh, acc2 = await store.grant_pass("u1", "practice_week", "pay_1", at(60), order_id="order_1", amount=49)
        assert not fresh and acc2["pass_until"] == acc["pass_until"]
        # a second payment while the first is running adds on the end
        fresh, acc3 = await store.grant_pass("u1", "practice_month", "pay_2", at(86400))
        assert fresh and acc3["pass_until"] == iso(at(7 * 86400 + 30 * 86400)) and acc3["plan_key"] == "practice_month"
        # a payment after expiry starts from now
        late = at(400 * 86400)
        fresh, acc4 = await store.grant_pass("u1", "practice_year", "pay_3", late)
        assert acc4["pass_until"] == iso(late + timedelta(days=365))
        doc = await store.doc("u1")
        assert [p["payment_id"] for p in doc["passes"]] == ["pay_1", "pay_2", "pay_3"]

    run(go())


def test_grant_is_rerunnable_after_a_failure_between_steps():
    db = FakeDb()
    store = PracticeStore(db)

    async def go():
        # the access update keeps failing (database down) after the grant row was written
        boom = RuntimeError("connection reset")
        orig = store.access.update_one

        async def failing(*a, **k):
            raise boom

        store.access.update_one = failing
        try:
            await store.grant_pass("u1", "practice_month", "pay_9", at(0))
            raise AssertionError("expected the failure to surface so the caller can retry")
        except RuntimeError:
            pass
        store.access.update_one = orig
        assert (await store.get_access("u1", at(1)))["reason"] == "trial"  # nothing granted yet
        # the retry (client verify retry / Razorpay webhook retry) finishes the job, once
        fresh, acc = await store.grant_pass("u1", "practice_month", "pay_9", at(500))
        assert not fresh and acc["reason"] == "pass"
        assert acc["pass_until"] == iso(at(30 * 86400))  # the date promised at the FIRST attempt, not a later one
        # and a third delivery does nothing more
        fresh, acc = await store.grant_pass("u1", "practice_month", "pay_9", at(900))
        assert not fresh and acc["pass_until"] == iso(at(30 * 86400))

    run(go())


def test_payment_cannot_be_claimed_by_another_account():
    store = PracticeStore(FakeDb())

    async def go():
        await store.grant_pass("u1", "practice_week", "pay_1", at(0))
        try:
            await store.grant_pass("u2", "practice_week", "pay_1", at(5))
            raise AssertionError("another account must not be able to reuse a payment id")
        except ValueError:
            pass
        assert (await store.get_access("u2", at(6)))["reason"] == "trial"

    run(go())


def test_reads_survive_a_cold_database():
    db = FakeDb()
    store = PracticeStore(db)

    async def go():
        db.practice_access.fail_next = [RuntimeError("cold"), RuntimeError("cold")]
        acc = await store.get_access("u1", at(0))  # two failures, the third try answers
        assert acc["allowed"]

    run(go())


def test_admin_grant_takes_its_length_from_days():
    store = PracticeStore(FakeDb())

    async def go():
        fresh, acc = await store.grant_pass("u1", "admin_grant", "admin_x", at(0), days=14)
        assert fresh and acc["reason"] == "pass" and acc["pass_until"] == iso(at(14 * 86400)) and acc["plan_key"] == "admin_grant"
        for bad in (None, 0, 400):
            try:
                await store.grant_pass("u1", "admin_grant", f"admin_{bad}", at(0), days=bad)
                raise AssertionError("expected ValueError")
            except ValueError:
                pass

    run(go())


def test_unknown_plan_is_refused():
    store = PracticeStore(FakeDb())
    try:
        run(store.grant_pass("u1", "practice_forever", "pay_1", at(0)))
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for f in fns:
        f()
        print("ok  ", f.__name__)
    print(f"\nall {len(fns)} passed")
