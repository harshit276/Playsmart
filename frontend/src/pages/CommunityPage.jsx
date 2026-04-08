import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Users, UserPlus, UserCheck, Calendar, MapPin, Clock, Trophy,
  Search, Plus, ChevronRight, Swords, X, Check, Bell
} from "lucide-react";
import api from "@/lib/api";

const SPORT_LABELS = {
  badminton: "Badminton", table_tennis: "Table Tennis", tennis: "Tennis", pickleball: "Pickleball",
};
const SPORT_COLORS = {
  badminton: "bg-lime-400/10 text-lime-400 border-lime-400/20",
  table_tennis: "bg-sky-400/10 text-sky-400 border-sky-400/20",
  tennis: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  pickleball: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
};

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

  // Game form
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

  const loadData = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const results = await Promise.allSettled([
      api.get("/community/players"),
      api.get("/friends"),
      api.get("/friends/requests"),
      api.get("/games"),
      api.get("/games/my"),
    ]);
    if (results[0].status === "fulfilled") setPlayers(results[0].value.data.players || []);
    if (results[1].status === "fulfilled") setFriends(results[1].value.data.friends || []);
    if (results[2].status === "fulfilled") setRequests(results[2].value.data.received || []);
    if (results[3].status === "fulfilled") setGames(results[3].value.data.games || []);
    if (results[4].status === "fulfilled") setMyGames(results[4].value.data || { hosted: [], joined: [] });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const sendFriendRequest = async (toUserId) => {
    setSending(p => ({ ...p, [toUserId]: true }));
    try {
      const { data } = await api.post("/friends/request", { to_user_id: toUserId });
      toast.success(data.message);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
    setSending(p => ({ ...p, [toUserId]: false }));
  };

  const respondRequest = async (requestId, action) => {
    try {
      const { data } = await api.post("/friends/respond", { request_id: requestId, action });
      toast.success(data.message);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const createGame = async () => {
    if (!gameForm.title || !gameForm.venue || !gameForm.city || !gameForm.date) {
      toast.error("Fill in all required fields");
      return;
    }
    try {
      const { data } = await api.post("/games", gameForm);
      toast.success(data.message);
      setShowCreate(false);
      setGameForm(f => ({ ...f, title: "", venue: "", notes: "" }));
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create game");
    }
  };

  const joinGame = async (gameId) => {
    try {
      const { data } = await api.post("/games/join", { game_id: gameId });
      toast.success(data.message);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to join");
    }
  };

  const leaveGame = async (gameId) => {
    try {
      const { data } = await api.post(`/games/${gameId}/leave`);
      toast.success(data.message);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const friendIds = new Set(friends.map(f => f.user_id));

  // Set page title
  useEffect(() => {
    document.title = "Community | AthlyticAI";
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="community-page">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="h-10 bg-zinc-800 rounded-xl animate-pulse w-48 mb-2" />
        <div className="h-4 bg-zinc-800/60 rounded animate-pulse w-72 mb-6" />
        <div className="h-10 bg-zinc-800 rounded-xl animate-pulse w-full mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="community-page">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="font-heading font-bold text-3xl md:text-5xl uppercase tracking-tight text-white mb-2">
            Community
          </h1>
          <p className="text-zinc-400">Find players, make friends, and host games.</p>
        </motion.div>

        {/* Friend request badge */}
        {requests.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-4 bg-lime-400/5 border border-lime-400/20 rounded-xl p-3 flex items-center gap-3 cursor-pointer"
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
            <div className="space-y-4">
              {/* Create Game Button */}
              <Button onClick={() => setShowCreate(!showCreate)}
                className="w-full bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full h-11">
                <Plus className="w-4 h-4 mr-2" /> Host a Game
              </Button>

              {/* Create Game Form */}
              {showCreate && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                  <h3 className="font-heading font-bold text-lg text-white uppercase tracking-tight">Create Game</h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Sport *</label>
                      <select value={gameForm.sport} onChange={e => setGameForm(f => ({ ...f, sport: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white">
                        {Object.entries(SPORT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Skill Level</label>
                      <select value={gameForm.skill_level} onChange={e => setGameForm(f => ({ ...f, skill_level: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white">
                        {["All Levels", "Beginner", "Intermediate", "Advanced"].map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>

                  <input placeholder="Game Title *" value={gameForm.title}
                    onChange={e => setGameForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white placeholder-zinc-600" />

                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Venue *" value={gameForm.venue}
                      onChange={e => setGameForm(f => ({ ...f, venue: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white placeholder-zinc-600" />
                    <input placeholder="City *" value={gameForm.city}
                      onChange={e => setGameForm(f => ({ ...f, city: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white placeholder-zinc-600" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Date *</label>
                      <input type="date" value={gameForm.date}
                        onChange={e => setGameForm(f => ({ ...f, date: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Time *</label>
                      <input type="time" value={gameForm.time}
                        onChange={e => setGameForm(f => ({ ...f, time: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Players</label>
                      <select value={gameForm.max_players} onChange={e => setGameForm(f => ({ ...f, max_players: parseInt(e.target.value) }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white">
                        {[2, 3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>

                  <input placeholder="Notes (optional)" value={gameForm.notes}
                    onChange={e => setGameForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white placeholder-zinc-600" />

                  <div className="flex gap-2">
                    <Button onClick={createGame} className="flex-1 bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full">
                      Create Game
                    </Button>
                    <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-zinc-500 rounded-full">
                      Cancel
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* My Games */}
              {(myGames.hosted.length > 0 || myGames.joined.length > 0) && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">My Games</p>
                  {[...myGames.hosted, ...myGames.joined].map((g, i) => (
                    <GameCard key={g.id} game={g} userId={user?.id} onJoin={joinGame} onLeave={leaveGame} delay={i * 0.05} />
                  ))}
                </div>
              )}

              {/* Open Games */}
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">Open Games</p>
                {games.filter(g => !g.players?.includes(user?.id)).length === 0 ? (
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
                    <Swords className="w-10 h-10 text-zinc-600 mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-zinc-400 text-sm font-medium mb-1">No open games yet</p>
                    <p className="text-zinc-600 text-xs">Be the first to host a game and find players nearby.</p>
                  </div>
                ) : (
                  games.filter(g => !g.players?.includes(user?.id)).map((g, i) => (
                    <GameCard key={g.id} game={g} userId={user?.id} onJoin={joinGame} onLeave={leaveGame} delay={i * 0.05} />
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── FRIENDS TAB ── */}
          <TabsContent value="friends">
            <div className="space-y-4">
              {/* Pending Requests */}
              {requests.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">
                    Pending Requests ({requests.length})
                  </p>
                  {requests.map((req, i) => (
                    <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="bg-zinc-900 border border-lime-400/20 rounded-xl p-4 mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-lime-400/10 flex items-center justify-center">
                          <UserPlus className="w-4 h-4 text-lime-400" />
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

              {/* Friend List */}
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">
                  Friends ({friends.length})
                </p>
                {friends.length === 0 ? (
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
                    <Users className="w-10 h-10 text-zinc-600 mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-zinc-400 text-sm font-medium mb-1">No friends yet</p>
                    <p className="text-zinc-600 text-xs">Head to the Discover tab to find players and send requests.</p>
                  </div>
                ) : (
                  friends.map((f, i) => (
                    <motion.div key={f.user_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-3 flex items-center gap-3 hover:border-lime-400/30 transition-all">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                        <UserCheck className="w-4 h-4 text-lime-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{f.name}</p>
                        <div className="flex gap-1 mt-1">
                          <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">{f.skill_level}</Badge>
                          {f.selected_sports?.map(s => (
                            <Badge key={s} className={`text-[10px] ${SPORT_COLORS[s] || "bg-zinc-800 text-zinc-400"}`}>{SPORT_LABELS[s]}</Badge>
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
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
                  <Search className="w-10 h-10 text-zinc-600 mx-auto mb-3" strokeWidth={1.5} />
                  <p className="text-zinc-400 text-sm font-medium mb-1">No other players found yet</p>
                  <p className="text-zinc-600 text-xs">Share AthlyticAI with friends to grow the community.</p>
                </div>
              ) : (
                players.map((p, i) => (
                  <motion.div key={p.user_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3 hover:border-zinc-700 transition-all">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Trophy className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{p.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">{p.skill_level}</Badge>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">{p.play_style}</Badge>
                        {p.selected_sports?.map(s => (
                          <Badge key={s} className={`text-[10px] ${SPORT_COLORS[s] || "bg-zinc-800 text-zinc-400"}`}>{SPORT_LABELS[s]}</Badge>
                        ))}
                      </div>
                    </div>
                    {friendIds.has(p.user_id) ? (
                      <Badge className="bg-zinc-800 text-zinc-400 text-xs">Friends</Badge>
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

function GameCard({ game, userId, onJoin, onLeave, delay = 0 }) {
  const isHost = game.host_id === userId;
  const isJoined = game.players?.includes(userId);
  const isFull = game.spots_left <= 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className={`bg-zinc-900 border rounded-xl p-4 mb-3 ${
        isHost ? "border-lime-400/30" : isJoined ? "border-sky-400/30" : "border-zinc-800"
      }`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-heading font-bold text-base text-white uppercase tracking-tight">{game.title}</h3>
            <Badge className={`text-[10px] ${SPORT_COLORS[game.sport] || "bg-zinc-800 text-zinc-400"}`}>
              {SPORT_LABELS[game.sport] || game.sport}
            </Badge>
          </div>
          <p className="text-xs text-zinc-500">Hosted by {isHost ? "you" : game.host_name}</p>
        </div>
        <div className="text-right">
          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{game.skill_level}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-zinc-400 mb-3">
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {game.venue}, {game.city}</span>
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {game.date}</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {game.time} ({game.duration_minutes}min)</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {game.players?.length || 0}/{game.max_players}</span>
      </div>

      {/* Player slots */}
      <div className="flex gap-1 mb-3">
        {Array.from({ length: game.max_players }).map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${
            i < (game.players?.length || 0) ? "bg-lime-400" : "bg-zinc-800"
          }`} />
        ))}
      </div>

      {game.notes && <p className="text-xs text-zinc-500 italic mb-3">{game.notes}</p>}

      {/* Actions */}
      <div className="flex gap-2">
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
        {!isJoined && !isFull && (
          <Button size="sm" onClick={() => onJoin(game.id)}
            className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-xs h-8 px-4">
            Join Game
          </Button>
        )}
        {!isJoined && isFull && (
          <Badge className="bg-zinc-800 text-zinc-500 text-xs">Full</Badge>
        )}
      </div>
    </motion.div>
  );
}
