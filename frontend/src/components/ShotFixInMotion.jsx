import { lazy, Suspense, useMemo, useState } from "react";
import { Play } from "lucide-react";
import PlayerTapPicker from "@/components/PlayerTapPicker";
import { captureFrameAt } from "@/lib/captureFrame";
import { imageIfReal } from "@/lib/frameSource";
import { formatClock } from "@/lib/seekMainVideo";
import { isPostureSupported } from "@/ai/posturePolicy";

// Lazy: MediaPipe's model + WASM only download when someone taps.
const GhostPlayback = lazy(() => import("@/components/GhostPlayback"));

/**
 * ShotFixInMotion — "Watch the fix in motion" for one shot card: the 3D
 * corrected-arm ghost over the player's own clip, built on demand for that
 * shot (each build takes a few seconds on a phone, so never all at once).
 *
 * Grouped cards pass every rep; the player picks which one to watch. When a
 * rep has several people and no box from the coach, the ghost asks the player
 * to tap themselves on that rep's frame and remembers it for that rep.
 *
 * Needs the clip itself, so it renders nothing when the video isn't loaded
 * (an analysis reopened from History) or the sport isn't posture-supported.
 */
export default function ShotFixInMotion({ videoFile, sport, reps, shotName = null }) {
  const timed = useMemo(
    () => (reps || [])
      .filter((r) => typeof r?.timestamp === "number" && Number.isFinite(r.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp),
    [reps],
  );
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(null); // { frameUrl, busy, error }
  const [picks, setPicks] = useState({}); // timestamp -> { box, tap }

  if (!videoFile || !timed.length || !isPostureSupported(sport)) return null;

  const rep = timed[Math.min(idx, timed.length - 1)];
  const pick = picks[rep.timestamp] || null;
  // Their own tap beats the coach's box; a tap with no box still steers the ghost.
  const box = pick ? pick.box : (rep.contactBox || null);
  const tap = pick?.tap || null;

  const openPicker = async () => {
    setOpen(false);
    setPicker({ frameUrl: null, busy: false, error: null });
    const url = (await captureFrameAt(videoFile, Math.max(0.05, rep.timestamp), 960, null))
      || (await imageIfReal(rep.thumbnail));
    setPicker((p) => (p ? { ...p, frameUrl: url, error: url ? null : "We couldn't grab a frame from this clip." } : p));
  };

  const confirmPick = async (t) => {
    const frameUrl = picker?.frameUrl;
    if (!frameUrl) return;
    setPicker((p) => (p ? { ...p, busy: true, error: null } : p));
    let b = null;
    try {
      const mod = await import("@/ai/poseOverlay");
      b = await mod.findPlayerBoxAt(frameUrl, t.x, t.y);
    } catch {
      // No box: the tap alone still steers the ghost.
    }
    setPicks((prev) => ({ ...prev, [rep.timestamp]: { box: b, tap: t } }));
    setPicker(null);
    setOpen(true);
  };

  const label = `${shotName || rep.name || "this shot"}${timed.length > 1 ? ` · rep ${idx + 1}` : ""} · ${formatClock(rep.timestamp)}`;

  return (
    <div className="pt-2 border-t border-zinc-800/60 space-y-2" onClick={(e) => e.stopPropagation()}>
      {timed.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mr-1">Rep</span>
          {timed.slice(0, 12).map((r, i) => (
            <button
              key={r.timestamp}
              type="button"
              onClick={() => { setIdx(i); setOpen(false); setPicker(null); }}
              aria-pressed={i === idx}
              className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
                i === idx ? "bg-lime-400 text-black border-lime-400" : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500"
              }`}
            >
              {formatClock(r.timestamp)}
            </button>
          ))}
        </div>
      )}

      {picker ? (
        <PlayerTapPicker
          frameUrl={picker.frameUrl}
          busy={picker.busy}
          error={picker.error}
          onConfirm={confirmPick}
          onCancel={() => setPicker(null)}
          onRetry={openPicker}
        />
      ) : open ? (
        <Suspense fallback={<div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 text-sm text-zinc-400">Loading…</div>}>
          <GhostPlayback
            key={`${rep.timestamp}`}
            videoFile={videoFile}
            contactSec={rep.timestamp}
            sport={sport}
            shotType={rep.category || rep.type || rep.label}
            contactBox={box}
            tapPoint={tap}
            shotLabel={label}
            onRepick={openPicker}
          />
        </Suspense>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-lime-400/40 bg-lime-400/5 hover:bg-lime-400/10 px-3 py-2.5 text-left transition-colors"
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-white">Watch the fix in motion</span>
            <span className="block text-[11px] text-zinc-400">{label} · your clip, slowed down, with the corrected arm</span>
          </span>
          <Play className="w-4 h-4 text-lime-300 fill-current shrink-0" />
        </button>
      )}
      {open && pick && (
        <button type="button" onClick={openPicker} className="text-[11px] font-semibold text-sky-300 hover:text-sky-200">
          Following the player you tapped · Change
        </button>
      )}
    </div>
  );
}
