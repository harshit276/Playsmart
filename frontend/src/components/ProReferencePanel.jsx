// Per-shot-type VS PRO REFERENCE panel.
//
// Renders ONE collapsible card per distinct shot type the player produced.
// Each card has:
//   - User's contact-frame thumbnail (left)  vs  pro thumbnail (right)
//   - Coach-tone heading "VS PRO REFERENCE" with shot type
//   - Lazy-loaded YouTube embed (only mounts on expand) of the curated
//     pro clip restricted to its [start_sec, end_sec] window
//   - The biomechanical_comparison sentence from the VLM coaching call
//     (only if Gemini produced something specific — generic fluff is
//     filtered out backend-side)
//   - "Watch full breakdown ↗" link
//
// Default collapsed to avoid a wall-of-cards visual.
//
// Data source: `result.shots[*].pro_reference` populated by
// /api/analyze-client-results (see server.py per-shot enrichment block).
// No client-side fetch needed — keeps the page render fast.
//
// Honest empty state: if no curated reference exists for any shot in the
// session, render a single tasteful banner pointing at the catalog gap.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, ChevronDown, ChevronUp, ExternalLink, Inbox } from "lucide-react";

function _titleCase(s) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ProReferenceCard({ shotType, sample, pro, sport }) {
  const [open, setOpen] = useState(false);

  const userThumb = sample?.thumbnail || null;
  const proThumb = pro?.thumbnail_url
    || (pro?.youtube_id ? `https://i.ytimg.com/vi/${pro.youtube_id}/hqdefault.jpg` : null);
  const ts = typeof sample?.timestamp === "number" ? sample.timestamp : null;

  // Build the YouTube embed URL only when the section is expanded — this
  // is the "lazy load" pattern. Without it every analysis with N shot
  // types fires N YouTube embeds at mount, which kills the page render.
  const ytSrc = open && pro?.youtube_id
    ? `https://www.youtube-nocookie.com/embed/${pro.youtube_id}`
      + `?start=${pro.start_sec || 0}`
      + `&end=${pro.end_sec || (pro.start_sec || 0) + 6}`
      + `&autoplay=1&mute=1&loop=1&playlist=${pro.youtube_id}`
      + `&controls=1&modestbranding=1&rel=0`
    : null;

  const fullVideoUrl = pro?.youtube_id
    ? `https://www.youtube.com/watch?v=${pro.youtube_id}&t=${Math.max(0, pro.start_sec || 0)}s`
    : null;

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Collapsed header — always visible. Click to expand. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-800/40 transition-colors"
      >
        {/* Side-by-side mini-thumbs in the header so the user gets a
            visual preview without expanding (helps decide whether to dig
            in). */}
        <div className="flex items-center gap-1 shrink-0">
          {userThumb ? (
            <img src={userThumb} alt="Your shot"
              className="w-12 h-12 rounded-md object-cover bg-black border border-zinc-700"
              loading="lazy" />
          ) : (
            <div className="w-12 h-12 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <span className="text-[9px] text-zinc-500">YOU</span>
            </div>
          )}
          <span className="text-zinc-600 text-sm font-bold">vs</span>
          {proThumb ? (
            <img src={proThumb} alt={pro?.player || "Pro reference"}
              className="w-12 h-12 rounded-md object-cover bg-black border border-amber-400/30"
              loading="lazy" />
          ) : (
            <div className="w-12 h-12 rounded-md bg-zinc-800 border border-amber-400/30 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-amber-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1">
            <Trophy className="w-3 h-3" /> VS Pro Reference
          </p>
          <p className="text-sm font-semibold text-white capitalize truncate">
            {_titleCase(shotType)} <span className="text-zinc-500 font-normal">· vs {pro?.player || "pro"}</span>
          </p>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-zinc-800/60"
          >
            <div className="p-3 space-y-3">
              {/* Side-by-side player. YouTube embed only mounts when open
                  (the `ytSrc` const is null until then), so we don't
                  load N iframes on page render. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* YOU */}
                <div className="bg-black rounded-lg overflow-hidden border border-zinc-800">
                  <div className="aspect-video bg-zinc-900 flex items-center justify-center relative">
                    {userThumb ? (
                      <img src={userThumb} alt="Your shot" className="w-full h-full object-cover" />
                    ) : (
                      <p className="text-xs text-zinc-500">No preview frame</p>
                    )}
                    <div className="absolute bottom-1.5 left-1.5 bg-black/70 backdrop-blur-sm rounded px-1.5 py-0.5">
                      <p className="text-[9px] uppercase tracking-wider text-sky-300 font-bold">You</p>
                    </div>
                  </div>
                  <div className="px-2.5 py-1.5 bg-zinc-900/60 border-t border-zinc-800">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Your {_titleCase(shotType)}</p>
                    {ts != null && (
                      <p className="text-[10px] text-zinc-500">@ {ts.toFixed(1)}s in your video</p>
                    )}
                  </div>
                </div>
                {/* PRO */}
                <div className="bg-black rounded-lg overflow-hidden border border-amber-400/20">
                  <div className="aspect-video relative">
                    {ytSrc ? (
                      <iframe
                        src={ytSrc}
                        title={`${pro?.player || "Pro"} ${shotType}`}
                        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                        loading="lazy"
                        className="w-full h-full"
                      />
                    ) : proThumb ? (
                      <img src={proThumb} alt={pro?.player} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                        <Trophy className="w-6 h-6 text-amber-400/40" />
                      </div>
                    )}
                  </div>
                  <div className="px-2.5 py-1.5 bg-amber-400/5 border-t border-amber-400/20">
                    <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Pro Reference</p>
                    <p className="text-[10px] text-zinc-300 truncate">{pro?.player || "Curated reference"}</p>
                  </div>
                </div>
              </div>

              {/* Biomechanical comparison — ONLY render when Gemini gave
                  us a specific sentence. The backend filter (see
                  _looks_specific in coaching.py) rejects generic fluff
                  before it ever reaches us. */}
              {pro?.biomechanical_comparison && (
                <div className="bg-lime-400/5 border border-lime-400/20 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold mb-1">
                    What's different
                  </p>
                  <p className="text-sm text-zinc-100 leading-snug">
                    {pro.biomechanical_comparison}
                  </p>
                </div>
              )}

              {/* Curator's note: the description field on REFERENCE_VIDEOS
                  carries a coach-written "what to watch" sentence. We
                  surface it as a fallback when the per-user comparison
                  is missing — still better than nothing. */}
              {!pro?.biomechanical_comparison && pro?.description && (
                <div className="bg-zinc-800/40 border border-zinc-800 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
                    What to watch
                  </p>
                  <p className="text-[12px] text-zinc-300 leading-snug">{pro.description}</p>
                </div>
              )}

              {fullVideoUrl && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[10px] text-zinc-600">
                    Curated reference clip from a top {sport || "sport"} player.
                  </p>
                  <a
                    href={fullVideoUrl}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300"
                  >
                    Watch full breakdown <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProReferencePanel({ shots, sport }) {
  if (!Array.isArray(shots) || shots.length === 0) return null;

  // Group shots by type, pick the best representative (highest confidence
  // with a thumbnail) for each. This is what feeds the per-card "YOU"
  // side. We render ONE card per distinct shot type — not N cards per
  // shot — to avoid the wall-of-cards problem the user explicitly called
  // out.
  const groups = new Map(); // shot_type → { pro, samples: [...] }
  for (const s of shots) {
    const type = (s?.type || s?.shot_type || "").toLowerCase().trim();
    if (!type || type === "unknown") continue;
    if (!groups.has(type)) groups.set(type, { samples: [], pro: null });
    const g = groups.get(type);
    g.samples.push(s);
    if (!g.pro && s.pro_reference) g.pro = s.pro_reference;
  }

  const cards = [];
  for (const [type, g] of groups.entries()) {
    if (!g.pro) continue;
    // Best sample = first with a thumbnail, else highest confidence.
    const withThumb = g.samples.find((x) => x.thumbnail);
    const best = withThumb
      || g.samples.slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    cards.push({ type, sample: best, pro: g.pro });
  }

  // Sort by sample count desc, so the user's most-played shot is first.
  cards.sort((a, b) => {
    const ca = groups.get(a.type)?.samples.length || 0;
    const cb = groups.get(b.type)?.samples.length || 0;
    return cb - ca;
  });

  // Empty-state: ZERO curated refs for ANY shot the player produced.
  // Still useful to surface so the user knows the feature exists +
  // understands which sports are covered.
  if (cards.length === 0) {
    // Count distinct shot types the player produced so the message is
    // honest about what we tried and didn't find.
    const uncuredTypes = Array.from(groups.keys()).slice(0, 4);
    if (uncuredTypes.length === 0) return null;
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center shrink-0">
            <Inbox className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
              VS Pro Reference
            </p>
            <p className="text-sm text-zinc-200 leading-snug">
              We don't have curated pro references for{" "}
              <span className="text-white font-semibold capitalize">
                {uncuredTypes.map(_titleCase).join(", ")}
              </span>{" "}
              yet.
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 leading-snug">
              We curate one pro clip per shot type per sport so the comparison stays accurate.
              Want this shot covered? <a href="mailto:hello@athlyticai.com?subject=Pro+reference+request"
                className="text-sky-400 hover:text-sky-300 font-medium">Vote for it ↗</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-400" /> VS Pro Reference
        </p>
        <p className="text-[10px] text-zinc-600">
          Tap a card to load the side-by-side
        </p>
      </div>
      {cards.map((c) => (
        <ProReferenceCard
          key={c.type}
          shotType={c.type}
          sample={c.sample}
          pro={c.pro}
          sport={sport}
        />
      ))}
    </motion.div>
  );
}
