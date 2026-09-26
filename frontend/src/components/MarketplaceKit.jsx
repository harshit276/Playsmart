/**
 * Marketplace kit — the product cards, filters, sheets and "Get my picks"
 * hero shared by /marketplace and every /<sport>/equipment gear guide, so the
 * two can never drift apart visually.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart, MapPin, X, Sparkles, ChevronRight, Wand2,
  Footprints, Backpack, Shirt, Dumbbell, Grip,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EnquireLocalShop from "@/components/EnquireLocalShop";
import { withAffiliate } from "@/lib/affiliateLinks";
import { productImageFor } from "@/lib/productImage";
import { AnimatedNumber } from "@/components/AnimatedStat";

export const SPORTS = [
  { key: "all", label: "All", emoji: "🌐" },
  { key: "badminton", label: "Badminton", emoji: "🏸" },
  { key: "tennis", label: "Tennis", emoji: "🎾" },
  { key: "table_tennis", label: "Table Tennis", emoji: "🏓" },
  { key: "pickleball", label: "Pickleball", emoji: "⚡" },
  { key: "cricket", label: "Cricket", emoji: "🏏" },
  { key: "football", label: "Football", emoji: "⚽" },
  { key: "swimming", label: "Swimming", emoji: "🏊" },
];

export const PRICE_BUCKETS = [
  { key: "all", label: "Any price", min: 0, max: Infinity },
  { key: "u2k", label: "Under ₹2k", min: 0, max: 2000 },
  { key: "2-5k", label: "₹2k–5k", min: 2000, max: 5000 },
  { key: "5-10k", label: "₹5k–10k", min: 5000, max: 10000 },
  { key: "10k+", label: "₹10k+", min: 10000, max: Infinity },
];

export const SORTS = [
  { key: "popular", label: "Popular" },
  { key: "price_low", label: "Price · Low → High" },
  { key: "price_high", label: "Price · High → Low" },
  { key: "name", label: "Name · A–Z" },
];

export const CATEGORY_LABELS = {
  rackets: "Rackets", shoes: "Shoes", strings: "Strings", grips: "Grips",
  shuttlecocks: "Shuttlecocks", blades: "TT Blades", rubbers: "TT Rubbers",
  ready_made_rackets: "TT Ready-Made", balls: "Balls",
  tennis_rackets: "Tennis Rackets", tennis_shoes: "Tennis Shoes",
  tennis_strings: "Tennis Strings", tennis_balls: "Tennis Balls",
  paddles: "Paddles", bats: "Bats", pads: "Pads", gloves: "Gloves",
  helmets: "Helmets", boots: "Boots",
  footballs: "Footballs", shin_guards: "Shin Guards", goalkeeper_gloves: "Goalkeeper Gloves",
  goggles: "Goggles", swimsuits: "Swimsuits", swim_caps: "Swim Caps", fins: "Fins",
  pull_buoys: "Pull Buoys",
};

export function lowestPrice(item) {
  const prices = (item.marketplace_prices || []).map((p) => p.price).filter((n) => typeof n === "number");
  if (prices.length) return Math.min(...prices);
  return item.price_ranges?.INR?.min || 999999;
}

// ─── Hero: recommendation CTA strip + active-recommendation badge ───
const GOAL_LABEL = {
  technique: "Improve technique",
  compete: "Win matches",
  fitness: "Stay fit",
  casual: "Casual fun",
};

export function RecommendHero({ recommendActive, sport, skillLevel, bucket, goal, description, serverPicks, picksLoading, onOpen, onClear, totalCount, filteredCount, sportLocked = false }) {
  const sportLabel = SPORTS.find(s => s.key === sport)?.label;
  const bucketLabel = PRICE_BUCKETS.find(b => b.key === bucket)?.label;
  const goalLabel = GOAL_LABEL[goal];
  if (recommendActive) {
    const aiTaggedCount = serverPicks?.items?.length || 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className="mb-4 rounded-2xl border border-lime-400/40 bg-gradient-to-br from-lime-400/10 via-emerald-900/10 to-zinc-950 p-4 sm:p-5"
      >
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-lime-400/15 flex items-center justify-center shrink-0">
            {picksLoading
              ? <div className="w-4 h-4 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
              : <Sparkles className="w-5 h-5 text-lime-400" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold">
              {picksLoading ? "AI is ranking picks…" : "Personalised for you"}
            </p>
            <p className="text-sm sm:text-base font-bold text-white mt-0.5 truncate">
              {filteredCount} {sportLabel || "sport"} pick{filteredCount === 1 ? "" : "s"}
              {skillLevel ? ` · ${skillLevel}` : ""}
              {bucketLabel && bucket !== "all" ? ` · ${bucketLabel}` : ""}
              {goalLabel ? ` · ${goalLabel}` : ""}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {aiTaggedCount > 0
                ? `Top ${aiTaggedCount} ranked by our AI engine — see "Why this fits you" on each card.`
                : "Ranked locally · skill/budget/goal match on each card."}
            </p>
            {description && (
              <div className="mt-2 inline-flex items-start gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900/60 border border-zinc-800 max-w-full">
                <span className="text-[10px] text-zinc-500 shrink-0">You said:</span>
                <span className="text-[11px] text-zinc-300 line-clamp-2">"{description}"</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={onOpen} variant="outline" size="sm"
              className="border-lime-400/40 text-lime-300 hover:bg-lime-400/10 text-xs h-9 rounded-lg">
              <Wand2 className="w-3.5 h-3.5 mr-1.5" /> Adjust
            </Button>
            <Button onClick={onClear} variant="ghost" size="sm"
              className="text-zinc-400 hover:text-white text-xs h-9 rounded-lg">
              <X className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }
  return (
    <motion.button
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className="group w-full mb-4 rounded-2xl border border-zinc-800 bg-gradient-to-br from-lime-400/10 via-emerald-900/10 to-zinc-950 p-4 sm:p-5 text-left hover:border-lime-400/40 transition-colors"
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="w-12 h-12 rounded-xl bg-lime-400/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          <Sparkles className="w-6 h-6 text-lime-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-base font-bold text-white">
            Not sure what to buy? <span className="text-lime-300">Get my picks →</span>
          </p>
          <p className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">
            Answer 3 quick questions · we'll narrow {totalCount}{sportLocked && sportLabel ? ` ${sportLabel.toLowerCase()}` : ""} products to the right gear for your level + budget.
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-lime-400 transition-colors shrink-0" />
      </div>
    </motion.button>
  );
}

export function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 bg-lime-400/10 text-lime-300 border border-lime-400/30 rounded-full px-2.5 py-0.5">
      {label}
      <button onClick={onClear} className="hover:text-white"><X className="w-3 h-3" /></button>
    </span>
  );
}

export function BottomSheet({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-black/60 z-40" />
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-800 rounded-t-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
              <p className="text-sm font-bold text-white uppercase tracking-tight">{title}</p>
              <button onClick={onClose} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Resolve a RELIABLE buy URL for a price row. marketplace_prices[].url are
// often LLM-generated direct product pages (amazon.../dp/<ASIN>) that can
// 404; prefer the platform's SEARCH link from item.buy_links (always
// resolves), and fall back to a name-based search. This kills dead buy
// buttons while keeping the price as an indicative guide.
function reliableBuyUrl(priceEntry, item) {
  const platform = (priceEntry?.platform || "").toLowerCase();
  const bl = item?.buy_links || {};
  if (platform.includes("amazon") && bl.amazon) return bl.amazon;
  if (platform.includes("flipkart") && bl.flipkart) return bl.flipkart;
  const m = (bl.india || []).find((s) => (s.store || "").toLowerCase().includes(platform.split(" ")[0] || "_"));
  if (m?.url) return m.url;
  const q = encodeURIComponent(item?.name || "");
  if (platform.includes("flipkart")) return `https://www.flipkart.com/search?q=${q}`;
  if (platform.includes("decathlon")) return `https://www.decathlon.in/search?q=${q}`;
  if (q) return `https://www.amazon.in/s?k=${q}`;
  return priceEntry?.url || bl.amazon || "#";
}

// Store links for items that have no per-store price rows. Cricket, football
// and swimming only carry buy_links, so their cards used to show no buy
// button at all — only "Local shop" — and every click was lost revenue.
function searchStoreLinks(item) {
  const bl = item?.buy_links || {};
  const out = [];
  if (bl.amazon) out.push({ platform: "Amazon", url: bl.amazon });
  if (bl.flipkart) out.push({ platform: "Flipkart", url: bl.flipkart });
  if (!out.length && item?.name) {
    out.push({ platform: "Amazon", url: `https://www.amazon.in/s?k=${encodeURIComponent(item.name)}` });
  }
  return out;
}

const SPORT_GRADIENT = {
  badminton: "from-lime-500/20 via-emerald-700/20 to-zinc-900",
  tennis: "from-amber-500/20 via-orange-700/20 to-zinc-900",
  table_tennis: "from-sky-500/20 via-blue-700/20 to-zinc-900",
  pickleball: "from-emerald-500/20 via-teal-700/20 to-zinc-900",
  cricket: "from-blue-500/20 via-indigo-700/20 to-zinc-900",
  football: "from-green-500/20 via-emerald-700/20 to-zinc-900",
  swimming: "from-cyan-500/20 via-sky-700/20 to-zinc-900",
};

// Category → icon for the branded placeholder. lucide has no racket/shuttle
// icons, so racket/ball/shuttle categories fall back to the sport emoji
// (which is more recognizable anyway); shoes/bags/apparel/grips get a real
// glyph. Keyword-matched so it works across the 7 sports' category names.
const _CATEGORY_ICON = [
  [/shoe|footwear/i, Footprints],
  [/bag|kit|backpack/i, Backpack],
  [/apparel|cloth|jersey|shirt|wear|sock/i, Shirt],
  [/grip|string|tape|accessor/i, Grip],
  [/fitness|train|gym|weight|band|conditioning/i, Dumbbell],
];
function _categoryIcon(cat) {
  const c = String(cat || "");
  for (const [re, Icon] of _CATEGORY_ICON) if (re.test(c)) return Icon;
  return null;
}

// Premium branded placeholder shown when a product has no photo. A frosted
// icon disc (category glyph or sport emoji) over the sport gradient with a
// glossy top-light, then bold brand + category·type. Looks intentional and
// never breaks (no external image dependency).
function BrandedPlaceholder({ item, sportEmoji }) {
  const CatIcon = _categoryIcon(item._category);
  const sub = [item._category ? String(item._category).replace(/_/g, " ") : null, item.type]
    .filter(Boolean).join(" · ");
  return (
    <div className="w-full h-full relative flex flex-col items-center justify-center text-center px-3">
      {/* glossy top light + faint giant sport watermark */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10 pointer-events-none" />
      <span className="absolute text-[150px] opacity-[0.06] select-none leading-none">{sportEmoji}</span>
      {/* frosted icon disc */}
      <div className="relative z-10 w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 shadow-lg flex items-center justify-center mb-2.5">
        {CatIcon ? <CatIcon className="w-7 h-7 text-white/90" /> : <span className="text-3xl leading-none">{sportEmoji}</span>}
      </div>
      <p className="relative z-10 font-heading font-black text-xl uppercase tracking-tight text-white drop-shadow-lg leading-none">
        {item.brand}
      </p>
      {sub && (
        <p className="relative z-10 text-[9px] uppercase tracking-widest text-white/70 mt-1.5">{sub}</p>
      )}
    </div>
  );
}

export function ProductCard({ item, delay, showBlurb = false }) {
  const prices = item.marketplace_prices || [];
  const cheapest = prices.length ? prices.reduce((m, p) => (p.price < m.price ? p : m), prices[0]) : null;
  const isLimited = item.availability === "limited_online";
  const fallbackPrice = item.price_ranges?.INR;
  const grad = SPORT_GRADIENT[item._sport] || SPORT_GRADIENT.badminton;

  // Try the item's real image URL. On error, fall through to a clean
  // branded placeholder — no AI generation, since it was unreliable for
  // branded products.
  const { url: imgUrl } = productImageFor(item);
  const [imgErr, setImgErr] = useState(false);
  const showImage = imgUrl && !imgErr;
  const sportEmoji = (SPORTS.find((s) => s.key === item._sport) || {}).emoji || "🎯";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors flex flex-col">
      {/* Image — real photo if available, else a polished branded placeholder */}
      <div className={`relative aspect-square overflow-hidden bg-gradient-to-br ${grad}`}>
        {showImage ? (
          <img src={imgUrl} alt={item.name} loading="lazy" referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
            onError={() => setImgErr(true)} />
        ) : (
          <BrandedPlaceholder item={item} sportEmoji={sportEmoji} />
        )}
        {item.level && (
          <Badge className="absolute top-2 left-2 bg-zinc-900/80 text-zinc-200 border-zinc-700 text-[9px] backdrop-blur-sm">
            {item.level}
          </Badge>
        )}
        {isLimited && (
          <Badge className="absolute top-2 right-2 bg-amber-400/15 text-amber-300 border-amber-400/30 text-[9px] backdrop-blur-sm">
            Limited
          </Badge>
        )}
        {prices.length >= 2 && (
          <Badge className="absolute bottom-2 right-2 bg-purple-500/20 text-purple-200 border-purple-400/30 text-[9px] backdrop-blur-sm">
            {prices.length} stores
          </Badge>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold truncate">{item.brand}</p>
        <h3 className="text-sm font-bold text-white leading-tight line-clamp-2 mb-2 min-h-[2.5em]">{item.name}</h3>
        {showBlurb && item.description && (
          <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2 mb-2">{item.description}</p>
        )}

        {/* Cheapest price prominently */}
        {cheapest ? (
          <div className="mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white font-mono">₹{cheapest.price?.toLocaleString("en-IN")}</span>
              {prices.length > 1 && (() => {
                const max = Math.max(...prices.map(p => p.price));
                if (max > cheapest.price) {
                  return <span className="text-[10px] text-zinc-500 line-through">₹{max?.toLocaleString("en-IN")}</span>;
                }
                return null;
              })()}
            </div>
            <p className="text-[10px] text-zinc-500">on {cheapest.platform}</p>
          </div>
        ) : fallbackPrice ? (
          <p className="text-sm text-zinc-300 mb-2 font-mono">
            ₹{fallbackPrice.min?.toLocaleString("en-IN")}–{fallbackPrice.max?.toLocaleString("en-IN")}
          </p>
        ) : (
          <p className="text-xs text-zinc-600 mb-2">Price varies</p>
        )}

        <div className="mt-auto flex flex-col gap-1.5">
          {/* Best price button — primary */}
          {cheapest && (
            <a href={withAffiliate(reliableBuyUrl(cheapest, item))} target="_blank" rel="noopener noreferrer sponsored"
              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-lime-400 text-black hover:bg-lime-500 transition-colors">
              <ShoppingCart className="w-3 h-3" /> Buy on {cheapest.platform}
            </a>
          )}
          {/* No price rows — link to the store searches instead */}
          {!cheapest && (() => {
            const [first, ...rest] = searchStoreLinks(item);
            return (
              <>
                {first && (
                  <a href={withAffiliate(first.url)} target="_blank" rel="noopener noreferrer sponsored"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-lime-400 text-black hover:bg-lime-500 transition-colors">
                    <ShoppingCart className="w-3 h-3" /> Check price on {first.platform}
                  </a>
                )}
                {rest.map((l) => (
                  <a key={l.platform} href={withAffiliate(l.url)} target="_blank" rel="noopener noreferrer sponsored"
                    className="w-full inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[10px] bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors">
                    {l.platform}
                  </a>
                ))}
              </>
            );
          })()}
          {/* Other platforms */}
          {prices.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              {prices.filter(p => p !== cheapest).slice(0, 2).map((p, i) => (
                <a key={i} href={withAffiliate(reliableBuyUrl(p, item))} target="_blank" rel="noopener noreferrer sponsored"
                  className="flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[10px] bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors min-w-0">
                  <span className="truncate">{p.platform}</span>
                  <span className="font-mono shrink-0">₹{p.price}</span>
                </a>
              ))}
            </div>
          )}
          {/* Local shop */}
          <EnquireLocalShop productName={item.name} sport={item._sport}>
            <button className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/20 transition-colors">
              <MapPin className="w-3 h-3" /> Local shop
            </button>
          </EnquireLocalShop>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Enriched product card shown when the recommendation picker is active ───
// Renders pros/cons + a "fit" score panel (skill / budget / goal match) and
// the item's specs. Layout is wider (2-col on desktop) so there's room for
// the extra detail.

const TIER_ORDER = ["beginner", "intermediate", "advanced", "pro"];

// Compute skill match (0-100) from the user's level vs the item's level.
export function skillMatchScore(itemLevel, userLevel) {
  if (!userLevel) return 70;
  const il = (itemLevel || "").toLowerCase();
  const ul = userLevel.toLowerCase();
  if (!il) return 70;
  const iIdx = TIER_ORDER.findIndex((t) => il.includes(t));
  const uIdx = TIER_ORDER.indexOf(ul);
  if (iIdx < 0 || uIdx < 0) return 70;
  const gap = Math.abs(iIdx - uIdx);
  return gap === 0 ? 100 : gap === 1 ? 75 : gap === 2 ? 45 : 20;
}

// Compute budget match — how comfortably the item sits inside the chosen bucket
export function budgetMatchScore(item, bucketKey) {
  const b = PRICE_BUCKETS.find((x) => x.key === bucketKey) || PRICE_BUCKETS[0];
  const price = lowestPrice(item);
  if (!isFinite(price) || price <= 0) return 60;
  if (b.key === "all") return 80;
  if (price < b.min) return 80; // cheaper than range → still fine
  if (price > b.max) {
    const overshoot = price / b.max;
    if (overshoot < 1.2) return 50;
    if (overshoot < 1.5) return 25;
    return 10;
  }
  // Inside range — give 100 if hugging the lower half (better value)
  const span = b.max - b.min || 1;
  const pct = (price - b.min) / span; // 0 = cheap end, 1 = top end
  return Math.round(100 - pct * 25);
}

// Heuristic goal match based on item type / level / play_style / pros.
export function goalMatchScore(item, goal) {
  if (!goal) return 65;
  const text = `${item.type || ""} ${item.level || ""} ${(item.pros || []).join(" ")} ${item.description || ""}`.toLowerCase();
  const has = (...keywords) => keywords.some((k) => text.includes(k));
  switch (goal) {
    case "technique":
      // control, even balance, flexible shaft, all-round
      if (has("control", "all-round", "all round", "even balance", "flexible", "beginner")) return 90;
      if (has("power", "head-heavy", "stiff")) return 45;
      return 70;
    case "compete":
      if (has("tournament", "competitive", "pro", "advanced", "stiff", "head-heavy", "power")) return 90;
      if (has("beginner", "casual")) return 35;
      return 65;
    case "fitness":
      // light + forgiving = easier on the body for regular play
      if (has("light", "even balance", "flexible", "all-round", "intermediate")) return 85;
      if (has("heavy", "stiff", "pro")) return 50;
      return 70;
    case "casual":
      // cheap, beginner-friendly, durable
      if (has("beginner", "casual", "durable", "budget")) return 90;
      if (has("pro", "advanced", "competitive")) return 40;
      return 70;
    default:
      return 65;
  }
}

function FitBar({ label, value, color = "bg-lime-400" }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-zinc-500 w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="text-zinc-300 font-mono w-8 text-right">{value}</span>
    </div>
  );
}

function FitScore({ score }) {
  // Animated circular fit ring — fills to the score with a count-up number
  // when it scrolls into view. Colour-graded by strength of the match.
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  const pct = clamped / 100;
  const R = 22;
  const C = 2 * Math.PI * R;
  const stroke = clamped >= 80 ? "#a3e635" : clamped >= 60 ? "#38bdf8" : clamped >= 40 ? "#fbbf24" : "#fb7185";
  const textColor = clamped >= 80 ? "text-lime-400" : clamped >= 60 ? "text-sky-400" : clamped >= 40 ? "text-amber-400" : "text-rose-400";
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
        <circle cx="28" cy="28" r={R} fill="none" stroke="#27272a" strokeWidth="4" />
        <motion.circle
          cx="28" cy="28" r={R} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          whileInView={{ strokeDashoffset: C * (1 - pct) }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 4px ${stroke}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-heading font-bold text-base leading-none ${textColor}`}>
          <AnimatedNumber value={clamped} duration={1.1} />
        </span>
        <span className="text-[8px] uppercase tracking-wider text-zinc-500 mt-0.5">fit</span>
      </div>
    </div>
  );
}

function specBadges(item) {
  const s = item.specs || {};
  const out = [];
  if (s.weight) out.push(s.weight);
  if (s.balance) out.push(s.balance);
  if (s.shaft_flexibility) out.push(s.shaft_flexibility);
  if (item.blade_type) out.push(item.blade_type);
  if (item.rubber_type) out.push(item.rubber_type);
  if (item.shape) out.push(item.shape);
  if (s.material && out.length < 3) out.push(s.material);
  if (s.string_tension && out.length < 4) out.push(s.string_tension);
  return out.slice(0, 5);
}

export function RecommendedProductCard({ item, delay, level, bucket, goal, serverPick }) {
  const prices = item.marketplace_prices || [];
  const cheapest = prices.length ? prices.reduce((m, p) => (p.price < m.price ? p : m), prices[0]) : null;
  const fallbackPrice = item.price_ranges?.INR;
  const grad = SPORT_GRADIENT[item._sport] || SPORT_GRADIENT.badminton;
  const { url: imgUrl } = productImageFor(item);
  const [imgErr, setImgErr] = useState(false);
  const showImage = imgUrl && !imgErr;
  const sportEmoji = (SPORTS.find((s) => s.key === item._sport) || {}).emoji || "🎯";
  const isLimited = item.availability === "limited_online";

  // If the server returned a ranked pick for this item, prefer its scores
  // and reasoning chains. Otherwise fall back to local heuristic scoring.
  const localSkill = skillMatchScore(item.level, level);
  const localBudget = budgetMatchScore(item, bucket);
  const localGoal = goalMatchScore(item, goal);
  const skill = serverPick?.score_breakdown?.skill ?? localSkill;
  const budgetScore = serverPick?.score_breakdown?.budget ?? localBudget;
  const goalFit = serverPick?.score_breakdown?.goal ?? localGoal;
  const overallFit = serverPick?.fit_score ?? Math.round(skill * 0.45 + budgetScore * 0.3 + goalFit * 0.25);
  const whyFits = serverPick?.why_this_fits || [];
  const whyCareful = serverPick?.why_to_be_careful || [];

  const specs = specBadges(item);
  const pros = (item.pros || []).slice(0, 3);
  const cons = (item.cons || []).slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden hover:border-lime-400/30 transition-colors flex flex-col md:flex-row"
    >
      {/* Image */}
      <div className={`relative md:w-56 md:shrink-0 aspect-square md:aspect-auto bg-gradient-to-br ${grad}`}>
        {showImage ? (
          <img src={imgUrl} alt={item.name} loading="lazy" referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
            onError={() => setImgErr(true)} />
        ) : (
          <BrandedPlaceholder item={item} sportEmoji={sportEmoji} />
        )}
        {item.level && (
          <Badge className="absolute top-2 left-2 bg-zinc-900/80 text-zinc-200 border-zinc-700 text-[9px] backdrop-blur-sm">{item.level}</Badge>
        )}
        {isLimited && (
          <Badge className="absolute top-2 right-2 bg-amber-400/15 text-amber-300 border-amber-400/30 text-[9px] backdrop-blur-sm">Limited online</Badge>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Header row: name + fit score */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold truncate">{item.brand}</p>
            <h3 className="text-base font-bold text-white leading-tight">{item.name}</h3>
            {/* Cheapest price */}
            {cheapest ? (
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-lime-400 font-mono">₹{cheapest.price?.toLocaleString("en-IN")}</span>
                <span className="text-[10px] text-zinc-500">on {cheapest.platform}{prices.length > 1 ? ` · cheapest of ${prices.length}` : ""}</span>
              </div>
            ) : fallbackPrice ? (
              <p className="text-sm text-zinc-300 mt-1 font-mono">₹{fallbackPrice.min?.toLocaleString("en-IN")}–{fallbackPrice.max?.toLocaleString("en-IN")}</p>
            ) : null}
          </div>
          <FitScore score={overallFit} />
        </div>

        {/* Spec badges */}
        {specs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {specs.map((s, i) => (
              <Badge key={i} variant="outline" className="border-zinc-700 text-zinc-400 text-[10px] font-medium">{s}</Badge>
            ))}
          </div>
        )}

        {/* Description */}
        {item.description && (
          <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-2">{item.description}</p>
        )}

        {/* Fit bars */}
        <div className="space-y-1.5 bg-zinc-950/60 border border-zinc-800 rounded-xl px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">How well it fits you</p>
          <FitBar label="Skill" value={skill} color="bg-lime-400" />
          <FitBar label="Budget" value={budgetScore} color="bg-amber-400" />
          <FitBar label="Goal" value={goalFit} color="bg-sky-400" />
        </div>

        {/* AI-derived reasoning chain — shown when the server returned a
            personalised pick for this item */}
        {(whyFits.length > 0 || whyCareful.length > 0) && (
          <div className="bg-gradient-to-br from-lime-400/10 via-zinc-900/0 to-zinc-900/0 border border-lime-400/25 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-lime-300 font-bold">
              <Sparkles className="w-3 h-3" /> Why this fits you
            </div>
            {whyFits.length > 0 && (
              <ul className="space-y-1">
                {whyFits.map((p, i) => (
                  <li key={i} className="text-[12px] text-zinc-200 flex gap-1.5 leading-snug">
                    <span className="text-lime-400 shrink-0">→</span><span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
            {whyCareful.length > 0 && (
              <ul className="space-y-1 pt-1 border-t border-zinc-800/60">
                {whyCareful.map((c, i) => (
                  <li key={i} className="text-[11px] text-amber-300/90 flex gap-1.5 leading-snug">
                    <span className="text-amber-400 shrink-0">!</span><span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Pros + Cons side by side */}
        {(pros.length > 0 || cons.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pros.length > 0 && (
              <div className="bg-lime-400/5 border border-lime-400/20 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold mb-1.5">Pros</p>
                <ul className="space-y-1">
                  {pros.map((p, i) => (
                    <li key={i} className="text-[11px] text-zinc-300 flex gap-1.5 leading-snug">
                      <span className="text-lime-400 shrink-0">+</span><span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {cons.length > 0 && (
              <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1.5">Cons</p>
                <ul className="space-y-1">
                  {cons.map((c, i) => (
                    <li key={i} className="text-[11px] text-zinc-300 flex gap-1.5 leading-snug">
                      <span className="text-amber-400 shrink-0">−</span><span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Buy buttons */}
        <div className="flex flex-col gap-1.5 mt-auto">
          {cheapest && (
            <a href={withAffiliate(reliableBuyUrl(cheapest, item))} target="_blank" rel="noopener noreferrer sponsored"
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-lime-400 text-black hover:bg-lime-500 transition-colors">
              <ShoppingCart className="w-3.5 h-3.5" /> Buy on {cheapest.platform} · ₹{cheapest.price?.toLocaleString("en-IN")}
            </a>
          )}
          {!cheapest && searchStoreLinks(item).map((l, i) => (
            <a key={l.platform} href={withAffiliate(l.url)} target="_blank" rel="noopener noreferrer sponsored"
              className={i === 0
                ? "w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-lime-400 text-black hover:bg-lime-500 transition-colors"
                : "w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"}>
              {i === 0 && <ShoppingCart className="w-3.5 h-3.5" />} Check price on {l.platform}
            </a>
          ))}
          {prices.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {prices.filter(p => p !== cheapest).slice(0, 3).map((p, i) => (
                <a key={i} href={withAffiliate(reliableBuyUrl(p, item))} target="_blank" rel="noopener noreferrer sponsored"
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors min-w-0">
                  <span className="truncate">{p.platform}</span>
                  <span className="font-mono shrink-0">₹{p.price}</span>
                </a>
              ))}
            </div>
          )}
          <EnquireLocalShop productName={item.name} sport={item._sport}>
            <button className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/20 transition-colors">
              <MapPin className="w-3 h-3" /> Enquire local shop · callback 1-2 hr
            </button>
          </EnquireLocalShop>
        </div>
      </div>
    </motion.div>
  );
}
