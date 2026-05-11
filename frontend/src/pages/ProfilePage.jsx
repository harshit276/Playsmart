/**
 * ProfilePage — settings + retake-quiz hub. Reuses the existing
 * AssessmentPage flow for actually updating preferences (no need to
 * duplicate the form here).
 */
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Sparkles, RefreshCw, Coins, LogOut, User, Trophy, ArrowRight,
} from "lucide-react";
import SEO from "@/components/SEO";

const SPORT_LABELS = {
  badminton: "Badminton", tennis: "Tennis", table_tennis: "Table Tennis",
  pickleball: "Pickleball", cricket: "Cricket", football: "Football", swimming: "Swimming",
};
const SPORT_EMOJI = {
  badminton: "🏸", tennis: "🎾", table_tennis: "🏓", pickleball: "⚡",
  cricket: "🏏", football: "⚽", swimming: "🏊",
};

export default function ProfilePage() {
  const { user, profile, tokens, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { document.title = "Profile · AthlyticAI"; }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm text-center">
          <User className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Sign in to view your profile</h2>
          <Button onClick={() => navigate("/auth")}
            className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full">Sign in</Button>
        </div>
      </div>
    );
  }

  const sports = profile?.selected_sports || [];
  const activeSport = profile?.active_sport;
  const sportsProfiles = profile?.sports_profiles || {};
  const hasProfile = sports.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8">
      <SEO title="Profile · AthlyticAI" description="Manage your AthlyticAI profile and preferences." />
      <div className="container mx-auto px-4 max-w-3xl">
        {/* Header card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-lime-400/5 border border-zinc-800 rounded-3xl p-5 sm:p-6 mb-6 flex items-center gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-full bg-lime-400/15 flex items-center justify-center text-xl font-bold text-lime-400 shrink-0">
            {(user.name || user.email || "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading font-bold text-xl sm:text-2xl text-white leading-tight">
              {user.name || "Player"}
            </h1>
            <p className="text-xs text-zinc-500 truncate">{user.email}</p>
          </div>
          {tokens != null && (
            <Link to="/wallet"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-purple-400/15 hover:bg-purple-400/25 text-purple-200 border border-purple-400/30 transition-colors">
              🪙 {tokens.toLocaleString("en-IN")} tokens
            </Link>
          )}
        </motion.div>

        {/* Profile state */}
        {hasProfile ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold flex items-center gap-1.5">
                <Trophy className="w-3 h-3 text-lime-400" /> Sports & skill profile
              </p>
              <Button onClick={() => navigate("/assessment")} size="sm" variant="outline"
                className="border-lime-400/30 text-lime-300 hover:bg-lime-400/10 rounded-full text-xs h-8">
                <RefreshCw className="w-3 h-3 mr-1" /> Retake quiz
              </Button>
            </div>
            <div className="space-y-3">
              {sports.map((s) => {
                const sp = sportsProfiles[s] || {};
                const isActive = s === activeSport;
                return (
                  <div key={s} className={`rounded-xl border p-3 flex items-center gap-3 ${
                    isActive ? "border-lime-400/30 bg-lime-400/5" : "border-zinc-800 bg-zinc-800/30"
                  }`}>
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-xl shrink-0">
                      {SPORT_EMOJI[s] || "🎯"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-white">{SPORT_LABELS[s] || s}</p>
                        {isActive && <Badge className="bg-lime-400 text-black text-[10px] font-bold">ACTIVE</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {sp.skill_level && <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 text-[10px]">{sp.skill_level}</Badge>}
                        {sp.play_style && <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 text-[10px]">{sp.play_style}</Badge>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {profile?.budget_range && (
              <p className="text-[11px] text-zinc-500 mt-3">
                Budget: <span className="text-zinc-300">{profile.budget_range}</span>
                {profile.playing_frequency && <> · Frequency: <span className="text-zinc-300">{profile.playing_frequency}</span></>}
                {profile.primary_goal && <> · Goal: <span className="text-zinc-300">{profile.primary_goal}</span></>}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-gradient-to-br from-lime-400/15 to-emerald-900/10 border border-lime-400/30 rounded-2xl p-6 mb-6 text-center">
            <Sparkles className="w-10 h-10 text-lime-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">No profile yet</h3>
            <p className="text-zinc-400 text-sm mb-4">
              Take the 30-second quiz so the dashboard, training, and equipment recommend the right things for you.
            </p>
            <Button onClick={() => navigate("/assessment")}
              className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full">
              <Sparkles className="w-4 h-4 mr-1.5" /> Take the Quiz
            </Button>
          </motion.div>
        )}

        {/* Quick links */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3 mb-6">
          <Link to="/wallet"
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-purple-400/30 transition-colors">
            <Coins className="w-5 h-5 text-purple-400 mb-2" />
            <p className="text-sm font-bold text-white">Wallet</p>
            <p className="text-[10px] text-zinc-500">Tokens & buy packs</p>
          </Link>
          <Link to="/referral"
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-colors">
            <Sparkles className="w-5 h-5 text-lime-400 mb-2" />
            <p className="text-sm font-bold text-white">Refer & earn</p>
            <p className="text-[10px] text-zinc-500">+200 tokens each side</p>
          </Link>
        </motion.div>

        {/* Logout */}
        <button onClick={() => { logout(); navigate("/"); }}
          className="w-full inline-flex items-center justify-center gap-2 text-sm text-zinc-500 hover:text-red-400 transition-colors py-3">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
