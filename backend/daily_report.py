"""Daily business report, pushed to Telegram.

WHY THIS EXISTS: the numbers that decide what to build next — did anyone sign
up, did anyone analyse anything, is Google indexing the new pages, where is
traffic coming from — were all checked by hand across three dashboards
(PostHog, Search Console, the admin panel). Nobody checks three dashboards
every day, so the answer was usually "I don't know". This assembles them once
a day and sends one message.

Every section degrades on its own: if a key is missing or an API is down, that
section says so and the rest of the report still goes out. A report that
silently drops a section is worse than one that admits a gap.

Configuration (Vercel env):
  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID  already set — delivery
  POSTHOG_API_KEY        personal API key (Settings → Personal API keys)
  POSTHOG_PROJECT_ID     numeric project id from the PostHog URL
  POSTHOG_HOST           default https://eu.posthog.com
  GSC_SA_JSON            Google service-account JSON (one line). The service
                         account's email must be added as a user on the
                         Search Console property, or Google returns 403.
  GSC_SITE               e.g. sc-domain:formanti.com
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone

import httpx

logger = logging.getLogger(__name__)

POSTHOG_API_KEY = os.environ.get("POSTHOG_API_KEY", "").strip()
POSTHOG_PROJECT_ID = os.environ.get("POSTHOG_PROJECT_ID", "").strip()
POSTHOG_HOST = os.environ.get("POSTHOG_HOST", "https://eu.posthog.com").strip().rstrip("/")
GSC_SA_JSON = os.environ.get("GSC_SA_JSON", "").strip()
GSC_SITE = os.environ.get("GSC_SITE", "sc-domain:formanti.com").strip()

# Pages whose indexing actually matters — the ones built to rank.
INDEX_CHECK_URLS = [
    "https://www.formanti.com/",
    "https://www.formanti.com/badminton",
    "https://www.formanti.com/gym",
    "https://www.formanti.com/cricket",
    "https://www.formanti.com/marketplace",
    "https://www.formanti.com/badminton/equipment",
    "https://www.formanti.com/cricket/equipment",
    "https://www.formanti.com/demo",
]


def _fmt(n) -> str:
    try:
        return f"{int(n):,}".replace(",", ",")
    except Exception:
        return str(n)


async def _count(db, coll: str, query: dict, timeout: float = 8.0) -> int:
    try:
        return await asyncio.wait_for(db[coll].count_documents(query), timeout=timeout)
    except Exception:
        return -1


async def product_section(db) -> str:
    """Our own numbers — always available, no third party involved."""
    now = datetime.now(timezone.utc)
    d1 = (now - timedelta(days=1)).isoformat()
    d7 = (now - timedelta(days=7)).isoformat()
    dt1 = now - timedelta(days=1)

    users_24h = await _count(db, "users", {"created_at": {"$gte": d1}})
    users_total = await _count(db, "users", {})
    an_24h = await _count(db, "video_analyses", {"date": {"$gte": d1}})
    an_7d = await _count(db, "video_analyses", {"date": {"$gte": d7}})
    an_total = await _count(db, "video_analyses", {})
    phones = await _count(db, "users", {"phone": {"$exists": True, "$ne": ""}})

    # Money: paid orders only.
    paid_24h, revenue_24h, revenue_total = 0, 0, 0
    try:
        rows = await asyncio.wait_for(db.payment_orders.find(
            {"status": "paid"}, {"_id": 0, "amount_inr": 1, "paid_at": 1}).to_list(1000), timeout=8.0)
        for r in rows or []:
            amt = int(r.get("amount_inr") or 0)
            revenue_total += amt
            if (r.get("paid_at") or "") >= d1:
                paid_24h += 1
                revenue_24h += amt
    except Exception:
        revenue_total = -1

    # Come-back nudges (the retention loop).
    nudges_24h = await _count(db, "reengagement_log", {"sent_at": {"$gte": dt1}})
    taps_24h = await _count(db, "reengagement_log", {"clicked_at": {"$gte": dt1}})

    fb_24h = await _count(db, "analysis_feedback", {"created_at": {"$gte": d1}})
    fails_24h = await _count(db, "analysis_jobs", {"status": "failed", "created_at": {"$gte": d1}})

    lines = [
        "*Product (24h)*",
        f"• Signups: {_fmt(users_24h)}  (total {_fmt(users_total)})",
        f"• Analyses: {_fmt(an_24h)}  (7d {_fmt(an_7d)}, total {_fmt(an_total)})",
        f"• Paid: {_fmt(paid_24h)} order(s), ₹{_fmt(revenue_24h)}  (lifetime ₹{_fmt(revenue_total)})",
        f"• Come-back nudges: {_fmt(nudges_24h)} sent, {_fmt(taps_24h)} tapped",
        f"• Feedback: {_fmt(fb_24h)} · Failed analyses: {_fmt(fails_24h)} · Phones on file: {_fmt(phones)}",
    ]
    return "\n".join(lines)


async def _posthog_query(sql: str) -> list:
    if not (POSTHOG_API_KEY and POSTHOG_PROJECT_ID):
        return None
    url = f"{POSTHOG_HOST}/api/projects/{POSTHOG_PROJECT_ID}/query/"
    async with httpx.AsyncClient(timeout=25.0) as c:
        r = await c.post(url,
                         headers={"Authorization": f"Bearer {POSTHOG_API_KEY}"},
                         json={"query": {"kind": "HogQLQuery", "query": sql}})
        if r.status_code >= 400:
            raise RuntimeError(f"{r.status_code}: {r.text[:120]}")
        return (r.json() or {}).get("results") or []


async def traffic_section() -> str:
    if not (POSTHOG_API_KEY and POSTHOG_PROJECT_ID):
        return ("*Traffic*\n• PostHog not connected — set POSTHOG_API_KEY and "
                "POSTHOG_PROJECT_ID to see visitors here.")
    try:
        totals, pages, funnel = await asyncio.gather(
            _posthog_query(
                "SELECT count(), count(distinct person_id) FROM events "
                "WHERE event = '$pageview' AND timestamp > now() - INTERVAL 1 DAY"),
            _posthog_query(
                "SELECT properties.$pathname AS path, count() AS c FROM events "
                "WHERE event = '$pageview' AND timestamp > now() - INTERVAL 1 DAY "
                "GROUP BY path ORDER BY c DESC LIMIT 5"),
            _posthog_query(
                "SELECT event, count() AS c FROM events WHERE timestamp > now() - INTERVAL 1 DAY "
                "AND event IN ('signup_completed','video_selected','analysis_started',"
                "'analysis_completed','quick_signup_clicked','nudge_clicked','purchase_completed') "
                "GROUP BY event ORDER BY c DESC"))
        pv, visitors = (totals[0][0], totals[0][1]) if totals else (0, 0)
    except Exception as exc:
        return f"*Traffic*\n• PostHog query failed: {str(exc)[:110]}"

    out = ["*Traffic (24h)*", f"• {_fmt(pv)} pageviews from {_fmt(visitors)} visitors"]
    if pages:
        out.append("• Top pages: " + ", ".join(f"{p[0] or '/'} ({p[1]})" for p in pages))
    if funnel:
        out.append("• Funnel: " + ", ".join(f"{e[0].replace('_', ' ')} {e[1]}" for e in funnel))
    else:
        out.append("• Funnel: no signup/analysis events in the last 24h")
    return "\n".join(out)


def _gsc_token() -> str:
    """Access token for the Search Console API from the service-account JSON."""
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    info = json.loads(GSC_SA_JSON)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/webmasters.readonly"])
    creds.refresh(Request())
    return creds.token


async def search_section() -> str:
    """Search Console: what Google sent us, and whether key pages are indexed."""
    if not GSC_SA_JSON:
        return ("*Search*\n• Search Console not connected — add GSC_SA_JSON "
                "(service-account key, added as a user on the property) and GSC_SITE.")
    try:
        token = await asyncio.get_event_loop().run_in_executor(None, _gsc_token)
    except Exception as exc:
        return f"*Search*\n• Search Console auth failed: {str(exc)[:110]}"

    site = GSC_SITE.replace("/", "%2F").replace(":", "%3A")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    end = (datetime.now(timezone.utc) - timedelta(days=2)).date().isoformat()
    start = (datetime.now(timezone.utc) - timedelta(days=8)).date().isoformat()
    out = ["*Search (Google, last 7 complete days)*"]
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                f"https://searchconsole.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query",
                headers=headers,
                json={"startDate": start, "endDate": end, "dimensions": [], "rowLimit": 1})
            rows = (r.json() or {}).get("rows") or [] if r.status_code < 400 else []
            if r.status_code >= 400:
                out.append(f"• Query failed: {r.status_code} {r.text[:90]}")
            elif rows:
                t = rows[0]
                out.append(f"• {int(t.get('clicks', 0))} clicks, {int(t.get('impressions', 0))} "
                           f"impressions, avg position {t.get('position', 0):.1f}")
            else:
                out.append("• No search data yet for this period")

            q = await c.post(
                f"https://searchconsole.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query",
                headers=headers,
                json={"startDate": start, "endDate": end, "dimensions": ["query"], "rowLimit": 5})
            qrows = (q.json() or {}).get("rows") or [] if q.status_code < 400 else []
            if qrows:
                out.append("• Top queries: " + ", ".join(
                    f"{x['keys'][0]} ({int(x.get('clicks', 0))}c/{int(x.get('impressions', 0))}i)"
                    for x in qrows))

            # Indexing: ask Google directly, all pages at once — one at a time
            # took longer than the cron was willing to wait.
            async def _verdict(url):
                try:
                    ins = await c.post(
                        "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
                        headers=headers,
                        json={"inspectionUrl": url, "siteUrl": GSC_SITE})
                    if ins.status_code >= 400:
                        return "?"
                    return (((ins.json() or {}).get("inspectionResult") or {})
                            .get("indexStatusResult") or {}).get("coverageState", "")
                except Exception:
                    return None

            verdicts = await asyncio.gather(*[_verdict(u) for u in INDEX_CHECK_URLS])
            not_indexed = []
            for url, verdict in zip(INDEX_CHECK_URLS, verdicts):
                if verdict is None:
                    continue
                path = url.split("formanti.com")[-1] or "/"
                if verdict == "?":
                    not_indexed.append(f"{path}?")
                elif "indexed" not in verdict.lower() or "not indexed" in verdict.lower():
                    not_indexed.append(f"{path} — {verdict or 'unknown'}")
            if not_indexed:
                out.append("• NOT indexed: " + "; ".join(not_indexed[:6]))
            else:
                out.append(f"• All {len(INDEX_CHECK_URLS)} key pages indexed")
    except Exception as exc:
        out.append(f"• Search Console error: {str(exc)[:110]}")
    return "\n".join(out)


def alerts_section(product: str) -> str:
    """Only things that need a decision today."""
    alerts = []
    try:
        for line in product.splitlines():
            if line.startswith("• Analyses:") and line.split()[2].strip(":") == "0":
                alerts.append("No analyses in 24h")
            if line.startswith("• Signups:") and line.split()[2] == "0":
                alerts.append("No signups in 24h")
    except Exception:
        pass
    return ("*Needs attention*\n• " + "\n• ".join(alerts)) if alerts else ""


async def build_daily_report(db) -> str:
    product, traffic, search = await asyncio.gather(
        product_section(db), traffic_section(), search_section())
    parts = [product, traffic, search]
    alerts = alerts_section(product)
    if alerts:
        parts.append(alerts)
    # Stamp the report in IST — the day it reads as to whoever gets it.
    day = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).strftime("%d %b")
    return f"Formanti daily · {day}\n\n" + "\n\n".join(p for p in parts if p)
