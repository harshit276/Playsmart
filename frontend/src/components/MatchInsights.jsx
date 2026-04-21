/**
 * MatchInsights — given an uploaded video, detects every shot moment,
 * classifies each via /api/predict-shot (uses the trained shot classifier),
 * computes a skill score + distribution, then asks the backend for an
 * LLM-narrated coaching breakdown. Renders all of it as a card.
 */
import { useState, useEffect, useMemo } from "react";
import { Sparkles, TrendingUp, AlertCircle, Target, Loader2, Trophy, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import api from "@/lib/api";

const FRAMES = 12;
const KP = 17;
const MIN_PRED_CONF = 0.30; // below this, the model's "guess" is too noisy to count

export default function MatchInsights({ videoFile, sport = "badminton", playerPosition = "auto", onError }) {
  const [phase, setPhase] = useState("idle"); // idle | scanning | classifying | narrating | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [narrative, setNarrative] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [modelLoaded, setModelLoaded] = useState(null);

  // Check if the trained classifier for this sport is deployed
  useEffect(() => {
    api.get(`/predict-shot/status?sport=${sport}`, { timeout: 30000 })
      .then((r) => setModelLoaded(!!r.data?.loaded))
      .catch(() => setModelLoaded(false));
  }, [sport]);

  const distribution = useMemo(() => {
    const map = {};
    for (const p of predictions) {
      if (p.confidence < MIN_PRED_CONF) continue;
      map[p.label] = (map[p.label] || 0) + 1;
    }
    return map;
  }, [predictions]);

  const skillScore = useMemo(() => {
    if (!predictions.length) return 0;
    const valid = predictions.filter((p) => p.confidence >= MIN_PRED_CONF);
    if (!valid.length) return 0;
    const avgConf = valid.reduce((s, p) => s + p.confidence, 0) / valid.length;
    const diversity = Object.keys(distribution).length / 6; // 6 canonical shot types
    const volume = Math.min(1, valid.length / 25);
    // 0..5 stars
    return Math.round((0.45 * avgConf + 0.35 * diversity + 0.20 * volume) * 5 * 10) / 10;
  }, [predictions, distribution]);

  const avgConf = useMemo(() => {
    const valid = predictions.filter((p) => p.confidence >= MIN_PRED_CONF);
    if (!valid.length) return 0;
    return valid.reduce((s, p) => s + p.confidence, 0) / valid.length;
  }, [predictions]);

  const run = async () => {
    if (!videoFile || !modelLoaded) return;
    setPhase("scanning");
    setProgress(0);
    setPredictions([]);
    setNarrative(null);
    setErrorMsg(null);

    try {
      // ─── 1. Detect shot moments ──────────────────────────────────
      setProgressMsg("Detecting shot moments…");
      const { extractShotMoments } = await import("@/ai/shotMomentExtractor");
      const result = await extractShotMoments(videoFile, {
        onProgress: ({ percent, message }) => {
          setProgress(Math.round(percent * 0.25));
          if (message) setProgressMsg(message);
        },
      });
      if (!result.clips.length) throw new Error("No shot moments detected");

      // ─── 2. Load MoveNet (already in browser bundle) ──────────────
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
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );

      // ─── 3. Classify each clip ───────────────────────────────────
      setPhase("classifying");
      const videoEl = document.createElement("video");
      videoEl.src = URL.createObjectURL(videoFile);
      videoEl.muted = true;
      videoEl.playsInline = true;
      await new Promise((r, e) => { videoEl.onloadedmetadata = r; videoEl.onerror = e; });
      const w = videoEl.videoWidth || 640;
      const h = videoEl.videoHeight || 360;

      // Doubles support: if user picked a player quadrant, crop to it
      // before pose detection so MoveNet only sees the intended player.
      // Mirrors the crop logic in training/extract_poses.py.
      const cropBox = computeCropBox(w, h, playerPosition);
      const canvas = document.createElement("canvas");
      canvas.width = cropBox.w;
      canvas.height = cropBox.h;
      const ctx = canvas.getContext("2d");

      const newPreds = [];
      for (let i = 0; i < result.clips.length; i++) {
        const clip = result.clips[i];
        // Sample 12 frames evenly
        const times = [];
        for (let k = 0; k < FRAMES; k++) times.push(clip.start + (clip.end - clip.start) * (k / (FRAMES - 1)));

        const keypoints = [];
        let last = Array.from({ length: KP }, () => [0, 0, 0]);
        for (const t of times) {
          videoEl.currentTime = t;
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => { videoEl.onseeked = r; });
          // Draw the (possibly cropped) source region onto the canvas
          ctx.drawImage(
            videoEl,
            cropBox.x, cropBox.y, cropBox.w, cropBox.h,    // source
            0, 0, cropBox.w, cropBox.h,                    // dest
          );
          // eslint-disable-next-line no-await-in-loop
          const poses = await detector.estimatePoses(canvas);
          if (poses?.[0]?.keypoints) {
            // Normalize against the cropped canvas, NOT the full frame
            const kps = poses[0].keypoints.map((kp) => [
              kp.y / cropBox.h,
              kp.x / cropBox.w,
              kp.score ?? 0,
            ]);
            keypoints.push(kps);
            last = kps;
          } else {
            keypoints.push(last);
          }
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          const { data } = await api.post(`/predict-shot?sport=${sport}`, { keypoints }, { timeout: 30000 });
          newPreds.push({
            start: clip.start,
            end: clip.end,
            label: data.label,
            confidence: data.confidence ?? 0,
          });
        } catch (e) {
          // skip clip — still continue
        }

        const pct = 25 + Math.round(((i + 1) / result.clips.length) * 65);
        setProgress(pct);
        setProgressMsg(`Classifying shot ${i + 1}/${result.clips.length}`);
        setPredictions([...newPreds]);
      }

      detector.dispose();
      URL.revokeObjectURL(videoEl.src);

      // ─── 4. Compute metrics + ask backend for narrative ──────────
      setPhase("narrating");
      setProgress(95);
      setProgressMsg("Generating coaching feedback…");

      const validPreds = newPreds.filter((p) => p.confidence >= MIN_PRED_CONF);
      const dist = {};
      for (const p of validPreds) dist[p.label] = (dist[p.label] || 0) + 1;
      const aConf = validPreds.length ? validPreds.reduce((s, p) => s + p.confidence, 0) / validPreds.length : 0;
      const score = computeSkillScore(validPreds.length, aConf, dist);

      try {
        const { data } = await api.post("/analysis/coaching-narrative", {
          sport,
          shot_distribution: dist,
          avg_confidence: aConf,
          skill_score: score,
          duration_sec: videoEl.duration || null,
          total_shots: validPreds.length,
        }, { timeout: 25000 });
        setNarrative(data);
      } catch (e) {
        // Still show metrics, no narrative
        console.warn("narrative failed", e);
      }

      setProgress(100);
      setPhase("done");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Match analysis failed");
      setPhase("error");
      onError?.(err);
    }
  };

  // ─── Render ────────────────────────────────────────────────────
  if (modelLoaded === false) {
    return (
      <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 text-sm">
        <p className="text-amber-400 font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Trained shot classifier not deployed yet
        </p>
        <p className="text-zinc-400 text-xs mt-1">
          Match insights become available once a model is committed to{" "}
          <code className="text-zinc-300">backend/models/shot_classifier.joblib</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-base flex items-center gap-2">
          <Trophy className="w-5 h-5 text-lime-400" />
          Match Insights
        </h3>
        {phase === "idle" && (
          <button
            onClick={run}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-lime-400 hover:bg-lime-300 text-black">
            Analyze whole match
          </button>
        )}
      </div>

      {phase === "idle" && (
        <p className="text-xs text-zinc-500">
          Detects every shot in your video, classifies each, and gives you a coaching breakdown.
        </p>
      )}

      {(phase === "scanning" || phase === "classifying" || phase === "narrating") && (
        <div>
          <Progress value={progress} className="h-1.5 bg-zinc-800" />
          <p className="text-[11px] text-zinc-500 mt-2 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> {progressMsg}
          </p>
        </div>
      )}

      {phase === "error" && (
        <p className="text-xs text-red-400">{errorMsg}</p>
      )}

      {(phase === "done" || (phase === "narrating" && predictions.length > 0)) && (
        <div className="space-y-4">
          {/* Skill score + headline stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Skill score</p>
              <p className="text-2xl font-bold text-lime-400 mt-1">{skillScore}<span className="text-zinc-500 text-sm font-normal">/5</span></p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Shots</p>
              <p className="text-2xl font-bold text-white mt-1">{Object.values(distribution).reduce((a, b) => a + b, 0)}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Technique</p>
              <p className="text-2xl font-bold text-white mt-1">{Math.round(avgConf * 100)}<span className="text-zinc-500 text-sm font-normal">%</span></p>
            </div>
          </div>

          {/* Distribution bars */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Shot distribution</p>
            <div className="space-y-1.5">
              {Object.entries(distribution)
                .sort(([, a], [, b]) => b - a)
                .map(([label, count]) => {
                  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-20 text-xs text-zinc-300 capitalize">{label.replace(/_/g, " ")}</div>
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-lime-400" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-10 text-right text-[11px] text-zinc-400 font-mono">{count}</div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Narrative — strengths / improvements / focus */}
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
                        <span className="text-lime-400">+</span>
                        <span>{s}</span>
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
                        <span className="text-amber-400">→</span>
                        <span>{s}</span>
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

function computeSkillScore(n, avgConf, dist) {
  const diversity = Object.keys(dist).length / 6;
  const volume = Math.min(1, n / 25);
  return Math.round((0.45 * avgConf + 0.35 * diversity + 0.20 * volume) * 5 * 10) / 10;
}

/**
 * Per-video player position crop. Matches training/extract_poses.py's
 * crop_to_quadrant() — same geometry + 10% padding.
 * Returns {x, y, w, h} into the source frame.
 */
function computeCropBox(w, h, position) {
  if (!position || position === "auto") return { x: 0, y: 0, w, h };
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const padX = Math.floor(halfW * 0.1);
  const padY = Math.floor(halfH * 0.1);
  const map = {
    "top-left":     { x: 0,         y: 0,         w: halfW,     h: halfH },
    "top-right":    { x: halfW,     y: 0,         w: halfW,     h: halfH },
    "bottom-left":  { x: 0,         y: halfH,     w: halfW,     h: halfH },
    "bottom-right": { x: halfW,     y: halfH,     w: halfW,     h: halfH },
  };
  const box = map[position];
  if (!box) return { x: 0, y: 0, w, h };
  // Add 10% padding so the player isn't clipped at the quadrant edge
  const x = Math.max(0, box.x - padX);
  const y = Math.max(0, box.y - padY);
  const wOut = Math.min(w - x, box.w + padX * 2);
  const hOut = Math.min(h - y, box.h + padY * 2);
  return { x, y, w: wOut, h: hOut };
}
