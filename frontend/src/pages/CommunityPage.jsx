import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, UserCheck, Calendar, MapPin, Clock, Trophy,
  Search, Plus, ChevronRight, Swords, X, Check, Bell, Share2, Zap,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { swrGet, invalidateMatching } from "@/lib/cachedFetch";

const SPORT_LABELS = {
  badminton: "Badminton", table_tennis: "Table Tennis", tennis: "Tennis", pickleball: "Pickleball",
};
const SPORT_EMOJI = {
  badminton: "🏸", tennis: "🎾", table_tennis: "🏓", pickleball: "⚡",
};
const SPORT_COLORS = {
  badminton: "bg-lime-400/10 text-lime-400 border-lime-400/20",
  table_tennis: "bg-sky-400/10 text-sky-400 border-sky-400/20",
  tennis: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  pickleball: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
};
const SPORT_GRADIENTS = {
  badminton: "from-lime-500/20 to-emerald-900/20",
  tennis: "from-amber-500/20 to-orange-900/20",
  table_tennis: "from-sky-500/20 to-blue-900/20",
  pickleball: "from-emerald-500/20 to-teal-900/20",
};

// Format a YYYY-MM-DD into a friendly chip ("Today", "Tomorrow", "Mon 28 Apr")
function friendlyDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// "18:00" → "6:00 PM"
function friendlyTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${period}`;
}

// "today" / "tomorrow" / "week" / "all" filter
function matchesWhen(dateStr, when) {
  if (when === "all") return true;
  if (!dateStr) return false;
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = d.getTime();
  const todayT = today.getTime();
  if (when === "today") return day === todayT;
  if (when === "tomorrow") return day === todayT + 86400000;
  if (when === "week") {
    const weekEnd = todayT + 7 * 86400000;
    return day >= todayT && day <= weekEnd;
  }
  return true;
}

const QUICK_HOST_PRESETS = [
  { label: "Doubles tonight", sport: "badminton", time: "19:00", offsetDays: 0, max_players: 4, title: "Casual doubles tonight" },
  { label: "Singles tomorrow", sport: "badminton", time: "07:00", offsetDays: 1, max_players: 2, title: "Morning singles" },
  { label: "Weekend match", sport: "badminton", time: "10:00", offsetDays: 6, max_players: 4, title: "Weekend doubles" },
];

export default function CommunityPage() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState("games");
  const [players, setPlayers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [games, setGames] = useState([]);
  const [myGames, setMyGames] = useState({ hosted: [], joined: [] });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [sending, setSending] = useState({});

  // Filters for the games list
  const [filterSport, setFilterSport] = useState("all");
  const [filterWhen, setFilterWhen] = useState("week");

  const [gameForm, setGameForm] = useState({
    sport: profile?.active_sport || "badminton",
    title: "",
    venue: "",
    city: "",
    date: "",
    time: "18:00",
    duration_minutes: 60,
    skill_level: "All Levels",
    max_players: 4,
    notes: "",
  });

  // SWR-cached load — instant on revisits, refreshes in background.
  const loadData = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const urls = ["/community/players", "/friends", "/friends/requests", "/games", "/games/my"];
    const swrCalls = urls.map((u) => swrGet(u));

    // Hydrate from cache instantly
    let anyCached = false;
    if (swrCalls[0].cached) { setPlayers(swrCalls[0].cached.players || []); anyCached = true; }
    if (swrCalls[1].cached) { setFriends(swrCalls[1].cached.friends || []); anyCached = true; }
    if (swrCalls[2].cached) { setRequests(swrCalls[2].cached.received || []); anyCached = true; }
    if (swrCalls[3].cached) { setGames(swrCalls[3].cached.games || []); anyCached = true; }
    if (swrCalls[4].cached) { setMyGames(swrCalls[4].cached || { hosted: [], joined: [] }); anyCached = true; }
    setLoading(!anyCached);

    // Background refresh
    const results = await Promise.allSettled(swrCalls.map((s) => s.fresh));
    if (results[0].status === "fulfilled") setPlayers(results[0].value.players || []);
    if (results[1].status === "fulfilled") setFriends(results[1].value.friends || []);
    if (results[2].status === "fulfilled") setRequests(results[2].value.received || []);
    if (results[3].status === "fulfilled") setGames(results[3].value.games || []);
    if (results[4].status === "fulfilled") setMyGames(results[4].value || { hosted: [], joined: [] });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { document.title = "Community | AthlyticAI"; }, []);

  const refresh = () => {
    invalidateMatching((k) => k.startsWith("/games") || k.startsWith("/friends") || k.startsWith("/community"));
    loadData();
  };

  const sendFriendRequest = async (toUserId) => {
    setSending(p => ({ ...p, [toUserId]: true }));
    try {
      const { data } = await api.post("/friends/request", { to_user_id: toUserId });
      toast.success(data.message);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
    setSending(p => ({ ...p, [toUserId]: false }));
  };

  const respondRequest = async (requestId, action) => {
    try {
      const { data } = await api.post("/friends/respond", { request_id: requestId, action });
      toast.success(data.message);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const createGame = async () => {
    if (!gameForm.title || !gameForm.venue || !gameForm.city || !gameForm.date) {
      toast.error("Please fill venue, city, date, and a title");
      return;
    }
    try {
      const { data } = await api.post("/games", gameForm);
      toast.success(data.message || "Game posted");
      setShowCreate(false);
      setGameForm(f => ({ ...f, title: "", venue: "", notes: "" }));
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create game");
    }
  };

  const applyQuickHost = (preset) => {
    const d = new Date();
    d.setDate(d.getDate() + preset.offsetDays);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setGameForm((f) => ({
      ...f,
      sport: preset.sport,
      time: preset.time,
      date: `${yyyy}-${mm}-${dd}`,
      max_players: preset.max_players,
      title: preset.title,
    }));
    setShowCreate(true);
  };

  const joinGame = async (gameId) => {
    try {
      const { data } = await api.post("/games/join", { game_id: gameId });
      toast.success(data.message);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to join");
    }
  };

  const leaveGame = async (gameId) => {
    try {
      const { data } = await api.post(`/games/${gameId}/leave`);
      toast.success(data.message);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const friendIds = new Set(friends.map(f => f.user_id));

  // Filtered open games (exclude games user is already in, then apply filters)
  const openGames = useMemo(() => {
    return games
      .filter(g => !g.players?.includes(user?.id))
      .filter(g => filterSport === "all" || g.sport === filterSport)
      .filter(g => matchesWhen(g.date, filterWhen));
  }, [games, user?.id, filterSport, filterWhen]);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="community-page">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="h-10 bg-zinc-800 rounded-xl animate-pulse w-48 mb-2" />
        <div className="h-4 bg-zinc-800/60 rounded animate-pulse w-72 mb-6" />
        <div className="h-12 bg-zinc-800 rounded-xl animate-pulse w-full mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 h-32 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="community-page">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* HERO */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-3xl overflow-hidden relative bg-gradient-to-br from-lime-400/20 via-zinc-900 to-zinc-950 border border-zinc-800">
          <div className="px-6 py-7 sm:px-8 sm:py-8 relative z-10">
            <h1 className="font-heading font-bold text-3xl md:text-5xl uppercase tracking-tight text-white mb-2">
              Find Players. Host Matches.
            </h1>
            <p className="text-zinc-300 text-sm sm:text-base mb-5 max-w-md">
              Open games near you, friends in the app, and one-tap match invites — all in one place.
            </p>
            <div className="flex flex-wrap gap-2">
              <HostGameDialog
                open={showCreate}
                onOpenChange={setShowCreate}
                gameForm={gameForm}
                setGameForm={setGameForm}
                onCreate={createGame}
              >
                <Button className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full h-11 px-5 shadow-lg shadow-lime-400/20">
                  <Plus className="w-4 h-4 mr-1.5" /> Host a Game
                </Button>
              </HostGameDialog>
              <Button onClick={() => setActiveTab("discover")}
                variant="outline" className="rounded-full h-11 px-5 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                <Search className="w-4 h-4 mr-1.5" /> Find Players
              </Button>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 text-[180px] opacity-10 select-none">🏸</div>
        </motion.div>

        {/* Quick-host presets */}
        <div className="mb-6 -mx-1 overflow-x-auto">
          <div className="flex gap-2 px-1 min-w-max">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 self-center mr-1">Quick host</span>
            {QUICK_HOST_PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyQuickHost(p)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 hover:border-lime-400/30 transition-colors">
                <Zap className="w-3 h-3 text-lime-400" /> {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Friend request banner */}
        {requests.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-4 bg-lime-400/5 border border-lime-400/20 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-lime-400/10 transition-colors"
            onClick={() => setActiveTab("friends")}>
            <Bell className="w-5 h-5 text-lime-400" />
            <span className="text-sm text-lime-400 font-medium">{requests.length} friend request{requests.length > 1 ? "s" : ""} pending</span>
            <ChevronRight className="w-4 h-4 text-lime-400 ml-auto" />
          </motion.div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-zinc-800 border-zinc-700 mb-6 w-full grid grid-cols-3">
            <TabsTrigger value="games" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <Swords className="w-3.5 h-3.5 mr-1" /> Games
            </TabsTrigger>
            <TabsTrigger value="friends" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <Users className="w-3.5 h-3.5 mr-1" /> Friends
              {requests.length > 0 && <Badge className="bg-red-500 text-white ml-1 text-[10px] px-1.5 py-0">{requests.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="discover" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <Search className="w-3.5 h-3.5 mr-1" /> Discover
            </TabsTrigger>
          </TabsList>

          {/* ── GAMES TAB ── */}
          <TabsContent value="games">
            <div className="space-y-5">
              {/* My Games */}
              {(myGames.hosted.length > 0 || myGames.joined.length > 0) && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-3 flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-lime-400" /> Your Games
                  </p>
                  <div className="space-y-3">
                    {[...myGames.hosted, ...myGames.joined].map((g, i) => (
                      <GameCard key={g.id} game={g} userId={user?.id} onJoin={joinGame} onLeave={leaveGame} delay={i * 0.05} />
                    ))}
                  </div>
                </div>
              )}

              {/* Open Games — with filters */}
              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold flex items-center gap-2">
                    <Swords className="w-3 h-3 text-zinc-400" /> Open Games
                    {openGames.length > 0 && <span className="text-zinc-600 font-normal normal-case">· {openGames.length} available</span>}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <select value={filterSport} onChange={(e) => setFilterSport(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1 text-[11px] text-zinc-300">
                      <option value="all">All sports</option>
                      {Object.entries(SPORT_LABELS).map(([k, v]) => <option key={k} value={k}>{SPORT_EMOJI[k]} {v}</option>)}
                    </select>
                    <select value={filterWhen} onChange={(e) => setFilterWhen(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1 text-[11px] text-zinc-300">
                      <option value="all">Anytime</option>
                      <option value="today">Today</option>
                      <option value="tomorrow">Tomorrow</option>
                      <option value="week">This week</option>
                    </select>
                  </div>
                </div>

                {openGames.length === 0 ? (
                  <EmptyState
                    icon={<Swords className="w-10 h-10 text-zinc-600" strokeWidth={1.5} />}
                    title="No games match your filters"
                    body="Try a wider date range, or be the first to host one this week."
                    cta={
                      <Button onClick={() => setShowCreate(true)}
                        className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full mt-3">
                        <Plus className="w-4 h-4 mr-1" /> Host a Game
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {openGames.map((g, i) => (
                      <GameCard key={g.id} game={g} userId={user?.id} onJoin={joinGame} onLeave={leaveGame} delay={i * 0.05} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── FRIENDS TAB ── */}
          <TabsContent value="friends">
            <div className="space-y-4">
              {requests.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-3">
                    Pending Requests ({requests.length})
                  </p>
                  {requests.map((req, i) => (
                    <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="bg-zinc-900 border border-lime-400/20 rounded-xl p-4 mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-lime-400/10 flex items-center justify-center font-bold text-lime-400 uppercase">
                          {(req.from_name || "?").charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{req.from_name}</p>
                          <p className="text-xs text-zinc-500">{req.from_skill} &middot; {req.from_sports?.map(s => SPORT_LABELS[s] || s).join(", ")}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => respondRequest(req.id, "accept")}
                          className="bg-lime-400 text-black hover:bg-lime-500 rounded-full text-xs h-8 px-3">
                          <Check className="w-3 h-3 mr-1" /> Accept
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => respondRequest(req.id, "reject")}
                          className="text-zinc-500 hover:text-red-400 rounded-full text-xs h-8 px-3">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-3">
                  Friends ({friends.length})
                </p>
                {friends.length === 0 ? (
                  <EmptyState
                    icon={<Users className="w-10 h-10 text-zinc-600" strokeWidth={1.5} />}
                    title="No friends yet"
                    body="Add players from the Discover tab to grow your network."
                    cta={
                      <Button onClick={() => setActiveTab("discover")}
                        className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full mt-3">
                        <Search className="w-4 h-4 mr-1" /> Discover Players
                      </Button>
                    }
                  />
                ) : (
                  friends.map((f, i) => (
                    <motion.div key={f.user_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-3 flex items-center gap-3 hover:border-lime-400/30 transition-all">
                      <div className="w-10 h-10 rounded-full bg-lime-400/10 flex items-center justify-center font-bold text-lime-400 uppercase">
                        {(f.name || "?").charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{f.name}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">{f.skill_level}</Badge>
                          {f.selected_sports?.map(s => (
                            <Badge key={s} className={`text-[10px] ${SPORT_COLORS[s] || "bg-zinc-800 text-zinc-400"}`}>{SPORT_EMOJI[s]} {SPORT_LABELS[s]}</Badge>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── DISCOVER TAB ── */}
          <TabsContent value="discover">
            <div className="space-y-3">
              {players.length === 0 ? (
                <EmptyState
                  icon={<Search className="w-10 h-10 text-zinc-600" strokeWidth={1.5} />}
                  title="No other players found yet"
                  body="Share AthlyticAI with friends — every new signup grows the local community."
                />
              ) : (
                players.map((p, i) => (
                  <motion.div key={p.user_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3 hover:border-zinc-700 transition-all">
                    <div className="w-10 h-10 rounded-full bg-lime-400/10 flex items-center justify-center font-bold text-lime-400 uppercase">
                      {(p.name || "?").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{p.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">{p.skill_level}</Badge>
                        {p.play_style && <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">{p.play_style}</Badge>}
                        {p.selected_sports?.slice(0, 2).map(s => (
                          <Badge key={s} className={`text-[10px] ${SPORT_COLORS[s] || "bg-zinc-800 text-zinc-400"}`}>{SPORT_EMOJI[s]}</Badge>
                        ))}
                      </div>
                    </div>
                    {friendIds.has(p.user_id) ? (
                      <Badge className="bg-zinc-800 text-zinc-400 text-xs"><UserCheck className="w-3 h-3 mr-1" /> Friends</Badge>
                    ) : (
                      <Button size="sm" onClick={() => sendFriendRequest(p.user_id)}
                        disabled={sending[p.user_id]}
                        className="bg-lime-400/10 text-lime-400 hover:bg-lime-400/20 border border-lime-400/20 rounded-full text-xs h-8 px-3">
                        <UserPlus className="w-3 h-3 mr-1" /> Add
                      </Button>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function EmptyState({ icon, title, body, cta }) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="text-zinc-300 text-sm font-semibold mb-1">{title}</p>
      <p className="text-zinc-500 text-xs">{body}</p>
      {cta}
    </div>
  );
}

function GameCard({ game, userId, onJoin, onLeave, delay = 0 }) {
  const isHost = game.host_id === userId;
  const isJoined = game.players?.includes(userId);
  const isFull = game.spots_left <= 0;
  const playersIn = game.players?.length || 0;
  const spotsNeeded = Math.max(0, game.max_players - playersIn);
  const dayLabel = friendlyDate(game.date);
  const isUrgent = dayLabel === "Today" || dayLabel === "Tomorrow";

  const shareWhatsApp = () => {
    const text =
      `🏸 ${SPORT_LABELS[game.sport] || game.sport} game · ${game.title}\n` +
      `📍 ${game.venue}, ${game.city}\n` +
      `🗓 ${friendlyDate(game.date)} ${friendlyTime(game.time)}\n` +
      `${spotsNeeded > 0 ? `⚡ ${spotsNeeded} ${spotsNeeded === 1 ? "spot" : "spots"} left` : "Full"}\n\n` +
      `Join via AthlyticAI: ${window.location.origin}/community`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className={`relative rounded-2xl overflow-hidden border ${
        isHost ? "border-lime-400/40" : isJoined ? "border-sky-400/40" : "border-zinc-800"
      } hover:border-zinc-700 transition-colors`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${SPORT_GRADIENTS[game.sport] || "from-zinc-900 to-zinc-950"} opacity-40 pointer-events-none`} />
      <div className="relative bg-zinc-900/70 p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl shrink-0">
            {SPORT_EMOJI[game.sport] || "🎯"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-heading font-bold text-base text-white uppercase tracking-tight truncate">{game.title}</h3>
              {isHost && <Badge className="bg-lime-400/15 text-lime-400 border-lime-400/20 text-[10px]">You're hosting</Badge>}
              {isJoined && !isHost && <Badge className="bg-sky-400/15 text-sky-400 border-sky-400/20 text-[10px]">You're in</Badge>}
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
              <span className={`font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded ${
                isUrgent ? "bg-amber-400/15 text-amber-400" : "bg-zinc-800 text-zinc-300"
              }`}>{dayLabel}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {friendlyTime(game.time)}</span>
              <span className="text-zinc-600">·</span>
              <span>Hosted by {isHost ? "you" : game.host_name}</span>
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 text-xs text-zinc-400 mb-3">
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {game.venue}, {game.city}</span>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {playersIn}/{game.max_players}</span>
          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px] py-0">{game.skill_level}</Badge>
        </div>

        {/* Player slots */}
        <div className="flex gap-1 mb-3">
          {Array.from({ length: game.max_players }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${
              i < playersIn ? "bg-lime-400" : "bg-zinc-800"
            }`} />
          ))}
        </div>

        {game.notes && <p className="text-xs text-zinc-500 italic mb-3 leading-relaxed">{game.notes}</p>}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isJoined && !isFull && (
            <Button size="sm" onClick={() => onJoin(game.id)}
              className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-xs h-8 px-4">
              Join · {spotsNeeded} {spotsNeeded === 1 ? "spot" : "spots"} left
            </Button>
          )}
          {isHost && (
            <Button size="sm" variant="outline" onClick={() => onLeave(game.id)}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-full text-xs h-8 px-3">
              Cancel Game
            </Button>
          )}
          {isJoined && !isHost && (
            <Button size="sm" variant="outline" onClick={() => onLeave(game.id)}
              className="border-zinc-700 text-zinc-400 hover:text-red-400 rounded-full text-xs h-8 px-3">
              Leave
            </Button>
          )}
          {!isJoined && isFull && (
            <Badge className="bg-zinc-800 text-zinc-500 text-xs">Full</Badge>
          )}

          <button onClick={shareWhatsApp}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded-full hover:bg-zinc-800">
            <Share2 className="w-3 h-3" /> Share on WhatsApp
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function HostGameDialog({ open, onOpenChange, gameForm, setGameForm, onCreate, children }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-lime-400" /> Host a Game
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            Post your match — players nearby can request to join. Share the link on WhatsApp once it's up.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Sport</label>
              <select value={gameForm.sport} onChange={e => setGameForm(f => ({ ...f, sport: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white">
                {Object.entries(SPORT_LABELS).map(([k, v]) => <option key={k} value={k}>{SPORT_EMOJI[k]} {v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Skill Level</label>
              <select value={gameForm.skill_level} onChange={e => setGameForm(f => ({ ...f, skill_level: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white">
                {["All Levels", "Beginner", "Intermediate", "Advanced"].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Title *</label>
            <input placeholder="e.g. Friday evening doubles" value={gameForm.title}
              onChange={e => setGameForm(f => ({ ...f, title: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Venue *</label>
              <input placeholder="e.g. Smashers Arena" value={gameForm.venue}
                onChange={e => setGameForm(f => ({ ...f, venue: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">City *</label>
              <input placeholder="e.g. Bangalore" value={gameForm.city}
                onChange={e => setGameForm(f => ({ ...f, city: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Date *</label>
              <input type="date" value={gameForm.date}
                onChange={e => setGameForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:border-lime-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Time *</label>
              <input type="time" value={gameForm.time}
                onChange={e => setGameForm(f => ({ ...f, time: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:border-lime-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Players</label>
              <select value={gameForm.max_players} onChange={e => setGameForm(f => ({ ...f, max_players: parseInt(e.target.value) }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white">
                {[2, 3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Notes</label>
            <textarea rows={2} placeholder="Bring your own racket. Court fee ₹100 split." value={gameForm.notes}
              onChange={e => setGameForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none resize-none" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={onCreate} className="flex-1 bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full">
              <Plus className="w-4 h-4 mr-1.5" /> Post Game
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-zinc-400 hover:text-white rounded-full">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
