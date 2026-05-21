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
import { useState, useMemo, useEffect, useRef } from "react";
import { TrendingUp, AlertCircle, Target, Loader2, Trophy, Zap, X, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import api from "@/lib/api";
import PoseOverlayModal from "@/components/PoseOverlayModal";


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
          label: s.type || s.shot_type || "unknown",
          name: s.name || s.shot_name || s.type || "unknown",
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

        merged.push({
          label: shot.type || "unknown",
          name: shot.name || shot.type || "unknown",
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
          // Thumbnail of the shot moment — visual proof of which player
          // the AI Coach attributed this shot to (esp. doubles videos).
          thumbnail: shot.thumbnail || null,
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
      // Don't await — let it resolve whenever, render when ready.
      api.post("/analysis/coaching-narrative", {
        sport,
        total_shots: merged.length,
        duration_sec: videoEl.duration || null,
        avg_recovery_sec: overallStats.avg_recovery_sec,
        overall_consistency: overallStats.consistency,
        distribution: dist,
        per_type_quality: ptq,
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

      {/* Embedded clip player. Per-shot card click uses
          data-playsmart-clip to find this <video> and seek to the moment. */}
      {playerUrl && (
        <video
          src={playerUrl}
          data-playsmart-clip
          controls
          playsInline
          className="w-full rounded-lg bg-black mb-4 max-h-72 object-contain"
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

function IndividualShotCard({ shot, label, sport }) {
  const ff = shot.formFeedback || {};
  const conf = shot.confidence != null ? Math.round(shot.confidence * 100) : null;
  const [proRef, setProRef] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [poseOpen, setPoseOpen] = useState(false);
  // AI Correct auto-generation state (per card). Fires on mount if
  // we have a thumbnail + timestamp; dedupe ref prevents re-fires on
  // re-renders.
  const [aiGenStatus, setAiGenStatus] = useState("idle"); // idle | running | done | failed
  const [aiGenMessage, setAiGenMessage] = useState("");
  const [aiGenVideoUrl, setAiGenVideoUrl] = useState(null);
  const aiGenFiredRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!sport || !shot.type) return;
    fetchProReference(sport, shot.type).then((ref) => {
      if (!cancelled && ref) setProRef(ref);
    });
    return () => { cancelled = true; };
  }, [sport, shot.type]);

  // Auto-generate the AI-corrected clip when the card mounts, IF the
  // shot has the data we need. Free-tier mode so we burn a generation
  // per shot. Cache de-dupes identical inputs server-side so re-
  // analysis returns the previous clip without re-charging.
  useEffect(() => {
    if (!shot.thumbnail || typeof shot.timestamp !== "number" || !sport) return;
    const fireKey = `${sport}::${shot.type || "shot"}::${shot.timestamp}`;
    if (aiGenFiredRef.current === fireKey) return;
    aiGenFiredRef.current = fireKey;

    let cancelled = false;
    (async () => {
      setAiGenStatus("running");
      setAiGenMessage("Generating AI-corrected clip…");
      try {
        const api = (await import("@/lib/api")).default;
        const { data } = await api.post("/generate-corrected-shot", {
          reference_image_b64: shot.thumbnail,
          timestamp_sec: shot.timestamp,
          sport,
          shot_type: shot.type || "shot",
        }, { timeout: 30000 });
        if (cancelled) return;
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
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const { data: poll } = await api.get(`/generate-corrected-shot/${jobId}`, { timeout: 8000 });
            if (cancelled) return;
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
        if (cancelled) return;
        setAiGenStatus("failed");
        setAiGenMessage(e.response?.data?.detail || e.message || "Generation failed.");
      }
    })();
    return () => { cancelled = true; };
  }, [shot.thumbnail, shot.timestamp, shot.type, sport]);

  const cleanLabel = String(label || "").replace(/\bShot at [\d.]+s\b/g, "").replace(/^\s*[·•]\s*/, "").trim() || "Shot";
  const strengths = Array.isArray(ff.strengths) ? ff.strengths.slice(0, 3) : [];
  const weaknesses = Array.isArray(ff.weaknesses) ? ff.weaknesses.slice(0, 3) : [];
  const headlineFix = ff.tip || weaknesses[0] || null;
  const scorePct = conf != null ? conf : 0;
  const scoreTone = scorePct >= 80 ? "text-lime-400"
    : scorePct >= 60 ? "text-sky-300"
    : scorePct >= 40 ? "text-amber-300"
    : "text-red-400";

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
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

      {/* TWO-COLUMN BODY: bullet feedback on the left, AI-generated
          video on the right. Stacks vertically on mobile. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-0">
        {/* LEFT COLUMN — bullet-pointed feedback */}
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

          {shot.reasoning && (
            <div className="pt-2 border-t border-zinc-800/60">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Coach's read</p>
              <p className="text-[12px] text-zinc-300 leading-relaxed">{shot.reasoning}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-zinc-800/60">
            {shot.thumbnail && (
              <button
                onClick={() => setPoseOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-lime-400 hover:text-lime-300 bg-lime-400/10 border border-lime-400/30 rounded-full px-2.5 py-1 transition-colors"
              >
                <Activity className="w-3 h-3" /> See your form
              </button>
            )}
            {proRef && (
              <button
                onClick={() => setCompareOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-2.5 py-1 transition-colors"
              >
                <Trophy className="w-3 h-3" /> Compare to {proRef.player?.split(/\s+/)[0] || "Pro"}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — AI-generated corrected swing */}
        <div className="bg-zinc-950/40 border-t md:border-t-0 md:border-l border-zinc-800 p-3 flex flex-col">
          <p className="text-[10px] uppercase tracking-wider text-purple-300 font-bold mb-2 flex items-center gap-1">
            ✨ AI-corrected swing
          </p>
          {aiGenStatus === "running" && (
            <div className="flex-1 bg-zinc-900/60 border border-purple-400/20 rounded-lg flex flex-col items-center justify-center p-4 min-h-[160px]">
              <Loader2 className="w-5 h-5 text-purple-300 animate-spin mb-2" />
              <p className="text-[11px] text-zinc-400 text-center">{aiGenMessage || "Generating…"}</p>
              <p className="text-[9px] text-zinc-600 mt-1">~75 seconds typically</p>
            </div>
          )}
          {aiGenStatus === "done" && aiGenVideoUrl && (
            <>
              <video
                src={aiGenVideoUrl}
                controls loop muted autoPlay playsInline
                className="w-full bg-black rounded-lg"
                data-playsmart-ai-correct
              />
              <p className="text-[9px] text-zinc-500 leading-tight mt-1.5">
                AI synthesized — focus on body motion, not the racket (model limitation).
              </p>
              <a
                href={aiGenVideoUrl} target="_blank" rel="noopener noreferrer" download
                className="text-[9px] text-purple-300 hover:text-purple-200 mt-0.5 inline-block"
              >
                Download ↗
              </a>
            </>
          )}
          {aiGenStatus === "failed" && (
            <div className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 min-h-[160px]">
              <p className="text-[11px] text-zinc-400 leading-relaxed">{aiGenMessage || "Not available right now."}</p>
            </div>
          )}
          {aiGenStatus === "idle" && (
            <div className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 min-h-[160px] flex items-center justify-center">
              <p className="text-[11px] text-zinc-600 text-center">Waiting for shot data…</p>
            </div>
          )}
        </div>
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
    </div>
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

  // Auto-fire AI generation once per (sport, shot type, timestamp)
  // when the group has a usable source frame. Free tier so we burn a
  // generation per shot group; backend caches identical inputs.
  useEffect(() => {
    if (!aiSourceShot || !sport) return;
    const ts = aiSourceShot.timestamp;
    const thumb = aiSourceShot.thumbnail;
    const fireKey = `${sport}::${sample.type || "shot"}::${ts}`;
    if (aiGenFiredRef.current === fireKey) return;
    aiGenFiredRef.current = fireKey;

    let cancelled = false;
    (async () => {
      setAiGenStatus("running");
      setAiGenMessage("Generating AI-corrected clip…");
      try {
        const api = (await import("@/lib/api")).default;
        const { data } = await api.post("/generate-corrected-shot", {
          reference_image_b64: thumb,
          timestamp_sec: ts,
          sport,
          shot_type: sample.type || "shot",
        }, { timeout: 30000 });
        if (cancelled) return;
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
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const { data: poll } = await api.get(`/generate-corrected-shot/${jobId}`, { timeout: 8000 });
            if (cancelled) return;
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
        if (cancelled) return;
        setAiGenStatus("failed");
        setAiGenMessage(e.response?.data?.detail || e.message || "Generation failed.");
      }
    })();
    return () => { cancelled = true; };
  }, [aiSourceShot?.thumbnail, aiSourceShot?.timestamp, sample.type, sport]);

  const headlineFix = tips[0] || weaknesses[0] || null;
  const scorePct = Math.round(avgConf * 100);
  const scoreTone = scorePct >= 80 ? "text-lime-400"
    : scorePct >= 60 ? "text-sky-300"
    : scorePct >= 40 ? "text-amber-300"
    : "text-red-400";

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
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

      {/* TWO-COLUMN BODY: bullet feedback on the left, AI-generated
          video on the right. Stacks vertically on mobile. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-0">
        {/* LEFT COLUMN — bullet-pointed feedback */}
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

          {reasoning && (
            <div className="pt-2 border-t border-zinc-800/60">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Coach's read</p>
              <p className="text-[12px] text-zinc-300 leading-relaxed">{reasoning}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-zinc-800/60">
            {heroShot?.thumbnail && (
              <button
                onClick={() => setPoseOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-lime-400 hover:text-lime-300 bg-lime-400/10 border border-lime-400/30 rounded-full px-2.5 py-1 transition-colors"
              >
                <Activity className="w-3 h-3" /> See your form
              </button>
            )}
            {proRef && (
              <button
                onClick={() => setCompareOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-2.5 py-1 transition-colors"
              >
                <Trophy className="w-3 h-3" /> Compare to {proRef.player?.split(/\s+/)[0] || "Pro"}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — AI-generated corrected swing */}
        <div className="bg-zinc-950/40 border-t md:border-t-0 md:border-l border-zinc-800 p-3 flex flex-col">
          <p className="text-[10px] uppercase tracking-wider text-purple-300 font-bold mb-2 flex items-center gap-1">
            ✨ AI-corrected swing
          </p>
          {aiGenStatus === "running" && (
            <div className="flex-1 bg-zinc-900/60 border border-purple-400/20 rounded-lg flex flex-col items-center justify-center p-4 min-h-[160px]">
              <Loader2 className="w-5 h-5 text-purple-300 animate-spin mb-2" />
              <p className="text-[11px] text-zinc-400 text-center">{aiGenMessage || "Generating…"}</p>
              <p className="text-[9px] text-zinc-600 mt-1">~75 seconds typically</p>
            </div>
          )}
          {aiGenStatus === "done" && aiGenVideoUrl && (
            <>
              <video
                src={aiGenVideoUrl}
                controls loop muted autoPlay playsInline
                className="w-full bg-black rounded-lg"
                data-playsmart-ai-correct
              />
              <p className="text-[9px] text-zinc-500 leading-tight mt-1.5">
                AI synthesized — focus on body motion, not the racket (model limitation).
              </p>
              <a
                href={aiGenVideoUrl} target="_blank" rel="noopener noreferrer" download
                className="text-[9px] text-purple-300 hover:text-purple-200 mt-0.5 inline-block"
              >
                Download ↗
              </a>
            </>
          )}
          {aiGenStatus === "failed" && (
            <div className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 min-h-[160px]">
              <p className="text-[11px] text-zinc-400 leading-relaxed">{aiGenMessage || "Not available right now."}</p>
            </div>
          )}
          {aiGenStatus === "idle" && (
            <div className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 min-h-[160px] flex items-center justify-center">
              <p className="text-[11px] text-zinc-600 text-center">
                {aiSourceShot ? "Waiting for shot data…" : "No reference frame available for this group."}
              </p>
            </div>
          )}
        </div>
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
    </div>
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
  // Auto-AI-Correct state: runs ONCE per headline shot when both the
  // shot + sport + thumbnail are ready. Free tier so we burn the
  // generation as a default ("here's your corrected smash") rather
  // than gating behind a click.
  const [autoGenStatus, setAutoGenStatus] = useState("idle"); // idle | running | done | failed
  const [autoGenMessage, setAutoGenMessage] = useState("");
  const [autoGenVideoUrl, setAutoGenVideoUrl] = useState(null);
  const autoGenFiredRef = useRef(null);

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

  // Auto-trigger ONE AI Correct generation for the headline shot when
  // analysis completes. We're on Replicate's free tier so it's safe to
  // burn one generation per analysis as the default "here's your
  // corrected swing" output. Manual per-shot buttons still work for
  // additional generations.
  useEffect(() => {
    if (!headlineShot || !sport) return;
    if (!headlineShot.thumbnail || typeof headlineShot.timestamp !== "number") return;
    // Dedupe: only fire once per (shot, sport) combination per mount
    const fireKey = `${sport}::${headlineShot.type || headlineShot.label}::${headlineShot.timestamp}`;
    if (autoGenFiredRef.current === fireKey) return;
    autoGenFiredRef.current = fireKey;

    let cancelled = false;
    (async () => {
      setAutoGenStatus("running");
      setAutoGenMessage("Generating your AI-corrected swing…");
      setAutoGenVideoUrl(null);
      try {
        const api = (await import("@/lib/api")).default;
        const { data } = await api.post("/generate-corrected-shot", {
          reference_image_b64: headlineShot.thumbnail,
          timestamp_sec: headlineShot.timestamp,
          sport,
          shot_type: headlineShot.type || headlineShot.label || "shot",
        }, { timeout: 30000 });

        if (cancelled) return;
        if (data?.status === "feature_unavailable") {
          setAutoGenStatus("failed");
          setAutoGenMessage(data.message || "");
          return;
        }
        if (data?.status === "done" && data?.video_url) {
          setAutoGenStatus("done");
          setAutoGenVideoUrl(data.video_url);
          setAutoGenMessage(data.cached ? "Loaded from previous generation." : "Done!");
          return;
        }
        const jobId = data?.job_id;
        if (!jobId) throw new Error("No job_id returned");

        // Poll up to ~4 minutes
        for (let i = 0; i < 80; i++) {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const { data: poll } = await api.get(`/generate-corrected-shot/${jobId}`, { timeout: 8000 });
            if (cancelled) return;
            if (poll?.status === "done" && poll?.video_url) {
              setAutoGenStatus("done");
              setAutoGenVideoUrl(poll.video_url);
              setAutoGenMessage("Your AI-corrected swing is ready.");
              return;
            }
            if (poll?.status === "failed") {
              setAutoGenStatus("failed");
              setAutoGenMessage(poll.error || "Generation failed — tokens refunded.");
              return;
            }
          } catch { /* keep polling */ }
        }
        setAutoGenStatus("failed");
        setAutoGenMessage("Generation taking longer than expected.");
      } catch (e) {
        if (cancelled) return;
        setAutoGenStatus("failed");
        setAutoGenMessage(e.response?.data?.detail || e.message || "Generation failed.");
      }
    })();
    return () => { cancelled = true; };
  }, [headlineShot, sport]);

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
          The AI-corrected version of your swing appears below once it finishes generating.
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
      {/* Auto-generated AI Correct clip — fires once per analysis on
          the headline shot. Free tier so we burn it as a default
          rather than gating behind a click. */}
      {autoGenStatus !== "idle" && (
        <div className="border-t border-amber-400/20">
          <div className="px-4 py-2 bg-purple-400/5 flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-wider text-purple-300 font-bold flex items-center gap-1">
              ✨ AI-corrected version of your swing
              {autoGenStatus === "running" && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
            </p>
            {autoGenMessage && (
              <p className="text-[11px] text-zinc-400 ml-auto">{autoGenMessage}</p>
            )}
          </div>
          {autoGenStatus === "running" && (
            <div className="px-4 py-6 bg-zinc-900/40 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-purple-300 animate-spin" />
              <p className="text-[11px] text-zinc-400">Generating — usually ~75 seconds…</p>
            </div>
          )}
          {autoGenStatus === "done" && autoGenVideoUrl && (
            <>
              <video
                src={autoGenVideoUrl}
                controls loop muted autoPlay playsInline
                className="w-full bg-black"
                data-playsmart-ai-correct
              />
              <div className="px-4 py-2 bg-zinc-900/40">
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  <span className="text-purple-300 font-bold">How to read this:</span> An AI
                  synthesized this clip from your contact frame to show what the corrected
                  swing would look like in YOUR body. It's NOT real footage — hands holding
                  the racket are often distorted (model limitation). Focus on the BODY motion:
                  torso rotation, hip drive, arm extension at contact.
                </p>
                <a
                  href={autoGenVideoUrl} target="_blank" rel="noopener noreferrer" download
                  className="text-[10px] text-purple-300 hover:text-purple-200 mt-1 inline-block"
                >
                  Open / download full-size ↗
                </a>
              </div>
            </>
          )}
          {autoGenStatus === "failed" && (
            <div className="px-4 py-2 bg-zinc-900/40">
              <p className="text-[11px] text-zinc-500">
                {autoGenMessage || "AI Correct isn't available right now."} The pro reference
                above still works normally.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PerShotCoachSection({ perShot, sport }) {
  // Filter to shots with VLM data
  const usable = perShot.filter((s) => s.reasoning || s.formFeedback);
  if (usable.length === 0) return null;

  // Group when there are too many to list cleanly
  const shouldGroup = usable.length >= SHOT_GROUP_THRESHOLD;

  let groupedEntries = null;
  if (shouldGroup) {
    const groups = {};
    usable.forEach((s) => {
      const key = s.label || s.name || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
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
          : usable.map((s, i) => (
              <IndividualShotCard
                key={i} shot={s} sport={sport}
                label={`Shot ${i + 1} · ${s.name?.replace(/_/g, " ") || "Unknown"}`}
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
