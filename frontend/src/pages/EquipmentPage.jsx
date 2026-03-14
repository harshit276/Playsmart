import { useEffect, useState } from "react";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { Target, Star, ExternalLink, ChevronDown, ChevronUp, Sparkles, ShoppingCart } from "lucide-react";
import api from "@/lib/api";

function ScoreCircle({ score, size = 64 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#bef264" strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-heading font-bold text-lg text-white">{score}</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max, color = "bg-lime-400" }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-zinc-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-zinc-400 font-mono w-8 text-right">{value}/{max}</span>
    </div>
  );
}

function PriceTable({ prices }) {
  if (!prices?.length) return <p className="text-zinc-600 text-xs">No price data available.</p>;
  const lowest = Math.min(...prices.map(p => p.price));
  return (
    <div className="space-y-2">
      {prices.map((p, i) => (
        <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg text-xs ${p.price === lowest ? "bg-lime-400/10 border border-lime-400/20" : "bg-zinc-800/50"}`}>
          <div>
            <span className="font-medium text-zinc-300">{p.marketplace}</span>
            {p.price === lowest && <Badge className="ml-2 bg-lime-400 text-black text-[10px] px-1.5 py-0">Best Price</Badge>}
          </div>
          <div className="flex items-center gap-3">
            {p.discount_percent > 0 && <span className="text-zinc-500 line-through">{p.mrp?.toLocaleString()}</span>}
            <span className={`font-bold ${p.price === lowest ? "text-lime-400" : "text-white"}`}>{p.price?.toLocaleString()}</span>
            <a href={p.listing_url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-lime-400">
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EquipmentPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (user?.id) {
      api.get(`/recommendations/equipment/${user.id}`)
        .then(r => setData(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [user?.id]);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 py-8" data-testid="equipment-page">
      <div className="container mx-auto px-4 max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-heading font-bold text-3xl md:text-5xl uppercase tracking-tight text-white mb-2" data-testid="equipment-title">
            Your Top Matches
          </h1>
          {data?.profile_summary && (
            <div className="flex flex-wrap gap-2 mb-6">
              <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">{data.profile_summary.skill_level}</Badge>
              <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">{data.profile_summary.play_style}</Badge>
              <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">{data.profile_summary.budget_range} Budget</Badge>
              <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">Goal: {data.profile_summary.primary_goal}</Badge>
            </div>
          )}
        </motion.div>

        <div className="space-y-4">
          {data?.recommendations?.map((rec, i) => {
            const eq = rec.equipment;
            const sc = rec.score;
            const isExpanded = expanded === i;

            return (
              <motion.div key={eq.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className={`bg-zinc-900 border rounded-xl overflow-hidden transition-all ${isExpanded ? "border-lime-400/30" : "border-zinc-800"}`}
                data-testid={`recommendation-card-${i}`}>

                <div className="p-5 flex flex-col md:flex-row gap-5 items-start">
                  {/* Rank + Image */}
                  <div className="flex items-center gap-4 md:gap-5">
                    <div className="w-8 h-8 rounded-full bg-lime-400/10 flex items-center justify-center shrink-0">
                      <span className="font-heading font-bold text-lime-400 text-sm">#{i + 1}</span>
                    </div>
                    <div className="w-20 h-20 rounded-lg bg-zinc-800 overflow-hidden shrink-0">
                      <img src={eq.image_url} alt={eq.model} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide">{eq.brand}</p>
                        <h3 className="font-heading font-bold text-xl text-white tracking-tight">{eq.model}</h3>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.weight_category}</Badge>
                          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.balance_type}</Badge>
                          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.shaft_flexibility}</Badge>
                        </div>
                      </div>
                      <ScoreCircle score={sc.total} />
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <ScoreBar label="Skill" value={sc.skill_match} max={40} />
                      <ScoreBar label="Style" value={sc.play_style_match} max={30} color="bg-sky-400" />
                      <ScoreBar label="Budget" value={sc.budget_match} max={20} color="bg-purple-400" />
                      <ScoreBar label="Perf." value={sc.performance_fit} max={10} color="bg-amber-400" />
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-2">
                  <Button variant="ghost" onClick={() => setExpanded(isExpanded ? null : i)}
                    className="w-full text-zinc-500 hover:text-lime-400 text-xs uppercase tracking-wide" data-testid={`expand-rec-${i}`}>
                    {isExpanded ? <><ChevronUp className="w-3 h-3 mr-1" /> Less Details</> : <><ChevronDown className="w-3 h-3 mr-1" /> More Details</>}
                  </Button>
                </div>

                {isExpanded && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="px-5 pb-5">
                    <Separator className="bg-zinc-800 mb-4" />

                    <Tabs defaultValue="why" className="w-full">
                      <TabsList className="bg-zinc-800 border-zinc-700 mb-4 w-full grid grid-cols-3">
                        <TabsTrigger value="why" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Why This?</TabsTrigger>
                        <TabsTrigger value="specs" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Specs</TabsTrigger>
                        <TabsTrigger value="prices" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Prices</TabsTrigger>
                      </TabsList>

                      <TabsContent value="why">
                        <div className="flex gap-2 items-start">
                          <Sparkles className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                          <p className="text-sm text-zinc-300 leading-relaxed" data-testid={`explanation-${i}`}>{rec.explanation}</p>
                        </div>
                      </TabsContent>

                      <TabsContent value="specs">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          {[
                            ["Weight", eq.weight_category + ` (${eq.actual_weight_grams}g)`],
                            ["Balance", eq.balance_type + ` (${eq.balance_point_mm}mm)`],
                            ["Shaft", eq.shaft_flexibility],
                            ["Frame", eq.frame_material],
                            ["Max Tension", eq.max_string_tension_lbs + " lbs"],
                            ["Grip", eq.grip_size],
                            ["Attack", `${eq.attack_score}/10`],
                            ["Control", `${eq.control_score}/10`],
                            ["Speed", `${eq.speed_score}/10`],
                            ["Forgiveness", `${eq.forgiveness_score}/10`],
                          ].map(([k, v]) => (
                            <div key={k} className="flex justify-between p-2 bg-zinc-800/50 rounded-lg">
                              <span className="text-zinc-500">{k}</span>
                              <span className="text-zinc-200 font-medium">{v}</span>
                            </div>
                          ))}
                        </div>
                      </TabsContent>

                      <TabsContent value="prices">
                        <PriceTable prices={rec.prices} />
                      </TabsContent>
                    </Tabs>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
