import { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Upload, ChevronLeft, ChevronRight, Check, SkipForward,
  Save, Download, Loader2, Film, Tag, Trash2, Play, Pause, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { extractShotMoments, computeVideoHash } from "@/ai/shotMomentExtractor";
import { SHOT_TYPES, SUPPORTED_SPORTS } from "@/ai/constants";

const STORAGE_KEY = "athlytic_label_drafts_v1";

function loadDrafts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveDrafts(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

export default function LabelPage() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoHash, setVideoHash] = useState(null);
  const [sport, setSport] = useState("badminton");

  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, message: "" });

  const [clips, setClips] = useState([]);          // [{id, peak, start, end, score}]
  const [labels, setLabels] = useState({});        // { clipId: labelString }
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const videoRef = useRef(null);
  const playStopTimerRef = useRef(null);

  const labelOptions = useMemo(() => {
    const types = SHOT_TYPES[sport] || [];
    return [...types, "rally", "skip"];
  }, [sport]);

  const labeledCount = Object.values(labels).filter((l) => l && l !== "skip").length;
  const totalCount = clips.length;

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (playStopTimerRef.current) clearTimeout(playStopTimerRef.current);
    };
  }, [videoUrl]);

  // Restore draft labels for this video
  useEffect(() => {
    if (videoHash) {
      const drafts = loadDrafts();
      if (drafts[videoHash]) {
        setLabels(drafts[videoHash].labels || {});
        toast.info(`Restored ${Object.keys(drafts[videoHash].labels || {}).length} draft labels`);
      }
    }
  }, [videoHash]);

  // Persist drafts
  useEffect(() => {
    if (!videoHash || Object.keys(labels).length === 0) return;
    const drafts = loadDrafts();
    drafts[videoHash] = { labels, sport, savedAt: Date.now() };
    saveDrafts(drafts);
  }, [labels, videoHash, sport]);

  // Auto-play current clip from peak start to peak end
  useEffect(() => {
    const v = videoRef.current;
    if (!v || clips.length === 0) return;
    const clip = clips[currentIdx];
    if (!clip) return;

    const onLoaded = () => {
      v.currentTime = clip.start;
      v.play().catch(() => {});
      if (playStopTimerRef.current) clearTimeout(playStopTimerRef.current);
      const dur = (clip.end - clip.start) * 1000;
      playStopTimerRef.current = setTimeout(() => { v.pause(); }, dur + 100);
    };

    if (v.readyState >= 2) onLoaded();
    else v.addEventListener("loadeddata", onLoaded, { once: true });

    return () => {
      v.removeEventListener("loadeddata", onLoaded);
      if (playStopTimerRef.current) clearTimeout(playStopTimerRef.current);
    };
  }, [currentIdx, clips]);

  const handleFile = async (file) => {
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setClips([]);
    setLabels({});
    setCurrentIdx(0);
    setSaved(false);

    try {
      const hash = await computeVideoHash(file);
      setVideoHash(hash);
    } catch {
      setVideoHash(`${file.name}-${file.size}`);
    }
  };

  const runExtraction = async () => {
    if (!videoFile) return;
    setExtracting(true);
    setProgress({ percent: 0, message: "Starting…" });

    try {
      const result = await extractShotMoments(videoFile, {
        onProgress: setProgress,
      });
      if (result.clips.length === 0) {
        toast.error("No shot moments detected. Try a video with clearer rallies.");
      } else {
        setClips(result.clips);
        setCurrentIdx(0);
        toast.success(`Extracted ${result.clips.length} shot moments`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Extraction failed: " + (err.message || "unknown"));
    } finally {
      setExtracting(false);
    }
  };

  const setCurrentLabel = (label) => {
    const clip = clips[currentIdx];
    if (!clip) return;
    setLabels((prev) => ({ ...prev, [clip.id]: label }));
    // Auto-advance
    if (currentIdx < clips.length - 1) {
      setTimeout(() => setCurrentIdx(currentIdx + 1), 120);
    }
  };

  const removeLabel = () => {
    const clip = clips[currentIdx];
    if (!clip) return;
    const next = { ...labels };
    delete next[clip.id];
    setLabels(next);
  };

  const replayClip = () => {
    const v = videoRef.current;
    const clip = clips[currentIdx];
    if (!v || !clip) return;
    v.currentTime = clip.start;
    v.play();
    if (playStopTimerRef.current) clearTimeout(playStopTimerRef.current);
    playStopTimerRef.current = setTimeout(() => { v.pause(); }, (clip.end - clip.start) * 1000 + 100);
  };

  const saveAll = async () => {
    if (!videoHash || Object.keys(labels).length === 0) {
      toast.error("Nothing to save yet — label some clips first.");
      return;
    }

    const shots = clips
      .map((c) => ({
        start: c.start,
        end: c.end,
        label: labels[c.id],
      }))
      .filter((s) => s.label && s.label !== "skip");

    if (shots.length === 0) {
      toast.error("All your labels are 'skip' — nothing to upload.");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post("/labels/save", {
        video_hash: videoHash,
        video_filename: videoFile?.name,
        sport,
        duration: videoRef.current?.duration || null,
        shots,
      });
      toast.success(`Saved ${data.shot_count} labeled shots — thanks for contributing!`);
      setSaved(true);
      // Clear local draft
      const drafts = loadDrafts();
      delete drafts[videoHash];
      saveDrafts(drafts);
    } catch (err) {
      console.error(err);
      toast.error("Could not save labels: " + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const exportLocal = () => {
    const shots = clips
      .map((c) => ({ start: c.start, end: c.end, label: labels[c.id] || null }))
      .filter((s) => s.label);
    const payload = {
      video_filename: videoFile?.name,
      video_hash: videoHash,
      sport,
      duration: videoRef.current?.duration || null,
      shots,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `labels_${videoHash?.slice(0, 8) || "session"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const goPrev = () => setCurrentIdx((i) => Math.max(0, i - 1));
  const goNext = () => setCurrentIdx((i) => Math.min(clips.length - 1, i + 1));

  // Keyboard shortcuts
  useEffect(() => {
    if (clips.length === 0) return;
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === " ") { e.preventDefault(); replayClip(); }
      else if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key) - 1;
        if (idx < labelOptions.length) setCurrentLabel(labelOptions[idx]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clips.length, currentIdx, labelOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentClip = clips[currentIdx];
  const currentLabel = currentClip ? labels[currentClip.id] : null;

  return (
    <div className="min-h-screen bg-background text-zinc-100 pt-20 pb-12 px-4">
      <Helmet>
        <title>Shot Labeling Tool · AthlyticAI</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Tag className="w-6 h-6 text-lime-400" />
              Shot Labeling Tool
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Upload a match video, label each shot, build the AI training dataset.
            </p>
          </div>
          <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300">← Back to app</Link>
        </div>

        {/* Step 1: Upload */}
        {!videoFile && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <Film className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-white font-medium mb-2">Upload a sports match video</p>
            <p className="text-xs text-zinc-500 mb-6">
              MP4, MOV, WEBM — any length. Longer videos = more shots to label = better training data.
            </p>
            <label className="inline-flex items-center gap-2 px-5 py-3 bg-lime-400 hover:bg-lime-300 text-black font-semibold rounded-xl cursor-pointer">
              <Upload className="w-4 h-4" />
              Choose video
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
          </div>
        )}

        {/* Step 2: Sport + extract */}
        {videoFile && clips.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <p className="text-xs text-zinc-500 mb-2">Video loaded</p>
              <p className="text-sm text-white truncate">{videoFile.name}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {(videoFile.size / 1024 / 1024).toFixed(1)} MB · hash: {videoHash?.slice(0, 12)}…
              </p>
            </div>

            <div>
              <p className="text-xs text-zinc-500 mb-2">Which sport is this?</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SUPPORTED_SPORTS).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setSport(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      sport === key
                        ? "bg-lime-400 text-black border-lime-400"
                        : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-600"
                    }`}>
                    {cfg.name}
                  </button>
                ))}
              </div>
            </div>

            {extracting ? (
              <div>
                <Progress value={progress.percent} className="h-2 bg-zinc-800" />
                <p className="text-xs text-zinc-400 mt-2 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {progress.message} ({progress.percent}%)
                </p>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={runExtraction}
                  className="bg-lime-400 hover:bg-lime-300 text-black font-semibold">
                  Extract shot moments →
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setVideoFile(null); setVideoUrl(null); setVideoHash(null); }}
                  className="text-zinc-400 hover:text-white">
                  Change video
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Label clips */}
        {clips.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
              {/* Video player */}
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  playsInline
                  muted
                  controls={false}
                />
                <div className="absolute top-2 left-2 bg-black/70 text-white text-[11px] px-2 py-1 rounded font-mono">
                  Shot {currentIdx + 1} / {clips.length} · {currentClip?.start.toFixed(1)}s – {currentClip?.end.toFixed(1)}s
                </div>
                {currentLabel && currentLabel !== "skip" && (
                  <div className="absolute top-2 right-2 bg-lime-400 text-black text-[11px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                    {currentLabel}
                  </div>
                )}
                {currentLabel === "skip" && (
                  <div className="absolute top-2 right-2 bg-zinc-700 text-zinc-300 text-[11px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                    skipped
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-2">
                <Button variant="ghost" size="sm" onClick={goPrev} disabled={currentIdx === 0}
                  className="text-zinc-400 hover:text-white">
                  <ChevronLeft className="w-4 h-4" /> Prev
                </Button>
                <Button variant="ghost" size="sm" onClick={replayClip}
                  className="text-zinc-400 hover:text-white">
                  <RotateCcw className="w-4 h-4 mr-1" /> Replay
                </Button>
                <Button variant="ghost" size="sm" onClick={goNext} disabled={currentIdx === clips.length - 1}
                  className="text-zinc-400 hover:text-white">
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Label buttons */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
                  Label this shot — press 1-{labelOptions.length} on keyboard
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {labelOptions.map((opt, i) => {
                    const active = currentLabel === opt;
                    const isSkip = opt === "skip";
                    return (
                      <button
                        key={opt}
                        onClick={() => setCurrentLabel(opt)}
                        className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${
                          active
                            ? isSkip
                              ? "bg-zinc-700 text-white border-zinc-600"
                              : "bg-lime-400 text-black border-lime-400"
                            : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                        }`}>
                        <span className="text-[9px] text-zinc-500 font-mono">{i + 1}</span>
                        <span className="capitalize">{opt.replace(/_/g, " ")}</span>
                      </button>
                    );
                  })}
                </div>
                {currentLabel && (
                  <button
                    onClick={removeLabel}
                    className="mt-2 text-[11px] text-zinc-500 hover:text-red-400 flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Clear label
                  </button>
                )}
              </div>
            </div>

            {/* Side panel: progress + actions */}
            <div className="space-y-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-xs text-zinc-500 mb-1">Progress</p>
                <p className="text-2xl font-bold text-white">
                  {labeledCount} <span className="text-zinc-500 text-sm font-normal">/ {totalCount}</span>
                </p>
                <Progress
                  value={totalCount ? (labeledCount / totalCount) * 100 : 0}
                  className="h-1.5 bg-zinc-800 mt-2"
                />
                <p className="text-[10px] text-zinc-500 mt-2">
                  Sport: <span className="text-zinc-300 capitalize">{sport.replace("_", " ")}</span>
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
                <Button
                  onClick={saveAll}
                  disabled={submitting || labeledCount === 0}
                  className="w-full bg-lime-400 hover:bg-lime-300 text-black font-semibold">
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  {saved ? "Saved ✓" : `Upload ${labeledCount} labels`}
                </Button>
                <Button
                  onClick={exportLocal}
                  variant="ghost"
                  disabled={labeledCount === 0}
                  className="w-full text-zinc-400 hover:text-white">
                  <Download className="w-4 h-4 mr-2" /> Export JSON
                </Button>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Drafts auto-save in your browser. Upload sends labels to MongoDB for training.
                </p>
              </div>

              {/* Mini timeline of clip labels */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 max-h-64 overflow-y-auto">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Clips</p>
                <div className="grid grid-cols-8 sm:grid-cols-6 lg:grid-cols-5 gap-1">
                  {clips.map((c, i) => {
                    const lab = labels[c.id];
                    const colorClass = !lab
                      ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-500"
                      : lab === "skip"
                      ? "bg-zinc-700 text-zinc-400"
                      : "bg-lime-400/80 text-black";
                    return (
                      <button
                        key={c.id}
                        onClick={() => setCurrentIdx(i)}
                        title={`${c.start.toFixed(1)}s — ${lab || "unlabeled"}`}
                        className={`text-[9px] font-mono px-1 py-1.5 rounded ${colorClass} ${
                          i === currentIdx ? "ring-2 ring-white" : ""
                        }`}>
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="text-[10px] text-zinc-600 px-1 leading-relaxed">
                <p className="mb-1"><strong className="text-zinc-400">Shortcuts:</strong></p>
                <p>← / → navigate · Space replay · 1-{labelOptions.length} label</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
