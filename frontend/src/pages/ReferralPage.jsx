/**
 * ReferralPage — owner's referral code, share buttons, list of who you've
 * referred + earnings. Anchor for the viral loop.
 *
 * Data source: GET /tokens/balance returns referral_code + transactions.
 * For "who I've referred", we filter transactions where kind == referral_credit
 * and role == referrer.
 */
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Users, UserPlus, Copy, Share2, Sparkles, Loader2, MessageCircle, Gift,
} from "lucide-react";
import { toast } from "sonner";
import { swrGet } from "@/lib/cachedFetch";
import SEO from "@/components/SEO";

export default function ReferralPage() {
  const { user, referralCode } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = "Refer & Earn | AthlyticAI"; }, []);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    const { cached, fresh } = swrGet("/tokens/balance");
    if (cached) { setData(cached); setLoading(false); }
    fresh.then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [user?.id]);

  const code = data?.referral_code || referralCode;
  const link = code ? `${window.location.origin}/?ref=${encodeURIComponent(code)}` : "";

  // Referrals where this user is the referrer (you sent the invite)
  const myReferrals = useMemo(() => {
    return (data?.transactions || []).filter(
      (t) => t.kind === "referral_credit" && t?.metadata?.role === "referrer",
    );
  }, [data]);

  const totalEarned = myReferrals.reduce((s, t) => s + (t.delta || 0), 0);

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm text-center">
          <UserPlus className="w-10 h-10 text-lime-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Sign in to start referring</h2>
          <p className="text-zinc-400 text-sm mb-4">Earn tokens for every friend who joins and runs their first analysis.</p>
          <Button onClick={() => navigate("/auth")} className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    toast.success("Link copied — share it!");
  };

  const shareWhatsApp = () => {
    const text =
      `🏸 Try AthlyticAI — AI coach for your game.\n\n` +
      `Get 500 free tokens (300 signup + 200 referral bonus) when you sign up via my link:\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const shareNative = () => {
    if (navigator.share) {
      navigator.share({
        title: "AthlyticAI",
        text: "AI coach for your game. Get 500 free tokens with my link:",
        url: link,
      }).catch(() => {});
    } else copyLink();
  };

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8">
      <SEO title="Refer & Earn · AthlyticAI" description="Invite friends and earn AthlyticAI tokens." />
      <div className="container mx-auto px-4 max-w-3xl">

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-gradient-to-br from-lime-500/20 via-zinc-900 to-zinc-950 border border-lime-400/30 rounded-3xl p-6 sm:p-8 mb-6">
          <div className="absolute -right-6 -bottom-6 text-[140px] opacity-10 select-none">🎁</div>
          <div className="flex items-center gap-2 mb-2">
            <Gift className="w-5 h-5 text-lime-400" />
            <p className="text-[11px] uppercase tracking-wider text-lime-300/80 font-bold">Refer & Earn</p>
          </div>
          <h1 className="font-heading font-black text-3xl sm:text-4xl text-white uppercase tracking-tight mb-2">
            Both of you get 200 tokens
          </h1>
          <p className="text-zinc-300 text-sm max-w-md">
            Share your link. When a friend signs up and runs their first analysis,
            <span className="text-lime-300 font-medium"> they get 200 bonus tokens</span> on top of the 300 signup grant —
            and <span className="text-lime-300 font-medium">you get 200 too</span>.
          </p>
        </motion.div>

        {/* Code + share */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Your referral link</p>
          {loading && !code ? (
            <p className="text-zinc-600 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
          ) : (
            <>
              <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                <code className="text-xs sm:text-sm text-zinc-200 font-mono truncate flex-1">{link}</code>
                <button onClick={copyLink} className="text-zinc-400 hover:text-lime-400 transition-colors shrink-0">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={shareWhatsApp}
                  className="bg-emerald-500 text-white hover:bg-emerald-600 font-bold rounded-full text-xs h-9">
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Share on WhatsApp
                </Button>
                <Button onClick={shareNative} variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-full text-xs h-9">
                  <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share…
                </Button>
                <Button onClick={copyLink} variant="ghost"
                  className="text-zinc-400 hover:text-lime-400 hover:bg-lime-400/5 rounded-full text-xs h-9">
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                </Button>
              </div>
              {code && (
                <p className="text-[10px] text-zinc-600 mt-2">
                  Or share just your code: <span className="font-mono text-zinc-400">{code}</span>
                </p>
              )}
            </>
          )}
        </motion.div>

        {/* Stats + history */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold flex items-center gap-1.5">
              <Users className="w-3 h-3 text-lime-400" /> Your referrals
            </p>
            <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-[10px]">
              <Sparkles className="w-2.5 h-2.5 mr-1" /> Earned: {totalEarned} tokens
            </Badge>
          </div>
          {loading ? (
            <p className="text-zinc-600 text-xs text-center py-6 flex items-center justify-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </p>
          ) : myReferrals.length === 0 ? (
            <div className="text-center py-8">
              <UserPlus className="w-9 h-9 text-zinc-700 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-zinc-300 text-sm font-medium mb-1">No referrals yet</p>
              <p className="text-zinc-500 text-xs">Share your link on WhatsApp to start earning.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {myReferrals.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                  <div className="w-9 h-9 rounded-lg bg-lime-400/10 flex items-center justify-center shrink-0">
                    <UserPlus className="w-4 h-4 text-lime-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">Friend signed up + analyzed</p>
                    <p className="text-[10px] text-zinc-500">
                      {new Date(t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <p className="text-sm font-bold font-mono text-lime-400 shrink-0">+{t.delta}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
