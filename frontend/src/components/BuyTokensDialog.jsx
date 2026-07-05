/**
 * BuyTokensDialog — pack picker → Razorpay Checkout.
 *
 * Flow:
 *   1. User picks a pack.
 *   2. POST /payments/razorpay/create-order returns {order_id, key_id, amount}.
 *   3. We load Razorpay's Checkout.js and open it with the order_id.
 *   4. On success Razorpay returns {razorpay_order_id, razorpay_payment_id,
 *      razorpay_signature}; the server VERIFIES the HMAC signature in
 *      /payments/razorpay/verify and only then credits tokens.
 *   5. The webhook is the backstop if the success callback is dropped.
 *   Demo mode (no keys configured): skip the SDK, verify the DEMO_ order
 *   directly so the flow is testable without a real charge.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Coins, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/App";
import PaymentSuccessModal from "@/components/PaymentSuccessModal";

let razorpaySdkPromise = null;
function loadRazorpaySdk() {
  if (razorpaySdkPromise) return razorpaySdkPromise;
  razorpaySdkPromise = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve(window.Razorpay);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
    document.head.appendChild(s);
  });
  return razorpaySdkPromise;
}

export default function BuyTokensDialog({ open, onOpenChange }) {
  const { user, refreshTokens, updateTokens } = useAuth();
  const [packs, setPacks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null); // {tokens, balance, pack}
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/tokens/packs").then((r) => setPacks(r.data?.packs || [])).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) setTimeout(() => { setSelected(null); setLoading(false); }, 250);
  }, [open]);

  const onVerified = useCallback((verify, pack) => {
    if (verify?.data?.ok) {
      updateTokens?.(verify.data.balance);
      refreshTokens?.();
      setSuccess({ tokens: verify.data.tokens_credited, balance: verify.data.balance, pack });
      onOpenChange(false);
    } else {
      toast.error("Couldn't confirm payment yet — refresh in a moment.");
    }
  }, [updateTokens, refreshTokens, onOpenChange]);

  const startCheckout = useCallback(async (pack) => {
    setSelected(pack);
    setLoading(true);
    try {
      // 1. Server creates the Razorpay order
      const { data } = await api.post("/payments/razorpay/create-order", { pack_key: pack.key }, { timeout: 30000 });
      if (!data?.order_id) throw new Error("Could not create payment order");

      // Demo mode — no real charge; verify the DEMO_ order directly.
      if (data.demo_mode) {
        setIsDemo(true);
        await new Promise((r) => setTimeout(r, 800));
        const verify = await api.post("/payments/razorpay/verify", { order_id: data.order_id }, { timeout: 30000 });
        onVerified(verify, pack);
        setLoading(false);
        return;
      }

      // 2. Load Razorpay Checkout + open
      const Razorpay = await loadRazorpaySdk();
      if (!Razorpay) throw new Error("Razorpay didn't load");
      await new Promise((resolve) => {
        const rzp = new Razorpay({
          key: data.key_id,
          amount: data.amount,
          currency: data.currency || "INR",
          order_id: data.order_id,
          name: data.name || "Formanti",
          description: data.description || `${pack.tokens} tokens`,
          prefill: { email: data.prefill_email || "", contact: data.prefill_contact || "" },
          theme: { color: "#bef264" },
          handler: async (resp) => {
            try {
              // 3. Server-side signature verification — never trust the client
              const verify = await api.post("/payments/razorpay/verify", {
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              }, { timeout: 30000 });
              onVerified(verify, pack);
            } catch (e) {
              toast.error(e?.response?.data?.detail || "Couldn't confirm payment — refresh in a moment.");
            } finally {
              resolve();
            }
          },
          modal: { ondismiss: () => { toast.error("Payment cancelled"); resolve(); } },
        });
        rzp.on("payment.failed", (r) => toast.error(r?.error?.description || "Payment failed"));
        rzp.open();
      });
    } catch (err) {
      console.error("Checkout failed:", err);
      toast.error(err?.response?.data?.detail || err.message || "Payment failed");
    }
    setLoading(false);
  }, [onVerified]);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-lg">
        <>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Coins className="w-5 h-5 text-purple-400" /> Buy Formanti tokens
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Pick a pack — UPI, cards, netbanking. Tokens never expire.
            </DialogDescription>
          </DialogHeader>

          {isDemo && (
            <div className="bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2 text-[11px] text-amber-300">
              Demo mode — no real charge. Tokens are credited so you can test the flow.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-2">
            {packs.map((p) => {
              const perToken = (p.price_inr / p.tokens) * 100;
              const isSelected = selected?.key === p.key;
              return (
                <button
                  key={p.key}
                  disabled={loading}
                  onClick={() => startCheckout(p)}
                  className={`relative rounded-xl border p-4 text-center transition-all ${
                    p.highlight ? "border-lime-400/40 bg-lime-400/5" : "border-zinc-800 bg-zinc-800/40"
                  } ${isSelected && loading ? "ring-2 ring-purple-400" : "hover:border-purple-400/40 hover:bg-purple-400/5"} ${
                    loading && !isSelected ? "opacity-40" : ""
                  }`}
                >
                  {p.highlight && (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-lime-400 text-black text-[9px] px-2">BEST VALUE</Badge>
                  )}
                  <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">{p.label}</p>
                  <p className="font-heading font-black text-2xl text-white mt-1">{p.tokens.toLocaleString("en-IN")}</p>
                  <p className="text-[10px] text-zinc-500 mb-2">tokens</p>
                  <p className="text-base font-bold text-purple-300">₹{p.price_inr}</p>
                  <p className="text-[9px] text-zinc-600 mt-0.5">~{perToken.toFixed(1)}p / token</p>
                  {isSelected && loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 rounded-xl">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                    </div>
                  )}
                </button>
              );
            })}
            {!packs.length && (
              <p className="col-span-full text-zinc-600 text-xs text-center py-6">Loading packs…</p>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-2">
            <ShieldCheck className="w-3 h-3 text-lime-400" />
            <span>Payments processed by Razorpay · India · UPI / cards / netbanking</span>
          </div>
        </>
      </DialogContent>
    </Dialog>

    <PaymentSuccessModal
      open={!!success}
      onClose={() => setSuccess(null)}
      tokensCredited={success?.tokens}
      newBalance={success?.balance}
      packLabel={success?.pack?.label ? `${success.pack.label} pack` : null}
      amountInr={success?.pack?.price_inr}
    />
    </>
  );
}
