import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { Target, Star, ExternalLink, ChevronDown, ChevronUp, Sparkles, ShoppingCart, Footprints, Package } from "lucide-react";
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
            <a href={p.listing_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 bg-lime-400/10 text-lime-400 rounded-md hover:bg-lime-400/20 transition-colors"
              data-testid={`buy-link-${p.marketplace?.toLowerCase()}`}>
              <ShoppingCart className="w-3 h-3" /> Buy <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecCard({ rec, i, expanded, setExpanded, showShoeSpecs }) {
  const eq = rec.equipment;
  const sc = rec.score;
  const isExpanded = expanded === `${showShoeSpecs ? 's' : 'r'}-${i}`;
  const toggleKey = `${showShoeSpecs ? 's' : 'r'}-${i}`;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
      className={`bg-zinc-900 border rounded-xl overflow-hidden transition-all ${isExpanded ? "border-lime-400/30" : "border-zinc-800"}`}
      data-testid={`recommendation-card-${showShoeSpecs ? 'shoe' : 'racket'}-${i}`}>

      <div className="p-5 flex flex-col md:flex-row gap-5 items-start">
        <div className="flex items-center gap-4 md:gap-5">
          <div className="w-8 h-8 rounded-full bg-lime-400/10 flex items-center justify-center shrink-0">
            <span className="font-heading font-bold text-lime-400 text-sm">#{i + 1}</span>
          </div>
          <div className="w-20 h-20 rounded-lg bg-zinc-800 overflow-hidden shrink-0">
            <img src={eq.image_url} alt={eq.model} className="w-full h-full object-cover"
              onError={(e) => { e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%2327272a' width='80' height='80'/%3E%3Ctext fill='%2371717a' x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='10'%3ENo Image%3C/text%3E%3C/svg%3E"; }} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">{eq.brand}</p>
              <h3 className="font-heading font-bold text-xl text-white tracking-tight">{eq.model}</h3>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {showShoeSpecs ? (
                  <>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.weight_grams}g</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.cushioning}</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.ankle_support} Cut</Badge>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.weight_category}</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.balance_type}</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{eq.shaft_flexibility}</Badge>
                  </>
                )}
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
        <Button variant="ghost" onClick={() => setExpanded(isExpanded ? null : toggleKey)}
          className="w-full text-zinc-500 hover:text-lime-400 text-xs uppercase tracking-wide" data-testid={`expand-${toggleKey}`}>
          {isExpanded ? <><ChevronUp className="w-3 h-3 mr-1" /> Less Details</> : <><ChevronDown className="w-3 h-3 mr-1" /> View Details & Buy</>}
        </Button>
      </div>

      {isExpanded && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="px-5 pb-5">
          <Separator className="bg-zinc-800 mb-4" />
          <Tabs defaultValue="why" className="w-full">
            <TabsList className="bg-zinc-800 border-zinc-700 mb-4 w-full grid grid-cols-3">
              <TabsTrigger value="why" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Why This?</TabsTrigger>
              <TabsTrigger value="specs" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Specs</TabsTrigger>
              <TabsTrigger value="prices" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black">Buy Now</TabsTrigger>
            </TabsList>

            <TabsContent value="why">
              <div className="flex gap-2 items-start">
                <Sparkles className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-300 leading-relaxed" data-testid={`explanation-${toggleKey}`}>{rec.explanation}</p>
              </div>
            </TabsContent>

            <TabsContent value="specs">
              <div className="grid grid-cols-2 gap-3 text-xs">
                {showShoeSpecs ? (
                  [["Weight", `${eq.weight_grams}g`], ["Cushioning", eq.cushioning], ["Sole", eq.sole_type], ["Ankle Support", eq.ankle_support], ["Breathability", `${eq.breathability}/10`], ["Durability", `${eq.durability}/10`]].map(([k, v]) => (
                    <div key={k} className="flex justify-between p-2 bg-zinc-800/50 rounded-lg"><span className="text-zinc-500">{k}</span><span className="text-zinc-200 font-medium">{v}</span></div>
                  ))
                ) : (
                  [["Weight", eq.weight_category + ` (${eq.actual_weight_grams}g)`], ["Balance", eq.balance_type + ` (${eq.balance_point_mm}mm)`], ["Shaft", eq.shaft_flexibility], ["Frame", eq.frame_material], ["Max Tension", eq.max_string_tension_lbs + " lbs"], ["Grip", eq.grip_size], ["Attack", `${eq.attack_score}/10`], ["Control", `${eq.control_score}/10`], ["Speed", `${eq.speed_score}/10`], ["Forgiveness", `${eq.forgiveness_score}/10`]].map(([k, v]) => (
                    <div key={k} className="flex justify-between p-2 bg-zinc-800/50 rounded-lg"><span className="text-zinc-500">{k}</span><span className="text-zinc-200 font-medium">{v}</span></div>
                  ))
                )}
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
}

function GearCard({ item, prices, reason }) {
  const eq = item;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-lime-400/30 transition-all" data-testid={`gear-card-${eq.id}`}>
      <div className="flex gap-4 items-start">
        <div className="w-16 h-16 rounded-lg bg-zinc-800 overflow-hidden shrink-0">
          <img src={eq.image_url} alt={eq.model} className="w-full h-full object-cover"
            onError={(e) => { e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect fill='%2327272a' width='64' height='64'/%3E%3C/svg%3E"; }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-500 uppercase">{eq.brand}</p>
          <h4 className="font-heading font-bold text-base text-white tracking-tight">{eq.model}</h4>
          <p className="text-xs text-zinc-400 mt-1">{eq.description}</p>
          {reason && <p className="text-xs text-lime-400/80 italic mt-1.5">{reason}</p>}
        </div>
      </div>
      {prices?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {prices.map((p, i) => {
            const isLowest = prices.length > 1 && p.price === Math.min(...prices.map(pp => pp.price));
            return (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${isLowest ? "bg-lime-400/10 border border-lime-400/20" : "bg-zinc-800/50"}`}>
                <span className="text-zinc-300">{p.marketplace} {isLowest && <Badge className="ml-1 bg-lime-400 text-black text-[9px] px-1 py-0">Best</Badge>}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${isLowest ? "text-lime-400" : "text-white"}`}>{p.price?.toLocaleString()}</span>
                  <a href={p.listing_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-lime-400/10 text-lime-400 rounded text-[10px] hover:bg-lime-400/20"
                    data-testid={`gear-buy-${eq.id}-${p.marketplace?.toLowerCase()}`}>
                    <ShoppingCart className="w-2.5 h-2.5" /> Buy <ExternalLink className="w-2 h-2" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CAT_LABELS = { shuttlecock: "Shuttlecocks", string: "Strings", grip: "Grips", bag: "Bags" };
const CAT_ORDER = ["shuttlecock", "string", "grip", "bag"];

export default function EquipmentPage() {
  const { user } = useAuth();
  const [racketData, setRacketData] = useState(null);
  const [shoeData, setShoeData] = useState(null);
  const [gearData, setGearData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [activeTab, setActiveTab] = useState("rackets");

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [racketRes, shoeRes, gearRes] = await Promise.all([
        api.get(`/recommendations/equipment/${user.id}?category=racket`),
        api.get(`/recommendations/equipment/${user.id}?category=shoes`),
        api.get(`/recommendations/gear/${user.id}`),
      ]);
      setRacketData(racketRes.data);
      setShoeData(shoeRes.data);
      setGearData(gearRes.data);
    } catch {}
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
          {racketData?.profile_summary && (
            <div className="flex flex-wrap gap-2 mb-6">
              <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">{racketData.profile_summary.skill_level}</Badge>
              <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">{racketData.profile_summary.play_style}</Badge>
              <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">{racketData.profile_summary.budget_range} Budget</Badge>
              <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">Goal: {racketData.profile_summary.primary_goal}</Badge>
            </div>
          )}
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-zinc-800 border-zinc-700 mb-6 w-full grid grid-cols-3" data-testid="equipment-category-tabs">
            <TabsTrigger value="rackets" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <Target className="w-4 h-4 mr-1.5" /> Rackets
            </TabsTrigger>
            <TabsTrigger value="shoes" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <Footprints className="w-4 h-4 mr-1.5" /> Shoes
            </TabsTrigger>
            <TabsTrigger value="gear" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <Package className="w-4 h-4 mr-1.5" /> Essential Gear
            </TabsTrigger>
          </TabsList>

          {/* Rackets */}
          <TabsContent value="rackets">
            <div className="space-y-4">
              {racketData?.recommendations?.map((rec, i) => (
                <RecCard key={rec.equipment.id} rec={rec} i={i} expanded={expanded} setExpanded={setExpanded} showShoeSpecs={false} />
              ))}
              {!racketData?.recommendations?.length && <p className="text-zinc-500 text-center py-8">No racket recommendations found.</p>}
            </div>
          </TabsContent>

          {/* Shoes */}
          <TabsContent value="shoes">
            <div className="space-y-4">
              {shoeData?.recommendations?.map((rec, i) => (
                <RecCard key={rec.equipment.id} rec={rec} i={i} expanded={expanded} setExpanded={setExpanded} showShoeSpecs={true} />
              ))}
              {!shoeData?.recommendations?.length && <p className="text-zinc-500 text-center py-8">No shoe recommendations found.</p>}
            </div>
          </TabsContent>

          {/* Essential Gear */}
          <TabsContent value="gear">
            {gearData?.gear && CAT_ORDER.map(cat => {
              const items = gearData.gear[cat];
              if (!items?.length) return null;
              return (
                <div key={cat} className="mb-6">
                  <h3 className="font-heading font-semibold text-lg text-white uppercase tracking-tight mb-3" data-testid={`gear-category-${cat}`}>
                    {CAT_LABELS[cat]}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.map((g) => (
                      <GearCard key={g.equipment.id} item={g.equipment} prices={g.prices} reason={g.reason} />
                    ))}
                  </div>
                </div>
              );
            })}
            {!gearData?.gear && <p className="text-zinc-500 text-center py-8">No gear recommendations found.</p>}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
