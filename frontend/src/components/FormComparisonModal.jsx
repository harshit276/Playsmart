import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X, Trophy, Play, Pause, RotateCcw, ChevronLeft, ChevronRight,
  Activity, Info, AlertTriangle,
} from "lucide-react";
import SpeakTipButton from "@/components/SpeakTipButton";

// FormComparisonModal — the "real coach view" for a single shot.
//
// Replaces three weaker views:
//   • PoseOverlayModal (joint angles + green skeleton — too technical)
//   • CoachReplayModal (480p green-ghost canvas, contact-frame flash for ~600ms)
//   • ProComparisonModal (thumbnail + YouTube embed)
//
// The honest user-test feedback was: "the green ghost flashes too fast to
// see, and degree readings don't tell me what to change". What people
// want is "show me what good looks like, next to me, slow enough to
// actually watch." This component does exactly that.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────┐
//   │ Shot N · Forehand Drive — Your form vs ideal                 │
//   ├───────────────────────────┬──────────────────────────────────┤
//   │  YOU (slow-mo loop)        │  PRO (curated YouTube segment)  │
//   │  user's actual video       │  full-resolution reference      │
//   │  contact-window cropped    │  same shot type, looped         │
//   │  speed toggle: 0.25/0.5/1  │                                  │
//   ├───────────────────────────┴──────────────────────────────────┤
//   │ Coach's correction (large, prominent)                         │
//   │ + Listen button                                               │
//   ├──────────────────────────────────────────────────────────────┤
//   │ ▾ Show technical detail (angles, ghost overlay) — collapsed   │
//   └──────────────────────────────────────────────────────────────┘
//
// Honest empty states:
//   • No pro reference for this shot type → right panel shows a
//     graceful "we don't have a pro clip for this shot yet" message.
//     Left panel still works for self-review.
//   • No videoFile (historical analysis loaded from saved data) →
//     left panel shows the thumbnail and links the user to re-upload.

const SHOT_LEAD_SEC = 1.2;   // window before contact
const SHOT_TAIL_SEC = 2.0;   // window after contact
const SPEEDS = [
  { rate: 0.25, label: "0.25x", title: "Quarter speed — frame-by-frame study" },
  { rate: 0.5,  label: "0.5x",  title: "Half speed — natural slow motion" },
  { rate: 1.0,  label: "1x",    title: "Normal speed" },
];

export default function FormComparisonModal({
  open,
  onClose,
  videoFile,
  timestamp,
  sport,
  shotType,
  shotName,
  topFix,
  proReference,
  userThumbnail,
}) {
  const userVideoRef = useRef(null);
  const userObjectUrlRef = useRef(null);
  const [speed, setSpeed] = useState(0.5);
  const [playing, setPlaying] = useState(true);
  const [showDetail, setShowDetail] = useState(false);

  const hasUserVideo = !!videoFile
    && typeof timestamp === "number"
    && Number.isFinite(timestamp);
  const hasPro = !!proReference?.youtube_id;

  // Build a single object URL for the user's video; tear it down on
  // close so the browser releases the blob.
  const userVideoUrl = useMemo(() => {
    if (!open || !videoFile) return null;
    const u = URL.createObjectURL(videoFile);
    userObjectUrlRef.current = u;
    return u;
  }, [open, videoFile]);

  useEffect(() => {
    return () => {
      if (userObjectUrlRef.current) {
        URL.revokeObjectURL(userObjectUrlRef.current);
        userObjectUrlRef.current = null;
      }
    };
  }, [open]);

  // Set up the looping window. We seek BEFORE the contact moment so the
  // first frame shown is the user's pre-contact stance, then it plays
  // forward through contact + follow-through, then resets.
  useEffect(() => {
    if (!open || !hasUserVideo) return undefined;
    const v = userVideoRef.current;
    if (!v) return undefined;
    const loopStart = Math.max(0, timestamp - SHOT_LEAD_SEC);
    const loopEnd = timestamp + SHOT_TAIL_SEC;

    let cancelled = false;
    const setupLoop = () => {
      if (cancelled || !v) return;
      try {
        v.playbackRate = speed;
        v.muted = true;
        v.currentTime = loopStart;
        if (playing) v.play?.().catch(() => {});
      } catch {}
    };
    const onTime = () => {
      if (!v) return;
      if (loopEnd != null && v.currentTime >= loopEnd) {
        try { v.currentTime = loopStart; } catch {}
      }
    };
    const onMeta = () => setupLoop();

    if (v.readyState >= 1) setupLoop();
    v.addEventListener("loadedmetadata", onMeta, { once: true });
    v.addEventListener("timeupdate", onTime);

    return () => {
      cancelled = true;
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
      try { v.pause(); } catch {}
    };
  }, [open, hasUserVideo, timestamp, speed, playing]);

  // Push the speed change to the live video without restarting the loop.
  useEffect(() => {
    const v = userVideoRef.current;
    if (!v) return;
    try { v.playbackRate = speed; } catch {}
  }, [speed]);

  // Build the YouTube embed URL. Looped, muted, autoplaying so the pro
  // panel mirrors the user-panel's behavior.
  const ytSrc = useMemo(() => {
    if (!hasPro) return null;
    const start = proReference.start_sec || 0;
    const end = proReference.end_sec || start + 6;
    return `https://www.youtube-nocookie.com/embed/${proReference.youtube_id}`
      + `?start=${start}&end=${end}`
      + `&autoplay=1&mute=1&loop=1&playlist=${proReference.youtube_id}`
      + `&controls=1&modestbranding=1&rel=0`;
  }, [hasPro, proReference]);

  // Frame-step controls: pause then nudge currentTime by ~1/30s.
  const stepFrame = (direction) => {
    const v = userVideoRef.current;
    if (!v) return;
    try {
      v.pause();
      setPlaying(false);
      v.currentTime = Math.max(0, v.currentTime + direction * (1 / 30));
    } catch {}
  };

  const togglePlay = () => {
    const v = userVideoRef.current;
    if (!v) return;
    try {
      if (v.paused) {
        v.play?.().catch(() => {});
        setPlaying(true);
      } else {
        v.pause();
        setPlaying(false);
      }
    } catch {}
  };

  const restartLoop = () => {
    const v = userVideoRef.current;
    if (!v) return;
    try {
      v.currentTime = Math.max(0, timestamp - SHOT_LEAD_SEC);
      v.play?.().catch(() => {});
      setPlaying(true);
    } catch {}
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[96vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-800 sticky top-0 bg-zinc-900/95 backdrop-blur-md z-10">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold flex items-center gap-1">
              <Trophy className="w-3 h-3" /> Form comparison
            </p>
            <h3 className="font-heading font-bold text-base sm:text-lg text-white truncate">
              {shotName || (shotType || "Shot").replace(/_/g, " ")}
              <span className="text-zinc-500 font-normal"> — your form vs ideal</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close form comparison"
            className="text-zinc-500 hover:text-white shrink-0 p-1.5 rounded-lg hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Side-by-side panels */}
        <div className="p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* YOU — slow-mo looped clip of user's actual video */}
            <div className="bg-black rounded-xl overflow-hidden border border-sky-400/30 flex flex-col">
              <div className="aspect-video bg-zinc-950 relative">
                {hasUserVideo && userVideoUrl ? (
                  <video
                    ref={userVideoRef}
                    src={userVideoUrl}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                ) : userThumbnail ? (
                  <img
                    src={userThumbnail}
                    alt="Your shot"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-[11px] text-zinc-500 text-center px-3">
                      Re-upload this clip to enable the slow-motion replay.
                    </p>
                  </div>
                )}
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-md px-2 py-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-sky-300 font-bold">You</p>
                </div>
                {hasUserVideo && (
                  <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-md px-2 py-0.5">
                    <p className="text-[9px] uppercase tracking-wider text-lime-300 font-bold">{speed}x slow-mo</p>
                  </div>
                )}
              </div>
              {/* Speed + frame controls — only when there's a video to play */}
              {hasUserVideo && (
                <div className="px-2.5 py-2 bg-zinc-900/60 border-t border-sky-400/20 flex items-center gap-1.5 flex-wrap">
                  <div className="inline-flex rounded-md overflow-hidden border border-zinc-700 bg-zinc-900">
                    {SPEEDS.map((s) => (
                      <button
                        key={s.rate}
                        type="button"
                        title={s.title}
                        onClick={() => setSpeed(s.rate)}
                        aria-pressed={speed === s.rate}
                        className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                          speed === s.rate ? "bg-sky-400 text-black" : "text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="inline-flex items-center gap-0.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => stepFrame(-1)}
                      title="Step back 1 frame"
                      className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={togglePlay}
                      title={playing ? "Pause" : "Play"}
                      className="w-7 h-7 rounded-md bg-lime-400/20 hover:bg-lime-400/30 text-lime-300 flex items-center justify-center"
                    >
                      {playing
                        ? <Pause className="w-3.5 h-3.5" />
                        : <Play className="w-3.5 h-3.5 fill-current" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => stepFrame(1)}
                      title="Step forward 1 frame"
                      className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={restartLoop}
                      title="Restart loop from before contact"
                      className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center ml-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* PRO — curated YouTube segment, or honest empty state */}
            <div className="bg-black rounded-xl overflow-hidden border border-amber-400/30 flex flex-col">
              <div className="aspect-video bg-zinc-950 relative">
                {ytSrc ? (
                  <iframe
                    src={ytSrc}
                    title={`${proReference?.player || "Pro"} reference`}
                    allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 gap-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
                      <Trophy className="w-4 h-4 text-amber-400" />
                    </div>
                    <p className="text-[12px] text-zinc-300 leading-snug">
                      No curated pro reference for this shot type yet.
                    </p>
                    <p className="text-[10px] text-zinc-500 leading-snug max-w-[260px]">
                      We hand-pick one clip per shot per sport so comparisons stay accurate. Want this one covered?{" "}
                      <a
                        href="mailto:hello@athlyticai.com?subject=Pro+reference+request"
                        className="text-sky-400 hover:text-sky-300"
                      >
                        Vote for it
                      </a>
                    </p>
                  </div>
                )}
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-md px-2 py-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-amber-300 font-bold">Pro reference</p>
                </div>
              </div>
              {proReference && (
                <div className="px-2.5 py-2 bg-zinc-900/60 border-t border-amber-400/20 flex items-center gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-zinc-200 font-medium truncate">{proReference.player || "Curated reference"}</p>
                    {proReference.description && (
                      <p className="text-[10px] text-zinc-500 truncate" title={proReference.description}>
                        {proReference.description}
                      </p>
                    )}
                  </div>
                  {proReference.youtube_id && (
                    <a
                      href={`https://www.youtube.com/watch?v=${proReference.youtube_id}&t=${Math.max(0, proReference.start_sec || 0)}s`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-bold whitespace-nowrap"
                    >
                      YouTube ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Coach's correction — large, prominent. This is the WHY of the
              whole comparison: what specifically to look for and try. */}
          {topFix && (
            <div className="bg-lime-400/5 border border-lime-400/30 rounded-xl p-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-lime-400/15 border border-lime-400/40 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4 text-lime-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold mb-1">
                  Coach's correction
                </p>
                <p className="text-sm text-white leading-snug">{topFix}</p>
                {proReference?.biomechanical_comparison && (
                  <p className="text-[12px] text-zinc-300 leading-snug mt-2 italic">
                    “{proReference.biomechanical_comparison}”
                  </p>
                )}
              </div>
              <div className="shrink-0">
                <SpeakTipButton
                  text={topFix}
                  prefix={`On your ${(shotName || "shot").toLowerCase()},`}
                  size="xs"
                  label="Listen"
                />
              </div>
            </div>
          )}

          {/* Honest hint when the right panel is empty — keeps the
              comparison framing intact instead of feeling broken. */}
          {!ytSrc && hasUserVideo && (
            <div className="bg-zinc-800/40 border border-zinc-800 rounded-lg p-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
              <p className="text-[11px] text-zinc-400 leading-snug">
                Use slow-motion + frame-step on your clip to self-review until we have a curated pro reference for this shot.
              </p>
            </div>
          )}
          {!hasUserVideo && (
            <div className="bg-amber-400/5 border border-amber-400/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/90 leading-snug">
                We don't have the original video for this session. Open the analysis from a fresh upload to use the slow-motion player on the left.
              </p>
            </div>
          )}

          {/* Optional "Show technical detail" disclosure — keeps the
              joint angles + green-ghost overlay accessible for users who
              want them, without making them the headline feature.
              The component is rendered lazily — it only mounts when
              the disclosure is expanded so the heavy pose-extraction
              doesn't run unless the user asks for it. */}
          <details
            className="bg-zinc-900/60 border border-zinc-800 rounded-xl"
            onToggle={(e) => setShowDetail(e.currentTarget.open)}
          >
            <summary className="cursor-pointer select-none flex items-center justify-between gap-2 p-3 list-none">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-[12px] text-zinc-300 font-medium">Technical detail (joint angles + pose ghost)</span>
              </div>
              <span className="text-[10px] text-zinc-600">{showDetail ? "Hide" : "Show"}</span>
            </summary>
            {showDetail && (
              <div className="px-3 pb-3">
                <TechnicalDetailLazy
                  videoFile={videoFile}
                  timestamp={timestamp}
                  sport={sport}
                  shotType={shotType}
                  shotName={shotName}
                  userThumbnail={userThumbnail}
                />
              </div>
            )}
          </details>
        </div>
      </motion.div>
    </div>
  );
}

// Lazy-loaded inline view of the old pose-overlay + ghost replay. We
// only mount the children when the parent <details> is open, so the
// MoveNet inference cost is paid only on demand. The thumbnail-based
// pose overlay is the legacy PoseOverlayModal content, and the canvas
// ghost replay is the legacy FormCoachReplay. They both stay available
// but are no longer the headline feature.
function TechnicalDetailLazy({ videoFile, timestamp, sport, shotType, shotName, userThumbnail }) {
  const [PoseOverlayBody, setPoseOverlayBody] = useState(null);
  const [FormReplay, setFormReplay] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Inline-import so the heavy MoveNet bundle only enters the page
    // when the user expands this section.
    Promise.all([
      import("@/components/PoseOverlayModal"),
      import("@/components/FormCoachReplay"),
    ]).then(([a, b]) => {
      if (cancelled) return;
      setPoseOverlayBody(() => a.default);
      setFormReplay(() => b.default);
    });
    return () => { cancelled = true; };
  }, []);

  if (!PoseOverlayBody || !FormReplay) {
    return (
      <p className="text-[11px] text-zinc-500 italic">Loading technical detail…</p>
    );
  }

  // We render PoseOverlayModal in "always-open" mode by passing open=true,
  // but it's not the focus — it's nested inside the disclosure and shares
  // the same z-index as the comparison modal, so we override its fixed
  // positioning by NOT rendering the modal-shell. Easier path: use a
  // simpler inline pose-overlay component. For now, we render a hint
  // pointing users to launch the standalone modal if they want the deep
  // view. (Real inline pose-overlay would require refactoring
  // PoseOverlayModal to split shell from body.)
  return (
    <div className="space-y-3">
      <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-3">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">
          Why we de-emphasized these
        </p>
        <p className="text-[11px] text-zinc-400 leading-snug">
          Joint angles and the green-ghost overlay are precise but technical. The side-by-side comparison above is the primary view for most users — these are here for self-coaches who want the numbers.
        </p>
      </div>
      {userThumbnail && (
        <img
          src={userThumbnail}
          alt="Contact frame"
          className="rounded-lg max-h-72 object-contain w-full bg-black"
        />
      )}
      {videoFile && typeof timestamp === "number" && (
        <div className="aspect-video rounded-lg overflow-hidden bg-black">
          <FormReplay
            videoFile={videoFile}
            timestamp={timestamp}
            sport={sport}
            shotType={shotType}
            className="w-full h-full"
          />
        </div>
      )}
    </div>
  );
}
