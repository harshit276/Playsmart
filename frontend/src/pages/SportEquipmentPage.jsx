/**
 * /<sport>/equipment — per-sport gear guide.
 *
 * Same shopping UI as /marketplace (photo cards, cheapest-store price, buy
 * buttons, filter + sort sheets, "Get my picks"), locked to one sport, plus
 * the guide content that makes the page worth ranking: intro, one H2 section
 * per category, FAQ, and links to the other sports' guides.
 *
 * Crawlers also get a static copy of every product from
 * scripts/seoFallbacks.mjs, so the React view is free to be a shop.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search, Filter, ArrowUpDown, CheckCircle2, ShoppingBag, ArrowRight,
  Sparkles, ChevronRight, ChevronDown,
} from "lucide-react";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EquipmentRecommendModal from "@/components/EquipmentRecommendModal";
import {
  SPORTS, PRICE_BUCKETS, SORTS, lowestPrice,
  RecommendHero, FilterChip, BottomSheet, ProductCard, RecommendedProductCard,
  skillMatchScore, budgetMatchScore, goalMatchScore,
} from "@/components/MarketplaceKit";
import { useAuth } from "@/App";
import api from "@/lib/api";
import equipmentSeo from "@/data/equipmentSeo.json";

// How many products each category shows before "See all" on the overview.
const PREVIEW_COUNT = 8;

export default function SportEquipmentPage() {
  // Each sport has its own literal route ("/badminton/equipment"), so there is
  // no :sport param to read — take the slug from the path itself. Without this
  // every gear page bounced to /marketplace and Google refused to index them.
  const { pathname } = useLocation();
  const params = useParams();
  const slug = params.sport || pathname.split("/").filter(Boolean)[0];
  const meta = equipmentSeo.sports[slug];
  const sportKey = meta?.file; // catalogue key, e.g. "table_tennis"
  const { profile } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [bucket, setBucket] = useState("all");
  const [sort, setSort] = useState("popular");
  const [search, setSearch] = useState("");
  const [brands, setBrands] = useState([]);
  const [filterSheet, setFilterSheet] = useState(false);
  const [sortSheet, setSortSheet] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);

  // "Get my picks" — same flow as the marketplace, fixed to this sport.
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [recommendActive, setRecommendActive] = useState(false);
  const [skillLevel, setSkillLevel] = useState("");
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");
  const [serverPicks, setServerPicks] = useState(null);
  const [picksLoading, setPicksLoading] = useState(false);

  // Reset when moving between sports' guides (the component is reused).
  useEffect(() => {
    setCategory("all"); setBucket("all"); setSort("popular"); setSearch(""); setBrands([]);
    setRecommendActive(false); setServerPicks(null); setSkillLevel(""); setGoal(""); setDescription("");
  }, [slug]);

  useEffect(() => {
    if (!sportKey) return;
    let alive = true;
    setLoading(true);
    fetch(`/data/equipment/${sportKey}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const flat = [];
        for (const block of d?.equipment_categories || []) {
          for (const it of block.items || []) flat.push({ ...it, _sport: sportKey, _category: block.category });
        }
        setItems(flat);
      })
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [sportKey]);

  // Categories in catalogue order (rackets before grips), with counts.
  const categories = useMemo(() => {
    const order = [];
    const counts = {};
    for (const it of items) {
      if (!(it._category in counts)) { order.push(it._category); counts[it._category] = 0; }
      counts[it._category] += 1;
    }
    return order.map((c) => ({ key: c, count: counts[c] }));
  }, [items]);

  const allBrands = useMemo(
    () => Array.from(new Set(items.map((it) => it.brand).filter(Boolean))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const b = PRICE_BUCKETS.find((x) => x.key === bucket) || PRICE_BUCKETS[0];
    const q = search.trim().toLowerCase();
    const lvl = (skillLevel || "").toLowerCase();
    const tiers = ["beginner", "intermediate", "advanced", "pro"];
    const out = items
      .filter((it) => category === "all" || it._category === category)
      .filter((it) => { const lo = lowestPrice(it); return lo >= b.min && lo <= b.max; })
      .filter((it) => brands.length === 0 || brands.includes(it.brand))
      .filter((it) => {
        if (!lvl) return true;
        const il = (it.level || "").toLowerCase();
        if (!il || il.includes(lvl)) return true;
        const myI = tiers.indexOf(lvl);
        const itI = tiers.findIndex((t) => il.includes(t));
        return myI >= 0 && itI >= 0 && Math.abs(myI - itI) <= 1;
      })
      .filter((it) => !q || `${it.name} ${it.brand} ${it.type || ""}`.toLowerCase().includes(q));
    if (sort === "price_low") out.sort((a, b2) => lowestPrice(a) - lowestPrice(b2));
    else if (sort === "price_high") out.sort((a, b2) => lowestPrice(b2) - lowestPrice(a));
    else if (sort === "name") out.sort((a, b2) => (a.name || "").localeCompare(b2.name || ""));
    else if (recommendActive) {
      const fitOf = (it) => skillMatchScore(it.level, skillLevel) * 0.45
        + budgetMatchScore(it, bucket) * 0.3 + goalMatchScore(it, goal) * 0.25;
      out.sort((a, b2) => fitOf(b2) - fitOf(a));
    }
    return out;
  }, [items, category, bucket, sort, search, brands, skillLevel, goal, recommendActive]);

  if (!meta) return <Navigate to="/marketplace" replace />;

  const labels = equipmentSeo.categoryLabels || {};
  const catLabel = (c) => labels[c] || c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const sportEmoji = (SPORTS.find((s) => s.key === sportKey) || {}).emoji || "🎯";

  const activeFilterCount = (category !== "all" ? 1 : 0) + (bucket !== "all" ? 1 : 0) + (brands.length ? 1 : 0);
  const clearAllFilters = () => { setCategory("all"); setBucket("all"); setBrands([]); };
  // The browse-by-section overview only makes sense when nothing is narrowing
  // or reordering the list; otherwise show one flat, filtered grid.
  const overview = !recommendActive && category === "all" && bucket === "all"
    && !brands.length && !search.trim() && sort === "popular";

  const pickCategory = (c) => {
    setCategory(c);
    document.getElementById("gear-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyRecommendation = async ({ level, budget, goal: g, description: desc, categories: cats }) => {
    setBucket(budget || "all");
    setSkillLevel(level || "");
    setGoal(g || "");
    setDescription(desc || "");
    setCategory(cats?.[0] || "all");
    setBrands([]);
    setRecommendActive(true);
    const bucketObj = PRICE_BUCKETS.find((x) => x.key === (budget || "all")) || PRICE_BUCKETS[0];
    setPicksLoading(true);
    setServerPicks(null);
    try {
      const { data } = await api.post("/recommend/equipment", {
        sport: sportKey,
        category: cats?.[0] && cats[0] !== "all" ? cats[0] : undefined,
        skill_level: level || undefined,
        goal: g || undefined,
        budget_inr_min: bucketObj.min || 0,
        budget_inr_max: isFinite(bucketObj.max) ? bucketObj.max : undefined,
        description: desc || undefined,
        limit: 8,
      }, { timeout: 25000 });
      setServerPicks(data);
    } catch {
      setServerPicks(null); // local fit ranking still applies
    } finally {
      setPicksLoading(false);
    }
  };

  const clearRecommendation = () => {
    setSkillLevel(""); setGoal(""); setDescription(""); setServerPicks(null);
    setRecommendActive(false); setCategory("all"); setBucket("all");
  };

  const url = `https://www.formanti.com/${slug}/equipment`;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://www.formanti.com/" },
        { "@type": "ListItem", position: 2, name: meta.sportName, item: `https://www.formanti.com/${slug}` },
        { "@type": "ListItem", position: 3, name: "Equipment", item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Best ${meta.sportName} Equipment`,
      itemListElement: items.slice(0, 40).map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: (meta.faqs || []).map(([q, a]) => ({
        "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];

  const otherGuides = Object.entries(equipmentSeo.sports).filter(([k]) => k !== slug);

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-40 md:pb-24">
      <SEO title={meta.title} description={meta.description} url={url} structuredData={structuredData} />

      <div className="container mx-auto px-3 sm:px-4 max-w-7xl pt-4 sm:pt-6">
        {/* Heading */}
        <nav className="text-[12px] text-zinc-500 mb-3 flex items-center gap-1">
          <Link to={`/${slug}`} className="hover:text-lime-400">{meta.sportName}</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/marketplace" className="hover:text-lime-400">Gear</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-zinc-400">{meta.sportName} equipment</span>
        </nav>
        <div className="mb-4 sm:mb-5 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-lime-400 bg-lime-400/10 border border-lime-400/20 rounded-full px-3 py-1 mb-2">
            <ShoppingBag className="w-3.5 h-3.5" /> {meta.sportName} Gear Guide 2026
          </div>
          <h1 className="text-2xl sm:text-4xl font-heading font-black leading-tight mb-2">
            <span className="mr-2">{sportEmoji}</span>Best {meta.sportName} Equipment
          </h1>
          <p className={`text-sm text-zinc-400 leading-relaxed ${introOpen ? "" : "line-clamp-2 sm:line-clamp-none"}`}>
            {meta.intro}
          </p>
          {!introOpen && (
            <button onClick={() => setIntroOpen(true)} className="sm:hidden text-xs text-lime-400 mt-1 inline-flex items-center gap-0.5">
              Read more <ChevronDown className="w-3 h-3" />
            </button>
          )}
        </div>

        <RecommendHero
          recommendActive={recommendActive}
          sport={sportKey}
          skillLevel={skillLevel}
          bucket={bucket}
          goal={goal}
          description={description}
          serverPicks={serverPicks}
          picksLoading={picksLoading}
          onOpen={() => setRecommendOpen(true)}
          onClear={clearRecommendation}
          totalCount={items.length}
          filteredCount={filtered.length}
          sportLocked
        />

        {/* Category pills + search */}
        <div id="gear-grid" className="mb-4 space-y-3 scroll-mt-20">
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
            {[{ key: "all", count: items.length }, ...categories].map((c) => (
              <button key={c.key} onClick={() => setCategory(c.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-colors ${
                  category === c.key
                    ? "bg-lime-400 text-black"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800"
                }`}>
                {c.key === "all" ? "All gear" : catLabel(c.key)}
                <span className={category === c.key ? "text-black/60" : "text-zinc-500"}>{c.count}</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${meta.sportName.toLowerCase()} brands or models…`}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-10 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
            />
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
            <span className="text-zinc-500">Filters:</span>
            {category !== "all" && <FilterChip label={catLabel(category)} onClear={() => setCategory("all")} />}
            {bucket !== "all" && (
              <FilterChip label={PRICE_BUCKETS.find((x) => x.key === bucket)?.label} onClear={() => setBucket("all")} />
            )}
            {brands.map((b) => (
              <FilterChip key={b} label={b} onClear={() => setBrands(brands.filter((x) => x !== b))} />
            ))}
            <button onClick={clearAllFilters} className="text-lime-400 hover:text-lime-300 underline ml-1">Clear all</button>
          </div>
        )}

        {/* Products */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl h-64 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-zinc-500 py-16 text-center">Gear guide coming soon for {meta.sportName}.</p>
        ) : overview ? (
          categories.map((c, idx) => {
            const inCat = items.filter((it) => it._category === c.key);
            return (
              <section key={c.key} id={c.key} className="mb-8 scroll-mt-20">
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-lg sm:text-2xl font-heading font-bold leading-tight">
                      Best {meta.sportName} {catLabel(c.key)}
                    </h2>
                    <p className="text-[12px] text-zinc-500">{c.count} options across levels and budgets</p>
                  </div>
                  {c.count > PREVIEW_COUNT && (
                    <button onClick={() => pickCategory(c.key)}
                      className="shrink-0 text-xs font-semibold text-lime-400 hover:text-lime-300 inline-flex items-center gap-0.5">
                      See all {c.count} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {inCat.slice(0, PREVIEW_COUNT).map((it, i) => (
                    <ProductCard key={`${c.key}-${it.id || it.name}`} item={it} delay={Math.min(i * 0.02, 0.2)} showBlurb />
                  ))}
                </div>
                {/* One nudge towards the analysis, after the first section */}
                {idx === 0 && <AnalyzeBanner />}
              </section>
            );
          })
        ) : (
          <>
            <p className="text-xs text-zinc-500 mb-3">
              {recommendActive && picksLoading
                ? "Ranking your best matches…"
                : `${filtered.length} product${filtered.length === 1 ? "" : "s"}`}
            </p>
            {recommendActive && picksLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-9 h-9 border-2 border-lime-400 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-zinc-300 text-sm font-medium">Finding your best matches…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-12 text-center">
                <Search className="w-10 h-10 text-zinc-700 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-zinc-300 font-medium mb-3">No products match those filters</p>
                <Button onClick={clearAllFilters} size="sm" variant="outline" className="border-zinc-700 text-zinc-300 rounded-full">
                  Clear all filters
                </Button>
              </div>
            ) : (
              <div className={recommendActive
                ? "grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4"
                : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4"}>
                {orderWithPicks(filtered, recommendActive ? serverPicks : null).map(({ item, pick }, i) => (
                  recommendActive ? (
                    <RecommendedProductCard key={item.id || item.name} item={item} delay={Math.min(i * 0.015, 0.3)}
                      level={skillLevel} bucket={bucket} goal={goal} serverPick={pick} />
                  ) : (
                    <ProductCard key={item.id || item.name} item={item} delay={Math.min(i * 0.015, 0.3)} showBlurb />
                  )
                ))}
              </div>
            )}
            <AnalyzeBanner />
          </>
        )}

        {/* FAQ */}
        {(meta.faqs || []).length > 0 && (
          <section className="max-w-3xl mt-10">
            <h2 className="text-lg sm:text-xl font-heading font-bold mb-3">{meta.sportName} gear — common questions</h2>
            <div className="space-y-2">
              {meta.faqs.map(([q, a], i) => (
                <details key={i} className="group bg-zinc-900/60 border border-zinc-800 rounded-xl p-4" open={i === 0}>
                  <summary className="font-semibold text-white text-sm cursor-pointer list-none flex items-center justify-between gap-2">
                    {q}
                    <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="text-[13px] text-zinc-400 leading-relaxed mt-2">{a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* Other sports' guides — internal links help both players and crawlers */}
        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-3">Gear guides for other sports</h2>
          <div className="flex gap-2 flex-wrap">
            {otherGuides.map(([k, m]) => (
              <Link key={k} to={`/${k}/equipment`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800">
                <span>{(SPORTS.find((s) => s.key === m.file) || {}).emoji || "🎯"}</span> {m.sportName}
              </Link>
            ))}
            <Link to="/marketplace"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-lime-400/10 text-lime-300 border border-lime-400/30 hover:bg-lime-400/20">
              All gear <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <p className="text-zinc-500 text-xs mt-4">
            <Link to={`/${slug}`} className="text-lime-400 hover:underline">{meta.sportName} AI coach</Link>
            {" · "}
            <Link to="/blog" className="text-lime-400 hover:underline">Coaching guides</Link>
            {" · "}Prices are indicative and can change on the store's site.
          </p>
        </section>
      </div>

      {/* Sticky Sort / Filter bar — sits above the mobile bottom nav, as on /marketplace */}
      <div className="fixed bottom-24 md:bottom-0 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800">
        <div className="container mx-auto px-3 sm:px-4 max-w-7xl flex">
          <button onClick={() => setSortSheet(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors border-r border-zinc-800">
            <ArrowUpDown className="w-4 h-4" /> Sort
            <span className="text-xs text-zinc-500">· {SORTS.find((x) => x.key === sort)?.label}</span>
          </button>
          <button onClick={() => setFilterSheet(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors">
            <Filter className="w-4 h-4" /> Filter
            {activeFilterCount > 0 && (
              <Badge className="bg-lime-400 text-black text-[10px] font-bold h-4 px-1.5 leading-none">{activeFilterCount}</Badge>
            )}
          </button>
        </div>
      </div>

      <BottomSheet open={filterSheet} onClose={() => setFilterSheet(false)} title="Filters">
        <div className="space-y-5">
          <FilterGroup title="Category">
            {[{ key: "all" }, ...categories].map((c) => (
              <Pill key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
                {c.key === "all" ? "All categories" : catLabel(c.key)}
              </Pill>
            ))}
          </FilterGroup>
          <FilterGroup title="Price">
            {PRICE_BUCKETS.map((b) => (
              <Pill key={b.key} active={bucket === b.key} onClick={() => setBucket(b.key)}>{b.label}</Pill>
            ))}
          </FilterGroup>
          {allBrands.length > 0 && (
            <FilterGroup title="Brand" scroll>
              {allBrands.map((b) => (
                <Pill key={b} active={brands.includes(b)}
                  onClick={() => setBrands(brands.includes(b) ? brands.filter((x) => x !== b) : [...brands, b])}>
                  {b}
                </Pill>
              ))}
            </FilterGroup>
          )}
          <div className="flex gap-2 pt-2 sticky bottom-0 bg-zinc-900 -mx-5 px-5 py-3 -mb-5 border-t border-zinc-800">
            <Button onClick={clearAllFilters} variant="outline" className="flex-1 border-zinc-700 text-zinc-300 rounded-full">
              Clear All
            </Button>
            <Button onClick={() => setFilterSheet(false)} className="flex-1 bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full">
              Show {filtered.length} results
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={sortSheet} onClose={() => setSortSheet(false)} title="Sort by">
        <div className="space-y-1">
          {SORTS.map((x) => (
            <button key={x.key} onClick={() => { setSort(x.key); setSortSheet(false); }}
              className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm transition-colors ${
                sort === x.key ? "bg-lime-400/10 text-lime-400" : "text-zinc-300 hover:bg-zinc-800"
              }`}>
              <span>{x.label}</span>
              {sort === x.key && <CheckCircle2 className="w-4 h-4" />}
            </button>
          ))}
        </div>
      </BottomSheet>

      <EquipmentRecommendModal
        open={recommendOpen}
        onClose={() => setRecommendOpen(false)}
        onApply={applyRecommendation}
        defaultSport={sportKey}
        defaultLevel={skillLevel || profile?.skill_level || ""}
        defaultBudget={bucket}
        defaultGoal={goal}
      />
    </div>
  );
}

// Server-ranked picks first (in the server's order), then everything else.
function orderWithPicks(list, serverPicks) {
  if (!serverPicks?.items?.length) return list.map((item) => ({ item, pick: undefined }));
  const picks = new Map(serverPicks.items.map((p) => [p.item_id, p]));
  const first = serverPicks.items.map((p) => list.find((it) => it.id === p.item_id)).filter(Boolean);
  const rest = list.filter((it) => !picks.has(it.id));
  return [...first, ...rest].map((item) => ({ item, pick: picks.get(item.id) }));
}

function AnalyzeBanner() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      className="mt-5 bg-gradient-to-r from-lime-500/10 to-emerald-600/5 border border-lime-400/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <p className="font-semibold text-white flex items-center gap-1.5 text-sm">
          <Sparkles className="w-4 h-4 text-lime-400" /> Not sure what suits your game?
        </p>
        <p className="text-[13px] text-zinc-400">Upload a clip and our AI matches gear to how you actually play — free.</p>
      </div>
      <Link to="/analyze">
        <Button className="bg-lime-400 text-black hover:bg-lime-500 font-bold whitespace-nowrap w-full sm:w-auto">
          Analyze my game <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </Link>
    </motion.div>
  );
}

function FilterGroup({ title, scroll = false, children }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">{title}</p>
      <div className={`flex flex-wrap gap-2 ${scroll ? "max-h-40 overflow-y-auto" : ""}`}>{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active ? "bg-lime-400 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      }`}>
      {children}
    </button>
  );
}
