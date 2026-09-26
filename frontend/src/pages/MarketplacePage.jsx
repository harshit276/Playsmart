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
import { Link } from "react-router-dom";
import { Search, Filter, ArrowUpDown, CheckCircle2, BookOpen, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";
import EquipmentRecommendModal from "@/components/EquipmentRecommendModal";
import {
  SPORTS, PRICE_BUCKETS, SORTS, CATEGORY_LABELS, lowestPrice,
  RecommendHero, FilterChip, BottomSheet, ProductCard, RecommendedProductCard,
  skillMatchScore, budgetMatchScore, goalMatchScore,
} from "@/components/MarketplaceKit";
import { useAuth } from "@/App";
import api from "@/lib/api";


export default function MarketplacePage() {
  const { profile } = useAuth();
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState("all");
  const [category, setCategory] = useState("all");
  const [bucket, setBucket] = useState("all");
  const [sort, setSort] = useState("popular");
  const [search, setSearch] = useState("");
  const [brands, setBrands] = useState([]); // selected brand filter
  const [skillLevel, setSkillLevel] = useState(""); // set via recommend modal
  const [goal, setGoal] = useState(""); // set via recommend modal
  const [description, setDescription] = useState(""); // free-text from modal
  const [filterSheet, setFilterSheet] = useState(false);
  const [sortSheet, setSortSheet] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [recommendActive, setRecommendActive] = useState(false); // hero shows "personalised" mode
  // Backend-returned ranked picks (with reasoning chains)
  const [serverPicks, setServerPicks] = useState(null); // null | { items: [{item_id, why_this_fits, why_to_be_careful, fit_score, score_breakdown}], parsed_intent }
  const [picksLoading, setPicksLoading] = useState(false);

  useEffect(() => { document.title = "Marketplace · Formanti"; }, []);

  const applyRecommendation = async ({ sport: s, level, budget, goal: g, description: desc, categories }) => {
    setSport(s);
    setBucket(budget || "all");
    setSkillLevel(level || "");
    setGoal(g || "");
    setDescription(desc || "");
    setCategory(categories?.[0] || "all");
    setBrands([]);
    setRecommendActive(true);
    window.scrollTo({ top: 320, behavior: "smooth" });

    // Translate price-bucket key to absolute budget for the backend
    const bucketObj = PRICE_BUCKETS.find((b) => b.key === (budget || "all")) || PRICE_BUCKETS[0];
    setPicksLoading(true);
    setServerPicks(null);
    try {
      const { data } = await api.post("/recommend/equipment", {
        sport: s,
        category: categories?.[0] && categories[0] !== "all" ? categories[0] : undefined,
        skill_level: level || undefined,
        goal: g || undefined,
        budget_inr_min: bucketObj.min || 0,
        budget_inr_max: isFinite(bucketObj.max) ? bucketObj.max : undefined,
        description: desc || undefined,
        limit: 8,
      }, { timeout: 25000 });
      setServerPicks(data);
    } catch (e) {
      // Fail-soft — the local fit-bar fallback still works on the cards
      console.warn("recommend failed, falling back to local ranking:", e?.response?.data || e.message);
      setServerPicks(null);
    } finally {
      setPicksLoading(false);
    }
  };

  const clearRecommendation = () => {
    setSkillLevel("");
    setGoal("");
    setDescription("");
    setServerPicks(null);
    setRecommendActive(false);
    setCategory("all");
    setBucket("all");
  };

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
    const lvl = (skillLevel || "").toLowerCase();
    let out = allItems
      .filter((it) => sport === "all" || it._sport === sport)
      .filter((it) => category === "all" || it._category === category)
      .filter((it) => {
        const lo = lowestPrice(it);
        return lo >= b.min && lo <= b.max;
      })
      .filter((it) => brands.length === 0 || brands.includes(it.brand))
      .filter((it) => {
        // Soft skill filter: when the item declares a level, only show
        // items at that level OR one tier above/below. Items without a
        // level field always pass.
        if (!lvl) return true;
        const il = (it.level || "").toLowerCase();
        if (!il) return true;
        if (il.includes(lvl)) return true;
        // Tolerant matching for nearby tiers
        const tiers = ["beginner", "intermediate", "advanced", "pro"];
        const myI = tiers.indexOf(lvl);
        const itI = tiers.findIndex((t) => il.includes(t));
        return myI >= 0 && itI >= 0 && Math.abs(myI - itI) <= 1;
      })
      .filter((it) => {
        if (!q) return true;
        return (`${it.name} ${it.brand} ${it.type || ""}`.toLowerCase()).includes(q);
      });
    if (sort === "price_low") out.sort((a, b) => lowestPrice(a) - lowestPrice(b));
    else if (sort === "price_high") out.sort((a, b) => lowestPrice(b) - lowestPrice(a));
    else if (sort === "name") out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else if (recommendActive && sort === "popular") {
      // When the picker is on, sort the grid by overall fit so the top hits
      // appear first. Reuses the same scoring helpers RecommendedProductCard uses.
      const fitOf = (it) => {
        const s = skillMatchScore(it.level, skillLevel);
        const b2 = budgetMatchScore(it, bucket);
        const g = goalMatchScore(it, goal);
        return s * 0.45 + b2 * 0.3 + g * 0.25;
      };
      out.sort((a, b) => fitOf(b) - fitOf(a));
    }
    // "popular" (when picker off) = original order (curated)
    return out;
  }, [allItems, sport, category, bucket, sort, search, brands, skillLevel, goal, recommendActive]);

  const activeFilterCount = (category !== "all" ? 1 : 0)
    + (bucket !== "all" ? 1 : 0)
    + (brands.length > 0 ? 1 : 0);

  const clearAllFilters = () => { setCategory("all"); setBucket("all"); setBrands([]); };

  // pb clears BOTH fixed bars on mobile (filter bar ~3.5rem + bottom nav
  // ~5.5rem) so the last product row isn't trapped behind them.
  return (
    <div className="min-h-screen bg-zinc-950 pb-40 md:pb-24">
      <SEO
        title="Sports Equipment Marketplace · Compare Prices Across Amazon, Flipkart, Decathlon"
        description="Browse and compare prices for badminton, tennis, table tennis, pickleball, cricket, football and swimming gear across Amazon, Flipkart and Decathlon. Curated for Indian players."
        url="https://www.formanti.com/marketplace"
      />
      <div className="container mx-auto px-3 sm:px-4 max-w-7xl pt-4 sm:pt-6">
        {/* ── Hero: "Get my picks" recommendation flow ── */}
        <RecommendHero
          recommendActive={recommendActive}
          sport={sport}
          skillLevel={skillLevel}
          bucket={bucket}
          goal={goal}
          description={description}
          serverPicks={serverPicks}
          picksLoading={picksLoading}
          onOpen={() => setRecommendOpen(true)}
          onClear={clearRecommendation}
          totalCount={allItems.length}
          filteredCount={filtered.length}
        />

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

        {/* Picking a sport surfaces its full gear guide (and gives crawlers a
            path from the marketplace to every /<sport>/equipment page). */}
        {sport !== "all" && (
          <Link to={`/${sport.replace(/_/g, "-")}/equipment`}
            className="mb-3 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-xs text-zinc-300 hover:border-lime-400/40 transition-colors">
            <BookOpen className="w-4 h-4 text-lime-400 shrink-0" />
            <span className="flex-1">
              Read the {SPORTS.find((x) => x.key === sport)?.label} gear guide — what to buy at each level, and why
            </span>
            <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
          </Link>
        )}

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
          {loading
            ? "Loading…"
            : recommendActive && picksLoading
              ? "Ranking your best matches…"
              : `${filtered.length} product${filtered.length === 1 ? "" : "s"}`}
        </p>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl h-64 animate-pulse" />
            ))}
          </div>
        ) : recommendActive && picksLoading ? (
          /* AI is reordering the whole list against the user's inputs — show a
             clear loading state instead of the soon-to-be-reshuffled grid. */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-9 h-9 border-2 border-lime-400 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-zinc-300 text-sm font-medium">Finding your best matches…</p>
            <p className="text-zinc-500 text-xs mt-1">Ranking gear by your skill, budget and goal.</p>
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
          <div className={
            recommendActive
              ? "grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4"
              : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4"
          }>
            {(() => {
              // When backend returned ranked picks with reasoning, prepend them
              // in the server's order and annotate each card with the reasoning.
              if (recommendActive && serverPicks?.items?.length) {
                const picksMap = new Map(serverPicks.items.map((p) => [p.item_id, p]));
                const pickedIds = new Set(picksMap.keys());
                const orderedPicks = serverPicks.items
                  .map((p) => filtered.find((it) => it.id === p.item_id))
                  .filter(Boolean);
                const others = filtered.filter((it) => !pickedIds.has(it.id));
                const ordered = [...orderedPicks, ...others];
                return ordered.map((item, i) => (
                  <RecommendedProductCard
                    key={`${item._sport}-${item.id}`}
                    item={item}
                    delay={Math.min(i * 0.015, 0.3)}
                    level={skillLevel}
                    bucket={bucket}
                    goal={goal}
                    serverPick={picksMap.get(item.id)}
                  />
                ));
              }
              return filtered.map((item, i) => (
                recommendActive ? (
                  <RecommendedProductCard
                    key={`${item._sport}-${item.id}`}
                    item={item}
                    delay={Math.min(i * 0.015, 0.3)}
                    level={skillLevel}
                    bucket={bucket}
                    goal={goal}
                  />
                ) : (
                  <ProductCard key={`${item._sport}-${item.id}`} item={item} delay={Math.min(i * 0.015, 0.3)} />
                )
              ));
            })()}
          </div>
        )}
      </div>

      {/* Sticky bottom action bar — Myntra-style.
          Sits ABOVE the app's mobile bottom nav: that nav is `fixed bottom-0
          z-50` and ~5.5rem tall, so at bottom-0/z-30 this bar was rendered
          completely underneath it on phones — Filter and Sort were invisible
          and unreachable on mobile. On md+ the nav is hidden, so it drops
          back to the bottom edge. */}
      <div className="fixed bottom-24 md:bottom-0 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800">
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

      {/* Equipment recommendation quiz */}
      <EquipmentRecommendModal
        open={recommendOpen}
        onClose={() => setRecommendOpen(false)}
        onApply={applyRecommendation}
        defaultSport={sport === "all" ? (profile?.active_sport || "badminton") : sport}
        defaultLevel={skillLevel || profile?.skill_level || ""}
        defaultBudget={bucket}
        defaultGoal={goal}
      />
    </div>
  );
}

