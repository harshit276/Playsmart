/**
 * MarketplacePage — browse all sports products in one place. Reads from
 * the static equipment JSONs (already in frontend/public/data/equipment),
 * filters client-side, renders price comparison rows from the
 * `marketplace_prices` field that the equipment-refinement agents
 * populate.
 *
 * No backend round-trip on filter changes — once the JSONs are loaded
 * (~150 KB total cached via SWR), every interaction is instant.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search, Filter, ShoppingCart, ExternalLink, MapPin, Star,
  CheckCircle2, AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EnquireLocalShop from "@/components/EnquireLocalShop";
import SEO from "@/components/SEO";
import { withAffiliate } from "@/lib/affiliateLinks";

const SPORTS = [
  { key: "all", label: "All Sports", emoji: "🌐" },
  { key: "badminton", label: "Badminton", emoji: "🏸" },
  { key: "tennis", label: "Tennis", emoji: "🎾" },
  { key: "table_tennis", label: "Table Tennis", emoji: "🏓" },
  { key: "pickleball", label: "Pickleball", emoji: "⚡" },
  { key: "cricket", label: "Cricket", emoji: "🏏" },
  { key: "football", label: "Football", emoji: "⚽" },
  { key: "swimming", label: "Swimming", emoji: "🏊" },
];

const PRICE_BUCKETS = [
  { key: "all", label: "Any price", min: 0, max: Infinity },
  { key: "u2k", label: "Under ₹2k", min: 0, max: 2000 },
  { key: "2-5k", label: "₹2k-5k", min: 2000, max: 5000 },
  { key: "5-10k", label: "₹5k-10k", min: 5000, max: 10000 },
  { key: "10k+", label: "₹10k+", min: 10000, max: Infinity },
];

// Friendly category labels (the JSON uses snake_case keys)
const CATEGORY_LABELS = {
  rackets: "Rackets",
  shoes: "Shoes",
  strings: "Strings",
  grips: "Grips",
  shuttlecocks: "Shuttlecocks",
  blades: "TT Blades",
  rubbers: "TT Rubbers",
  ready_made_rackets: "TT Ready-Made",
  balls: "Balls",
  tennis_rackets: "Tennis Rackets",
  tennis_shoes: "Tennis Shoes",
  tennis_strings: "Tennis Strings",
  tennis_balls: "Tennis Balls",
  paddles: "Paddles",
  bats: "Bats",
  pads: "Pads",
  gloves: "Gloves",
  helmets: "Helmets",
  boots: "Boots",
  goggles: "Goggles",
  swimsuits: "Swimsuits",
};

function lowestPrice(item) {
  const prices = (item.marketplace_prices || []).map((p) => p.price).filter((n) => typeof n === "number");
  if (prices.length) return Math.min(...prices);
  return item.price_ranges?.INR?.min || 0;
}

export default function MarketplacePage() {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState("all");
  const [category, setCategory] = useState("all");
  const [bucket, setBucket] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => { document.title = "Marketplace · AthlyticAI"; }, []);

  // Load every sport's equipment JSON in parallel from the static asset path.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled(
        SPORTS.filter((s) => s.key !== "all").map((s) =>
          fetch(`/data/equipment/${s.key}.json`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => ({ sport: s.key, data })),
        ),
      );
      if (cancelled) return;
      const flat = [];
      for (const r of results) {
        if (r.status !== "fulfilled" || !r.value?.data) continue;
        const sportKey = r.value.sport;
        for (const block of r.value.data.equipment_categories || []) {
          for (const item of block.items || []) {
            flat.push({ ...item, _sport: sportKey, _category: block.category });
          }
        }
      }
      setAllItems(flat);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(() => {
    const set = new Set();
    for (const it of allItems) {
      if (sport === "all" || it._sport === sport) set.add(it._category);
    }
    return ["all", ...Array.from(set).sort()];
  }, [allItems, sport]);

  const filtered = useMemo(() => {
    const b = PRICE_BUCKETS.find((x) => x.key === bucket) || PRICE_BUCKETS[0];
    const q = search.trim().toLowerCase();
    return allItems
      .filter((it) => sport === "all" || it._sport === sport)
      .filter((it) => category === "all" || it._category === category)
      .filter((it) => {
        const lo = lowestPrice(it);
        return lo >= b.min && lo <= b.max;
      })
      .filter((it) => {
        if (!q) return true;
        return (`${it.name} ${it.brand} ${it.type || ""}`.toLowerCase()).includes(q);
      })
      .sort((a, b) => lowestPrice(a) - lowestPrice(b));
  }, [allItems, sport, category, bucket, search]);

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8">
      <SEO
        title="Sports Equipment Marketplace · Compare Prices Across Amazon, Flipkart, Decathlon"
        description="Browse and compare prices for badminton, tennis, table tennis, and pickleball equipment across Amazon, Flipkart, and Decathlon. Curated picks for Indian players."
        url="https://athlyticai.com/marketplace"
      />
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="font-heading font-bold text-3xl md:text-5xl uppercase tracking-tight text-white mb-2">
            Sports Marketplace
          </h1>
          <p className="text-zinc-400 text-sm">
            Compare prices across Amazon · Flipkart · Decathlon. Or call a local shop for the best in-store price.
          </p>
        </motion.div>

        {/* Filter bar */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 mb-6 space-y-3">
          {/* Sport pills */}
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            {SPORTS.map((s) => (
              <button key={s.key} onClick={() => { setSport(s.key); setCategory("all"); }}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  sport === s.key
                    ? "bg-lime-400 text-black"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                }`}>
                <span>{s.emoji}</span> {s.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search brand or model…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
              />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "All categories" : (CATEGORY_LABELS[c] || c)}
                </option>
              ))}
            </select>
            <select value={bucket} onChange={(e) => setBucket(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
              {PRICE_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Filter className="w-3 h-3" />
            <span>{loading ? "Loading…" : `${filtered.length} item${filtered.length === 1 ? "" : "s"}`}</span>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 h-72 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-12 text-center">
            <Search className="w-10 h-10 text-zinc-700 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-zinc-300 font-medium mb-1">No products match those filters</p>
            <p className="text-zinc-500 text-xs">Try a different sport or wider price range.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item, i) => (
              <ProductCard key={`${item._sport}-${item.id}`} item={item} delay={i * 0.02} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ item, delay }) {
  const prices = item.marketplace_prices || [];
  const cheapest = prices.length
    ? prices.reduce((m, p) => (p.price < m.price ? p : m), prices[0])
    : null;
  const sportEmoji = SPORTS.find((s) => s.key === item._sport)?.emoji || "🎯";
  const isLimited = item.availability === "limited_online";
  const fallbackPrice = item.price_ranges?.INR;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors flex flex-col">
      {/* Image */}
      <div className="relative aspect-[4/3] bg-zinc-950 overflow-hidden">
        {item.image && !item.image_search_failed ? (
          <img src={item.image} alt={item.name} loading="lazy"
            className="w-full h-full object-contain"
            onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
            <span className="text-6xl opacity-20">{sportEmoji}</span>
          </div>
        )}
        {item.level && (
          <Badge className="absolute top-2 left-2 bg-zinc-900/80 text-zinc-200 border-zinc-700 text-[10px] backdrop-blur-sm">
            {item.level}
          </Badge>
        )}
        {isLimited && (
          <Badge className="absolute top-2 right-2 bg-amber-400/15 text-amber-300 border-amber-400/30 text-[10px] backdrop-blur-sm">
            Limited online
          </Badge>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{item.brand}</p>
          <h3 className="text-sm font-bold text-white leading-tight line-clamp-2">{item.name}</h3>
        </div>

        {item.pros?.length > 0 && (
          <p className="text-[11px] text-zinc-400 line-clamp-2 mb-3">{item.pros[0]}</p>
        )}

        {/* Price comparison */}
        {prices.length > 0 ? (
          <div className="space-y-1.5 mb-3">
            {prices.map((p, i) => {
              const isCheapest = p === cheapest;
              return (
                <a key={i} href={withAffiliate(p.url)} target="_blank" rel="noopener noreferrer sponsored"
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                    isCheapest
                      ? "bg-lime-400/10 border border-lime-400/30 hover:bg-lime-400/20"
                      : "bg-zinc-800/60 border border-zinc-800 hover:bg-zinc-800"
                  }`}>
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    {isCheapest && <CheckCircle2 className="w-3 h-3 text-lime-400" />}
                    <span className="font-medium">{p.platform}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`font-mono font-bold ${isCheapest ? "text-lime-400" : "text-white"}`}>
                      ₹{p.price?.toLocaleString("en-IN")}
                    </span>
                    <ExternalLink className="w-2.5 h-2.5 text-zinc-500" />
                  </span>
                </a>
              );
            })}
          </div>
        ) : fallbackPrice ? (
          <p className="text-sm text-zinc-300 mb-3 font-mono">
            ₹{fallbackPrice.min?.toLocaleString("en-IN")}–{fallbackPrice.max?.toLocaleString("en-IN")}
          </p>
        ) : (
          <p className="text-xs text-zinc-600 mb-3">Price varies by retailer</p>
        )}

        {/* Local shop CTA */}
        <EnquireLocalShop productName={item.name} sport={item._sport}>
          <button className="mt-auto w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-400/10 hover:bg-amber-400/20 text-amber-400 border border-amber-400/20 transition-colors">
            <MapPin className="w-3.5 h-3.5" /> Enquire Local Shop
          </button>
        </EnquireLocalShop>
      </div>
    </motion.div>
  );
}
