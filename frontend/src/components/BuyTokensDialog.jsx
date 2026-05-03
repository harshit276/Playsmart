/**
 * BuyTokensDialog — pack picker → Cashfree drop-in checkout.
 *
 * Flow:
 *   1. User picks a pack.
 *   2. POST /payments/create-order returns {payment_session_id, app_id, ...}.
 *   3. We dynamically load Cashfree's JS SDK (https://sdk.cashfree.com/js/v3/cashfree.js).
 *   4. SDK opens drop-in checkout. On success, server is the source of truth —
 *      we POST /payments/verify which re-fetches the order from Cashfree
 *      and credits tokens only if order_status === "PAID".
 *   5. Webhook is the backstop in case the success callback is dropped.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Loader2, ShieldCheck, Check } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/App";

let cashfreeSdkPromise = null;
function loadCashfreeSdk() {
  if (cashfreeSdkPromise) return cashfreeSdkPromise;
  cashfreeSdkPromise = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Cashfree) {
      resolve(window.Cashfree);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.async = true;
    s.onload = () => resolve(window.Cashfree);
    s.onerror = () => reject(new Error("Failed to load Cashfree SDK"));
    document.head.appendChild(s);
  });
  return cashfreeSdkPromise;
}

export default function BuyTokensDialog({ open, onOpenChange }) {
  const { refreshTokens } = useAuth();
  const [packs, setPacks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null); // {tokens, balance, demo}
  const [isDemo, setIsDemo] = useState(false); // detected after first create-order

  useEffect(() => {
    if (!open) return;
    api.get("/tokens/packs")
      .then((r) => setPacks(r.data?.packs || []))
      .catch(() => {});
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => { setSelected(null); setSuccess(null); setLoading(false); }, 250);
    }
  }, [open]);

  const startCheckout = useCallback(async (pack) => {
    setSelected(pack);
    setLoading(true);
    try {
      // 1. Server creates the order
      const { data } = await api.post("/payments/create-order", { pack_key: pack.key }, { timeout: 12000 });
      if (!data?.order_id) throw new Error("Could not create payment order");
      if (data.demo_mode) setIsDemo(true);

      // Demo mode — skip Cashfree SDK entirely. Brief processing
      // simulation, then go straight to verify (which credits tokens).
      if (data.demo_mode) {
        await new Promise((r) => setTimeout(r, 900));
      } else {
        // 2. Load + init Cashfree SDK
        const Cashfree = await loadCashfreeSdk();
        if (!Cashfree) throw new Error("Cashfree SDK didn't load");
        const cashfree = Cashfree({ mode: data.env === "PRODUCTION" ? "production" : "sandbox" });

        // 3. Open drop-in checkout
        const result = await cashfree.checkout({
          paymentSessionId: data.payment_session_id,
          redirectTarget: "_modal",
        });

        // Cashfree returns { error } or { paymentDetails: {...} }
        if (result?.error) {
          if (result.error.code === "ORDER_PAYMENT_FAILED" || result.error.code === "USER_DROPPED") {
            toast.error("Payment cancelled");
            setLoading(false);
            return;
          }
          throw new Error(result.error.message || "Payment failed");
        }
      }

      // 4. Server-side verification — never trust client
      const verify = await api.post("/payments/verify", { order_id: data.order_id }, { timeout: 12000 });
      if (verify.data?.ok) {
        setSuccess({ tokens: verify.data.tokens_credited, balance: verify.data.balance });
        refreshTokens();
        toast.success(`+${verify.data.tokens_credited} tokens added!`);
      } else {
        toast.error("Couldn't confirm payment yet — refresh in a moment.");
      }
    } catch (err) {
      console.error("Checkout failed:", err);
      toast.error(err?.response?.data?.detail || err.message || "Payment failed");
    }
    setLoading(false);
  }, [refreshTokens]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-lg">
        {success ? (
          <div className="py-4 text-center">
            <div className="w-14 h-14 rounded-full bg-lime-400/15 flex items-center justify-center mx-auto mb-3">
              <Check className="w-7 h-7 text-lime-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-1">Tokens added!</h3>
            <p className="text-zinc-400 text-sm mb-1">
              <span className="text-lime-400 font-bold">+{success.tokens?.toLocaleString("en-IN")}</span> tokens credited
            </p>
            <p className="text-zinc-500 text-xs mb-4">New balance: {success.balance?.toLocaleString("en-IN")}</p>
            <Button onClick={() => onOpenChange(false)}
              className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-6">
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-purple-400" /> Buy AthlyticAI tokens
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
                    <p className="font-heading font-black text-2xl text-white mt-1">
                      {p.tokens.toLocaleString("en-IN")}
                    </p>
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
              <span>Payments processed by Cashfree · India · GST-compliant</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
