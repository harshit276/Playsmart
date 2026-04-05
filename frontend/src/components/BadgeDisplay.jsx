import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Repeat, Flame, TrendingUp, Crown, Medal,
  Zap, Target, RotateCw, Hand, Swords, Goal, Waves,
  BookOpen, BarChart, CalendarCheck, Award, Lock
} from "lucide-react";

const BADGE_ICONS = {
  "upload": Upload,
  "repeat": Repeat,
  "flame": Flame,
  "trending-up": TrendingUp,
  "crown": Crown,
  "medal": Medal,
  "zap": Zap,
  "target": Target,
  "rotate-cw": RotateCw,
  "hand": Hand,
  "swords": Swords,
  "goal": Goal,
  "waves": Waves,
  "book-open": BookOpen,
  "bar-chart": BarChart,
  "calendar-check": CalendarCheck,
  "award": Award,
};

const BADGE_COLORS = {
  "milestone": { bg: "bg-lime-400/10", text: "text-lime-400", border: "border-lime-400/30", glow: "shadow-[0_0_15px_rgba(190,242,100,0.2)]" },
  "streak": { bg: "bg-amber-400/10", text: "text-amber-400", border: "border-amber-400/30", glow: "shadow-[0_0_15px_rgba(251,191,36,0.2)]" },
  "improvement": { bg: "bg-sky-400/10", text: "text-sky-400", border: "border-sky-400/30", glow: "shadow-[0_0_15px_rgba(56,189,248,0.2)]" },
  "skill": { bg: "bg-purple-400/10", text: "text-purple-400", border: "border-purple-400/30", glow: "shadow-[0_0_15px_rgba(192,132,252,0.2)]" },
  "variety": { bg: "bg-emerald-400/10", text: "text-emerald-400", border: "border-emerald-400/30", glow: "shadow-[0_0_15px_rgba(52,211,153,0.2)]" },
  "sport": { bg: "bg-orange-400/10", text: "text-orange-400", border: "border-orange-400/30", glow: "shadow-[0_0_15px_rgba(251,146,60,0.2)]" },
  "training": { bg: "bg-pink-400/10", text: "text-pink-400", border: "border-pink-400/30", glow: "shadow-[0_0_15px_rgba(244,114,182,0.2)]" },
};

/**
 * Single badge item component.
 */
function BadgeItem({ badge, size = "md", showDescription = false, animate = false }) {
  const Icon = BADGE_ICONS[badge.icon] || Medal;
  const colors = BADGE_COLORS[badge.category] || BADGE_COLORS.milestone;
  const earned = badge.earned !== false;

  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-18 h-18",
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return (
    <motion.div
      initial={animate ? { scale: 0, rotate: -180 } : false}
      animate={animate ? { scale: 1, rotate: 0 } : false}
      transition={animate ? { type: "spring", stiffness: 200, damping: 15, delay: 0.2 } : undefined}
      className={`flex flex-col items-center gap-1.5 ${!earned ? "opacity-40" : ""}`}
    >
      <motion.div
        whileHover={earned ? { scale: 1.1, y: -2 } : {}}
        className={`${sizeClasses[size]} rounded-2xl ${earned ? colors.bg : "bg-zinc-800/50"} border ${earned ? colors.border : "border-zinc-800"} flex items-center justify-center ${earned ? colors.glow : ""} transition-all`}
      >
        {earned ? (
          <Icon className={`${iconSizes[size]} ${colors.text}`} strokeWidth={1.5} />
        ) : (
          <Lock className={`${iconSizes[size]} text-zinc-600`} strokeWidth={1.5} />
        )}
      </motion.div>
      <p className={`text-[10px] font-medium text-center leading-tight ${earned ? "text-zinc-300" : "text-zinc-600"}`}>
        {badge.name}
      </p>
      {showDescription && earned && badge.earned_date && (
        <p className="text-[9px] text-zinc-500">
          {new Date(badge.earned_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      )}
    </motion.div>
  );
}

/**
 * BadgeGrid — Shows all badges (earned + locked) in a grid.
 */
export function BadgeGrid({ badges = [], showLocked = true, compact = false }) {
  const earned = badges.filter(b => b.earned !== false);
  const locked = badges.filter(b => b.earned === false);
  const displayBadges = showLocked ? badges : earned;

  return (
    <div className={`grid ${compact ? "grid-cols-5 sm:grid-cols-6 gap-3" : "grid-cols-4 sm:grid-cols-5 gap-4"}`}>
      {displayBadges.map((badge, i) => (
        <BadgeItem
          key={badge.badge_id}
          badge={badge}
          size={compact ? "sm" : "md"}
          showDescription={!compact}
        />
      ))}
    </div>
  );
}

/**
 * BadgeStrip — Horizontal scrollable strip of earned badges (for dashboard).
 */
export function BadgeStrip({ badges = [], maxShow = 6 }) {
  const earned = badges.filter(b => b.earned !== false);
  if (earned.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
      {earned.slice(0, maxShow).map((badge) => (
        <BadgeItem key={badge.badge_id} badge={badge} size="sm" />
      ))}
      {earned.length > maxShow && (
        <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-zinc-800/50 border border-zinc-700 shrink-0">
          <span className="text-xs text-zinc-500 font-bold">+{earned.length - maxShow}</span>
        </div>
      )}
    </div>
  );
}

/**
 * NewBadgeOverlay — Full-screen celebration when a new badge is earned.
 */
export function NewBadgeOverlay({ badge, onClose }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!badge) return null;

  const Icon = BADGE_ICONS[badge.icon] || Medal;
  const colors = BADGE_COLORS[badge.category] || BADGE_COLORS.milestone;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { setVisible(false); onClose?.(); }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 150, damping: 12 }}
            className="text-center"
          >
            {/* Confetti particles */}
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0.5],
                  x: Math.cos((i * 30 * Math.PI) / 180) * 120,
                  y: Math.sin((i * 30 * Math.PI) / 180) * 120,
                }}
                transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
                className={`absolute w-2 h-2 rounded-full ${
                  i % 3 === 0 ? "bg-lime-400" : i % 3 === 1 ? "bg-amber-400" : "bg-sky-400"
                }`}
                style={{ left: "50%", top: "50%", marginLeft: -4, marginTop: -4 }}
              />
            ))}

            {/* Badge */}
            <motion.div
              animate={{ boxShadow: ["0 0 20px rgba(190,242,100,0.3)", "0 0 60px rgba(190,242,100,0.5)", "0 0 20px rgba(190,242,100,0.3)"] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`w-24 h-24 rounded-3xl ${colors.bg} border-2 ${colors.border} flex items-center justify-center mx-auto mb-4`}
            >
              <Icon className={`w-12 h-12 ${colors.text}`} strokeWidth={1.5} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <p className="text-xs text-lime-400 uppercase tracking-widest font-bold mb-2">Badge Earned!</p>
              <h3 className="font-heading font-bold text-2xl text-white uppercase tracking-tight mb-2">
                {badge.name}
              </h3>
              <p className="text-zinc-400 text-sm max-w-xs mx-auto">{badge.description}</p>
              <p className="text-zinc-600 text-xs mt-4">Tap to dismiss</p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default BadgeItem;
