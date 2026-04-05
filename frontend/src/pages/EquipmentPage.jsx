import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target, Star, ExternalLink, ChevronDown, ChevronUp, Sparkles,
  ShoppingCart, Footprints, Package, IndianRupee, Filter, Tag,
  CheckCircle2, ClipboardList, ArrowRight, Loader2
} from "lucide-react";
import api from "@/lib/api";
import { getSportEmoji, getSportLabel, SPORT_LABEL } from "@/lib/sportConfig";

const BUDGET_RANGES = {
  Low: { label: "Budget", max: 3000 },
  Medium: { label: "Mid Range", max: 8000 },
  High: { label: "Performance", max: 15000 },
  Premium: { label: "Premium", max: 999999 },
};

function ScoreCircle({ score, size = 64 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#bef264" strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-heading font-bold text-lg text-white">{score}</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max, color = "bg-lime-400" }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-zinc-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(value / max) * 100}%` }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="text-zinc-400 font-mono w-8 text-right">{value}/{max}</span>
    </div>
  );
}

function PriceRow({ prices, buyLinks }) {
  // Show buy_links buttons when no DB prices available (research items)
  if (!prices?.length && buyLinks && typeof buyLinks === "object") {
    // Filter out non-URL entries like "india" arrays and empty values
    const entries = Object.entries(buyLinks).filter(([key, url]) => url && typeof url === "string" && url.startsWith("http"));
    if (entries.length > 0) {
      const labels = { amazon: "Amazon", flipkart: "Flipkart", decathlon: "Decathlon", myntra: "Myntra" };
      return (
        <div className="flex flex-wrap gap-2 mt-4">
          {entries.map(([store, url]) => (
            <a key={store} href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
              <ShoppingCart className="w-3 h-3" />
              {labels[store] || store.charAt(0).toUpperCase() + store.slice(1)}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ))}
        </div>
      );
    }
  }
  if (!prices?.length) return null;
  const lowest = Math.min(...prices.map(p => p.price));
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {prices.map((p, pi) => {
        const isLowest = prices.length > 1 && p.price === lowest;
        return (
          <a key={pi} href={p.listing_url} target="_blank" rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
              isLowest
                ? "bg-lime-400 text-black hover:bg-lime-500"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}>
            <ShoppingCart className="w-3 h-3" />
            {p.marketplace} - {p.price?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            {isLowest && <span className="text-[10px] font-bold ml-0.5">BEST</span>}
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        );
      })}
    </div>
  );
}

function BuyLinks({ buyLinks }) {
  if (!buyLinks || typeof buyLinks !== "object") return null;
  const entries = Object.entries(buyLinks).filter(([, url]) => url && typeof url === "string" && url.startsWith("http"));
  if (!entries.length) return null;
  const labels = { amazon: "Amazon", flipkart: "Flipkart", decathlon: "Decathlon", myntra: "Myntra" };
  return (
    <div className="space-y-2">
      {entries.map(([store, url]) => (
        <a key={store} href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-between p-2.5 rounded-xl text-xs bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors">
          <span className="font-medium text-zinc-300">{labels[store] || store.charAt(0).toUpperCase() + store.slice(1)}</span>
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-lime-400/10 text-lime-400 rounded-lg">
            <ShoppingCart className="w-3 h-3" /> Buy <ExternalLink className="w-2.5 h-2.5" />
          </span>
        </a>
      ))}
    </div>
  );
}

function PriceTable({ prices, buyLinks }) {
  if (!prices?.length && buyLinks) return <BuyLinks buyLinks={buyLinks} />;
  if (!prices?.length) return <p className="text-zinc-600 text-xs">No price data available.</p>;
  const lowest = Math.min(...prices.map(p => p.price));
  return (
    <div className="space-y-2">
      {prices.map((p, i) => (
        <div key={i} className={`flex items-center justify-between p-2.5 rounded-xl text-xs ${p.price === lowest ? "bg-lime-400/10 border border-lime-400/20" : "bg-zinc-800/50"}`}>
          <div>
            <span className="font-medium text-zinc-300">{p.marketplace}</span>
            {p.price === lowest && <Badge className="ml-2 bg-lime-400 text-black text-[10px] px-1.5 py-0">Best Price</Badge>}
          </div>
          <div className="flex items-center gap-3">
            {p.discount_percent > 0 && <span className="text-zinc-500 line-through">{p.mrp?.toLocaleString()}</span>}
            <span className={`font-bold ${p.price === lowest ? "text-lime-400" : "text-white"}`}>
              {p.price?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </span>
            <a href={p.listing_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 bg-lime-400/10 text-lime-400 rounded-lg hover:bg-lime-400/20 transition-colors"
              data-testid={`buy-link-${p.marketplace?.toLowerCase()}`}>
              <ShoppingCart className="w-3 h-3" /> Buy <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

// Indian brand detection
const INDIAN_BRANDS = ["li-ning", "cosco", "yonex india", "nivia", "vector x", "stag", "kamachi", "apacs", "thrax", "ashaway"];
function isIndianBrand(brand) {
  if (!brand) return false;
  const lower = brand.toLowerCase();
  return INDIAN_BRANDS.some(b => lower.includes(b)) || lower.includes("india");
}

function RecCard({ rec, i, expanded, setExpanded, showShoeSpecs, budgetRange }) {
  const eq = rec.equipment;
  const sc = rec.score;
  const isExpanded = expanded === `${showShoeSpecs ? 's' : 'r'}-${i}`;
  const toggleKey = `${showShoeSpecs ? 's' : 'r'}-${i}`;
  const lowestPrice = rec.prices?.length > 0 ? Math.min(...rec.prices.map(p => p.price)) : null;
  const budgetMax = BUDGET_RANGES[budgetRange]?.max || 999999;
  const isAboveBudget = lowestPrice && lowestPrice > budgetMax;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.08 }}
      className={`bg-zinc-900/80 border rounded-2xl overflow-hidden transition-all ${
        isExpanded ? "border-lime-400/30" : isAboveBudget ? "border-zinc-800/50 opacity-80" : "border-zinc-800"
      }`}
      data-testid={`recommendation-card-${showShoeSpecs ? 'shoe' : 'racket'}-${i}`}
    >
      {isAboveBudget && (
        <div className="bg-amber-400/5 border-b border-amber-400/20 px-5 py-1.5 flex items-center gap-2">
          <IndianRupee className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] text-amber-400 font-medium uppercase tracking-wide">Above your budget</span>
        </div>
      )}

      <div className="p-5 flex flex-col md:flex-row gap-5 items-start">
        <div className="flex items-center gap-4 md:gap-5">
          <div className="w-8 h-8 rounded-full bg-lime-400/10 flex items-center justify-center shrink-0">
            <span className="font-heading font-bold text-lime-400 text-sm">#{i + 1}</span>
          </div>
          <div className="w-20 h-20 rounded-xl bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
            <img src={eq.image_url || eq.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(eq.name || eq.model || eq.brand || 'E')}&background=27272a&color=a3e635&size=80&bold=true&format=svg`}
              alt={eq.name || eq.model}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent((eq.brand || 'E').substring(0,2))}&background=27272a&color=a3e635&size=80&bold=true&format=svg`; }} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-zinc-500 uppercase tracking-wide">{eq.brand}</p>
                {isIndianBrand(eq.brand) && (
                  <Badge className="bg-orange-400/10 text-orange-400 border-orange-400/20 text-[9px] px-1.5 py-0">
                    Popular in India
                  </Badge>
                )}
              </div>
              <h3 className="font-heading font-bold text-xl text-white tracking-tight">{eq.name || eq.model || "Equipment"}</h3>
              {/* Price range from research data */}
              {eq.price_ranges?.INR && (
                <p className="text-sm text-lime-400 font-semibold mt-0.5">
                  ₹{eq.price_ranges.INR.min?.toLocaleString("en-IN")} - ₹{eq.price_ranges.INR.max?.toLocaleString("en-IN")}
                </p>
              )}
              {eq.description && !eq.model && (
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{eq.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {showShoeSpecs ? (
                  <>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.weight_grams}g</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.cushioning}</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.ankle_support} Cut</Badge>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.weight_category}</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.balance_type}</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.shaft_flexibility}</Badge>
                  </>
                )}
              </div>
            </div>
            <ScoreCircle score={sc.total} />
          </div>

          <div className="mt-3 space-y-1.5">
            <ScoreBar label="Skill" value={sc.skill_match} max={40} />
            <ScoreBar label="Style" value={sc.play_style_match} max={30} color="bg-sky-400" />
            <ScoreBar label="Budget" value={sc.budget_match} max={20} color="bg-purple-400" />
            <ScoreBar label="Perf." value={sc.performance_fit} max={10} color="bg-amber-400" />
          </div>

          <PriceRow prices={rec.prices} buyLinks={rec.buy_links || eq.buy_links} />
        </div>
      </div>

      <div className="px-5 pb-2">
        <Button variant="ghost" onClick={() => setExpanded(isExpanded ? null : toggleKey)}
          className="w-full text-zinc-500 hover:text-lime-400 text-xs uppercase tracking-wide" data-testid={`expand-${toggleKey}`}>
          {isExpanded ? <><ChevronUp className="w-3 h-3 mr-1" /> Less Details</> : <><ChevronDown className="w-3 h-3 mr-1" /> View Details</>}
        </Button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-5 pb-5"
          >
            <Separator className="bg-zinc-800 mb-4" />
            <Tabs defaultValue="why" className="w-full">
              <TabsList className="bg-zinc-800 border-zinc-700 mb-4 w-full grid grid-cols-3">
                <TabsTrigger value="why" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Why This?</TabsTrigger>
                <TabsTrigger value="specs" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Specs</TabsTrigger>
                <TabsTrigger value="prices" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Buy Now</TabsTrigger>
              </TabsList>

              <TabsContent value="why">
                <div className="flex gap-2 items-start">
                  <Sparkles className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-zinc-300 leading-relaxed" data-testid={`explanation-${toggleKey}`}>{rec.explanation}</p>
                </div>
              </TabsContent>

              <TabsContent value="specs">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {showShoeSpecs ? (
                    [["Weight", `${eq.weight_grams}g`], ["Cushioning", eq.cushioning], ["Sole", eq.sole_type], ["Ankle Support", eq.ankle_support], ["Breathability", `${eq.breathability}/10`], ["Durability", `${eq.durability}/10`]].map(([k, v]) => (
                      <div key={k} className="flex justify-between p-2 bg-zinc-800/50 rounded-xl"><span className="text-zinc-500">{k}</span><span className="text-zinc-200 font-medium">{v}</span></div>
                    ))
                  ) : (
                    [["Weight", eq.weight_category + ` (${eq.actual_weight_grams}g)`], ["Balance", eq.balance_type + ` (${eq.balance_point_mm}mm)`], ["Shaft", eq.shaft_flexibility], ["Frame", eq.frame_material], ["Max Tension", eq.max_string_tension_lbs + " lbs"], ["Grip", eq.grip_size], ["Attack", `${eq.attack_score}/10`], ["Control", `${eq.control_score}/10`], ["Speed", `${eq.speed_score}/10`], ["Forgiveness", `${eq.forgiveness_score}/10`]].map(([k, v]) => (
                      <div key={k} className="flex justify-between p-2 bg-zinc-800/50 rounded-xl"><span className="text-zinc-500">{k}</span><span className="text-zinc-200 font-medium">{v}</span></div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="prices">
                <PriceTable prices={rec.prices} buyLinks={rec.buy_links || eq.buy_links} />
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function GearCard({ item, prices, reason }) {
  const eq = item;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-all"
      data-testid={`gear-card-${eq.id}`}
    >
      <div className="flex gap-4 items-start">
        <div className="w-16 h-16 rounded-xl bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
          <img src={eq.image_url || eq.image || `https://ui-avatars.com/api/?name=${encodeURIComponent((eq.brand || 'E').substring(0,2))}&background=27272a&color=a3e635&size=64&bold=true&format=svg`}
            alt={eq.name || eq.model}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent((eq.brand || 'E').substring(0,2))}&background=27272a&color=a3e635&size=64&bold=true&format=svg`; }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-zinc-500 uppercase">{eq.brand}</p>
            {isIndianBrand(eq.brand) && (
              <Badge className="bg-orange-400/10 text-orange-400 border-orange-400/20 text-[9px] px-1.5 py-0">
                Popular in India
              </Badge>
            )}
          </div>
          <h4 className="font-heading font-bold text-base text-white tracking-tight">{eq.model}</h4>
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{eq.description}</p>
          {reason && <p className="text-xs text-lime-400/80 italic mt-1.5">{reason}</p>}
        </div>
      </div>
      {prices?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {prices.map((p, i) => {
            const isLowest = prices.length > 1 && p.price === Math.min(...prices.map(pp => pp.price));
            return (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${isLowest ? "bg-lime-400/10 border border-lime-400/20" : "bg-zinc-800/50"}`}>
                <span className="text-zinc-300">{p.marketplace} {isLowest && <Badge className="ml-1 bg-lime-400 text-black text-[9px] px-1 py-0">Best</Badge>}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${isLowest ? "text-lime-400" : "text-white"}`}>
                    {p.price?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                  </span>
                  <a href={p.listing_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-lime-400/10 text-lime-400 rounded-lg text-[10px] hover:bg-lime-400/20"
                    data-testid={`gear-buy-${eq.id}-${p.marketplace?.toLowerCase()}`}>
                    <ShoppingCart className="w-2.5 h-2.5" /> Buy <ExternalLink className="w-2 h-2" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

const CAT_LABELS = {
  shuttlecock: "Shuttlecocks", string: "Strings", grip: "Grips", bag: "Bags",
  tt_rubber: "Rubbers", tt_ball: "Balls", tt_bag: "Bags",
  tennis_string: "Strings", tennis_ball: "Balls", tennis_bag: "Bags",
  pb_ball: "Balls", pb_bag: "Bags",
};
const SPORT_TAB_LABELS = {
  badminton: { primary: "Rackets", secondary: "Shoes" },
  table_tennis: { primary: "Blades", secondary: "Rubbers" },
  tennis: { primary: "Rackets", secondary: "Shoes" },
  pickleball: { primary: "Paddles", secondary: "Shoes" },
  cricket: { primary: "Bats", secondary: "Shoes" },
  football: { primary: "Boots", secondary: "Gear" },
  swimming: { primary: "Goggles", secondary: "Swimwear" },
};

// ─── Sport Quiz Modal ───

const QUIZ_STEPS = [
  { key: "skill_level", title: "What's your skill level?", type: "options" },
  { key: "play_style", title: "What's your playing style?", type: "options" },
  { key: "playing_frequency", title: "How often do you play?", type: "options",
    options: [
      { value: "1-2 days/week", label: "1-2 days/week", desc: "Casual, recreational play" },
      { value: "3-4 days/week", label: "3-4 days/week", desc: "Regular training and matches" },
      { value: "5-7 days/week", label: "5-7 days/week", desc: "Serious competitive training" },
    ]
  },
  { key: "budget_range", title: "What's your equipment budget?", type: "options",
    options: [
      { value: "Low", label: "Budget (Under Rs.3,000)", desc: "Good quality essentials" },
      { value: "Medium", label: "Mid Range (Rs.3,000-8,000)", desc: "Balanced performance and value" },
      { value: "High", label: "Performance (Rs.8,000-15,000)", desc: "High-end equipment" },
      { value: "Premium", label: "Premium (Rs.15,000+)", desc: "Top-tier professional gear" },
    ]
  },
];

function SportQuizModal({ open, onClose, sport, sportConfig, onComplete }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    skill_level: "", play_style: "", playing_frequency: "", budget_range: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Reset when sport changes
  useEffect(() => {
    if (open) {
      setStep(0);
      setAnswers({ skill_level: "", play_style: "", playing_frequency: "", budget_range: "" });
      setSubmitting(false);
    }
  }, [open, sport]);

  const currentStep = QUIZ_STEPS[step];
  const totalSteps = QUIZ_STEPS.length;

  // Determine options based on step and sport config
  const getOptions = () => {
    if (currentStep.options) return currentStep.options;
    if (currentStep.key === "skill_level" && sportConfig?.skill_levels) {
      return sportConfig.skill_levels;
    }
    if (currentStep.key === "play_style" && sportConfig?.play_styles) {
      return sportConfig.play_styles;
    }
    return [];
  };

  const options = getOptions();
  const currentAnswer = answers[currentStep.key];
  const canProceed = !!currentAnswer;

  const handleSelect = (value) => {
    setAnswers(prev => ({ ...prev, [currentStep.key]: value }));
  };

  const handleNext = async () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      // Submit quiz
      setSubmitting(true);
      try {
        await onComplete(answers);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-heading">
            <span className="text-2xl">{getSportEmoji(sport)}</span>
            Set up {getSportLabel(sport)}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Quick setup so we can recommend the right gear for you.
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-2">
          {QUIZ_STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
              i < step ? "bg-lime-400" : i === step ? "bg-lime-400/60" : "bg-zinc-700"
            }`} />
          ))}
        </div>

        <div className="py-2">
          <p className="text-sm text-zinc-300 font-medium mb-1">
            Step {step + 1} of {totalSteps}
          </p>
          <h3 className="text-lg font-heading font-bold text-white mb-4">
            {currentStep.title}
          </h3>

          <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
            {options.map((opt) => {
              const isSelected = currentAnswer === opt.value;
              return (
                <motion.button
                  key={opt.value}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? "border-lime-400 bg-lime-400/10 ring-1 ring-lime-400/30"
                      : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium text-sm ${isSelected ? "text-lime-400" : "text-white"}`}>
                        {opt.label}
                      </p>
                      {opt.desc && (
                        <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
                      )}
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-lime-400 shrink-0" />}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={handleBack} className="text-zinc-400 hover:text-white">
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={!canProceed || submitting}
            className="bg-lime-400 text-black hover:bg-lime-500 font-medium flex-1 sm:flex-none"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</>
            ) : step < totalSteps - 1 ? (
              <>Next <ArrowRight className="w-4 h-4 ml-1.5" /></>
            ) : (
              <>Get Recommendations <Sparkles className="w-4 h-4 ml-1.5" /></>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Sport Selector Pill Bar ───

function SportSelector({ allSports, selectedSport, configuredSports, onSelectSport }) {
  return (
    <div className="mb-6">
      <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2.5">Browse equipment by sport</p>
      <div className="flex flex-wrap gap-2">
        {allSports.map((sport) => {
          const key = sport.key;
          const isActive = selectedSport === key;
          const isConfigured = configuredSports.includes(key);
          return (
            <motion.button
              key={key}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelectSport(key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all border ${
                isActive
                  ? "bg-lime-400 text-black border-lime-400 shadow-lg shadow-lime-400/20"
                  : isConfigured
                  ? "bg-zinc-800 text-white border-zinc-700 hover:border-lime-400/50"
                  : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600"
              }`}
              data-testid={`sport-pill-${key}`}
            >
              <span className="text-base">{getSportEmoji(key)}</span>
              <span>{sport.name}</span>
              {isConfigured && !isActive && (
                <CheckCircle2 className="w-3.5 h-3.5 text-lime-400/70" />
              )}
              {!isConfigured && (
                <ClipboardList className="w-3.5 h-3.5 text-zinc-600" />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}


export default function EquipmentPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const sportFromUrl = searchParams.get("sport");
  const [selectedSport, setSelectedSport] = useState(sportFromUrl || profile?.active_sport || "badminton");
  const [racketData, setRacketData] = useState(null);
  const [shoeData, setShoeData] = useState(null);
  const [gearData, setGearData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState("r-0");
  const [activeTab, setActiveTab] = useState("rackets");
  const [showAboveBudget, setShowAboveBudget] = useState(false);

  // All sports from backend
  const [allSports, setAllSports] = useState([]);
  // Quiz modal state
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizSport, setQuizSport] = useState(null);
  const [quizSportConfig, setQuizSportConfig] = useState(null);

  const configuredSports = profile?.selected_sports || [];
  const sportsProfiles = profile?.sports_profiles || {};

  // Determine the budget for the currently viewed sport
  const sportSpecificBudget = sportsProfiles[selectedSport]?.budget_range;
  const budgetRange = sportSpecificBudget || profile?.budget_range || "Medium";

  // Fetch all available sports on mount
  useEffect(() => {
    api.get("/sports").then(res => {
      setAllSports(res.data.sports || []);
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(async (sport) => {
    if (!user?.id) return;
    setLoading(true);
    setRacketData(null);
    setShoeData(null);
    setGearData(null);
    const sportParam = sport ? `&sport=${sport}` : '';
    const sportQuery = sport ? `?sport=${sport}` : '';
    const [racketRes, shoeRes, gearRes] = await Promise.allSettled([
      api.get(`/recommendations/equipment/${user.id}?category=racket${sportParam}`),
      api.get(`/recommendations/equipment/${user.id}?category=shoes${sportParam}`),
      api.get(`/recommendations/gear/${user.id}${sportQuery}`),
    ]);
    if (racketRes.status === "fulfilled") setRacketData(racketRes.value.data);
    if (shoeRes.status === "fulfilled") setShoeData(shoeRes.value.data);
    if (gearRes.status === "fulfilled") setGearData(gearRes.value.data);
    setLoading(false);
  }, [user?.id]);

  // Fetch equipment when selectedSport changes (only for configured sports)
  useEffect(() => {
    const isConfigured = configuredSports.includes(selectedSport) || selectedSport === profile?.active_sport;
    if (isConfigured && user?.id) {
      fetchData(selectedSport);
    } else if (!user?.id) {
      setLoading(false);
    }
  }, [selectedSport, fetchData, profile?.active_sport, user?.id]);

  const handleSelectSport = (sportKey) => {
    const isConfigured = configuredSports.includes(sportKey) ||
      (sportsProfiles[sportKey] && Object.keys(sportsProfiles[sportKey]).length > 0);

    if (isConfigured) {
      // Already configured - switch directly
      setSelectedSport(sportKey);
      setSearchParams(sportKey === profile?.active_sport ? {} : { sport: sportKey });
      setActiveTab("rackets");
      setExpanded("r-0");
      setShowAboveBudget(false);
    } else {
      // Not configured - show the quiz first
      const sportCfg = allSports.find(s => s.key === sportKey);
      setQuizSport(sportKey);
      setQuizSportConfig(sportCfg || null);
      setQuizOpen(true);
    }
  };

  const handleQuizComplete = async (answers) => {
    try {
      await api.post("/profile/sport-quiz", {
        sport: quizSport,
        skill_level: answers.skill_level,
        play_style: answers.play_style,
        playing_frequency: answers.playing_frequency,
        budget_range: answers.budget_range,
      });
      // Refresh the profile so configuredSports updates
      await refreshProfile();
      setQuizOpen(false);
      // Now switch to that sport and fetch equipment
      setSelectedSport(quizSport);
      setSearchParams(quizSport === profile?.active_sport ? {} : { sport: quizSport });
      setActiveTab("rackets");
      setExpanded("r-0");
      setShowAboveBudget(false);
      // Fetch after a tick so profile state has updated
      setTimeout(() => fetchData(quizSport), 100);
    } catch (err) {
      console.error("Quiz submission failed:", err);
    }
  };

  // Separate in-budget and above-budget items
  const budgetMax = BUDGET_RANGES[budgetRange]?.max || 999999;
  const filterByBudget = (recs) => {
    if (!recs) return { inBudget: [], aboveBudget: [] };
    const inBudget = [];
    const aboveBudget = [];
    recs.forEach(rec => {
      const lowest = rec.prices?.length > 0 ? Math.min(...rec.prices.map(p => p.price)) : 0;
      if (lowest > budgetMax) aboveBudget.push(rec);
      else inBudget.push(rec);
    });
    return { inBudget, aboveBudget };
  };

  const racketFiltered = filterByBudget(racketData?.recommendations);
  const shoeFiltered = filterByBudget(shoeData?.recommendations);

  const activeSportForLabels = selectedSport || profile?.active_sport;

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="equipment-page">
      <div className="container mx-auto px-4 max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl md:text-5xl uppercase tracking-tight text-white mb-2" data-testid="equipment-title">
            <span className="mr-2">{getSportEmoji(selectedSport)}</span>
            {getSportLabel(selectedSport)} Gear
          </h1>

          {/* Sport Selector */}
          {allSports.length > 0 && (
            <SportSelector
              allSports={allSports}
              selectedSport={selectedSport}
              configuredSports={configuredSports}
              onSelectSport={handleSelectSport}
            />
          )}

          {/* Budget + Profile Summary */}
          <div className="flex flex-wrap gap-2 mb-4">
            {racketData?.profile_summary && (
              <>
                <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">{racketData.profile_summary.skill_level}</Badge>
                <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">{racketData.profile_summary.play_style}</Badge>
                <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">Goal: {racketData.profile_summary.primary_goal}</Badge>
              </>
            )}
          </div>

          {/* Budget Display */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 mb-6 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-lime-400/10 flex items-center justify-center">
                <IndianRupee className="w-5 h-5 text-lime-400" />
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Your Budget</p>
                <p className="text-sm font-bold text-white">
                  {budgetRange === "Low" ? "Under Rs.3,000"
                    : budgetRange === "Medium" ? "Rs.3,000 - Rs.8,000"
                    : budgetRange === "High" ? "Rs.8,000 - Rs.15,000"
                    : budgetRange === "Premium" ? "Rs.15,000+"
                    : budgetRange?.includes("-") ? `Rs.${budgetRange.split("-").map(v => parseInt(v).toLocaleString("en-IN")).join(" - Rs.")}`
                    : budgetRange}
                </p>
              </div>
            </div>
            <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs uppercase">
              {BUDGET_RANGES[budgetRange]?.label || budgetRange}
            </Badge>
          </motion.div>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-zinc-800 border-zinc-700 mb-6 w-full grid grid-cols-3" data-testid="equipment-category-tabs">
              <TabsTrigger value="rackets" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium text-xs sm:text-sm">
                <Target className="w-4 h-4 mr-1.5" /> {SPORT_TAB_LABELS[activeSportForLabels]?.primary || "Rackets"}
              </TabsTrigger>
              <TabsTrigger value="shoes" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium text-xs sm:text-sm">
                <Footprints className="w-4 h-4 mr-1.5" /> {SPORT_TAB_LABELS[activeSportForLabels]?.secondary || "Shoes"}
              </TabsTrigger>
              <TabsTrigger value="gear" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium text-xs sm:text-sm">
                <Package className="w-4 h-4 mr-1.5" /> Gear
              </TabsTrigger>
            </TabsList>

            {/* Rackets */}
            <TabsContent value="rackets">
              <div className="space-y-4">
                {racketFiltered.inBudget.map((rec, i) => (
                  <RecCard key={rec.equipment.id} rec={rec} i={i} expanded={expanded} setExpanded={setExpanded} showShoeSpecs={false} budgetRange={budgetRange} />
                ))}
                {racketFiltered.inBudget.length === 0 && racketFiltered.aboveBudget.length === 0 && (
                  <p className="text-zinc-500 text-center py-8">No {(SPORT_TAB_LABELS[activeSportForLabels]?.primary || "equipment").toLowerCase()} recommendations found.</p>
                )}

                {/* Above budget section */}
                {racketFiltered.aboveBudget.length > 0 && (
                  <div className="mt-6">
                    <Button
                      variant="ghost"
                      onClick={() => setShowAboveBudget(!showAboveBudget)}
                      className="w-full text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-2xl py-3 text-xs uppercase tracking-wide"
                    >
                      {showAboveBudget ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                      {racketFiltered.aboveBudget.length} options above your budget
                    </Button>
                    <AnimatePresence>
                      {showAboveBudget && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-4 mt-4"
                        >
                          {racketFiltered.aboveBudget.map((rec, i) => (
                            <RecCard key={rec.equipment.id} rec={rec} i={i + racketFiltered.inBudget.length} expanded={expanded} setExpanded={setExpanded} showShoeSpecs={false} budgetRange={budgetRange} />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Shoes */}
            <TabsContent value="shoes">
              <div className="space-y-4">
                {shoeFiltered.inBudget.map((rec, i) => (
                  <RecCard key={rec.equipment.id} rec={rec} i={i} expanded={expanded} setExpanded={setExpanded} showShoeSpecs={true} budgetRange={budgetRange} />
                ))}
                {shoeFiltered.inBudget.length === 0 && shoeFiltered.aboveBudget.length === 0 && (
                  <p className="text-zinc-500 text-center py-8">No shoe recommendations found.</p>
                )}

                {shoeFiltered.aboveBudget.length > 0 && (
                  <div className="mt-6">
                    <Button
                      variant="ghost"
                      onClick={() => setShowAboveBudget(!showAboveBudget)}
                      className="w-full text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-2xl py-3 text-xs uppercase tracking-wide"
                    >
                      {showAboveBudget ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                      {shoeFiltered.aboveBudget.length} options above your budget
                    </Button>
                    <AnimatePresence>
                      {showAboveBudget && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-4 mt-4"
                        >
                          {shoeFiltered.aboveBudget.map((rec, i) => (
                            <RecCard key={rec.equipment.id} rec={rec} i={i + shoeFiltered.inBudget.length} expanded={expanded} setExpanded={setExpanded} showShoeSpecs={true} budgetRange={budgetRange} />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Essential Gear */}
            <TabsContent value="gear">
              {gearData?.gear && Object.keys(gearData.gear).map(cat => {
                const items = gearData.gear[cat];
                if (!items?.length) return null;
                return (
                  <div key={cat} className="mb-6">
                    <h3 className="font-heading font-semibold text-lg text-white uppercase tracking-tight mb-3" data-testid={`gear-category-${cat}`}>
                      {CAT_LABELS[cat] || cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {items.map((g) => (
                        <GearCard key={g.equipment.id} item={g.equipment} prices={g.prices} reason={g.reason} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {!gearData?.gear && <p className="text-zinc-500 text-center py-8">No gear recommendations found.</p>}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Sport Quiz Modal */}
      <SportQuizModal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        sport={quizSport}
        sportConfig={quizSportConfig}
        onComplete={handleQuizComplete}
      />
    </div>
  );
}
