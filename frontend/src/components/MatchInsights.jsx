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
import { TrendingUp, AlertCircle, Target, Loader2, Trophy, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import api from "@/lib/api";

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
  fallbackSkillLevel = null,  // top-level skill from AnalyzePage, used when
                              // per-shot vlmSkill is empty across all shots
}) {
  const [phase, setPhase] = useState("idle"); // idle | extracting | narrating | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [perShot, setPerShot] = useState([]); // [{ label, pose: {speed, extension, smoothness} | null }]
  const [overall, setOverall] = useState(null);
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
              const speeds = perShot.map((s) => Number(s.speed) || 0).filter((v) => v > 0);
              const avgSpeed = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
              const peakSpeed = speeds.length ? Math.max(...speeds) : null;
              const types = new Set(perShot.map((s) => s.label).filter(Boolean));
              const levelTone = topLevel === "Pro" ? "text-amber-300"
                : topLevel === "Advanced" ? "text-lime-300"
                : topLevel === "Intermediate" ? "text-sky-300"
                : "text-zinc-300";
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-zinc-800/50 rounded-xl p-3">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Shots</p>
                    <p className="text-xl font-bold text-white mt-0.5">{perShot.length}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{types.size} {types.size === 1 ? "type" : "types"}</p>
                  </div>
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
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Avg Speed</p>
                    <p className="text-xl font-bold text-white mt-0.5">{avgSpeed != null ? `${avgSpeed}` : "—"}<span className="text-xs text-zinc-500 font-normal ml-1">km/h</span></p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{peakSpeed != null ? `Peak ${peakSpeed}` : ""}</p>
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
          {perShot.some((s) => s.reasoning || s.formFeedback) && (
            <PerShotCoachSection perShot={perShot} />
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

function _seekToShot(timestamp) {
  if (typeof timestamp !== "number") return;
  window.dispatchEvent(new CustomEvent("playsmart:seek", { detail: { time: timestamp } }));
  const v = document.querySelector("video[data-playsmart-clip]");
  if (v) { try { v.currentTime = Math.max(0, timestamp); v.play?.(); } catch {} }
}

function IndividualShotCard({ shot, label }) {
  const ff = shot.formFeedback || {};
  const conf = shot.confidence != null ? Math.round(shot.confidence * 100) : null;
  const ts = typeof shot.timestamp === "number" ? shot.timestamp : null;
  const onSeek = ts != null ? () => _seekToShot(ts) : null;
  return (
    <div
      className={`bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 ${onSeek ? "cursor-pointer hover:border-lime-400/40 transition-colors" : ""}`}
      onClick={onSeek || undefined}
      title={onSeek ? `Jump to ${ts.toFixed(1)}s in the video` : undefined}
    >
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
        <div className="flex items-center gap-2 min-w-0">
          {shot.thumbnail && (
            <img
              src={shot.thumbnail}
              alt={`Player at ${ts != null ? ts.toFixed(1) + 's' : 'shot moment'}`}
              className="shrink-0 rounded-md w-12 h-12 object-cover bg-black border border-zinc-800"
              loading="lazy"
            />
          )}
          <p className="text-sm font-semibold text-white truncate">{label}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {conf != null && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              conf >= 80 ? "bg-lime-400/15 text-lime-300"
              : conf >= 50 ? "bg-amber-400/15 text-amber-300"
              : "bg-zinc-800 text-zinc-400"}`}>{conf}%</span>
          )}
          {shot.powerLevel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-300 capitalize">
              {shot.powerLevel}
            </span>
          )}
          {shot.speed != null && shot.speed > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
              {Math.round(shot.speed)} km/h
            </span>
          )}
        </div>
      </div>
      {shot.reasoning && (
        <p className="text-xs text-zinc-300 mb-2">
          <span className="text-lime-400/80">Coach:</span> {shot.reasoning}
        </p>
      )}
      {ff.tip && (<p className="text-xs text-amber-300 mb-2">💡 {ff.tip}</p>)}
      {Array.isArray(ff.strengths) && ff.strengths.length > 0 && (
        <ul className="space-y-0.5 mb-1">
          {ff.strengths.slice(0, 3).map((x, j) => (
            <li key={`s-${j}`} className="text-[11px] text-zinc-400 flex gap-1.5"><span className="text-lime-400">✓</span><span>{x}</span></li>
          ))}
        </ul>
      )}
      {Array.isArray(ff.weaknesses) && ff.weaknesses.length > 0 && (
        <ul className="space-y-0.5">
          {ff.weaknesses.slice(0, 3).map((x, j) => (
            <li key={`w-${j}`} className="text-[11px] text-zinc-400 flex gap-1.5"><span className="text-amber-400">⚠</span><span>{x}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ShotGroupCard({ groupKey, shots: groupShots }) {
  const [expanded, setExpanded] = useState(false);
  const sample = groupShots[0];
  const name = sample.name?.replace(/_/g, " ") || groupKey;
  const count = groupShots.length;

  // Aggregate stats
  const speeds = groupShots.map((s) => Number(s.speed) || 0).filter((v) => v > 0);
  const peakSpeed = speeds.length ? Math.max(...speeds) : 0;
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

  // Strip of thumbnails — visual proof of the shots in this group. Click any
  // thumbnail to seek to that moment.
  const thumbedShots = groupShots.filter((s) => s.thumbnail).slice(0, 6);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden">
      {thumbedShots.length > 0 && (
        <div className="flex gap-1 p-2 bg-black/40 overflow-x-auto">
          {thumbedShots.map((s, i) => {
            const ts = typeof s.timestamp === "number" ? s.timestamp : null;
            return (
              <button
                key={i}
                type="button"
                onClick={ts != null ? (e) => { e.stopPropagation(); _seekToShot(ts); } : undefined}
                className="shrink-0 rounded overflow-hidden border border-zinc-800 hover:border-lime-400/40 transition-colors"
                title={ts != null ? `Jump to ${ts.toFixed(1)}s` : ""}
              >
                <img src={s.thumbnail} alt={`${name} ${i + 1}`}
                     className="h-16 w-24 object-cover" loading="lazy" />
              </button>
            );
          })}
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
          <p className="text-sm font-semibold text-white capitalize">
            {count} {name}{count === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-lime-400/15 text-lime-300">
              avg {Math.round(avgConf * 100)}%
            </span>
            {peakSpeed > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                peak {Math.round(peakSpeed)} km/h
              </span>
            )}
          </div>
        </div>
        {reasoning && (
          <p className="text-xs text-zinc-300 mb-2">
            <span className="text-lime-400/80">Coach (across {count} {name}{count === 1 ? "" : "s"}):</span> {reasoning}
          </p>
        )}
        {tips.length > 0 && tips.map((t, i) => (
          <p key={`t-${i}`} className="text-xs text-amber-300 mb-1">💡 {t}</p>
        ))}
        {strengths.length > 0 && (
          <ul className="space-y-0.5 mt-2 mb-1">
            {strengths.map((x, j) => (
              <li key={`s-${j}`} className="text-[11px] text-zinc-400 flex gap-1.5"><span className="text-lime-400">✓</span><span>{x}</span></li>
            ))}
          </ul>
        )}
        {weaknesses.length > 0 && (
          <ul className="space-y-0.5">
            {weaknesses.map((x, j) => (
              <li key={`w-${j}`} className="text-[11px] text-zinc-400 flex gap-1.5"><span className="text-amber-400">⚠</span><span>{x}</span></li>
            ))}
          </ul>
        )}
        <button
          className="text-[11px] text-sky-400 hover:text-sky-300 mt-2"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide" : `View all ${count}`} individual {name}{count === 1 ? "" : "s"} {expanded ? "▲" : "▼"}
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-800/50">
          {groupShots.map((s, i) => (
            <IndividualShotCard
              key={i} shot={s}
              label={`Shot at ${typeof s.timestamp === "number" ? s.timestamp.toFixed(1) + "s" : `#${i + 1}`}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PerShotCoachSection({ perShot }) {
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
              <ShotGroupCard key={key} groupKey={key} shots={group} />
            ))
          : usable.map((s, i) => (
              <IndividualShotCard
                key={i} shot={s}
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
