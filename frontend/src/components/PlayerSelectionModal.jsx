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
 *   onClose:      () => void
 */
export default function PlayerSelectionModal({ isOpen, scanResult, onSelect, onClose }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Pick the frame with the most people detected by default
  const bestFrameIdx = useMemo(() => {
    if (!scanResult?.frames?.length) return 0;
    let best = 0;
    for (let i = 1; i < scanResult.frames.length; i++) {
      if (scanResult.frames[i].people.length > scanResult.frames[best].people.length) {
        best = i;
      }
    }
    return best;
  }, [scanResult]);

  const [selectedFrameIdx, setSelectedFrameIdx] = useState(null);

  if (!isOpen || !scanResult || !scanResult.frames?.length) return null;

  // Use best frame by default; user can override via frame switcher
  const activeFrameIdx = selectedFrameIdx != null ? selectedFrameIdx : bestFrameIdx;
  const frame = scanResult.frames[activeFrameIdx] || scanResult.frames[bestFrameIdx];
  // Show the max player count across ALL frames for the title
  const maxPlayers = Math.max(0, ...scanResult.frames.map((f) => f.people.length));
  const isSinglePlayer = maxPlayers === 1;
  const noPlayers = maxPlayers === 0;

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
                    <div className="absolute -top-6 left-0 bg-lime-400 text-black text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap">
                      Player {idx + 1}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Frame selection — compact, only when multiple frames */}
          {scanResult.frames.length > 1 && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-zinc-500">Frame:</span>
              {scanResult.frames.map((f, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedFrameIdx(idx)}
                  className={`text-xs w-7 h-7 rounded-full transition-colors ${
                    idx === activeFrameIdx
                      ? "bg-lime-400 text-black font-semibold"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
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
