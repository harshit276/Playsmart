import { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Upload, ChevronLeft, ChevronRight, Save, Download, Loader2, Film, Tag,
  Trash2, RotateCcw, Star, ExternalLink, Search, Youtube,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { extractShotMoments, computeVideoHash } from "@/ai/shotMomentExtractor";
import { SHOT_TYPES, SUPPORTED_SPORTS } from "@/ai/constants";
import { buildSearchPrompts, DOWNLOADER_URL } from "@/ai/searchPrompts";

const STORAGE_KEY = "athlytic_label_drafts_v2";
const PLAYER_LEVELS = ["beginner", "intermediate", "advanced", "pro"];

function loadDrafts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveDrafts(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

// Normalize legacy v1 string labels to object form
function normalizeLabel(v) {
  if (!v) return null;
  if (typeof v === "string") return { label: v };
  return v;
}

export default function LabelPage() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoHash, setVideoHash] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sport, setSport] = useState("badminton");
  // For doubles videos: which quadrant the player you're labelling is in.
  // "auto" = let MoveNet pick the most prominent person (singles default).
  const [playerPosition, setPlayerPosition] = useState("auto");

  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, message: "" });

  const [clips, setClips] = useState([]);
  // labels shape: { clipId: { label, speed_kmh?, player_level?, player_rating? } }
  const [labels, setLabels] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const videoRef = useRef(null);
  const playStopTimerRef = useRef(null);

  // Just the actual shot types — discard is rendered as a separate prominent button.
  const labelOptions = useMemo(() => {
    const types = SHOT_TYPES[sport] || [];
    return [...types, "rally"];
  }, [sport]);

  const searchPrompts = useMemo(() => buildSearchPrompts(sport), [sport]);
  const promptGroups = useMemo(() => {
    const out = {};
    for (const p of searchPrompts) {
      out[p.group] = out[p.group] || [];
      out[p.group].push(p);
    }
    return out;
  }, [searchPrompts]);

  // "Useful" labels: real shot types, not skip/discard
  const labeledCount = Object.values(labels).filter(
    (l) => l && l.label && l.label !== "skip" && l.label !== "discard"
  ).length;
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
      const draft = drafts[videoHash];
      if (draft) {
        const restored = {};
        for (const [k, v] of Object.entries(draft.labels || {})) {
          restored[k] = normalizeLabel(v);
        }
        setLabels(restored);
        if (draft.sourceUrl) setSourceUrl(draft.sourceUrl);
        if (draft.sport) setSport(draft.sport);
        toast.info(`Restored ${Object.keys(restored).length} draft labels`);
      }
    }
  }, [videoHash]);

  // Persist drafts
  useEffect(() => {
    if (!videoHash || Object.keys(labels).length === 0) return;
    const drafts = loadDrafts();
    drafts[videoHash] = { labels, sport, sourceUrl, savedAt: Date.now() };
    saveDrafts(drafts);
  }, [labels, videoHash, sport, sourceUrl]);

  // Auto-play current clip
  useEffect(() => {
    const v = videoRef.current;
    if (!v || clips.length === 0) return;
    const clip = clips[currentIdx];
    if (!clip) return;

    const onLoaded = () => {
      v.currentTime = clip.start;
      v.play().catch(() => {});
      if (playStopTimerRef.current) clearTimeout(playStopTimerRef.current);
      playStopTimerRef.current = setTimeout(() => { v.pause(); }, (clip.end - clip.start) * 1000 + 100);
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
      const result = await extractShotMoments(videoFile, { onProgress: setProgress });
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

  const updateCurrent = (patch) => {
    const clip = clips[currentIdx];
    if (!clip) return;
    setLabels((prev) => ({
      ...prev,
      [clip.id]: { ...(prev[clip.id] || {}), ...patch },
    }));
  };

  const setCurrentLabel = (label) => {
    updateCurrent({ label });
    if (label === "skip" || label === "discard") {
      // No metadata to add for skip/discard — auto-advance
      if (currentIdx < clips.length - 1) {
        setTimeout(() => setCurrentIdx(currentIdx + 1), 100);
      }
    }
    // For real labels, don't auto-advance — user may want to add speed/level/rating
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
      .map((c) => {
        const meta = labels[c.id];
        if (!meta || !meta.label || (meta.label === "skip" || meta.label === "discard")) return null;
        return {
          start: c.start,
          end: c.end,
          label: meta.label,
          ...(meta.speed_kmh != null ? { speed_kmh: Number(meta.speed_kmh) } : {}),
          ...(meta.player_level ? { player_level: meta.player_level } : {}),
          ...(meta.player_rating ? { player_rating: Number(meta.player_rating) } : {}),
        };
      })
      .filter(Boolean);

    if (shots.length === 0) {
      toast.error("All your labels are 'skip' — nothing to upload.");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post("/labels/save", {
        video_hash: videoHash,
        video_filename: videoFile?.name,
        source_url: sourceUrl || null,
        sport,
        player_position: playerPosition,
        duration: videoRef.current?.duration || null,
        shots,
      });
      toast.success(`Saved ${data.shot_count} labeled shots — thanks!`);
      setSaved(true);
      const drafts = loadDrafts();
      delete drafts[videoHash];
      saveDrafts(drafts);
    } catch (err) {
      console.error(err);
      toast.error("Could not save: " + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const exportLocal = () => {
    const shots = clips
      .map((c) => {
        const meta = labels[c.id];
        if (!meta || !meta.label) return null;
        return { start: c.start, end: c.end, ...meta };
      })
      .filter(Boolean);
    const payload = {
      video_filename: videoFile?.name,
      video_hash: videoHash,
      source_url: sourceUrl || null,
      sport,
      player_position: playerPosition,
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
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
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
  const current = currentClip ? labels[currentClip.id] : null;

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
              Search YouTube → download clips → upload here → label → train.
            </p>
          </div>
          <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300">← Back to app</Link>
        </div>

        {/* Step 0: Sport picker (always visible) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
          <p className="text-xs text-zinc-500 mb-2">Sport</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SUPPORTED_SPORTS).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => !videoFile && setSport(key)}
                disabled={!!videoFile}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  sport === key
                    ? "bg-lime-400 text-black border-lime-400"
                    : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-600 disabled:opacity-50"
                }`}>
                {cfg.name}
              </button>
            ))}
          </div>
        </div>

        {/* Step 1: Search prompts (before upload) */}
        {!videoFile && (
          <>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-lime-400/10 flex items-center justify-center shrink-0">
                  <Search className="w-5 h-5 text-lime-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">1. Find clips on YouTube</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Click any prompt to open YouTube. Pick a Short or short clip, copy its URL,
                    paste into <a href={DOWNLOADER_URL} target="_blank" rel="noopener noreferrer"
                    className="text-lime-400 hover:underline inline-flex items-center gap-0.5">
                      ytshortsdl.io <ExternalLink className="w-3 h-3" />
                    </a> to download the MP4.
                  </p>
                </div>
              </div>

              {Object.entries(promptGroups).map(([group, items]) => (
                <div key={group} className="mb-4 last:mb-0">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">{group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((p) => (
                      <a
                        key={p.label}
                        href={p.shorts_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-lime-400/40 text-zinc-300 hover:text-white transition-colors flex items-center gap-1">
                        <Youtube className="w-3 h-3 text-red-400" />
                        {p.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
              <Film className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-white font-medium mb-2">2. Upload the downloaded video</p>
              <p className="text-xs text-zinc-500 mb-6">MP4, MOV, WEBM — any length.</p>
              <input
                type="text"
                placeholder="Optional: paste source YouTube URL"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="w-full max-w-md mx-auto block bg-zinc-800 border border-zinc-700 focus:border-lime-400/60 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 mb-4"
              />
              <label className="inline-flex items-center gap-2 px-5 py-3 bg-lime-400 hover:bg-lime-300 text-black font-semibold rounded-xl cursor-pointer">
                <Upload className="w-4 h-4" />
                Choose video
                <input type="file" accept="video/*" className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])} />
              </label>
            </div>
          </>
        )}

        {/* Step 2: Sport confirmed + extract */}
        {videoFile && clips.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
            <div>
              <p className="text-xs text-zinc-500 mb-2">Video loaded</p>
              <p className="text-sm text-white truncate">{videoFile.name}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {(videoFile.size / 1024 / 1024).toFixed(1)} MB · hash {videoHash?.slice(0, 12)}…
                {sourceUrl && <> · source: <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline">{sourceUrl.slice(0, 40)}…</a></>}
              </p>
            </div>

            {/* Player position — for doubles videos, tells the trainer which player to crop to */}
            <div>
              <p className="text-xs text-zinc-500 mb-1">Which player are you labelling?</p>
              <p className="text-[10px] text-zinc-600 mb-2">
                Singles → leave on Auto. Doubles → pick the quadrant where the player you'll
                label most often is positioned.
              </p>
              <div className="grid grid-cols-3 gap-1.5 max-w-sm">
                <button onClick={() => setPlayerPosition("top-left")}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    playerPosition === "top-left"
                      ? "bg-lime-400 text-black border-lime-400"
                      : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                  }`}>Far · Left</button>
                <div />
                <button onClick={() => setPlayerPosition("top-right")}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    playerPosition === "top-right"
                      ? "bg-lime-400 text-black border-lime-400"
                      : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                  }`}>Far · Right</button>

                <div />
                <button onClick={() => setPlayerPosition("auto")}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    playerPosition === "auto"
                      ? "bg-lime-400 text-black border-lime-400"
                      : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                  }`}>Auto<br /><span className="text-[9px] opacity-70">singles</span></button>
                <div />

                <button onClick={() => setPlayerPosition("bottom-left")}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    playerPosition === "bottom-left"
                      ? "bg-lime-400 text-black border-lime-400"
                      : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                  }`}>Near · Left</button>
                <div />
                <button onClick={() => setPlayerPosition("bottom-right")}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    playerPosition === "bottom-right"
                      ? "bg-lime-400 text-black border-lime-400"
                      : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                  }`}>Near · Right</button>
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
                <Button onClick={runExtraction}
                  className="bg-lime-400 hover:bg-lime-300 text-black font-semibold">
                  Extract shot moments →
                </Button>
                <Button variant="ghost"
                  onClick={() => { setVideoFile(null); setVideoUrl(null); setVideoHash(null); setSourceUrl(""); }}
                  className="text-zinc-400 hover:text-white">
                  Change video
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Label clips */}
        {clips.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
              {/* Player */}
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                <video ref={videoRef} src={videoUrl}
                  className="w-full h-full object-contain"
                  playsInline muted controls={false} />
                <div className="absolute top-2 left-2 bg-black/70 text-white text-[11px] px-2 py-1 rounded font-mono">
                  Shot {currentIdx + 1} / {clips.length} · {currentClip?.start.toFixed(1)}s – {currentClip?.end.toFixed(1)}s
                </div>
                {current?.label && current.label !== "skip" && current.label !== "discard" && (
                  <div className="absolute top-2 right-2 bg-lime-400 text-black text-[11px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                    {current.label}
                  </div>
                )}
                {current?.label === "skip" && (
                  <div className="absolute top-2 right-2 bg-zinc-700 text-zinc-300 text-[11px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                    skipped
                  </div>
                )}
                {current?.label === "discard" && (
                  <div className="absolute top-2 right-2 bg-red-500/30 text-red-200 text-[11px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                    discarded
                  </div>
                )}
              </div>

              {/* Nav controls — prominent Next button */}
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" onClick={goPrev} disabled={currentIdx === 0}
                  className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                </Button>
                <Button variant="outline" onClick={replayClip}
                  className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white">
                  <RotateCcw className="w-4 h-4 mr-1" /> Replay
                </Button>
                <Button onClick={goNext} disabled={currentIdx === clips.length - 1}
                  className="bg-lime-400 hover:bg-lime-300 text-black font-bold disabled:opacity-30">
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>

              {/* Shot label buttons */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
                  Shot type — press 1-{labelOptions.length}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {labelOptions.map((opt, i) => {
                    const active = current?.label === opt;
                    return (
                      <button key={opt} onClick={() => setCurrentLabel(opt)}
                        className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${
                          active
                            ? "bg-lime-400 text-black border-lime-400"
                            : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                        }`}>
                        <span className="text-[9px] text-zinc-500 font-mono">{i + 1}</span>
                        <span className="capitalize">{opt.replace(/_/g, " ")}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Discard — for ambiguous clips, multi-shot frames, bad framing, etc. */}
                <button
                  onClick={() => setCurrentLabel("discard")}
                  className={`w-full mt-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center justify-center gap-2 ${
                    current?.label === "discard"
                      ? "bg-red-500/20 text-red-300 border-red-500/40"
                      : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:border-red-500/40 hover:text-red-300"
                  }`}>
                  <Trash2 className="w-3.5 h-3.5" />
                  Discard this clip (ambiguous / multi-shot / bad frame)
                </button>
              </div>

              {/* Extra metadata: speed + level + rating (only if labeled, not skip) */}
              {current?.label && current.label !== "skip" && current.label !== "discard" && (
                <div className="space-y-3 pt-2 border-t border-zinc-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Speed */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
                        Estimated speed (km/h, optional)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="500"
                        step="1"
                        placeholder="e.g. 280"
                        value={current.speed_kmh ?? ""}
                        onChange={(e) => updateCurrent({
                          speed_kmh: e.target.value === "" ? null : Number(e.target.value),
                        })}
                        className="w-full bg-zinc-800 border border-zinc-700 focus:border-lime-400/60 focus:outline-none rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-600"
                      />
                    </div>

                    {/* Player rating */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
                        Player rating (skill)
                      </label>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((r) => (
                          <button
                            key={r}
                            onClick={() => updateCurrent({
                              player_rating: current.player_rating === r ? null : r,
                            })}
                            className="p-1 hover:scale-110 transition-transform"
                            aria-label={`${r} star${r > 1 ? "s" : ""}`}>
                            <Star
                              className={`w-5 h-5 ${
                                (current.player_rating || 0) >= r
                                  ? "text-lime-400 fill-lime-400"
                                  : "text-zinc-600"
                              }`}
                            />
                          </button>
                        ))}
                        {current.player_rating && (
                          <span className="text-xs text-zinc-500 ml-1">{current.player_rating}/5</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Player level */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
                      Player level
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PLAYER_LEVELS.map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => updateCurrent({
                            player_level: current.player_level === lvl ? null : lvl,
                          })}
                          className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                            current.player_level === lvl
                              ? "bg-lime-400 text-black border-lime-400"
                              : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                          }`}>
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Done & advance */}
                  <div className="flex items-center justify-between pt-1">
                    <button onClick={removeLabel}
                      className="text-[11px] text-zinc-500 hover:text-red-400 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Clear all metadata
                    </button>
                    <Button size="sm" onClick={goNext} disabled={currentIdx === clips.length - 1}
                      className="h-7 text-xs bg-zinc-800 hover:bg-zinc-700 text-white">
                      Done · Next →
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Side panel */}
            <div className="space-y-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-xs text-zinc-500 mb-1">Progress</p>
                <p className="text-2xl font-bold text-white">
                  {labeledCount} <span className="text-zinc-500 text-sm font-normal">/ {totalCount}</span>
                </p>
                <Progress value={totalCount ? (labeledCount / totalCount) * 100 : 0}
                  className="h-1.5 bg-zinc-800 mt-2" />
                <p className="text-[10px] text-zinc-500 mt-2 capitalize">
                  Sport: <span className="text-zinc-300">{sport.replace("_", " ")}</span>
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
                <Button onClick={exportLocal}
                  disabled={labeledCount === 0}
                  className="w-full bg-lime-400 hover:bg-lime-300 text-black font-semibold">
                  <Download className="w-4 h-4 mr-2" /> Download labels.json
                </Button>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Save the JSON next to your video files, then run the
                  training script (see <code className="text-zinc-400">training/README.md</code>).
                </p>
                <details className="text-[10px] text-zinc-600 pt-1">
                  <summary className="cursor-pointer hover:text-zinc-400">Optional: also upload to server</summary>
                  <Button onClick={saveAll} disabled={submitting || labeledCount === 0}
                    variant="ghost"
                    className="w-full mt-2 text-zinc-400 hover:text-white text-xs">
                    {submitting ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Save className="w-3 h-3 mr-2" />}
                    {saved ? "Uploaded ✓" : `Upload ${labeledCount} to server`}
                  </Button>
                </details>
              </div>

              {/* Mini grid of clips */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 max-h-64 overflow-y-auto">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Clips</p>
                <div className="grid grid-cols-8 sm:grid-cols-6 lg:grid-cols-5 gap-1">
                  {clips.map((c, i) => {
                    const meta = labels[c.id];
                    const lab = meta?.label;
                    const colorClass = !lab
                      ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-500"
                      : lab === "discard"
                      ? "bg-red-500/30 text-red-200"
                      : lab === "skip"
                      ? "bg-zinc-700 text-zinc-400"
                      : "bg-lime-400/80 text-black";
                    return (
                      <button key={c.id} onClick={() => setCurrentIdx(i)}
                        title={`${c.start.toFixed(1)}s — ${lab || "unlabeled"}${meta?.speed_kmh ? ` · ${meta.speed_kmh}km/h` : ""}`}
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
                <p>← / → navigate · Space replay · 1-{labelOptions.length} pick shot type</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
