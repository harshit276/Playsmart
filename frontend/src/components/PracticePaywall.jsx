import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { getPracticePlans, fmtDate, rememberAfterLogin } from "@/lib/practiceAccess";
import { buyPass } from "@/lib/razorpayPass";

const money = (p) => (p.currency === "USD" ? "$" : "₹") + p.price;
const perDay = (p) => (p.currency === "USD" ? "$" + p.per_day.toFixed(2) : "₹" + Number(p.per_day.toFixed(p.per_day < 10 ? 1 : 0)));

const WHAT_YOU_GET = [
  "Practice every shot as often as you like",
  "A voice coach that remembers your session, with a drill for what you keep missing",
  "Runs on your phone: your video isn't uploaded",
];

/**
 * The plan cards, one tap to pay. Used in the paywall dialog and on the pricing page.
 * `onPaid(access)` runs once the pass is open.
 */
export function PracticePlans({ source, onPaid, className = "" }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { getPracticePlans().then((d) => setPlans(d.plans || [])).catch(() => setError(true)); }, []);

  const buy = async (plan) => {
    if (!isAuthenticated) {
      rememberAfterLogin(`${window.location.pathname}${window.location.search}`);
      toast("Create a free account first, then pick your pass");
      navigate("/auth");
      return;
    }
    setBusy(plan.key);
    track("practice_checkout_started", { plan: plan.key, price: plan.price, currency: plan.currency, source });
    const r = await buyPass(plan);
    setBusy(null);
    if (r.status === "paid") {
      track("practice_pass_purchased", { plan: plan.key, price: plan.price, currency: plan.currency, source });
      toast.success(r.access?.pass_until ? `You're in. Practice is open until ${fmtDate(r.access.pass_until)}.` : "You're in. Practice is open.");
      onPaid?.(r.access);
    } else if (r.status === "cancelled") {
      track("practice_checkout_cancelled", { plan: plan.key, source });
    } else if (r.status === "unconfirmed") {
      track("practice_checkout_unconfirmed", { plan: plan.key, source });
      toast.error(`Your payment went through (ref ${r.ref}) but we couldn't open your pass yet. It will open on its own within a few minutes; reload then. If it doesn't, contact support with that ref.`, { duration: 20000 });
    } else {
      track("practice_checkout_failed", { plan: plan.key, source });
      toast.error(r.message || "Payment failed");
    }
  };

  if (error) return <p className={`text-sm text-zinc-400 ${className}`}>Couldn't load the plans. Check your connection and try again.</p>;
  if (!plans) return <div className={`flex justify-center py-8 ${className}`}><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>;
  const cheapest = Math.min(...plans.map((p) => p.per_day));
  return (
    <div className={`grid gap-3 sm:grid-cols-3 ${className}`}>
      {plans.map((p) => {
        const best = p.per_day === cheapest && plans.length > 1;
        return (
          <button key={p.key} type="button" onClick={() => buy(p)} disabled={!!busy}
            className={`relative text-left rounded-2xl border px-4 py-3 sm:p-4 min-h-[76px] sm:min-h-[112px] flex items-center justify-between gap-3 sm:block transition-colors disabled:opacity-60 ${p.highlight ? "border-lime-400/60 bg-lime-400/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"}`}>
            {(p.highlight || best) && (
              <span className="absolute -top-2.5 left-3 text-[10px] font-black uppercase tracking-wide bg-lime-400 text-black rounded px-1.5 py-0.5">{p.highlight ? "Most popular" : "Best value"}</span>
            )}
            <span className="block min-w-0">
              <span className="block text-[13px] font-semibold text-zinc-300">{p.label} <span className="font-normal text-zinc-500">· about {perDay(p)} a day</span></span>
              <span className="block font-heading font-black text-3xl text-white mt-0.5">{busy === p.key ? <Loader2 className="w-6 h-6 animate-spin" /> : money(p)}</span>
            </span>
            <span className="shrink-0 sm:block sm:mt-2 rounded-full bg-lime-400 text-black sm:bg-transparent sm:text-lime-300 px-4 py-2 sm:p-0 text-[14px] sm:text-[13px] font-bold">Pay {money(p)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "Free for 10 minutes, then ₹200 a week, ₹400 a month or ₹3,500 a year": the same prices as the cards, in a sentence. */
export function PracticePriceLine({ className = "" }) {
  const [d, setD] = useState(null);
  useEffect(() => { getPracticePlans().then(setD).catch(() => {}); }, []);
  if (!d) return null;
  const parts = d.plans.map((p) => `${money(p)} for ${p.label}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}` : parts[0];
  return <p className={className}>Free for {Math.round(d.trial_seconds / 60)} minutes with a free account. Then {list}: one payment, no auto-renewal.</p>;
}

/** Shown when the free minutes (or a pass) run out. */
export default function PracticePaywall({ open, onOpenChange, reason = "trial_over", onPaid, source = "practice" }) {
  useEffect(() => { if (open) track("practice_paywall_viewed", { reason, source }); }, [open, reason, source]);
  const title = reason === "pass_expired" ? "Your practice pass has ended" : reason === "trial_ending" ? "Keep the coach going" : "Your 10 free minutes are used";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="z-[79]" className="z-[80] bg-zinc-900 border-zinc-800 sm:max-w-xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">{title}</DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            Pick a pass to keep practising. UPI, cards and netbanking. One payment, no auto-renewal.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {WHAT_YOU_GET.map((t) => (
            <li key={t} className="flex gap-2 text-[14px] text-zinc-200 leading-snug"><Check className="w-4 h-4 shrink-0 mt-0.5 text-lime-400" strokeWidth={3} />{t}</li>
          ))}
        </ul>
        <PracticePlans source={source} onPaid={(a) => { onOpenChange(false); onPaid?.(a); }} className="mt-2" />
        <p className="flex gap-2 text-[12px] text-zinc-500 leading-snug">
          <ShieldCheck className="w-4 h-4 shrink-0 text-zinc-500" />
          <span>A pass opens practice for its length; buy again while it runs and the days are added on. Payments are processed by Razorpay. See the <Link to="/refund" className="underline">refund policy</Link>.</span>
        </p>
      </DialogContent>
    </Dialog>
  );
}
