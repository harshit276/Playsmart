import { useState } from "react";
import { motion } from "framer-motion";
import {
  Flame, Navigation, Users, Star, ThumbsUp, AlertTriangle, Gauge, BarChart3, Clock, Repeat,
  ChevronDown, Play, Shirt, MapPin, ArrowDown,
} from "lucide-react";
import { sportFamily } from "@/lib/sportFamily";
import { seekMainVideo, formatClock } from "@/lib/seekMainVideo";

// PlayerDetectionCard — the first card on a universal-mode result: WHO we
// analysed and the at-a-glance read (level, best shot, what's working, top
// fix, session metrics).
//
// Everything is derived client-side from the existing `result` payload — no
// new API calls. Honest empty states: a block we can't back with data is
// hidden, never filled with placeholder text.
//
// Interactive on purpose (users said the old tiles cut text off and "nothing
// opens on click"): no truncated text; the best shot jumps the video to it;
// What's working / Top fix expand; each metric explains itself on tap.
//
// Props:
//   - result: the universal-mode analyze result object. Required.
//   - player: optional override descriptor for a non-selected athlete
//       { id, description, clothing, court_position, thumbnail }.
//   - sport: detected sport string, used as a small chip.
//   - emphasis: "primary" (default) or "compact".

const METRIC_HELP = {
  tempo: "Shots you played per minute of this clip. Higher means faster exchanges.",
  "aggression-metric": "The share of your shots the coach tagged as attacking. The rest were neutral or defensive.",
  variety: "How many different shot types you played in this clip.",
  "recovery-metric": "The average time between one of your shots and your next one.",
  fhbh: "How your shots split between the forehand and backhand sides.",
  reps: "Every rep the coach counted in this clip.",
  exercises: "How many different exercises you did.",
  pace: "Reps per minute of this clip.",
  perrep: "The average time from one rep to the next.",
  duration: "How long this clip runs.",
  cadence: "Movement cycles per minute of this clip.",
  phases: "The distinct phases the coach picked out.",
  attempts: "Every attempt the coach counted.",
  types: "Different kinds of attempts in this clip.",
  "pace-other": "The average time between attempts.",
};

const TONE_TEXT = {
  lime: "text-lime-300", amber: "text-amber-300", sky: "text-sky-300", purple: "text-purple-300",
};
const TONE_BAR = {
  lime: "bg-lime-400", amber: "bg-amber-400", sky: "bg-sky-400", purple: "bg-purple-400",
};

// Content words, for spotting a description that only repeats the chips.
const _STOP = new Set(["a", "an", "and", "the", "with", "in", "on", "of", "player", "side", "court", "wearing", "shirt"]);
const contentWords = (s) => new Set(String(s || "").toLowerCase().match(/[a-z]+/g)?.filter((w) => !_STOP.has(w)) || []);

// Unique, non-empty, trimmed strings (case/punctuation-insensitive).
function uniqueLines(items, max) {
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) continue;
    const key = s.toLowerCase().replace(/[.!?\s]+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function scrollToSection(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) {
      try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* noop */ }
      return;
    }
  }
}

export default function PlayerDetectionCard({ result, player, sport, emphasis = "primary" }) {
  const [openRow, setOpenRow] = useState(null); // "working" | "fix" | null
  const [openMetric, setOpenMetric] = useState(null);
  if (!result) return null;

  // ── Who this card represents ────────────────────────────────────────
  const tp = result._target_player || null;
  const thumbnail =
    player?.thumbnail ||
    result._target_player_thumbnail_hq ||
    result._target_player_thumbnail ||
    tp?.thumbnail ||
    null;
  const rawDescription = player?.description || result._target_player_description || tp?.description || null;
  const clothing = player?.clothing || tp?.clothing || null;
  const courtPosition = player?.court_position || tp?.court_position || null;
  const rawId = player?.id || tp?.id || null;
  // "p1", "player_1", "1" → "Player 1".
  const idNum = rawId != null ? String(rawId).replace(/^(player|p)[_\s-]*/i, "") : "";
  const playerLabel = idNum ? `Player ${idNum}` : "Player 1";
  // Gemini's description usually restates the clothing and court position,
  // often twice ("… left side (blue shirt, …, left side)"). Show it only when
  // it says something the chips don't.
  let description = rawDescription ? String(rawDescription).replace(/\s*\([^)]*\)\s*$/, "").trim() : null;
  if (description && (clothing || courtPosition)) {
    const known = contentWords(`${clothing || ""} ${courtPosition || ""}`);
    const extra = [...contentWords(description)].filter((w) => !known.has(w));
    if (extra.length < 3) description = null;
  }

  // ── Shot-derived metrics ────────────────────────────────────────────
  const shots = Array.isArray(result.shots) ? result.shots : [];
  const total = shots.length;
  const family = sportFamily(sport || result.sport);

  const counts = new Map();
  for (const s of shots) {
    const key = (s.shot_category || s.type || s.shot_type || s.name || "").toString().toLowerCase().trim();
    if (key && key !== "unknown") counts.set(key, (counts.get(key) || 0) + 1);
  }
  const byType = [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

  // The coach's read (rendered right below) opens with the same sentence, so
  // only lead with it here when there is no coach's read.
  const introText = (result.coach_narrative?.intro || "").trim();
  let styleSentence = "";
  if (!introText && (result.quick_summary || "").trim()) {
    const q = result.quick_summary.trim();
    const m = q.match(/^[^.!?]+[.!?]/);
    styleSentence = (m ? m[0] : q).trim();
  }

  const skillLevel = (result.skill_level || result.overall_skill_level || "").toString().trim();
  const sessionScore = typeof result.technique_score === "number" ? result.technique_score : null;

  const intentShots = shots.filter((s) => typeof s.intent === "string");
  const attackingCount = intentShots.filter((s) => s.intent === "attacking").length;
  const aggressionPct = intentShots.length ? Math.round((attackingCount / intentShots.length) * 100) : null;

  // ── Best shot: by the technique checks, never by detection confidence.
  // "65% sure" was how certain the AI was that a shot happened, not how good
  // it was; older results without technique scores simply skip this row.
  const bestShot = shots.reduce((best, s) => {
    if (!s || typeof s.technique_score !== "number") return best;
    return !best || s.technique_score > best.technique_score ? s : best;
  }, null);
  const bestShotName = bestShot
    ? (bestShot.shot_label || bestShot.name || (bestShot.type || "Shot")).toString().replace(/_/g, " ")
    : null;

  // ── What's working / top fix ─────────────────────────────────────────
  const sentences = (text) => String(text || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const cn = result.coach_narrative || {};
  const strengths = uniqueLines([
    ...shots.flatMap((s) => s.formFeedback?.strengths || s.form_feedback?.strengths || []),
    ...(Array.isArray(cn.strengths_points) ? cn.strengths_points : sentences(cn.strengths_paragraph)),
  ], 4);
  const fixes = uniqueLines([
    ...shots.flatMap((s) => { const t = s.formFeedback?.tip || s.form_feedback?.tip; return t ? [t] : []; }),
    ...shots.flatMap((s) => s.formFeedback?.weaknesses || s.form_feedback?.weaknesses || []),
    ...(Array.isArray(cn.improvements_points) ? cn.improvements_points : sentences(cn.improvements_paragraph)),
  ], 4);

  // Consistency only from a real repeatability measure. The old fallback was
  // the spread of detection confidence, which says nothing about motion.
  const consistencyScore =
    typeof result.match_metrics?.consistency === "number" ? result.match_metrics.consistency
    : typeof result.overall_consistency === "number" ? result.overall_consistency
    : null;
  const consistencyPct = consistencyScore !== null && total >= 3 ? Math.round(consistencyScore * 100) : null;

  // ── Session metrics ─────────────────────────────────────────────────
  const tsValues = shots
    .map((s) => (typeof s.timestamp === "number" && isFinite(s.timestamp) ? s.timestamp : null))
    .filter((v) => v !== null)
    .sort((a, b) => a - b);
  const durationSec =
    (typeof result.video_info?.duration_sec === "number" && result.video_info.duration_sec) ||
    (typeof result.video_info?.duration === "number" && result.video_info.duration) ||
    (tsValues.length >= 2 ? tsValues[tsValues.length - 1] - tsValues[0] : null);
  const tempoShotsPerMin = durationSec && durationSec > 0 ? Math.round((total / durationSec) * 60 * 10) / 10 : null;
  const distinctTypes = counts.size;
  const recoveryGaps = [];
  for (let i = 1; i < tsValues.length; i++) recoveryGaps.push(tsValues[i] - tsValues[i - 1]);
  const avgRecoverySec = recoveryGaps.length
    ? Math.round((recoveryGaps.reduce((a, b) => a + b, 0) / recoveryGaps.length) * 10) / 10
    : null;
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
  const sessionType = result.session_type
    || result._session_type
    || (distinctTypes <= 1 ? "drill" : tempoShotsPerMin && tempoShotsPerMin > 6 ? "rally" : "mixed");

  let metricTiles;
  if (family === "racquet") {
    metricTiles = [
      tempoShotsPerMin !== null && { key: "tempo", label: "Tempo", value: `${tempoShotsPerMin}`, sub: "shots / min", icon: Gauge, tone: "lime" },
      aggressionPct !== null && { key: "aggression-metric", label: "Aggression", value: `${aggressionPct}%`, sub: "attack shots", icon: Flame, tone: "amber", bar: aggressionPct },
      distinctTypes > 0 && { key: "variety", label: "Variety", value: String(distinctTypes), sub: `shot type${distinctTypes === 1 ? "" : "s"}`, icon: BarChart3, tone: "sky" },
      avgRecoverySec !== null && { key: "recovery-metric", label: "Recovery", value: `${avgRecoverySec}s`, sub: "between shots", icon: Clock, tone: "purple" },
      sideTotal >= 2 && { key: "fhbh", label: "FH vs BH", value: `${fhPct}% / ${bhPct}%`, sub: `${fhCount} FH · ${bhCount} BH`, icon: Navigation, tone: "purple", split: fhPct },
    ].filter(Boolean);
  } else if (family === "strength") {
    metricTiles = [
      total > 0 && { key: "reps", label: "Reps", value: String(total), sub: `total rep${total === 1 ? "" : "s"}`, icon: Repeat, tone: "lime" },
      distinctTypes > 0 && { key: "exercises", label: "Exercises", value: String(distinctTypes), sub: "distinct", icon: BarChart3, tone: "sky" },
      tempoShotsPerMin !== null && total >= 3 && { key: "pace", label: "Pace", value: `${tempoShotsPerMin}`, sub: "reps / min", icon: Gauge, tone: "lime" },
      avgRecoverySec !== null && { key: "perrep", label: "Per rep", value: `${avgRecoverySec}s`, sub: "avg time / rep", icon: Clock, tone: "purple" },
    ].filter(Boolean);
  } else if (family === "continuous") {
    const durLabel = durationSec
      ? (durationSec >= 60 ? `${Math.floor(durationSec / 60)}m ${Math.round(durationSec % 60)}s` : `${Math.round(durationSec)}s`)
      : null;
    metricTiles = [
      durLabel && { key: "duration", label: "Duration", value: durLabel, sub: "session length", icon: Clock, tone: "sky" },
      tempoShotsPerMin !== null && total >= 3 && { key: "cadence", label: "Cadence", value: `${tempoShotsPerMin}`, sub: "cycles / min", icon: Gauge, tone: "lime" },
      distinctTypes > 1 && { key: "phases", label: "Phases", value: String(distinctTypes), sub: "distinct phases", icon: BarChart3, tone: "purple" },
    ].filter(Boolean);
  } else {
    metricTiles = [
      total > 0 && { key: "attempts", label: "Attempts", value: String(total), sub: `total attempt${total === 1 ? "" : "s"}`, icon: Repeat, tone: "lime" },
      distinctTypes > 1 && { key: "types", label: "Types", value: String(distinctTypes), sub: "distinct types", icon: BarChart3, tone: "sky" },
      avgRecoverySec !== null && { key: "pace-other", label: "Pace", value: `${avgRecoverySec}s`, sub: "between attempts", icon: Clock, tone: "purple" },
    ].filter(Boolean);
  }
  const activeMetric = metricTiles.find((t) => t.key === openMetric) || null;

  const isCompact = emphasis === "compact";
  const bestLabel = family === "strength" ? "Best rep" : family === "racquet" ? "Best shot" : "Best moment";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`bg-zinc-900/80 border border-purple-400/30 rounded-2xl ${isCompact ? "p-3" : "p-3 sm:p-4"} shadow-lg shadow-purple-400/5`}
      data-testid="player-detection-card"
    >
      {/* ── Who ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`${playerLabel} thumbnail`}
            className={`shrink-0 rounded-xl object-cover border border-purple-400/40 ${isCompact ? "w-14 h-14" : "w-16 h-16 sm:w-20 sm:h-20"}`}
          />
        ) : (
          <div className={`shrink-0 rounded-xl bg-purple-400/10 border border-purple-400/30 flex items-center justify-center ${isCompact ? "w-14 h-14" : "w-16 h-16 sm:w-20 sm:h-20"}`}>
            <Users className="w-6 h-6 text-purple-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-purple-300 font-bold">Analysed player</span>
            {sport && sport !== "unknown" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-400/10 text-purple-200 border border-purple-400/30 capitalize">
                {sport.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <h3 className="font-heading font-bold text-white text-lg leading-tight mt-0.5">{playerLabel}</h3>
          {(clothing || courtPosition) && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {clothing && (
                <span className="inline-flex items-center gap-1 text-[11px] text-zinc-200 bg-zinc-800/80 border border-zinc-700 rounded-full px-2 py-0.5">
                  <Shirt className="w-3 h-3 text-zinc-400" /> {clothing}
                </span>
              )}
              {courtPosition && (
                <span className="inline-flex items-center gap-1 text-[11px] text-zinc-200 bg-zinc-800/80 border border-zinc-700 rounded-full px-2 py-0.5">
                  <MapPin className="w-3 h-3 text-zinc-400" /> {courtPosition}
                </span>
              )}
            </div>
          )}
          {description && <p className="text-[12px] text-zinc-400 leading-snug mt-1.5">{description}</p>}
        </div>
      </div>

      {styleSentence && (
        <p className="mt-3 text-[13px] text-zinc-200 leading-relaxed border-l-2 border-purple-400/40 pl-3">{styleSentence}</p>
      )}

      {/* ── Level (+ session score) and consistency ─────────────────── */}
      {(skillLevel || consistencyPct !== null) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {skillLevel && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-lime-400/10 border border-lime-400/30 px-3 py-1.5">
              <Star className="w-3.5 h-3.5 text-lime-300 fill-current" />
              <span className="text-[13px] font-bold text-lime-200">{skillLevel}</span>
              {sessionScore !== null && (
                <span className="text-[12px] font-mono font-bold text-white bg-black/30 rounded-md px-1.5 py-0.5">
                  {sessionScore.toFixed(1)}<span className="text-zinc-500">/10</span>
                </span>
              )}
            </div>
          )}
          {consistencyPct !== null && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-sky-400/10 border border-sky-400/30 px-3 py-1.5">
              <Repeat className="w-3.5 h-3.5 text-sky-300" />
              <span className="text-[13px] font-bold text-sky-200">{consistencyPct}%</span>
              <span className="text-[11px] text-zinc-400">consistent</span>
            </div>
          )}
        </div>
      )}

      {/* ── Best shot: tap to watch it ───────────────────────────────── */}
      {bestShot && (
        <button
          type="button"
          onClick={() => seekMainVideo(bestShot.timestamp)}
          className="mt-3 w-full text-left bg-gradient-to-r from-lime-400/15 via-zinc-900 to-zinc-900 border border-lime-400/30 hover:border-lime-400/60 rounded-xl px-3 py-2.5 flex items-center gap-3 transition-colors group"
        >
          <div className="w-9 h-9 rounded-lg bg-lime-400/15 border border-lime-400/40 flex items-center justify-center shrink-0 group-hover:bg-lime-400/25">
            <Play className="w-4 h-4 text-lime-300 fill-current" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold">
              {bestLabel}{typeof bestShot.timestamp === "number" ? ` · ${formatClock(bestShot.timestamp)}` : ""} · tap to watch
            </p>
            <p className="text-[14px] text-white font-semibold mt-0.5 leading-snug capitalize">{bestShotName}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-heading font-bold text-lime-300 leading-none">{bestShot.technique_score.toFixed(1)}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">out of 10</p>
          </div>
        </button>
      )}

      {/* ── What's working / top fix: full text, tap for more ────────── */}
      {(strengths.length > 0 || fixes.length > 0) && (
        <div className="mt-3 space-y-2">
          {strengths.length > 0 && (
            <ExpandRow
              open={openRow === "working"}
              onToggle={() => setOpenRow(openRow === "working" ? null : "working")}
              icon={ThumbsUp}
              label="What's working"
              tone="lime"
              lead={strengths[0]}
              more={strengths.slice(1)}
              linkLabel="Read the coach's full note"
              onLink={() => scrollToSection("analysis-section-overview")}
            />
          )}
          {fixes.length > 0 && (
            <ExpandRow
              open={openRow === "fix"}
              onToggle={() => setOpenRow(openRow === "fix" ? null : "fix")}
              icon={AlertTriangle}
              label="Top fix"
              tone="amber"
              lead={fixes[0]}
              more={fixes.slice(1)}
              linkLabel="See all priority fixes"
              onLink={() => scrollToSection("analysis-section-improvement-areas", "analysis-section-overview")}
            />
          )}
        </div>
      )}

      {/* ── Session metrics: tap a tile for what it means ─────────────── */}
      {metricTiles.length > 0 && (
        <div className="mt-3 bg-zinc-950/40 border border-zinc-800 rounded-xl p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-2 flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3 text-zinc-400" />
            {family === "racquet" ? "Match metrics" : "Session metrics"}
            {family === "racquet" && <span className="text-zinc-600 font-normal normal-case tracking-normal">· {sessionType} · tap for details</span>}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {metricTiles.map((t) => {
              const Icon = t.icon;
              const active = openMetric === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setOpenMetric(active ? null : t.key)}
                  aria-expanded={active}
                  className={`text-left rounded-lg p-2 min-w-0 border transition-colors ${
                    active ? "bg-zinc-800 border-zinc-500" : "bg-zinc-900/70 border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className={`w-3 h-3 ${TONE_TEXT[t.tone]}`} />
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">{t.label}</p>
                  </div>
                  <p className={`text-base font-bold leading-tight ${TONE_TEXT[t.tone]}`}>{t.value}</p>
                  {typeof t.bar === "number" && (
                    <div className="mt-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div className={`h-full ${TONE_BAR[t.tone]}`} style={{ width: `${t.bar}%` }} />
                    </div>
                  )}
                  {typeof t.split === "number" && (
                    <div className="mt-1 h-1 rounded-full overflow-hidden flex">
                      <div className="h-full bg-purple-400" style={{ width: `${t.split}%` }} />
                      <div className="h-full bg-sky-400 flex-1" />
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-500 mt-1">{t.sub}</p>
                </button>
              );
            })}
          </div>
          {activeMetric && METRIC_HELP[activeMetric.key] && (
            <p className="text-[12px] text-zinc-300 leading-snug mt-2 px-1">
              <span className={`font-bold ${TONE_TEXT[activeMetric.tone]}`}>{activeMetric.label}: </span>
              {METRIC_HELP[activeMetric.key]}
            </p>
          )}

          {/* Reps per exercise — direct counts, the most useful "what did I
              actually do" view for a gym session. */}
          {family === "strength" && byType.length > 1 && (
            <div className="mt-2.5 pt-2.5 border-t border-zinc-800">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">Reps per exercise</p>
              <div className="space-y-1">
                {byType.slice(0, 8).map((e) => (
                  <div key={e.type} className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-zinc-300 capitalize">{e.type.replace(/_/g, " ")}</span>
                    <span className="text-[12px] text-white font-mono shrink-0">{e.count} rep{e.count === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}

// One expandable insight: the lead point in full (never clipped), and on tap
// the other points plus a link to the section that goes deeper.
function ExpandRow({ open, onToggle, icon: Icon, label, tone, lead, more, linkLabel, onLink }) {
  const palette = tone === "amber"
    ? { border: "border-amber-400/30", bg: "bg-amber-400/5", text: "text-amber-300", dot: "bg-amber-400" }
    : { border: "border-lime-400/30", bg: "bg-lime-400/5", text: "text-lime-300", dot: "bg-lime-400" };
  return (
    <div className={`rounded-xl border ${palette.border} ${palette.bg} overflow-hidden`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-3 py-2.5 flex items-start gap-2.5">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${palette.text}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] uppercase tracking-wider font-bold ${palette.text}`}>
            {label}{more.length > 0 ? ` · ${more.length + 1}` : ""}
          </p>
          <p className="text-[13px] text-white leading-snug mt-0.5">{lead}</p>
        </div>
        <ChevronDown className={`w-4 h-4 mt-1 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {/* Plain show/hide: a height animation left the content at 0px
          whenever animation frames were paused. */}
      {open && (
        <div className="px-3 pb-3 pl-9 space-y-1.5">
          {more.map((m) => (
            <p key={m} className="text-[12.5px] text-zinc-200 leading-snug flex gap-2">
              <span className={`mt-[7px] w-1 h-1 rounded-full shrink-0 ${palette.dot}`} />
              <span>{m}</span>
            </p>
          ))}
          <button type="button" onClick={onLink} className={`inline-flex items-center gap-1 text-[12px] font-semibold ${palette.text} hover:underline mt-1`}>
            {linkLabel} <ArrowDown className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
