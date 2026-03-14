import { useEffect, useState } from "react";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, Play, Dumbbell, Flame, BedDouble } from "lucide-react";
import api from "@/lib/api";

export default function TrainingPage() {
  const { user, profile } = useAuth();
  const [planData, setPlanData] = useState(null);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const [planRes, progRes] = await Promise.all([
          api.get(`/recommendations/training/${user.id}`),
          api.get(`/progress/${user.id}`),
        ]);
        setPlanData(planRes.data);
        const map = {};
        (progRes.data.entries || []).forEach(e => { map[e.day] = true; });
        setProgress(map);
      } catch {}
      setLoading(false);
    };
    load();
  }, [user?.id]);

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

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const plan = planData?.plan;
  if (!plan) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">No training plan found.</p>
    </div>
  );

  const drills = planData?.drills || {};
  const videos = planData?.videos || {};

  return (
    <div className="min-h-screen bg-zinc-950 py-8" data-testid="training-page">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="font-heading font-bold text-3xl md:text-5xl uppercase tracking-tight text-white mb-2" data-testid="training-title">
            {plan.name}
          </h1>
          <p className="text-zinc-400 mb-3">{plan.description}</p>
          <div className="flex items-center gap-3">
            <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20">{plan.level}</Badge>
            <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-zinc-700">{plan.duration_days} Days</Badge>
            <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-zinc-700">
              {Object.keys(progress).length}/{plan.duration_days} Done
            </Badge>
          </div>
        </motion.div>

        <Tabs defaultValue="1" className="w-full">
          <TabsList className="bg-zinc-800 border-zinc-700 mb-6 w-full grid grid-cols-4" data-testid="week-tabs">
            {plan.weeks?.map((w) => (
              <TabsTrigger key={w.week} value={String(w.week)}
                className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
                Week {w.week}
              </TabsTrigger>
            ))}
          </TabsList>

          {plan.weeks?.map((week) => (
            <TabsContent key={week.week} value={String(week.week)}>
              <p className="text-sm text-zinc-500 uppercase tracking-wide font-medium mb-4">{week.theme}</p>
              <div className="space-y-3">
                {week.days?.map((day) => {
                  const isCompleted = !!progress[day.day];
                  const isRest = day.type === "rest";
                  const dayDrills = (day.drills || []).map(id => drills[id]).filter(Boolean);

                  return (
                    <motion.div key={day.day} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className={`rounded-xl border p-4 transition-all ${
                        isCompleted ? "border-lime-400/30 bg-lime-400/5" : isRest ? "border-zinc-800/50 bg-zinc-900/50" : "border-zinc-800 bg-zinc-900"
                      }`} data-testid={`day-card-${day.day}`}>

                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          {isRest ? (
                            <BedDouble className="w-5 h-5 text-zinc-600" />
                          ) : isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-lime-400" />
                          ) : (
                            <Circle className="w-5 h-5 text-zinc-600" />
                          )}
                          <div>
                            <span className="font-heading font-semibold text-sm text-white uppercase">Day {day.day}</span>
                            <span className="text-zinc-500 text-xs ml-2">{day.focus_area}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isRest && day.duration_minutes > 0 && (
                            <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                              <Clock className="w-3 h-3 mr-1" /> {day.duration_minutes}min
                            </Badge>
                          )}
                          {!isRest && (
                            <Button size="sm" variant={isCompleted ? "default" : "outline"}
                              onClick={() => toggleDay(plan.id, day.day)}
                              disabled={toggling === day.day}
                              className={isCompleted
                                ? "bg-lime-400 text-black hover:bg-lime-500 text-xs h-7 px-3 rounded-full"
                                : "border-zinc-700 text-zinc-400 hover:border-lime-400 hover:text-lime-400 text-xs h-7 px-3 rounded-full"
                              } data-testid={`complete-day-${day.day}`}>
                              {isCompleted ? "Completed" : "Mark Done"}
                            </Button>
                          )}
                        </div>
                      </div>

                      {!isRest && dayDrills.length > 0 && (
                        <div className="ml-8 mt-2 space-y-2">
                          {dayDrills.map((drill) => {
                            const drillVideos = videos[drill.id] || [];
                            return (
                              <div key={drill.id} className="p-3 bg-zinc-800/40 rounded-lg">
                                <div className="flex items-center gap-2 mb-1">
                                  <Dumbbell className="w-3.5 h-3.5 text-zinc-500" />
                                  <span className="text-sm font-medium text-zinc-200">{drill.name}</span>
                                  <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px] ml-auto">{drill.duration_minutes}min</Badge>
                                </div>
                                <p className="text-xs text-zinc-500 mb-1">{drill.description}</p>
                                {drill.coaching_tip && <p className="text-xs text-lime-400/80 italic">Tip: {drill.coaching_tip}</p>}
                                {drillVideos.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {drillVideos.map((v, vi) => (
                                      <a key={vi} href={v.youtube_url} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] bg-zinc-800 text-zinc-400 hover:text-lime-400 px-2 py-1 rounded-md transition-colors"
                                        data-testid={`video-link-${drill.id}-${vi}`}>
                                        <Play className="w-3 h-3" /> {v.channel_name}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {isRest && <p className="ml-8 text-xs text-zinc-600 italic">Rest & Recovery Day</p>}
                    </motion.div>
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
