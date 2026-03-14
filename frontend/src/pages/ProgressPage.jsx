import { useEffect, useState } from "react";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Flame, Calendar, TrendingUp, CheckCircle2, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import api from "@/lib/api";

export default function ProgressPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      api.get(`/progress/${user.id}`).then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
    }
  }, [user?.id]);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const d = data || { completed_days: 0, total_days: 30, progress_percentage: 0, current_streak: 0, entries: [] };

  // Generate weekly chart data
  const weekData = [1, 2, 3, 4].map(w => {
    const start = (w - 1) * 7 + 1;
    const end = w * 7 + (w === 4 ? 2 : 0);
    const completed = (d.entries || []).filter(e => e.day >= start && e.day <= end).length;
    return { week: `W${w}`, completed, total: end - start + 1 };
  });

  // Day grid (30 days)
  const completedSet = new Set((d.entries || []).map(e => e.day));

  return (
    <div className="min-h-screen bg-zinc-950 py-8" data-testid="progress-page">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-heading font-bold text-3xl md:text-5xl uppercase tracking-tight text-white mb-6" data-testid="progress-title">
            Your Progress
          </h1>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Target, label: "Completion", value: `${d.progress_percentage}%`, color: "text-lime-400" },
            { icon: Flame, label: "Streak", value: `${d.current_streak} days`, color: "text-amber-400" },
            { icon: CheckCircle2, label: "Completed", value: `${d.completed_days}/${d.total_days}`, color: "text-sky-400" },
            { icon: TrendingUp, label: "Remaining", value: `${d.total_days - d.completed_days} days`, color: "text-purple-400" },
          ].map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center" data-testid={`stat-${stat.label.toLowerCase()}`}>
              <stat.icon className={`w-6 h-6 ${stat.color} mx-auto mb-2`} strokeWidth={1.5} />
              <p className="font-heading font-bold text-2xl text-white">{stat.value}</p>
              <p className="text-zinc-500 text-xs uppercase tracking-wide">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Overall Progress Bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8" data-testid="progress-bar-card">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-medium text-zinc-300">30-Day Plan Progress</p>
            <span className="font-heading font-bold text-lg text-lime-400">{d.progress_percentage}%</span>
          </div>
          <Progress value={d.progress_percentage} className="h-3 bg-zinc-800 [&>div]:bg-lime-400 [&>div]:rounded-full" />
        </motion.div>

        {/* Weekly Chart */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8" data-testid="weekly-chart">
          <p className="text-sm font-medium text-zinc-300 mb-4">Weekly Breakdown</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", color: "#fafafa", fontSize: 12 }} />
                <Bar dataKey="completed" fill="#bef264" radius={[4, 4, 0, 0]} name="Completed" />
                <Bar dataKey="total" fill="#27272a" radius={[4, 4, 0, 0]} name="Total" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Day Grid */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-5" data-testid="day-grid">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-zinc-500" />
            <p className="text-sm font-medium text-zinc-300">30-Day Overview</p>
          </div>
          <div className="grid grid-cols-7 sm:grid-cols-10 gap-2">
            {Array.from({ length: 30 }, (_, i) => i + 1).map(day => (
              <div key={day} data-testid={`day-cell-${day}`}
                className={`w-full aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-all ${
                  completedSet.has(day) ? "bg-lime-400 text-black font-bold" : "bg-zinc-800 text-zinc-500"
                }`}>
                {day}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-lime-400" /> Completed</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-zinc-800" /> Remaining</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
