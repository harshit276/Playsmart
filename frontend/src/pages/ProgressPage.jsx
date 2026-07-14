import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Flame, TrendingUp, Target, Video, ArrowRight, Upload, Star, Award,
  Share2, Trophy, ChevronDown, Calendar, Repeat,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";
import api from "@/lib/api";
import { BadgeGrid } from "@/components/BadgeDisplay";
import ShareModal from "@/components/ShareModal";
import { AnimatedNumber, ScoreGauge } from "@/components/AnimatedStat";

// Stash a baseline analysis and jump to /analyze in "Progress Review" mode —
// the AnalyzePage reads this on mount to run the before/after comparison.
export const PROGRESS_BASELINE_KEY = "playsmart_progress_baseline";

const SPORT_EMOJI = {
  badminton: "🏸", tennis: "🎾", table_tennis: "🏓", pickleball: "⚡",
  cricket: "🏏", football: "⚽", basketball: "🏀", swimming: "🏊", weightlifting: "🏋️",
  strength_training: "🏋️", calisthenics: "💪", "bodyweight exercise": "💪", running: "🏃", cycling: "🚴",
};
const emojiFor = (s) =>
  SPORT_EMOJI[(s || "").toLowerCase().replace(/\s+/g, "_")] || "🎯";

// Collapse Gemini's free-form sport names into a canonical key so the SAME
// sport doesn't split into near-duplicate groups on the progress page
// (e.g. "Strength Training", "Gym / Strength Training", "Gym" were each shown
// as a separate sport). Order matters: more specific checks first
// (table tennis before tennis; calisthenics before generic strength).
const canonicalSport = (raw) => {
  const s = (raw || "").toLowerCase();
  if (/badminton/.test(s)) return "badminton";
  if (/table.?tennis|ping.?pong/.test(s)) return "table tennis";
  if (/tennis/.test(s)) return "tennis";
  if (/pickle/.test(s)) return "pickleball";
  if (/cricket/.test(s)) return "cricket";
  if (/football|soccer/.test(s)) return "football";
  if (/basketball/.test(s)) return "basketball";
  if (/swim/.test(s)) return "swimming";
  if (/weightlift|powerlift|deadlift/.test(s)) return "weightlifting";
  if (/calisthenic|bodyweight/.test(s)) return "calisthenics";
  if (/gym|strength|workout|fitness|bodybuild|crossfit/.test(s)) return "strength training";
  if (/\brun|jog|sprint/.test(s)) return "running";
  if (/cycl/.test(s)) return "cycling";
  return s.trim() || "unknown";
};
const labelFor = (s) => (s || "sport").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const shortDate = (d) => { try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } };
const longDate = (d) => { try { return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };
const gradeColor = (g) => g === "A" ? "bg-lime-400 text-black" : g === "B" ? "bg-sky-400 text-black" : g === "C" ? "bg-amber-400 text-black" : "bg-red-500 text-white";

// Tiny inline sparkline for a per-shot score series.
function Sparkline({ values, w = 132, h = 34 }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(1, max - min);
  const step = w / (values.length - 1);
  const xy = (v, i) => [i * step, h - ((v - min) / range) * (h - 6) - 3];
  const path = values.map((v, i) => { const [x, y] = xy(v, i); return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  const up = values[values.length - 1] >= values[0];
  const color = up ? "#bef264" : "#fbbf24";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="none">
      <path d={`${path} L${w},${h} L0,${h} Z`} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
      {values.map((v, i) => { const [x, y] = xy(v, i); return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.2" fill={color} />; })}
    </svg>
  );
}

// Per-sport stats derived from that sport's analyses (oldest → newest).
function computeSportStats(list) {
  const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
  const scoreSeries = sorted
    .map((a) => ({ label: shortDate(a.date), score: (a.shot_analysis?.score) || 0 }))
    .filter((p) => p.score > 0);

  const shotMap = {};
  for (const a of sorted) {
    const sa = a.shot_analysis || {};
    const key = (sa.shot_type || sa.shot_name || "shot").toString().toLowerCase();
    if (!shotMap[key]) shotMap[key] = { name: sa.shot_name || labelFor(key), scores: [], lastGrade: null };
    if (typeof sa.score === "number" && sa.score > 0) shotMap[key].scores.push(sa.score);
    if (sa.grade) shotMap[key].lastGrade = sa.grade;
  }
  const shots = Object.values(shotMap)
    .map((s) => ({
      name: s.name,
      count: s.scores.length,
      latest: s.scores[s.scores.length - 1] ?? null,
      delta: s.scores.length >= 2 ? s.scores[s.scores.length - 1] - s.scores[0] : null,
      series: s.scores,
      grade: s.lastGrade,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  // Recurring focus areas — count repeated weakness phrases (exact-ish).
  const focus = {};
  for (const a of sorted) {
    for (const w of (a.shot_analysis?.weaknesses || [])) {
      const k = String(typeof w === "string" ? w : (w?.issue || w?.area || "")).trim();
      if (k.length < 8) continue;
      focus[k] = (focus[k] || 0) + 1;
    }
  }
  const focusAreas = Object.entries(focus)
    .map(([label, count]) => ({ label, count }))
    .filter((f) => f.count >= 2)             // only show genuinely RECURRING ones
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return {
    count: list.length,
    scoreSeries,
    shots,
    focusAreas,
    firstLevel: sorted[0]?.skill_level || null,
    latestLevel: sorted[sorted.length - 1]?.skill_level || null,
    lastDate: sorted[sorted.length - 1]?.date || null,
    totalSessions: sorted.length,
  };
}

export default function ProgressPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [badgesData, setBadgesData] = useState(null);
  const [trainingData, setTrainingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSport, setActiveSport] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [showTraining, setShowTraining] = useState(false);

  const startProgressReview = (a) => {
    try {
      const shot = a.shot_analysis || {};
      sessionStorage.setItem(PROGRESS_BASELINE_KEY, JSON.stringify({
        id: a.id, sport: a.sport || null, date: a.date || null,
        skill_level: a.skill_level || null, quick_summary: a.quick_summary || null,
        shot_analysis: { shot_name: shot.shot_name || null, score: shot.score ?? null, grade: shot.grade || null },
      }));
    } catch { /* private mode — flow still works */ }
    navigate("/analyze");
  };

  const loadData = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const results = await Promise.allSettled([
      api.get(`/analysis-history/${user.id}`),
      api.get(`/badges/${user.id}`),
      api.get(`/progress/${user.id}`),
    ]);
    if (results[0].status === "fulfilled") setAnalysisHistory(results[0].value.data.analyses || []);
    if (results[1].status === "fulfilled") setBadgesData(results[1].value.data);
    if (results[2].status === "fulfilled") setTrainingData(results[2].value.data);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { document.title = "Progress | Formanti"; }, []);

  // Group analyses by sport, pick the most-analyzed as the default view.
  const bySport = useMemo(() => {
    const m = {};
    for (const a of analysisHistory) {
      const s = canonicalSport(a.sport);
      (m[s] = m[s] || []).push(a);
    }
    return m;
  }, [analysisHistory]);

  const sports = useMemo(
    () => Object.entries(bySport).sort((a, b) => b[1].length - a[1].length).map(([s]) => s),
    [bySport],
  );

  useEffect(() => {
    if (!activeSport && sports.length) setActiveSport(sports[0]);
  }, [sports, activeSport]);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="h-10 bg-zinc-800 rounded-xl animate-pulse w-48 mb-6" />
        <div className="grid grid-cols-3 gap-3 mb-6">{[1, 2, 3].map((i) => <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl h-24 animate-pulse" />)}</div>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl h-64 animate-pulse" />
      </div>
    </div>
  );

  const totalAnalyses = analysisHistory.length;
  const stats = activeSport ? computeSportStats(bySport[activeSport] || []) : null;
  const streak = trainingData?.current_streak || 0;

  // ── Empty state — no analyses yet ──
  if (totalAnalyses === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 py-10">
        <div className="container mx-auto px-4 max-w-xl text-center">
          <h1 className="font-heading font-bold text-3xl uppercase tracking-tight text-white mb-3">📈 Your Progress</h1>
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-10 mt-6">
            <Video className="w-12 h-12 text-zinc-600 mx-auto mb-4" strokeWidth={1.5} />
            <p className="text-zinc-300 text-lg font-medium mb-2">Your progress starts with your first analysis</p>
            <p className="text-zinc-500 text-sm mb-6">Upload a clip and we'll start tracking your score, shot-by-shot, for every sport you play.</p>
            <Link to="/analyze">
              <Button className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-6 h-12">
                <Upload className="w-4 h-4 mr-2" /> Analyze your first video
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="progress-page">
      <div className="container mx-auto px-4 max-w-3xl">
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl uppercase tracking-tight text-white mb-5" data-testid="progress-title">
          📈 Your Progress
        </motion.h1>

        {/* Motivational stat strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon: Video, label: "Analyses", value: totalAnalyses, color: "text-lime-400" },
            { icon: Target, label: "Sports tracked", value: sports.length, color: "text-sky-400" },
            { icon: streak > 0 ? Flame : Award, label: streak > 0 ? "Day streak" : "Badges",
              value: streak > 0 ? streak : (badgesData?.total_earned || 0), color: "text-amber-400" },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 text-center">
              <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-1.5`} strokeWidth={1.5} />
              <p className="font-heading font-bold text-2xl text-white leading-none">
                <AnimatedNumber value={s.value} />
              </p>
              <p className="text-zinc-500 text-[10px] uppercase tracking-wide mt-1">{s.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Sport selector */}
        {sports.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1">
            {sports.map((s) => (
              <button key={s} onClick={() => setActiveSport(s)}
                className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                  activeSport === s ? "bg-lime-400 text-black border-lime-400" : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                }`}>
                <span>{emojiFor(s)}</span>{labelFor(s)}
                <span className={`text-[10px] ${activeSport === s ? "text-black/60" : "text-zinc-500"}`}>{bySport[s].length}</span>
              </button>
            ))}
          </div>
        )}

        {stats && (
          <motion.div key={activeSport} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            {/* Sport summary */}
            {(() => {
              const latestScore = stats.scoreSeries.length ? stats.scoreSeries[stats.scoreSeries.length - 1].score : null;
              return (
                <div className="bg-gradient-to-br from-lime-400/10 via-zinc-900 to-zinc-900 border border-lime-400/25 rounded-2xl p-5">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{emojiFor(activeSport)}</span>
                      <div>
                        <p className="font-heading font-bold text-xl text-white leading-none">{labelFor(activeSport)}</p>
                        <p className="text-[11px] text-zinc-400 mt-1">{stats.count} {stats.count === 1 ? "analysis" : "analyses"} · last {shortDate(stats.lastDate)}</p>
                        <p className="text-[11px] text-zinc-400 mt-2">
                          <span className="uppercase tracking-wider text-zinc-500">Level </span>
                          <span className="font-heading font-bold text-lime-300">{stats.latestLevel || "—"}</span>
                          {stats.firstLevel && stats.latestLevel && stats.firstLevel !== stats.latestLevel && (
                            <span className="text-lime-400"> · ↑ from {stats.firstLevel}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {/* Animated latest-score gauge — the same reveal visual as
                        the analyze page, keyed to the sport so it replays on switch. */}
                    {latestScore != null && latestScore > 0 && (
                      <div className="mx-auto sm:mx-0">
                        <ScoreGauge value={latestScore / 10} size={132} label="Latest" runKey={activeSport} duration={1.6} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Per-shot trend cards */}
            {stats.shots.length > 0 && (
              <div>
                <p className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-lime-400" /> Your shots over time
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {stats.shots.map((shot) => (
                    <div key={shot.name} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white capitalize truncate">{shot.name}</p>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{shot.count} {shot.count === 1 ? "session" : "sessions"}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {shot.latest != null && <span className="font-heading font-bold text-lg text-white">{shot.latest}</span>}
                          {shot.grade && <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-heading font-bold text-sm ${gradeColor(shot.grade)}`}>{shot.grade}</div>}
                        </div>
                      </div>
                      {shot.series.length >= 2 ? (
                        <>
                          <Sparkline values={shot.series} />
                          <p className={`text-[11px] mt-1.5 font-medium ${shot.delta > 0 ? "text-lime-400" : shot.delta < 0 ? "text-amber-400" : "text-zinc-500"}`}>
                            {shot.delta > 0 ? `↑ +${shot.delta} since first session` : shot.delta < 0 ? `↓ ${shot.delta} — keep at it` : "→ holding steady"}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] text-zinc-500 mt-1">Analyze this shot again to see your trend.</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Session-quality trend (segmented to THIS sport) */}
            {stats.scoreSeries.length >= 2 && (
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
                <p className="text-sm font-medium text-zinc-300 mb-1 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-lime-400" /> {labelFor(activeSport)} session quality
                </p>
                <p className="text-[10px] text-zinc-500 mb-3">A rough quality score per session — trend matters more than the exact number.</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.scoreSeries}>
                      <defs>
                        <linearGradient id="pScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#bef264" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#bef264" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fafafa", fontSize: 12 }} />
                      <Area type="monotone" dataKey="score" stroke="#bef264" fill="url(#pScore)" strokeWidth={2} dot={{ fill: "#bef264", r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Recurring focus areas — what to work on */}
            {stats.focusAreas.length > 0 && (
              <div className="bg-zinc-900/80 border border-amber-400/20 rounded-2xl p-5">
                <p className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-400" /> What keeps coming up
                </p>
                <div className="space-y-2">
                  {stats.focusAreas.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 bg-amber-400/5 border border-amber-400/15 rounded-xl px-3 py-2">
                      <span className="text-[13px] text-amber-100/90 leading-snug">{f.label}</span>
                      <span className="text-[10px] text-amber-300/80 shrink-0 whitespace-nowrap">{f.count} of {stats.totalSessions} sessions</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline for this sport */}
            <div>
              <p className="text-sm font-medium text-zinc-300 mb-3">{labelFor(activeSport)} sessions</p>
              <div className="space-y-3">
                {(bySport[activeSport] || []).map((a, i) => {
                  const shot = a.shot_analysis || {};
                  return (
                    <div key={a.id} className={`bg-zinc-900/80 border rounded-2xl p-4 ${i === 0 ? "border-lime-400/30" : "border-zinc-800"}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{shot.shot_name || "Analysis"}</p>
                          {i === 0 && <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-[9px] shrink-0">Latest</Badge>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {shot.score != null && <Badge className={`text-xs font-bold ${i === 0 ? "bg-lime-400/10 text-lime-400 border-lime-400/20" : "bg-zinc-800 text-zinc-300 border-zinc-700"}`}>{shot.score}/100</Badge>}
                          {shot.grade && <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-heading font-bold text-sm ${gradeColor(shot.grade)}`}>{shot.grade}</div>}
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500">{longDate(a.date)}{a.skill_level && <> · {a.skill_level}</>}</p>
                      {a.quick_summary && <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2">{a.quick_summary}</p>}
                      <div className="mt-3 flex items-center gap-2">
                        <Button size="sm" onClick={() => startProgressReview(a)}
                          className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-xs px-4 h-9">
                          <Repeat className="w-3.5 h-3.5 mr-1.5" /> Re-analyze to compare
                        </Button>
                        <Link to={`/analyze?view=${a.id}`} className="text-xs text-zinc-400 hover:text-lime-400 font-medium px-2 py-1.5">View</Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Motivating CTA */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 text-center">
              <p className="text-sm text-zinc-300 mb-1 font-medium">
                {stats.count === 1 ? "One more analysis unlocks your trend" : "Keep the streak going"}
              </p>
              <p className="text-xs text-zinc-500 mb-4">
                {stats.count === 1
                  ? `Analyze another ${labelFor(activeSport).toLowerCase()} clip and we'll chart how you're improving.`
                  : `Every clip you analyze sharpens your ${labelFor(activeSport).toLowerCase()} trend.`}
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                <Link to="/analyze">
                  <Button className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-6 h-11">
                    <Upload className="w-4 h-4 mr-2" /> Analyze another clip
                  </Button>
                </Link>
                <Button variant="outline" onClick={() => setShareOpen(true)}
                  className="border-zinc-700 text-zinc-400 hover:border-lime-400 hover:text-lime-400 rounded-full h-11 px-5">
                  <Share2 className="w-4 h-4 mr-2" /> Share
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Badges */}
        {badgesData && (badgesData.all_badges?.length > 0) && (
          <div className="mt-6 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-zinc-300 flex items-center gap-2"><Award className="w-4 h-4 text-amber-400" /> Badges</p>
              <Badge className="bg-amber-400/10 text-amber-400 border-amber-400/20 text-xs">{badgesData.total_earned} / {badgesData.total_available}</Badge>
            </div>
            <BadgeGrid badges={badgesData.all_badges || []} showLocked={true} />
          </div>
        )}

        {/* 30-day training plan — secondary, collapsed by default (most users
            track progress via analyses, not the structured plan). */}
        {trainingData && trainingData.completed_days > 0 && (
          <div className="mt-6">
            <button onClick={() => setShowTraining((v) => !v)}
              className="w-full flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 text-left">
              <span className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-400" /> 30-day training plan
                <span className="text-xs text-zinc-500">{trainingData.completed_days}/{trainingData.total_days} days</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${showTraining ? "rotate-180" : ""}`} />
            </button>
            {showTraining && (
              <div className="mt-3 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
                <div className="grid grid-cols-7 sm:grid-cols-10 gap-2">
                  {Array.from({ length: trainingData.total_days || 30 }, (_, i) => i + 1).map((day) => {
                    const done = new Set((trainingData.entries || []).map((e) => e.day)).has(day);
                    return <div key={day} className={`w-full aspect-square rounded-lg flex items-center justify-center text-[11px] font-medium ${done ? "bg-lime-400 text-black font-bold" : "bg-zinc-800 text-zinc-500"}`}>{day}</div>;
                  })}
                </div>
                <Link to="/training" className="inline-flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300 font-medium mt-4">
                  Go to training plan <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareData={{
          title: "My Formanti Progress",
          text: `My Formanti progress:\n${totalAnalyses} video analyses across ${sports.length} sport(s)\n${badgesData?.total_earned || 0} badges\n\nTrain smarter with Formanti!`,
          card: {
            player_name: user?.name || "Formanti Player",
            skill_level: stats?.latestLevel || "",
            sport: activeSport ? labelFor(activeSport) : "",
            badges_count: badgesData?.total_earned || 0,
            analysis_count: totalAnalyses,
            training_days: trainingData?.completed_days || 0,
          },
        }}
        cardType="progress"
      />
    </div>
  );
}
