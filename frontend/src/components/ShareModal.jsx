import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Copy, Download, X, MessageCircle, Link2, Check, Zap, Star, Target } from "lucide-react";

/**
 * ShareModal — Reusable share modal for analysis results, player cards, and progress.
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - shareData: { title, text, url, card } — card is the visual card data
 * - cardType: "analysis" | "player" | "progress"
 */
export default function ShareModal({ open, onClose, shareData, cardType = "analysis" }) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef(null);

  const handleCopyLink = useCallback(async () => {
    const text = shareData?.text || shareData?.url || window.location.href;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [shareData]);

  const handleWebShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareData?.title || "AthlyticAI",
          text: shareData?.text || "",
          url: shareData?.url || window.location.href,
        });
      } catch (err) {
        if (err.name !== "AbortError") toast.error("Share failed");
      }
    } else {
      handleCopyLink();
    }
  }, [shareData, handleCopyLink]);

  const handleWhatsApp = useCallback(() => {
    const text = encodeURIComponent(
      (shareData?.text || "") + "\n" + (shareData?.url || window.location.href)
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [shareData]);

  const handleDownloadImage = useCallback(async () => {
    if (!cardRef.current) return;

    try {
      // Use canvas-based approach to capture the card
      const card = cardRef.current;
      const canvas = document.createElement("canvas");
      const scale = 2; // retina
      canvas.width = card.offsetWidth * scale;
      canvas.height = card.offsetHeight * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);

      // Draw background
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, card.offsetWidth, card.offsetHeight);

      // Draw border
      ctx.strokeStyle = "#bef264";
      ctx.lineWidth = 2;
      ctx.roundRect(1, 1, card.offsetWidth - 2, card.offsetHeight - 2, 16);
      ctx.stroke();

      const d = shareData?.card || {};
      let y = 30;

      // Title
      ctx.fillStyle = "#bef264";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("ATHLYTICAI", 20, y);
      y += 28;

      // Player name
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText(d.player_name || d.shot_name || "AthlyticAI Player", 20, y);
      y += 24;

      // Sport
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "14px sans-serif";
      ctx.fillText(d.sport || "", 20, y);
      y += 30;

      // Score / Grade
      if (d.score != null || d.grade) {
        ctx.fillStyle = "#bef264";
        ctx.font = "bold 36px sans-serif";
        const scoreText = d.score != null ? `${d.score}/100` : d.grade;
        ctx.fillText(scoreText, 20, y);
        y += 16;

        if (d.grade && d.score != null) {
          ctx.fillStyle = "#a1a1aa";
          ctx.font = "14px sans-serif";
          ctx.fillText(`Grade: ${d.grade}`, 20, y);
        }
        y += 28;
      }

      // Skill level
      if (d.skill_level) {
        ctx.fillStyle = "#71717a";
        ctx.font = "11px sans-serif";
        ctx.fillText("SKILL LEVEL", 20, y);
        y += 16;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText(d.skill_level, 20, y);
        y += 28;
      }

      // Stats row
      if (d.badges_count != null || d.analysis_count != null) {
        ctx.fillStyle = "#71717a";
        ctx.font = "10px sans-serif";
        const stats = [];
        if (d.badges_count != null) stats.push(`${d.badges_count} Badges`);
        if (d.analysis_count != null) stats.push(`${d.analysis_count} Analyses`);
        if (d.training_days != null) stats.push(`${d.training_days} Training Days`);
        ctx.fillText(stats.join("  |  "), 20, y);
        y += 20;
      }

      // Footer
      ctx.fillStyle = "#3f3f46";
      ctx.font = "10px sans-serif";
      ctx.fillText("athlyticai.com", 20, y + 10);

      // Convert to downloadable image
      canvas.toBlob((blob) => {
        if (!blob) {
          toast.error("Failed to generate image");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `athlyticai-${cardType}-card.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Image downloaded!");
      }, "image/png");
    } catch {
      toast.error("Failed to generate image");
    }
  }, [shareData, cardType]);

  if (!open) return null;

  const card = shareData?.card || {};

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-x-4 top-[5%] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md z-50 max-h-[90vh] overflow-y-auto"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-lime-400" />
                  <h3 className="font-heading font-bold text-lg text-white uppercase tracking-tight">Share</h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-zinc-500 hover:text-white h-8 w-8 min-h-[44px] min-w-[44px]"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Preview Card */}
              <div
                ref={cardRef}
                className="bg-zinc-950 border border-lime-400/30 rounded-2xl p-5 mb-5 shadow-[0_0_30px_rgba(190,242,100,0.1)]"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-lime-400" />
                  <span className="text-xs font-bold text-lime-400 uppercase tracking-wider">AthlyticAI</span>
                </div>

                {cardType === "analysis" ? (
                  <>
                    <h4 className="font-heading font-bold text-xl text-white uppercase tracking-tight mb-1">
                      {card.shot_name || "Analysis"}
                    </h4>
                    <p className="text-zinc-500 text-xs mb-3">{card.sport || ""}</p>
                    <div className="flex items-center gap-4 mb-3">
                      {card.score != null && (
                        <div className="text-center">
                          <p className="font-heading font-black text-3xl text-lime-400">{card.score}</p>
                          <p className="text-zinc-500 text-[10px] uppercase">/100</p>
                        </div>
                      )}
                      {card.grade && (
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-heading font-bold text-lg ${
                          card.grade === "A" ? "bg-lime-400 text-black" :
                          card.grade === "B" ? "bg-sky-400 text-black" :
                          card.grade === "C" ? "bg-amber-400 text-black" :
                          "bg-red-500 text-white"
                        }`}>
                          {card.grade}
                        </div>
                      )}
                      {card.skill_level && (
                        <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 text-xs">{card.skill_level}</Badge>
                      )}
                    </div>
                    {card.pro_comparison_score && (
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <Star className="w-3 h-3 text-amber-400" />
                        <span>{card.pro_comparison_score}% of pro level</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <h4 className="font-heading font-bold text-xl text-white uppercase tracking-tight mb-1">
                      {card.player_name || "Player Card"}
                    </h4>
                    <p className="text-zinc-500 text-xs mb-3">{card.sport || ""}</p>
                    <div className="flex items-center gap-3 mb-3">
                      <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs">{card.skill_level}</Badge>
                      {card.play_style && (
                        <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 text-xs">{card.play_style}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      {card.badges_count != null && <span>{card.badges_count} badges</span>}
                      {card.analysis_count != null && <span>{card.analysis_count} analyses</span>}
                      {card.current_streak > 0 && <span>{card.current_streak}w streak</span>}
                    </div>
                  </>
                )}
              </div>

              {/* Share Buttons */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Button
                  onClick={handleWhatsApp}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl h-12 min-h-[44px] text-sm"
                >
                  <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                </Button>
                <Button
                  onClick={handleWebShare}
                  className="bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-xl h-12 min-h-[44px] text-sm"
                >
                  <Share2 className="w-4 h-4 mr-2" /> Share
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                  className="border-zinc-700 text-zinc-400 hover:border-lime-400 hover:text-lime-400 rounded-xl h-12 min-h-[44px] text-sm"
                >
                  {copied ? <Check className="w-4 h-4 mr-2 text-lime-400" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? "Copied!" : "Copy Text"}
                </Button>
                <Button
                  onClick={handleDownloadImage}
                  variant="outline"
                  className="border-zinc-700 text-zinc-400 hover:border-lime-400 hover:text-lime-400 rounded-xl h-12 min-h-[44px] text-sm"
                >
                  <Download className="w-4 h-4 mr-2" /> Save Image
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
