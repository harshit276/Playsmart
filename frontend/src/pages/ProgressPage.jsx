import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import {
  Flame, Calendar, TrendingUp, CheckCircle2, Target, Video,
  ArrowRight, BarChart3, Upload, Clock, Star, Zap, Award, Share2, Trophy
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  LineChart, Line, Area, AreaChart
} from "recharts";
import api from "@/lib/api";
import ScoreChart, { ComparisonBars, JourneyTimeline } from "@/components/ScoreChart";
import { BadgeGrid } from "@/components/BadgeDisplay";
import ShareModal from "@/components/ShareModal";

export default function ProgressPage() {
  const { user, profile } = useAuth();
  const [data, setData] = useState(null);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("training");
  const [badgesData, setBadgesData] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [progressionData, setProgressionData] = useState(null);

  const loadData = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const results = await Promise.allSettled([
      api.get(`/progress/${user.id}`),
      api.get(`/analysis-history/${user.id}`),
      api.get(`/badges/${user.id}`),
      api.get(`/progress/analysis-history/${user.id}`),
    ]);
    if (results[0].status === "fulfilled") setData(results[0].value.data);
    if (results[1].status === "fulfilled") setAnalysisHistory(results[1].value.data.analyses || []);
    if (results[2].status === "fulfilled") setBadgesData(results[2].value.data);
    if (results[3].status === "fulfilled") setProgressionData(results[3].value.data);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Set page title
  useEffect(() => {
    document.title = "Progress | AthlyticAI";
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="h-10 bg-zinc-800 rounded-xl animate-pulse w-48 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 h-24 animate-pulse" />
          ))}
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 h-48 animate-pulse mb-6" />
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 h-64 animate-pulse" />
      </div>
    </div>
  );

  const d = data || { completed_days: 0, total_days: 30, progress_percentage: 0, current_streak: 0, entries: [] };

  // Weekly chart data
  const weekData = [1, 2, 3, 4].map(w => {
    const start = (w - 1) * 7 + 1;
    const end = w * 7 + (w === 4 ? 2 : 0);
    const completed = (d.entries || []).filter(e => e.day >= start && e.day <= end).length;
    return { week: `W${w}`, completed, total: end - start + 1 };
  });

  const completedSet = new Set((d.entries || []).map(e => e.day));

  // Analysis improvement data
  const analysisChartData = analysisHistory
    .slice()
    .reverse()
    .map((a, i) => ({
      label: new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: a.shot_analysis?.score || 0,
      level: a.skill_level || "",
    }));

  // Before/After comparison
  const latestAnalysis = analysisHistory.length > 0 ? analysisHistory[0] : null;
  const previousAnalysis = analysisHistory.length > 1 ? analysisHistory[1] : null;

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="progress-page">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl md:text-5xl uppercase tracking-tight text-white mb-6" data-testid="progress-title">
            {{"badminton":"🏸","tennis":"🎾","table_tennis":"🏓","pickleball":"⚡","cricket":"🏏","football":"⚽","swimming":"🏊"}[profile?.active_sport] || "📈"} Your Progress
          </h1>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {[
            { icon: Target, label: "Completion", value: `${d.progress_percentage}%`, color: "text-lime-400" },
            { icon: Flame, label: "Streak", value: `${d.current_streak} days`, color: "text-amber-400" },
            { icon: CheckCircle2, label: "Completed", value: `${d.completed_days}/${d.total_days}`, color: "text-sky-400" },
            { icon: TrendingUp, label: "Analyses", value: `${analysisHistory.length}`, color: "text-purple-400" },
          ].map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 text-center" data-testid={`stat-${stat.label.toLowerCase()}`}>
              <stat.icon className={`w-6 h-6 ${stat.color} mx-auto mb-2`} strokeWidth={1.5} />
              <p className="font-heading font-bold text-xl sm:text-2xl text-white">{stat.value}</p>
              <p className="text-zinc-500 text-[10px] sm:text-xs uppercase tracking-wide">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-zinc-800 border-zinc-700 mb-6 w-full grid grid-cols-4">
            <TabsTrigger value="training" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <BarChart3 className="w-3.5 h-3.5 mr-1" /> Training
            </TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <Video className="w-3.5 h-3.5 mr-1" /> Analysis
              {analysisHistory.length > 0 && (
                <Badge className="bg-zinc-700 text-zinc-300 ml-1 text-[10px] px-1.5 py-0">{analysisHistory.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="journey" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <Star className="w-3.5 h-3.5 mr-1" /> Journey
            </TabsTrigger>
            <TabsTrigger value="badges" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <Award className="w-3.5 h-3.5 mr-1" /> Badges
              {badgesData?.total_earned > 0 && (
                <Badge className="bg-zinc-700 text-zinc-300 ml-1 text-[10px] px-1.5 py-0">{badgesData.total_earned}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Training Progress Tab */}
          <TabsContent value="training">
            {/* Overall Progress Bar */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 mb-6" data-testid="progress-bar-card">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-medium text-zinc-300">30-Day Plan Progress</p>
                <span className="font-heading font-bold text-lg text-lime-400">{d.progress_percentage}%</span>
              </div>
              <Progress value={d.progress_percentage} className="h-3 bg-zinc-800 [&>div]:bg-lime-400 [&>div]:rounded-full" />
            </motion.div>

            {/* Weekly Chart */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 mb-6" data-testid="weekly-chart">
              <p className="text-sm font-medium text-zinc-300 mb-4">Weekly Breakdown</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="week" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fafafa", fontSize: 12 }} />
                    <Bar dataKey="completed" fill="#bef264" radius={[6, 6, 0, 0]} name="Completed" />
                    <Bar dataKey="total" fill="#27272a" radius={[6, 6, 0, 0]} name="Total" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Day Grid */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5" data-testid="day-grid">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-zinc-500" />
                <p className="text-sm font-medium text-zinc-300">30-Day Overview</p>
              </div>
              <div className="grid grid-cols-7 sm:grid-cols-10 gap-2">
                {Array.from({ length: 30 }, (_, i) => i + 1).map(day => (
                  <motion.div
                    key={day}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: day * 0.01 }}
                    data-testid={`day-cell-${day}`}
                    className={`w-full aspect-square rounded-xl flex items-center justify-center text-xs font-medium transition-all ${
                      completedSet.has(day) ? "bg-lime-400 text-black font-bold" : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {day}
                  </motion.div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-zinc-500">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-lime-400" /> Completed</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-zinc-800" /> Remaining</div>
              </div>
            </motion.div>
          </TabsContent>

          {/* Analysis History Tab */}
          <TabsContent value="analysis">
            {analysisHistory.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-10 text-center"
              >
                <Video className="w-12 h-12 text-zinc-600 mx-auto mb-4" strokeWidth={1.5} />
                <p className="text-zinc-400 text-lg font-medium mb-2">No analyses yet</p>
                <p className="text-zinc-600 text-sm mb-6">Upload your first video to start tracking improvements.</p>
                <Link to="/analyze">
                  <Button className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-6">
                    <Upload className="w-4 h-4 mr-2" /> Analyze Your First Video
                  </Button>
                </Link>
              </motion.div>
            ) : (
              <div className="space-y-6">
                {/* Improvement Chart */}
                {analysisChartData.length >= 2 && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
                  >
                    <p className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-lime-400" /> Score Improvement Over Time
                    </p>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analysisChartData}>
                          <defs>
                            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#bef264" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#bef264" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fafafa", fontSize: 12 }} />
                          <Area type="monotone" dataKey="score" stroke="#bef264" fill="url(#scoreGradient)" strokeWidth={2} dot={{ fill: "#bef264", r: 4 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                )}

                {/* Before/After Comparison */}
                {latestAnalysis && previousAnalysis && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-zinc-900/80 border border-lime-400/20 rounded-2xl p-5"
                  >
                    <p className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" /> Before & After
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Previous */}
                      <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">
                          {new Date(previousAnalysis.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-700/50 flex items-center justify-center mb-2">
                          <span className="font-heading font-bold text-2xl text-zinc-400">
                            {previousAnalysis.shot_analysis?.grade || "-"}
                          </span>
                        </div>
                        <p className="font-heading font-bold text-lg text-zinc-400">
                          {previousAnalysis.shot_analysis?.score || "--"}/100
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1">{previousAnalysis.skill_level}</p>
                      </div>

                      {/* Latest */}
                      <div className="bg-lime-400/5 border border-lime-400/20 rounded-xl p-4 text-center">
                        <p className="text-[10px] text-lime-400 uppercase tracking-wide mb-2">
                          {new Date(latestAnalysis.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-lime-400/10 flex items-center justify-center mb-2">
                          <span className="font-heading font-bold text-2xl text-lime-400">
                            {latestAnalysis.shot_analysis?.grade || "-"}
                          </span>
                        </div>
                        <p className="font-heading font-bold text-lg text-lime-400">
                          {latestAnalysis.shot_analysis?.score || "--"}/100
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1">{latestAnalysis.skill_level}</p>
                      </div>
                    </div>

                    {/* Improvement Badge */}
                    {latestAnalysis.shot_analysis?.score && previousAnalysis.shot_analysis?.score && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", delay: 0.3 }}
                        className="flex justify-center mt-4"
                      >
                        {latestAnalysis.shot_analysis.score > previousAnalysis.shot_analysis.score ? (
                          <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-sm px-4 py-1">
                            <TrendingUp className="w-4 h-4 mr-1" />
                            +{latestAnalysis.shot_analysis.score - previousAnalysis.shot_analysis.score} points improvement
                          </Badge>
                        ) : latestAnalysis.shot_analysis.score === previousAnalysis.shot_analysis.score ? (
                          <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-sm px-4 py-1">
                            Same score - keep practicing!
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-400/10 text-amber-400 border-amber-400/20 text-sm px-4 py-1">
                            Keep training - you'll bounce back!
                          </Badge>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {/* Timeline */}
                <div>
                  <p className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-zinc-500" /> Analysis Timeline
                  </p>
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-zinc-800" />

                    <div className="space-y-4">
                      {analysisHistory.map((a, i) => {
                        const shot = a.shot_analysis || {};
                        return (
                          <motion.div
                            key={a.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.06 }}
                            className="relative pl-12"
                          >
                            {/* Timeline dot */}
                            <div className={`absolute left-3 top-4 w-5 h-5 rounded-full flex items-center justify-center ${
                              i === 0 ? "bg-lime-400" : "bg-zinc-800 border-2 border-zinc-700"
                            }`}>
                              {i === 0 ? (
                                <Star className="w-3 h-3 text-black" />
                              ) : (
                                <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                              )}
                            </div>

                            <div className={`bg-zinc-900/80 border rounded-2xl p-4 transition-all ${
                              i === 0 ? "border-lime-400/30" : "border-zinc-800"
                            }`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-white">
                                    {shot.shot_name || "Analysis"}
                                  </p>
                                  {i === 0 && (
                                    <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-[9px]">Latest</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {shot.score != null && (
                                    <Badge className={`text-xs font-bold ${
                                      i === 0 ? "bg-lime-400/10 text-lime-400 border-lime-400/20" : "bg-zinc-800 text-zinc-300 border-zinc-700"
                                    }`}>
                                      {shot.score}/100
                                    </Badge>
                                  )}
                                  {shot.grade && (
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-heading font-bold text-sm ${
                                      shot.grade === "A" ? "bg-lime-400 text-black" :
                                      shot.grade === "B" ? "bg-sky-400 text-black" :
                                      shot.grade === "C" ? "bg-amber-400 text-black" :
                                      "bg-red-500 text-white"
                                    }`}>
                                      {shot.grade}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-zinc-500">
                                {new Date(a.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                                {a.skill_level && <> &middot; {a.skill_level}</>}
                              </p>
                              {a.quick_summary && (
                                <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{a.quick_summary}</p>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Upload New Video CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-center flex gap-3 justify-center"
                >
                  <Link to="/analyze">
                    <Button className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-8 h-12 min-h-[44px]">
                      <Upload className="w-4 h-4 mr-2" /> Upload New Video
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShareOpen(true);
                    }}
                    className="border-zinc-700 text-zinc-400 hover:border-lime-400 hover:text-lime-400 rounded-full h-12 min-h-[44px] px-6"
                  >
                    <Share2 className="w-4 h-4 mr-2" /> Share Progress
                  </Button>
                </motion.div>
              </div>
            )}
          </TabsContent>

          {/* Journey Tab */}
          <TabsContent value="journey">
            <div className="space-y-6">
              {/* SVG Score Trend Chart */}
              {analysisChartData.length >= 2 && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
                >
                  <p className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-lime-400" /> Score Trend Over Time
                  </p>
                  <ScoreChart
                    data={analysisChartData.map(a => ({ label: a.label, value: a.score }))}
                    width={600}
                    height={200}
                  />
                </motion.div>
              )}

              {/* Per-dimension comparison bars */}
              {progressionData?.metric_improvements?.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
                >
                  <p className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-sky-400" /> Metric Comparison (First vs Latest)
                  </p>
                  <ComparisonBars
                    dimensions={progressionData.metric_improvements.map(m => ({
                      label: m.label,
                      firstValue: m.first_value,
                      latestValue: m.latest_value,
                      maxValue: m.unit === "°" ? 180 : 100,
                      unit: m.unit,
                    }))}
                  />
                </motion.div>
              )}

              {/* Journey Timeline */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
              >
                <p className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" /> Your Journey
                </p>
                <JourneyTimeline
                  events={[
                    // Map analyses to journey events
                    ...analysisHistory.map((a, i) => ({
                      type: "analysis",
                      date: a.date,
                      title: `${a.shot_analysis?.shot_name || "Analysis"} ${a.shot_analysis?.score ? `- ${a.shot_analysis.score}/100` : ""}`,
                      subtitle: a.skill_level ? `Level: ${a.skill_level}` : undefined,
                    })),
                    // Map badges to journey events
                    ...(badgesData?.earned_badges || []).map(b => ({
                      type: "badge",
                      date: b.earned_date,
                      title: `Badge: ${b.name}`,
                      subtitle: b.description,
                    })),
                  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20)}
                />
                {analysisHistory.length === 0 && (
                  <div className="text-center py-6">
                    <Star className="w-8 h-8 text-zinc-600 mx-auto mb-2" strokeWidth={1.5} />
                    <p className="text-zinc-500 text-sm">Start your journey by uploading a video!</p>
                    <Link to="/analyze" className="inline-flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300 font-medium mt-2">
                      Get Started <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </motion.div>

              {/* Improvement Summary */}
              {progressionData?.improvement_summary && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-zinc-900/80 border border-lime-400/20 rounded-2xl p-5"
                >
                  <p className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-lime-400" /> Overall Progress
                  </p>
                  <div className="grid grid-cols-3 gap-4 text-center mb-4">
                    <div>
                      <p className="font-heading font-bold text-2xl text-white">{progressionData.improvement_summary.first_score}</p>
                      <p className="text-zinc-500 text-[10px] uppercase">First Score</p>
                    </div>
                    <div>
                      <p className={`font-heading font-bold text-2xl ${
                        progressionData.improvement_summary.total_improvement_pct > 0 ? "text-lime-400" : "text-amber-400"
                      }`}>
                        {progressionData.improvement_summary.total_improvement_pct > 0 ? "+" : ""}
                        {progressionData.improvement_summary.total_improvement_pct}%
                      </p>
                      <p className="text-zinc-500 text-[10px] uppercase">Change</p>
                    </div>
                    <div>
                      <p className="font-heading font-bold text-2xl text-lime-400">{progressionData.improvement_summary.latest_score}</p>
                      <p className="text-zinc-500 text-[10px] uppercase">Latest Score</p>
                    </div>
                  </div>
                  {progressionData.coach_improvement_message && (
                    <p className="text-xs text-zinc-400">{progressionData.coach_improvement_message}</p>
                  )}
                </motion.div>
              )}
            </div>
          </TabsContent>

          {/* Badges Tab */}
          <TabsContent value="badges">
            <div className="space-y-6">
              {/* Badges Stats */}
              {badgesData && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-400" /> Your Badges
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-400/10 text-amber-400 border-amber-400/20 text-xs">
                        {badgesData.total_earned} / {badgesData.total_available}
                      </Badge>
                      {badgesData.current_upload_streak > 0 && (
                        <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs flex items-center gap-1">
                          <Flame className="w-3 h-3" /> {badgesData.current_upload_streak}w streak
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Progress to next badge */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs text-zinc-500">Badge Collection Progress</p>
                      <p className="text-xs text-lime-400 font-bold">
                        {Math.round((badgesData.total_earned / badgesData.total_available) * 100)}%
                      </p>
                    </div>
                    <Progress
                      value={(badgesData.total_earned / badgesData.total_available) * 100}
                      className="h-2 bg-zinc-800 [&>div]:bg-lime-400 [&>div]:rounded-full"
                    />
                  </div>

                  {/* Badge Grid */}
                  <BadgeGrid badges={badgesData.all_badges || []} showLocked={true} />
                </motion.div>
              )}

              {!badgesData && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-10 text-center"
                >
                  <Award className="w-12 h-12 text-zinc-600 mx-auto mb-4" strokeWidth={1.5} />
                  <p className="text-zinc-400 text-lg font-medium mb-2">Earn your first badge!</p>
                  <p className="text-zinc-600 text-sm mb-6">Upload a video to earn the "First Upload" badge.</p>
                  <Link to="/analyze">
                    <Button className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-6 min-h-[44px]">
                      <Upload className="w-4 h-4 mr-2" /> Analyze Your First Video
                    </Button>
                  </Link>
                </motion.div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Share Modal */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareData={{
          title: "My AthlyticAI Progress",
          text: `My AthlyticAI Progress:\n${d.completed_days}/${d.total_days} training days completed\n${analysisHistory.length} video analyses\n${d.current_streak} day streak\n${badgesData?.total_earned || 0} badges earned\n\nTrain smarter with AthlyticAI!`,
          card: {
            player_name: user?.name || "AthlyticAI Player",
            skill_level: analysisHistory[0]?.skill_level || "",
            sport: "",
            badges_count: badgesData?.total_earned || 0,
            analysis_count: analysisHistory.length,
            training_days: d.completed_days,
          },
        }}
        cardType="progress"
      />
    </div>
  );
}
