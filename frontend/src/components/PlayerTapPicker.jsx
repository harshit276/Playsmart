import { useRef, useState } from "react";
import { Hand, Check, X } from "lucide-react";

/**
 * PlayerTapPicker — "which one are you?" for clips with several people.
 *
 * Shows the frame at the moment of contact; the player taps themselves and
 * confirms. The parent turns the tap into that person's box (see
 * poseOverlay.findPlayerBoxAt), and the posture check and the 3D ghost
 * both follow that person instead of guessing.
 *
 * Props:
 *   frameUrl  — JPEG data URL of the contact frame (null while grabbing it)
 *   peopleHint — optional number of people seen, for the copy
 *   busy      — true while the parent looks for the tapped person
 *   error     — optional message (e.g. nobody found at the tap)
 *   onConfirm({x, y}) — tap position in 0-1 frame coordinates
 *   onCancel()
 *   onRetry() — optional: shown next to an error when there is no frame
 */
export default function PlayerTapPicker({ frameUrl, peopleHint = null, busy = false, error = null, onConfirm, onCancel, onRetry = null }) {
  const imgRef = useRef(null);
  const [tap, setTap] = useState(null);

  const onTap = (e) => {
    const img = imgRef.current;
    if (!img || busy) return;
    const r = img.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setTap({ x, y });
  };

  return (
    <div className="rounded-2xl border border-sky-400/40 bg-zinc-900/80 p-3 sm:p-4">
      <div className="flex items-start gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-sky-400/15 border border-sky-400/40 flex items-center justify-center shrink-0">
          <Hand className="w-4 h-4 text-sky-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Tap yourself</p>
          <p className="text-[12px] text-zinc-400 leading-snug">
            {peopleHint > 1 ? `${peopleHint} people are in this shot, so we won't guess. ` : ""}
            We'll follow the player you tap for the posture check and the 3D fix.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="relative rounded-xl overflow-hidden bg-zinc-800 select-none">
        {frameUrl ? (
          <>
            <img
              ref={imgRef}
              src={frameUrl}
              alt="The moment of contact — tap yourself"
              draggable={false}
              onClick={onTap}
              className="block w-full h-auto cursor-crosshair"
            />
            {tap && (
              <span
                className="absolute w-9 h-9 pointer-events-none -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }}
              >
                <span className="absolute inset-0 rounded-full border-2 border-lime-300 animate-ping" />
                <span className="absolute inset-0 rounded-full border-[3px] border-lime-300 bg-lime-300/20 shadow-[0_0_0_2px_rgba(0,0,0,0.6)]" />
              </span>
            )}
            {!tap && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-sm rounded-full px-3 py-1 pointer-events-none">
                <p className="text-[11px] font-semibold text-white">Tap on your body</p>
              </div>
            )}
          </>
        ) : error ? (
          <div className="aspect-video flex flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-[12px] text-zinc-300">We couldn't show that moment on this browser.</p>
            {onRetry && (
              <button type="button" onClick={onRetry} className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-sky-400 text-black hover:bg-sky-300">
                Try again
              </button>
            )}
          </div>
        ) : (
          <div className="aspect-video flex items-center justify-center gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
            <p className="text-[12px] text-zinc-300">Grabbing the moment of contact…</p>
          </div>
        )}
      </div>

      {error && frameUrl && <p className="text-[12px] text-amber-300 mt-2">{error}</p>}

      <div className="flex items-center justify-end gap-2 mt-3">
        {tap && !busy && (
          <button
            type="button"
            onClick={() => setTap(null)}
            className="px-3 py-2 rounded-lg text-[12px] font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800"
          >
            Tap again
          </button>
        )}
        <button
          type="button"
          disabled={!tap || busy}
          onClick={() => tap && onConfirm?.(tap)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold bg-lime-400 text-black disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-black/30 border-t-black animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          {busy ? "Finding you…" : "That's me"}
        </button>
      </div>
    </div>
  );
}
