/**
 * MarketplacePage — Myntra-style sports marketplace.
 *
 * Layout:
 *   • Top: hero + search bar
 *   • Middle: 2-col (mobile) / 3 / 4 (lg) product grid
 *   • Bottom (sticky): Filter + Sort buttons that open bottom sheets
 *
 * Data: static equipment JSONs in frontend/public/data/equipment/<sport>.json.
 * Filtering is client-side → all interactions instant.
 *
 * Images: Amazon CDN where available, else AI-generated via Pollinations.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, ArrowUpDown, ShoppingCart, ExternalLink, MapPin,
  CheckCircle2, X, Sparkles, ChevronRight, ArrowDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EnquireLocalShop from "@/components/EnquireLocalShop";
import SEO from "@/components/SEO";
import { withAffiliate } from "@/lib/affiliateLinks";
import { productImageFor } from "@/lib/productImage";

const SPORTS = [
  { key: "all", label: "All", emoji: "🌐" },
  { key: "badminton", label: "Badminton", emoji: "🏸" },
  { key: "tennis", label: "Tennis", emoji: "🎾" },
  { key: "table_tennis", label: "Table Tennis", emoji: "🏓" },
  { key: "pickleball", label: "Pickleball", emoji: "⚡" },
  { key: "cricket", label: "Cricket", emoji: "🏏" },
  { key: "football", label: "Football", emoji: "⚽" },
];

const PRICE_BUCKETS = [
  { key: "all", label: "Any price", min: 0, max: Infinity },
  { key: "u2k", label: "Under ₹2k", min: 0, max: 2000 },
  { key: "2-5k", label: "₹2k–5k", min: 2000, max: 5000 },
  { key: "5-10k", label: "₹5k–10k", min: 5000, max: 10000 },
  { key: "10k+", label: "₹10k+", min: 10000, max: Infinity },
];

const SORTS = [
  { key: "popular", label: "Popular" },
  { key: "price_low", label: "Price · Low → High" },
  { key: "price_high", label: "Price · High → Low" },
  { key: "name", label: "Name · A–Z" },
];

const CATEGORY_LABELS = {
  rackets: "Rackets", shoes: "Shoes", strings: "Strings", grips: "Grips",
  shuttlecocks: "Shuttlecocks", blades: "TT Blades", rubbers: "TT Rubbers",
  ready_made_rackets: "TT Ready-Made", balls: "Balls",
  tennis_rackets: "Tennis Rackets", tennis_shoes: "Tennis Shoes",
  tennis_strings: "Tennis Strings", tennis_balls: "Tennis Balls",
  paddles: "Paddles", bats: "Bats", pads: "Pads", gloves: "Gloves",
  helmets: "Helmets", boots: "Boots",
};

function lowestPrice(item) {
  const prices = (item.marketplace_prices || []).map((p) => p.price).filter((n) => typeof n === "number");
  if (prices.length) return Math.min(...prices);
  return item.price_ranges?.INR?.min || 999999;
}

export default function MarketplacePage() {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState("all");
  const [category, setCategory] = useState("all");
  const [bucket, setBucket] = useState("all");
  const [sort, setSort] = useState("popular");
  const [search, setSearch] = useState("");
  const [brands, setBrands] = useState([]); // selected brand filter
  const [filterSheet, setFilterSheet] = useState(false);
  const [sortSheet, setSortSheet] = useState(false);

  useEffect(() => { document.title = "Marketplace · AthlyticAI"; }, []);

  // Load every sport's equipment JSON in parallel from static assets.
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

  // Categories visible for current sport pick
  const categories = useMemo(() => {
    const set = new Set();
    for (const it of allItems) {
      if (sport === "all" || it._sport === sport) set.add(it._category);
    }
    return ["all", ...Array.from(set).sort()];
  }, [allItems, sport]);

  // Brands available given current sport
  const allBrands = useMemo(() => {
    const set = new Set();
    for (const it of allItems) {
      if (sport === "all" || it._sport === sport) {
        if (it.brand) set.add(it.brand);
      }
    }
    return Array.from(set).sort();
  }, [allItems, sport]);

  const filtered = useMemo(() => {
    const b = PRICE_BUCKETS.find((x) => x.key === bucket) || PRICE_BUCKETS[0];
    const q = search.trim().toLowerCase();
    let out = allItems
      .filter((it) => sport === "all" || it._sport === sport)
      .filter((it) => category === "all" || it._category === category)
      .filter((it) => {
        const lo = lowestPrice(it);
        return lo >= b.min && lo <= b.max;
      })
      .filter((it) => brands.length === 0 || brands.includes(it.brand))
      .filter((it) => {
        if (!q) return true;
        return (`${it.name} ${it.brand} ${it.type || ""}`.toLowerCase()).includes(q);
      });
    if (sort === "price_low") out.sort((a, b) => lowestPrice(a) - lowestPrice(b));
    else if (sort === "price_high") out.sort((a, b) => lowestPrice(b) - lowestPrice(a));
    else if (sort === "name") out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    // "popular" = original order (curated)
    return out;
  }, [allItems, sport, category, bucket, sort, search, brands]);

  const activeFilterCount = (category !== "all" ? 1 : 0)
    + (bucket !== "all" ? 1 : 0)
    + (brands.length > 0 ? 1 : 0);

  const clearAllFilters = () => { setCategory("all"); setBucket("all"); setBrands([]); };

  return (
    <div className="min-h-screen bg-zinc-950 pb-24">
      <SEO
        title="Sports Equipment Marketplace · Compare Prices Across Amazon, Flipkart, Decathlon"
        description="Browse and compare prices for badminton, tennis, table tennis, and pickleball equipment across Amazon, Flipkart, and Decathlon. Curated for Indian players."
        url="https://athlyticai.com/marketplace"
      />
      <div className="container mx-auto px-3 sm:px-4 max-w-7xl pt-6">
        {/* Sport pills row + search */}
        <div className="mb-4 space-y-3">
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
            {SPORTS.map((s) => (
              <button key={s.key} onClick={() => { setSport(s.key); setCategory("all"); setBrands([]); }}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-colors ${
                  sport === s.key
                    ? "bg-lime-400 text-black"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800"
                }`}>
                <span>{s.emoji}</span> {s.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brand or model…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-10 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
            <span className="text-zinc-500">Filters:</span>
            {category !== "all" && (
              <FilterChip label={CATEGORY_LABELS[category] || category} onClear={() => setCategory("all")} />
            )}
            {bucket !== "all" && (
              <FilterChip label={PRICE_BUCKETS.find(b => b.key === bucket)?.label} onClear={() => setBucket("all")} />
            )}
            {brands.map((b) => (
              <FilterChip key={b} label={b} onClear={() => setBrands(brands.filter(x => x !== b))} />
            ))}
            <button onClick={clearAllFilters} className="text-lime-400 hover:text-lime-300 underline ml-1">Clear all</button>
          </div>
        )}

        <p className="text-xs text-zinc-500 mb-3">
          {loading ? "Loading…" : `${filtered.length} product${filtered.length === 1 ? "" : "s"}`}
        </p>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl h-64 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-12 text-center">
            <Search className="w-10 h-10 text-zinc-700 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-zinc-300 font-medium mb-1">No products match those filters</p>
            <p className="text-zinc-500 text-xs mb-3">Try clearing some filters.</p>
            <Button onClick={clearAllFilters} size="sm" variant="outline" className="border-zinc-700 text-zinc-300 rounded-full">
              Clear all filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((item, i) => (
              <ProductCard key={`${item._sport}-${item.id}`} item={item} delay={Math.min(i * 0.015, 0.3)} />
            ))}
          </div>
        )}
      </div>

      {/* Sticky bottom action bar — Myntra-style */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800">
        <div className="container mx-auto px-3 sm:px-4 max-w-7xl flex">
          <button
            onClick={() => setSortSheet(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors border-r border-zinc-800"
          >
            <ArrowUpDown className="w-4 h-4" /> Sort
            <span className="text-xs text-zinc-500">· {SORTS.find(s => s.key === sort)?.label}</span>
          </button>
          <button
            onClick={() => setFilterSheet(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <Filter className="w-4 h-4" /> Filter
            {activeFilterCount > 0 && (
              <Badge className="bg-lime-400 text-black text-[10px] font-bold h-4 px-1.5 leading-none">{activeFilterCount}</Badge>
            )}
          </button>
        </div>
      </div>

      {/* Filter bottom sheet */}
      <BottomSheet open={filterSheet} onClose={() => setFilterSheet(false)} title="Filters">
        <div className="space-y-5">
          {/* Category */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Category</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    category === c ? "bg-lime-400 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}>
                  {c === "all" ? "All categories" : (CATEGORY_LABELS[c] || c)}
                </button>
              ))}
            </div>
          </div>
          {/* Price */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Price</p>
            <div className="flex flex-wrap gap-2">
              {PRICE_BUCKETS.map((b) => (
                <button key={b.key} onClick={() => setBucket(b.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    bucket === b.key ? "bg-lime-400 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          {/* Brand */}
          {allBrands.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Brand</p>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {allBrands.map((b) => (
                  <button key={b} onClick={() => setBrands(brands.includes(b) ? brands.filter(x => x !== b) : [...brands, b])}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      brands.includes(b) ? "bg-lime-400 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2 sticky bottom-0 bg-zinc-900 -mx-5 px-5 py-3 -mb-5 border-t border-zinc-800">
            <Button onClick={clearAllFilters} variant="outline"
              className="flex-1 border-zinc-700 text-zinc-300 rounded-full">
              Clear All
            </Button>
            <Button onClick={() => setFilterSheet(false)}
              className="flex-1 bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full">
              Show {filtered.length} results
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Sort bottom sheet */}
      <BottomSheet open={sortSheet} onClose={() => setSortSheet(false)} title="Sort by">
        <div className="space-y-1">
          {SORTS.map((s) => (
            <button key={s.key}
              onClick={() => { setSort(s.key); setSortSheet(false); }}
              className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm transition-colors ${
                sort === s.key ? "bg-lime-400/10 text-lime-400" : "text-zinc-300 hover:bg-zinc-800"
              }`}>
              <span>{s.label}</span>
              {sort === s.key && <CheckCircle2 className="w-4 h-4" />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 bg-lime-400/10 text-lime-300 border border-lime-400/30 rounded-full px-2.5 py-0.5">
      {label}
      <button onClick={onClear} className="hover:text-white"><X className="w-3 h-3" /></button>
    </span>
  );
}

function BottomSheet({ open, onClose, title, children }) {
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

const SPORT_GRADIENT = {
  badminton: "from-lime-500/20 via-emerald-700/20 to-zinc-900",
  tennis: "from-amber-500/20 via-orange-700/20 to-zinc-900",
  table_tennis: "from-sky-500/20 via-blue-700/20 to-zinc-900",
  pickleball: "from-emerald-500/20 via-teal-700/20 to-zinc-900",
  cricket: "from-blue-500/20 via-indigo-700/20 to-zinc-900",
  football: "from-green-500/20 via-emerald-700/20 to-zinc-900",
};

function ProductCard({ item, delay }) {
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
          // Polished placeholder: huge sport emoji watermark + bold brand
          // name + product type label. Looks intentional, never broken.
          <div className="w-full h-full flex flex-col items-center justify-center text-center px-3 relative">
            <span className="absolute text-[140px] opacity-[0.07] select-none leading-none">{sportEmoji}</span>
            <div className="relative z-10">
              <p className="font-heading font-black text-2xl uppercase tracking-tight text-white drop-shadow-lg">
                {item.brand}
              </p>
              {item.type && (
                <p className="text-[10px] uppercase tracking-widest text-zinc-300/80 mt-1.5">
                  {item.type}
                </p>
              )}
            </div>
          </div>
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
            <a href={withAffiliate(cheapest.url)} target="_blank" rel="noopener noreferrer sponsored"
              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-lime-400 text-black hover:bg-lime-500 transition-colors">
              <ShoppingCart className="w-3 h-3" /> Buy on {cheapest.platform}
            </a>
          )}
          {/* Other platforms */}
          {prices.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              {prices.filter(p => p !== cheapest).slice(0, 2).map((p, i) => (
                <a key={i} href={withAffiliate(p.url)} target="_blank" rel="noopener noreferrer sponsored"
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
