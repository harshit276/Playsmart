# Cashfree Payment Integration — Setup Guide

The integration code is already shipped. You only need to wire your keys + webhook.

---

## 1. Add env vars on Vercel

Vercel dashboard → your project → **Settings** → **Environment Variables**.

Add these **4 required + 1 recommended** vars to **all 3 environments** (Production, Preview, Development):

| Variable | Value | Notes |
|---|---|---|
| `CASHFREE_APP_ID` | (your App ID) | From merchant.cashfree.com → Developers → API Keys |
| `CASHFREE_SECRET_KEY` | (your Secret Key) | Same screen. Treat like a password. Also used to verify webhooks (Cashfree's 2023-08-01 API). |
| `CASHFREE_ENV` | `SANDBOX` for testing, `PRODUCTION` after KYC | Default is `SANDBOX` |
| `DEMO_PAYMENTS` | `false` | Force real flow even if keys are present. Skip this var to auto-detect. |
| `CASHFREE_WEBHOOK_SECRET` | (not needed) | Cashfree's current dashboard doesn't issue a separate webhook key — they sign webhooks with the same `CASHFREE_SECRET_KEY`. Only set this if your old dashboard still exposes a distinct webhook signing key. |

**Important:** Cashfree gives separate keys for Sandbox vs Production. Use sandbox keys with `CASHFREE_ENV=SANDBOX` and production keys with `CASHFREE_ENV=PRODUCTION`. Don't mix.

After saving, **redeploy** (or push any commit) so the new vars take effect.

---

## 2. Configure the webhook URL in Cashfree

Cashfree dashboard → **Developers** → **Webhooks** → **Add webhook**.

| Field | Value |
|---|---|
| URL | `https://atheonics.com/api/payments/webhook` |
| Events | ✅ `PAYMENT_SUCCESS_WEBHOOK` (required). Others optional. |
| API version | `2023-08-01` |

Save. **No separate webhook signing key needed** in the current Cashfree dashboard — they sign webhooks using your `CASHFREE_SECRET_KEY` (HMAC-SHA256 of `timestamp + raw_body`, base64-encoded). The backend handles that automatically.

If your dashboard shows a "Webhook Secret" field (some legacy accounts still do), copy it into `CASHFREE_WEBHOOK_SECRET` on Vercel — the backend will prefer it over `CASHFREE_SECRET_KEY` for verification.

Why the webhook matters: if a customer's browser crashes between paying and the success callback, the webhook is the backstop that credits their tokens. Without it, you'd have to manually reconcile dropped payments.

---

## 3. Verify your keys work (zero-cost test)

After deploying with the env vars set:

**Option A — admin dashboard (easiest):**
1. Log into `/admin`
2. Stats tab → click **💳 Ping Cashfree**
3. Green box = keys OK. Red box = bad keys / wrong env.

**Option B — curl:**
```bash
curl -H "X-Admin-Key: $ADMIN_WIPE_KEY" \
  https://atheonics.com/api/admin/cashfree-ping
```

What it does: hits Cashfree's `/orders` endpoint with `order_amount: 0.01` (which Cashfree rejects). A 400 response from Cashfree means your keys auth'd correctly. A 401/403 means bad keys. No real order is created.

You can also check `/api/health` to see env state:
```json
{
  "env": {
    "CASHFREE_APP_ID": "set",
    "CASHFREE_SECRET_KEY": "set",
    "CASHFREE_WEBHOOK_SECRET": "set",
    "CASHFREE_ENV": "SANDBOX",
    "DEMO_PAYMENTS": "False"
  }
}
```

---

## 4. End-to-end test (sandbox)

In sandbox, Cashfree provides test cards / UPI handles:

| Method | Test value |
|---|---|
| Card | `4111 1111 1111 1111` · any future expiry · any CVV |
| UPI success | `testsuccess@gocash` |
| UPI failure | `testfailure@gocash` |
| Netbanking | Any bank → use "SUCCESS" on the next page |

Steps:
1. Sign into the live site
2. Click 🪙 chip in navbar → **Buy Tokens**
3. Pick a pack
4. Cashfree drop-in modal opens → pay with a test handle
5. Modal closes → "+X tokens added!" toast → wallet chip updates instantly

Behind the scenes:
1. POST `/payments/create-order` → returns `payment_session_id`
2. Cashfree JS SDK launches drop-in
3. On success → POST `/payments/verify` → server re-fetches the order from Cashfree and credits tokens only if `order_status === "PAID"`
4. Webhook fires in parallel as a backstop

Both `verify` and webhook are idempotent (keyed on `cashfree_payment_id`), so dual-firing doesn't double-credit.

---

## 5. Go live (after KYC)

Cashfree requires KYC for production keys:
- Business proof (GST cert / Udyam / shop license)
- Bank account proof (cancelled cheque)
- PAN
- Director Aadhaar (for companies)

Submit at merchant.cashfree.com → KYC. Usually 1-3 days.

Once approved:
1. Generate **production** API keys (separate from sandbox)
2. Update Vercel env vars: replace `CASHFREE_APP_ID` + `CASHFREE_SECRET_KEY` + `CASHFREE_WEBHOOK_SECRET` with production values
3. Set `CASHFREE_ENV=PRODUCTION`
4. Add a **production** webhook in the production dashboard (same URL: `/api/payments/webhook`)
5. Redeploy
6. Ping admin → 💳 Ping Cashfree → should say `env: PRODUCTION` and green

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Cashfree: x-client-id is invalid" | Wrong env (sandbox key used with `CASHFREE_ENV=PRODUCTION` or vice versa) OR keys typo |
| "Cashfree: customer_phone is invalid" | Old data — backend now auto-normalizes. Pull latest + redeploy |
| Modal opens but immediately closes | Browser blocking the popup OR ad-blocker hitting `sdk.cashfree.com`. Allow it. |
| Payment succeeds but tokens not credited | Check `/admin/payments` for the order. If status=created, the webhook didn't fire — verify webhook URL in Cashfree dashboard exactly matches `/api/payments/webhook` |
| Webhook signature mismatch warnings | `CASHFREE_WEBHOOK_SECRET` doesn't match what's in Cashfree dashboard. Regenerate in Cashfree → copy → update Vercel → redeploy |
| 503 "Payments not configured" | Env vars not loaded — redeploy after adding them, then hard-refresh |
| Test card declined in sandbox | Use the exact test value `4111 1111 1111 1111` — other valid-looking cards are rejected on purpose |
