/**
 * MatchInsights — analyzes the uploaded video by:
 *   1. Detecting shot moments (motion-peak based)
 *   2. Running MoveNet on each shot's frames in-browser
 *   3. Computing real pose-derived characteristics per shot:
 *        - wrist peak speed (normalized 0-1)
 *        - arm extension (normalized 0-1)
 *        - overheadness (0-1)
 *        - follow-through smoothness (0-1)
 *   4. Bucketing shots into descriptive clusters by characteristics
 *      (powerful_overhead / soft_overhead / flat_drive / defensive_lift /
 *       low_touch). NOT shot-type classification — we describe motion.
 *   5. Computing per-cluster consistency (1 - normalized stddev)
 *   6. Sending the cluster summary to /api/analysis/coaching-narrative
 *      for an LLM-generated breakdown
 *
 * No trained classifier required. No API call per shot. All measurement
 * happens in the browser; backend is only used for the narrative step.
 */
import { useState, useMemo, useEffect } from "react";
import { Sparkles, TrendingUp, AlertCircle, Target, Loader2, Trophy, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import api from "@/lib/api";

const FRAMES_PER_SHOT = 12;

// MoveNet keypoint indices (the joints we care about)
const KP = {
  L_SHOULDER: 5, R_SHOULDER: 6,
  L_ELBOW: 7,    R_ELBOW: 8,
  L_WRIST: 9,    R_WRIST: 10,
  L_HIP: 11,     R_HIP: 12,
};

const CLUSTER_LABELS = {
  powerful_overhead: { label: "Powerful overhead", color: "bg-red-400/80 text-black" },
  soft_overhead:     { label: "Soft overhead",     color: "bg-cyan-400/80 text-black" },
  flat_drive:        { label: "Flat drive",        color: "bg-amber-400/80 text-black" },
  defensive_lift:    { label: "Defensive lift",    color: "bg-blue-400/80 text-black" },
  low_touch:         { label: "Low touch",         color: "bg-emerald-400/80 text-black" },
};

export default function MatchInsights({ videoFile, sport = "badminton", playerPosition = "auto" }) {
  const [phase, setPhase] = useState("idle"); // idle | scanning | extracting | narrating | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [shots, setShots] = useState([]);            // per-shot characteristics
  const [clusters, setClusters] = useState({});      // bucketed
  const [overall, setOverall] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => () => setShots([]), []);

  const totalShots = shots.length;
  const populated = useMemo(
    () => Object.fromEntries(Object.entries(clusters).filter(([, c]) => c.count > 0)),
    [clusters],
  );

  const run = async () => {
    if (!videoFile) return;
    setPhase("scanning");
    setProgress(0);
    setShots([]);
    setNarrative(null);
    setErrorMsg(null);

    try {
      // ─── 1. Detect shot moments ──────────────────────────────────
      setProgressMsg("Detecting shot moments…");
      const { extractShotMoments } = await import("@/ai/shotMomentExtractor");
      const result = await extractShotMoments(videoFile, {
        onProgress: ({ percent, message }) => {
          setProgress(Math.round(percent * 0.20));
          if (message) setProgressMsg(message);
        },
      });
      if (!result.clips.length) throw new Error("No shot moments detected");

      // ─── 2. Init MoveNet in-browser ──────────────────────────────
      setPhase("extracting");
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

      // ─── 3. Setup video + canvas (with optional doubles crop) ────
      const videoEl = document.createElement("video");
      videoEl.src = URL.createObjectURL(videoFile);
      videoEl.muted = true;
      videoEl.playsInline = true;
      await new Promise((r, e) => { videoEl.onloadedmetadata = r; videoEl.onerror = e; });
      const W = videoEl.videoWidth || 640;
      const H = videoEl.videoHeight || 360;
      const cropBox = computeCropBox(W, H, playerPosition);
      const canvas = document.createElement("canvas");
      canvas.width = cropBox.w;
      canvas.height = cropBox.h;
      const ctx = canvas.getContext("2d");

      // ─── 4. Per-shot characteristic extraction ───────────────────
      const shotData = [];
      for (let si = 0; si < result.clips.length; si++) {
        const clip = result.clips[si];
        const times = [];
        for (let k = 0; k < FRAMES_PER_SHOT; k++) {
          times.push(clip.start + (clip.end - clip.start) * (k / (FRAMES_PER_SHOT - 1)));
        }

        const poseSeq = []; // [{wrist_x, wrist_y, shoulder_x, shoulder_y, hip_y, dom}]
        for (const t of times) {
          videoEl.currentTime = t;
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => { videoEl.onseeked = r; });
          ctx.drawImage(
            videoEl,
            cropBox.x, cropBox.y, cropBox.w, cropBox.h,
            0, 0, cropBox.w, cropBox.h,
          );
          // eslint-disable-next-line no-await-in-loop
          const poses = await detector.estimatePoses(canvas);
          if (!poses?.[0]?.keypoints) {
            poseSeq.push(null);
            continue;
          }
          poseSeq.push(poses[0].keypoints);
        }

        const chars = extractCharacteristics(poseSeq, cropBox.w, cropBox.h, clip.end - clip.start);
        if (chars) {
          shotData.push({ ...chars, start: clip.start, end: clip.end });
        }

        const pct = 20 + Math.round(((si + 1) / result.clips.length) * 65);
        setProgress(pct);
        setProgressMsg(`Analyzing motion ${si + 1}/${result.clips.length}`);
        setShots([...shotData]);
      }
      detector.dispose();
      URL.revokeObjectURL(videoEl.src);

      // ─── 5. Cluster shots ────────────────────────────────────────
      const clustered = clusterShots(shotData);
      setClusters(clustered);

      // Overall metrics
      const overallStats = computeOverall(shotData, videoEl.duration);
      setOverall(overallStats);

      // ─── 6. Backend narrative ────────────────────────────────────
      setPhase("narrating");
      setProgress(95);
      setProgressMsg("Generating coaching feedback…");
      try {
        const { data } = await api.post("/analysis/coaching-narrative", {
          sport,
          total_shots: shotData.length,
          duration_sec: videoEl.duration || null,
          avg_recovery_sec: overallStats.avg_recovery_sec,
          overall_consistency: overallStats.consistency,
          clusters: Object.fromEntries(
            Object.entries(clustered).map(([name, stats]) => [
              name,
              {
                count: stats.count,
                avg_speed: stats.avg_speed,
                avg_extension: stats.avg_extension,
                consistency: stats.consistency,
              },
            ]),
          ),
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

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-base flex items-center gap-2">
          <Trophy className="w-5 h-5 text-lime-400" />
          Match Insights
        </h3>
        {phase === "idle" && (
          <button onClick={run}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-lime-400 hover:bg-lime-300 text-black">
            Analyze whole match
          </button>
        )}
      </div>

      {phase === "idle" && (
        <p className="text-xs text-zinc-500">
          Detects every shot in your video, measures pose dynamics for each, groups them by motion pattern, and gives you grounded coaching feedback. No shot-type guessing — we describe what we actually measure.
        </p>
      )}

      {(phase === "scanning" || phase === "extracting" || phase === "narrating") && (
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

      {(phase === "done" || phase === "narrating") && totalShots > 0 && (
        <div className="space-y-4">
          {/* Headline stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Shots</p>
              <p className="text-2xl font-bold text-white mt-1">{totalShots}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Patterns</p>
              <p className="text-2xl font-bold text-white mt-1">{Object.keys(populated).length}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Consistency</p>
              <p className="text-2xl font-bold text-lime-400 mt-1">
                {overall ? Math.round(overall.consistency * 100) : 0}<span className="text-zinc-500 text-sm font-normal">%</span>
              </p>
            </div>
          </div>

          {/* Clusters */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Motion patterns detected</p>
            <div className="space-y-1.5">
              {Object.entries(populated)
                .sort(([, a], [, b]) => b.count - a.count)
                .map(([name, stats]) => {
                  const display = CLUSTER_LABELS[name] || { label: name, color: "bg-zinc-600 text-white" };
                  const pct = totalShots ? (stats.count / totalShots) * 100 : 0;
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${display.color} w-32 text-center`}>
                        {display.label}
                      </span>
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-400" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-12 text-right text-[11px] text-zinc-400 font-mono">{stats.count}×</div>
                      <div className="w-14 text-right text-[10px] text-zinc-500 font-mono">
                        {Math.round(stats.consistency * 100)}%
                      </div>
                    </div>
                  );
                })}
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">Last column = consistency within that pattern (higher = more repeatable technique)</p>
          </div>

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

      {phase === "done" && totalShots === 0 && (
        <p className="text-xs text-zinc-500">No shot moments detected in this video.</p>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────

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

/**
 * For one shot's pose sequence, derive the characteristics we need.
 * Returns null if the pose data is too sparse to be reliable.
 */
function extractCharacteristics(poseSeq, frameW, frameH, durationSec) {
  const valid = poseSeq.filter(Boolean);
  if (valid.length < 6) return null;   // need enough frames to measure speed

  // Pick dominant wrist by visibility across the sequence
  let leftSum = 0, rightSum = 0;
  for (const kp of valid) {
    leftSum += kp[KP.L_WRIST]?.score || 0;
    rightSum += kp[KP.R_WRIST]?.score || 0;
  }
  const useRight = rightSum >= leftSum;
  const wIdx = useRight ? KP.R_WRIST : KP.L_WRIST;
  const sIdx = useRight ? KP.R_SHOULDER : KP.L_SHOULDER;
  const hIdx = useRight ? KP.R_HIP : KP.L_HIP;

  // Per-frame metrics
  const wristXY = []; // normalized [0,1]
  const armExt = [];  // shoulder→wrist distance, normalized
  const overhead = []; // wrist above shoulder?
  const lowPosition = []; // wrist below hip?
  for (const kp of valid) {
    const w = kp[wIdx];
    const s = kp[sIdx];
    const h = kp[hIdx];
    if (!w || !s) continue;
    wristXY.push([w.x / frameW, w.y / frameH]);
    const dx = (w.x - s.x) / frameW;
    const dy = (w.y - s.y) / frameH;
    armExt.push(Math.sqrt(dx * dx + dy * dy));
    overhead.push(w.y < s.y);
    if (h) lowPosition.push(w.y > h.y);
  }
  if (wristXY.length < 4) return null;

  // Wrist peak speed (units / sec, then clamp 0-1)
  const dt = durationSec / Math.max(1, wristXY.length - 1);
  let peakSpeed = 0;
  for (let i = 1; i < wristXY.length; i++) {
    const dx = wristXY[i][0] - wristXY[i - 1][0];
    const dy = wristXY[i][1] - wristXY[i - 1][1];
    const v = Math.sqrt(dx * dx + dy * dy) / dt;
    if (v > peakSpeed) peakSpeed = v;
  }
  const peakSpeedNorm = Math.min(1, peakSpeed / 3.0);  // 3.0 units/sec ≈ saturated

  // Arm extension (max)
  const armExtMax = Math.max(...armExt);
  const armExtNorm = Math.min(1, armExtMax / 0.45);  // ~0.45 = arm fully extended

  // Overheadness fraction
  const overheadFrac = overhead.filter(Boolean).length / overhead.length;
  const lowFrac = lowPosition.length ? lowPosition.filter(Boolean).length / lowPosition.length : 0;

  // Follow-through smoothness — variance of wrist positions in last 30% of frames
  const tailStart = Math.floor(wristXY.length * 0.7);
  const tail = wristXY.slice(tailStart);
  let tailVar = 0;
  if (tail.length > 1) {
    const meanX = tail.reduce((s, p) => s + p[0], 0) / tail.length;
    const meanY = tail.reduce((s, p) => s + p[1], 0) / tail.length;
    tailVar = tail.reduce((s, p) => s + (p[0] - meanX) ** 2 + (p[1] - meanY) ** 2, 0) / tail.length;
  }
  const smoothness = Math.max(0, 1 - tailVar * 30);  // less variance = smoother

  return {
    speed: peakSpeedNorm,
    extension: armExtNorm,
    overhead: overheadFrac,
    low: lowFrac,
    smoothness,
  };
}

/**
 * Bucket shots into descriptive clusters by their characteristic
 * fingerprint. Rule-based, deterministic, no ML.
 */
function clusterShots(shotData) {
  const buckets = {
    powerful_overhead: [],
    soft_overhead:     [],
    flat_drive:        [],
    defensive_lift:    [],
    low_touch:         [],
  };
  for (const s of shotData) {
    let bucket;
    if (s.overhead >= 0.5 && s.speed >= 0.45) bucket = "powerful_overhead";
    else if (s.overhead >= 0.5 && s.speed < 0.45) bucket = "soft_overhead";
    else if (s.low >= 0.4 && s.speed < 0.35) bucket = "low_touch";
    else if (s.low >= 0.4 && s.speed >= 0.35) bucket = "defensive_lift";
    else bucket = "flat_drive";
    buckets[bucket].push(s);
  }

  const out = {};
  for (const [name, shots] of Object.entries(buckets)) {
    if (shots.length === 0) {
      out[name] = { count: 0, avg_speed: 0, avg_extension: 0, consistency: 0 };
      continue;
    }
    const avg = (k) => shots.reduce((s, x) => s + x[k], 0) / shots.length;
    const stddev = (k) => {
      if (shots.length < 2) return 0;
      const m = avg(k);
      return Math.sqrt(shots.reduce((s, x) => s + (x[k] - m) ** 2, 0) / shots.length);
    };
    // Consistency = 1 - mean of stddevs across the 3 main metrics, clamped
    const meanStd = (stddev("speed") + stddev("extension") + stddev("smoothness")) / 3;
    const consistency = Math.max(0, Math.min(1, 1 - meanStd * 2.5));
    out[name] = {
      count: shots.length,
      avg_speed: avg("speed"),
      avg_extension: avg("extension"),
      consistency,
    };
  }
  return out;
}

function computeOverall(shotData, totalDurationSec) {
  if (shotData.length === 0) {
    return { consistency: 0, avg_recovery_sec: null };
  }
  // Recovery: avg time between consecutive shot starts minus shot length
  const sorted = [...shotData].sort((a, b) => a.start - b.start);
  let recoveries = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].start - sorted[i - 1].end;
    if (gap > 0 && gap < 30) recoveries.push(gap);
  }
  const avg_recovery_sec = recoveries.length ? recoveries.reduce((a, b) => a + b, 0) / recoveries.length : null;

  // Overall consistency: 1 - mean stddev of speed/extension/smoothness across ALL shots
  const stddev = (k) => {
    if (shotData.length < 2) return 0;
    const m = shotData.reduce((s, x) => s + x[k], 0) / shotData.length;
    return Math.sqrt(shotData.reduce((s, x) => s + (x[k] - m) ** 2, 0) / shotData.length);
  };
  const meanStd = (stddev("speed") + stddev("extension") + stddev("smoothness")) / 3;
  const consistency = Math.max(0, Math.min(1, 1 - meanStd * 2.5));

  return { consistency, avg_recovery_sec };
}
