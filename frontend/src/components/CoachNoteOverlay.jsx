import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Volume2 } from "lucide-react";

// Floating "Coach says: ..." note that surfaces over the video when a
// shot becomes active (via Jump-to-best / Jump-to-worst / timeline
// marker / card click). Pulls the corresponding coaching tip from the
// `shots` array we already have — no new API call.
//
// Why this exists:
//   The page already auto-seeks the video when you tap a marker, but
//   the user has to scroll down to the per-shot card to actually read
//   what the coach is pointing at. That breaks the emotional flow of
//   "watching the replay together". This overlay puts the one-line
//   correction right next to the moment it applies to.
//
// Design notes:
//   - Auto-dismisses after ~5.5s so it doesn't permanently cover the video.
//   - Triggered only on user-initiated jumps (source !== "video"),
//     not on natural playback — otherwise the overlay flashes on every
//     timeupdate-detected shot pass, which is noisy.

function _pickTip(shot) {
  if (!shot) return "";
  const ff = shot.formFeedback || shot.form_feedback || {};
  if (ff.tip && typeof ff.tip === "string") return ff.tip.trim();
  if (Array.isArray(ff.weaknesses) && ff.weaknesses[0]) return String(ff.weaknesses[0]).trim();
  if (Array.isArray(ff.strengths) && ff.strengths[0]) return `Nice — ${String(ff.strengths[0]).trim()}`;
  if (shot.reasoning && typeof shot.reasoning === "string" && shot.reasoning.length < 160) {
    return shot.reasoning.trim();
  }
  return "";
}

function _speak(text) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  if (!text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
  } catch {}
}

export default function CoachNoteOverlay({ shots = [] }) {
  const [activeId, setActiveId] = useState(null);
  // Tick increments each time a "show me again" event fires so we can
  // restart the auto-dismiss timer when the same shot is re-triggered.
  const [tick, setTick] = useState(0);

  // Indexed view of shots so we can look one up by _id (same key the
  // VideoTimelineSection uses for active-shot events).
  const indexedShots = useMemo(
    () => (shots || []).map((s, i) => ({ ...s, _id: typeof s._id === "number" ? s._id : i })),
    [shots],
  );

  useEffect(() => {
    const onActive = (e) => {
      const d = e?.detail || {};
      // Only react to USER-initiated jumps. The video-playback-driven
      // active-shot fires every time the playhead crosses a shot's
      // contact window — that's already enough visual feedback via the
      // card pulse, and would otherwise spam this overlay.
      if (!d.source || d.source === "video") return;
      if (typeof d.id !== "number") return;
      setActiveId(d.id);
      setTick((t) => t + 1);
    };
    window.addEventListener("playsmart:active-shot", onActive);
    return () => window.removeEventListener("playsmart:active-shot", onActive);
  }, []);

  // Auto-dismiss after ~5.5s. Restarts whenever `tick` changes.
  useEffect(() => {
    if (activeId == null) return undefined;
    const t = setTimeout(() => setActiveId(null), 5500);
    return () => clearTimeout(t);
  }, [activeId, tick]);

  const shot = activeId == null ? null : indexedShots.find((s) => s._id === activeId);
  const tip = _pickTip(shot);
  const visible = activeId != null && !!tip;
  const shotName = (shot?.name || shot?.label || shot?.type || "shot")
    .toString()
    .replace(/_/g, " ");
  const ts = typeof shot?.timestamp === "number" ? shot.timestamp.toFixed(1) : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`note-${activeId}-${tick}`}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22 }}
          className="absolute left-2 right-2 top-2 z-30 flex justify-center pointer-events-none"
        >
          <div className="pointer-events-auto max-w-[92%] bg-zinc-950/92 backdrop-blur-md border border-lime-400/40 rounded-xl shadow-xl shadow-black/40 px-3 py-2 flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-lime-400/20 border border-lime-400/40 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-lime-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold leading-tight flex items-center gap-1.5 flex-wrap">
                Coach says
                <span className="text-zinc-500 normal-case tracking-normal font-normal">
                  · {shotName}{ts ? ` · ${ts}s` : ""}
                </span>
              </p>
              <p className="text-[12px] text-zinc-100 leading-snug mt-0.5 line-clamp-3">{tip}</p>
            </div>
            <button
              type="button"
              onClick={() => _speak(tip)}
              aria-label="Hear this tip"
              title="Hear this tip"
              className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 hover:bg-lime-400/15 text-lime-300 border border-zinc-700 hover:border-lime-400/40 transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
