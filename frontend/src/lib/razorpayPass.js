/**
 * Buying a practice pass through Razorpay Checkout. Same flow as the analysis packs (BuyTokensDialog):
 *   create-pass-order -> Checkout.js -> server verifies the HMAC signature and opens the pass (the webhook is the backstop).
 * The one thing taken from the payment-credit bug of 2026-08: by the time Checkout's success handler runs the customer
 * HAS been charged, so verify is retried, and if it still fails the message says the payment went through.
 */
import api from "@/lib/api";
import { toast } from "sonner";

let sdkPromise = null;
function loadRazorpaySdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Razorpay) { resolve(window.Razorpay); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => { sdkPromise = null; reject(new Error("Failed to load Razorpay")); };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

async function verifyWithRetries(payload) {
  const MAX = 4;
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      const { data } = await api.post("/payments/razorpay/verify", payload, { timeout: 45000 });
      return data;
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status;
      // a 4xx other than 408/429 is a real answer (bad signature, someone else's order): retrying cannot change it
      const worthRetry = !status || status >= 500 || status === 408 || status === 429;
      if (!worthRetry || attempt === MAX) break;
      toast.loading(`Confirming your payment… (${attempt}/${MAX})`, { id: "pass-verify", duration: 4000 });
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  toast.dismiss("pass-verify");
  throw lastErr;
}

/**
 * Run the whole purchase for one plan.
 * @returns {Promise<{status:"paid", access:object} | {status:"cancelled"} | {status:"failed", message:string}
 *                  | {status:"unconfirmed", ref:string}>}
 *   "unconfirmed": the payment went through but we could not open the pass yet (the webhook will); tell them so.
 */
export async function buyPass(plan, { onStarted } = {}) {
  let order;
  try {
    ({ data: order } = await api.post("/payments/razorpay/create-pass-order", { plan_key: plan.key }, { timeout: 30000 }));
    if (!order?.order_id) throw new Error("Could not create the payment");
  } catch (e) {
    return { status: "failed", message: e?.response?.data?.detail || e?.message || "Could not start the payment" };
  }
  onStarted?.();

  // a server running without Razorpay keys (local / preview): no real charge, the demo order opens the pass
  if (order.demo_mode) {
    try {
      const data = await verifyWithRetries({ order_id: order.order_id });
      return data?.ok ? { status: "paid", access: data.access } : { status: "failed", message: "Could not confirm" };
    } catch (e) {
      return { status: "failed", message: e?.response?.data?.detail || "Could not confirm" };
    }
  }

  let Razorpay;
  try {
    Razorpay = await loadRazorpaySdk();
    if (!Razorpay) throw new Error("Razorpay didn't load");
  } catch (e) {
    return { status: "failed", message: "The payment window could not load. Check your connection and try again." };
  }

  return new Promise((resolve) => {
    const rzp = new Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency || "INR",
      order_id: order.order_id,
      name: order.name || "Formanti",
      description: order.description || `Practice pass · ${plan.label}`,
      prefill: { email: order.prefill_email || "", contact: order.prefill_contact || "" },
      theme: { color: "#bef264" },
      handler: async (resp) => {
        try {
          const data = await verifyWithRetries({
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          if (data?.ok) resolve({ status: "paid", access: data.access });
          else resolve({ status: "unconfirmed", ref: String(resp.razorpay_payment_id || "").slice(-8) });
        } catch (e) {
          const status = e?.response?.status;
          if (status && status < 500 && status !== 408 && status !== 429) {
            resolve({ status: "failed", message: e?.response?.data?.detail || "The payment could not be applied to your account. Contact support with the payment ref " + String(resp.razorpay_payment_id || "").slice(-8) });
          } else {
            resolve({ status: "unconfirmed", ref: String(resp.razorpay_payment_id || "").slice(-8) });
          }
        }
      },
      modal: { ondismiss: () => resolve({ status: "cancelled" }) },
    });
    rzp.on("payment.failed", (r) => {
      toast.error(r?.error?.description || "Payment failed");
    });
    rzp.open();
  });
}
