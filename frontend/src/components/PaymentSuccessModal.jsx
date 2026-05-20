import { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Full-screen celebration shown after a successful token purchase.
 * Replaces the small in-dialog success block with something the user
 * actually feels — coin burst, animated counters, fresh balance, and a
 * CTA to dive into the analyzer with their new tokens.
 */

// Tiny seeded "confetti" — a handful of coloured coins fly out from the
// center. No external library; pure framer-motion.
const COIN_COLORS = ["#bef264", "#a3e635", "#facc15", "#f59e0b", "#fde047", "#84cc16"];

function CoinBurst({ count = 14 }) {
  const coins = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const distance = 140 + Math.random() * 80;
      return {
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        rotate: Math.random() * 720 - 360,
        delay: Math.random() * 0.15,
        color: COIN_COLORS[i % COIN_COLORS.length],
      };
    });
  }, [count]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {coins.map((c) => (
        <motion.div
          key={c.id}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
          animate={{
            x: c.x,
            y: c.y,
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1.2, 1, 0.6],
            rotate: c.rotate,
          }}
          transition={{ duration: 1.4, delay: c.delay, ease: "easeOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl"
          style={{ color: c.color }}
        >
          🪙
        </motion.div>
      ))}
    </div>
  );
}

export default function PaymentSuccessModal({
  open,
  onClose,
  tokensCredited,
  newBalance,
  packLabel,
  amountInr,
}) {
  // Auto-haptic ping on mount (best-effort on mobile)
  useEffect(() => {
    if (!open) return;
    try { window.navigator.vibrate?.([12, 40, 12]); } catch {}
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md p-0 overflow-hidden">
        <div className="relative px-6 pt-10 pb-6 text-center">
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-lime-400/12 via-zinc-950 to-zinc-950 pointer-events-none" />
          {/* Coin burst */}
          <AnimatePresence>{open && <CoinBurst />}</AnimatePresence>

          {/* Big check badge */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.05 }}
            className="relative z-10 w-20 h-20 mx-auto mb-5 rounded-full bg-lime-400 flex items-center justify-center shadow-[0_0_40px_rgba(190,242,100,0.55)]"
          >
            <Check className="w-10 h-10 text-black" strokeWidth={3} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="relative z-10"
          >
            <p className="text-[11px] uppercase tracking-widest text-lime-300 font-bold mb-1">Payment successful</p>
            <h2 className="font-heading font-black text-3xl text-white mb-2 tracking-tight">
              Tokens added! 🎉
            </h2>
            {packLabel && (
              <p className="text-zinc-500 text-xs mb-5">
                {packLabel} {amountInr ? `· ₹${amountInr}` : ""}
              </p>
            )}

            {/* Big credited number */}
            <div className="bg-gradient-to-br from-lime-400/15 to-emerald-900/15 border border-lime-400/30 rounded-2xl py-5 px-4 mb-5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Credited to your wallet</p>
              <motion.p
                initial={{ scale: 0.7 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 14, delay: 0.35 }}
                className="font-heading font-black text-5xl text-lime-400 leading-none mb-1"
              >
                +{(tokensCredited ?? 0).toLocaleString("en-IN")}
              </motion.p>
              <p className="text-[11px] text-zinc-500">tokens</p>
              {typeof newBalance === "number" && (
                <p className="text-xs text-zinc-400 mt-3 pt-3 border-t border-zinc-800/80">
                  New balance: <span className="text-purple-300 font-bold">🪙 {newBalance.toLocaleString("en-IN")}</span>
                </p>
              )}
            </div>

            {/* CTAs */}
            <div className="flex gap-2">
              <Button
                asChild
                className="flex-1 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-xl h-11"
              >
                <Link to="/analyze" onClick={() => onClose?.()}>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  Analyze a video <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Link>
              </Button>
              <Button
                onClick={onClose}
                variant="ghost"
                className="text-zinc-400 hover:text-white rounded-xl px-5"
              >
                Done
              </Button>
            </div>
            <p className="text-[11px] text-zinc-600 mt-4">Receipt sent to your email · Tokens never expire</p>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
