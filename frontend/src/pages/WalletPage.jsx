/**
 * WalletPage — token balance, transaction history, earn-more shortcuts,
 * and (Phase 3) buy-pack grid. Read-only against /tokens/balance.
 *
 * Numbers (signup grant, per-action rewards) come from the server's
 * TOKEN_RULES so this page stays in sync with backend changes.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Sparkles, Users, Dumbbell, UserPlus, Camera, ArrowDownRight,
  ArrowUpRight, Lock, ShoppingCart, Coins, Loader2, Copy
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { swrGet } from "@/lib/cachedFetch";
import SEO from "@/components/SEO";

const KIND_LABEL = {
  signup_grant: "Signup grant",
  referral_credit: "Referral",
  host_game: "Hosted a game",
  training_day: "Training day complete",
  daily_login: "Daily login",
  analysis_spend: "Video analysis",
  purchase: "Token purchase",
  refund: "Refund",
  manual_adjustment: "Adjustment",
};

const KIND_ICON = {
  signup_grant: Sparkles,
  referral_credit: UserPlus,
  host_game: Users,
  training_day: Dumbbell,
  daily_login: Sparkles,
  analysis_spend: Camera,
  purchase: ShoppingCart,
};

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default function WalletPage() {
  const { user, tokens, referralCode } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = "Wallet | AthlyticAI"; }, []);

  useEffect(() => {
    if (!user?.id) return;
    const { cached, fresh } = swrGet("/tokens/balance");
    if (cached) { setData(cached); setLoading(false); }
    fresh.then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    api.get("/tokens/packs").then((r) => setPacks(r.data?.packs || [])).catch(() => {});
  }, [user?.id]);

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm text-center">
          <Coins className="w-10 h-10 text-purple-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Sign in to see your wallet</h2>
          <p className="text-zinc-400 text-sm mb-4">Track your AthlyticAI tokens — earn from referrals, hosting games, and training.</p>
          <Button onClick={() => navigate("/auth")} className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  const balance = data?.balance ?? tokens ?? 0;
  const transactions = data?.transactions || [];
  const rules = data?.rules || {};
  const code = data?.referral_code || referralCode;

  const copyReferralLink = () => {
    const url = `${window.location.origin}/?ref=${encodeURIComponent(code || "")}`;
    navigator.clipboard.writeText(url);
    toast.success("Referral link copied");
  };

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8">
      <SEO title="Wallet · AthlyticAI Tokens" description="Track your AthlyticAI token balance and earnings." />
      <div className="container mx-auto px-4 max-w-3xl">

        {/* Hero balance */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-gradient-to-br from-purple-500/15 via-zinc-900 to-zinc-950 border border-purple-400/30 rounded-3xl p-6 sm:p-8 mb-6">
          <div className="absolute -right-6 -bottom-6 text-[140px] opacity-10 select-none">🪙</div>
          <p className="text-[11px] uppercase tracking-wider text-purple-300/70 font-bold">AthlyticAI Tokens</p>
          <p className="font-heading font-black text-5xl sm:text-6xl text-white mt-1">
            {balance.toLocaleString("en-IN")}
          </p>
          <p className="text-zinc-400 text-sm mt-2">
            Spend <span className="text-white font-medium">100 tokens</span> per video analysis. Tokens never expire.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            <Button onClick={() => navigate("/analyze")}
              className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full">
              <Camera className="w-4 h-4 mr-1.5" /> Analyze a video
            </Button>
            <Button onClick={() => navigate("/referral")}
              variant="outline" className="border-purple-400/30 text-purple-200 hover:bg-purple-400/10 rounded-full">
              <UserPlus className="w-4 h-4 mr-1.5" /> Refer & earn
            </Button>
          </div>
        </motion.div>

        {/* Earn more */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 mb-6">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-lime-400" /> Earn more tokens
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <EarnAction
              icon={UserPlus} label="Refer a friend"
              detail={`+${rules.referral_credit || 200} when they finish their first analysis (you both get it)`}
              onClick={() => navigate("/referral")}
            />
            <EarnAction
              icon={Users} label="Host a community game"
              detail={`+${rules.host_game || 50} per game · up to 5/day`}
              onClick={() => navigate("/community?host=1")}
            />
            <EarnAction
              icon={Dumbbell} label="Complete a training day"
              detail={`+${rules.training_day || 20} per day · once daily`}
              onClick={() => navigate("/training")}
            />
            <EarnAction
              icon={Sparkles} label="Daily login bonus"
              detail={`+${rules.daily_login || 25} per day for the first 7 days`}
            />
          </div>
        </motion.div>

        {/* Buy packs (placeholder until Phase 3 wires Cashfree) */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold flex items-center gap-1.5">
              <ShoppingCart className="w-3 h-3 text-purple-400" /> Buy tokens
            </p>
            <Badge className="bg-zinc-800 text-zinc-400 text-[10px]">Coming soon · UPI / cards</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(packs.length ? packs : []).map((p) => (
              <div key={p.key} className={`relative rounded-xl border p-3 text-center transition-colors ${
                p.highlight
                  ? "border-lime-400/30 bg-lime-400/5"
                  : "border-zinc-800 bg-zinc-800/40"
              }`}>
                {p.highlight && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-lime-400 text-black text-[9px] px-2">BEST VALUE</Badge>
                )}
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">{p.label}</p>
                <p className="font-heading font-black text-xl text-white mt-1">{p.tokens.toLocaleString("en-IN")}</p>
                <p className="text-[10px] text-zinc-500">tokens</p>
                <p className="text-sm font-bold text-purple-300 mt-2">₹{p.price_inr}</p>
                <Button disabled size="sm"
                  className="mt-2 w-full bg-zinc-800 text-zinc-500 hover:bg-zinc-800 cursor-not-allowed text-[10px] h-7 rounded-full">
                  <Lock className="w-3 h-3 mr-1" /> Soon
                </Button>
              </div>
            ))}
            {!packs.length && (
              <p className="col-span-full text-zinc-600 text-xs text-center py-4">Loading packs…</p>
            )}
          </div>
        </motion.div>

        {/* Referral quick-share */}
        {code && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 mb-6 flex items-center gap-3 flex-wrap">
            <UserPlus className="w-5 h-5 text-lime-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-0.5">Your referral code</p>
              <p className="font-mono text-sm text-white truncate">{code}</p>
            </div>
            <Button size="sm" onClick={copyReferralLink}
              className="bg-lime-400/10 text-lime-400 hover:bg-lime-400/20 border border-lime-400/20 rounded-full text-xs h-8">
              <Copy className="w-3 h-3 mr-1" /> Copy link
            </Button>
          </motion.div>
        )}

        {/* Transaction history */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-3">Recent activity</p>
          {loading ? (
            <p className="text-zinc-600 text-xs text-center py-6 flex items-center justify-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </p>
          ) : transactions.length === 0 ? (
            <p className="text-zinc-600 text-xs text-center py-8">
              No transactions yet — earn your first tokens from a referral or by hosting a game.
            </p>
          ) : (
            <div className="space-y-1.5">
              {transactions.map((t) => {
                const Icon = KIND_ICON[t.kind] || Sparkles;
                const positive = t.delta > 0;
                return (
                  <div key={t.id} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                    <div className={`w-9 h-9 rounded-lg ${
                      positive ? "bg-lime-400/10" : "bg-amber-400/10"
                    } flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${positive ? "text-lime-400" : "text-amber-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{KIND_LABEL[t.kind] || t.kind}</p>
                      <p className="text-[10px] text-zinc-500">{fmtDate(t.created_at)}</p>
                    </div>
                    <p className={`text-sm font-bold font-mono shrink-0 ${
                      positive ? "text-lime-400" : "text-amber-400"
                    }`}>
                      {positive ? "+" : ""}{t.delta}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function EarnAction({ icon: Icon, label, detail, onClick }) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      className={`text-left flex items-start gap-3 p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 transition-colors ${
        onClick ? "hover:border-lime-400/30 hover:bg-zinc-800 cursor-pointer" : "cursor-default"
      }`}
    >
      <div className="w-8 h-8 rounded-lg bg-lime-400/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-lime-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{detail}</p>
      </div>
      {onClick && <ArrowUpRight className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />}
    </Component>
  );
}
