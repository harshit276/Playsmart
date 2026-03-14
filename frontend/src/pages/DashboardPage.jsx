import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { Target, Dumbbell, BarChart3, CreditCard, Flame, TrendingUp, ChevronRight, Star, Shield } from "lucide-react";
import api from "@/lib/api";

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (user?.id) {
      api.get(`/progress/${user.id}`).then(r => setProgress(r.data)).catch(() => {});
    }
  }, [user?.id]);

  if (!profile) return null;

  const quickLinks = [
    { to: "/equipment", icon: Target, label: "Equipment Recs", desc: "See your top racket matches", color: "text-lime-400" },
    { to: "/training", icon: Dumbbell, label: "Training Plan", desc: `${profile.skill_level} level program`, color: "text-sky-400" },
    { to: "/progress", icon: BarChart3, label: "Progress", desc: `${progress?.completed_days || 0} days completed`, color: "text-purple-400" },
    { to: "/card", icon: CreditCard, label: "Player Card", desc: "Share your profile", color: "text-amber-400" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 py-8" data-testid="dashboard-page">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="font-heading font-bold text-3xl md:text-5xl uppercase tracking-tight text-white mb-1" data-testid="dashboard-title">
            Welcome Back
          </h1>
          <p className="text-zinc-400">Here's your PlaySmart overview.</p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Player Profile Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="md:col-span-8 bg-zinc-900 border border-zinc-800 rounded-xl p-6" data-testid="profile-card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-1">Player Profile</p>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="font-heading font-bold text-2xl uppercase tracking-tight text-white">{profile.skill_level}</h2>
                  <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 uppercase text-xs font-bold">{profile.play_style}</Badge>
                </div>
                <p className="text-zinc-500 text-sm">{profile.playing_frequency} player &middot; {profile.budget_range} budget &middot; Goal: {profile.primary_goal}</p>
              </div>
              <div className="w-16 h-16 rounded-full bg-lime-400/10 border-2 border-lime-400/30 flex items-center justify-center">
                <Star className="w-7 h-7 text-lime-400" strokeWidth={1.5} />
              </div>
            </div>

            <Separator className="bg-zinc-800 my-4" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Strengths
                </p>
                <div className="flex flex-wrap gap-2">
                  {(profile.strengths || []).map((s, i) => (
                    <Badge key={i} variant="secondary" className="bg-zinc-800 text-zinc-300 border-zinc-700 text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Focus Areas
                </p>
                <div className="flex flex-wrap gap-2">
                  {(profile.focus_areas || []).map((f, i) => (
                    <Badge key={i} variant="outline" className="border-zinc-700 text-zinc-400 text-xs">{f}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Streak */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="md:col-span-4 bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col items-center justify-center" data-testid="streak-card">
            <Flame className="w-10 h-10 text-amber-400 mb-3" strokeWidth={1.5} />
            <p className="font-heading font-black text-5xl text-white" data-testid="streak-count">{progress?.current_streak || 0}</p>
            <p className="text-zinc-500 text-sm font-medium uppercase tracking-wide">Day Streak</p>
            <p className="text-zinc-600 text-xs mt-1">{progress?.completed_days || 0} / {progress?.total_days || 30} days done</p>
          </motion.div>

          {/* Quick Links */}
          {quickLinks.map((link, i) => (
            <motion.div key={link.to} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}
              className="md:col-span-3">
              <Link to={link.to} data-testid={`quick-link-${link.label.toLowerCase().replace(/\s/g, "-")}`}
                className="group block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-lime-400/30 transition-all card-glow h-full">
                <link.icon className={`w-7 h-7 ${link.color} mb-3`} strokeWidth={1.5} />
                <p className="font-heading font-semibold text-white text-lg tracking-tight mb-0.5">{link.label}</p>
                <p className="text-zinc-500 text-xs">{link.desc}</p>
                <div className="flex justify-end mt-2">
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-lime-400 transition-colors" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
