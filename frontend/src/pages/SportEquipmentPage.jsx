import { useState, useEffect, useMemo } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBag, ArrowRight, Check, X, ExternalLink, Sparkles, ChevronRight } from "lucide-react";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import equipmentSeo from "@/data/equipmentSeo.json";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.05 } }),
};

const LEVEL_BADGE = {
  beginner: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  intermediate: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  advanced: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  professional: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function priceLabel(item) {
  const inr = item?.price_ranges?.INR;
  if (inr && (inr.min || inr.max)) {
    if (inr.min && inr.max && inr.min !== inr.max) return `₹${inr.min.toLocaleString()}–₹${inr.max.toLocaleString()}`;
    return `₹${(inr.min || inr.max).toLocaleString()}`;
  }
  const mp = (item?.marketplace_prices || []).map((p) => p.price).filter(Boolean);
  if (mp.length) return `₹${Math.min(...mp).toLocaleString()}+`;
  return null;
}

function buyLinks(item) {
  const out = [];
  for (const p of item?.marketplace_prices || []) {
    if (p.url && p.platform) out.push({ label: p.platform, url: p.url });
  }
  if (!out.length && item?.buy_links) {
    if (item.buy_links.amazon) out.push({ label: "Amazon", url: item.buy_links.amazon });
    if (item.buy_links.flipkart) out.push({ label: "Flipkart", url: item.buy_links.flipkart });
  }
  return out.slice(0, 2);
}

function ProductCard({ item }) {
  const price = priceLabel(item);
  const links = buyLinks(item);
  const level = (item.level || (item.recommended_for || [])[0] || "").toLowerCase();
  const pros = (item.pros || []).slice(0, 3);
  const cons = (item.cons || []).slice(0, 2);
  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 flex flex-col hover:border-lime-400/40 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="font-semibold text-white leading-tight">{item.name}</h3>
          {item.brand && <p className="text-[11px] text-zinc-500">{item.brand}</p>}
        </div>
        {level && LEVEL_BADGE[level] && (
          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border capitalize ${LEVEL_BADGE[level]}`}>
            {level}
          </span>
        )}
      </div>
      {price && <p className="text-lime-400 font-bold text-sm mb-2">{price}</p>}
      {item.description && <p className="text-[13px] text-zinc-400 mb-3 leading-relaxed">{item.description}</p>}
      {pros.length > 0 && (
        <ul className="space-y-1 mb-2">
          {pros.map((p, i) => (
            <li key={i} className="flex gap-1.5 text-[12px] text-zinc-300">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
      {cons.length > 0 && (
        <ul className="space-y-1 mb-3">
          {cons.map((c, i) => (
            <li key={i} className="flex gap-1.5 text-[12px] text-zinc-500">
              <X className="w-3.5 h-3.5 text-rose-400/70 shrink-0 mt-0.5" /> <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
      {links.length > 0 && (
        <div className="mt-auto flex gap-2 pt-1">
          {links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="flex-1 text-center text-[12px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 py-1.5 flex items-center justify-center gap-1"
            >
              {l.label} <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SportEquipmentPage() {
  const { sport } = useParams();
  const meta = equipmentSeo.sports[sport];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!meta) return;
    let alive = true;
    setLoading(true);
    fetch(`/data/equipment/${meta.file}.json`)
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [meta]);

  const categories = useMemo(() => data?.equipment_categories || [], [data]);

  if (!meta) return <Navigate to="/marketplace" replace />;

  const url = `https://www.formanti.com/${sport}/equipment`;
  const labels = equipmentSeo.categoryLabels;
  const catLabel = (c) => labels[c] || c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  // Structured data: a Product ItemList + the FAQ.
  const allItems = categories.flatMap((c) => c.items || []);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Best ${meta.sportName} Equipment`,
      itemListElement: allItems.slice(0, 40).map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: (meta.faqs || []).map(([q, a]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <SEO title={meta.title} description={meta.description} url={url} structuredData={structuredData} />

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 pt-10 pb-6">
        <nav className="text-[12px] text-zinc-500 mb-4 flex items-center gap-1">
          <Link to={`/${sport}`} className="hover:text-lime-400 capitalize">{meta.sportName}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-zinc-400">Equipment</span>
        </nav>
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-lime-400 bg-lime-400/10 border border-lime-400/20 rounded-full px-3 py-1 mb-3">
            <ShoppingBag className="w-3.5 h-3.5" /> {meta.sportName} Gear Guide 2026
          </div>
          <h1 className="text-3xl sm:text-4xl font-heading font-black leading-tight mb-3">
            Best {meta.sportName} Equipment
          </h1>
          <p className="text-zinc-400 max-w-2xl leading-relaxed">{meta.intro}</p>
        </motion.div>

        {/* Category jump links */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-5">
            {categories.map((c) => (
              <a
                key={c.category}
                href={`#${c.category}`}
                className="text-[12px] font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-lime-400/40 rounded-full px-3 py-1.5"
              >
                {catLabel(c.category)}
              </a>
            ))}
          </div>
        )}

        {/* Analyze CTA — the reason this page exists commercially */}
        <div className="mt-6 bg-gradient-to-r from-lime-500/10 to-emerald-600/5 border border-lime-400/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-lime-400" /> Not sure what suits your game?
            </p>
            <p className="text-[13px] text-zinc-400">
              Upload a clip and our AI matches gear to how you actually play — free.
            </p>
          </div>
          <Link to="/analyze">
            <Button className="bg-lime-400 text-black hover:bg-lime-500 font-bold whitespace-nowrap">
              Analyze my game <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Category sections */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        {loading && <p className="text-zinc-500 py-10 text-center">Loading gear…</p>}
        {!loading && categories.length === 0 && (
          <p className="text-zinc-500 py-10 text-center">Gear guide coming soon for {meta.sportName}.</p>
        )}
        {categories.map((c) => (
          <div key={c.category} id={c.category} className="pt-8 scroll-mt-20">
            <h2 className="text-xl sm:text-2xl font-heading font-bold mb-1">
              Best {meta.sportName} {catLabel(c.category)}
            </h2>
            <p className="text-[13px] text-zinc-500 mb-4">{(c.items || []).length} options across levels and budgets.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(c.items || []).map((it) => (
                <ProductCard key={it.id || it.name} item={it} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* FAQ */}
      {(meta.faqs || []).length > 0 && (
        <section className="max-w-3xl mx-auto px-4 pb-16">
          <h2 className="text-xl font-heading font-bold mb-4">Frequently asked questions</h2>
          <div className="space-y-3">
            {meta.faqs.map(([q, a], i) => (
              <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                <h3 className="font-semibold text-white mb-1">{q}</h3>
                <p className="text-[13px] text-zinc-400 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cross-links */}
      <section className="max-w-3xl mx-auto px-4 pb-20 text-center">
        <p className="text-zinc-400 text-sm">
          <Link to={`/${sport}`} className="text-lime-400 hover:underline capitalize">{meta.sportName} AI coach</Link>
          {" · "}
          <Link to="/analyze" className="text-lime-400 hover:underline">Analyze a video</Link>
          {" · "}
          <Link to="/blog" className="text-lime-400 hover:underline">Coaching guides</Link>
          {" · "}
          <Link to="/marketplace" className="text-lime-400 hover:underline">All gear</Link>
        </p>
      </section>
    </div>
  );
}
