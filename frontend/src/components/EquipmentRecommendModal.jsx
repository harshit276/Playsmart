import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, ChevronRight, Check, ArrowLeft, Wallet, Star, Target } from "lucide-react";

const SPORTS = [
  { key: "badminton", label: "Badminton", emoji: "🏸" },
  { key: "tennis", label: "Tennis", emoji: "🎾" },
  { key: "table_tennis", label: "Table Tennis", emoji: "🏓" },
  { key: "pickleball", label: "Pickleball", emoji: "⚡" },
  { key: "cricket", label: "Cricket", emoji: "🏏" },
  { key: "football", label: "Football", emoji: "⚽" },
];

const LEVELS = [
  { key: "Beginner", label: "Beginner", desc: "Learning the basics" },
  { key: "Intermediate", label: "Intermediate", desc: "Comfortable rallies" },
  { key: "Advanced", label: "Advanced", desc: "Club / tournament play" },
  { key: "Pro", label: "Pro", desc: "Competitive technique" },
];

// Match MarketplacePage's PRICE_BUCKETS
const BUDGETS = [
  { key: "all", label: "Any budget", sublabel: "Show me everything" },
  { key: "u2k", label: "Under ₹2k", sublabel: "Beginner-friendly" },
  { key: "2-5k", label: "₹2k – ₹5k", sublabel: "Solid starter gear" },
  { key: "5-10k", label: "₹5k – ₹10k", sublabel: "Step-up picks" },
  { key: "10k+", label: "₹10k+", sublabel: "Performance / pro" },
];

const CATEGORY_PICKS = {
  badminton: ["rackets", "shoes", "strings"],
  tennis: ["rackets", "shoes", "strings"],
  table_tennis: ["blades", "rubbers", "ready_made_rackets"],
  pickleball: ["paddles", "balls"],
  cricket: ["bats", "pads", "helmets"],
  football: ["boots", "balls"],
};

/**
 * Three-step picker that returns filter answers up to MarketplacePage.
 * Steps: sport → skill level → budget. Each can be clicked-through fast;
 * no required fields beyond sport. Auto-applies category picks per sport
 * (rackets+shoes+strings for badminton, blades+rubbers for TT, etc.).
 */
export default function EquipmentRecommendModal({
  open,
  onClose,
  onApply,
  defaultSport,
  defaultLevel,
  defaultBudget,
}) {
  const [step, setStep] = useState(0);
  const [sport, setSport] = useState(defaultSport || "badminton");
  const [level, setLevel] = useState(defaultLevel || "");
  const [budget, setBudget] = useState(defaultBudget || "all");

  useEffect(() => {
    if (open) {
      setStep(0);
      setSport(defaultSport || "badminton");
      setLevel(defaultLevel || "");
      setBudget(defaultBudget || "all");
    }
  }, [open, defaultSport, defaultLevel, defaultBudget]);

  const totalSteps = 3;

  const apply = () => {
    onApply({
      sport,
      level,
      budget,
      categories: CATEGORY_PICKS[sport] || [],
    });
    onClose?.();
  };

  const next = () => {
    if (step < totalSteps - 1) setStep((s) => s + 1);
    else apply();
  };

  const back = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const canProceed =
    step === 0 ? !!sport :
    step === 1 ? true : // level optional
    step === 2 ? true : // budget optional
    false;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-lg p-0 overflow-hidden">
        {/* Header strip */}
        <div className="bg-gradient-to-br from-lime-400/15 via-emerald-900/10 to-zinc-950 px-6 py-5 border-b border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-lime-400" />
              Find my equipment
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm mt-1">
              Three taps — we'll filter the catalog to gear that actually fits you.
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex gap-1.5 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < step ? "bg-lime-400" : i === step ? "bg-lime-400/60" : "bg-zinc-800"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-6 py-5 min-h-[320px]">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
              >
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">Step 1 of 3</p>
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-lime-400" /> Which sport?
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {SPORTS.map((s) => {
                    const active = s.key === sport;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setSport(s.key)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                          active
                            ? "bg-lime-400/10 border-lime-400/50 text-lime-300 scale-[1.02] shadow-[0_0_20px_rgba(190,242,100,0.18)]"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        }`}
                      >
                        <span className="text-2xl">{s.emoji}</span>
                        <span className="text-[11px] font-semibold leading-tight">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
              >
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">Step 2 of 3</p>
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Star className="w-4 h-4 text-sky-400" /> Your skill level?
                </h3>
                <div className="space-y-2">
                  {LEVELS.map((l) => {
                    const active = l.key === level;
                    return (
                      <button
                        key={l.key}
                        onClick={() => setLevel(l.key)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                          active
                            ? "bg-sky-400/10 border-sky-400/50 text-sky-200"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        }`}
                      >
                        <div>
                          <p className={`font-semibold text-sm ${active ? "text-white" : "text-zinc-200"}`}>{l.label}</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{l.desc}</p>
                        </div>
                        {active && <Check className="w-5 h-5 text-sky-400 shrink-0" />}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => { setLevel(""); next(); }}
                    className="w-full text-[11px] text-zinc-500 hover:text-zinc-300 py-2"
                  >
                    Skip this — show me everything
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
              >
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">Step 3 of 3</p>
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-amber-400" /> Your budget?
                </h3>
                <div className="space-y-2">
                  {BUDGETS.map((b) => {
                    const active = b.key === budget;
                    return (
                      <button
                        key={b.key}
                        onClick={() => setBudget(b.key)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                          active
                            ? "bg-amber-400/10 border-amber-400/50"
                            : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        <div>
                          <p className={`font-semibold text-sm ${active ? "text-amber-200" : "text-zinc-200"}`}>{b.label}</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{b.sublabel}</p>
                        </div>
                        {active && <Check className="w-5 h-5 text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="bg-zinc-950 border-t border-zinc-800 px-6 py-4 flex items-center gap-2">
          {step > 0 ? (
            <Button variant="ghost" onClick={back} className="text-zinc-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onClose?.()} className="text-zinc-500 hover:text-zinc-300">
              Cancel
            </Button>
          )}
          <Button
            onClick={next}
            disabled={!canProceed}
            className="ml-auto bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-xl h-10 px-5 disabled:opacity-40"
          >
            {step < totalSteps - 1 ? (
              <>Next <ChevronRight className="w-4 h-4 ml-1" /></>
            ) : (
              <>Show my picks <Sparkles className="w-4 h-4 ml-1.5" /></>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
