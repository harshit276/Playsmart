import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Sparkles, Zap, Trophy, Crown, ArrowRight, Coins } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import api from "@/lib/api";
import SEO from "@/components/SEO";


const PLAN_ICON = { free: Sparkles, starter: Zap, pro: Trophy, elite: Crown };
const PLAN_TONE = {
  free: { border: "border-zinc-800", bg: "bg-zinc-900/60", accent: "text-zinc-300" },
  starter: { border: "border-sky-400/30", bg: "bg-sky-400/5", accent: "text-sky-300" },
  pro: { border: "border-lime-400/50", bg: "bg-lime-400/10", accent: "text-lime-400" },
  elite: { border: "border-amber-400/40", bg: "bg-amber-400/5", accent: "text-amber-300" },
};


export default function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [packs, setPacks] = useState([]);
  const [costs, setCosts] = useState({});
  const [showSubs, setShowSubs] = useState(false);
  const [billing, setBilling] = useState("monthly");
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
        setCosts(data?.costs || {});
        setShowSubs(!!data?.show_subscriptions);
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
    if (!user) { navigate("/auth"); return; }
    setActivatingKey(plan.key);
    try {
      const amount = billing === "annual" ? plan.annual_price_inr : plan.price_inr;
      await api.post("/payments/create-order", {
        amount_inr: amount,
        purpose: `subscription_${plan.key}_${billing}`,
        metadata: { plan_key: plan.key, billing },
      }, { timeout: 15000 });
      navigate("/wallet?subscribe=" + plan.key);
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

  const standardCost = costs.keyframes || costs.video || 100;
  const premiumCost = costs.premium || 250;
  const flashRupees = Math.round(standardCost * 0.30);   // 100 tokens × ₹0.30
  const premiumRupees = Math.round(premiumCost * 0.30);

  return (
    <div className="min-h-screen bg-zinc-950 py-8 sm:py-12">
      <SEO
        title="Pricing - AI Video Analysis for Badminton, Tennis, Cricket"
        description="Pay-as-you-go AI sports video analysis. ₹30 per analysis with bulk discount packs. No subscription required."
        keywords="sports video analysis pricing, badminton coaching app, AI cricket analysis cost India"
        url="https://athlyticai.com/pricing"
      />
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="font-heading font-black text-4xl sm:text-5xl text-white tracking-tight mb-2 uppercase">
            Simple, transparent pricing
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto">
            ₹30 per analysis. Buy tokens, use them whenever — they don't expire.
            Start with 3 free on signup.
          </p>
        </motion.div>

        {/* Per-analysis cost summary */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-zinc-800/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-sky-400" />
                <span className="text-sm font-semibold text-white">Standard</span>
                <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[10px] ml-auto">{standardCost} tokens</Badge>
              </div>
              <p className="text-3xl font-heading font-black text-white">₹{flashRupees}<span className="text-xs text-zinc-500 ml-1">/ analysis</span></p>
              <p className="text-[11px] text-zinc-500 mt-1">Gemini Flash — fast (~6s), good for most clips</p>
            </div>
            <div className="bg-amber-400/5 border border-amber-400/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">Premium</span>
                <Badge className="bg-amber-400/15 text-amber-300 border-amber-400/30 text-[10px] ml-auto">{premiumCost} tokens</Badge>
              </div>
              <p className="text-3xl font-heading font-black text-white">₹{premiumRupees}<span className="text-xs text-zinc-500 ml-1">/ analysis</span></p>
              <p className="text-[11px] text-zinc-500 mt-1">Gemini 2.5 Pro — catches every shot on tough clips</p>
            </div>
          </div>
        </motion.div>

        {/* Token packs — primary CTA */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="mb-10">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-lime-400 font-bold">Token packs</p>
              <h2 className="font-heading font-bold text-xl text-white">Buy tokens — bigger packs = bigger discount</h2>
            </div>
            <p className="text-[11px] text-zinc-500">Tokens never expire</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {packs.map((pack) => {
              const isHighlight = pack.highlight;
              const perAnalysis = pack.tokens > 0
                ? Math.round((pack.price_inr / pack.analyses_flash) || 0)
                : 0;
              return (
                <Link
                  key={pack.key}
                  to={user ? `/wallet?pack=${pack.key}` : "/auth"}
                  className={`block bg-zinc-900/80 border-2 rounded-2xl p-4 transition-all hover:scale-[1.02] ${
                    isHighlight
                      ? "border-lime-400/60 shadow-lg shadow-lime-400/10"
                      : "border-zinc-800 hover:border-lime-400/40"
                  }`}
                >
                  {isHighlight && (
                    <div className="bg-lime-400 text-black text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mb-2">
                      Best Value
                    </div>
                  )}
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">{pack.label}</p>
                  <p className="text-3xl font-heading font-black text-white mb-0.5">₹{pack.price_inr}</p>
                  <p className="text-xs text-lime-400 font-semibold flex items-center gap-1 mb-2">
                    <Coins className="w-3 h-3" /> {pack.tokens.toLocaleString()} tokens
                  </p>
                  <div className="space-y-0.5 text-[11px] text-zinc-500">
                    <p>≈ {pack.analyses_flash} Standard analyses</p>
                    <p>≈ {pack.analyses_premium} Premium analyses</p>
                  </div>
                  {pack.per_token_inr && pack.per_token_inr < 0.30 && (
                    <p className="mt-2 text-[10px] text-lime-400/80">
                      {Math.round((1 - pack.per_token_inr / 0.30) * 100)}% off vs Trial
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </motion.div>

        {/* Subscriptions — gated by SHOW_SUBSCRIPTIONS flag on backend */}
        {showSubs && plans.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-10">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-sky-400 font-bold">Or subscribe</p>
                <h2 className="font-heading font-bold text-xl text-white">Monthly plans — analyses + extras</h2>
              </div>
              <Tabs value={billing} onValueChange={setBilling} className="w-fit">
                <TabsList className="bg-zinc-900 border border-zinc-800">
                  <TabsTrigger value="monthly" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black px-4">Monthly</TabsTrigger>
                  <TabsTrigger value="annual" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black px-4">Annual <Badge className="ml-2 bg-amber-400/20 text-amber-300 border-amber-400/30 text-[9px]">2mo free</Badge></TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {plans.map((plan) => {
                const Icon = PLAN_ICON[plan.key] || Sparkles;
                const tone = PLAN_TONE[plan.key] || PLAN_TONE.free;
                const monthly = plan.price_inr;
                const annual = plan.annual_price_inr || (monthly * 12);
                const displayPrice = billing === "annual" ? Math.round(annual / 12) : monthly;
                const periodLabel = billing === "annual" ? "/mo billed yearly" : "/month";
                const isHighlight = plan.highlight;
                return (
                  <div key={plan.key}
                    className={`relative rounded-2xl border-2 p-4 flex flex-col ${tone.border} ${tone.bg} ${
                      isHighlight ? "ring-2 ring-lime-400/40" : ""
                    }`}>
                    {isHighlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-lime-400 text-black text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                        Most Popular
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-4 h-4 ${tone.accent}`} />
                      <h3 className="font-heading font-bold text-lg text-white uppercase tracking-tight">{plan.name}</h3>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">{plan.tagline}</p>
                    <div className="mb-3">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-heading font-black text-white">₹{displayPrice}</span>
                        {monthly > 0 && <span className="text-xs text-zinc-500">{periodLabel}</span>}
                      </div>
                      {monthly === 0 && <p className="text-xs text-zinc-500">Free forever</p>}
                    </div>
                    <Button onClick={() => handleSubscribe(plan)} disabled={activatingKey === plan.key}
                      className={`w-full mb-3 text-xs ${isHighlight ? "bg-lime-400 hover:bg-lime-500 text-black font-bold" : "bg-zinc-800 hover:bg-zinc-700 text-white"}`}>
                      {activatingKey === plan.key ? "..." : plan.key === "free" ? (user ? "Open analyzer" : "Sign up free") : "Subscribe"}
                    </Button>
                    <div className="flex-1 space-y-1.5">
                      {(plan.features || []).slice(0, 4).map((f, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-300">
                          <Check className={`w-3 h-3 mt-0.5 shrink-0 ${tone.accent}`} />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Free trial banner */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          className="bg-gradient-to-br from-lime-400/10 to-zinc-900 border border-lime-400/20 rounded-2xl p-6 text-center mb-10">
          <h2 className="font-heading font-black text-2xl text-white mb-2 uppercase tracking-tight">
            3 free analyses on signup
          </h2>
          <p className="text-zinc-400 text-sm mb-4">
            300 tokens credited automatically — try the AI Coach on your videos before paying a rupee.
          </p>
          <Link to={user ? "/analyze" : "/auth"}>
            <Button className="bg-lime-400 hover:bg-lime-500 text-black font-bold px-6">
              {user ? "Open analyzer" : "Sign up — 3 free analyses"} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </motion.div>

        {/* FAQ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              q: "Do tokens expire?",
              a: "No. Buy them once, use them whenever — there's no time limit.",
            },
            {
              q: "What's the difference between Standard and Premium?",
              a: "Standard (Gemini Flash) is fast and works great on clear, well-lit clips. Premium (Gemini 2.5 Pro) is slower but catches every shot on noisy phone-recorded footage. Try Standard first — only upgrade to Premium if your video is hard to read.",
            },
            {
              q: "What if my analysis fails?",
              a: "Tokens are charged only on successful analyses. If the AI Coach can't read the video, no tokens are deducted.",
            },
            {
              q: "Refund policy?",
              a: "Unused tokens are refundable within 7 days of purchase. Used tokens are non-refundable.",
            },
            {
              q: "Do I need a subscription?",
              a: "No. Buy tokens once, use them whenever. We may add monthly subscriptions later for heavy users.",
            },
            {
              q: "Are there team / academy plans?",
              a: "Bulk discounts kick in at the Power Pack tier. For 5+ coaches or 50+ students, email support@athlyticai.com for custom pricing.",
            },
          ].map((item, i) => (
            <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
              <p className="text-sm font-semibold text-white mb-1.5">{item.q}</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
