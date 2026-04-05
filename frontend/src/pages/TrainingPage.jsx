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

/* ─── Sport icons ─── */
const SPORT_EMOJI = {
  badminton: "\u{1F3F8}", tennis: "\u{1F3BE}", table_tennis: "\u{1F3D3}",
  pickleball: "\u26A1", cricket: "\u{1F3CF}", football: "\u26BD", swimming: "\u{1F3CA}",
};

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

/* ─── Fix broken YouTube thumbnail URLs ─── */
function fixThumbnail(url) {
  if (!url) return null;
  if (url.includes("/vi/default/")) return null;
  return url;
}

/* ─── Fix broken YouTube video URLs ─── */
function fixVideoUrl(url) {
  if (!url) return null;
  return url;
}

/* ─── Generate a YouTube search URL for a drill ─── */
function getDrillSearchUrl(drillName, sport) {
  const q = encodeURIComponent(`${drillName} ${sport || ""} drill tutorial`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

/* ─── Sport-appropriate gradient for placeholder thumbnails ─── */
const SPORT_GRADIENT = {
  badminton:    "from-lime-600/30 to-emerald-900/40",
  tennis:       "from-yellow-600/30 to-green-900/40",
  table_tennis: "from-red-600/30 to-orange-900/40",
  pickleball:   "from-cyan-600/30 to-blue-900/40",
  cricket:      "from-green-600/30 to-emerald-900/40",
  football:     "from-green-600/30 to-lime-900/40",
  swimming:     "from-blue-600/30 to-cyan-900/40",
};


export default function TrainingPage() {
  const { user, profile } = useAuth();
  const [planData, setPlanData] = useState(null);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);
  const [openWeeks, setOpenWeeks] = useState({});
  const [difficultyFilter, setDifficultyFilter] = useState("All");
  const [focusFilter, setFocusFilter] = useState("All");
  const [expandedDrill, setExpandedDrill] = useState(null);

  const sport = profile?.active_sport || "badminton";

  /* ─── Load data ─── */
  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const results = await Promise.allSettled([
        api.get(`/recommendations/training/${user.id}`),
        api.get(`/progress/${user.id}`),
      ]);

      if (results[0].status === "fulfilled") setPlanData(results[0].value.data);
      if (results[1].status === "fulfilled") {
        const map = {};
        (results[1].value.data.entries || []).forEach(e => { map[e.day] = true; });
        setProgress(map);
      }
    } catch { /* handled by allSettled */ }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  /* Auto-open the current week */
  useEffect(() => {
    if (!planData?.plan?.weeks) return;
    const allD = planData.plan.weeks.flatMap(w => w.days);
    const firstIncomplete = allD.find(d => !progress[d.day] && d.type !== "rest");
    if (firstIncomplete) {
      const weekIdx = planData.plan.weeks.findIndex(w =>
        w.days.some(d => d.day === firstIncomplete.day)
      );
      if (weekIdx >= 0) setOpenWeeks(prev => ({ ...prev, [weekIdx]: true }));
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

  if (!plan) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <Dumbbell className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-400 text-lg font-medium mb-1">No training plan found</p>
        <p className="text-zinc-600 text-sm">Complete your profile assessment to get a personalized plan.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="training-page">
      <div className="container mx-auto px-4 max-w-4xl">

        {/* ═══ HEADER ═══ */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl uppercase tracking-tight text-white mb-1" data-testid="training-title">
            <span className="mr-2">{SPORT_EMOJI[sport] || "\u{1F3AF}"}</span>
            {plan.name || "Training Plan"}
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base mb-4">{plan.description}</p>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            {plan.level && <Badge className={DIFF_STYLE[plan.level] || "bg-zinc-800 text-zinc-400"}>{plan.level}</Badge>}
            <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-zinc-700">
              {plan.duration_days || 30} Days
            </Badge>
            <div className="flex items-center gap-1 text-amber-400">
              <Flame className="w-4 h-4" />
              <span className="text-sm font-bold">{completedCount}</span>
              <span className="text-xs text-zinc-500">days done</span>
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Overall Progress</span>
              <span className="text-sm font-bold text-lime-400">{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2.5 bg-zinc-800" />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-zinc-600">{completedCount} of {totalTrainingDays} training days completed</span>
              {overallProgress >= 100 && (
                <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-[10px]">
                  <Trophy className="w-3 h-3 mr-1" /> Plan Complete!
                </Badge>
              )}
            </div>
          </div>
        </motion.div>

        {/* ═══ TODAY'S FOCUS ═══ */}
        {todayDrill && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-zinc-900/80 border border-lime-400/20 rounded-2xl p-5 mb-6 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-lime-400/5 to-transparent pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs uppercase">
                  <Sparkles className="w-3 h-3 mr-1" /> Start Here - Today&apos;s Workout
                </Badge>
                <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                  <Clock className="w-2.5 h-2.5 mr-1" /> Day {todayDrill.day}
                  {todayDrill.duration_minutes > 0 && <> &middot; {todayDrill.duration_minutes}min</>}
                </Badge>
              </div>

              <h3 className="font-heading font-bold text-lg text-white uppercase tracking-tight mb-1">
                {todayDrill.focus_area || todayDrill.title || "Training Session"}
              </h3>
              {todayDrill.focus && (
                <p className="text-xs text-zinc-500 mb-3">{todayDrill.focus}</p>
              )}

              <div className="space-y-2 mb-4">
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
                {todayDrills.length === 0 && (
                  <p className="text-xs text-zinc-500 italic">Training session - follow the plan guidelines above.</p>
                )}
              </div>

              <Button
                size="sm"
                onClick={() => toggleDay(plan.id, todayDrill.day)}
                disabled={toggling === todayDrill.day}
                className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-xs px-6"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {toggling === todayDrill.day ? "Saving..." : `Complete Day ${todayDrill.day}`}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ═══ FILTERS ═══ */}
        {(allFocusAreas.length > 2 || allDifficulties.length > 2) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mb-4"
          >
            <div className="flex items-center gap-2 mb-2 text-zinc-500">
              <Filter className="w-3.5 h-3.5" />
              <span className="text-xs font-medium uppercase tracking-wide">Filter Drills</span>
              {(difficultyFilter !== "All" || focusFilter !== "All") && (
                <button
                  onClick={() => { setDifficultyFilter("All"); setFocusFilter("All"); }}
                  className="text-[10px] text-zinc-600 hover:text-lime-400 ml-1 flex items-center gap-0.5"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {allDifficulties.length > 2 && allDifficulties.map(d => (
                <Button key={`diff-${d}`} size="sm" variant="outline"
                  onClick={() => setDifficultyFilter(d)}
                  className={`rounded-full text-[11px] h-7 px-3 ${
                    difficultyFilter === d
                      ? "bg-lime-400 text-black border-lime-400 hover:bg-lime-500"
                      : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                  }`}
                >
                  {d}
                </Button>
              ))}
              {allDifficulties.length > 2 && allFocusAreas.length > 2 && (
                <div className="w-px bg-zinc-800 mx-1" />
              )}
              {allFocusAreas.length > 2 && allFocusAreas.map(f => {
                const FIcon = getFocusIcon(f);
                return (
                  <Button key={`focus-${f}`} size="sm" variant="outline"
                    onClick={() => setFocusFilter(f)}
                    className={`rounded-full text-[11px] h-7 px-3 ${
                      focusFilter === f
                        ? "bg-lime-400 text-black border-lime-400 hover:bg-lime-500"
                        : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                    }`}
                  >
                    {f !== "All" && <FIcon className="w-3 h-3 mr-1" />}
                    {f}
                  </Button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══ WEEKLY PLAN (collapsible sections) ═══ */}
        <div className="space-y-4">
          {plan.weeks?.map((week, weekIdx) => {
            const weekDays = week.days || [];
            const weekTrainingDays = weekDays.filter(d => d.type !== "rest");
            const weekCompleted = weekDays.filter(d => progress[d.day]).length;
            const weekTotal = weekTrainingDays.length;
            const weekProgress = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;
            const isOpen = openWeeks[weekIdx] ?? false;
            const isFullyComplete = weekCompleted >= weekTotal && weekTotal > 0;

            const filteredDays = weekDays.map(day => {
              if (day.type === "rest") return day;
              const dayDrills = (day.drills || []).map(id => drills[id]).filter(Boolean);
              const filtered = dayDrills.filter(drill => {
                if (difficultyFilter !== "All" && drill.difficulty !== difficultyFilter) return false;
                if (focusFilter !== "All" && drill.skill_focus !== focusFilter) return false;
                return true;
              });
              if ((difficultyFilter !== "All" || focusFilter !== "All") && filtered.length === 0) return null;
              return { ...day, _filteredDrills: filtered };
            }).filter(Boolean);

            if (filteredDays.length === 0) return null;

            return (
              <motion.div
                key={week.week}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: weekIdx * 0.05 }}
              >
                <Collapsible open={isOpen} onOpenChange={val => setOpenWeeks(p => ({ ...p, [weekIdx]: val }))}>
                  <CollapsibleTrigger asChild>
                    <button className={`w-full rounded-xl border p-4 transition-all text-left hover:border-zinc-600 ${
                      isFullyComplete
                        ? "border-lime-400/30 bg-lime-400/5"
                        : "border-zinc-800 bg-zinc-900/80"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isOpen
                            ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                            : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                          }
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-heading font-bold text-sm sm:text-base text-white uppercase">
                                Week {week.week}
                              </span>
                              {isFullyComplete && <CheckCircle2 className="w-4 h-4 text-lime-400" />}
                            </div>
                            {week.theme && (
                              <span className="text-xs text-zinc-500">{week.theme}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-zinc-500 hidden sm:inline">{weekCompleted}/{weekTotal} days</span>
                          <div className="w-16 sm:w-24">
                            <Progress value={weekProgress} className="h-1.5 bg-zinc-800" />
                          </div>
                          <span className="text-xs font-medium text-lime-400 w-8 text-right">{weekProgress}%</span>
                        </div>
                      </div>
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="mt-2 space-y-2 pl-2 sm:pl-4">
                      {filteredDays.map((day, dayIdx) => {
                        const isCompleted = !!progress[day.day];
                        const isRest = day.type === "rest";
                        const dayDrills = day._filteredDrills
                          || (day.drills || []).map(id => drills[id]).filter(Boolean);

                        return (
                          <motion.div
                            key={day.day}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: dayIdx * 0.03 }}
                            className={`rounded-xl border p-4 transition-all ${
                              isCompleted ? "border-lime-400/20 bg-lime-400/5" :
                              isRest ? "border-zinc-800/40 bg-zinc-900/40" :
                              "border-zinc-800 bg-zinc-900/60"
                            }`}
                            data-testid={`day-card-${day.day}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {isRest ? (
                                  <BedDouble className="w-5 h-5 text-zinc-600 shrink-0" />
                                ) : isCompleted ? (
                                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                                    <CheckCircle2 className="w-5 h-5 text-lime-400 shrink-0" />
                                  </motion.div>
                                ) : (
                                  <Circle className="w-5 h-5 text-zinc-600 shrink-0" />
                                )}
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-heading font-semibold text-sm text-white">Day {day.day}</span>
                                    {!isRest && (day.focus_area || day.title) && (
                                      <span className="text-zinc-400 text-xs hidden sm:inline">
                                        {day.focus_area || day.title}
                                      </span>
                                    )}
                                  </div>
                                  {!isRest && (day.focus_area || day.title) && (
                                    <span className="text-zinc-500 text-xs sm:hidden">
                                      {day.focus_area || day.title}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {!isRest && day.duration_minutes > 0 && (
                                  <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px] hidden sm:flex">
                                    <Clock className="w-2.5 h-2.5 mr-1" /> {day.duration_minutes}min
                                  </Badge>
                                )}
                                {!isRest && (
                                  <Button size="sm" variant={isCompleted ? "default" : "outline"}
                                    onClick={() => toggleDay(plan.id, day.day)}
                                    disabled={toggling === day.day}
                                    className={`text-[11px] h-7 px-3 rounded-full ${
                                      isCompleted
                                        ? "bg-lime-400 text-black hover:bg-lime-500"
                                        : "border-zinc-700 text-zinc-400 hover:border-lime-400 hover:text-lime-400"
                                    }`}
                                    data-testid={`complete-day-${day.day}`}
                                  >
                                    {isCompleted ? (
                                      <><CheckCircle2 className="w-3 h-3 mr-1" /> Done</>
                                    ) : (
                                      toggling === day.day ? "..." : "Mark Done"
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>

                            {isRest && (
                              <p className="ml-8 mt-1 text-xs text-zinc-600 italic">
                                Rest & Recovery - Let your body heal and come back stronger
                              </p>
                            )}

                            {!isRest && dayDrills.length > 0 && (
                              <div className="ml-8 mt-3 space-y-2">
                                {dayDrills.map((drill, idx) => (
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
                  </CollapsibleContent>
                </Collapsible>
              </motion.div>
            );
          })}
        </div>

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


/* ═══════════════ DRILL CARD COMPONENT ═══════════════ */
function DrillCard({ drill, videos, sport, expanded, onToggleExpand, highlight }) {
  const Icon = getFocusIcon(drill.skill_focus);
  const diffStyle = DIFF_STYLE[drill.difficulty] || "bg-zinc-800 text-zinc-400 border-zinc-700";
  const drillVideos = videos || [];

  const thumbnailUrl = drillVideos.length > 0
    ? fixThumbnail(drillVideos[0].thumbnail_url || drillVideos[0].thumbnail)
    : null;

  return (
    <div className={`rounded-xl border transition-all ${
      highlight
        ? "border-lime-400/10 bg-zinc-800/60"
        : "border-zinc-800/60 bg-zinc-800/30"
    }`}>
      <button
        onClick={onToggleExpand}
        className="w-full p-3 text-left flex items-start gap-3"
      >
        {/* Thumbnail / Icon */}
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden shrink-0 border border-zinc-700/50">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={drill.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "flex"; }}
            />
          ) : null}
          <div className={`${thumbnailUrl ? "hidden" : "flex"} w-full h-full bg-gradient-to-br ${
            SPORT_GRADIENT[sport] || "from-zinc-700 to-zinc-900"
          } items-center justify-center`}>
            <Icon className="w-5 h-5 text-white/50" />
          </div>
        </div>

        {/* Drill info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-medium text-white">{drill.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {drill.difficulty && (
              <Badge className={`${diffStyle} text-[9px] px-1.5 py-0`}>{drill.difficulty}</Badge>
            )}
            {drill.duration_minutes > 0 && (
              <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" /> {drill.duration_minutes}min
              </span>
            )}
            {drill.skill_focus && (
              <span className="text-[10px] text-zinc-600">{drill.skill_focus}</span>
            )}
          </div>
        </div>

        <div className="shrink-0 pt-1">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-zinc-500" />
            : <ChevronRight className="w-4 h-4 text-zinc-600" />
          }
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {drill.description && (
                <p className="text-xs text-zinc-400 leading-relaxed">{drill.description}</p>
              )}

              {drill.coaching_tip && (
                <div className="bg-lime-400/5 border border-lime-400/10 rounded-lg p-2">
                  <p className="text-xs text-lime-400/90">
                    <span className="font-medium">Pro Tip:</span> {drill.coaching_tip}
                  </p>
                </div>
              )}

              {(drill.sets || drill.reps || drill.repetitions) && (
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  {drill.sets && <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {drill.sets} sets</span>}
                  {(drill.reps || drill.repetitions) && <span>{drill.reps || drill.repetitions} reps</span>}
                </div>
              )}

              {drillVideos.length > 0 ? (
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wide font-medium">Tutorial Videos</span>
                  <div className="flex flex-wrap gap-2">
                    {drillVideos.map((v, vi) => {
                      const url = fixVideoUrl(v.youtube_url || v.url);
                      if (!url) return null;
                      return (
                        <a key={vi} href={url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] bg-zinc-700/40 text-zinc-300 hover:text-lime-400 hover:bg-zinc-700/60 px-2.5 py-1.5 rounded-lg transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          <Play className="w-3 h-3 text-red-400" />
                          <span className="truncate max-w-[150px]">{v.channel_name || v.channel || v.title || "Watch Tutorial"}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <a
                  href={getDrillSearchUrl(drill.name, sport)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] bg-zinc-700/40 text-zinc-300 hover:text-lime-400 hover:bg-zinc-700/60 px-2.5 py-1.5 rounded-lg transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <Play className="w-3 h-3 text-red-400" />
                  Find tutorials on YouTube
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
