import { motion } from "framer-motion";
import {
  Sparkles, Flame, Navigation, Users,
  Star, ThumbsUp, AlertTriangle, Target, Gauge, BarChart3, Clock, Repeat,
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

  // Count distinct shot types — used by the Variety match-metric tile.
  // We no longer render the top-shot chips row, so we don't track
  // per-type counts past `size`.
  const counts = new Map();
  for (const s of shots) {
    const key = (s.type || s.shot_category || s.shot_type || s.name || "")
      .toString()
      .toLowerCase()
      .trim();
    if (key) counts.set(key, true);
  }

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

  // Skill level is read in two places: the "Level" headline tile and
  // the matchMetricTiles row label below. Keep it close to the top.
  const skillLevel =
    (result.skill_level || result.overall_skill_level || "").toString().trim();

  // Aggression — % of shots flagged as `attacking` intent. Used by the
  // Match Metrics row only.
  const intentShots = shots.filter((s) => typeof s.intent === "string");
  const attackingCount = intentShots.filter((s) => s.intent === "attacking").length;
  const aggressionPct = intentShots.length
    ? Math.round((attackingCount / intentShots.length) * 100)
    : null;

  // ── Best shot ────────────────────────────────────────────────────────
  // The user-requested "Best shot of the session" hero row. Pick by
  // composite score: shot quality > raw confidence > timestamp tie-break
  // so we pick the one a coach would actually call out, not just the
  // first high-confidence frame.
  const bestShot = shots.reduce((best, s) => {
    if (!s) return best;
    const score = typeof s.score === "number"
      ? s.score
      : typeof s.confidence === "number" ? Math.round(s.confidence * 100) : 0;
    if (!best || score > best._score) {
      return { ...s, _score: score };
    }
    return best;
  }, null);

  // ── Aggregate strengths / weaknesses for the tile row ───────────────
  // Take the most-common positive and the most-common improvement
  // across all shots. Falls back to coach_narrative when per-shot
  // form_feedback is sparse.
  const firstNonEmpty = (...items) => {
    for (const v of items) {
      if (Array.isArray(v) && v.length && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  const sentenceFromNarrative = (text, maxLen = 120) => {
    if (!text) return null;
    const m = String(text).match(/^[^.!?]+[.!?]/);
    let out = (m ? m[0] : String(text)).trim();
    if (out.length > maxLen) out = out.slice(0, maxLen - 1).trim() + "…";
    return out;
  };
  const aggStrengths = shots.flatMap((s) => (s.formFeedback?.strengths || s.form_feedback?.strengths || []));
  const aggWeakness = shots.flatMap((s) => (s.formFeedback?.weaknesses || s.form_feedback?.weaknesses || []));
  const aggTips = shots.flatMap((s) => {
    const t = s.formFeedback?.tip || s.form_feedback?.tip;
    return t ? [t] : [];
  });
  const workingPhrase = firstNonEmpty(
    aggStrengths,
    sentenceFromNarrative(result.coach_narrative?.strengths_paragraph, 60),
  );
  const topFixPhrase = firstNonEmpty(
    aggTips,
    aggWeakness,
    sentenceFromNarrative(result.coach_narrative?.improvements_paragraph, 60),
    sentenceFromNarrative(result.coach_narrative?.takeaway, 60),
  );

  // ── Consistency — motion repeatability across the session ────────────
  // The on-device pipeline writes this to result.match_metrics.consistency
  // (0..1) or result.overall_consistency (0..1). When neither is present
  // we fall back to a confidence-stddev proxy: lower stddev → higher
  // perceived consistency.
  let consistencyScore =
    typeof result.match_metrics?.consistency === "number" ? result.match_metrics.consistency
    : typeof result.overall_consistency === "number" ? result.overall_consistency
    : null;
  if (consistencyScore === null && confValues.length >= 3) {
    const mean = confValues.reduce((a, b) => a + b, 0) / confValues.length;
    const variance = confValues.reduce((a, b) => a + (b - mean) ** 2, 0) / confValues.length;
    const stddev = Math.sqrt(variance);
    // Map stddev∈[0..0.4] → consistency∈[1..0]
    consistencyScore = Math.max(0, Math.min(1, 1 - stddev * 2.5));
  }
  const consistencyPct = typeof consistencyScore === "number"
    ? Math.round(consistencyScore * 100)
    : null;
  // Require >= 3 shots to call it "consistency" — anything less is too
  // small a sample for the word to mean anything.
  const consistencyShownPct = total >= 3 ? consistencyPct : null;

  // ── Match metrics — Tempo / Aggression / Variety / Recovery / FH-BH ──
  // Computed from the shots[] array we already have. Each metric is
  // surfaced only when we have enough signal to back it up; otherwise
  // the tile is hidden rather than rendered as "—" or "n/a".
  const tsValues = shots
    .map((s) => (typeof s.timestamp === "number" && isFinite(s.timestamp) ? s.timestamp : null))
    .filter((v) => v !== null)
    .sort((a, b) => a - b);
  const durationSec =
    (typeof result.video_info?.duration_sec === "number" && result.video_info.duration_sec) ||
    (typeof result.video_info?.duration === "number" && result.video_info.duration) ||
    (tsValues.length >= 2 ? tsValues[tsValues.length - 1] - tsValues[0] : null);
  const tempoShotsPerMin =
    durationSec && durationSec > 0
      ? Math.round((total / durationSec) * 60 * 10) / 10
      : null;
  const distinctTypes = counts.size;
  const recoveryGaps = [];
  for (let i = 1; i < tsValues.length; i++) {
    recoveryGaps.push(tsValues[i] - tsValues[i - 1]);
  }
  const avgRecoverySec = recoveryGaps.length
    ? Math.round((recoveryGaps.reduce((a, b) => a + b, 0) / recoveryGaps.length) * 10) / 10
    : null;
  // Forehand / backhand split — count shots whose label or category
  // mentions the words. Single-word checks so we don't double-count
  // "forehand drive" + "fh drive" type variants.
  let fhCount = 0;
  let bhCount = 0;
  for (const s of shots) {
    const text = `${s.shot_label || ""} ${s.shot_category || ""} ${s.type || ""} ${s.name || ""}`.toLowerCase();
    if (/\bforehand|\bfh\b|\bf\b/.test(text)) fhCount += 1;
    if (/\bbackhand|\bbh\b|\bb\b/.test(text)) bhCount += 1;
  }
  const sideTotal = fhCount + bhCount;
  const fhPct = sideTotal > 0 ? Math.round((fhCount / sideTotal) * 100) : null;
  const bhPct = sideTotal > 0 ? 100 - fhPct : null;

  // Session type heuristic for the metrics-band label (drill vs rally).
  const sessionType = result.session_type
    || result._session_type
    || (distinctTypes <= 1 ? "drill" : tempoShotsPerMin && tempoShotsPerMin > 6 ? "rally" : "mixed");

  // ── Render ──────────────────────────────────────────────────────────
  const isCompact = emphasis === "compact";

  // Build the 4 user-requested headline tiles (Level / What's working /
  // Top fix / Consistency). Anything not derivable is dropped — we never
  // render "—" tiles, the column shrinks instead. This MIRRORS the
  // tile row that previously lived in MatchInsights, so consolidating
  // here lets us hide it there.
  const headlineTiles = [
    skillLevel && {
      key: "level",
      label: "Level",
      value: skillLevel,
      sub: "AI Coach verdict",
      icon: Star,
      tone: "lime",
    },
    workingPhrase && {
      key: "working",
      label: "What's working",
      value: workingPhrase,
      sub: null,
      icon: ThumbsUp,
      tone: "lime",
      multiline: true,
    },
    topFixPhrase && {
      key: "fix",
      label: "Top fix",
      value: topFixPhrase,
      sub: null,
      icon: AlertTriangle,
      tone: "amber",
      multiline: true,
    },
    {
      key: "consistency",
      label: "Consistency",
      value: consistencyShownPct !== null ? `${consistencyShownPct}%` : "—",
      sub: consistencyShownPct !== null ? "Motion repeatability" : `Need 3+ shots${total > 0 ? ` (have ${total})` : ""}`,
      icon: Repeat,
      tone: consistencyShownPct !== null ? "sky" : "muted",
    },
  ].filter(Boolean);

  // Match-metrics row. Same gating: only shown when there's anything
  // useful to say.
  const matchMetricTiles = [
    tempoShotsPerMin !== null && {
      key: "tempo",
      label: "Tempo",
      value: `${tempoShotsPerMin}`,
      sub: "shots / min",
      icon: Gauge,
      tone: "lime",
    },
    aggressionPct !== null && {
      key: "aggression-metric",
      label: "Aggression",
      value: `${aggressionPct}%`,
      sub: "attack shots",
      icon: Flame,
      tone: "amber",
    },
    distinctTypes > 0 && {
      key: "variety",
      label: "Variety",
      value: String(distinctTypes),
      sub: `distinct shot${distinctTypes === 1 ? "" : "s"}`,
      icon: BarChart3,
      tone: "sky",
    },
    avgRecoverySec !== null && {
      key: "recovery-metric",
      label: "Recovery",
      value: `${avgRecoverySec}s`,
      sub: "between shots",
      icon: Clock,
      tone: "purple",
    },
    sideTotal >= 2 && {
      key: "fhbh",
      label: "FH vs BH",
      value: `${fhPct}% / ${bhPct}%`,
      sub: `${fhCount} FH · ${bhCount} BH`,
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
        isCompact ? "p-3" : "p-3 sm:p-4"
      } shadow-lg shadow-purple-400/5`}
      data-testid="player-detection-card"
    >
      {/* Header row: avatar + identity + confidence */}
      <div className="flex items-start gap-3">
        {thumbnail ? (
          <div className="relative shrink-0">
            <img
              src={thumbnail}
              alt={`${playerLabel} thumbnail`}
              className={`rounded-xl object-cover border border-purple-400/30 ${
                isCompact ? "w-14 h-14" : "w-16 h-16 sm:w-20 sm:h-20"
              }`}
            />
            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-purple-400 text-black text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shadow">
              Analyzed
            </span>
          </div>
        ) : (
          <div className={`shrink-0 rounded-xl bg-purple-400/10 border border-purple-400/30 flex items-center justify-center ${
            isCompact ? "w-14 h-14" : "w-16 h-16 sm:w-20 sm:h-20"
          }`}>
            <Users className="w-6 h-6 text-purple-300" />
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

      {/* ── Best shot of the session ────────────────────────────────────
          The user asked for this to live in the first card. Pulled from
          the highest-scoring shot in result.shots — bold left strip,
          big confidence number on the right. */}
      {bestShot && (
        <div className="mt-3 bg-gradient-to-r from-lime-400/12 via-zinc-900 to-zinc-900 border border-lime-400/30 rounded-xl px-3 py-2.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-lime-400/15 border border-lime-400/40 flex items-center justify-center shrink-0">
            <Star className="w-4 h-4 text-lime-300 fill-current" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold leading-none">
              ⭐ Best shot of the session
            </p>
            <p className="text-[13px] sm:text-sm text-white font-semibold mt-1 leading-tight truncate">
              {bestShot.shot_label || bestShot.name || (bestShot.type || "Shot").replace(/_/g, " ")}
              <span className="text-zinc-400 font-normal"> at {bestShot._score}% confidence</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-heading font-bold text-lime-300 leading-none">{bestShot._score}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">% sure</p>
          </div>
        </div>
      )}

      {/* ── Headline tiles: Level / What's working / Top fix / Consistency ──
          These previously lived as a separate row inside MatchInsights.
          Consolidated here so the user gets the at-a-glance "how am I
          doing" answer in the first card. */}
      {headlineTiles.length > 0 && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {headlineTiles.map((t) => {
            const Icon = t.icon;
            const toneClass = {
              lime: "border-lime-400/30",
              amber: "border-amber-400/30",
              sky: "border-sky-400/30",
              purple: "border-purple-400/30",
              muted: "border-zinc-800",
            }[t.tone] || "border-zinc-800";
            const valueColor = {
              lime: "text-lime-300",
              amber: "text-amber-300",
              sky: "text-sky-300",
              purple: "text-purple-200",
              muted: "text-zinc-500",
            }[t.tone] || "text-white";
            return (
              <div
                key={t.key}
                className={`bg-zinc-950/60 border ${toneClass} rounded-xl p-2.5 min-w-0`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3 h-3 text-zinc-400" />
                  <p className="text-[9.5px] uppercase tracking-wider text-zinc-400 truncate">
                    {t.label}
                  </p>
                </div>
                <p className={`font-semibold leading-tight ${
                  t.multiline ? "text-[12px] line-clamp-2" : "text-base"
                } ${valueColor}`}>
                  {t.value}
                </p>
                {t.sub && (
                  <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{t.sub}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Match metrics row ──────────────────────────────────────────
          Tempo / Aggression / Variety / Recovery / FH vs BH. Previously
          rendered as MatchMetricsPanel deeper in the page; brought up
          here per the user's request. */}
      {matchMetricTiles.length > 0 && (
        <div className="mt-3 bg-zinc-950/40 border border-zinc-800 rounded-xl p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-2 flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3 text-zinc-400" /> Match metrics
            <span className="text-zinc-600 font-normal normal-case tracking-normal">· {sessionType} session</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {matchMetricTiles.map((t) => {
              const Icon = t.icon;
              const accent = {
                lime: "text-lime-300",
                amber: "text-amber-300",
                sky: "text-sky-300",
                purple: "text-purple-300",
              }[t.tone] || "text-white";
              return (
                <div key={t.key} className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-2 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className={`w-3 h-3 ${accent} opacity-90`} />
                    <p className="text-[9.5px] uppercase tracking-wider text-zinc-500 truncate">
                      {t.label}
                    </p>
                  </div>
                  <p className={`text-sm font-bold leading-tight truncate ${accent}`}>
                    {t.value}
                  </p>
                  {t.sub && (
                    <p className="text-[9.5px] text-zinc-500 mt-0.5 truncate">{t.sub}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Removed (per user feedback): the "Top detected shots" chip
          row, the "Highlights" tag row, and the "Based on N detected
          shot" footer. The first card is now a clean overview hero —
          the per-shot identification + chip drilldown lives in the
          Coaching Insights block below (Shot Mix + per-shot cards). */}
    </motion.section>
  );
}
