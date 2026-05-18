import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Check, X, Sparkles, Zap, Trophy, Crown, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import api from "@/lib/api";
import SEO from "@/components/SEO";


const PLAN_ICON = {
  free: Sparkles,
  starter: Zap,
  pro: Trophy,
  elite: Crown,
};

const PLAN_TONE = {
  free: { border: "border-zinc-800", bg: "bg-zinc-900/60", accent: "text-zinc-300" },
  starter: { border: "border-sky-400/30", bg: "bg-sky-400/5", accent: "text-sky-300" },
  pro: { border: "border-lime-400/50", bg: "bg-lime-400/10", accent: "text-lime-400" },
  elite: { border: "border-amber-400/40", bg: "bg-amber-400/5", accent: "text-amber-300" },
};


export default function PricingPage() {
  const { user, tokens } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [packs, setPacks] = useState([]);
  const [billing, setBilling] = useState("monthly");  // "monthly" | "annual"
  const [loading, setLoading] = useState(true);
  const [activatingKey, setActivatingKey] = useState(null);

  useEffect(() => { document.title = "Pricing | AthlyticAI"; }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/plans", { timeout: 10000 });
        if (cancelled) return;
        setPlans(data?.plans || []);
        setPacks(data?.packs || []);
      } catch (e) {
        if (!cancelled) toast.error("Couldn't load plans — try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubscribe = async (plan) => {
    if (plan.key === "free") {
      if (!user) { navigate("/auth"); return; }
      navigate("/analyze");
      return;
    }
    if (!user) {
      toast.info("Sign in to subscribe — your free analyses are waiting.");
      navigate("/auth");
      return;
    }
    setActivatingKey(plan.key);
    try {
      const amount = billing === "annual" ? plan.annual_price_inr : plan.price_inr;
      const { data } = await api.post("/payments/create-order", {
        amount_inr: amount,
        purpose: `subscription_${plan.key}_${billing}`,
        metadata: { plan_key: plan.key, billing },
      }, { timeout: 15000 });
      if (data?.order_id) {
        toast.success("Razorpay flow would open here.");
        // TODO: integrate Razorpay checkout. The /payments/create-order
        // returns the order_id; the existing wallet flow knows how to
        // open the Razorpay modal — reuse that here.
        navigate("/wallet?subscribe=" + plan.key);
      } else {
        throw new Error(data?.detail || "Couldn't create order");
      }
    } catch (e) {
      toast.error(`Subscription failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setActivatingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 py-8 sm:py-12">
      <SEO
        title="Pricing - AI Video Analysis Plans for Badminton, Tennis, Cricket"
        description="Affordable subscription plans for AI-powered sports video analysis. Free trial, monthly subscriptions starting ₹199, and one-off token packs. Cancel anytime."
        keywords="sports video analysis pricing, badminton coaching app subscription, AI cricket analysis cost"
        url="https://athlyticai.com/pricing"
      />
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="font-heading font-black text-4xl sm:text-5xl text-white tracking-tight mb-2 uppercase">
            Coach yourself — at any level
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto">
            Try 3 analyses free. Subscribe when you're ready to track progress.
            Cancel anytime — no questions asked.
          </p>
        </motion.div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-8">
          <Tabs value={billing} onValueChange={setBilling} className="w-fit">
            <TabsList className="bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="monthly" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black px-6">
                Monthly
              </TabsTrigger>
              <TabsTrigger value="annual" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black px-6">
                Annual <Badge className="ml-2 bg-amber-400/20 text-amber-300 border-amber-400/30 text-[9px]">2 months free</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Subscription tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {plans.map((plan) => {
            const Icon = PLAN_ICON[plan.key] || Sparkles;
            const tone = PLAN_TONE[plan.key] || PLAN_TONE.free;
            const monthly = plan.price_inr;
            const annual = plan.annual_price_inr || (monthly * 12);
            const displayPrice = billing === "annual" ? Math.round(annual / 12) : monthly;
            const periodLabel = billing === "annual" ? "/mo billed yearly" : "/month";
            const isHighlight = plan.highlight;
            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * plans.indexOf(plan) }}
                className={`relative rounded-2xl border-2 p-5 flex flex-col ${tone.border} ${tone.bg} ${
                  isHighlight ? "ring-2 ring-lime-400/40 shadow-lg shadow-lime-400/10" : ""
                }`}
              >
                {isHighlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-lime-400 text-black text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-5 h-5 ${tone.accent}`} />
                  <h3 className="font-heading font-bold text-xl text-white uppercase tracking-tight">{plan.name}</h3>
                </div>
                <p className="text-xs text-zinc-500 mb-4">{plan.tagline}</p>
                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-heading font-black text-white">₹{displayPrice}</span>
                    {monthly > 0 && (
                      <span className="text-xs text-zinc-500">{periodLabel}</span>
                    )}
                  </div>
                  {billing === "annual" && monthly > 0 && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">₹{annual} per year</p>
                  )}
                  {monthly === 0 && <p className="text-xs text-zinc-500">Free forever</p>}
                </div>
                <Button
                  onClick={() => handleSubscribe(plan)}
                  disabled={activatingKey === plan.key}
                  className={`w-full mb-4 ${
                    isHighlight
                      ? "bg-lime-400 hover:bg-lime-500 text-black font-bold"
                      : plan.key === "free"
                        ? "bg-zinc-800 hover:bg-zinc-700 text-white"
                        : "bg-zinc-800 hover:bg-zinc-700 text-white"
                  }`}
                >
                  {activatingKey === plan.key
                    ? "Loading..."
                    : plan.key === "free"
                      ? user ? "Open analyzer" : "Sign up free"
                      : `Subscribe ₹${displayPrice}${periodLabel}`}
                </Button>
                <div className="flex-1 space-y-2 mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Includes</p>
                  {(plan.features || []).map((f, i) => (
                    <div key={`f-${i}`} className="flex items-start gap-2 text-xs text-zinc-300">
                      <Check className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${tone.accent}`} />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
                {plan.limits?.length > 0 && (
                  <div className="space-y-1 pt-3 border-t border-zinc-800/50">
                    {plan.limits.map((l, i) => (
                      <div key={`l-${i}`} className="flex items-start gap-2 text-[11px] text-zinc-500">
                        <X className="w-3 h-3 mt-0.5 shrink-0 text-zinc-700" />
                        <span>{l}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Or one-off packs */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 mb-10">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">No subscription? Buy tokens</p>
              <h3 className="font-heading font-bold text-lg text-white">One-off token packs</h3>
            </div>
            <p className="text-[11px] text-zinc-500">100 tokens = 1 Standard analysis · 250 = 1 Premium</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {packs.map((pack) => (
              <Link
                key={pack.key}
                to={`/wallet?pack=${pack.key}`}
                className={`block bg-zinc-900 border ${pack.highlight ? "border-lime-400/40" : "border-zinc-800"} hover:border-lime-400/30 rounded-xl p-3 transition-colors`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-white">{pack.label}</span>
                  {pack.highlight && <Badge className="bg-lime-400/15 text-lime-400 border-lime-400/30 text-[9px]">Best Value</Badge>}
                </div>
                <p className="text-2xl font-heading font-black text-white">₹{pack.price_inr}</p>
                <p className="text-[10px] text-zinc-500 mt-1">
                  {pack.tokens.toLocaleString()} tokens
                </p>
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  ≈ {pack.analyses_flash} Standard / {pack.analyses_premium} Premium
                </p>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* FAQ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {[
            {
              q: "Can I cancel anytime?",
              a: "Yes. Cancel from your account page — you keep access until the end of the billing period.",
            },
            {
              q: "What's the difference between Standard and Premium?",
              a: "Standard uses Gemini 2.5 Flash — fast and good for clear clips. Premium uses Gemini 2.5 Pro — slower (~10s) but catches every shot, even on noisy or distant footage.",
            },
            {
              q: "Do unused analyses roll over?",
              a: "Yes — up to 30 days. After that they expire so we keep the math honest.",
            },
            {
              q: "Can I switch plans mid-month?",
              a: "Anytime. Upgrades take effect immediately with prorated billing. Downgrades take effect at the next renewal.",
            },
            {
              q: "Refund policy?",
              a: "Full refund within 7 days of subscription if you've used 2 or fewer analyses. After that, we don't refund used months but you can cancel future renewals anytime.",
            },
            {
              q: "Are there team / academy plans?",
              a: "Elite includes bulk upload + branded reports. For 5+ coaches or 50+ students, email us at support@athlyticai.com for custom pricing.",
            },
          ].map((item, i) => (
            <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
              <p className="text-sm font-semibold text-white mb-1.5">{item.q}</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>

        {/* CTA footer */}
        <div className="text-center bg-gradient-to-br from-lime-400/10 to-zinc-900 border border-lime-400/20 rounded-2xl p-6">
          <h2 className="font-heading font-black text-2xl text-white mb-2 uppercase tracking-tight">
            Try it first — no card needed
          </h2>
          <p className="text-zinc-400 text-sm mb-4">
            Sign up gets you 300 tokens — 3 full analyses on us.
          </p>
          <Link to={user ? "/analyze" : "/auth"}>
            <Button className="bg-lime-400 hover:bg-lime-500 text-black font-bold px-6">
              {user ? "Open analyzer" : "Get started — 3 free analyses"} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
