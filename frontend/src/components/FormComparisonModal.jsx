import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X, Trophy, Play, Pause, RotateCcw, ChevronLeft, ChevronRight,
  Activity, Info, AlertTriangle, ExternalLink,
} from "lucide-react";
import SpeakTipButton from "@/components/SpeakTipButton";

// FormComparisonModal — the "real coach view" for a single shot.
//
// LEFT: user's clip looped over a 3.2s window around contact, 0.25/0.5/1×
//       speed selectable, play/pause + frame-step, restart.
// RIGHT: curated pro clip restricted to its [start_sec, end_sec] window,
//        YouTube controls hidden in favor of our own minimal progress bar
//        so users don't see the full 10:22 duration in YT's chrome and
//        mistake it for "playing the whole video".
//
// Lessons baked into this rewrite (from the first cut):
//   1. The previous playback effect listed `speed` and `playing` as deps
//      and re-ran on every toggle, snapping the loop back to its start
//      every time. That made the slow-mo + play/pause feel broken.
//      The new shape splits concerns:
//        - URL lifecycle: one effect, runs when (open, videoFile) change.
//        - Loop setup:   one effect, runs ONLY when (open, timestamp,
//                        userVideoUrl) change. Sets up loadedmetadata +
//                        timeupdate listeners. Never restarts on speed
//                        change.
//        - Speed sync:   tiny effect, pushes playbackRate into the live
//                        element.
//        - Play/pause:   imperative callbacks that act on the element
//                        directly, no effect-driven reset.
//   2. YouTube embed used `controls=1` and showed the 10:22 master length
//      → users assumed they were watching the whole video. Now controls=0
//      + our own segment indicator labels it as "3-second pro segment".
//   3. Mobile: modal is full-screen at <=640px, touch targets are 44×44px,
//      panels stack vertically with sensible heights.

const SHOT_LEAD_SEC = 1.2;   // window before contact
const SHOT_TAIL_SEC = 2.0;   // window after contact
const SPEEDS = [
  { rate: 0.25, label: "0.25×", title: "Quarter speed — frame-by-frame study" },
  { rate: 0.5,  label: "0.5×",  title: "Half speed — natural slow motion" },
  { rate: 1.0,  label: "1×",    title: "Normal speed" },
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
  const objectUrlRef = useRef(null);
  // We keep loop bounds in a ref so the timeupdate handler doesn't
  // capture a stale closure when timestamp changes.
  const loopBoundsRef = useRef({ start: 0, end: 0 });

  const [userVideoUrl, setUserVideoUrl] = useState(null);
  const [speed, setSpeed] = useState(0.5);
  const [playing, setPlaying] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // Fallback video sourced from IndexedDB. We try this when the parent
  // didn't pass a videoFile prop (typical after a refresh: AnalyzePage
  // restored the analysis result from localStorage but the live `file`
  // state is null until the IndexedDB hydrate completes — or the
  // hydrate itself failed). When set, this file feeds the same player
  // pipeline as a fresh upload would.
  const [fallbackFile, setFallbackFile] = useState(null);
  const [fallbackMeta, setFallbackMeta] = useState(null); // {savedAt, expiresAt}

  // Resolve which file actually drives the player — prop wins, fallback
  // only kicks in when prop is missing.
  const effectiveVideoFile = videoFile || fallbackFile;
  const hasUserVideo = !!effectiveVideoFile
    && typeof timestamp === "number"
    && Number.isFinite(timestamp);
  const hasPro = !!proReference?.youtube_id;

  // ── IndexedDB fallback hydrate ──────────────────────────────────────
  // Only fires when the modal opens and the parent didn't pass a
  // videoFile. Single shot — once we have a fallback file (or confirm
  // there isn't one), we stop trying.
  useEffect(() => {
    if (!open) {
      setFallbackFile(null);
      setFallbackMeta(null);
      return undefined;
    }
    if (videoFile) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const vs = await import("@/lib/videoStore");
        const cached = await vs.loadVideo();
        if (cancelled) return;
        if (cached?.file) {
          setFallbackFile(cached.file);
          setFallbackMeta({ savedAt: cached.savedAt, expiresAt: cached.expiresAt });
        }
      } catch {
        // Best-effort — fall through to the "re-upload" empty state.
      }
    })();
    return () => { cancelled = true; };
  }, [open, videoFile]);

  // ── Object URL lifecycle ─────────────────────────────────────────────
  // We deliberately use useState (not useMemo) so the cleanup runs at
  // the right time and doesn't double-revoke. Pattern: create on open,
  // revoke on close OR unmount.
  useEffect(() => {
    if (!open || !effectiveVideoFile) {
      setUserVideoUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(effectiveVideoFile);
    objectUrlRef.current = url;
    setUserVideoUrl(url);
    setVideoReady(false);
    setVideoError(false);
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [open, effectiveVideoFile]);

  // ── Loop setup ───────────────────────────────────────────────────────
  // Runs only when the SOURCE of the loop changes (videoUrl + timestamp).
  // Speed / playing toggles do NOT reset the loop, which fixes the
  // "video keeps jumping back to start" feel of the previous version.
  useEffect(() => {
    if (!open || !hasUserVideo || !userVideoUrl) return undefined;
    const v = userVideoRef.current;
    if (!v) return undefined;

    const loopStart = Math.max(0, timestamp - SHOT_LEAD_SEC);
    const loopEnd = timestamp + SHOT_TAIL_SEC;
    loopBoundsRef.current = { start: loopStart, end: loopEnd };

    let cancelled = false;

    const tryPlay = () => {
      if (cancelled || !v) return;
      try { v.muted = true; v.playbackRate = speed; } catch {}
      const p = v.play?.();
      if (p && typeof p.catch === "function") {
        // Autoplay can be blocked even when muted; surface error so the
        // user sees a Play button instead of a silent black panel.
        p.catch(() => { if (!cancelled) setPlaying(false); });
      }
    };

    const seekAndPlay = () => {
      if (cancelled || !v) return;
      try {
        v.currentTime = loopStart;
      } catch {}
      tryPlay();
    };

    const onMeta = () => {
      if (cancelled) return;
      setVideoReady(true);
      seekAndPlay();
    };

    const onTimeUpdate = () => {
      const v2 = userVideoRef.current;
      if (!v2) return;
      const { start, end } = loopBoundsRef.current;
      if (v2.currentTime >= end - 0.02) {
        try { v2.currentTime = start; } catch {}
      }
    };

    const onError = () => {
      if (cancelled) return;
      setVideoError(true);
      setVideoReady(false);
    };

    if (v.readyState >= 1) {
      setVideoReady(true);
      seekAndPlay();
    }
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("error", onError);

    return () => {
      cancelled = true;
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("error", onError);
      try { v.pause(); } catch {}
    };
    // Intentionally NOT depending on speed / playing — those are pushed
    // imperatively below so they don't snap the loop back to start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasUserVideo, timestamp, userVideoUrl]);

  // ── Speed sync (no loop reset) ───────────────────────────────────────
  useEffect(() => {
    const v = userVideoRef.current;
    if (!v) return;
    try { v.playbackRate = speed; } catch {}
  }, [speed]);

  // ── Imperative controls ──────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = userVideoRef.current;
    if (!v) return;
    if (v.paused) {
      const p = v.play?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const stepFrame = useCallback((direction) => {
    const v = userVideoRef.current;
    if (!v) return;
    try {
      v.pause();
      setPlaying(false);
      v.currentTime = Math.max(0, v.currentTime + direction * (1 / 30));
    } catch {}
  }, []);

  const restartLoop = useCallback(() => {
    const v = userVideoRef.current;
    if (!v) return;
    try {
      v.currentTime = loopBoundsRef.current.start;
      const p = v.play?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
      setPlaying(true);
    } catch {}
  }, []);

  // ── YouTube embed — tight to the segment ─────────────────────────────
  // controls=0 so users don't see YT's "3:00 / 10:22" full-length
  // progress bar. We render our own minimal segment indicator below.
  // showinfo=0 hides the title bar; iv_load_policy=3 disables overlay
  // annotations.
  //
  // IMPORTANT — segment looping. We deliberately DO NOT pass
  // `loop=1&playlist=ID` here, because YouTube's looper restarts from
  // t=0 on each loop instead of honoring `start`. That's exactly why
  // users were seeing the FULL Axelsen video after the first segment
  // played: loop=1 was rewinding the whole match instead of just the
  // smash window. Instead, we enable the postMessage API
  // (`enablejsapi=1`) and the segmentLoop effect below polls the
  // player and seeks back to `start` each time it crosses `end`.
  const proStart = useMemo(() => {
    if (!hasPro) return 0;
    return Math.max(0, Math.round(proReference.start_sec || 0));
  }, [hasPro, proReference]);
  const proEnd = useMemo(() => {
    if (!hasPro) return 0;
    return Math.max(proStart + 1, Math.round(proReference.end_sec || proStart + 5));
  }, [hasPro, proStart, proReference]);
  const ytSrc = useMemo(() => {
    if (!hasPro) return null;
    const id = proReference.youtube_id;
    return `https://www.youtube-nocookie.com/embed/${id}`
      + `?start=${proStart}&end=${proEnd}`
      + `&autoplay=1&mute=1`
      + `&enablejsapi=1`
      + `&controls=0&modestbranding=1&rel=0&disablekb=1&iv_load_policy=3`
      + `&showinfo=0&fs=0`
      + `&playsinline=1`;
  }, [hasPro, proReference, proStart, proEnd]);

  // Segment loop enforcer. The YouTube IFrame postMessage API accepts
  // `seekTo` commands without needing the full IFrame Player script.
  // We fire a seekTo(proStart) every (segment + 0.3s) so the player
  // rewinds JUST before it would otherwise hit `end` and stop — gives
  // the user a continuous loop of just the curated clip.
  const proIframeRef = useRef(null);
  useEffect(() => {
    if (!hasPro || !ytSrc) return undefined;
    const segmentSec = Math.max(1, proEnd - proStart);
    const tick = () => {
      const iframe = proIframeRef.current;
      if (!iframe?.contentWindow) return;
      try {
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: "seekTo",
            args: [proStart, true],
          }),
          "*",
        );
        // playVideo is a safety: if the player paused on its own end
        // (when end= triggers natively), this kicks it back to playing.
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: "command", func: "playVideo", args: [] }),
          "*",
        );
      } catch {
        /* noop — iframe still loading or cross-origin hiccup */
      }
    };
    // First seek a bit before the natural end so we don't flash to the
    // "video ended" state. Subsequent seeks fire every segment length.
    const initialDelay = Math.max(500, segmentSec * 1000 - 300);
    const loopInterval = Math.max(1500, segmentSec * 1000);
    const t0 = setTimeout(() => {
      tick();
      const iv = setInterval(tick, loopInterval);
      // Stash on the timeout id so the outer cleanup can clear it too.
      // eslint-disable-next-line no-param-reassign
      t0._loopId = iv;
    }, initialDelay);
    return () => {
      clearTimeout(t0);
      if (t0._loopId) clearInterval(t0._loopId);
    };
  }, [hasPro, ytSrc, proStart, proEnd]);

  const proSegmentSec = useMemo(() => {
    if (!hasPro) return 0;
    return Math.round(proEnd - proStart);
  }, [hasPro, proStart, proEnd]);

  if (!open) return null;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/90 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border-zinc-800 w-full sm:max-w-5xl sm:my-4 sm:rounded-2xl sm:border min-h-screen sm:min-h-0 flex flex-col"
      >
        {/* Header — sticky on small screens so close stays reachable */}
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border-b border-zinc-800 sticky top-0 bg-zinc-900/95 backdrop-blur-md z-10">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold flex items-center gap-1 leading-none">
              <Trophy className="w-3 h-3" /> Form comparison
            </p>
            <h3 className="font-heading font-bold text-base sm:text-lg text-white truncate mt-0.5">
              {shotName || (shotType || "Shot").replace(/_/g, " ")}
              <span className="text-zinc-500 font-normal hidden sm:inline"> — your form vs ideal</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close form comparison"
            className="text-zinc-400 hover:text-white shrink-0 w-11 h-11 sm:w-9 sm:h-9 rounded-lg hover:bg-zinc-800 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panels */}
        <div className="p-3 sm:p-4 space-y-3 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            {/* ── YOU panel ─────────────────────────────────────── */}
            <div className="bg-black rounded-xl overflow-hidden border border-sky-400/30 flex flex-col">
              <div className="aspect-video bg-zinc-950 relative">
                {hasUserVideo && userVideoUrl ? (
                  <>
                    <video
                      ref={userVideoRef}
                      src={userVideoUrl}
                      playsInline
                      muted
                      preload="auto"
                      className="w-full h-full object-contain"
                    />
                    {/* "Tap to play" overlay when autoplay was blocked.
                        Shows ONLY when we know playback is paused AND
                        the video has loaded — keeps the user moving when
                        the browser blocks the implicit autoplay. */}
                    {videoReady && !playing && !videoError && (
                      <button
                        type="button"
                        onClick={togglePlay}
                        aria-label="Play your shot"
                        className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
                      >
                        <span className="w-14 h-14 rounded-full bg-lime-400 text-black flex items-center justify-center shadow-lg">
                          <Play className="w-6 h-6 fill-current ml-1" />
                        </span>
                      </button>
                    )}
                    {!videoReady && !videoError && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-[11px] text-zinc-500 animate-pulse">Loading your clip…</p>
                      </div>
                    )}
                    {videoError && (
                      <div className="absolute inset-0 flex items-center justify-center text-center px-3">
                        <p className="text-[11px] text-amber-300 leading-snug">
                          Couldn't play this clip in your browser. Try Chrome or download to view on desktop.
                        </p>
                      </div>
                    )}
                  </>
                ) : userThumbnail ? (
                  <img src={userThumbnail} alt="Your shot" className="w-full h-full object-contain" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-[11px] text-zinc-500 text-center px-3">
                      Re-upload this clip to enable slow-motion replay.
                    </p>
                  </div>
                )}
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-md px-2 py-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-sky-300 font-bold">You</p>
                </div>
                {hasUserVideo && videoReady && (
                  <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                    <div className="bg-black/70 backdrop-blur-sm rounded-md px-2 py-0.5">
                      <p className="text-[9px] uppercase tracking-wider text-lime-300 font-bold">{speed}× slow-mo</p>
                    </div>
                    {fallbackFile && !videoFile && fallbackMeta?.expiresAt && (
                      <div className="bg-black/70 backdrop-blur-sm rounded-md px-2 py-0.5 border border-sky-400/40">
                        <p className="text-[9px] uppercase tracking-wider text-sky-300 font-bold" title="Restored from your browser's local cache">
                          ⟲ Cached · {_minutesUntil(fallbackMeta.expiresAt)}m left
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {hasUserVideo && (
                <div className="px-2 sm:px-3 py-2 bg-zinc-900/60 border-t border-sky-400/20">
                  {/* Speed selector — touch-friendly */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="inline-flex rounded-md overflow-hidden border border-zinc-700 bg-zinc-900">
                      {SPEEDS.map((s) => (
                        <button
                          key={s.rate}
                          type="button"
                          title={s.title}
                          onClick={() => setSpeed(s.rate)}
                          aria-pressed={speed === s.rate}
                          className={`min-h-[36px] px-3 py-1.5 text-[11px] font-bold transition-colors ${
                            speed === s.rate ? "bg-sky-400 text-black" : "text-zinc-300 hover:bg-zinc-800"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => stepFrame(-1)}
                        aria-label="Step back one frame"
                        title="Step back 1 frame"
                        className="w-11 h-11 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={togglePlay}
                        aria-label={playing ? "Pause" : "Play"}
                        title={playing ? "Pause" : "Play"}
                        className="w-11 h-11 rounded-md bg-lime-400/20 hover:bg-lime-400/30 text-lime-300 flex items-center justify-center"
                      >
                        {playing
                          ? <Pause className="w-4 h-4" />
                          : <Play className="w-4 h-4 fill-current" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => stepFrame(1)}
                        aria-label="Step forward one frame"
                        title="Step forward 1 frame"
                        className="w-11 h-11 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={restartLoop}
                        aria-label="Restart loop"
                        title="Restart from before contact"
                        className="w-11 h-11 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center ml-1"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── PRO panel ─────────────────────────────────────── */}
            <div className="bg-black rounded-xl overflow-hidden border border-amber-400/30 flex flex-col">
              <div className="aspect-video bg-zinc-950 relative">
                {ytSrc ? (
                  <iframe
                    ref={proIframeRef}
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
                      We hand-pick one clip per shot per sport so comparisons stay accurate.{" "}
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
                {ytSrc && (
                  <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-md px-2 py-0.5">
                    <p className="text-[9px] uppercase tracking-wider text-amber-200 font-bold">
                      {proSegmentSec}s segment · loop
                    </p>
                  </div>
                )}
              </div>
              {proReference && (
                <div className="px-2 sm:px-3 py-2 bg-zinc-900/60 border-t border-amber-400/20 flex items-center gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-zinc-200 font-medium truncate">{proReference.player || "Curated reference"}</p>
                    {proReference.description && (
                      <p className="text-[10px] text-zinc-500 truncate" title={proReference.description}>
                        {proReference.description}
                      </p>
                    )}
                  </div>
                  {proReference.youtube_id && (
                    <a
                      href={`https://www.youtube.com/watch?v=${proReference.youtube_id}&t=${Math.max(0, Math.round(proReference.start_sec || 0))}s`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 min-h-[36px] px-2.5 text-[11px] text-amber-300 hover:text-amber-200 font-bold whitespace-nowrap rounded-md hover:bg-amber-400/10"
                      title="Open on YouTube at the segment start"
                    >
                      YouTube
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Coach's correction */}
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
                    "{proReference.biomechanical_comparison}"
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

          {/* Honest hint when pro ref is missing */}
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
              <div className="flex-1">
                <p className="text-[11px] text-amber-200/90 leading-snug">
                  The slow-motion replay needs the original video file. Your last upload was more than an hour ago (local cache TTL), so it's already cleared from this browser.
                </p>
                <p className="text-[10px] text-zinc-500 leading-snug mt-1">
                  Re-upload the clip to enable side-by-side replay. The analysis you're reading is preserved.
                </p>
              </div>
            </div>
          )}

          {/* Optional technical detail */}
          <details
            className="bg-zinc-900/60 border border-zinc-800 rounded-xl"
            onToggle={(e) => setShowDetail(e.currentTarget.open)}
          >
            <summary className="cursor-pointer select-none flex items-center justify-between gap-2 p-3 list-none min-h-[44px]">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-[12px] text-zinc-300 font-medium">Technical detail (joint angles + pose ghost)</span>
              </div>
              <span className="text-[10px] text-zinc-600">{showDetail ? "Hide" : "Show"}</span>
            </summary>
            {showDetail && (
              <div className="px-3 pb-3">
                <TechnicalDetailLazy
                  videoFile={effectiveVideoFile}
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

// Floor-rounded minutes until the timestamp (or 0 when in the past).
// Used by the "Cached · Nm left" pill so users know how much longer
// the slow-mo player will still work after a refresh.
function _minutesUntil(ts) {
  if (!ts || typeof ts !== "number") return 0;
  const diff = ts - Date.now();
  if (diff <= 0) return 0;
  return Math.max(1, Math.floor(diff / 60000));
}

function TechnicalDetailLazy({ videoFile, timestamp, sport, shotType, shotName, userThumbnail }) {
  const [FormReplay, setFormReplay] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import("@/components/FormCoachReplay").then((m) => {
      if (cancelled) return;
      setFormReplay(() => m.default);
    });
    return () => { cancelled = true; };
  }, []);

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
      {videoFile && typeof timestamp === "number" && FormReplay && (
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
      {!FormReplay && videoFile && (
        <p className="text-[11px] text-zinc-500 italic">Loading pose extraction…</p>
      )}
    </div>
  );
}
