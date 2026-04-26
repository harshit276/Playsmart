import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Target, Dumbbell, BarChart3, Video, Flame, ChevronRight,
  Star, Zap, Play, Clock, Calendar, ArrowRight, Camera, Trophy,
  Sparkles, Swords, Users
} from "lucide-react";
import api from "@/lib/api";
import { hasVideoAnalysis } from "@/lib/sportConfig";
import { BadgeStrip } from "@/components/BadgeDisplay";
import { swrGet } from "@/lib/cachedFetch";

const SPORT_LABELS = {
  badminton: "Badminton", table_tennis: "Table Tennis", tennis: "Tennis",
  pickleball: "Pickleball", swimming: "Swimming", cricket: "Cricket", football: "Football",
};

const SPORT_ACCENT = {
  badminton: { bg: "bg-lime-400", text: "text-lime-400", border: "border-lime-400", glow: "shadow-[0_0_30px_rgba(190,242,100,0.15)]" },
  table_tennis: { bg: "bg-sky-400", text: "text-sky-400", border: "border-sky-400", glow: "shadow-[0_0_30px_rgba(56,189,248,0.15)]" },
  swimming: { bg: "bg-blue-400", text: "text-blue-400", border: "border-blue-400", glow: "shadow-[0_0_30px_rgba(96,165,250,0.15)]" },
  cricket: { bg: "bg-green-400", text: "text-green-400", border: "border-green-400", glow: "shadow-[0_0_30px_rgba(74,222,128,0.15)]" },
  pickleball: { bg: "bg-emerald-400", text: "text-emerald-400", border: "border-emerald-400", glow: "shadow-[0_0_30px_rgba(52,211,153,0.15)]" },
  football: { bg: "bg-orange-400", text: "text-orange-400", border: "border-orange-400", glow: "shadow-[0_0_30px_rgba(251,146,60,0.15)]" },
  tennis: { bg: "bg-amber-400", text: "text-amber-400", border: "border-amber-400", glow: "shadow-[0_0_30px_rgba(251,191,36,0.15)]" },
};

const SPORT_EMOJIS = {
  badminton: "🏸", tennis: "🎾", table_tennis: "🏓", pickleball: "⚡",
  cricket: "🏏", football: "⚽", swimming: "🏊",
};

const SPORT_GRADIENT = {
  badminton: "from-lime-400/20 to-transparent",
  table_tennis: "from-sky-400/20 to-transparent",
  swimming: "from-blue-400/20 to-transparent",
  cricket: "from-green-400/20 to-transparent",
  pickleball: "from-emerald-400/20 to-transparent",
  football: "from-orange-400/20 to-transparent",
  tennis: "from-amber-400/20 to-transparent",
};

const SKILL_COLORS = {
  Beginner: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  Intermediate: "bg-sky-400/10 text-sky-400 border-sky-400/20",
  Advanced: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  Elite: "bg-purple-400/10 text-purple-400 border-purple-400/20",
};

// Progress ring component
function ProgressRing({ value, max, size = 56, strokeWidth = 4, color = "#bef264" }) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? value / max : 0;
  const offset = circ - pct * circ;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-heading font-bold text-sm text-white">{Math.round(pct * 100)}%</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [trainingVideos, setTrainingVideos] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [badgesData, setBadgesData] = useState(null);
  const [trainingPlan, setTrainingPlan] = useState(null);

  const selectedSports = profile?.selected_sports || ["badminton"];
  const activeSport = profile?.active_sport || selectedSports[0];

  const userId = user?.id || "guest";

  const loadData = useCallback(async () => {
    if (!user?.id) return; // Guests get default empty state
    // SWR-cached: subsequent visits paint instantly from cache, refresh in
    // background. Each setter fires twice — first with cached data, again
    // when the network call resolves with fresh data.
    const OPTS = { timeout: 8000 };
    const calls = [
      { url: `/progress/${user.id}`, set: (d) => setProgress(d) },
      { url: `/analysis-history/${user.id}`, set: (d) => setAnalysisHistory(d?.analyses || []) },
      { url: `/recommendations/equipment/${user.id}?category=racket`,
        set: (d) => setEquipment((d?.recommendations || []).slice(0, 3)) },
      { url: `/badges/${user.id}`, set: (d) => setBadgesData(d) },
      { url: `/recommendations/training/${user.id}`, set: (d) => setTrainingPlan(d) },
    ];
    for (const c of calls) {
      const { cached, fresh } = swrGet(c.url, OPTS);
      if (cached) c.set(cached);
      fresh.then(c.set).catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Per-sport analysis counts from history
  const sportAnalysisCounts = useMemo(() => {
    const counts = {};
    for (const a of analysisHistory) {
      const s = a.sport || activeSport;
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [analysisHistory, activeSport]);

  // Latest analysis per sport
  const latestAnalysisBySport = useMemo(() => {
    const map = {};
    for (const a of analysisHistory) {
      const s = a.sport || activeSport;
      if (!map[s]) map[s] = a;
    }
    return map;
  }, [analysisHistory, activeSport]);

  // Set page title
  useEffect(() => {
    document.title = "Dashboard | AthlyticAI";
  }, []);

  // Use defaults for guests / users without profile
  const isGuestMode = !user;

  const sportProfile = profile?.sports_profiles?.[activeSport] || {};
  const skillLevel = sportProfile.skill_level || profile?.skill_level || "Beginner";
  const sportHasVideoAnalysis = hasVideoAnalysis(activeSport);

  const switchAndNavigate = async (sport, path) => {
    if (sport !== activeSport && user) {
      setSwitching(true);
      try {
        await api.post(`/profile/switch-sport?sport=${sport}`);
        await refreshProfile();
      } catch {}
      setSwitching(false);
    }
    navigate(path);
  };

  const completedDays = progress?.completed_days || 0;
  const totalDays = progress?.total_days || 30;
  const streak = progress?.current_streak || 0;

  // Weekly progress data
  const entries = progress?.entries || [];
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map(d => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = d - dayOfWeek;
    const date = new Date(today);
    date.setDate(today.getDate() + diff);
    return {
      label: ["S", "M", "T", "W", "T", "F", "S"][d],
      done: d <= new Date().getDay() && entries.some(e => {
        const eDate = new Date(e.date || "");
        return eDate.getDay() === d;
      }),
      isToday: d === new Date().getDay(),
    };
  });

  const lastAnalysis = analysisHistory.length > 0 ? analysisHistory[0] : null;

  // Real "today's drills" — pull the next incomplete training day from the
  // weekly plan + map drill IDs to drill objects. Falls back to nothing if
  // the plan hasn't loaded yet (UI hides the section entirely).
  const todaysDrills = useMemo(() => {
    const plan = trainingPlan?.plan;
    const drillsMap = trainingPlan?.drills || {};
    if (!plan?.weeks?.length) return [];
    const allDays = plan.weeks.flatMap((w) => w.days || []);
    const completed = new Set(
      (progress?.entries || []).map((e) => e.day).filter(Boolean),
    );
    const next = allDays.find((d) => d.type !== "rest" && !completed.has(d.day));
    if (!next?.drills?.length) return [];
    return next.drills
      .map((id) => drillsMap[id])
      .filter(Boolean)
      .slice(0, 3);
  }, [trainingPlan, progress]);

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="dashboard-page">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="font-heading font-bold text-2xl sm:text-3xl md:text-5xl uppercase tracking-tight text-white mb-1" data-testid="dashboard-title">
            {isGuestMode ? "Welcome to AthlyticAI" : `Welcome Back${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base">
            {isGuestMode ? "Explore what AthlyticAI can do for your game." : "Here's your AthlyticAI overview."}
          </p>
        </motion.div>

        {isGuestMode && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="bg-lime-400/10 border border-lime-400/30 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-zinc-300"><Zap className="w-4 h-4 inline mr-1 text-lime-400" />Sign in to save your progress and get personalized recommendations.</p>
              <Link to="/auth" className="text-sm font-medium text-lime-400 hover:text-lime-300 shrink-0">Sign In &rarr;</Link>
            </div>
          </motion.div>
        )}

        {/* Quiz prompt — logged-in user with no sport profile yet */}
        {!isGuestMode && (!profile?.selected_sports?.length || !profile?.active_sport) && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="relative overflow-hidden bg-gradient-to-br from-lime-400/15 to-emerald-900/10 border border-lime-400/30 rounded-2xl p-5 sm:p-6">
              <div className="absolute -right-6 -bottom-6 text-[120px] opacity-10 select-none">🏸</div>
              <div className="relative flex items-start gap-4 flex-wrap">
                <div className="w-12 h-12 rounded-xl bg-lime-400/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6 text-lime-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-heading font-bold text-lg sm:text-xl text-white uppercase tracking-tight mb-1">
                    Personalize your dashboard
                  </h3>
                  <p className="text-zinc-300 text-sm mb-4">
                    Take our 30-second quiz so we can recommend the right training plan, equipment, and matches for your level.
                  </p>
                  <Link to="/assessment"
                    className="inline-flex items-center gap-1.5 bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-5 py-2.5 text-sm">
                    <Zap className="w-4 h-4" /> Take the Quiz
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── My Sports Cards ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
            <Star className="w-3 h-3" /> My Sports
          </p>
          <div className={`grid gap-4 ${selectedSports.length === 1 ? "grid-cols-1 max-w-2xl" : selectedSports.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
            {selectedSports.map((sport, idx) => {
              const acc = SPORT_ACCENT[sport] || SPORT_ACCENT.badminton;
              const emoji = SPORT_EMOJIS[sport] || "🎯";
              const sp = profile?.sports_profiles?.[sport] || {};
              const sLevel = sp.skill_level || profile?.skill_level || "Beginner";
              const sStyle = sp.play_style || profile?.play_style || "All-round";
              const analysisCount = sportAnalysisCounts[sport] || 0;
              const latestA = latestAnalysisBySport[sport];
              const isActive = sport === activeSport;
              const gradient = SPORT_GRADIENT[sport] || SPORT_GRADIENT.badminton;

              return (
                <motion.div
                  key={sport}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + idx * 0.07 }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className={`relative bg-zinc-900/80 border rounded-2xl p-5 overflow-hidden transition-all cursor-default ${
                    isActive ? `${acc.border} ${acc.glow}` : "border-zinc-800 hover:border-zinc-700"
                  }`}
                  data-testid={`sport-card-${sport}`}
                >
                  {/* Gradient background accent */}
                  <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl ${gradient} rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none`} />

                  {/* Header: emoji + name + active badge */}
                  <div className="relative flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <motion.div
                        whileHover={{ scale: 1.15, rotate: 8 }}
                        className={`w-12 h-12 rounded-xl ${acc.bg}/10 border-2 ${acc.border}/30 flex items-center justify-center`}
                      >
                        <span className="text-2xl">{emoji}</span>
                      </motion.div>
                      <div>
                        <h3 className="font-heading font-bold text-lg uppercase tracking-tight text-white">
                          {SPORT_LABELS[sport] || sport}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className={SKILL_COLORS[sLevel] || "bg-lime-400/10 text-lime-400 border-lime-400/20"} style={{ fontSize: "10px" }}>
                            {sLevel}
                          </Badge>
                          <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700" style={{ fontSize: "10px" }}>
                            {sStyle}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {isActive && (
                      <Badge className={`${acc.bg} text-black text-[9px] font-bold shrink-0`}>
                        ACTIVE
                      </Badge>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="relative flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1.5">
                      <Video className={`w-3.5 h-3.5 ${acc.text}`} />
                      <span className="text-sm font-semibold text-white">{analysisCount}</span>
                      <span className="text-xs text-zinc-500">analyses</span>
                    </div>
                    {latestA?.shot_analysis?.score != null && (
                      <div className="flex items-center gap-1.5">
                        <BarChart3 className={`w-3.5 h-3.5 ${acc.text}`} />
                        <span className="text-sm font-semibold text-white">{latestA.shot_analysis.score}</span>
                        <span className="text-xs text-zinc-500">last score</span>
                      </div>
                    )}
                    {latestA?.shot_analysis?.grade && !latestA?.shot_analysis?.score && (
                      <div className="flex items-center gap-1.5">
                        <Star className={`w-3.5 h-3.5 ${acc.text}`} />
                        <span className="text-sm font-semibold text-white">{latestA.shot_analysis.grade}</span>
                        <span className="text-xs text-zinc-500">grade</span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="relative flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => switchAndNavigate(sport, "/analyze")}
                      disabled={switching}
                      className={`flex-1 ${acc.bg}/10 ${acc.text} hover:${acc.bg}/20 border ${acc.border}/30 rounded-xl text-xs font-bold gap-1.5 transition-colors`}
                      data-testid={`sport-card-analyze-${sport}`}
                    >
                      <Camera className="w-3.5 h-3.5" /> Analyze
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => switchAndNavigate(sport, "/training")}
                      disabled={switching}
                      className="flex-1 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-xs font-bold gap-1.5 transition-colors"
                      data-testid={`sport-card-train-${sport}`}
                    >
                      <Dumbbell className="w-3.5 h-3.5" /> Train
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

          {/* ── Streak + Weekly Progress ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="md:col-span-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 flex flex-col items-center justify-center"
            data-testid="streak-card"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              <Flame className="w-10 h-10 text-amber-400 mb-3" strokeWidth={1.5} />
            </motion.div>
            <p className="font-heading font-black text-5xl text-white" data-testid="streak-count">{streak}</p>
            <p className="text-zinc-500 text-sm font-medium uppercase tracking-wide">Day Streak</p>
            <p className="text-zinc-600 text-xs mt-1">{completedDays} / {totalDays} days done</p>

            {/* Weekly dots */}
            <div className="flex gap-2 mt-4">
              {weekDays.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    d.done ? "bg-lime-400 text-black" :
                    d.isToday ? "bg-zinc-700 text-white ring-2 ring-lime-400/50" :
                    "bg-zinc-800 text-zinc-600"
                  }`}>
                    {d.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Upload streak message */}
            {badgesData?.current_upload_streak > 0 && (
              <div className="mt-3 bg-amber-400/5 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-amber-400 font-medium">
                  {badgesData.current_upload_streak}w upload streak! Keep it alive!
                </p>
              </div>
            )}
            {badgesData?.current_upload_streak === 0 && analysisHistory.length > 0 && (
              <div className="mt-3 bg-zinc-800/50 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-zinc-500">
                  Upload this week to start a streak!
                </p>
              </div>
            )}
          </motion.div>

          {/* ── Badges ── */}
          {badgesData && badgesData.total_earned > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="md:col-span-12 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-amber-400" /> Badges Earned
                </p>
                <Badge className="bg-amber-400/10 text-amber-400 border-amber-400/20 text-[10px]">
                  {badgesData.total_earned}/{badgesData.total_available}
                </Badge>
              </div>
              <BadgeStrip badges={badgesData.all_badges || []} maxShow={8} />
            </motion.div>
          )}

          {/* ── Main CTA: Analyze Your Game ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="md:col-span-8"
          >
            {sportHasVideoAnalysis ? (
            <Link to="/analyze" data-testid="analyze-cta" className="block group">
              <div className="relative bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 overflow-hidden hover:border-lime-400/40 transition-all">
                {/* Animated gradient border effect */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: "linear-gradient(135deg, rgba(190,242,100,0.05) 0%, transparent 50%, rgba(190,242,100,0.05) 100%)" }} />

                <div className="relative flex items-center gap-4 sm:gap-6">
                  <motion.div
                    whileHover={{ rotate: 10, scale: 1.1 }}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-lime-400/10 border-2 border-lime-400/30 flex items-center justify-center shrink-0"
                  >
                    <Camera className="w-8 h-8 sm:w-10 sm:h-10 text-lime-400" strokeWidth={1.5} />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading font-bold text-xl sm:text-2xl text-white uppercase tracking-tight mb-1">
                      Analyze Your Game
                    </h3>
                    <p className="text-zinc-400 text-sm mb-4">Upload a video and get instant AI coaching feedback — shot detection, technique consistency, and a coach narrative.</p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-lime-400 text-black rounded-xl text-xs font-bold group-hover:bg-lime-500 transition-colors">
                      <Camera className="w-3.5 h-3.5" /> Upload Video <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <ChevronRight className="w-6 h-6 text-zinc-600 group-hover:text-lime-400 transition-colors shrink-0 hidden sm:block" />
                </div>
              </div>
            </Link>
            ) : (
              <div className="relative bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 overflow-hidden">
                <div className="relative flex items-center gap-4 sm:gap-6">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-zinc-800/50 border-2 border-zinc-700/30 flex items-center justify-center shrink-0">
                    <Camera className="w-8 h-8 sm:w-10 sm:h-10 text-zinc-600" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-heading font-bold text-xl sm:text-2xl text-zinc-500 uppercase tracking-tight">
                        Video Analysis
                      </h3>
                      <span className="text-[10px] bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Coming Soon</span>
                    </div>
                    <p className="text-zinc-500 text-sm mb-3">
                      AI video analysis for {SPORT_LABELS[activeSport] || activeSport} is coming soon. Switch to a racket sport to use video analysis now.
                    </p>
                    <p className="text-zinc-600 text-xs">
                      Available now for Badminton, Tennis, Table Tennis, and Pickleball
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* ── Today's Training ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="md:col-span-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Today's Training
              </p>
              <ProgressRing value={completedDays} max={totalDays} size={44} strokeWidth={3} />
            </div>

            {todaysDrills.length > 0 ? (
              <div className="space-y-3">
                {todaysDrills.map((drill, i) => {
                  const colors = ["bg-sky-400", "bg-amber-400", "bg-purple-400"];
                  const c = colors[i % colors.length];
                  return (
                    <motion.div
                      key={drill.id || i}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + i * 0.05 }}
                      className="flex items-center gap-3 bg-zinc-800/50 rounded-xl p-3"
                    >
                      <div className={`w-8 h-8 ${c}/10 rounded-lg flex items-center justify-center shrink-0`}>
                        <Play className={`w-4 h-4 ${c.replace("bg-", "text-")}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{drill.name || "Drill"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {drill.duration_minutes > 0 && (
                            <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" /> {drill.duration_minutes} min
                            </span>
                          )}
                          {drill.difficulty && (
                            <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[9px] px-1.5 py-0">
                              {drill.difficulty}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <Dumbbell className="w-8 h-8 text-zinc-600 mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-zinc-500 text-xs">Loading your plan…</p>
              </div>
            )}

            <Link to="/training"
              className="mt-4 w-full inline-flex items-center justify-center gap-1 text-xs font-bold text-lime-400 hover:text-lime-300 bg-lime-400/5 hover:bg-lime-400/10 rounded-xl py-2.5 transition-colors">
              <Dumbbell className="w-3.5 h-3.5" /> Start Training <ArrowRight className="w-3 h-3" />
            </Link>
          </motion.div>

          {/* ── Recent Analysis ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="md:col-span-6 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
          >
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-4 flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> Recent Analysis
            </p>

            {lastAnalysis ? (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-lime-400/10 flex items-center justify-center">
                    {lastAnalysis.shot_analysis?.grade ? (
                      <span className="font-heading font-bold text-lime-400">{lastAnalysis.shot_analysis.grade}</span>
                    ) : (
                      <Video className="w-5 h-5 text-lime-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">
                      {lastAnalysis.shot_analysis?.shot_name || "Analysis"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {new Date(lastAnalysis.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {lastAnalysis.skill_level && <> &middot; {lastAnalysis.skill_level}</>}
                    </p>
                  </div>
                  {lastAnalysis.shot_analysis?.score != null && (
                    <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-sm font-bold">
                      {lastAnalysis.shot_analysis.score}/100
                    </Badge>
                  )}
                </div>
                {lastAnalysis.quick_summary && (
                  <p className="text-xs text-zinc-400 mb-3 line-clamp-2">{lastAnalysis.quick_summary}</p>
                )}

                {/* Before/After comparison if 2+ analyses */}
                {analysisHistory.length >= 2 && (
                  <div className="bg-zinc-800/40 rounded-xl p-3 mb-3">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Progress</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 text-center">
                        <p className="text-xs text-zinc-500">Previous</p>
                        <p className="font-heading font-bold text-lg text-zinc-400">
                          {analysisHistory[1]?.shot_analysis?.score || "--"}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-lime-400" />
                      <div className="flex-1 text-center">
                        <p className="text-xs text-zinc-500">Latest</p>
                        <p className="font-heading font-bold text-lg text-lime-400">
                          {analysisHistory[0]?.shot_analysis?.score || "--"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <Link to="/analyze"
                  className="inline-flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300 font-medium">
                  View Details <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <div className="text-center py-6">
                <Video className="w-8 h-8 text-zinc-600 mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-zinc-500 text-sm">No analyses yet</p>
                <Link to="/analyze"
                  className="inline-flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300 font-medium mt-2">
                  Analyze your first video <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </motion.div>

          {/* ── Equipment Picks ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="md:col-span-6 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1">
                <Target className="w-3 h-3" /> Equipment Picks
              </p>
              <Link to="/equipment" className="text-[10px] text-lime-400 hover:text-lime-300 font-medium uppercase tracking-wide">
                See All
              </Link>
            </div>

            {equipment.length > 0 ? (
              <div className="space-y-3">
                {equipment.map((rec, i) => (
                  <motion.div
                    key={rec.equipment?.id || i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.05 }}
                    className="flex items-center gap-3 bg-zinc-800/50 rounded-xl p-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-zinc-700/50 overflow-hidden shrink-0">
                      <img
                        src={rec.equipment?.image_url}
                        alt={rec.equipment?.model}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500">{rec.equipment?.brand}</p>
                      <p className="text-sm font-medium text-white truncate">{rec.equipment?.model}</p>
                    </div>
                    {rec.score?.total != null && (
                      <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs shrink-0">
                        {rec.score.total}%
                      </Badge>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Target className="w-8 h-8 text-zinc-600 mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-zinc-500 text-sm">No picks yet</p>
                <Link to="/equipment"
                  className="inline-flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300 font-medium mt-2">
                  Browse Equipment <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </motion.div>

          {/* ── Weekly Progress Chart ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="md:col-span-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
          >
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-4 flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> Weekly Progress
            </p>
            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(week => {
                const start = (week - 1) * 7 + 1;
                const end = Math.min(week * 7, totalDays);
                const doneInWeek = entries.filter(e => e.day >= start && e.day <= end).length;
                const weekTotal = end - start + 1;
                const pct = weekTotal > 0 ? Math.round((doneInWeek / weekTotal) * 100) : 0;
                return (
                  <div key={week} className="text-center">
                    <ProgressRing value={doneInWeek} max={weekTotal} size={48} strokeWidth={3} />
                    <p className="text-[10px] text-zinc-500 mt-1 uppercase font-medium">W{week}</p>
                  </div>
                );
              })}
            </div>
            <Link to="/progress"
              className="mt-4 w-full inline-flex items-center justify-center gap-1 text-xs font-bold text-zinc-400 hover:text-lime-400 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl py-2.5 transition-colors">
              View Full Progress <ArrowRight className="w-3 h-3" />
            </Link>
          </motion.div>

          {/* ── Quick Links ── */}
          {[
            { to: "/community?host=1", icon: Swords, label: "Host a Game", desc: "Find local players", color: "text-amber-400" },
            { to: "/community", icon: Users, label: "Community", desc: "Open games near you", color: "text-emerald-400" },
            { to: "/equipment", icon: Target, label: "Equipment", desc: "Top gear matches", color: "text-lime-400" },
            { to: "/training", icon: Dumbbell, label: "Training", desc: `${skillLevel} program`, color: "text-sky-400" },
            { to: "/progress", icon: BarChart3, label: "Progress", desc: `${completedDays} days done`, color: "text-purple-400" },
          ].map((link, i) => (
            <motion.div
              key={link.to}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.05 }}
              className="md:col-span-2"
            >
              <Link to={link.to} data-testid={`quick-link-${link.label.toLowerCase().replace(/\s/g, "-")}`}
                className="group block bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 transition-all h-full hover:border-lime-400/30">
                <link.icon className={`w-6 h-6 ${link.color} mb-2`} strokeWidth={1.5} />
                <p className="font-heading font-semibold text-sm tracking-tight mb-0.5 text-white">{link.label}</p>
                <p className="text-zinc-500 text-[10px]">{link.desc}</p>
                <div className="flex justify-end mt-1">
                  <ChevronRight className="w-3.5 h-3.5 transition-colors text-zinc-600 group-hover:text-lime-400" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
