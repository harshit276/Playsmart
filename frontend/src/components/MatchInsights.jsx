/**
 * MatchInsights — value-add on top of the page's existing shot list.
 *
 * The page's videoProcessor pipeline already detected and classified shots
 * (`result.shots`). We DO NOT re-detect or re-classify here. We just:
 *   1. Take those shots' timestamps + types as input.
 *   2. Run MoveNet on 4 keyframes per shot (capped to top 10 by score)
 *      to extract per-shot pose dynamics — wrist peak speed, arm extension,
 *      follow-through smoothness.
 *   3. Aggregate quality stats per shot type → consistency %.
 *   4. Send distribution + per-type quality to /api/analysis/coaching-narrative
 *      for an LLM coaching breakdown.
 *
 * The component renders ONLY what the existing shot-distribution card
 * doesn't already show: per-type technique consistency + the coaching
 * narrative. No duplicated counts.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { TrendingUp, AlertCircle, Target, Loader2, Trophy, Zap, X, Activity, Award, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import api from "@/lib/api";
import PoseOverlayModal from "@/components/PoseOverlayModal";


// "Coach's read" text quality gate. The VLM sometimes emits a purely
// descriptive sentence ("The player executes a forehand drive, making
// good contact with the ball") that adds zero insight beyond the shot
// label the user already sees. Showing it under a "Coach's read"
// heading makes the AI look filler-grade — so we suppress those and
// only render reasoning text that actually says something specific
// about technique, body parts, intent, or correction.
const _COACH_READ_INSIGHT_WORDS = [
  // anatomy / contact mechanics
  "hip", "shoulder", "wrist", "elbow", "knee", "stance", "footwork",
  "balance", "weight", "transfer", "contact", "follow-through", "follow through",
  "swing path", "racket face", "paddle face", "bat face", "grip",
  // intent / correction language
  "should", "could", "try", "needs", "needed", "limited", "early", "late",
  "open", "closed", "shift", "drop", "lift", "rotate", "rotation", "extend",
  "extension", "release", "load", "loading", "tight", "tense", "rushed",
  "compact", "controlled", "exposed", "off-balance", "out of position",
  "instead", "rather than", "better", "improve", "stronger", "weaker", "more",
  "less", "watch", "keep", "stay", "lean", "step",
];

function _isInsightfulReasoning(text) {
  if (!text) return false;
  const t = String(text).toLowerCase();
  // Reject the two specific filler patterns we've seen most often in
  // production: "the player executes a [shot], making good contact"
  // and "performs a [shot] with [adjective] form" — pure narration.
  if (/^the player (executes|performs|hits|plays|makes) [a-z ]{2,30}(,|\.| with)/i.test(text.trim())
      && !_COACH_READ_INSIGHT_WORDS.some((kw) => t.includes(kw))) {
    return false;
  }
  // General gate: must contain at least one insight keyword OR be long
  // enough (>= 90 chars) to plausibly contain multi-clause analysis.
  return _COACH_READ_INSIGHT_WORDS.some((kw) => t.includes(kw)) || text.length >= 90;
}

// In-flight cache so we don't refetch the same reference video for
// every shot of the same type in one analysis.
const _refCache = new Map();
async function fetchProReference(sport, shotType) {
  const key = `${(sport || "").toLowerCase()}::${(shotType || "").toLowerCase()}`;
  if (_refCache.has(key)) return _refCache.get(key);
  const promise = (async () => {
    try {
      const { data } = await api.get(`/reference/${encodeURIComponent(sport)}/${encodeURIComponent(shotType)}`, { timeout: 8000 });
      return data?.reference || null;
    } catch { return null; }
  })();
  _refCache.set(key, promise);
  return promise;
}


function ProComparisonModal({ open, onClose, userShot, reference, sport }) {
  if (!open || !reference) return null;
  const ytSrc = `https://www.youtube-nocookie.com/embed/${reference.youtube_id}?start=${reference.start_sec || 0}&end=${reference.end_sec || (reference.start_sec || 0) + 6}&autoplay=1&mute=1&loop=1&playlist=${reference.youtube_id}&controls=1&modestbranding=1&rel=0`;
  const ts = typeof userShot?.timestamp === "number" ? userShot.timestamp : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm"
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 max-w-4xl w-full max-h-[92vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Side-by-side comparison</p>
            <h3 className="font-heading font-bold text-lg text-white capitalize">
              Your {userShot?.name || userShot?.label || "shot"} vs {reference.player}
            </h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* User's clip — thumbnail + click-to-replay on the page's
              <video data-playsmart-clip> element */}
          <div className="bg-black rounded-xl overflow-hidden">
            <div className="aspect-video bg-zinc-900 flex items-center justify-center relative">
              {userShot?.thumbnail ? (
                <img src={userShot.thumbnail} alt="Your shot" className="w-full h-full object-cover" />
              ) : (
                <p className="text-zinc-500 text-xs">No preview frame</p>
              )}
              {ts != null && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("playsmart:seek", { detail: { time: ts } }));
                    const v = document.querySelector("video[data-playsmart-clip]");
                    if (v) { try { v.currentTime = Math.max(0, ts - 0.5); v.muted = true; v.play?.(); } catch {} }
                    onClose();
                  }}
                  className="absolute inset-0 bg-black/50 hover:bg-black/40 flex items-center justify-center text-white text-sm font-bold uppercase tracking-wider transition-colors"
                >
                  ▶ Replay on page
                </button>
              )}
            </div>
            <div className="px-3 py-2 bg-zinc-800/50">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">You</p>
              <p className="text-xs text-zinc-300">
                {userShot?.name || userShot?.label || "Shot"}
                {ts != null && <span className="text-zinc-500"> · {ts.toFixed(1)}s</span>}
              </p>
            </div>
          </div>
          {/* Pro reference — YouTube embed restricted to the targeted segment */}
          <div className="bg-black rounded-xl overflow-hidden">
            <div className="aspect-video">
              <iframe
                src={ytSrc}
                title={`${reference.player} ${reference.shot_type}`}
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
            <div className="px-3 py-2 bg-amber-400/5 border-t border-amber-400/20 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Pro reference</p>
                <p className="text-xs text-zinc-300">{reference.player}</p>
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${reference.youtube_id}&t=${Math.max(0, reference.start_sec || 0)}s`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-amber-400 hover:text-amber-300 font-medium whitespace-nowrap"
                title="Open on YouTube if the embed above shows 'unavailable'"
              >
                Open on YouTube ↗
              </a>
            </div>
          </div>
        </div>
        {reference.description && (
          <div className="bg-zinc-800/40 border border-zinc-800 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">What to watch</p>
            <p className="text-xs text-zinc-300 leading-relaxed">{reference.description}</p>
          </div>
        )}
        <p className="text-[10px] text-zinc-600 mt-3 text-center">
          Curated reference clip from a top {sport || "sport"} player. Compare your form to theirs.
        </p>
      </div>
    </div>
  );
}

const MAX_SHOTS = 10;
const FRAMES_PER_SHOT = 4;
const SEEK_TIMEOUT_MS = 1500;
const PER_SHOT_TIMEOUT_MS = 8000;  // hard ceiling per shot, including pose inference

const KP = {
  L_SHOULDER: 5, R_SHOULDER: 6,
  L_WRIST: 9,    R_WRIST: 10,
};

const SHOT_COLORS = [
  "bg-red-400/80 text-black",
  "bg-amber-400/80 text-black",
  "bg-cyan-400/80 text-black",
  "bg-blue-400/80 text-black",
  "bg-emerald-400/80 text-black",
  "bg-purple-400/80 text-black",
  "bg-pink-400/80 text-black",
];

export default function MatchInsights({
  videoFile, shots: shotsProp, sport = "badminton", playerPosition = "auto",
  // Stash the videoFile on window so deeply-nested per-shot cards can
  // reach it without prop drilling. Cleared on unmount.
  // eslint-disable-next-line no-unused-vars
  fallbackSkillLevel = null,  // top-level skill from AnalyzePage, used when
                              // per-shot vlmSkill is empty across all shots
}) {
  const [phase, setPhase] = useState("idle"); // idle | extracting | narrating | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [perShot, setPerShot] = useState([]); // [{ label, pose: {speed, extension, smoothness} | null }]
  const [overall, setOverall] = useState(null);

  // Make the analyzed videoFile reachable from per-shot cards (which
  // are deeply nested + don't get the prop). Cleared on unmount.
  useEffect(() => {
    if (videoFile) window.__playsmartCurrentVideo = videoFile;
    return () => {
      if (window.__playsmartCurrentVideo === videoFile) {
        window.__playsmartCurrentVideo = null;
      }
    };
  }, [videoFile]);
  const [narrative, setNarrative] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [wasTruncated, setWasTruncated] = useState(false);
  const ranKeyRef = useRef(null);

  const shotsAvailable = Array.isArray(shotsProp) && shotsProp.length > 0;
  // When opened from history, we don't have the video file — render the
  // saved shot data directly instead of re-running pose extraction.
  const isHistorical = !videoFile && shotsAvailable;

  useEffect(() => {
    if (!videoFile || !shotsAvailable) {
      // Historical mode: skip the pose-extraction loop, just populate
      // perShot directly from the saved shotsProp so the UI renders.
      if (isHistorical) {
        const merged = shotsProp.map((s) => ({
          // Prefer the free-text shot_label ("Diving backhand block") over
          // the canonical category ("block") for the visible display name.
          // Category still drives drill/reference lookups internally.
          label: s.shot_label || s.type || s.shot_type || "unknown",
          category: s.shot_category || s.type || s.shot_type || "unknown",
          intent: s.intent || null,
          outcome: s.outcome || null,
          qualityObservation: s.quality_observation || null,
          name: s.shot_label || s.name || s.shot_name || s.type || "unknown",
          pose: null,  // no live pose for historical
          reasoning: s.reasoning || null,
          formFeedback: s.formFeedback || s.form_feedback || null,
          confidence: s.confidence ?? null,
          speed: s.speed ?? (s.speed_kmh != null ? s.speed_kmh : null),
          speedSource: s.speedSource || s.speed_source || null,
          powerLevel: s.powerLevel || s.power_level || null,
          vlmSkill: s.vlmSkill || s.vlm_skill || s.estimated_skill || null,
          vlmMeta: s.vlmMeta || s._meta || null,
          thumbnail: s.thumbnail || null,
          timestamp: typeof s.timestamp === "number" ? s.timestamp : null,
        }));
        setPerShot(merged);
        setPhase("done");
        setProgress(100);
      }
      return;
    }
    const key = `${videoFile.name}-${videoFile.size}-${videoFile.lastModified}-${shotsProp.length}`;
    if (ranKeyRef.current === key) return;
    ranKeyRef.current = key;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFile, shotsAvailable, isHistorical]);

  const perTypeQuality = useMemo(() => buildPerTypeQuality(perShot), [perShot]);
  const populatedTypes = useMemo(
    () => Object.keys(perTypeQuality).filter((k) => k !== "unknown"),
    [perTypeQuality],
  );

  const run = async () => {
    if (!videoFile || !shotsAvailable) return;
    setPhase("extracting");
    setProgress(0);
    setPerShot([]);
    setOverall(null);
    setNarrative(null);
    setErrorMsg(null);
    setWasTruncated(false);

    try {
      // Pick top-N highest-scored shots if more than MAX_SHOTS
      let chosen = shotsProp;
      if (chosen.length > MAX_SHOTS) {
        setWasTruncated(true);
        chosen = [...chosen]
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, MAX_SHOTS)
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      }

      // Set up video element
      setProgressMsg("Loading video…");
      const videoEl = document.createElement("video");
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.preload = "auto";
      videoEl.crossOrigin = "anonymous";
      videoEl.src = URL.createObjectURL(videoFile);
      try { videoEl.load(); } catch {}
      await new Promise((resolve, reject) => {
        // 30s for big phone-recorded files; only fails if truly broken
        const t = setTimeout(() => reject(new Error("Video took too long to load (try a shorter clip)")), 30000);
        const onReady = () => { clearTimeout(t); resolve(); };
        if (videoEl.readyState >= 1 && videoEl.videoWidth) { onReady(); return; }
        videoEl.addEventListener("loadedmetadata", onReady, { once: true });
        videoEl.addEventListener("loadeddata", onReady, { once: true });
        videoEl.onerror = () => { clearTimeout(t); reject(new Error("Video failed to load")); };
      });

      const W = videoEl.videoWidth || 640;
      const H = videoEl.videoHeight || 360;
      const cropBox = computeCropBox(W, H, playerPosition);

      // Set up MoveNet
      setProgressMsg("Loading pose detector…");
      const tf = await import("@tensorflow/tfjs");
      const poseDetection = await import("@tensorflow-models/pose-detection");
      await tf.ready();
      try { await tf.setBackend("webgpu"); } catch {}
      if (tf.getBackend() !== "webgpu") {
        try { await tf.setBackend("webgl"); } catch { await tf.setBackend("cpu"); }
      }
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
      );

      const canvas = document.createElement("canvas");
      canvas.width = cropBox.w;
      canvas.height = cropBox.h;
      const ctx = canvas.getContext("2d");

      // Separate canvas for the per-shot contact-frame THUMBNAIL — used
      // by the AI-Correct generator + comparison modal. Sized small so
      // the resulting data-URL stays under a few hundred KB.
      const THUMB_MAX = 360;
      const thumbCanvas = document.createElement("canvas");
      const aspect = W / Math.max(1, H);
      if (aspect >= 1) { thumbCanvas.width = THUMB_MAX; thumbCanvas.height = Math.round(THUMB_MAX / aspect); }
      else            { thumbCanvas.height = THUMB_MAX; thumbCanvas.width  = Math.round(THUMB_MAX * aspect); }
      const thumbCtx = thumbCanvas.getContext("2d");

      // Per-shot pose extraction with hard timeout
      const merged = [];
      const t0 = performance.now();
      for (let si = 0; si < chosen.length; si++) {
        const shot = chosen[si];
        const center = shot.timestamp || 0;
        const dur = Math.max(0.4, Math.min(2.0, shot.duration || 1.0));
        const start = Math.max(0, center - dur / 2);
        const end = Math.min(videoEl.duration || (center + dur / 2), center + dur / 2);

        let pose = null;
        try {
          pose = await Promise.race([
            extractOneShotPose(videoEl, ctx, canvas, detector, cropBox, start, end),
            new Promise((_, rej) => setTimeout(() => rej(new Error("shot-timeout")), PER_SHOT_TIMEOUT_MS)),
          ]);
        } catch (e) {
          // skip this shot
        }

        // Capture a thumbnail at the contact moment — used downstream
        // as the AI-Correct reference image. Done AFTER the pose pass
        // because the video is already loaded + seekable. We snap to
        // `center` instead of `start` so the frame shows the contact
        // moment, not the wind-up.
        let capturedThumb = shot.thumbnail || null;
        if (!capturedThumb && typeof center === "number" && center >= 0) {
          try {
            const seekOk = await safeSeek(videoEl, Math.max(0, Math.min(videoEl.duration || center, center)));
            if (seekOk) {
              thumbCtx.drawImage(videoEl, 0, 0, thumbCanvas.width, thumbCanvas.height);
              capturedThumb = thumbCanvas.toDataURL("image/jpeg", 0.78);
            }
          } catch { /* silent — fallback panel handles missing thumbs */ }
        }

        merged.push({
          // Free-text shot_label is the primary display; category drives lookups.
          label: shot.shot_label || shot.type || "unknown",
          category: shot.shot_category || shot.type || "unknown",
          intent: shot.intent || null,
          outcome: shot.outcome || null,
          qualityObservation: shot.quality_observation || null,
          name: shot.shot_label || shot.name || shot.type || "unknown",
          pose,
          // Carry through VLM extras so the per-shot card can surface them.
          reasoning: shot.reasoning || null,
          formFeedback: shot.formFeedback || null,
          confidence: shot.confidence ?? null,
          speed: shot.speed ?? null,
          speedSource: shot.speedSource || null,
          powerLevel: shot.powerLevel || null,
          // AI Coach's per-shot skill estimate — used by the Level tile.
          // (Was missing earlier — caused Level to render "—" even with VLM data.)
          vlmSkill: shot.vlmSkill || null,
          vlmMeta: shot.vlmMeta || null,
          // Thumbnail of the shot moment — used by AI-Correct as the
          // reference image AND by comparison modal. Captured here so
          // every accuracy mode (not just video-direct) has one.
          thumbnail: capturedThumb,
          timestamp: shot.timestamp,
        });

        const pct = Math.round(((si + 1) / chosen.length) * 90);
        const elapsed = (performance.now() - t0) / 1000;
        const eta = chosen.length > si + 1 && elapsed > 1
          ? Math.round((elapsed / (si + 1)) * (chosen.length - si - 1))
          : null;
        setProgress(pct);
        setProgressMsg(
          `Analyzing technique ${si + 1}/${chosen.length}` +
          (eta != null ? ` (~${eta}s remaining)` : ""),
        );
        setPerShot([...merged]);
      }
      detector.dispose();
      URL.revokeObjectURL(videoEl.src);

      const overallStats = computeOverall(merged, videoEl.duration);
      setOverall(overallStats);

      // Coaching narrative — runs in the BACKGROUND (don't block the user).
      // The user sees pose results + per-shot AI Coach feedback (which is
      // already rendered above) immediately. The narrative card fades in
      // when it's ready, or just stays hidden if the endpoint is slow/fails.
      setProgress(100);
      setPhase("done");

      const dist = groupByType(merged);
      const ptq = buildPerTypeQuality(merged);
      // Per-shot top_fix list: the backend uses the most-common one to
      // keep the session-level "what to improve" line CONSISTENT with
      // the per-shot Top-fix cards. Without this, the LLM happily
      // closes with "you're well-rounded" while every per-shot card
      // flags the same weakness — which reads as the AI contradicting
      // itself.
      const top_fixes = merged
        .map((s) => {
          const ff = s.formFeedback || s.form_feedback || {};
          return ff.tip || (Array.isArray(ff.weaknesses) && ff.weaknesses[0]) || null;
        })
        .filter(Boolean);
      // Don't await — let it resolve whenever, render when ready.
      api.post("/analysis/coaching-narrative", {
        sport,
        total_shots: merged.length,
        duration_sec: videoEl.duration || null,
        avg_recovery_sec: overallStats.avg_recovery_sec,
        overall_consistency: overallStats.consistency,
        distribution: dist,
        per_type_quality: ptq,
        top_fixes,
      }, { timeout: 20000 })
        .then(({ data }) => setNarrative(data))
        .catch((e) => console.warn("narrative failed (non-blocking):", e?.response?.status, e?.message));
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Match analysis failed");
      setPhase("error");
    }
  };

  // Stable object URL for the player. Revoked when videoFile changes.
  // Hooks MUST be declared before any conditional return — keeping them
  // here so they're called in the same order every render.
  const playerUrl = useMemo(
    () => (videoFile ? URL.createObjectURL(videoFile) : null),
    [videoFile],
  );
  useEffect(() => () => { if (playerUrl) URL.revokeObjectURL(playerUrl); }, [playerUrl]);

  // Don't render at all when there are no shots from the parent.
  if (!shotsAvailable) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-base flex items-center gap-2">
          <Trophy className="w-5 h-5 text-lime-400" />
          Coaching Insights
        </h3>
        {(phase === "done" || phase === "error") && (
          <button onClick={run}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700">
            Re-analyze
          </button>
        )}
      </div>

      {/* Embedded clip player with chapter markers + speed + jump shortcuts.
          Per-shot card click uses data-playsmart-clip to find the <video>
          and seek to the moment. */}
      {playerUrl && (
        <VideoPlayerWithMarkers
          playerUrl={playerUrl}
          perShot={perShot}
        />
      )}

      {(phase === "extracting" || phase === "narrating") && (
        <div>
          <Progress value={progress} className="h-1.5 bg-zinc-800" />
          <p className="text-[11px] text-zinc-500 mt-2 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> {progressMsg}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      {(phase === "done" || phase === "narrating") && perShot.length > 0 && (
        <div className="space-y-4">
          {wasTruncated && (
            <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg px-3 py-2 text-[11px] text-amber-300">
              Analyzed your top {MAX_SHOTS} shots for technique consistency.
            </div>
          )}

          {/* Hero badge — always celebrate the strongest moment of the
              session so the user gets a reward, even on slower shots.
              Lower thresholds = "Peak ... km/h", above thresholds gets
              "Top-tier" framing, max-power gets the gold treatment. */}
          {(() => {
            const maxShot = perShot.reduce((best, s) => {
              const speed = Number(s.speed) || 0;
              const isMax = s.powerLevel === "max";
              const conf = Number(s.confidence) || 0;
              // Score: prioritize max-power, then speed, then confidence as tiebreak.
              const score = (isMax ? 10000 : 0) + speed * 10 + conf * 100;
              return score > best.score ? { shot: s, score, speed, isMax, conf } : best;
            }, { shot: null, score: 0, speed: 0, isMax: false, conf: 0 });
            if (!maxShot.shot) return null;
            const sh = maxShot.shot;
            const speed = Math.round(maxShot.speed);
            const sportPeakThresholds = {
              badminton: { smash: 200, clear: 110, drop: 50, drive: 130, default: 80 },
              tennis: { serve: 150, forehand: 110, default: 80 },
              table_tennis: { default: 50 },
              pickleball: { default: 50 },
              cricket: { default: 100 },
            };
            const t = sportPeakThresholds[sport] || {};
            const peakThreshold = t[sh.label] || t.default || 80;
            const isPeak = speed >= peakThreshold;
            const shotName = sh.name?.replace(/_/g, ' ') || 'shot';
            let label, headline, accent;
            if (maxShot.isMax) {
              label = "⚡ Max-power highlight";
              headline = `You hit a Max-power ${shotName}`;
              accent = "from-amber-500/20 to-lime-400/20 border-amber-400/50";
            } else if (isPeak) {
              label = "🔥 Top-tier shot";
              headline = `Peak ${shotName}: ${speed} km/h`;
              accent = "from-amber-500/15 to-lime-400/15 border-amber-400/40";
            } else {
              label = "⭐ Best shot of the session";
              headline = `${shotName.charAt(0).toUpperCase() + shotName.slice(1)} at ${Math.round(maxShot.conf * 100)}% confidence`;
              accent = "from-sky-400/10 to-zinc-800/10 border-sky-400/30";
            }
            return (
              <div className={`bg-gradient-to-r border rounded-xl p-3 flex items-center justify-between ${accent}`}>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">{label}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{headline}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-lime-400">{speed > 0 ? speed : Math.round(maxShot.conf * 100)}</p>
                  <p className="text-[10px] text-zinc-500">{speed > 0 ? "km/h" : "% sure"}</p>
                </div>
              </div>
            );
          })()}

          {/* Quick Summary — three signals the player actually cares about,
              stacked horizontally. Replaces the confusing "Overall technique
              consistency 78%" headline. All three come from VLM data when
              available, with sane fallbacks. */}
          {perShot.length >= 1 ? (
            (() => {
              const levels = perShot.map((s) => s.vlmSkill).filter((s) => s && s !== "Unknown" && s !== "unknown");
              const counts = levels.reduce((a, l) => { a[l] = (a[l] || 0) + 1; return a; }, {});
              // Per-shot most-common, with fallback to AnalyzePage's aggregated
              // top-level skill (covers cases where shots[] has no vlmSkill
              // but the backend still set a skill_level on the analysis).
              const topLevel = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
                || (fallbackSkillLevel && fallbackSkillLevel !== "Unknown" ? fallbackSkillLevel : null);
              // Aggregate strengths + weaknesses across all shots so we
              // can surface the single most-repeated one as a meaningful
              // tile (replaces "10 shots / 240 events-per-min" which
              // weren't actionable).
              const tally = (extractor) => {
                const counts = new Map();
                for (const s of perShot) {
                  const ff = s.formFeedback || {};
                  for (const item of (extractor(ff) || [])) {
                    const key = String(item).trim();
                    if (key.length < 8) continue;
                    counts.set(key, (counts.get(key) || 0) + 1);
                  }
                }
                return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
              };
              const topStrength = tally((ff) => ff.strengths);
              const topWeakness = tally((ff) => ff.weaknesses);
              const speeds = perShot.map((s) => Number(s.speed) || 0).filter((v) => v > 0);
              const avgSpeed = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
              const peakSpeed = speeds.length ? Math.max(...speeds) : null;
              const levelTone = topLevel === "Pro" ? "text-amber-300"
                : topLevel === "Advanced" ? "text-lime-300"
                : topLevel === "Intermediate" ? "text-sky-300"
                : "text-zinc-300";
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-zinc-800/50 rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Level</p>
                    {topLevel ? (
                      <>
                        <p className={`text-xl font-bold mt-0.5 ${levelTone}`}>{topLevel}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">AI Coach verdict</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-zinc-500 mt-0.5">—</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">AI Coach unavailable</p>
                      </>
                    )}
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold">What's working</p>
                    {topStrength ? (
                      <p className="text-xs text-white leading-snug mt-1 line-clamp-3">{topStrength}</p>
                    ) : (
                      <p className="text-xs text-zinc-500 mt-1">No clear pattern yet</p>
                    )}
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Top fix</p>
                    {topWeakness ? (
                      <p className="text-xs text-white leading-snug mt-1 line-clamp-3">{topWeakness}</p>
                    ) : (
                      <p className="text-xs text-zinc-500 mt-1">Looking clean so far</p>
                    )}
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Consistency</p>
                    {overall && perShot.filter((s) => s.pose).length >= 3 ? (
                      <>
                        <p className="text-xl font-bold text-white mt-0.5">
                          {Math.round(overall.consistency * 100)}%
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Motion repeatability</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-zinc-500 mt-0.5">—</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Need 3+ shots</p>
                      </>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Sample size</p>
              <p className="text-base text-zinc-200 mt-1">
                Analyzed <span className="font-bold text-white">{perShot.length}</span> shot{perShot.length === 1 ? '' : 's'} —
                upload a longer rally for a full consistency score.
              </p>
            </div>
          )}

          {/* Coach-style metrics — tempo, aggression, variety, recovery,
              side balance, and a quality-over-time sparkline. Pure math
              on perShot[], no AI calls, no curation dependency.

              When the backend's coaching-narrative response is ready it
              ships a session_type + contextual_benchmarks payload that
              tells us which metrics to hide (drill sessions don't have
              meaningful aggression %) and how to label them
              ("club-recreational pace" instead of "pro ~10"). We pass it
              through here; the panel falls back to its own client-side
              math when the narrative hasn't loaded yet or the response
              shape is an older cached version. */}
          <MatchMetricsPanel
            perShot={perShot}
            sport={sport}
            sessionType={narrative?.session_type}
            contextualBenchmarks={narrative?.contextual_benchmarks}
          />

          {/* Per-type quality — consistency for n≥2, form score for n=1 */}
          {populatedTypes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Technique by shot type</p>
              <div className="space-y-1.5">
                {populatedTypes
                  .sort((a, b) => (perTypeQuality[b].consistency ?? perTypeQuality[b].avg_smoothness ?? 0)
                                  - (perTypeQuality[a].consistency ?? perTypeQuality[a].avg_smoothness ?? 0))
                  .map((name, i) => {
                    const q = perTypeQuality[name];
                    const value = q.consistency != null ? q.consistency : q.avg_smoothness;
                    const pct = Math.round(value * 100);
                    const color = SHOT_COLORS[i % SHOT_COLORS.length];
                    const barColor = pct >= 70 ? "bg-lime-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400";
                    const tag = q.consistency != null
                      ? `consistency · n=${q.n}`
                      : `form score · 1 shot`;
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${color} w-24 text-center`}>
                          {name.replace(/_/g, " ")}
                        </span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-12 text-right text-[11px] text-zinc-300 font-mono">{pct}%</div>
                        <div className="w-24 text-right text-[9px] text-zinc-500 truncate">{tag}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* If the AI Coach was unavailable for every shot (quota / outage),
              show a single tasteful banner instead of empty per-shot cards. */}
          {(() => {
            const allFailed = perShot.length > 0
              && perShot.every((s) => !s.reasoning && !s.formFeedback)
              && perShot.some((s) => s.vlmMeta?.error);
            const sample = perShot.find((s) => s.vlmMeta?.error_friendly);
            if (!allFailed) return null;
            return (
              <div className="pt-2 border-t border-zinc-800">
                <div className="bg-zinc-800/40 border border-zinc-700 rounded-lg px-3 py-2 text-[11px] text-zinc-400 flex items-start gap-2">
                  <span className="text-amber-400">⚠</span>
                  <span>{sample?.vlmMeta?.error_friendly || "AI coach paused for this session — pose-based feedback only."}</span>
                </div>
              </div>
            );
          })()}

          {/* Per-shot AI coach cards. With ≤4 shots we list each one. With
              5+ we group by shot type so a 12-shot rally doesn't drown the
              user in 12 cards — show one aggregated card per type with an
              expandable list of individual shots. */}
          {/* Auto Pro Reference — picks the user's most-frequent shot
              type and inlines a Compare-to-Pro panel. No click needed.
              Plays user's video looped on the shot window (no
              video-generation cost) next to YouTube embed of the pro. */}
          <AutoProReferencePanel perShot={perShot} sport={sport} videoFile={videoFile} />

          {perShot.some((s) => s.reasoning || s.formFeedback) && (
            <PerShotCoachSection perShot={perShot} sport={sport} />
          )}

          {/* Narrative */}
          {narrative && (
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              {narrative.summary && (
                <p className="text-sm text-zinc-200 italic">"{narrative.summary}"</p>
              )}
              {narrative.strengths?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-lime-400 mb-1.5 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> What you're doing well
                  </p>
                  <ul className="space-y-1">
                    {narrative.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-zinc-300 flex gap-2">
                        <span className="text-lime-400">+</span><span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {narrative.improvements?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-amber-400 mb-1.5 flex items-center gap-1">
                    <Target className="w-3 h-3" /> What to improve
                  </p>
                  <ul className="space-y-1">
                    {narrative.improvements.map((s, i) => (
                      <li key={i} className="text-xs text-zinc-300 flex gap-2">
                        <span className="text-amber-400">→</span><span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {narrative.next_focus && (
                <div className="bg-lime-400/5 border border-lime-400/20 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-lime-400 mb-1 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Focus for next session
                  </p>
                  <p className="text-xs text-zinc-200">{narrative.next_focus}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────

async function extractOneShotPose(videoEl, ctx, canvas, detector, cropBox, start, end) {
  const span = Math.max(0.001, end - start);
  const poseSeq = [];
  for (let k = 0; k < FRAMES_PER_SHOT; k++) {
    const t = start + span * (k / Math.max(1, FRAMES_PER_SHOT - 1));
    // eslint-disable-next-line no-await-in-loop
    const seeked = await safeSeek(videoEl, t);
    if (!seeked) { poseSeq.push(null); continue; }
    ctx.drawImage(
      videoEl,
      cropBox.x, cropBox.y, cropBox.w, cropBox.h,
      0, 0, cropBox.w, cropBox.h,
    );
    // eslint-disable-next-line no-await-in-loop
    const poses = await detector.estimatePoses(canvas);
    poseSeq.push(poses?.[0]?.keypoints || null);
  }
  return extractPoseQuality(poseSeq, cropBox.w, cropBox.h, span);
}

// ─── Per-shot AI coach feedback section ───
// Threshold below which we list each shot individually; above it we group
// by shot type (e.g. "5 Smashes" expandable to 5 individual cards).
const SHOT_GROUP_THRESHOLD = 5;

// Track the auto-pause timer so consecutive jumps cancel the previous
// scheduled pause (otherwise clicking shot 2 mid-replay of shot 1 will
// pause shot 2 early).
let _seekPauseTimer = null;

function _seekToShot(timestamp) {
  if (typeof timestamp !== "number") return;
  window.dispatchEvent(new CustomEvent("playsmart:seek", { detail: { time: timestamp } }));
  const v = document.querySelector("video[data-playsmart-clip]");
  if (!v) return;
  // Replay the shot from ~1s before contact to ~1.5s after so the
  // user actually sees the windup → contact → follow-through, not
  // just a frozen frame at the contact moment.
  try {
    // Lead-in shortened from 1.0s → 0.5s. Gemini's timestamp_sec is
    // often slightly EARLY of the actual contact moment (it points at
    // when the swing becomes recognisable, not the strike frame). With
    // 1s of lead-in the user was missing contact entirely. 0.5s lead +
    // 2s of follow gives a 2.5s window where contact lands in the
    // middle ~80% of the time.
    const start = Math.max(0, timestamp - 0.5);
    v.currentTime = start;
    v.muted = true;  // browsers block unmuted autoplay
    const playPromise = v.play?.();
    // Scroll the video into view so the user sees the replay.
    v.scrollIntoView({ behavior: "smooth", block: "center" });
    if (_seekPauseTimer) { clearTimeout(_seekPauseTimer); _seekPauseTimer = null; }
    _seekPauseTimer = setTimeout(() => {
      try { v.pause?.(); } catch {}
      _seekPauseTimer = null;
    }, 2500);
    // If autoplay was blocked, surface a hint via a custom event the
    // page can toast (browsers sometimes block even muted autoplay).
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        window.dispatchEvent(new CustomEvent("playsmart:seek-blocked", {
          detail: { time: timestamp },
        }));
      });
    }
  } catch {}
}

// ────────────────────────────────────────────────────────────────────
// Quality-score helper for chapter markers + active-shot detection.
// `score` is 0–100 (Math.round(confidence * 100)). Mirrors the same
// thresholds used in IndividualShotCard / ShotGroupCard.
// ────────────────────────────────────────────────────────────────────
function _shotScore(s) {
  if (s == null) return 0;
  const c = typeof s.confidence === "number" ? s.confidence : 0;
  return Math.round(c * 100);
}
function _scoreTier(score) {
  if (score >= 80) return { dot: "bg-lime-400", ring: "ring-lime-400/60", text: "text-lime-300" };
  if (score >= 60) return { dot: "bg-sky-400",  ring: "ring-sky-400/60",  text: "text-sky-300"  };
  if (score >= 40) return { dot: "bg-amber-400",ring: "ring-amber-400/60",text: "text-amber-300"};
  return            { dot: "bg-rose-400",ring: "ring-rose-400/60",text: "text-rose-300" };
}

// VideoPlayerWithMarkers — wraps the page's <video data-playsmart-clip>
// element with: shortcut buttons (best/worst), a chapter-marker overlay
// pinned above the native progress bar, and a speed-control row. Keeps
// the underlying <video> identical so existing `_seekToShot` /
// `playsmart:seek` consumers continue to work — they query the same
// `video[data-playsmart-clip]` selector.
function VideoPlayerWithMarkers({ playerUrl, perShot }) {
  const videoRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [activeShotId, setActiveShotId] = useState(null);
  const lastEmittedRef = useRef(null);

  // Indexed shots with a stable id matching the per-shot cards. We use
  // the perShot array index because PerShotCoachSection / IndividualShotCard
  // already use that index as their `key`.
  const indexedShots = useMemo(
    () => (perShot || []).map((s, i) => ({ ...s, _id: i })),
    [perShot],
  );

  // Only shots that have a usable timestamp + can be replayed — drives
  // the markers AND the best/worst shortcut buttons. Cards without a
  // timestamp are still listed below; we just skip their marker.
  const markableShots = useMemo(
    () => indexedShots.filter((s) => typeof s.timestamp === "number" && Number.isFinite(s.timestamp)),
    [indexedShots],
  );

  // Best / worst by shot quality score. Fall back to highest/lowest
  // confidence when scores are tied / all zero.
  const { bestShot, worstShot } = useMemo(() => {
    if (markableShots.length === 0) return { bestShot: null, worstShot: null };
    const sorted = [...markableShots].sort((a, b) => _shotScore(b) - _shotScore(a));
    return { bestShot: sorted[0], worstShot: sorted[sorted.length - 1] };
  }, [markableShots]);

  // Pull duration from the <video> once metadata loads.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
    };
    const onTime = () => {
      const t = v.currentTime;
      // Find the most-recent shot whose timestamp is <= currentTime.
      // Window: only flag a shot as "active" within 2s of its contact
      // moment so the card pulse fires once per pass, not the whole video.
      let candidate = null;
      for (const s of markableShots) {
        const ts = s.timestamp;
        if (ts <= t && t - ts <= 2.0) {
          if (!candidate || s.timestamp > candidate.timestamp) candidate = s;
        }
      }
      const newId = candidate ? candidate._id : null;
      if (newId !== lastEmittedRef.current) {
        lastEmittedRef.current = newId;
        setActiveShotId(newId);
        if (newId != null) {
          // Notify the cards to pulse. Cards subscribe by their _id.
          window.dispatchEvent(new CustomEvent("playsmart:active-shot", {
            detail: { id: newId, source: "video" },
          }));
        }
      }
    };
    const onRate = () => setSpeed(v.playbackRate || 1);
    if (v.readyState >= 1) onMeta();
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ratechange", onRate);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ratechange", onRate);
    };
  }, [markableShots]);

  // Listen for card→video seek requests. Cards dispatch this so the
  // video jumps + plays from that shot's timestamp.
  useEffect(() => {
    const onSeek = (e) => {
      const t = e?.detail?.time;
      const v = videoRef.current;
      if (!v || typeof t !== "number" || !Number.isFinite(t)) return;
      try {
        v.currentTime = Math.max(0, t - 0.5);
        v.muted = true;
        const p = v.play?.();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {}
    };
    // When a card / shortcut emits its own active-shot event, sync our
    // last-emitted ref so the subsequent timeupdate-driven detection
    // doesn't re-fire and cause a double-pulse on the same card.
    const onActive = (e) => {
      const d = e?.detail || {};
      if (d.source && d.source !== "video") {
        lastEmittedRef.current = d.id;
        setActiveShotId(d.id);
      }
    };
    window.addEventListener("playsmart:seek", onSeek);
    window.addEventListener("playsmart:active-shot", onActive);
    return () => {
      window.removeEventListener("playsmart:seek", onSeek);
      window.removeEventListener("playsmart:active-shot", onActive);
    };
  }, []);

  const applySpeed = (rate) => {
    const v = videoRef.current;
    if (!v) return;
    try { v.playbackRate = rate; } catch {}
    setSpeed(rate);
  };

  const jumpToShot = (shot) => {
    if (!shot || typeof shot.timestamp !== "number") return;
    window.dispatchEvent(new CustomEvent("playsmart:seek", { detail: { time: shot.timestamp } }));
    // Also fire active-shot so the matching card pulses + scrolls. The
    // timeupdate handler dedupes via lastEmittedRef so we won't double-pulse.
    lastEmittedRef.current = shot._id;
    setActiveShotId(shot._id);
    window.dispatchEvent(new CustomEvent("playsmart:active-shot", {
      detail: { id: shot._id, source: "shortcut", scroll: true },
    }));
  };

  const SPEEDS = [0.5, 1, 2];
  const hasShortcuts = bestShot != null || worstShot != null;
  const sameBestWorst = bestShot && worstShot && bestShot._id === worstShot._id;

  return (
    <div className="mb-4">
      {/* Jump-to-best / Jump-to-worst shortcuts */}
      {hasShortcuts && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {bestShot && (
            <button
              type="button"
              onClick={() => jumpToShot(bestShot)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-full bg-lime-400/10 hover:bg-lime-400/20 text-lime-300 border border-lime-400/30 transition-colors"
              title={`Jump to your best shot · score ${_shotScore(bestShot)}`}
            >
              <Award className="w-3 h-3" /> Jump to best
              <span className="text-lime-400/80 font-mono ml-0.5">{_shotScore(bestShot)}</span>
            </button>
          )}
          {worstShot && !sameBestWorst && (
            <button
              type="button"
              onClick={() => jumpToShot(worstShot)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-full bg-rose-400/10 hover:bg-rose-400/20 text-rose-300 border border-rose-400/30 transition-colors"
              title={`Jump to your weakest shot · score ${_shotScore(worstShot)}`}
            >
              <AlertTriangle className="w-3 h-3" /> Jump to worst
              <span className="text-rose-400/80 font-mono ml-0.5">{_shotScore(worstShot)}</span>
            </button>
          )}
          <span className="text-[10px] text-zinc-600 ml-1">· tap a marker on the timeline to jump</span>
        </div>
      )}

      {/* The <video> itself — keep data-playsmart-clip so all existing
          _seekToShot callers (Compare modal, group cards, etc.) still
          find it via querySelector. */}
      <div className="relative">
        <video
          ref={videoRef}
          src={playerUrl}
          data-playsmart-clip
          controls
          playsInline
          className="w-full rounded-lg bg-black max-h-72 object-contain"
        />

        {/* Chapter markers overlay — pinned to the bottom of the video
            box so they sit just above the native controls' progress bar.
            Native controls heights vary by browser (~40px Chrome,
            ~50px Safari iOS); positioning at bottom: 38px keeps the
            markers visually above the progress bar on the common cases
            without intercepting clicks on the play/volume buttons.
            pointer-events-none on the wrapper, pointer-events-auto on
            the buttons themselves so the rest of the video stays
            clickable. */}
        {duration > 0 && markableShots.length > 0 && (
          <div
            className="absolute left-0 right-0 pointer-events-none"
            style={{ bottom: "38px", height: "10px" }}
            aria-hidden="false"
          >
            <div className="relative w-full h-full mx-auto">
              {markableShots.map((s) => {
                const pct = Math.min(100, Math.max(0, (s.timestamp / duration) * 100));
                const score = _shotScore(s);
                const tier = _scoreTier(score);
                const name = (s.name || s.label || s.type || "Shot").replace(/_/g, " ");
                const isActive = activeShotId === s._id;
                const isHover = hoverIdx === s._id;
                return (
                  <button
                    key={s._id}
                    type="button"
                    onMouseEnter={() => setHoverIdx(s._id)}
                    onMouseLeave={() => setHoverIdx((cur) => (cur === s._id ? null : cur))}
                    onFocus={() => setHoverIdx(s._id)}
                    onBlur={() => setHoverIdx((cur) => (cur === s._id ? null : cur))}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      jumpToShot(s);
                    }}
                    aria-label={`Jump to ${name} at ${s.timestamp.toFixed(1)} seconds, score ${score}`}
                    className={`absolute pointer-events-auto -translate-x-1/2 rounded-full ${tier.dot} ${isActive ? `ring-2 ${tier.ring}` : ""} hover:scale-150 focus:scale-150 focus:outline-none transition-transform`}
                    style={{
                      left: `${pct}%`,
                      top: "50%",
                      marginTop: "-5px",
                      width: "10px",
                      height: "10px",
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                    }}
                  >
                    <AnimatePresence>
                      {isHover && (
                        <motion.span
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.12 }}
                          className={`absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-950/95 border border-zinc-700 px-2 py-1 text-[10px] font-semibold ${tier.text} pointer-events-none shadow-lg`}
                          style={{ zIndex: 20 }}
                        >
                          <span className="capitalize">{name}</span>
                          <span className="text-zinc-500"> · </span>
                          <span className="font-mono">{score}</span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Speed controls — slo-mo / normal / fast for self-review. */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Speed</span>
        <div className="inline-flex rounded-md overflow-hidden border border-zinc-800 bg-zinc-900">
          {SPEEDS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => applySpeed(r)}
              aria-pressed={speed === r}
              className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${
                speed === r
                  ? "bg-lime-400 text-black"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {r === 1 ? "1x" : `${r}x`}
            </button>
          ))}
        </div>
        {markableShots.length === 0 && (
          <span className="text-[10px] text-zinc-600">No timestamped shots in this session.</span>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Coach-style match metrics computed from the per-shot data we already
// have. No AI inference, no external curation — pure math on shot
// timestamps + types + confidence. Universally applicable across all
// sports because every coach tracks tempo, aggression, variety and
// recovery time (the units differ, the concepts don't).
// ────────────────────────────────────────────────────────────────────

const ATTACK_KEYWORDS = [
  "smash", "kill", "spike", "winner", "attack", "drive_loop",
  "forehand_drive", "backhand_drive", "loop", "pull", "hook", "cut",
  "punch", "hit", "drive", "third_shot_drive",
];
const DEFENSE_KEYWORDS = [
  "clear", "lob", "block", "dink", "push", "chop", "defense", "defensive",
  "drop", "net_shot", "lift", "dig", "lift_shot",
];

const PRO_BENCHMARKS = {
  badminton:    { tempo: 10,  aggression: 35, variety: 5, recovery: 3 },
  tennis:       { tempo: 4,   aggression: 25, variety: 4, recovery: 5 },
  table_tennis: { tempo: 30,  aggression: 40, variety: 5, recovery: 1.5 },
  pickleball:   { tempo: 12,  aggression: 25, variety: 4, recovery: 3 },
  squash:       { tempo: 15,  aggression: 25, variety: 4, recovery: 2.5 },
  cricket:      { tempo: 1,   aggression: 40, variety: 4, recovery: 30 },
  golf:         { tempo: 0.5, aggression: 0,  variety: 3, recovery: 120 },
  basketball:   { tempo: 6,   aggression: 60, variety: 3, recovery: 10 },
  volleyball:   { tempo: 8,   aggression: 30, variety: 4, recovery: 4 },
  baseball:     { tempo: 1,   aggression: 30, variety: 3, recovery: 20 },
};

function _shotMatchesKeyword(shot, kws) {
  const t = ((shot.type || shot.label || shot.name || "") + "").toLowerCase();
  for (const k of kws) if (t.includes(k)) return true;
  return false;
}

function computeMatchMetrics(perShot, durationSec, sport) {
  if (!perShot || perShot.length === 0) return null;
  const N = perShot.length;
  // Fall back to (max timestamp + 1s) if caller didn't pass duration.
  // Good enough for tempo math when video duration isn't plumbed through.
  let dur = Number(durationSec) || 0;
  if (!dur) {
    const tsList = perShot.map((s) => Number(s.timestamp)).filter((t) => Number.isFinite(t));
    if (tsList.length > 0) dur = Math.max(...tsList) + 1;
  }

  // 1. Tempo — shots per minute (only meaningful when we know duration)
  const tempo = dur > 0 ? (N / dur) * 60 : null;

  // 2. Aggression — % of shots that match an offensive keyword
  let attack = 0, defense = 0;
  for (const s of perShot) {
    if (_shotMatchesKeyword(s, ATTACK_KEYWORDS)) attack++;
    else if (_shotMatchesKeyword(s, DEFENSE_KEYWORDS)) defense++;
  }
  const aggressionPct = N > 0 ? (attack / N) * 100 : 0;

  // 3. Variety — distinct shot types in this session
  const types = new Set(
    perShot.map((s) => (s.type || s.label || "").toLowerCase()).filter(Boolean),
  );
  const varietyCount = types.size;

  // 4. Recovery — avg seconds between consecutive shots
  const ts = perShot
    .map((s) => Number(s.timestamp))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  let recoveryAvg = null;
  if (ts.length >= 2) {
    let sum = 0;
    for (let i = 1; i < ts.length; i++) sum += ts[i] - ts[i - 1];
    recoveryAvg = sum / (ts.length - 1);
  }

  // 5. Side balance — FH vs BH
  let fh = 0, bh = 0;
  for (const s of perShot) {
    const t = ((s.type || s.label || s.name || "") + "").toLowerCase();
    if (t.includes("forehand")) fh++;
    else if (t.includes("backhand")) bh++;
  }
  const sideTotal = fh + bh;

  // 6. Quality curve — confidence over time
  const trend = perShot
    .filter((s) => Number.isFinite(s.timestamp) && s.confidence != null)
    .map((s) => ({ t: s.timestamp, q: Math.round((s.confidence || 0) * 100) }))
    .sort((a, b) => a.t - b.t);

  // 7. Peak speed (only if speed data exists)
  const speeds = perShot.map((s) => Number(s.speed) || 0).filter((v) => v > 0);
  const peakSpeed = speeds.length ? Math.max(...speeds) : null;
  const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;

  return {
    totalShots: N,
    durationSec: dur,
    tempo,
    aggressionPct, attackCount: attack, defenseCount: defense,
    varietyCount,
    recoveryAvg,
    forehandCount: fh, backhandCount: bh, sideTotal,
    trend,
    peakSpeed, avgSpeed,
  };
}

function _toneVs(value, benchmark, higherIsBetter = true) {
  if (value == null || !benchmark) return "text-zinc-300";
  const ratio = value / benchmark;
  if (higherIsBetter) {
    if (ratio >= 0.9) return "text-lime-400";
    if (ratio >= 0.6) return "text-amber-300";
    return "text-red-400";
  }
  // lower is better (recovery time)
  if (ratio <= 1.1) return "text-lime-400";
  if (ratio <= 1.5) return "text-amber-300";
  return "text-red-400";
}

// Client-side session classifier — mirrors the backend's
// _classify_session_type so the metrics row can hide aggression/recovery
// for drill sessions BEFORE the backend narrative arrives. The backend
// version wins once the narrative loads (it has the canonical answer).
function _clientSessionType(perShot) {
  if (!perShot || perShot.length === 0) return "unknown";
  const types = new Set(
    perShot.map((s) => (s.type || s.label || "").toLowerCase()).filter(Boolean),
  );
  if (types.size <= 1) return "drill";
  if (types.size <= 3) return "mixed";
  return "rally";
}

// Variety-suggestion fallback for when the backend hasn't returned a
// contextual_benchmarks payload yet (older cached analyses, or before
// the narrative LLM call completes). Keep this aligned with the
// server-side _VARIETY_SUGGESTIONS dict.
const _CLIENT_VARIETY_SUGGESTIONS = {
  badminton: "Mix in clears, drops or net shots for a more complete session.",
  tennis: "Add slices, drop shots or volleys to round out the session.",
  table_tennis: "Add backhand drives, pushes or chops to round out the session.",
  pickleball: "Mix in dinks, drops or volleys to round out the session.",
  squash: "Add boasts, drops or volleys to round out the session.",
};

function MatchMetricsPanel({ perShot, durationSec, sport, sessionType, contextualBenchmarks }) {
  const m = useMemo(
    () => computeMatchMetrics(perShot, durationSec, sport),
    [perShot, durationSec, sport],
  );
  if (!m) return null;
  const sportLc = (sport || "").toLowerCase();

  // Prefer backend session_type, but compute one client-side as a
  // fallback so older cached analyses (no narrative payload) and the
  // brief window before the LLM narrative arrives still gate the
  // misleading metrics correctly.
  const effectiveSessionType = sessionType || _clientSessionType(perShot);
  const isDrill = effectiveSessionType === "drill";

  // Backend supplies per-metric show/hide + contextual text. Fall back
  // to gentle client-side defaults that NEVER print "pro ~10" (the
  // misleading suffix the old code shipped).
  const cb = contextualBenchmarks || {};
  const tempoCtx = cb.tempo || null;
  const aggressionCtx = cb.aggression || null;
  const recoveryCtx = cb.recovery || null;
  const varietyCtx = cb.variety || null;

  // Resolve "should this metric render at all?"
  const showAggression = aggressionCtx
    ? !aggressionCtx.hidden
    : (m.totalShots >= 5 && m.varietyCount > 1);
  const showRecovery = recoveryCtx
    ? !recoveryCtx.hidden
    : (m.varietyCount > 1 && m.recoveryAvg != null);

  // How many metrics actually render → choose the grid column count so
  // we don't end up with one tile floating awkwardly to the left.
  const metricCount = 1 + (showAggression ? 1 : 0) + 1 + (showRecovery ? 1 : 0);
  const gridCols = metricCount >= 4 ? "sm:grid-cols-4"
    : metricCount === 3 ? "sm:grid-cols-3"
    : metricCount === 2 ? "sm:grid-cols-2"
    : "sm:grid-cols-1";

  // Variety suggestion: prefer backend's sport-specific text, else
  // client-side dict. Only surface when variety is low (≤2).
  const varietySuggestion = varietyCtx?.suggestion
    || (m.varietyCount <= 2 ? _CLIENT_VARIETY_SUGGESTIONS[sportLc] : null);

  // Tempo note: backend text wins, else generic prompt.
  const tempoNote = tempoCtx?.note
    || (tempoCtx?.band ? `\u2713 ${tempoCtx.band}` : "shots/min");
  const tempoRangeHint = tempoCtx?.range ? ` (${tempoCtx.range})` : "";

  // Quality-curve sparkline geometry — pure SVG, no chart lib.
  const sparkW = 280, sparkH = 60;
  let sparkPath = null;
  if (m.trend.length >= 2) {
    const minT = m.trend[0].t;
    const maxT = m.trend[m.trend.length - 1].t || (minT + 1);
    const xs = (t) => ((t - minT) / Math.max(0.001, maxT - minT)) * sparkW;
    const ys = (q) => sparkH - (q / 100) * sparkH;
    sparkPath = m.trend.map((p, i) => `${i === 0 ? "M" : "L"}${xs(p.t).toFixed(1)},${ys(p.q).toFixed(1)}`).join(" ");
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-lime-400" /> Match metrics
        </p>
        {isDrill ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-400/15 text-sky-300 border border-sky-400/30 font-bold uppercase tracking-wider">
            🎯 Drill session
          </span>
        ) : (
          <p className="text-[10px] text-zinc-500">{effectiveSessionType !== "unknown" ? `${effectiveSessionType} session` : `vs ${sportLc || "pro"} avg`}</p>
        )}
      </div>

      {isDrill && (
        <p className="text-[11px] text-sky-200/80 leading-snug -mt-1">
          Drill session detected — aggression % and recovery time only
          measure well in a full rally. Switch to a rally for those.
        </p>
      )}

      <div className={`grid grid-cols-2 ${gridCols} gap-2`}>
        {/* TEMPO — always shown when we can compute it. Pro point-estimate
            replaced with sport-specific band so a 47 shots/min drill clip
            no longer reads as "above pro ~10". */}
        <div className="bg-zinc-800/40 rounded-lg p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Tempo</p>
          <p className="text-xl font-bold mt-0.5 text-white">
            {m.tempo != null ? m.tempo.toFixed(1) : "—"}
          </p>
          <p className="text-[10px] text-zinc-500">shots/min</p>
          <p className="text-[10px] text-lime-300 mt-1 leading-snug">
            {tempoNote}{tempoRangeHint}
          </p>
        </div>

        {/* AGGRESSION — hidden in drill sessions (10 forehand drives reads
            as "100% aggression" which is technically true and totally
            useless). Pro benchmarks are rally-derived; we don't print
            them next to drill data anymore. */}
        {showAggression && (
          <div className="bg-zinc-800/40 rounded-lg p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Aggression</p>
            <p className="text-xl font-bold mt-0.5 text-white">
              {Math.round(m.aggressionPct)}%
            </p>
            <p className="text-[10px] text-zinc-500">attack shots</p>
          </div>
        )}

        {/* VARIETY — always shown, with a one-line "what to add" prompt
            when count is low so the user has a concrete next step instead
            of a numeric verdict. */}
        <div className="bg-zinc-800/40 rounded-lg p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Variety</p>
          <p className="text-xl font-bold mt-0.5 text-white">
            {m.varietyCount}
          </p>
          <p className="text-[10px] text-zinc-500">distinct shot{m.varietyCount === 1 ? "" : "s"}</p>
          {varietySuggestion && (
            <p className="text-[10px] text-amber-300 mt-1 leading-snug">{varietySuggestion}</p>
          )}
        </div>

        {/* RECOVERY — hidden for drills (short recovery in a drill means
            the player stood still, not that they recover faster than a
            pro). For rallies we show the value with a contextual note
            instead of a misleading pro-time benchmark. */}
        {showRecovery && (
          <div className="bg-zinc-800/40 rounded-lg p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Recovery</p>
            <p className="text-xl font-bold mt-0.5 text-white">
              {m.recoveryAvg != null ? m.recoveryAvg.toFixed(1) : "—"}s
            </p>
            <p className="text-[10px] text-zinc-500">between shots</p>
            {recoveryCtx?.note && (
              <p className="text-[10px] text-lime-300 mt-1 leading-snug">{recoveryCtx.note}</p>
            )}
          </div>
        )}
      </div>

      {/* Side balance + peak power (only when data is meaningful) */}
      {(m.sideTotal > 0 || m.peakSpeed) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {m.sideTotal > 0 && (
            <div className="bg-zinc-800/40 rounded-lg p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Forehand vs backhand</p>
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-bold text-white">
                  {Math.round((m.forehandCount / m.sideTotal) * 100)}% / {Math.round((m.backhandCount / m.sideTotal) * 100)}%
                </p>
                <p className="text-[10px] text-zinc-500">{m.forehandCount} FH · {m.backhandCount} BH</p>
              </div>
              <div className="h-1.5 mt-1.5 bg-zinc-900 rounded-full overflow-hidden flex">
                <div className="h-full bg-lime-400" style={{ width: `${(m.forehandCount / m.sideTotal) * 100}%` }} />
                <div className="h-full bg-sky-400" style={{ width: `${(m.backhandCount / m.sideTotal) * 100}%` }} />
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                {Math.abs(m.forehandCount - m.backhandCount) / m.sideTotal > 0.6
                  ? "One-sided — train the weaker side"
                  : "Balanced across sides"}
              </p>
            </div>
          )}
          {m.peakSpeed && (
            <div className="bg-zinc-800/40 rounded-lg p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Peak power</p>
              <p className="text-xl font-bold text-amber-300 mt-0.5">{Math.round(m.peakSpeed)} km/h</p>
              <p className="text-[10px] text-zinc-500">
                avg {m.avgSpeed ? Math.round(m.avgSpeed) : "—"} km/h across {m.totalShots} shots
              </p>
            </div>
          )}
        </div>
      )}

      {/* Quality curve sparkline — fatigue indicator. Shows confidence
          per shot over the match timeline. Watch for a downward slope. */}
      {m.trend.length >= 3 && (
        <div className="bg-zinc-800/40 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Quality over time</p>
            {m.trend.length >= 4 && (() => {
              const first = m.trend.slice(0, Math.ceil(m.trend.length / 2));
              const last = m.trend.slice(Math.floor(m.trend.length / 2));
              const avg = (arr) => arr.reduce((s, p) => s + p.q, 0) / arr.length;
              const delta = avg(last) - avg(first);
              const tone = delta >= 3 ? "text-lime-400" : delta <= -3 ? "text-red-400" : "text-zinc-400";
              const label = delta >= 3 ? "↑ improving" : delta <= -3 ? "↓ fatigue?" : "→ steady";
              return <p className={`text-[10px] font-bold ${tone}`}>{label} ({delta >= 0 ? "+" : ""}{Math.round(delta)})</p>;
            })()}
          </div>
          <svg viewBox={`0 0 ${sparkW} ${sparkH}`} className="w-full h-12">
            <defs>
              <linearGradient id="qFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#84cc16" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#84cc16" stopOpacity="0" />
              </linearGradient>
            </defs>
            {sparkPath && <path d={`${sparkPath} L${sparkW},${sparkH} L0,${sparkH} Z`} fill="url(#qFill)" />}
            {sparkPath && <path d={sparkPath} fill="none" stroke="#84cc16" strokeWidth="1.5" />}
          </svg>
          <p className="text-[10px] text-zinc-500">Each dot is one shot's quality. Downward slope late = conditioning drop.</p>
        </div>
      )}
    </div>
  );
}


// Side-by-side looped clip viewer: user's shot window vs pro reference.
// Auto-loops a 2.5-sec window around the contact timestamp from the
// user's uploaded file (no re-encode, just controlled <video> playback)
// next to the curated YouTube pro clip looped over its `start_sec` →
// `end_sec` window. Pure JS, no AI, works on any clip quality.
function InlineShotVsPro({ shot, sport, shotType }) {
  const userVideoRef = useRef(null);
  const userUrlRef = useRef(null);
  const [proRef, setProRef] = useState(null);

  // Build a blob URL from the global video file (set by MatchInsights
  // on mount). Cleaned up when the card unmounts. The same file is
  // reused across all per-shot cards on the page — browsers handle
  // simultaneous <video> elements sharing a blob URL fine.
  useEffect(() => {
    const file = typeof window !== "undefined" ? window.__playsmartCurrentVideo : null;
    if (!file) return;
    const url = URL.createObjectURL(file);
    userUrlRef.current = url;
    return () => { try { URL.revokeObjectURL(url); } catch {} userUrlRef.current = null; };
  }, [shot?.timestamp]);

  // Fetch the curated pro reference for this sport+shot combo.
  useEffect(() => {
    let cancelled = false;
    if (!sport || !shotType) return;
    fetchProReference(sport, shotType).then((r) => {
      if (!cancelled) setProRef(r);
    });
    return () => { cancelled = true; };
  }, [sport, shotType]);

  // Seek the user-video to the shot's contact window and loop. Mirrors
  // what AutoProReferencePanel does for its headline shot.
  useEffect(() => {
    const v = userVideoRef.current;
    if (!v || typeof shot?.timestamp !== "number") return;
    const SHOT_LEAD = 0.8;
    const SHOT_TAIL = 1.7;
    let active = true;
    const setLoop = () => {
      if (!active) return;
      let ts = shot.timestamp;
      const dur = v.duration;
      // Gemini sometimes gives timestamp 0 on the first shot — that's
      // usually a black intro frame. Hop 25% into the clip instead so
      // we land on real gameplay.
      if ((!ts || ts < 0.4) && isFinite(dur) && dur > 2) ts = dur * 0.25;
      try {
        v.currentTime = Math.max(0, ts - SHOT_LEAD);
        v.muted = true;
        v.play?.();
      } catch {}
      v._loopEnd = ts + SHOT_TAIL;
    };
    const onTime = () => {
      if (!active) return;
      if (v._loopEnd != null && v.currentTime >= v._loopEnd) setLoop();
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadeddata", setLoop, { once: true });
    if (v.readyState >= 2) setLoop();
    return () => {
      active = false;
      v.removeEventListener("timeupdate", onTime);
      try { v.pause?.(); } catch {}
    };
  }, [shot?.timestamp, userUrlRef.current]);

  const canShowUser = !!userUrlRef.current && typeof shot?.timestamp === "number";
  if (!canShowUser && !proRef && !shot?.thumbnail) return null;

  const ytSrc = proRef
    ? `https://www.youtube-nocookie.com/embed/${proRef.youtube_id}?start=${proRef.start_sec || 0}&end=${proRef.end_sec || (proRef.start_sec || 0) + 6}&autoplay=1&mute=1&loop=1&playlist=${proRef.youtube_id}&controls=0&modestbranding=1&rel=0`
    : null;

  return (
    <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg overflow-hidden mt-2">
      <div className="px-2.5 py-1.5 bg-zinc-900/70 border-b border-zinc-800 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1">
          <Trophy className="w-3 h-3" /> You vs pro · looped side-by-side
        </p>
        {proRef && (
          <a
            href={`https://www.youtube.com/watch?v=${proRef.youtube_id}&t=${Math.max(0, proRef.start_sec || 0)}s`}
            target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-amber-300 hover:text-amber-200"
          >
            Open on YouTube ↗
          </a>
        )}
      </div>
      <div className="grid grid-cols-2 gap-0">
        {/* YOUR clip — looped from the upload */}
        <div className="bg-black aspect-video relative">
          {canShowUser ? (
            <video
              ref={userVideoRef}
              src={userUrlRef.current}
              muted playsInline preload="auto"
              className="w-full h-full object-cover"
            />
          ) : shot?.thumbnail ? (
            <img src={shot.thumbnail} alt="Your shot" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-[10px] text-zinc-600">No preview</p>
            </div>
          )}
          <div className="absolute bottom-1 left-1 bg-black/70 backdrop-blur-sm rounded px-1.5 py-0.5">
            <p className="text-[9px] uppercase tracking-wider text-white font-bold">You</p>
          </div>
        </div>
        {/* PRO clip — curated YouTube segment looping */}
        <div className="bg-black aspect-video relative">
          {ytSrc ? (
            <iframe
              src={ytSrc}
              title={`${proRef.player} ${proRef.shot_type}`}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center px-2">
              <p className="text-[10px] text-zinc-600 text-center">No curated pro clip for this shot yet</p>
            </div>
          )}
          {proRef && (
            <div className="absolute bottom-1 left-1 bg-black/70 backdrop-blur-sm rounded px-1.5 py-0.5">
              <p className="text-[9px] uppercase tracking-wider text-amber-300 font-bold">{proRef.player}</p>
            </div>
          )}
        </div>
      </div>
      {proRef?.description && (
        <div className="px-2.5 py-1.5 bg-zinc-900/40 border-t border-zinc-800">
          <p className="text-[10px] uppercase tracking-wider text-amber-400/80 font-bold mb-0.5">What to watch</p>
          <p className="text-[11px] text-zinc-300 leading-snug">{proRef.description}</p>
        </div>
      )}
    </div>
  );
}


function IndividualShotCard({ shot, label, sport, shotId = null }) {
  const ff = shot.formFeedback || {};
  const conf = shot.confidence != null ? Math.round(shot.confidence * 100) : null;
  const [proRef, setProRef] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [poseOpen, setPoseOpen] = useState(false);
  // Bidirectional link: card highlights briefly when video plays past
  // this shot's timestamp OR when the user clicks a marker / shortcut.
  const [pulsing, setPulsing] = useState(false);
  const cardRef = useRef(null);
  const pulseTimerRef = useRef(null);
  // Avoid scroll-loops: only scroll the card into view when the trigger
  // was a marker / shortcut click. Natural video playback shouldn't
  // hijack the user's scroll position.
  useEffect(() => {
    if (shotId == null) return;
    const onActive = (e) => {
      const d = e?.detail || {};
      if (d.id !== shotId) return;
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      setPulsing(true);
      pulseTimerRef.current = setTimeout(() => setPulsing(false), 1400);
      if (d.scroll && cardRef.current) {
        try { cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
      }
    };
    window.addEventListener("playsmart:active-shot", onActive);
    return () => {
      window.removeEventListener("playsmart:active-shot", onActive);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [shotId]);

  // Card click → seek the video to this shot. We emit BOTH the seek
  // (so the video plays) AND the active-shot pulse (so this card
  // highlights immediately, in case the timeupdate hasn't fired yet).
  // The video listener guards against echo via lastEmittedRef, so
  // clicking the card → video timeupdate → re-emit won't double-pulse.
  const jumpHere = useCallback(() => {
    const ts = shot?.timestamp;
    if (typeof ts !== "number" || !Number.isFinite(ts)) return;
    window.dispatchEvent(new CustomEvent("playsmart:seek", { detail: { time: ts } }));
    if (shotId != null) {
      window.dispatchEvent(new CustomEvent("playsmart:active-shot", {
        detail: { id: shotId, source: "card", scroll: false },
      }));
    }
    // Scroll the video into view so the player is visible after click.
    const v = document.querySelector("video[data-playsmart-clip]");
    if (v) { try { v.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {} }
  }, [shot?.timestamp, shotId]);
  // AI Correct auto-generation state (per card). Fires on mount if
  // we have a thumbnail + timestamp; dedupe ref prevents re-fires on
  // re-renders.
  const [aiGenStatus, setAiGenStatus] = useState("idle"); // idle | running | done | failed
  const [aiGenMessage, setAiGenMessage] = useState("");
  const [aiGenVideoUrl, setAiGenVideoUrl] = useState(null);
  const aiGenFiredRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    // Pro reference is keyed on the canonical category, not the free-text
    // label. A 'Defensive lift (short)' label and a 'Crisp clear to back court'
    // label both map to category=lift/clear and share a pro reference.
    const refKey = shot.category || shot.type;
    if (!sport || !refKey) return;
    fetchProReference(sport, refKey).then((ref) => {
      if (!cancelled && ref) setProRef(ref);
    });
    return () => { cancelled = true; };
  }, [sport, shot.category, shot.type]);

  // MANUAL generation — user clicks "Generate" on each card. We used to
  // auto-fire but Replicate's free tier is 6 req/min with burst=1, so
  // a single video with 4+ cards saturated the quota immediately. The
  // headline shot still auto-fires once via AutoProReferencePanel.
  const runGeneration = async () => {
    if (!shot.thumbnail || typeof shot.timestamp !== "number" || !sport) {
      setAiGenStatus("failed");
      setAiGenMessage("Missing reference frame or timestamp.");
      return;
    }
    setAiGenStatus("running");
    setAiGenMessage("Generating AI-corrected clip…");
    try {
      const api = (await import("@/lib/api")).default;
      const { data } = await api.post("/generate-corrected-shot", {
        reference_image_b64: shot.thumbnail,
        timestamp_sec: shot.timestamp,
        sport,
        shot_type: shot.type || "shot",
        // Personalize the prompt with this user's specific feedback so
        // MiniMax animates THIS user's corrections, not a generic ideal.
        top_fix: ff.tip || (Array.isArray(ff.weaknesses) && ff.weaknesses[0]) || null,
        weaknesses: Array.isArray(ff.weaknesses) ? ff.weaknesses.slice(0, 3) : [],
        strengths: Array.isArray(ff.strengths) ? ff.strengths.slice(0, 3) : [],
      }, { timeout: 30000 });
      if (data?.status === "feature_unavailable") {
        setAiGenStatus("failed");
        setAiGenMessage(data.message || "");
        return;
      }
      if (data?.status === "done" && data?.video_url) {
        setAiGenStatus("done");
        setAiGenVideoUrl(data.video_url);
        setAiGenMessage(data.cached ? "Loaded from cache." : "");
        return;
      }
      const jobId = data?.job_id;
      if (!jobId) throw new Error("No job_id returned");
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const { data: poll } = await api.get(`/generate-corrected-shot/${jobId}`, { timeout: 8000 });
          if (poll?.status === "done" && poll?.video_url) {
            setAiGenStatus("done");
            setAiGenVideoUrl(poll.video_url);
            setAiGenMessage("");
            return;
          }
          if (poll?.status === "failed") {
            setAiGenStatus("failed");
            setAiGenMessage(poll.error || "Generation failed.");
            return;
          }
        } catch { /* keep polling */ }
      }
      setAiGenStatus("failed");
      setAiGenMessage("Taking longer than expected.");
    } catch (e) {
      setAiGenStatus("failed");
      setAiGenMessage(e.response?.data?.detail || e.message || "Generation failed.");
    }
  };

  const cleanLabel = String(label || "").replace(/\bShot at [\d.]+s\b/g, "").replace(/^\s*[·•]\s*/, "").trim() || "Shot";
  const strengths = Array.isArray(ff.strengths) ? ff.strengths.slice(0, 3) : [];
  const weaknesses = Array.isArray(ff.weaknesses) ? ff.weaknesses.slice(0, 3) : [];
  const headlineFix = ff.tip || weaknesses[0] || null;
  const scorePct = conf != null ? conf : 0;
  const scoreTone = scorePct >= 80 ? "text-lime-400"
    : scorePct >= 60 ? "text-sky-300"
    : scorePct >= 40 ? "text-amber-300"
    : "text-red-400";

  const hasTimestamp = typeof shot?.timestamp === "number" && Number.isFinite(shot.timestamp);
  return (
    <motion.div
      ref={cardRef}
      data-shot-id={shotId ?? undefined}
      onClick={hasTimestamp ? jumpHere : undefined}
      role={hasTimestamp ? "button" : undefined}
      tabIndex={hasTimestamp ? 0 : undefined}
      onKeyDown={hasTimestamp ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jumpHere(); } } : undefined}
      animate={pulsing
        ? { boxShadow: ["0 0 0 0 rgba(163,230,53,0)", "0 0 0 3px rgba(163,230,53,0.55)", "0 0 0 0 rgba(163,230,53,0)"] }
        : { boxShadow: "0 0 0 0 rgba(163,230,53,0)" }}
      transition={pulsing ? { duration: 1.4, ease: "easeOut" } : { duration: 0.2 }}
      className={`bg-zinc-900/60 border ${pulsing ? "border-lime-400/60" : "border-zinc-800"} rounded-xl overflow-hidden transition-colors ${hasTimestamp ? "cursor-pointer hover:border-zinc-700" : ""}`}
      title={hasTimestamp ? `Click to jump to ${shot.timestamp.toFixed(1)}s` : undefined}
    >
      {/* Compact header: thumbnail + name + quality bar */}
      <div className="flex items-stretch gap-3 p-3 border-b border-zinc-800/60">
        {shot.thumbnail && (
          <img src={shot.thumbnail} alt={cleanLabel}
               className="w-20 h-20 rounded-lg object-cover bg-black shrink-0" loading="lazy" />
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-base font-semibold text-white capitalize leading-tight">{cleanLabel}</p>
            <div className="flex items-center gap-1.5">
              {hasTimestamp && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">@{shot.timestamp.toFixed(1)}s</span>
              )}
              {shot.powerLevel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-300 capitalize">{shot.powerLevel}</span>
              )}
              {shot.speed != null && shot.speed > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{Math.round(shot.speed)} km/h</span>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Shot quality</span>
              <span className={`text-base font-bold ${scoreTone}`}>{scorePct}</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  scorePct >= 80 ? "bg-lime-400"
                  : scorePct >= 60 ? "bg-sky-400"
                  : scorePct >= 40 ? "bg-amber-400"
                  : "bg-red-400"
                }`}
                style={{ width: `${Math.min(100, Math.max(2, scorePct))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bullet-pointed feedback. Per-shot AI-video generation was removed
          — only the headline shot gets a generation (in AutoProReferencePanel)
          to keep cost per analysis bounded. */}
      <div className="p-3 space-y-3">
        {headlineFix && (
          <div className="bg-amber-400/8 border border-amber-400/30 rounded-lg p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">🎯 Top fix</p>
            <p className="text-sm text-white leading-snug">{headlineFix}</p>
          </div>
        )}

        {strengths.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold mb-1.5">What's working</p>
            <ul className="space-y-1">
              {strengths.map((x, j) => (
                <li key={`s-${j}`} className="text-[12px] text-zinc-200 flex gap-2 leading-snug">
                  <span className="text-lime-400 shrink-0 mt-[2px]">✓</span>
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {weaknesses.filter((x) => x !== headlineFix).length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1.5">Areas to improve</p>
            <ul className="space-y-1">
              {weaknesses.filter((x) => x !== headlineFix).map((x, j) => (
                <li key={`w-${j}`} className="text-[12px] text-zinc-200 flex gap-2 leading-snug">
                  <span className="text-amber-400 shrink-0 mt-[2px]">⚠</span>
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {shot.reasoning && _isInsightfulReasoning(shot.reasoning) && (
          <div className="pt-2 border-t border-zinc-800/60">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Coach's read</p>
            <p className="text-[12px] text-zinc-300 leading-relaxed">{shot.reasoning}</p>
          </div>
        )}


        {proRef && (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-zinc-800/60">
            <button
              onClick={(e) => { e.stopPropagation(); setCompareOpen(true); }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-2.5 py-1 transition-colors"
            >
              <Trophy className="w-3 h-3" /> Compare to {proRef.player?.split(/\s+/)[0] || "Pro"}
            </button>
          </div>
        )}
      </div>
      <ProComparisonModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        userShot={shot}
        reference={proRef}
        sport={sport}
      />
      <PoseOverlayModal
        open={poseOpen}
        onClose={() => setPoseOpen(false)}
        thumbnail={shot.thumbnail}
        sport={sport}
        shotType={shot.type}
        shotName={cleanLabel}
      />
    </motion.div>
  );
}

function ShotGroupCard({ groupKey, shots: groupShots, sport }) {
  // Per-shot timestamps + counts were removed: Gemini's shot count was
  // often wrong (over-segmenting one swing into multiple events) and the
  // individual timestamps didn't accurately land on the contact moment,
  // so the "Replay this shot" button replayed the wrong instant. We now
  // show ONLY the shot type + aggregated coaching content.
  const sample = groupShots[0];
  const name = sample.name?.replace(/_/g, " ") || groupKey;

  // Aggregate stats (still useful — kept the avg confidence + peak speed
  // because they describe the group, not the count)
  const speeds = groupShots.map((s) => Number(s.speed) || 0).filter((v) => v > 0);
  const peakSpeed = speeds.length ? Math.max(...speeds) : 0;
  const count = groupShots.length;
  const avgConf = groupShots.reduce((a, s) => a + (s.confidence || 0), 0) / count;

  // Dedup strengths / weaknesses across the group, pick top 3 of each
  const allStrengths = new Set();
  const allWeaknesses = new Set();
  const allTips = new Set();
  groupShots.forEach((s) => {
    const ff = s.formFeedback || {};
    (ff.strengths || []).slice(0, 2).forEach((x) => allStrengths.add(String(x)));
    (ff.weaknesses || []).slice(0, 2).forEach((x) => allWeaknesses.add(String(x)));
    if (ff.tip) allTips.add(String(ff.tip));
  });
  const strengths = Array.from(allStrengths).slice(0, 3);
  const weaknesses = Array.from(allWeaknesses).slice(0, 3);
  const tips = Array.from(allTips).slice(0, 2);

  // Most representative reasoning = the longest one (most detail)
  const reasoning = groupShots
    .map((s) => s.reasoning || "")
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || "";

  // One representative shot per group — prefer one with a thumbnail
  // (so the header preview + AI-gen reference have visual data), then
  // fall back to plain highest-confidence so the card still renders
  // when no shot in the group carries a thumbnail.
  const sortedByConf = groupShots.slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const heroShot = sortedByConf.find((s) => s.thumbnail) || sortedByConf[0];
  // Best shot for AI generation — needs BOTH thumbnail and timestamp.
  const aiSourceShot = sortedByConf.find((s) => s.thumbnail && typeof s.timestamp === "number");

  // Group bidirectional link: pulse when ANY shot in this group fires
  // an active-shot event; clicking the card jumps the video to the
  // highest-confidence shot in the group that has a timestamp.
  const groupShotIds = useMemo(
    () => new Set(groupShots.map((s) => s._shotId).filter((id) => id != null)),
    [groupShots],
  );
  const jumpTarget = useMemo(
    () => sortedByConf.find((s) => typeof s.timestamp === "number" && Number.isFinite(s.timestamp)) || null,
    [sortedByConf],
  );
  const [pulsing, setPulsing] = useState(false);
  const cardRef = useRef(null);
  const pulseTimerRef = useRef(null);
  useEffect(() => {
    const onActive = (e) => {
      const d = e?.detail || {};
      if (!groupShotIds.has(d.id)) return;
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      setPulsing(true);
      pulseTimerRef.current = setTimeout(() => setPulsing(false), 1400);
      if (d.scroll && cardRef.current) {
        try { cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
      }
    };
    window.addEventListener("playsmart:active-shot", onActive);
    return () => {
      window.removeEventListener("playsmart:active-shot", onActive);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [groupShotIds]);
  const jumpHere = useCallback(() => {
    if (!jumpTarget) return;
    window.dispatchEvent(new CustomEvent("playsmart:seek", { detail: { time: jumpTarget.timestamp } }));
    if (jumpTarget._shotId != null) {
      window.dispatchEvent(new CustomEvent("playsmart:active-shot", {
        detail: { id: jumpTarget._shotId, source: "card", scroll: false },
      }));
    }
    const v = document.querySelector("video[data-playsmart-clip]");
    if (v) { try { v.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {} }
  }, [jumpTarget]);

  // Compare-to-Pro reference for this shot type (sport-aware).
  const [proRef, setProRef] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [poseOpen, setPoseOpen] = useState(false);
  // AI Correct auto-generation state. Fires once when we have a
  // thumbnail + timestamp; dedupe ref prevents re-fires on rerender.
  const [aiGenStatus, setAiGenStatus] = useState("idle"); // idle | running | done | failed
  const [aiGenMessage, setAiGenMessage] = useState("");
  const [aiGenVideoUrl, setAiGenVideoUrl] = useState(null);
  const aiGenFiredRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!sport || !sample.type) return;
    fetchProReference(sport, sample.type).then((ref) => {
      if (!cancelled && ref) setProRef(ref);
    });
    return () => { cancelled = true; };
  }, [sport, sample.type]);

  // MANUAL generation — user clicks Generate. Auto-fire would saturate
  // Replicate's free tier (6 req/min, burst=1) across N grouped cards.
  // The headline shot still auto-fires once via AutoProReferencePanel.
  const runGeneration = async () => {
    if (!aiSourceShot || !sport) {
      setAiGenStatus("failed");
      setAiGenMessage("No usable reference frame in this group.");
      return;
    }
    setAiGenStatus("running");
    setAiGenMessage("Generating AI-corrected clip…");
    try {
      const api = (await import("@/lib/api")).default;
      const { data } = await api.post("/generate-corrected-shot", {
        reference_image_b64: aiSourceShot.thumbnail,
        timestamp_sec: aiSourceShot.timestamp,
        sport,
        shot_type: sample.type || "shot",
        // Personalize the prompt with the group's aggregated feedback so
        // MiniMax shows corrections that target this user's actual issues.
        top_fix: tips[0] || weaknesses[0] || null,
        weaknesses: weaknesses.slice(0, 3),
        strengths: strengths.slice(0, 3),
      }, { timeout: 30000 });
      if (data?.status === "feature_unavailable") {
        setAiGenStatus("failed");
        setAiGenMessage(data.message || "");
        return;
      }
      if (data?.status === "done" && data?.video_url) {
        setAiGenStatus("done");
        setAiGenVideoUrl(data.video_url);
        setAiGenMessage(data.cached ? "Loaded from cache." : "");
        return;
      }
      const jobId = data?.job_id;
      if (!jobId) throw new Error("No job_id returned");
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const { data: poll } = await api.get(`/generate-corrected-shot/${jobId}`, { timeout: 8000 });
          if (poll?.status === "done" && poll?.video_url) {
            setAiGenStatus("done");
            setAiGenVideoUrl(poll.video_url);
            setAiGenMessage("");
            return;
          }
          if (poll?.status === "failed") {
            setAiGenStatus("failed");
            setAiGenMessage(poll.error || "Generation failed.");
            return;
          }
        } catch { /* keep polling */ }
      }
      setAiGenStatus("failed");
      setAiGenMessage("Taking longer than expected.");
    } catch (e) {
      setAiGenStatus("failed");
      setAiGenMessage(e.response?.data?.detail || e.message || "Generation failed.");
    }
  };

  const headlineFix = tips[0] || weaknesses[0] || null;
  const scorePct = Math.round(avgConf * 100);
  const scoreTone = scorePct >= 80 ? "text-lime-400"
    : scorePct >= 60 ? "text-sky-300"
    : scorePct >= 40 ? "text-amber-300"
    : "text-red-400";

  const hasJump = jumpTarget != null;
  return (
    <motion.div
      ref={cardRef}
      onClick={hasJump ? jumpHere : undefined}
      role={hasJump ? "button" : undefined}
      tabIndex={hasJump ? 0 : undefined}
      onKeyDown={hasJump ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jumpHere(); } } : undefined}
      animate={pulsing
        ? { boxShadow: ["0 0 0 0 rgba(163,230,53,0)", "0 0 0 3px rgba(163,230,53,0.55)", "0 0 0 0 rgba(163,230,53,0)"] }
        : { boxShadow: "0 0 0 0 rgba(163,230,53,0)" }}
      transition={pulsing ? { duration: 1.4, ease: "easeOut" } : { duration: 0.2 }}
      className={`bg-zinc-900/60 border ${pulsing ? "border-lime-400/60" : "border-zinc-800"} rounded-xl overflow-hidden transition-colors ${hasJump ? "cursor-pointer hover:border-zinc-700" : ""}`}
      title={hasJump ? `Click to jump to the best ${name} (${jumpTarget.timestamp.toFixed(1)}s)` : undefined}
    >
      {/* Compact header: thumbnail + shot name + quality bar */}
      <div className="flex items-stretch gap-3 p-3 border-b border-zinc-800/60">
        {heroShot?.thumbnail && (
          <img src={heroShot.thumbnail} alt={name}
               className="w-20 h-20 rounded-lg object-cover bg-black shrink-0" loading="lazy" />
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-base font-semibold text-white capitalize leading-tight">{name}</p>
            {peakSpeed > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                peak {Math.round(peakSpeed)} km/h
              </span>
            )}
          </div>
          {/* Quality bar — readable at-a-glance instead of "avg 90%" buried */}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Shot quality</span>
              <span className={`text-base font-bold ${scoreTone}`}>{scorePct}</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  scorePct >= 80 ? "bg-lime-400"
                  : scorePct >= 60 ? "bg-sky-400"
                  : scorePct >= 40 ? "bg-amber-400"
                  : "bg-red-400"
                }`}
                style={{ width: `${Math.min(100, Math.max(2, scorePct))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bullet feedback. Per-shot AI video was removed to keep cost
          per analysis bounded — only the headline shot in the Pro
          Reference panel gets a generation. */}
      <div className="p-3 space-y-3">
        {headlineFix && (
          <div className="bg-amber-400/8 border border-amber-400/30 rounded-lg p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">🎯 Top fix</p>
            <p className="text-sm text-white leading-snug">{headlineFix}</p>
          </div>
        )}

        {strengths.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold mb-1.5">What's working</p>
            <ul className="space-y-1">
              {strengths.map((x, j) => (
                <li key={`s-${j}`} className="text-[12px] text-zinc-200 flex gap-2 leading-snug">
                  <span className="text-lime-400 shrink-0 mt-[2px]">✓</span>
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {weaknesses.filter((x) => x !== headlineFix).length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1.5">Areas to improve</p>
            <ul className="space-y-1">
              {weaknesses.filter((x) => x !== headlineFix).map((x, j) => (
                <li key={`w-${j}`} className="text-[12px] text-zinc-200 flex gap-2 leading-snug">
                  <span className="text-amber-400 shrink-0 mt-[2px]">⚠</span>
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {reasoning && _isInsightfulReasoning(reasoning) && (
          <div className="pt-2 border-t border-zinc-800/60">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Coach's read</p>
            <p className="text-[12px] text-zinc-300 leading-relaxed">{reasoning}</p>
          </div>
        )}


        {proRef && (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-zinc-800/60">
            <button
              onClick={(e) => { e.stopPropagation(); setCompareOpen(true); }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-2.5 py-1 transition-colors"
            >
              <Trophy className="w-3 h-3" /> Compare to {proRef.player?.split(/\s+/)[0] || "Pro"}
            </button>
          </div>
        )}
      </div>
      <ProComparisonModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        userShot={{ ...sample, thumbnail: heroShot?.thumbnail }}
        reference={proRef}
        sport={sport}
      />
      <PoseOverlayModal
        open={poseOpen}
        onClose={() => setPoseOpen(false)}
        thumbnail={heroShot?.thumbnail}
        sport={sport}
        shotType={sample.type}
        shotName={name}
      />
    </motion.div>
  );
}

function AutoProReferencePanel({ perShot, sport, videoFile }) {
  // Pick the user's "headline" shot: most-frequent type, prefer a
  // representative with both high confidence AND a thumbnail (so the
  // YOU panel always has a visual). We render a pro reference inline
  // (not behind a click) so users see "here's what good looks like"
  // automatically after analysis.
  const [proRef, setProRef] = useState(null);
  const [headlineShot, setHeadlineShot] = useState(null);
  const userVideoRef = useRef(null);
  const userVideoUrlRef = useRef(null);
  // AI Correct generation removed — Replicate motion-transfer models
  // are too slow + flaky to be a foreground feature right now (60-180s,
  // sometimes failing even with billing). Keeping the backend endpoint
  // + /test-ai-gen test bench so we can re-enable later (likely as a
  // notification-on-completion flow instead of inline auto-fire).

  // Build an object URL for the user's video file once — we use it as
  // the src of a <video> element and seek to the shot's window for
  // side-by-side replay against the YouTube pro reference.
  useEffect(() => {
    if (!videoFile) {
      userVideoUrlRef.current = null;
      return;
    }
    const url = URL.createObjectURL(videoFile);
    userVideoUrlRef.current = url;
    return () => { try { URL.revokeObjectURL(url); } catch {} };
  }, [videoFile]);

  useEffect(() => {
    let cancelled = false;
    if (!sport || !perShot.length) return;
    const groups = new Map();
    for (const s of perShot) {
      const k = s.type || s.label;
      if (!k) continue;
      const g = groups.get(k) || { type: k, shots: [], sumConf: 0 };
      g.shots.push(s);
      g.sumConf += (s.confidence || 0);
      groups.set(k, g);
    }
    const ranked = [...groups.values()]
      .map((g) => ({ ...g, score: g.shots.length * (g.sumConf / g.shots.length) }))
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) return;
    const top = ranked[0];
    // Prefer shots that have a thumbnail (or a timestamp so we can replay
    // from the user's video). Only fall back to "any highest-confidence
    // shot" when nothing has visual data.
    const sorted = top.shots.slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    const repShot = sorted.find((s) => s.thumbnail || typeof s.timestamp === "number") || sorted[0];
    setHeadlineShot({ ...repShot, _name: repShot.name?.replace(/_/g, " ") || top.type });
    fetchProReference(sport, top.type).then((ref) => {
      if (!cancelled) setProRef(ref);
    });
    return () => { cancelled = true; };
  }, [sport, perShot]);

  // AI Correct auto-fire removed (see note above).

  // Seek the user-video to the shot's contact window (-1s .. +1.5s)
  // and auto-loop. Mirrors the YouTube iframe's behavior on the pro
  // side. No re-encoding / video generation needed — just controlled
  // playback of the original file.
  useEffect(() => {
    const v = userVideoRef.current;
    if (!v || !headlineShot || typeof headlineShot.timestamp !== "number") return;
    const SHOT_LEAD = 1.0;
    const SHOT_TAIL = 1.5;
    let active = true;
    const setLoop = () => {
      if (!active) return;
      // Edge case: when Gemini didn't return a real timestamp it
      // defaults to 0, which on most clips is a black intro frame.
      // Fall back to 25% into the duration so the user sees actual
      // gameplay instead of a black screen.
      let ts = headlineShot.timestamp;
      const dur = v.duration;
      if ((!ts || ts < 0.5) && isFinite(dur) && dur > 2) {
        ts = dur * 0.25;
      }
      try {
        v.currentTime = Math.max(0, ts - SHOT_LEAD);
        v.muted = true;
        v.play?.();
      } catch {}
      v._loopStart = Math.max(0, ts - SHOT_LEAD);
      v._loopEnd = ts + SHOT_TAIL;
    };
    const onTimeUpdate = () => {
      if (!active) return;
      if (v._loopEnd != null && v.currentTime >= v._loopEnd) setLoop();
    };
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("loadeddata", setLoop, { once: true });
    if (v.readyState >= 2) setLoop();
    return () => {
      active = false;
      v.removeEventListener("timeupdate", onTimeUpdate);
      try { v.pause?.(); } catch {}
    };
  }, [headlineShot, userVideoUrlRef.current]);

  if (!proRef || !headlineShot) return null;
  const ytSrc = `https://www.youtube-nocookie.com/embed/${proRef.youtube_id}?start=${proRef.start_sec || 0}&end=${proRef.end_sec || (proRef.start_sec || 0) + 6}&autoplay=1&mute=1&loop=1&playlist=${proRef.youtube_id}&controls=1&modestbranding=1&rel=0`;
  const canShowVideo = !!userVideoUrlRef.current && typeof headlineShot.timestamp === "number";

  return (
    <div className="bg-zinc-900/60 border border-amber-400/30 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-amber-400/5 border-b border-amber-400/20">
        <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1">
          <Trophy className="w-3 h-3" /> Pro reference for your top shot
        </p>
        <p className="text-sm font-semibold text-white mt-0.5 capitalize">
          Your {headlineShot._name} vs {proRef.player}
        </p>
        <p className="text-[10px] text-zinc-500 mt-0.5">
          Your clip loops on the left. The pro's segment loops on the right.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* USER side — raw user clip looping the shot window */}
        <div className="bg-black aspect-video relative">
          {canShowVideo ? (
            <video
              ref={userVideoRef}
              src={userVideoUrlRef.current}
              muted
              playsInline
              preload="auto"
              className="w-full h-full object-cover"
              data-playsmart-clip
            />
          ) : headlineShot.thumbnail ? (
            <img src={headlineShot.thumbnail} alt="Your shot" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-zinc-500 text-xs">No preview available</p>
            </div>
          )}
          <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-0.5">
            <p className="text-[10px] uppercase tracking-wider text-white font-bold">You</p>
          </div>
        </div>
        {/* PRO side — curated YouTube segment. Embed CAN fail (region
            block, owner disabled embed without removing video, etc),
            so we always offer "Open on YouTube" fallback below. */}
        <div className="bg-black aspect-video relative">
          <iframe
            src={ytSrc}
            title={`${proRef.player} ${proRef.shot_type}`}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
          <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-0.5">
            <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">{proRef.player}</p>
          </div>
        </div>
      </div>
      {proRef.description && (
        <div className="px-4 py-2 bg-zinc-800/30 border-t border-zinc-800 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-0.5">What to watch</p>
            <p className="text-xs text-zinc-300 leading-relaxed">{proRef.description}</p>
          </div>
          <a
            href={`https://www.youtube.com/watch?v=${proRef.youtube_id}&t=${Math.max(0, proRef.start_sec || 0)}s`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-amber-400 hover:text-amber-300 font-medium whitespace-nowrap shrink-0 mt-0.5"
            title="Open the pro reference clip directly on YouTube — useful if the embed above shows 'unavailable'"
          >
            Open on YouTube ↗
          </a>
        </div>
      )}
    </div>
  );
}

function PerShotCoachSection({ perShot, sport }) {
  // Filter to shots with VLM data — but keep each shot's ORIGINAL
  // index into perShot so card clicks map to the same _id the
  // VideoPlayerWithMarkers uses for active-shot tracking.
  const usable = perShot
    .map((s, originalIdx) => ({ shot: s, originalIdx }))
    .filter(({ shot }) => shot.reasoning || shot.formFeedback);
  if (usable.length === 0) return null;

  // Group when there are too many to list cleanly
  const shouldGroup = usable.length >= SHOT_GROUP_THRESHOLD;

  let groupedEntries = null;
  if (shouldGroup) {
    const groups = {};
    usable.forEach(({ shot, originalIdx }) => {
      const key = shot.label || shot.name || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push({ ...shot, _shotId: originalIdx });
    });
    groupedEntries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }

  return (
    <div className="pt-2 border-t border-zinc-800">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
        <Target className="w-3 h-3 text-lime-400" /> Per-shot AI coach feedback
        {shouldGroup && <span className="text-zinc-600 normal-case font-normal">· grouped by type ({usable.length} shots total)</span>}
      </p>
      <div className="space-y-2">
        {shouldGroup
          ? groupedEntries.map(([key, group]) => (
              <ShotGroupCard key={key} groupKey={key} shots={group} sport={sport} />
            ))
          : usable.map(({ shot, originalIdx }, i) => (
              <IndividualShotCard
                key={originalIdx}
                shot={shot}
                shotId={originalIdx}
                sport={sport}
                label={`Shot ${i + 1} · ${shot.name?.replace(/_/g, " ") || "Unknown"}`}
              />
            ))}
      </div>
    </div>
  );
}


function safeSeek(videoEl, t) {
  return new Promise((resolve) => {
    let done = false;
    const onSeeked = () => {
      if (done) return;
      done = true;
      videoEl.removeEventListener("seeked", onSeeked);
      resolve(true);
    };
    videoEl.addEventListener("seeked", onSeeked);
    try {
      videoEl.currentTime = t;
    } catch {
      done = true;
      videoEl.removeEventListener("seeked", onSeeked);
      resolve(false);
      return;
    }
    setTimeout(() => {
      if (done) return;
      done = true;
      videoEl.removeEventListener("seeked", onSeeked);
      resolve(false);
    }, SEEK_TIMEOUT_MS);
  });
}

function computeCropBox(w, h, position) {
  if (!position || position === "auto") return { x: 0, y: 0, w, h };
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const padX = Math.floor(halfW * 0.1);
  const padY = Math.floor(halfH * 0.1);
  const map = {
    "top-left":     { x: 0,     y: 0,     w: halfW, h: halfH },
    "top-right":    { x: halfW, y: 0,     w: halfW, h: halfH },
    "bottom-left":  { x: 0,     y: halfH, w: halfW, h: halfH },
    "bottom-right": { x: halfW, y: halfH, w: halfW, h: halfH },
  };
  const box = map[position];
  if (!box) return { x: 0, y: 0, w, h };
  return {
    x: Math.max(0, box.x - padX),
    y: Math.max(0, box.y - padY),
    w: Math.min(w - Math.max(0, box.x - padX), box.w + padX * 2),
    h: Math.min(h - Math.max(0, box.y - padY), box.h + padY * 2),
  };
}

function extractPoseQuality(poseSeq, frameW, frameH, durationSec) {
  const valid = poseSeq.filter(Boolean);
  if (valid.length < 2) return null;

  let leftSum = 0, rightSum = 0;
  for (const kp of valid) {
    leftSum += kp[KP.L_WRIST]?.score || 0;
    rightSum += kp[KP.R_WRIST]?.score || 0;
  }
  const useRight = rightSum >= leftSum;
  const wIdx = useRight ? KP.R_WRIST : KP.L_WRIST;
  const sIdx = useRight ? KP.R_SHOULDER : KP.L_SHOULDER;

  const wristXY = [];
  const armExt = [];
  for (const kp of valid) {
    const w = kp[wIdx];
    const s = kp[sIdx];
    if (!w || !s) continue;
    wristXY.push([w.x / frameW, w.y / frameH]);
    const dx = (w.x - s.x) / frameW;
    const dy = (w.y - s.y) / frameH;
    armExt.push(Math.sqrt(dx * dx + dy * dy));
  }
  if (wristXY.length < 2) return null;

  const dt = Math.max(0.05, durationSec) / Math.max(1, wristXY.length - 1);
  let peakSpeed = 0;
  for (let i = 1; i < wristXY.length; i++) {
    const dx = wristXY[i][0] - wristXY[i - 1][0];
    const dy = wristXY[i][1] - wristXY[i - 1][1];
    const v = Math.sqrt(dx * dx + dy * dy) / dt;
    if (v > peakSpeed) peakSpeed = v;
  }
  const speed = Math.min(1, peakSpeed / 3.0);
  const extension = Math.min(1, Math.max(...armExt) / 0.45);

  let smoothness = 1;
  if (wristXY.length >= 3) {
    const meanX = wristXY.reduce((s, p) => s + p[0], 0) / wristXY.length;
    const meanY = wristXY.reduce((s, p) => s + p[1], 0) / wristXY.length;
    const variance = wristXY.reduce((s, p) => s + (p[0] - meanX) ** 2 + (p[1] - meanY) ** 2, 0) / wristXY.length;
    smoothness = Math.max(0, 1 - variance * 8);
  }

  return { speed, extension, smoothness };
}

function groupByType(shots) {
  const out = {};
  for (const s of shots) {
    const k = s.label || "unknown";
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function buildPerTypeQuality(shots) {
  const groups = {};
  for (const s of shots) {
    if (!s.pose) continue;
    const k = s.label || "unknown";
    (groups[k] = groups[k] || []).push(s.pose);
  }
  const out = {};
  for (const [name, arr] of Object.entries(groups)) {
    if (arr.length === 0) continue;
    const avg = (k) => arr.reduce((sum, x) => sum + x[k], 0) / arr.length;
    const stddev = (k) => {
      if (arr.length < 2) return 0;
      const m = avg(k);
      return Math.sqrt(arr.reduce((sum, x) => sum + (x[k] - m) ** 2, 0) / arr.length);
    };
    const meanStd = (stddev("speed") + stddev("extension") + stddev("smoothness")) / 3;
    out[name] = {
      avg_smoothness: clamp01(avg("smoothness")),
      avg_speed: clamp01(avg("speed")),
      // Consistency only meaningful with ≥2 samples. For singletons, expose
      // smoothness as "form score" instead — the UI labels it separately.
      consistency: arr.length >= 2 ? clamp01(1 - meanStd * 2.5) : null,
      n: arr.length,
    };
  }
  return out;
}

function computeOverall(shots) {
  const valid = shots.filter((s) => s.pose);
  if (valid.length === 0) return { consistency: 0, avg_recovery_sec: null };
  const stddev = (k) => {
    if (valid.length < 2) return 0;
    const m = valid.reduce((s, x) => s + x.pose[k], 0) / valid.length;
    return Math.sqrt(valid.reduce((s, x) => s + (x.pose[k] - m) ** 2, 0) / valid.length);
  };
  const meanStd = (stddev("speed") + stddev("extension") + stddev("smoothness")) / 3;
  return { consistency: clamp01(1 - meanStd * 2.5), avg_recovery_sec: null };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
