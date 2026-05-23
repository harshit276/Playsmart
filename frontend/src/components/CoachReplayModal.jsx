import { X, Activity, Info } from "lucide-react";
import FormCoachReplay from "@/components/FormCoachReplay";

// Wraps FormCoachReplay in a modal so it can be triggered from any shot
// card. Honest about its requirements:
//   - We need the original videoFile (we stash it on window.__playsmartCurrentVideo
//     so deeply-nested cards can pick it up — see MatchInsights).
//   - We need a timestamp on the shot for the contact frame.
// If either is missing we render an honest "Not available" panel rather
// than a broken canvas.

export default function CoachReplayModal({
  open,
  onClose,
  videoFile,
  timestamp,
  sport,
  shotType,
  shotName,
  topFix,
}) {
  if (!open) return null;

  const hasInputs = !!videoFile
    && typeof timestamp === "number"
    && Number.isFinite(timestamp);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 max-w-3xl w-full max-h-[92vh] overflow-auto"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold flex items-center gap-1">
              <Activity className="w-3 h-3" /> Coach replay
            </p>
            <h3 className="font-heading font-bold text-lg text-white capitalize">
              {shotName || (shotType || "shot").replace(/_/g, " ")} — your form vs ideal at contact
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close coach replay"
            className="text-zinc-500 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {hasInputs ? (
          <div className="space-y-3">
            <div className="aspect-video rounded-xl overflow-hidden bg-black">
              <FormCoachReplay
                videoFile={videoFile}
                timestamp={timestamp}
                sport={sport}
                shotType={shotType}
                className="w-full h-full"
              />
            </div>
            {topFix && (
              <div className="bg-amber-400/8 border border-amber-400/30 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
                  Coach's correction
                </p>
                <p className="text-sm text-white leading-snug">{topFix}</p>
              </div>
            )}
            <div className="bg-zinc-800/40 border border-zinc-800 rounded-lg p-3 flex gap-2">
              <Info className="w-4 h-4 text-sky-300 shrink-0 mt-[2px]" />
              <p className="text-[11px] text-zinc-400 leading-snug">
                The green ghost shows where your joints <em className="text-zinc-200 not-italic font-medium">should</em> be at the contact moment — computed from <em>your</em> bone lengths plus this shot's ideal angles, so it looks like you with corrected form. No generic-pro silhouette stand-in.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-zinc-800/40 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
            <p className="text-sm text-zinc-300 font-medium">
              Coach replay isn't available for this view.
            </p>
            <p className="text-[11px] text-zinc-500 leading-snug">
              {videoFile
                ? "This shot doesn't have a usable contact timestamp."
                : "We don't have the original video file in this session — open this analysis from a fresh upload to use coach replay."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
