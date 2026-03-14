import { useEffect, useState } from "react";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Share2, Copy, Zap, Star, Target, Dumbbell, Flame } from "lucide-react";
import api from "@/lib/api";

export default function PlayerCardPage() {
  const { user } = useAuth();
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      api.get(`/player-card/${user.id}`).then(r => setCard(r.data.card)).catch(() => {}).finally(() => setLoading(false));
    }
  }, [user?.id]);

  const handleShare = async () => {
    const shareText = card
      ? `My PlaySmart Profile:\nSkill: ${card.skill_level}\nStyle: ${card.play_style}\nGoal: ${card.primary_goal}\nRecommended: ${card.recommended_racket || "N/A"}\n\nTrain smarter with PlaySmart!`
      : "Check out PlaySmart!";

    if (navigator.share) {
      try { await navigator.share({ title: "My PlaySmart Card", text: shareText }); } catch {}
    } else {
      await navigator.clipboard.writeText(shareText);
      toast.success("Copied to clipboard!");
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!card) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">No player card data found.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 py-8 flex flex-col items-center" data-testid="player-card-page">
      <div className="container mx-auto px-4 max-w-md">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <h1 className="font-heading font-bold text-3xl uppercase tracking-tight text-white mb-2" data-testid="card-page-title">
            Player Card
          </h1>
          <p className="text-zinc-400 text-sm">Your badminton identity. Share it with the world.</p>
        </motion.div>

        {/* Card */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-2xl border border-lime-400/30 shadow-[0_0_40px_rgba(190,242,100,0.15)] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950"
          data-testid="player-card">

          {/* Header */}
          <div className="relative p-6 pb-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-lime-400/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="flex items-center gap-3 mb-4">
              <Zap className="w-6 h-6 text-lime-400" />
              <span className="font-heading font-bold text-sm uppercase tracking-wider text-lime-400">PlaySmart</span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Skill Level</p>
                <h2 className="font-heading font-black text-4xl uppercase tracking-tighter text-white" data-testid="card-skill-level">
                  {card.skill_level}
                </h2>
              </div>
              <div className="w-16 h-16 rounded-full bg-lime-400/10 border-2 border-lime-400/30 flex items-center justify-center">
                <Star className="w-7 h-7 text-lime-400" />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="px-6 pb-4 grid grid-cols-2 gap-3">
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <Target className="w-4 h-4 text-sky-400 mb-1" strokeWidth={1.5} />
              <p className="text-xs text-zinc-500">Play Style</p>
              <p className="font-semibold text-white text-sm" data-testid="card-play-style">{card.play_style}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <Dumbbell className="w-4 h-4 text-purple-400 mb-1" strokeWidth={1.5} />
              <p className="text-xs text-zinc-500">Goal</p>
              <p className="font-semibold text-white text-sm" data-testid="card-goal">{card.primary_goal}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <Flame className="w-4 h-4 text-amber-400 mb-1" strokeWidth={1.5} />
              <p className="text-xs text-zinc-500">Training Days</p>
              <p className="font-semibold text-white text-sm" data-testid="card-training-days">{card.training_days_completed}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <Star className="w-4 h-4 text-lime-400 mb-1" strokeWidth={1.5} />
              <p className="text-xs text-zinc-500">Frequency</p>
              <p className="font-semibold text-white text-sm" data-testid="card-frequency">{card.playing_frequency}</p>
            </div>
          </div>

          {/* Recommended Racket */}
          {card.recommended_racket && (
            <div className="px-6 pb-4">
              <div className="bg-lime-400/10 border border-lime-400/20 rounded-lg p-3">
                <p className="text-xs text-lime-400 uppercase tracking-wide font-medium mb-0.5">Recommended Racket</p>
                <p className="font-heading font-bold text-white tracking-tight" data-testid="card-racket">{card.recommended_racket}</p>
              </div>
            </div>
          )}

          {/* Strengths */}
          <div className="px-6 pb-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Strengths</p>
            <div className="flex flex-wrap gap-1.5">
              {(card.strengths || []).map((s, i) => (
                <Badge key={i} className="bg-zinc-800 text-zinc-300 border-zinc-700 text-xs">{s}</Badge>
              ))}
            </div>
          </div>

          {/* Focus Areas */}
          <div className="px-6 pb-6">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Focus Areas</p>
            <div className="flex flex-wrap gap-1.5">
              {(card.focus_areas || []).map((f, i) => (
                <Badge key={i} variant="outline" className="border-zinc-700 text-zinc-400 text-xs">{f}</Badge>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Share Buttons */}
        <div className="flex gap-3 mt-6">
          <Button onClick={handleShare}
            className="flex-1 bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide rounded-full h-12 shadow-[0_0_15px_rgba(190,242,100,0.2)]"
            data-testid="share-card-btn">
            <Share2 className="w-4 h-4 mr-2" /> Share Card
          </Button>
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied!"); }}
            className="border-zinc-700 text-zinc-400 hover:border-lime-400 hover:text-lime-400 rounded-full h-12 px-4"
            data-testid="copy-link-btn">
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
