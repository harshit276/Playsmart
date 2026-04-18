import { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Upload, Play, Loader2, Cpu, AlertTriangle, CheckCircle2, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const FRAMES = 12;
const KP = 17;

export default function TestModelPage() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(2);
  const [duration, setDuration] = useState(0);

  const [modelStatus, setModelStatus] = useState(null); // { loaded, classes? error? }
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [result, setResult] = useState(null);

  const videoRef = useRef(null);

  useEffect(() => {
    api.get("/predict-shot/status", { timeout: 30000 })
      .then((r) => setModelStatus(r.data))
      .catch((e) => setModelStatus({ loaded: false, error: e.message }));
  }, []);

  useEffect(() => {
    return () => { if (videoUrl) URL.revokeObjectURL(videoUrl); };
  }, [videoUrl]);

  const handleFile = (file) => {
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setResult(null);
  };

  const onLoadedMetadata = () => {
    const d = videoRef.current?.duration || 0;
    setDuration(d);
    setStart(0);
    setEnd(Math.min(2, d));
  };

  const extractAndPredict = async () => {
    if (!videoFile || !videoUrl) return;
    if (end <= start) {
      toast.error("End time must be after start time");
      return;
    }
    if (!modelStatus?.loaded) {
      toast.error("Model not loaded on server. Push backend/models/shot_classifier.joblib first.");
      return;
    }
    setBusy(true);
    setResult(null);
    setProgress(5);
    setProgressMsg("Loading MoveNet...");

    try {
      // Lazy-load TF.js + pose detection (already in the bundle from /analyze)
      const tf = await import("@tensorflow/tfjs");
      const poseDetection = await import("@tensorflow-models/pose-detection");

      await tf.ready();
      try { await tf.setBackend("webgpu"); } catch {}
      if (tf.getBackend() !== "webgpu") {
        try { await tf.setBackend("webgl"); } catch { await tf.setBackend("cpu"); }
      }

      setProgress(15);
      setProgressMsg("Initializing pose detector...");
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );

      // Sample 12 frames evenly between start and end
      const v = videoRef.current;
      v.muted = true;
      const times = [];
      for (let i = 0; i < FRAMES; i++) {
        times.push(start + (end - start) * (i / (FRAMES - 1)));
      }

      const canvas = document.createElement("canvas");
      const w = v.videoWidth || 640;
      const h = v.videoHeight || 360;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      const keypoints = [];
      let lastValid = Array.from({ length: KP }, () => [0, 0, 0]);

      for (let i = 0; i < times.length; i++) {
        v.currentTime = times[i];
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { v.onseeked = r; });
        ctx.drawImage(v, 0, 0, w, h);

        // eslint-disable-next-line no-await-in-loop
        const poses = await detector.estimatePoses(canvas);
        if (poses && poses.length > 0 && poses[0].keypoints) {
          // Convert to MoveNet format: [y, x, confidence] normalized to [0,1]
          const kps = poses[0].keypoints.map((kp) => [
            kp.y / h,
            kp.x / w,
            kp.score ?? 0,
          ]);
          keypoints.push(kps);
          lastValid = kps;
        } else {
          keypoints.push(lastValid);
        }
        setProgress(15 + Math.round((i / times.length) * 65));
        setProgressMsg(`Extracting frame ${i + 1}/${FRAMES}`);
      }

      detector.dispose();

      setProgress(85);
      setProgressMsg("Sending to classifier...");
      const { data } = await api.post("/predict-shot", { keypoints }, { timeout: 30000 });

      setProgress(100);
      setProgressMsg("Done");
      setResult(data);
      toast.success(`Predicted: ${data.label}`);
    } catch (err) {
      console.error(err);
      toast.error("Prediction failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  };

  const confidencePct = useMemo(() => {
    if (!result?.confidence) return null;
    return Math.round(result.confidence * 100);
  }, [result]);

  return (
    <div className="min-h-screen bg-background text-zinc-100 pt-20 pb-12 px-4">
      <Helmet>
        <title>Test Trained Model · AthlyticAI</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="w-6 h-6 text-lime-400" />
              Test Trained Shot Classifier
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Upload a clip → extract pose → run your trained model.
            </p>
          </div>
          <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300">← Back</Link>
        </div>

        {/* Model status */}
        <div className={`mb-6 rounded-2xl border p-4 ${
          !modelStatus
            ? "bg-zinc-900 border-zinc-800"
            : modelStatus.loaded
              ? "bg-lime-400/5 border-lime-400/30"
              : "bg-amber-500/5 border-amber-500/30"
        }`}>
          {!modelStatus ? (
            <p className="text-sm text-zinc-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking model status…
            </p>
          ) : modelStatus.loaded ? (
            <div className="text-sm">
              <p className="text-lime-400 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Model loaded
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Classes: {(modelStatus.classes || []).join(", ")}
              </p>
            </div>
          ) : (
            <div className="text-sm">
              <p className="text-amber-400 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Model not loaded
              </p>
              <p className="text-xs text-zinc-400 mt-1">{modelStatus.error}</p>
            </div>
          )}
        </div>

        {/* Upload */}
        {!videoFile && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <Upload className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-white font-medium mb-2">Upload a sports clip</p>
            <p className="text-xs text-zinc-500 mb-6">Short 1-3 second clip is ideal — one shot per clip.</p>
            <label className="inline-flex items-center gap-2 px-5 py-3 bg-lime-400 hover:bg-lime-300 text-black font-semibold rounded-xl cursor-pointer">
              <Upload className="w-4 h-4" />
              Choose video
              <input type="file" accept="video/*" className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>
          </div>
        )}

        {/* Player + controls */}
        {videoFile && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
              <div className="bg-black rounded-xl overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  controls
                  playsInline
                  muted
                  onLoadedMetadata={onLoadedMetadata}
                />
              </div>

              {duration > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
                      Start (sec)
                    </label>
                    <input type="number" min="0" max={duration} step="0.1"
                      value={start}
                      onChange={(e) => setStart(Math.max(0, Math.min(duration, Number(e.target.value))))}
                      className="w-full bg-zinc-800 border border-zinc-700 focus:border-lime-400/60 focus:outline-none rounded-lg px-3 py-1.5 text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
                      End (sec) — duration {duration.toFixed(1)}s
                    </label>
                    <input type="number" min="0" max={duration} step="0.1"
                      value={end}
                      onChange={(e) => setEnd(Math.max(0, Math.min(duration, Number(e.target.value))))}
                      className="w-full bg-zinc-800 border border-zinc-700 focus:border-lime-400/60 focus:outline-none rounded-lg px-3 py-1.5 text-sm text-white" />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={extractAndPredict}
                  disabled={busy || !modelStatus?.loaded}
                  className="bg-lime-400 hover:bg-lime-300 text-black font-semibold flex-1">
                  {busy
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Working…</>
                    : <><Play className="w-4 h-4 mr-2" /> Predict shot</>}
                </Button>
                <Button variant="ghost"
                  onClick={() => { setVideoFile(null); setVideoUrl(null); setResult(null); }}
                  className="text-zinc-400 hover:text-white">
                  Change
                </Button>
              </div>

              {busy && (
                <div>
                  <Progress value={progress} className="h-1.5 bg-zinc-800" />
                  <p className="text-[11px] text-zinc-500 mt-1.5">{progressMsg}</p>
                </div>
              )}
            </div>

            {/* Result */}
            {result && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Prediction</p>
                  {confidencePct != null && (
                    <p className="text-xs text-zinc-400">{confidencePct}% confidence</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Sparkles className="w-7 h-7 text-lime-400" />
                  <p className="text-3xl font-bold text-white capitalize">
                    {result.label.replace(/_/g, " ")}
                  </p>
                </div>

                {result.top && result.top.length > 1 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">All classes</p>
                    <div className="space-y-1.5">
                      {result.top.map((t) => (
                        <div key={t.label} className="flex items-center gap-2">
                          <div className="w-24 text-xs text-zinc-300 capitalize">{t.label.replace(/_/g, " ")}</div>
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-lime-400" style={{ width: `${(t.p * 100).toFixed(1)}%` }} />
                          </div>
                          <div className="w-12 text-right text-[11px] text-zinc-500 font-mono">{(t.p * 100).toFixed(0)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
