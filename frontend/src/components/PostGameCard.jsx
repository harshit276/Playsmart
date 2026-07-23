import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Star, Users } from "lucide-react";
import api from "@/lib/api";

/**
 * Post-game prompts: the host records who turned up, players rate the game.
 *
 * This is the whole reputation loop. Nothing here is derived from video —
 * attendance and peer ratings need other people who were physically present,
 * which is what makes them worth trusting (an uploaded clip proves nothing
 * about who you are). Turning up is also what pays tokens, so if the host
 * never marks anyone, no reputation and no rewards exist. Hence the prompt is
 * front-and-centre on a finished game rather than buried behind a menu, and a
 * push reminder goes out the same evening.
 */

/** A game is "done" once its end time has passed, in the viewer's local zone. */
export function isGameFinished(game) {
  try {
    const start = new Date(`${(game.date || "").slice(0, 10)}T${(game.time || "00:00").slice(0, 5)}`);
    if (isNaN(start.getTime())) return false;
    const end = new Date(start.getTime() + (game.duration_minutes || 60) * 60000);
    return Date.now() > end.getTime();
  } catch {
    return false;
  }
}

export function AttendanceCard({ game, currentUserId, onDone }) {
  const others = (game.players || []).filter((p) => p !== currentUserId);
  const [marks, setMarks] = useState({});   // user_id -> attended | no_show
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done || others.length === 0) return null;

  const nameFor = (id) => (game.player_names || {})[id] || `Player ${String(id).slice(0, 6)}`;

  const submit = async () => {
    const payload = Object.entries(marks).map(([user_id, status]) => ({ user_id, status }));
    if (payload.length === 0) { toast.error("Mark at least one player"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/games/${game.id}/attendance`, { marks: payload });
      setDone(true);
      toast.success(
        data.rewarded > 0
          ? `Thanks! ${data.rewarded} player${data.rewarded > 1 ? "s" : ""} earned tokens for turning up.`
          : "Attendance recorded — thanks!"
      );
      onDone?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save attendance");
    }
    setBusy(false);
  };

  return (
    <div className="bg-lime-400/5 border border-lime-400/30 rounded-xl p-4 mt-3">
      <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold mb-1 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" /> Who turned up?
      </p>
      <p className="text-[11px] text-zinc-400 mb-3">
        Players who showed up earn tokens for their next analysis.
      </p>
      <div className="space-y-2">
        {others.map((id) => (
          <div key={id} className="flex items-center gap-2">
            <span className="text-sm text-zinc-200 flex-1 min-w-0 truncate">{nameFor(id)}</span>
            <button
              type="button"
              onClick={() => setMarks((m) => ({ ...m, [id]: "attended" }))}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                marks[id] === "attended"
                  ? "bg-lime-400 text-black border-lime-400"
                  : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-white"
              }`}
            >
              <CheckCircle2 className="w-3 h-3" /> Came
            </button>
            <button
              type="button"
              onClick={() => setMarks((m) => ({ ...m, [id]: "no_show" }))}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                marks[id] === "no_show"
                  ? "bg-red-500 text-white border-red-500"
                  : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-white"
              }`}
            >
              <XCircle className="w-3 h-3" /> No-show
            </button>
          </div>
        ))}
      </div>
      <Button onClick={submit} disabled={busy} size="sm"
        className="w-full mt-3 bg-lime-400 text-black hover:bg-lime-500 font-bold">
        {busy ? "Saving…" : "Save attendance"}
      </Button>
    </div>
  );
}

export function RateGameCard({ game, currentUserId, onDone }) {
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const hostId = game.host_id;
  if (done || !hostId || hostId === currentUserId) return null;

  const submit = async (value) => {
    setBusy(true);
    try {
      await api.post(`/games/${game.id}/rate`, { rating: value, ratee_id: hostId });
      setDone(true);
      toast.success("Thanks for the feedback!");
      onDone?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save your rating");
    }
    setBusy(false);
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 mt-3">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-2">
        How was this game?
      </p>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy}
            onMouseEnter={() => setRating(n)}
            onFocus={() => setRating(n)}
            onClick={() => submit(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="p-1"
          >
            <Star className={`w-6 h-6 transition-colors ${
              n <= rating ? "text-amber-400 fill-amber-400" : "text-zinc-600"
            }`} />
          </button>
        ))}
        <span className="text-[11px] text-zinc-600 ml-2">Rates the host</span>
      </div>
    </div>
  );
}

/** Turn-up record shown next to a player. Hidden until it means something. */
export function ReliabilityBadge({ reputation }) {
  if (!reputation || reputation.reliability_pct == null) return null;
  const pct = reputation.reliability_pct;
  const tone = pct >= 90 ? "bg-lime-400/10 text-lime-300 border-lime-400/30"
    : pct >= 70 ? "bg-amber-400/10 text-amber-300 border-amber-400/30"
    : "bg-red-400/10 text-red-300 border-red-400/30";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${tone}`}
      title={`${reputation.attended} of ${reputation.games_recorded} games attended`}>
      {pct}% turn-up
      {reputation.avg_rating ? <span className="text-zinc-400">· ★ {reputation.avg_rating}</span> : null}
    </span>
  );
}
