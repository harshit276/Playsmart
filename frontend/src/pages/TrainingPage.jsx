import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Circle, Clock, Play, Dumbbell, Flame, BedDouble,
  Sparkles, ChevronDown, ChevronRight, Filter, Target, Trophy,
  Zap, Star, Shield, Footprints, Eye, BarChart3, X
} from "lucide-react";
import api from "@/lib/api";
import SEO from "@/components/SEO";

/* ─── Sport icons ─── */
const SPORT_EMOJI = {
  badminton: "\u{1F3F8}", tennis: "\u{1F3BE}", table_tennis: "\u{1F3D3}",
  pickleball: "\u26A1", cricket: "\u{1F3CF}", football: "\u26BD", swimming: "\u{1F3CA}",
};

/* ─── Exercise emoji for placeholders ─── */
const EXERCISE_EMOJI = [
  "\u{1F3CB}\uFE0F", "\u{1F4AA}", "\u{1F3C3}", "\u26A1", "\u{1F525}",
  "\u{1F3AF}", "\u{1F94A}", "\u{1F9D8}", "\u{1F3C6}", "\u{1F680}",
];

/* ─── Skill focus icons ─── */
const FOCUS_ICON = {
  "Footwork": Footprints, "Court Movement": Footprints,
  "Smash Power": Zap, "Shot Consistency": Target,
  "Net Play": Star, "Defense": Shield, "Stamina": Flame,
  "Reaction Speed": Eye, default: Dumbbell,
};
function getFocusIcon(focus) {
  if (!focus) return Dumbbell;
  for (const [key, icon] of Object.entries(FOCUS_ICON)) {
    if (focus.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return FOCUS_ICON.default;
}

/* ─── Difficulty colors ─── */
const DIFF_STYLE = {
  Beginner:     "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  "Beginner+":  "bg-sky-400/10 text-sky-400 border-sky-400/20",
  Intermediate: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  Advanced:     "bg-rose-400/10 text-rose-400 border-rose-400/20",
  beginner:     "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  intermediate: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  advanced:     "bg-rose-400/10 text-rose-400 border-rose-400/20",
};

/* ─── Extract YouTube video ID from any YouTube URL ─── */
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/* ─── Get the best thumbnail for a drill ─── */
function getDrillThumbnail(drillVideos) {
  if (!drillVideos || drillVideos.length === 0) return null;
  const v = drillVideos[0];
  // Try explicit thumbnail first
  const thumb = v.thumbnail_url || v.thumbnail;
  if (thumb && !thumb.includes("/vi/default/")) return thumb;
  // Extract from YouTube URL
  const videoUrl = v.youtube_url || v.url;
  const videoId = extractYouTubeId(videoUrl);
  if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  return null;
}

/* ─── Get video URL for a drill ─── */
function getDrillVideoUrl(drillVideos) {
  if (!drillVideos || drillVideos.length === 0) return null;
  const v = drillVideos[0];
  return v.youtube_url || v.url || null;
}

/* ─── Generate a YouTube search URL for a drill ─── */
function getDrillSearchUrl(drillName, sport) {
  const q = encodeURIComponent(`${drillName} ${sport || ""} drill tutorial`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

/* ─── Sport-appropriate gradient for placeholder thumbnails ─── */
const SPORT_GRADIENT = {
  badminton:    "from-lime-600/40 to-emerald-900/60",
  tennis:       "from-yellow-600/40 to-green-900/60",
  table_tennis: "from-red-600/40 to-orange-900/60",
  pickleball:   "from-cyan-600/40 to-blue-900/60",
  cricket:      "from-green-600/40 to-emerald-900/60",
  football:     "from-green-600/40 to-lime-900/60",
  swimming:     "from-blue-600/40 to-cyan-900/60",
};


export default function TrainingPage() {
  const { user, profile } = useAuth();
  const [planData, setPlanData] = useState(null);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  // Set page title
  useEffect(() => { document.title = "Training | AthlyticAI"; }, []);
  const [activeWeek, setActiveWeek] = useState(0);
  const [difficultyFilter, setDifficultyFilter] = useState("All");
  const [focusFilter, setFocusFilter] = useState("All");
  const [expandedDrill, setExpandedDrill] = useState(null);

  const sport = profile?.active_sport || "badminton";

  /* ─── Load data ─── */
  const [fetchError, setFetchError] = useState(false);

  const loadData = useCallback(async () => {
    const userId = user?.id || "guest";
    setFetchError(false);
    try {
      const results = await Promise.allSettled([
        api.get(`/recommendations/training/${userId}`, { timeout: 15000 }),
        api.get(`/progress/${userId}`, { timeout: 15000 }),
      ]);

      if (results[0].status === "fulfilled") setPlanData(results[0].value.data);
      if (results[1].status === "fulfilled") {
        const map = {};
        (results[1].value.data.entries || []).forEach(e => { map[e.day] = true; });
        setProgress(map);
      }
      if (results[0].status !== "fulfilled" && results[1].status !== "fulfilled") {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  /* Auto-select current week */
  useEffect(() => {
    if (!planData?.plan?.weeks) return;
    const allD = planData.plan.weeks.flatMap(w => w.days);
    const firstIncomplete = allD.find(d => !progress[d.day] && d.type !== "rest");
    if (firstIncomplete) {
      const weekIdx = planData.plan.weeks.findIndex(w =>
        w.days.some(d => d.day === firstIncomplete.day)
      );
      if (weekIdx >= 0) setActiveWeek(weekIdx);
    }
  }, [planData, progress]);

  /* ─── Toggle day completion ─── */
  const toggleDay = async (planId, day) => {
    setToggling(day);
    try {
      const { data } = await api.post("/progress", { plan_id: planId, day });
      setProgress(p => {
        const copy = { ...p };
        if (data.completed) copy[day] = true;
        else delete copy[day];
        return copy;
      });
      toast.success(data.message);
    } catch { toast.error("Failed to update"); }
    setToggling(null);
  };

  /* ─── Derived state ─── */
  const plan = planData?.plan;
  const drills = planData?.drills || {};
  const videos = planData?.videos || {};

  const allDays = useMemo(() => plan?.weeks?.flatMap(w => w.days) || [], [plan]);
  const trainingDays = useMemo(() => allDays.filter(d => d.type !== "rest"), [allDays]);
  const completedCount = Object.keys(progress).length;
  const totalTrainingDays = trainingDays.length;
  const overallProgress = totalTrainingDays > 0 ? Math.round((completedCount / totalTrainingDays) * 100) : 0;

  const todayDrill = useMemo(() => allDays.find(d => !progress[d.day] && d.type !== "rest"), [allDays, progress]);
  const todayDrills = useMemo(() =>
    todayDrill ? (todayDrill.drills || []).map(id => drills[id]).filter(Boolean) : [],
    [todayDrill, drills]
  );

  const allFocusAreas = useMemo(() => {
    const set = new Set();
    Object.values(drills).forEach(d => { if (d.skill_focus) set.add(d.skill_focus); });
    return ["All", ...Array.from(set).sort()];
  }, [drills]);

  const allDifficulties = useMemo(() => {
    const set = new Set();
    Object.values(drills).forEach(d => { if (d.difficulty) set.add(d.difficulty); });
    return ["All", ...Array.from(set)];
  }, [drills]);

  /* ─── Loading state ─── */
  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-500 text-sm">Loading your training plan...</p>
      </div>
    </div>
  );

  if (fetchError) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <Dumbbell className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-400 text-lg font-medium mb-1">Could not load training plan</p>
        <p className="text-zinc-600 text-sm mb-4">Server is taking too long. Please try again.</p>
        <button onClick={loadData} className="text-sm font-medium text-lime-400 hover:text-lime-300">Retry &rarr;</button>
      </div>
    </div>
  );

  /* ─── Guest / No-plan view ─── */
  const trainingVideos = planData?.training_videos || [];
  const skillAreas = planData?.skills?.skill_areas || [];

  if (!plan) return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="training-page">
      <div className="container mx-auto px-4 max-w-5xl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="font-heading font-bold text-2xl sm:text-3xl uppercase tracking-tight text-white mb-2">
            <span className="mr-2">{SPORT_EMOJI[sport] || "\u{1F3AF}"}</span>
            {sport.replace("_", " ")} Training
          </h1>
          {!user && (
            <div className="bg-lime-400/5 border border-lime-400/20 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-lime-400 shrink-0" />
                <p className="text-sm text-zinc-300">Sign in to get a personalized weekly plan</p>
              </div>
              <a href="/auth" className="text-sm font-bold text-lime-400 hover:text-lime-300 shrink-0">Sign In &rarr;</a>
            </div>
          )}
          {user && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
              <p className="text-sm text-zinc-400">Complete your profile assessment to get a personalized weekly training plan.</p>
            </div>
          )}
        </motion.div>

        {/* Skill Areas */}
        {skillAreas.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
            <h2 className="font-heading font-bold text-lg text-white uppercase tracking-tight mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-lime-400" /> Skill Areas
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {skillAreas.map((skill, idx) => {
                const Icon = getFocusIcon(skill.name);
                return (
                  <motion.div
                    key={skill.id || idx}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-600 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-lime-400/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4.5 h-4.5 text-lime-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-white leading-tight">{skill.name}</h3>
                        {skill.level && (
                          <Badge className={`${DIFF_STYLE[skill.level] || "bg-zinc-800 text-zinc-400"} text-[10px] mt-1`}>{skill.level}</Badge>
                        )}
                        {skill.description && (
                          <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">{skill.description}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Training Videos */}
        {trainingVideos.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
            <h2 className="font-heading font-bold text-lg text-white uppercase tracking-tight mb-4 flex items-center gap-2">
              <Play className="w-5 h-5 text-red-400" /> Training Videos
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {trainingVideos.map((video, idx) => {
                const videoId = extractYouTubeId(video.url || video.youtube_url);
                const thumb = video.thumbnail_url || video.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null);
                const url = video.url || video.youtube_url;
                return (
                  <motion.a
                    key={video.id || idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden hover:border-zinc-600 transition-all group"
                  >
                    <div className="relative w-full aspect-video overflow-hidden">
                      {thumb ? (
                        <img src={thumb} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className={`flex w-full h-full bg-gradient-to-br ${SPORT_GRADIENT[sport] || "from-zinc-700 to-zinc-900"} items-center justify-center`}>
                          <Play className="w-10 h-10 text-white/40" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm border border-white/10">
                          <Play className="w-5 h-5 text-white ml-0.5" />
                        </div>
                      </div>
                      {video.level && (
                        <div className="absolute top-2 right-2">
                          <Badge className={`${DIFF_STYLE[video.level] || "bg-zinc-800 text-zinc-400"} text-[10px] px-2 py-0.5 backdrop-blur-sm`}>{video.level}</Badge>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h4 className="text-sm font-semibold text-white leading-tight line-clamp-2">{video.title}</h4>
                      {(video.channel || video.channel_name) && (
                        <p className="text-[11px] text-zinc-500 mt-1">{video.channel || video.channel_name}</p>
                      )}
                    </div>
                  </motion.a>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Empty state if nothing at all */}
        {trainingVideos.length === 0 && skillAreas.length === 0 && (
          <div className="text-center py-16">
            <Dumbbell className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400 text-lg font-medium mb-1">No training content yet</p>
            <p className="text-zinc-600 text-sm">Training content for {sport.replace("_", " ")} is coming soon.</p>
          </div>
        )}
      </div>
    </div>
  );

  const currentWeek = plan.weeks?.[activeWeek];

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="training-page">
      <SEO
        title="Personalized Sports Training Plans - Drills & Workouts"
        description="Get a personalized training plan with drills, exercises, and video tutorials. Improve your badminton smash, tennis serve, table tennis spin, or pickleball dink with structured weekly workouts."
        keywords="badminton training plan, tennis drills, table tennis exercises, sports workout plan, badminton footwork drills"
        url="https://athlyticai.com/training"
      />
      <div className="container mx-auto px-4 max-w-5xl">

        {/* ═══ COMPACT HEADER ═══ */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <h1 className="font-heading font-bold text-2xl sm:text-3xl uppercase tracking-tight text-white" data-testid="training-title">
              <span className="mr-2">{SPORT_EMOJI[sport] || "\u{1F3AF}"}</span>
              {plan.name || "Training Plan"}
            </h1>
            <div className="flex items-center gap-3">
              {plan.level && <Badge className={DIFF_STYLE[plan.level] || "bg-zinc-800 text-zinc-400"}>{plan.level}</Badge>}
              <div className="flex items-center gap-1 text-amber-400">
                <Flame className="w-4 h-4" />
                <span className="text-sm font-bold">{completedCount}/{totalTrainingDays}</span>
              </div>
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex items-center gap-4">
            <div className="flex-1">
              <Progress value={overallProgress} className="h-2 bg-zinc-800" />
            </div>
            <span className="text-sm font-bold text-lime-400 shrink-0">{overallProgress}%</span>
            {overallProgress >= 100 && (
              <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-[10px] shrink-0">
                <Trophy className="w-3 h-3 mr-1" /> Complete!
              </Badge>
            )}
          </div>
        </motion.div>

        {/* ═══ TODAY'S WORKOUT - Prominent thumbnail grid ═══ */}
        {todayDrill && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs uppercase px-3 py-1">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Today&apos;s Workout
                </Badge>
                <span className="text-zinc-500 text-sm">Day {todayDrill.day}
                  {todayDrill.duration_minutes > 0 && <> - {todayDrill.duration_minutes}min</>}
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => toggleDay(plan.id, todayDrill.day)}
                disabled={toggling === todayDrill.day}
                className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-xs px-5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {toggling === todayDrill.day ? "Saving..." : "Complete"}
              </Button>
            </div>

            {todayDrill.focus_area && (
              <h3 className="font-heading font-bold text-base text-zinc-300 uppercase tracking-tight mb-3">
                {todayDrill.focus_area}
              </h3>
            )}

            {/* Drill cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {todayDrills.map((drill, idx) => (
                <DrillCard
                  key={drill.id}
                  drill={drill}
                  videos={videos[drill.id] || []}
                  sport={sport}
                  index={idx}
                  expanded={expandedDrill === `today-${drill.id}`}
                  onToggleExpand={() => setExpandedDrill(
                    expandedDrill === `today-${drill.id}` ? null : `today-${drill.id}`
                  )}
                  highlight
                />
              ))}
            </div>
            {todayDrills.length === 0 && (
              <p className="text-sm text-zinc-500 italic bg-zinc-900/50 rounded-xl p-4 text-center">
                Training session - follow the plan guidelines.
              </p>
            )}
          </motion.div>
        )}

        {/* ═══ WEEK TABS ═══ */}
        {plan.weeks && plan.weeks.length > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mb-4"
          >
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {plan.weeks.map((week, idx) => {
                const weekDays = week.days || [];
                const weekTrainingDays = weekDays.filter(d => d.type !== "rest");
                const weekCompleted = weekDays.filter(d => progress[d.day]).length;
                const weekTotal = weekTrainingDays.length;
                const isFullyComplete = weekCompleted >= weekTotal && weekTotal > 0;
                const isActive = activeWeek === idx;

                return (
                  <button
                    key={idx}
                    onClick={() => setActiveWeek(idx)}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                      isActive
                        ? "bg-lime-400 text-black"
                        : isFullyComplete
                          ? "bg-lime-400/10 text-lime-400 border border-lime-400/20 hover:bg-lime-400/20"
                          : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    {isFullyComplete && <CheckCircle2 className="w-3.5 h-3.5" />}
                    Week {week.week}
                    <span className={`text-xs ${isActive ? "text-black/60" : "text-zinc-600"}`}>
                      {weekCompleted}/{weekTotal}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══ FILTERS (compact) ═══ */}
        {(allFocusAreas.length > 2 || allDifficulties.length > 2) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mb-5"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-zinc-600" />
              {allDifficulties.length > 2 && allDifficulties.map(d => (
                <button key={`diff-${d}`}
                  onClick={() => setDifficultyFilter(d)}
                  className={`rounded-full text-xs px-3 py-1 transition-all ${
                    difficultyFilter === d
                      ? "bg-lime-400 text-black font-medium"
                      : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  {d}
                </button>
              ))}
              {allDifficulties.length > 2 && allFocusAreas.length > 2 && (
                <div className="w-px h-5 bg-zinc-800 mx-1" />
              )}
              {allFocusAreas.length > 2 && allFocusAreas.map(f => (
                <button key={`focus-${f}`}
                  onClick={() => setFocusFilter(f)}
                  className={`rounded-full text-xs px-3 py-1 transition-all ${
                    focusFilter === f
                      ? "bg-lime-400 text-black font-medium"
                      : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  {f}
                </button>
              ))}
              {(difficultyFilter !== "All" || focusFilter !== "All") && (
                <button
                  onClick={() => { setDifficultyFilter("All"); setFocusFilter("All"); }}
                  className="text-xs text-zinc-600 hover:text-lime-400 flex items-center gap-0.5 ml-1"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ ACTIVE WEEK CONTENT ═══ */}
        {currentWeek && (
          <motion.div
            key={activeWeek}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {currentWeek.theme && (
              <p className="text-xs text-zinc-500 mb-4 uppercase tracking-wide">{currentWeek.theme}</p>
            )}

            <div className="space-y-6">
              {(currentWeek.days || []).map((day, dayIdx) => {
                const isCompleted = !!progress[day.day];
                const isRest = day.type === "rest";
                const dayDrillList = (day.drills || []).map(id => drills[id]).filter(Boolean);
                const filteredDayDrills = dayDrillList.filter(drill => {
                  if (difficultyFilter !== "All" && drill.difficulty !== difficultyFilter) return false;
                  if (focusFilter !== "All" && drill.skill_focus !== focusFilter) return false;
                  return true;
                });

                if ((difficultyFilter !== "All" || focusFilter !== "All") && !isRest && filteredDayDrills.length === 0) return null;

                if (isRest) {
                  return (
                    <motion.div
                      key={day.day}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: dayIdx * 0.03 }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/30 border border-zinc-800/40"
                    >
                      <BedDouble className="w-5 h-5 text-zinc-700" />
                      <span className="text-sm text-zinc-600">Day {day.day} - Rest & Recovery</span>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={day.day}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: dayIdx * 0.04 }}
                    data-testid={`day-card-${day.day}`}
                  >
                    {/* Day header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleDay(plan.id, day.day)}
                          disabled={toggling === day.day}
                          className="shrink-0"
                          data-testid={`complete-day-${day.day}`}
                        >
                          {isCompleted ? (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                              <CheckCircle2 className="w-6 h-6 text-lime-400" />
                            </motion.div>
                          ) : (
                            <Circle className="w-6 h-6 text-zinc-600 hover:text-lime-400 transition-colors" />
                          )}
                        </button>
                        <div>
                          <span className="font-heading font-bold text-sm text-white uppercase">
                            Day {day.day}
                          </span>
                          {(day.focus_area || day.title) && (
                            <span className="text-zinc-500 text-xs ml-2">{day.focus_area || day.title}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {day.duration_minutes > 0 && (
                          <span className="text-xs text-zinc-600 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {day.duration_minutes}min
                          </span>
                        )}
                        {isCompleted && (
                          <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-[10px]">Done</Badge>
                        )}
                      </div>
                    </div>

                    {/* Drill cards grid */}
                    {filteredDayDrills.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ml-9">
                        {filteredDayDrills.map((drill, idx) => (
                          <DrillCard
                            key={drill.id}
                            drill={drill}
                            videos={videos[drill.id] || []}
                            sport={sport}
                            index={idx}
                            expanded={expandedDrill === `${day.day}-${drill.id}`}
                            onToggleExpand={() => setExpandedDrill(
                              expandedDrill === `${day.day}-${drill.id}` ? null : `${day.day}-${drill.id}`
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══ COMPLETION CELEBRATION ═══ */}
        {overallProgress >= 100 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-8 bg-gradient-to-br from-lime-400/10 to-emerald-400/5 border border-lime-400/30 rounded-2xl p-6 text-center"
          >
            <Trophy className="w-10 h-10 text-lime-400 mx-auto mb-3" />
            <h3 className="font-heading font-bold text-xl text-white uppercase mb-1">Plan Complete!</h3>
            <p className="text-zinc-400 text-sm">You have finished all {totalTrainingDays} training days. Great work!</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}


/* ═══════════════ DRILL CARD - Large thumbnail, clean layout ═══════════════ */
function DrillCard({ drill, videos: drillVideos, sport, index, expanded, onToggleExpand, highlight }) {
  const Icon = getFocusIcon(drill.skill_focus);
  const diffStyle = DIFF_STYLE[drill.difficulty] || "bg-zinc-800 text-zinc-400 border-zinc-700";
  const vids = drillVideos || [];
  const thumbnailUrl = getDrillThumbnail(vids);
  const videoUrl = getDrillVideoUrl(vids);
  const placeholderEmoji = EXERCISE_EMOJI[(drill.name || "").length % EXERCISE_EMOJI.length];

  const handleThumbnailClick = (e) => {
    if (videoUrl) {
      e.stopPropagation();
      window.open(videoUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`rounded-xl border overflow-hidden transition-all group ${
        highlight
          ? "border-lime-400/20 bg-zinc-900/80 hover:border-lime-400/40"
          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
      } ${expanded ? "ring-1 ring-lime-400/20" : ""}`}
    >
      {/* LARGE THUMBNAIL */}
      <div
        className={`relative w-full aspect-video overflow-hidden ${videoUrl ? "cursor-pointer" : ""}`}
        onClick={handleThumbnailClick}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={drill.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { e.target.style.display = "none"; if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = "flex"; }}
          />
        ) : null}
        <div className={`${thumbnailUrl ? "hidden" : "flex"} absolute inset-0 bg-gradient-to-br ${
          SPORT_GRADIENT[sport] || "from-zinc-700 to-zinc-900"
        } items-center justify-center`}>
          <span className="text-4xl opacity-60 select-none">{placeholderEmoji}</span>
        </div>
        {/* Play overlay */}
        {videoUrl && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm border border-white/10">
              <Play className="w-5 h-5 text-white ml-0.5" />
            </div>
          </div>
        )}
        {/* Difficulty badge on thumbnail */}
        {drill.difficulty && (
          <div className="absolute top-2 right-2">
            <Badge className={`${diffStyle} text-[10px] px-2 py-0.5 backdrop-blur-sm`}>{drill.difficulty}</Badge>
          </div>
        )}
      </div>

      {/* CARD BODY - minimal info */}
      <button
        onClick={onToggleExpand}
        className="w-full text-left p-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white leading-tight truncate">{drill.name}</h4>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {drill.duration_minutes > 0 && (
                <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {drill.duration_minutes}min
                </span>
              )}
              {(drill.sets || drill.reps || drill.repetitions) && (
                <span className="text-[11px] text-zinc-500">
                  {drill.sets && `${drill.sets}x`}{drill.reps || drill.repetitions || ""}
                </span>
              )}
              {drill.skill_focus && (
                <span className="text-[11px] text-zinc-600 flex items-center gap-1">
                  <Icon className="w-3 h-3" /> {drill.skill_focus}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 pt-0.5">
            {expanded
              ? <ChevronDown className="w-4 h-4 text-zinc-500" />
              : <ChevronRight className="w-4 h-4 text-zinc-700" />
            }
          </div>
        </div>
      </button>

      {/* EXPANDED DETAILS */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-zinc-800/50 pt-2">
              {drill.description && (
                <p className="text-xs text-zinc-400 leading-relaxed">{drill.description}</p>
              )}

              {drill.coaching_tip && (
                <div className="bg-lime-400/5 border border-lime-400/10 rounded-lg p-2.5">
                  <p className="text-xs text-lime-400/90">
                    <span className="font-semibold">Pro Tip:</span> {drill.coaching_tip}
                  </p>
                </div>
              )}

              {(drill.sets || drill.reps || drill.repetitions) && (
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  {drill.sets && <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {drill.sets} sets</span>}
                  {(drill.reps || drill.repetitions) && <span>{drill.reps || drill.repetitions} reps</span>}
                </div>
              )}

              {/* Video links */}
              <div className="flex flex-wrap gap-2 pt-1">
                {vids.length > 0 ? vids.map((v, vi) => {
                  const url = v.youtube_url || v.url;
                  if (!url) return null;
                  return (
                    <a key={vi} href={url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <Play className="w-3 h-3" />
                      <span className="truncate max-w-[140px]">{v.channel_name || v.channel || v.title || "Watch"}</span>
                    </a>
                  );
                }) : (
                  <a
                    href={getDrillSearchUrl(drill.name, sport)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] bg-zinc-800 text-zinc-400 hover:text-lime-400 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    <Play className="w-3 h-3" />
                    Find on YouTube
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
