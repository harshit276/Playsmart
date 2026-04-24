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

export default function MatchInsights({ videoFile, shots: shotsProp, sport = "badminton", playerPosition = "auto" }) {
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

  useEffect(() => {
    if (!videoFile || !shotsAvailable) return;
    const key = `${videoFile.name}-${videoFile.size}-${videoFile.lastModified}-${shotsProp.length}`;
    if (ranKeyRef.current === key) return;
    ranKeyRef.current = key;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFile, shotsAvailable]);

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
      videoEl.src = URL.createObjectURL(videoFile);
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.preload = "auto";
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Video metadata load timed out")), 8000);
        videoEl.onloadedmetadata = () => { clearTimeout(t); resolve(); };
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

      // Coaching narrative
      setPhase("narrating");
      setProgress(95);
      setProgressMsg("Generating coaching feedback…");
      const dist = groupByType(merged);
      const ptq = buildPerTypeQuality(merged);
      try {
        const { data } = await api.post("/analysis/coaching-narrative", {
          sport,
          total_shots: merged.length,
          duration_sec: videoEl.duration || null,
          avg_recovery_sec: overallStats.avg_recovery_sec,
          overall_consistency: overallStats.consistency,
          distribution: dist,
          per_type_quality: ptq,
        }, { timeout: 25000 });
        setNarrative(data);
      } catch (e) {
        console.warn("narrative failed", e);
      }

      setProgress(100);
      setPhase("done");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Match analysis failed");
      setPhase("error");
    }
  };

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

          {/* Headline — overall consistency */}
          <div className="bg-zinc-800/50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Overall technique consistency</p>
            <p className="text-3xl font-bold text-lime-400 mt-1">
              {overall ? Math.round(overall.consistency * 100) : 0}<span className="text-zinc-500 text-lg font-normal">%</span>
            </p>
            <p className="text-[10px] text-zinc-600 mt-1">
              How repeatable your motion is across all shots — higher means muscle memory is forming.
            </p>
          </div>

          {/* Per-type consistency */}
          {populatedTypes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Consistency by shot type</p>
              <div className="space-y-1.5">
                {populatedTypes
                  .sort((a, b) => (perTypeQuality[b].consistency || 0) - (perTypeQuality[a].consistency || 0))
                  .map((name, i) => {
                    const q = perTypeQuality[name];
                    const consist = Math.round(q.consistency * 100);
                    const color = SHOT_COLORS[i % SHOT_COLORS.length];
                    const barColor = consist >= 70 ? "bg-lime-400" : consist >= 50 ? "bg-amber-400" : "bg-red-400";
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${color} w-24 text-center`}>
                          {name.replace(/_/g, " ")}
                        </span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor}`} style={{ width: `${consist}%` }} />
                        </div>
                        <div className="w-12 text-right text-[11px] text-zinc-300 font-mono">{consist}%</div>
                      </div>
                    );
                  })}
              </div>
            </div>
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
      consistency: clamp01(arr.length === 1 ? avg("smoothness") : 1 - meanStd * 2.5),
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
