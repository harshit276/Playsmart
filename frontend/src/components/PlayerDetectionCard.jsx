import { motion } from "framer-motion";
import {
  Sparkles, ShieldCheck, Flame, Navigation, Activity, Users,
} from "lucide-react";

// PlayerDetectionCard — replaces the bare "Analyzing: …" universal-mode
// banner with a rich, premium card that summarizes WHO we analyzed
// (cropped thumbnail, player id, confidence) and WHAT we learned about
// them (top shot types, movement style, stat tiles, highlight tags).
//
// Everything is derived client-side from the existing `result` payload —
// no new API calls, no new dependencies. Honest empty states: if a field
// can't be derived from the data we have, the relevant block is hidden
// rather than filled with placeholder text.
//
// Props:
//   - result: the universal-mode analyze result object. Required.
//       Reads from: result._target_player_thumbnail(_hq), result._target_player,
//       result._target_player_description, result.shots[], result.coach_narrative,
//       result.skill_level / result.overall_skill_level.
//   - player: optional override player descriptor when rendering a card
//       for a non-selected athlete (e.g. multi-player layout). Shape:
//       { id, description, clothing, court_position, thumbnail }.
//   - sport: detected sport string, used as a small chip.
//   - emphasis: "primary" (default — big, prominent) or "compact" (used
//       when there's only one player so we render quietly).
export default function PlayerDetectionCard({ result, player, sport, emphasis = "primary" }) {
  if (!result) return null;

  // ── Resolve who this card represents ────────────────────────────────
  // Prefer the explicit `player` prop (multi-player layout). Otherwise
  // fall back to the selected player on the result. Either way we end up
  // with a single { thumbnail, description, id } triple.
  const tp = result._target_player || null;
  const thumbnail =
    player?.thumbnail ||
    result._target_player_thumbnail_hq ||
    result._target_player_thumbnail ||
    tp?.thumbnail ||
    null;
  const description =
    player?.description ||
    result._target_player_description ||
    tp?.description ||
    null;
  const clothing = player?.clothing || tp?.clothing || null;
  const courtPosition = player?.court_position || tp?.court_position || null;
  const rawId = player?.id || tp?.id || null;
  const playerLabel = rawId
    ? (typeof rawId === "string" && rawId.toLowerCase().startsWith("player")
        ? rawId.replace(/^player[_\s-]*/i, "Player ")
        : `Player ${rawId}`)
    : "Player 1";

  // ── Shot-derived metrics ────────────────────────────────────────────
  const shots = Array.isArray(result.shots) ? result.shots : [];
  const total = shots.length;

  // Average confidence (0..1). Skip shots without a confidence number.
  const confValues = shots
    .map((s) => (typeof s.confidence === "number" ? s.confidence : null))
    .filter((v) => v !== null);
  const avgConf = confValues.length
    ? confValues.reduce((a, b) => a + b, 0) / confValues.length
    : null;
  const confidencePct = avgConf !== null ? Math.round(avgConf * 100) : null;

  // Top 3 shot types by frequency. Use the user-visible label
  // (`name` / `shot_label`) but key by the canonical `type` so similar
  // labels collapse cleanly.
  const counts = new Map();
  for (const s of shots) {
    const key = (s.type || s.shot_category || s.shot_type || s.name || "")
      .toString()
      .toLowerCase()
      .trim();
    if (!key) continue;
    const label = s.shot_label || s.name || key.replace(/_/g, " ");
    const prev = counts.get(key) || { label, count: 0 };
    prev.count += 1;
    // Prefer the longer/richer label if we've seen multiple variants.
    if (label && label.length > prev.label.length) prev.label = label;
    counts.set(key, prev);
  }
  const topShots = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Movement-style summary — extract the FIRST sentence of
  // coach_narrative.intro (which the prompt encourages to lead with the
  // player's style). Fall back to the top-level summary if absent.
  const introText =
    (result.coach_narrative?.intro || "").trim() ||
    (result.quick_summary || "").trim() ||
    "";
  let styleSentence = "";
  if (introText) {
    const m = introText.match(/^[^.!?]+[.!?]/);
    styleSentence = (m ? m[0] : introText).trim();
    if (styleSentence.length > 160) styleSentence = styleSentence.slice(0, 157).trim() + "…";
  }

  // Movement quality — average confidence × skill-level multiplier so
  // an "Advanced" Beginner-confidence read isn't overstated. Returns a
  // qualitative label + a 0..100 score so the tile can show both.
  const skillLevel =
    (result.skill_level || result.overall_skill_level || "").toString().trim();
  const skillMultMap = { Beginner: 0.7, Intermediate: 0.85, Advanced: 1.0, Pro: 1.1 };
  const skillMult = skillMultMap[skillLevel] || 0.9;
  const movementScore =
    avgConf !== null ? Math.max(0, Math.min(100, Math.round(avgConf * 100 * skillMult))) : null;
  const movementLabel = movementScore === null
    ? null
    : movementScore >= 80 ? "Sharp"
    : movementScore >= 65 ? "Solid"
    : movementScore >= 50 ? "Developing"
    : "Loose";

  // Aggression — % of shots flagged as `attacking` intent. When intent
  // wasn't forwarded (older shot shapes) we just hide the tile.
  const intentShots = shots.filter((s) => typeof s.intent === "string");
  const attackingCount = intentShots.filter((s) => s.intent === "attacking").length;
  const defensiveCount = intentShots.filter((s) => s.intent === "defensive").length;
  const aggressionPct = intentShots.length
    ? Math.round((attackingCount / intentShots.length) * 100)
    : null;
  const aggressionLabel = aggressionPct === null
    ? null
    : aggressionPct >= 60 ? "Aggressive"
    : aggressionPct >= 35 ? "Balanced"
    : "Defensive";

  // Recovery — if MatchMetrics-style fields are present on the result,
  // surface a short qualitative read. Otherwise the tile is hidden.
  // We look at common shapes: result.match_metrics.recovery_score (0..100),
  // or result.metrics.recovery_score, or result.match_metrics.recovery.
  const recoveryScore =
    result.match_metrics?.recovery_score ??
    result.metrics?.recovery_score ??
    (typeof result.match_metrics?.recovery === "number" ? result.match_metrics.recovery : null);
  const recoveryLabel = typeof recoveryScore === "number"
    ? (recoveryScore >= 75 ? "Fast" : recoveryScore >= 50 ? "Steady" : "Slow")
    : null;

  // Positioning — qualitative read from court_position + whether shot
  // count suggests active coverage. We only show this when we have
  // SOMETHING concrete to say; otherwise hide.
  let positioningLabel = null;
  if (courtPosition) {
    const cp = courtPosition.toLowerCase();
    if (cp.includes("net") || cp.includes("front")) positioningLabel = "Net-forward";
    else if (cp.includes("back") || cp.includes("baseline")) positioningLabel = "Baseline";
    else if (cp.includes("mid")) positioningLabel = "Mid-court";
    else positioningLabel = courtPosition.length <= 24
      ? courtPosition.replace(/^\w/, (c) => c.toUpperCase())
      : null;
  }

  // ── Highlight tags (3-5 max) ────────────────────────────────────────
  // Aggregate strengths + weaknesses across all shots, normalise, then
  // pull the most frequent themes. Tags carry a `kind` (strength/weakness)
  // so the renderer can colour-code them.
  const phraseCounts = new Map(); // key -> { label, kind, count }
  const addPhrase = (raw, kind) => {
    if (!raw) return;
    const text = String(raw).trim();
    if (!text) return;
    // Compact label: trim to ~22 chars at a word boundary.
    let label = text;
    if (label.length > 22) {
      const cut = label.slice(0, 22);
      const lastSpace = cut.lastIndexOf(" ");
      label = (lastSpace > 10 ? cut.slice(0, lastSpace) : cut).trim() + "…";
    }
    // Capitalise first letter for chip display.
    label = label.replace(/^\w/, (c) => c.toUpperCase());
    const key = text.toLowerCase().slice(0, 40);
    const prev = phraseCounts.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      phraseCounts.set(key, { label, kind, count: 1 });
    }
  };
  for (const s of shots) {
    const ff = s.formFeedback || s.form_feedback || {};
    for (const x of (ff.strengths || []).slice(0, 2)) addPhrase(x, "strength");
    for (const x of (ff.weaknesses || []).slice(0, 2)) addPhrase(x, "weakness");
  }
  // If intent data is around, synthesise a high-level tag too.
  if (intentShots.length >= 3) {
    if (attackingCount / intentShots.length >= 0.6) {
      addPhrase("Aggressive play", "strength");
    } else if (defensiveCount / intentShots.length >= 0.6) {
      addPhrase("Patient defender", "strength");
    }
  }
  const highlightTags = [...phraseCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Render ──────────────────────────────────────────────────────────
  const isCompact = emphasis === "compact";

  // Build the list of stat tiles dynamically — anything that resolved to
  // null is dropped, so we never render an empty "—" tile.
  const tiles = [
    movementLabel && {
      key: "movement",
      label: "Movement quality",
      value: movementLabel,
      sub: movementScore !== null ? `${movementScore}/100` : null,
      icon: Activity,
      tone: "lime",
    },
    aggressionLabel && {
      key: "aggression",
      label: "Aggression",
      value: aggressionLabel,
      sub: aggressionPct !== null ? `${aggressionPct}% attacking` : null,
      icon: Flame,
      tone: "amber",
    },
    recoveryLabel && {
      key: "recovery",
      label: "Recovery",
      value: recoveryLabel,
      sub: typeof recoveryScore === "number" ? `${Math.round(recoveryScore)}/100` : null,
      icon: ShieldCheck,
      tone: "sky",
    },
    positioningLabel && {
      key: "positioning",
      label: "Positioning",
      value: positioningLabel,
      sub: null,
      icon: Navigation,
      tone: "purple",
    },
  ].filter(Boolean);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`bg-zinc-900/80 border border-purple-400/30 rounded-2xl ${
        isCompact ? "p-3" : "p-4 sm:p-5"
      } shadow-lg shadow-purple-400/5`}
      data-testid="player-detection-card"
    >
      {/* Header row: avatar + identity + confidence */}
      <div className="flex items-start gap-3 sm:gap-4">
        {thumbnail ? (
          <div className="relative shrink-0">
            <img
              src={thumbnail}
              alt={`${playerLabel} thumbnail`}
              className={`rounded-2xl object-cover border border-purple-400/30 ${
                isCompact
                  ? "w-16 h-16"
                  : "w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28"
              }`}
            />
            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-purple-400 text-black text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow">
              Analyzed
            </span>
          </div>
        ) : (
          // Avatar fallback — we still show something so the layout
          // doesn't collapse, but it's a neutral icon, not "N/A".
          <div className={`shrink-0 rounded-2xl bg-purple-400/10 border border-purple-400/30 flex items-center justify-center ${
            isCompact ? "w-16 h-16" : "w-20 h-20 sm:w-24 sm:h-24"
          }`}>
            <Users className="w-7 h-7 text-purple-300" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-purple-300 font-bold leading-none">
              Universal mode
            </span>
            {sport && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-400/10 text-purple-200 border border-purple-400/30 capitalize">
                {(sport || "").replace(/_/g, " ")}
              </span>
            )}
            {confidencePct !== null && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-lime-400/10 text-lime-300 border border-lime-400/30 inline-flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> {confidencePct}% conf.
              </span>
            )}
          </div>
          <h3 className="font-heading font-bold text-white text-base sm:text-lg leading-tight truncate">
            {playerLabel}
          </h3>
          {description && (
            <p className="text-[12px] sm:text-sm text-zinc-300 leading-snug mt-0.5 line-clamp-2">
              {description}
            </p>
          )}
          {(clothing || courtPosition) && (
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {[clothing, courtPosition].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      {/* Movement-style line — first sentence of the coach narrative. */}
      {styleSentence && (
        <p className="mt-3 text-[12.5px] sm:text-sm text-zinc-200 leading-relaxed italic border-l-2 border-purple-400/40 pl-3">
          {styleSentence}
        </p>
      )}

      {/* Top detected shot types */}
      {topShots.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-1.5">
            Top detected shots
          </p>
          <div className="flex flex-wrap gap-1.5">
            {topShots.map((s) => (
              <span
                key={s.label}
                className="text-[11px] px-2 py-1 rounded-full bg-purple-400/10 text-purple-100 border border-purple-400/30 capitalize"
              >
                {s.label}
                <span className="ml-1 text-purple-300/80">×{s.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stat tiles — 2×2 on mobile, up to 4-col on desktop */}
      {tiles.length > 0 && (
        <div className={`mt-3 grid gap-2 ${
          tiles.length >= 3 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"
        }`}>
          {tiles.map((t) => {
            const Icon = t.icon;
            const toneClass = {
              lime: "border-lime-400/30 text-lime-200",
              amber: "border-amber-400/30 text-amber-200",
              sky: "border-sky-400/30 text-sky-200",
              purple: "border-purple-400/30 text-purple-200",
            }[t.tone] || "border-zinc-700 text-zinc-200";
            return (
              <div
                key={t.key}
                className={`bg-zinc-950/60 border ${toneClass} rounded-xl p-2.5 min-w-0`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3 h-3 opacity-80" />
                  <p className="text-[9.5px] uppercase tracking-wider opacity-80 truncate">
                    {t.label}
                  </p>
                </div>
                <p className="text-sm font-semibold text-white leading-tight truncate">
                  {t.value}
                </p>
                {t.sub && (
                  <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{t.sub}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Highlight tags — strengths in lime, weaknesses in amber. */}
      {highlightTags.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-1.5">
            Highlights
          </p>
          <div className="flex flex-wrap gap-1.5">
            {highlightTags.map((t, i) => (
              <span
                key={`${t.label}-${i}`}
                className={`text-[11px] px-2 py-1 rounded-full border ${
                  t.kind === "strength"
                    ? "bg-lime-400/10 text-lime-300 border-lime-400/30"
                    : "bg-amber-400/10 text-amber-300 border-amber-400/30"
                }`}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Shot count footer — small, only when we have shots. Keeps the
          card honest about the sample size behind the stats. */}
      {total > 0 && (
        <p className="mt-3 text-[10px] text-zinc-500">
          Based on {total} detected {total === 1 ? "shot" : "shots"}.
        </p>
      )}
    </motion.section>
  );
}
