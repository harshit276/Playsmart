import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { X, Users, CheckCircle2, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Modal shown when a video contains multiple people. Displays a sample frame
 * with bounding boxes around each detected person; the user taps one to pick
 * who to analyze. The selected box (normalized 0-1) is passed to onSelect.
 *
 * Props:
 *   isOpen:       boolean
 *   scanResult:   { frames: [{ imageDataUrl, people: [{box, score}], timestamp }], videoWidth, videoHeight }
 *   onSelect:     (box|null, idx) => void   // box=null means "analyze whole video"
 *   onSelectAll:  (boxes[]) => void          // run analysis once per detected player
 *   allowAnalyzeAll: boolean (default false) // show the "Analyze All Players" CTA
 *   detectedSport:           string|null    // VLM-detected sport (e.g. "table_tennis")
 *   detectedSportConfidence: number|null    // 0-1
 *   onSportOverride:         (sport) => void  // user picks a different sport
 *   onClose:      () => void
 */
const SPORT_LABELS = {
  badminton: { label: "Badminton", icon: "🏸" },
  tennis: { label: "Tennis", icon: "🎾" },
  table_tennis: { label: "Table Tennis", icon: "🏓" },
  pickleball: { label: "Pickleball", icon: "⚡" },
  cricket: { label: "Cricket", icon: "🏏" },
};

export default function PlayerSelectionModal({
  isOpen, scanResult, onSelect, onSelectAll, allowAnalyzeAll = false,
  detectedSport, detectedSportConfidence, onSportOverride, onClose,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [sportOverrideOpen, setSportOverrideOpen] = useState(false);
  const sportInfo = (detectedSport && SPORT_LABELS[detectedSport]) || null;

  // Pick the BEST frame: maximize (people_count × avg_confidence).
  // Earlier we picked purely by people count, which sometimes selected a
  // frame with a wide-shot player + a low-confidence detection of a
  // ref/spectator. Weighting by confidence picks the cleanest frame.
  const bestFrameIdx = useMemo(() => {
    if (!scanResult?.frames?.length) return 0;
    let best = 0, bestScore = -1;
    for (let i = 0; i < scanResult.frames.length; i++) {
      const ppl = scanResult.frames[i].people || [];
      if (ppl.length === 0) continue;
      const avgConf = ppl.reduce((a, p) => a + (p.score || 0), 0) / ppl.length;
      const score = ppl.length + avgConf;  // weight conf as tiebreaker
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }, [scanResult]);

  if (!isOpen || !scanResult || !scanResult.frames?.length) return null;

  // Always use the best frame — no user-controllable frame switcher,
  // which led to selecting the same player from different frames and
  // getting different downstream analysis results.
  const activeFrameIdx = bestFrameIdx;
  const frame = scanResult.frames[activeFrameIdx];
  // Max player count across ALL frames for the title
  const maxPlayers = Math.max(0, ...scanResult.frames.map((f) => (f.people || []).length));
  const isSinglePlayer = maxPlayers === 1;
  const noPlayers = maxPlayers === 0;

  // Quality signals for "video unclear" warning
  const peopleCounts = scanResult.frames.map((f) => (f.people || []).length);
  const allMaxConfidences = scanResult.frames.flatMap((f) => (f.people || []).map((p) => p.score || 0));
  const maxConfidence = allMaxConfidences.length ? Math.max(...allMaxConfidences) : 0;
  const minPpl = Math.min(...peopleCounts);
  const maxPpl = Math.max(...peopleCounts);
  const countsInconsistent = maxPpl - minPpl >= 2;  // e.g., 3 vs 1 detection across frames
  const videoUnclear = maxConfidence < 0.40 || (countsInconsistent && maxConfidence < 0.65);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-2xl w-full max-h-[90vh] overflow-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {isSinglePlayer ? (
                <CheckCircle2 className="w-5 h-5 text-lime-400" />
              ) : noPlayers ? (
                <User className="w-5 h-5 text-amber-400" />
              ) : (
                <Users className="w-5 h-5 text-lime-400" />
              )}
              <h3 className="font-heading font-bold text-lg text-white">
                {noPlayers
                  ? "No Player Detected"
                  : isSinglePlayer
                    ? "1 Player Detected"
                    : `${maxPlayers} Players Detected`}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-zinc-400 mb-4">
            {noPlayers
              ? "We couldn't detect a player in this video. You can still try analyzing the whole video."
              : isSinglePlayer
                ? "We've detected the player in the video. Click 'Analyze This Player' to continue."
                : "Tap the player you want to analyze. We'll focus the video on them for best results."}
          </p>

          {/* Detected sport — surfaces what the VLM thinks this video is so
              the user can correct before the heavy analysis runs. */}
          {sportInfo && (
            <div className="mb-4 bg-sky-400/5 border border-sky-400/30 rounded-lg px-3 py-2 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-lg">{sportInfo.icon}</span>
                <div>
                  <span className="text-zinc-200">Detected sport: </span>
                  <span className="font-semibold text-sky-300">{sportInfo.label}</span>
                  {detectedSportConfidence != null && (
                    <span className="text-[10px] text-zinc-500 ml-2">{Math.round(detectedSportConfidence * 100)}% sure</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSportOverrideOpen((v) => !v)}
                className="text-xs text-sky-400 hover:text-sky-300 underline"
              >
                {sportOverrideOpen ? "Cancel" : "Wrong? Change it"}
              </button>
              {sportOverrideOpen && (
                <div className="w-full flex flex-wrap gap-1.5 mt-1">
                  {Object.entries(SPORT_LABELS).map(([key, info]) => (
                    <button
                      key={key}
                      onClick={() => { onSportOverride?.(key); setSportOverrideOpen(false); }}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        detectedSport === key
                          ? "border-sky-400 bg-sky-400/15 text-sky-300"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      {info.icon} {info.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Frame with overlays */}
          <div className="relative w-full bg-black rounded-xl overflow-hidden mb-4">
            <img
              src={frame.imageDataUrl}
              alt="Video frame"
              className="w-full h-auto block"
            />

            {/* Bounding boxes overlay */}
            <div className="absolute inset-0">
              {frame.people.map((person, idx) => {
                const box = person.box;
                const isHovered = hoveredIdx === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => onSelect(box, idx)}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className={`absolute border-2 rounded transition-all ${
                      isHovered || isSinglePlayer
                        ? "border-lime-400 bg-lime-400/20 shadow-lg shadow-lime-400/50"
                        : "border-lime-400/60 bg-lime-400/10 hover:border-lime-400"
                    }`}
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                    }}
                    aria-label={`Select player ${idx + 1}`}
                  >
                    <div className="absolute -top-6 left-0 bg-lime-400 text-black text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap flex items-center gap-1">
                      <span>Player {idx + 1}</span>
                      {person.score != null && (
                        <span className={`px-1 rounded text-[9px] ${
                          person.score >= 0.7 ? "bg-black/30 text-black"
                          : person.score >= 0.4 ? "bg-amber-900/40 text-amber-200"
                          : "bg-red-900/50 text-red-200"
                        }`}>{Math.round(person.score * 100)}%</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* "Video unclear" warning — when detection confidence is poor or
              detected player counts vary wildly across the sample frames. */}
          {videoUnclear && (
            <div className="mb-4 bg-amber-400/5 border border-amber-400/30 rounded-lg px-3 py-2 text-[11px] text-amber-200">
              <p className="font-semibold mb-1">⚠ Video quality may be limiting analysis</p>
              <p className="text-zinc-300">
                Detection confidence is low {maxConfidence > 0 ? `(max ${Math.round(maxConfidence * 100)}%)` : ""}.
                For best results, upload a clearer side-angle clip where the player is fully visible and the camera doesn't shake.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
            {isSinglePlayer ? (
              <>
                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="text-zinc-400 hover:text-white text-xs sm:order-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => onSelect(frame.people[0].box, 0)}
                  className="bg-lime-400 text-black hover:bg-lime-500 font-bold sm:order-2 flex-1 sm:flex-initial"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Analyze This Player
                </Button>
              </>
            ) : noPlayers ? (
              <>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => onSelect(null, -1)}
                  className="bg-lime-400 text-black hover:bg-lime-500 font-bold"
                >
                  Analyze Whole Video
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => onSelect(null, -1)}
                  className="text-zinc-400 hover:text-white text-xs"
                >
                  Skip — Analyze Whole Video
                </Button>
                {allowAnalyzeAll && onSelectAll && frame.people.length >= 2 && (
                  <Button
                    onClick={() => onSelectAll(frame.people.map((p) => p.box))}
                    className="bg-sky-400 text-black hover:bg-sky-500 font-bold text-xs"
                  >
                    <Users className="w-3.5 h-3.5 mr-1.5" />
                    Analyze All {frame.people.length} Players
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
