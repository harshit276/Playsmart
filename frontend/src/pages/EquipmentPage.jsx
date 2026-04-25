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
  ShoppingCart, Footprints, Package, IndianRupee, MapPin,
  CheckCircle2, ClipboardList, ArrowRight, Loader2
} from "lucide-react";
import api from "@/lib/api";
import { swrGet } from "@/lib/cachedFetch";
import EnquireLocalShop from "@/components/EnquireLocalShop";
import { getSportEmoji, getSportLabel, SPORT_LABEL } from "@/lib/sportConfig";
import SEO from "@/components/SEO";

const BUDGET_RANGES = {
  "Under 2k": { min: 0, max: 2000, label: "Under \u20B92k" },
  "2k-4k": { min: 2000, max: 4000, label: "\u20B92k-4k" },
  "4k-8k": { min: 4000, max: 8000, label: "\u20B94k-8k" },
  "8k-12k": { min: 8000, max: 12000, label: "\u20B98k-12k" },
  "12k+": { min: 12000, max: 50000, label: "\u20B912k+" },
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

// ─── Premium Placeholder Image ───
const CATEGORY_PLACEHOLDER = {
  // Rackets / Paddles / Blades
  racket: { emoji: "\uD83C\uDFF8", gradient: "from-emerald-600 to-teal-900" },
  tennis_racket: { emoji: "\uD83C\uDFBE", gradient: "from-yellow-600 to-lime-900" },
  tt_blade: { emoji: "\uD83C\uDFD3", gradient: "from-red-600 to-rose-900" },
  pb_paddle: { emoji: "\uD83C\uDFD3", gradient: "from-blue-600 to-indigo-900" },
  cricket_bat: { emoji: "\uD83C\uDFCF", gradient: "from-amber-600 to-yellow-900" },
  // Shoes
  shoes: { emoji: "\uD83D\uDC5F", gradient: "from-sky-600 to-blue-900" },
  tennis_shoes: { emoji: "\uD83D\uDC5F", gradient: "from-sky-600 to-blue-900" },
  tt_rubber: { emoji: "\uD83E\uDDF1", gradient: "from-rose-600 to-red-900" },
  pb_shoes: { emoji: "\uD83D\uDC5F", gradient: "from-violet-600 to-purple-900" },
  cricket_shoes: { emoji: "\uD83D\uDC5F", gradient: "from-amber-600 to-orange-900" },
  football_boots: { emoji: "\u26BD", gradient: "from-green-600 to-emerald-900" },
  // Accessories / Gear
  shuttlecock: { emoji: "\uD83C\uDFF8", gradient: "from-zinc-500 to-zinc-800" },
  string: { emoji: "\uD83E\uDDF5", gradient: "from-purple-600 to-violet-900" },
  tennis_string: { emoji: "\uD83E\uDDF5", gradient: "from-purple-600 to-violet-900" },
  grip: { emoji: "\u270A", gradient: "from-orange-600 to-amber-900" },
  bag: { emoji: "\uD83C\uDFD2", gradient: "from-zinc-600 to-zinc-900" },
  goggles: { emoji: "\uD83E\uDD3D", gradient: "from-cyan-600 to-teal-900" },
  swimsuit: { emoji: "\uD83E\uDE72", gradient: "from-blue-500 to-cyan-900" },
};
const DEFAULT_PLACEHOLDER = { emoji: "\u26A1", gradient: "from-zinc-600 to-zinc-900" };

function PlaceholderImage({ category, name, size = 80 }) {
  const cfg = CATEGORY_PLACEHOLDER[category] || DEFAULT_PLACEHOLDER;
  return (
    <div
      className={`w-full h-full bg-gradient-to-br ${cfg.gradient} flex flex-col items-center justify-center gap-0.5 select-none`}
      style={{ width: size, height: size }}
    >
      <span className="leading-none" style={{ fontSize: size * 0.38 }}>{cfg.emoji}</span>
      {name && <span className="text-white/70 font-bold text-center leading-tight px-1 truncate w-full" style={{ fontSize: Math.max(8, size * 0.11) }}>{name}</span>}
    </div>
  );
}

function ProductImage({ src, alt, category, name, size = 80 }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <PlaceholderImage category={category} name={name} size={size} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function RecCard({ rec, i, showShoeSpecs, budgetRange, detailsTab, setDetailsTab }) {
  const eq = rec.equipment;
  const sc = rec.score;
  const toggleKey = `${showShoeSpecs ? 's' : 'r'}-${i}`;
  const lowestPrice = rec.prices?.length > 0 ? Math.min(...rec.prices.map(p => p.price)) : null;
  const budgetMax = BUDGET_RANGES[budgetRange]?.max || 999999;
  const isAboveBudget = lowestPrice && lowestPrice > budgetMax;
  const showingDetails = detailsTab === toggleKey;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.08 }}
      whileHover={{ scale: 1.005 }}
      className={`bg-zinc-900/80 border rounded-2xl overflow-hidden transition-all hover:shadow-lg hover:shadow-lime-400/5 ${
        isAboveBudget ? "border-zinc-800/50 opacity-80" : "border-zinc-800 hover:border-lime-400/30"
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
            <ProductImage
              src={eq.image_url || eq.image}
              alt={eq.name || eq.model}
              category={eq.category}
              name={eq.brand || eq.name || eq.model}
              size={80}
            />
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
              {/* Price - prominent display */}
              {lowestPrice ? (
                <p className="text-lg text-lime-400 font-bold mt-0.5">
                  {lowestPrice.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                  {rec.prices?.length > 1 && <span className="text-xs text-zinc-500 font-normal ml-1.5">lowest of {rec.prices.length} stores</span>}
                </p>
              ) : eq.price_ranges?.INR ? (
                <p className="text-lg text-lime-400 font-bold mt-0.5">
                  {"\u20B9"}{eq.price_ranges.INR.min?.toLocaleString("en-IN")} - {"\u20B9"}{eq.price_ranges.INR.max?.toLocaleString("en-IN")}
                </p>
              ) : eq.price_range_value ? (
                <p className="text-lg text-lime-400 font-bold mt-0.5">
                  {"\u20B9"}{eq.price_range_value?.toLocaleString("en-IN")}
                </p>
              ) : null}
              {eq.description && (
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{eq.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {showShoeSpecs ? (
                  <>
                    {eq.weight_grams && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.weight_grams}g</Badge>}
                    {eq.cushioning && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.cushioning}</Badge>}
                    {eq.ankle_support && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.ankle_support} Cut</Badge>}
                  </>
                ) : (
                  <>
                    {eq.weight_category && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.weight_category}</Badge>}
                    {eq.balance_type && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.balance_type}</Badge>}
                    {eq.shaft_flexibility && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.shaft_flexibility}</Badge>}
                    {eq.blade_type && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.blade_type}</Badge>}
                    {eq.rubber_type && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.rubber_type}</Badge>}
                    {eq.shape && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.shape}</Badge>}
                    {eq.string_pattern && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.string_pattern}</Badge>}
                  </>
                )}
                {eq.price_range && <Badge className="bg-zinc-800 text-zinc-400 text-[10px]">{eq.price_range}</Badge>}
              </div>
            </div>
            <ScoreCircle score={sc.total} />
          </div>

          {/* "Why This?" - always visible */}
          {rec.explanation && (
            <div className="mt-3 flex gap-2 items-start bg-lime-400/5 border border-lime-400/10 rounded-xl p-3">
              <Sparkles className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-300 leading-relaxed" data-testid={`explanation-${toggleKey}`}>{rec.explanation}</p>
            </div>
          )}

          <div className="mt-3 space-y-1.5">
            <ScoreBar label="Skill" value={sc.skill_match} max={40} />
            <ScoreBar label="Style" value={sc.play_style_match} max={30} color="bg-sky-400" />
            <ScoreBar label="Budget" value={sc.budget_match} max={20} color="bg-purple-400" />
            <ScoreBar label="Perf." value={sc.performance_fit} max={10} color="bg-amber-400" />
          </div>

          <PriceRow prices={rec.prices} buyLinks={rec.buy_links || eq.buy_links} />

          {/* Enquire local shop CTA */}
          <div className="mt-3">
            <EnquireLocalShop productName={eq.name || eq.model || "this product"} sport={eq.sport}>
              <button className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-400/10 hover:bg-amber-400/20 text-amber-400 border border-amber-400/20 transition-colors">
                <MapPin className="w-3.5 h-3.5" /> Enquire Local Shop · Callback in 1-2 hr
              </button>
            </EnquireLocalShop>
          </div>
        </div>
      </div>

      {/* Expandable details: Specs + Buy Now */}
      <div className="px-5 pb-2">
        <Button variant="ghost" onClick={() => setDetailsTab(showingDetails ? null : toggleKey)}
          className="w-full text-zinc-500 hover:text-lime-400 text-xs uppercase tracking-wide" data-testid={`expand-${toggleKey}`}>
          {showingDetails ? <><ChevronUp className="w-3 h-3 mr-1" /> Less Details</> : <><ChevronDown className="w-3 h-3 mr-1" /> Specs & Buy Options</>}
        </Button>
      </div>

      <AnimatePresence>
        {showingDetails && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-5 pb-5"
          >
            <Separator className="bg-zinc-800 mb-4" />
            <Tabs defaultValue="specs" className="w-full">
              <TabsList className="bg-zinc-800 border-zinc-700 mb-4 w-full grid grid-cols-2">
                <TabsTrigger value="specs" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Specs</TabsTrigger>
                <TabsTrigger value="prices" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Buy Now</TabsTrigger>
              </TabsList>

              <TabsContent value="specs">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {showShoeSpecs ? (
                    [["Weight", `${eq.weight_grams}g`], ["Cushioning", eq.cushioning], ["Sole", eq.sole_type], ["Ankle Support", eq.ankle_support], ["Breathability", `${eq.breathability}/10`], ["Durability", `${eq.durability}/10`]].filter(([, v]) => v != null && v !== "undefined" && v !== "undefined/10").map(([k, v]) => (
                      <div key={k} className="flex justify-between p-2 bg-zinc-800/50 rounded-xl"><span className="text-zinc-500">{k}</span><span className="text-zinc-200 font-medium">{v}</span></div>
                    ))
                  ) : (
                    [
                      eq.weight_category && ["Weight", eq.weight_category + (eq.actual_weight_grams ? ` (${eq.actual_weight_grams}g)` : eq.weight_grams ? ` (${eq.weight_grams}g)` : "")],
                      eq.balance_type && ["Balance", eq.balance_type + (eq.balance_point_mm ? ` (${eq.balance_point_mm}mm)` : "")],
                      eq.balance && ["Balance", eq.balance],
                      eq.shaft_flexibility && ["Shaft", eq.shaft_flexibility],
                      eq.frame_material && ["Frame", eq.frame_material],
                      eq.max_string_tension_lbs && ["Max Tension", eq.max_string_tension_lbs + " lbs"],
                      eq.grip_size && ["Grip", eq.grip_size],
                      eq.plies && ["Plies", eq.plies],
                      eq.blade_type && ["Blade Type", eq.blade_type],
                      eq.handle_type && ["Handle", eq.handle_type],
                      eq.head_size && ["Head Size", eq.head_size + " sq in"],
                      eq.stiffness && ["Stiffness", eq.stiffness],
                      eq.core && ["Core", eq.core],
                      eq.face && ["Face", eq.face],
                      eq.shape && ["Shape", eq.shape],
                      eq.rubber_type && ["Rubber Type", eq.rubber_type],
                      eq.sponge_thickness && ["Sponge", eq.sponge_thickness],
                      eq.speed != null && ["Speed", `${eq.speed}/10`],
                      eq.control != null && ["Control", `${eq.control}/10`],
                      eq.spin != null && ["Spin", `${eq.spin}/10`],
                      eq.attack_score != null && ["Attack", `${eq.attack_score}/10`],
                      eq.control_score != null && ["Control", `${eq.control_score}/10`],
                      eq.speed_score != null && ["Speed", `${eq.speed_score}/10`],
                      eq.forgiveness_score != null && ["Forgiveness", `${eq.forgiveness_score}/10`],
                    ].filter(Boolean).map(([k, v]) => (
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
  const lowestPrice = prices?.length > 0 ? Math.min(...prices.map(p => p.price)) : null;
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 hover:shadow-lg hover:shadow-lime-400/5 transition-all"
      data-testid={`gear-card-${eq.id}`}
    >
      <div className="flex gap-4 items-start">
        <div className="w-16 h-16 rounded-xl bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
          <ProductImage
            src={eq.image_url || eq.image}
            alt={eq.name || eq.model}
            category={eq.category}
            name={eq.brand || eq.name || eq.model}
            size={64}
          />
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
          <h4 className="font-heading font-bold text-base text-white tracking-tight">{eq.model || eq.name}</h4>
          {lowestPrice && (
            <p className="text-base text-lime-400 font-bold mt-0.5">
              {lowestPrice.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </p>
          )}
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{eq.description}</p>
          {reason && (
            <div className="flex gap-1.5 items-start mt-1.5 bg-lime-400/5 border border-lime-400/10 rounded-lg p-2">
              <Sparkles className="w-3 h-3 text-lime-400 shrink-0 mt-0.5" />
              <p className="text-xs text-lime-400/80 italic">{reason}</p>
            </div>
          )}
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
      { value: "Under 2k", label: "Under \u20B92,000", desc: "Good quality essentials" },
      { value: "2k-4k", label: "\u20B92,000-4,000", desc: "Great value picks" },
      { value: "4k-8k", label: "\u20B94,000-8,000", desc: "Balanced performance and value" },
      { value: "8k-12k", label: "\u20B98,000-12,000", desc: "High-end equipment" },
      { value: "12k+", label: "\u20B912,000+", desc: "Top-tier professional gear" },
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
  const [stringsData, setStringsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsTab, setDetailsTab] = useState(null);

  // Set page title
  useEffect(() => { document.title = "Equipment | AthlyticAI"; }, []);
  const [activeTab, setActiveTab] = useState("rackets");

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
  const defaultBudget = sportSpecificBudget || profile?.budget_range || "2k-4k";
  const [selectedBudget, setSelectedBudget] = useState(defaultBudget);
  const budgetRange = selectedBudget;

  // Sync selectedBudget when sport or profile changes
  useEffect(() => {
    const newDefault = sportsProfiles[selectedSport]?.budget_range || profile?.budget_range || "2k-4k";
    setSelectedBudget(newDefault);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSport, profile?.budget_range, sportSpecificBudget]);

  // Fetch all available sports on mount
  useEffect(() => {
    api.get("/sports").then(res => {
      setAllSports(res.data.sports || []);
    }).catch(() => {});
  }, []);

  const [fetchError, setFetchError] = useState(false);

  const fetchData = useCallback(async (sport, budget) => {
    const userId = user?.id || "guest";
    setFetchError(false);
    const sportParam = sport ? `&sport=${sport}` : '';
    const sportQuery = sport ? `?sport=${sport}` : '';
    const budgetKey = budget || selectedBudget || "2k-4k";
    const bRange = BUDGET_RANGES[budgetKey];
    const budgetParam = bRange ? `&budget_min=${bRange.min}&budget_max=${bRange.max}` : '';

    // Build URL list. Each call is wrapped in SWR — if we have cached data
    // we render it instantly (no spinner) and refresh in the background.
    const urls = {
      racket: `/recommendations/equipment/${userId}?category=racket${sportParam}${budgetParam}`,
      shoes:  `/recommendations/equipment/${userId}?category=shoes${sportParam}${budgetParam}`,
      gear:   `/recommendations/gear/${userId}${sportQuery}`,
      strings: sport === "badminton"
        ? `/recommendations/equipment/${userId}?category=strings&sport=badminton${budgetParam}`
        : null,
    };

    // Hydrate from cache synchronously — instant render on revisits / budget switches
    const swrCalls = {};
    let anyCached = false;
    for (const [key, url] of Object.entries(urls)) {
      if (!url) continue;
      const { cached, fresh } = swrGet(url, { timeout: 15000 });
      swrCalls[key] = { cached, fresh };
      if (cached) anyCached = true;
    }

    // Apply cached values immediately
    if (swrCalls.racket?.cached) setRacketData(swrCalls.racket.cached);
    if (swrCalls.shoes?.cached) setShoeData(swrCalls.shoes.cached);
    if (swrCalls.gear?.cached) setGearData(swrCalls.gear.cached);
    if (swrCalls.strings?.cached) setStringsData(swrCalls.strings.cached);

    // No cache → show spinner. With cache → keep current data visible.
    if (!anyCached) {
      setRacketData(null);
      setShoeData(null);
      setGearData(null);
      setStringsData(null);
      setLoading(true);
    } else {
      setLoading(false);
    }

    // Background refresh — silently update when fresh data arrives
    let anySuccess = anyCached;
    const refreshes = [];
    if (swrCalls.racket) refreshes.push(swrCalls.racket.fresh.then(d => { setRacketData(d); anySuccess = true; }).catch(() => {}));
    if (swrCalls.shoes)  refreshes.push(swrCalls.shoes.fresh.then(d  => { setShoeData(d);   anySuccess = true; }).catch(() => {}));
    if (swrCalls.gear)   refreshes.push(swrCalls.gear.fresh.then(d   => { setGearData(d);   anySuccess = true; }).catch(() => {}));
    if (swrCalls.strings) refreshes.push(swrCalls.strings.fresh.then(d => { setStringsData(d); anySuccess = true; }).catch(() => {}));

    await Promise.allSettled(refreshes);
    if (!anySuccess) setFetchError(true);
    setLoading(false);
  }, [user?.id, selectedBudget]);

  // Fetch equipment whenever sport/budget changes — never leave the page
  // hanging on a spinner. Guests, logged-in users, configured-or-not — all
  // hit the recommendation endpoint which has sane fallbacks.
  useEffect(() => {
    fetchData(selectedSport, selectedBudget);
  }, [selectedSport, selectedBudget, fetchData]);

  const handleSelectSport = (sportKey) => {
    const isConfigured = configuredSports.includes(sportKey) ||
      (sportsProfiles[sportKey] && Object.keys(sportsProfiles[sportKey]).length > 0);

    if (isConfigured) {
      // Already configured - switch directly
      setSelectedSport(sportKey);
      setSearchParams(sportKey === profile?.active_sport ? {} : { sport: sportKey });
      setActiveTab("rackets");
      setDetailsTab(null);

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
      // For logged-in users, save quiz to server
      if (user?.id) {
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
        } catch (err) {
          console.warn("Quiz save failed, continuing with local state:", err);
        }
      }
      setQuizOpen(false);
      // Now switch to that sport and fetch equipment
      setSelectedSport(quizSport);
      setSearchParams(quizSport === profile?.active_sport ? {} : { sport: quizSport });
      setActiveTab("rackets");
      setDetailsTab(null);

      // Fetch after a tick so profile state has updated
      if (user?.id) {
        setTimeout(() => fetchData(quizSport, selectedBudget), 100);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error("Quiz submission failed:", err);
    }
  };

  // Top-3 picks (the personal recommendation), rest get bumped into the
  // "Other suitable equipment" section. Avoids overwhelming the user.
  const PRIMARY_LIMIT = 3;
  const racketAll = racketData?.recommendations || [];
  const racketAlsoExplore = racketData?.also_explore || [];
  const racketFiltered = {
    inBudget: racketAll.slice(0, PRIMARY_LIMIT),
    aboveBudget: [...racketAll.slice(PRIMARY_LIMIT), ...racketAlsoExplore],
  };
  const shoeAll = shoeData?.recommendations || [];
  const shoeAlsoExplore = shoeData?.also_explore || [];
  const shoeFiltered = {
    inBudget: shoeAll.slice(0, PRIMARY_LIMIT),
    aboveBudget: [...shoeAll.slice(PRIMARY_LIMIT), ...shoeAlsoExplore],
  };

  const activeSportForLabels = selectedSport || profile?.active_sport;

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="equipment-page">
      <SEO
        title="Best Sports Equipment Recommendations - Rackets, Shoes, Gear"
        description="AI-powered equipment recommendations based on your skill level, play style, and budget. Find the best badminton rackets, tennis racquets, table tennis paddles, and more from top brands like Yonex, Wilson, Butterfly, DHS."
        keywords="best badminton racket, tennis racquet recommendation, table tennis paddle, sports equipment India, badminton shoes, Yonex racket review, Wilson tennis"
        url="https://athlyticai.com/equipment"
      />
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

          {/* Budget Selector */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 mb-6"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-lime-400/10 flex items-center justify-center">
                <IndianRupee className="w-5 h-5 text-lime-400" />
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Your Budget</p>
                <p className="text-sm font-bold text-white">
                  {BUDGET_RANGES[budgetRange]?.label || budgetRange}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(BUDGET_RANGES).map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() => setSelectedBudget(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    selectedBudget === key
                      ? "bg-lime-400/20 text-lime-400 border-lime-400/40"
                      : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse bg-zinc-800 rounded-2xl h-48" />
            ))}
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="w-12 h-12 text-zinc-700 mb-3" />
            <p className="text-zinc-400 text-lg font-medium mb-1">Could not load equipment</p>
            <p className="text-zinc-600 text-sm mb-4">Server is taking too long. Please try again.</p>
            <Button onClick={() => fetchData(selectedSport, selectedBudget)} className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-6">
              Retry
            </Button>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`bg-zinc-800 border-zinc-700 mb-6 w-full grid ${selectedSport === "badminton" ? "grid-cols-4" : "grid-cols-3"}`} data-testid="equipment-category-tabs">
              <TabsTrigger value="rackets" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium text-xs sm:text-sm">
                <Target className="w-4 h-4 mr-1.5" /> {SPORT_TAB_LABELS[activeSportForLabels]?.primary || "Rackets"}
              </TabsTrigger>
              <TabsTrigger value="shoes" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium text-xs sm:text-sm">
                <Footprints className="w-4 h-4 mr-1.5" /> {SPORT_TAB_LABELS[activeSportForLabels]?.secondary || "Shoes"}
              </TabsTrigger>
              {selectedSport === "badminton" && (
                <TabsTrigger value="strings" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium text-xs sm:text-sm">
                  <Sparkles className="w-4 h-4 mr-1.5" /> Strings
                </TabsTrigger>
              )}
              <TabsTrigger value="gear" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium text-xs sm:text-sm">
                <Package className="w-4 h-4 mr-1.5" /> Gear
              </TabsTrigger>
            </TabsList>

            {/* Rackets */}
            <TabsContent value="rackets">
              <div className="space-y-4">
                {racketFiltered.inBudget.length > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-lime-400" />
                    <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
                      Recommended for Your Budget ({BUDGET_RANGES[budgetRange]?.label || budgetRange})
                    </h3>
                  </div>
                )}
                {racketFiltered.inBudget.map((rec, i) => (
                  <RecCard key={rec.equipment.id} rec={rec} i={i} showShoeSpecs={false} budgetRange={budgetRange} detailsTab={detailsTab} setDetailsTab={setDetailsTab} />
                ))}
                {racketFiltered.inBudget.length === 0 && racketFiltered.aboveBudget.length === 0 && (
                  <p className="text-zinc-500 text-center py-8">No {(SPORT_TAB_LABELS[activeSportForLabels]?.primary || "equipment").toLowerCase()} recommendations found.</p>
                )}

                {/* Above budget section - "You Might Also Like" */}
                {racketFiltered.aboveBudget.length > 0 && (
                  <div className="mt-8">
                    <div className="flex items-center gap-2 mb-3">
                      <Star className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                        Other Suitable Options
                      </h3>
                      <span className="text-xs text-zinc-600">({racketFiltered.aboveBudget.length})</span>
                    </div>
                    <Separator className="bg-zinc-800 mb-4" />
                    <div className="space-y-4">
                      {racketFiltered.aboveBudget.map((rec, i) => (
                        <RecCard key={rec.equipment.id} rec={rec} i={i + racketFiltered.inBudget.length} showShoeSpecs={false} budgetRange={budgetRange} detailsTab={detailsTab} setDetailsTab={setDetailsTab} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Shoes */}
            <TabsContent value="shoes">
              <div className="space-y-4">
                {shoeFiltered.inBudget.length > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-lime-400" />
                    <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
                      Recommended for Your Budget ({BUDGET_RANGES[budgetRange]?.label || budgetRange})
                    </h3>
                  </div>
                )}
                {shoeFiltered.inBudget.map((rec, i) => (
                  <RecCard key={rec.equipment.id} rec={rec} i={i} showShoeSpecs={true} budgetRange={budgetRange} detailsTab={detailsTab} setDetailsTab={setDetailsTab} />
                ))}
                {shoeFiltered.inBudget.length === 0 && shoeFiltered.aboveBudget.length === 0 && (
                  <p className="text-zinc-500 text-center py-8">No shoe recommendations found.</p>
                )}

                {/* Above budget section - "You Might Also Like" */}
                {shoeFiltered.aboveBudget.length > 0 && (
                  <div className="mt-8">
                    <div className="flex items-center gap-2 mb-3">
                      <Star className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                        Other Suitable Options
                      </h3>
                      <span className="text-xs text-zinc-600">({shoeFiltered.aboveBudget.length})</span>
                    </div>
                    <Separator className="bg-zinc-800 mb-4" />
                    <div className="space-y-4">
                      {shoeFiltered.aboveBudget.map((rec, i) => (
                        <RecCard key={rec.equipment.id} rec={rec} i={i + shoeFiltered.inBudget.length} showShoeSpecs={true} budgetRange={budgetRange} detailsTab={detailsTab} setDetailsTab={setDetailsTab} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Strings (badminton only) */}
            {selectedSport === "badminton" && (
              <TabsContent value="strings">
                <div className="space-y-4">
                  {(stringsData?.recommendations || []).length > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-lime-400" />
                      <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
                        Recommended Strings ({BUDGET_RANGES[budgetRange]?.label || budgetRange})
                      </h3>
                    </div>
                  )}
                  {(stringsData?.recommendations || []).map((rec, i) => (
                    <RecCard key={rec.equipment.id} rec={rec} i={i} showShoeSpecs={false} budgetRange={budgetRange} detailsTab={detailsTab} setDetailsTab={setDetailsTab} />
                  ))}
                  {(stringsData?.recommendations || []).length === 0 && (stringsData?.also_explore || []).length === 0 && (
                    <p className="text-zinc-500 text-center py-8">No string recommendations found.</p>
                  )}
                  {(stringsData?.also_explore || []).length > 0 && (
                    <div className="mt-8">
                      <div className="flex items-center gap-2 mb-3">
                        <Star className="w-4 h-4 text-amber-400" />
                        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                          You Might Also Like
                        </h3>
                        <span className="text-xs text-zinc-600">({(stringsData?.also_explore || []).length} above budget)</span>
                      </div>
                      <Separator className="bg-zinc-800 mb-4" />
                      <div className="space-y-4">
                        {(stringsData?.also_explore || []).map((rec, i) => (
                          <RecCard key={rec.equipment.id} rec={rec} i={i + (stringsData?.recommendations || []).length} showShoeSpecs={false} budgetRange={budgetRange} detailsTab={detailsTab} setDetailsTab={setDetailsTab} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

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
