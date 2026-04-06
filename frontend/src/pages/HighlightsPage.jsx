import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Film, Upload, Play, Download, Share2, Scissors, Copy,
  Video, Clock, Zap, AlertTriangle, ChevronDown, Info, X,
  Settings, Sparkles, RefreshCw
} from "lucide-react";
import api from "@/lib/api";
import { SPORT_LABEL, SPORT_EMOJI } from "@/lib/sportConfig";

const HIGHLIGHT_LOADING_STEPS = [
  { pct: 10, text: "Uploading video..." },
  { pct: 25, text: "Scanning for action sequences..." },
  { pct: 45, text: "Detecting key moments..." },
  { pct: 65, text: "Extracting highlight clips..." },
  { pct: 80, text: "Generating highlight reel..." },
  { pct: 95, text: "Finalizing your highlights..." },
];

const HIGHLIGHT_TYPES = [
  { value: "auto", label: "Auto (AI picks best)", desc: "AI selects the most exciting moments" },
  { value: "power", label: "Power Moments", desc: "High-intensity action clips only" },
  { value: "rallies", label: "Rallies", desc: "Extended rally sequences" },
  { value: "all", label: "All Active", desc: "Every active segment included" },
];

const DURATION_OPTIONS = [
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1 min" },
  { value: 90, label: "1.5 min" },
  { value: 120, label: "2 min" },
];

export default function HighlightsPage() {
  const { profile } = useAuth();
  const [file, setFile] = useState(null);
  const [selectedSport, setSelectedSport] = useState(null);
  const [highlightType, setHighlightType] = useState("auto");
  const [maxDuration, setMaxDuration] = useState(30);

  // Set page title
  useEffect(() => { document.title = "Highlights | AthlyticAI"; }, []);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [playingClip, setPlayingClip] = useState(null);
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  const activeSport = profile?.active_sport || "badminton";

  useEffect(() => {
    if (!selectedSport) setSelectedSport(activeSport);
  }, [activeSport, selectedSport]);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["mp4", "avi", "mov", "mkv", "webm"].includes(ext)) {
      toast.error("Unsupported format. Use MP4, AVI, MOV, MKV, or WEBM.");
      return;
    }
    if (f.size > 500 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 500 MB.");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (!["mp4", "avi", "mov", "mkv", "webm"].includes(ext)) {
        toast.error("Unsupported format.");
        return;
      }
      if (f.size > 500 * 1024 * 1024) {
        toast.error("File too large. Maximum 500 MB.");
        return;
      }
      setFile(f);
      setResult(null);
      setError(null);
    }
  };

  const generateHighlights = async () => {
    if (!file) return;
    setGenerating(true);
    setProgress(0);
    setError(null);
    setResult(null);

    // Animate loading steps
    let stepIdx = 0;
    setLoadingText(HIGHLIGHT_LOADING_STEPS[0].text);
    const interval = setInterval(() => {
      stepIdx++;
      if (stepIdx < HIGHLIGHT_LOADING_STEPS.length) {
        setProgress(HIGHLIGHT_LOADING_STEPS[stepIdx].pct);
        setLoadingText(HIGHLIGHT_LOADING_STEPS[stepIdx].text);
      }
    }, 3000);

    try {
      const formData = new FormData();
      formData.append("video", file);

      const { data } = await api.post(
        `/generate-highlights?sport=${selectedSport || activeSport}&max_highlight_duration=${maxDuration}&highlight_type=${highlightType}`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 600000, // 10 min timeout for large videos
        }
      );

      clearInterval(interval);
      setProgress(100);
      setLoadingText("Done!");

      if (data.clip_count > 0) {
        setResult(data);
        toast.success(`Generated ${data.clip_count} highlight clips!`);
      } else {
        setResult(data);
        toast.info(data.message || "No highlights found in this video.");
      }
    } catch (err) {
      clearInterval(interval);
      const msg = err.response?.data?.detail || err.message || "Highlight generation failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 container mx-auto px-4 max-w-4xl py-6 sm:py-10" data-testid="highlights-page">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Film className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-2xl text-white">Highlights</h1>
            <p className="text-sm text-zinc-400">Create highlight reels from your match videos</p>
          </div>
        </div>
      </motion.div>

      {/* Info Banner */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 mb-6 flex items-center gap-3">
        <Info className="w-4 h-4 text-purple-400 shrink-0" />
        <p className="text-xs text-zinc-400">
          Upload a match video (MP4, MOV, etc.) up to <span className="text-white font-medium">500 MB</span> to auto-generate highlights.
        </p>
      </motion.div>

      {/* Upload + Settings Section */}
      {!result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          {/* Upload Area */}
          <div
            ref={dropRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !generating && fileRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              file
                ? "border-purple-500/40 bg-purple-500/5"
                : "border-zinc-700 hover:border-purple-500/30 hover:bg-zinc-900/50"
            } ${generating ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".mp4,.avi,.mov,.mkv,.webm"
              className="hidden"
              onChange={handleFile}
              disabled={generating}
            />

            {!file ? (
              <>
                <Upload className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
                <p className="text-sm text-zinc-300 font-medium mb-1">Drop your match video here</p>
                <p className="text-xs text-zinc-500">or click to browse</p>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Video className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm text-white font-medium truncate max-w-[200px] sm:max-w-[300px]">{file.name}</p>
                    <p className="text-xs text-zinc-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                {!generating && (
                  <Button size="sm" variant="ghost"
                    className="text-zinc-400 hover:text-red-400 h-8 w-8 p-0"
                    onClick={(e) => { e.stopPropagation(); resetForm(); }}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Sport + Settings Row */}
          {file && !generating && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="mt-4 space-y-4">
              {/* Sport Selection */}
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2 block">Sport</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SPORT_LABEL).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedSport(key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedSport === key
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600"
                      }`}
                    >
                      <span>{SPORT_EMOJI[key]}</span> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Settings Toggle */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Highlight preferences</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showSettings ? "rotate-180" : ""}`} />
              </button>

              {/* Expanded Settings */}
              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-4">
                      {/* Highlight Type */}
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2 block">
                          Highlight Type
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {HIGHLIGHT_TYPES.map((ht) => (
                            <button
                              key={ht.value}
                              onClick={() => setHighlightType(ht.value)}
                              className={`p-3 rounded-lg text-left transition-all ${
                                highlightType === ht.value
                                  ? "bg-purple-500/15 border border-purple-500/30"
                                  : "bg-zinc-800/50 border border-zinc-700/30 hover:border-zinc-600"
                              }`}
                            >
                              <p className={`text-xs font-medium ${highlightType === ht.value ? "text-purple-300" : "text-zinc-300"}`}>
                                {ht.label}
                              </p>
                              <p className="text-[10px] text-zinc-500 mt-0.5">{ht.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Max Duration */}
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2 block">
                          Max Highlight Duration
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {DURATION_OPTIONS.map((d) => (
                            <button
                              key={d.value}
                              onClick={() => setMaxDuration(d.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                maxDuration === d.value
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                  : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600"
                              }`}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Generate Button */}
              <Button
                onClick={generateHighlights}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl h-12 text-sm"
              >
                <Scissors className="w-4 h-4 mr-2" />
                Generate Highlights
              </Button>
            </motion.div>
          )}

          {/* Loading State */}
          {generating && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">Generating highlights...</p>
                    <p className="text-xs text-zinc-500">{loadingText}</p>
                  </div>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className="text-[10px] text-zinc-600 mt-2 text-center">
                  This may take a few minutes for longer videos
                </p>
              </div>
            </motion.div>
          )}

          {/* Error State */}
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-red-400 font-medium">Highlight generation failed</p>
                  <p className="text-xs text-zinc-400 mt-1">{error}</p>
                  <Button size="sm" variant="outline"
                    className="mt-3 h-7 text-xs border-red-500/20 text-red-400 hover:bg-red-500/10"
                    onClick={resetForm}>
                    Try Again
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Results Section */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-6">

          {/* Summary Card */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <p className="text-sm text-white font-medium">
                  {result.clip_count > 0
                    ? `${result.clip_count} highlights generated`
                    : "No highlights found"
                  }
                </p>
              </div>
              <Button size="sm" variant="outline"
                className="h-7 text-xs border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                onClick={resetForm}>
                <RefreshCw className="w-3 h-3 mr-1" /> New Video
              </Button>
            </div>

            {result.clip_count === 0 && (
              <div className="text-center py-6">
                <Film className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-400 mb-1">{result.message}</p>
                <p className="text-xs text-zinc-500">Try uploading a video with more action or a different highlight type.</p>
              </div>
            )}

            {result.clip_count > 0 && (
              <>
                {/* Video Info + Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-purple-400">{result.clip_count}</p>
                    <p className="text-[10px] text-zinc-500 uppercase">Clips</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-purple-400">{result.total_duration?.toFixed(1)}s</p>
                    <p className="text-[10px] text-zinc-500 uppercase">Total</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-purple-400">
                      {result.video_info ? formatTime(result.video_info.duration) : "--"}
                    </p>
                    <p className="text-[10px] text-zinc-500 uppercase">Source</p>
                  </div>
                </div>

                {/* Download Reel Button */}
                {result.reel_available && result.highlight_id && (
                  <Button
                    className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl h-11 text-sm mb-4"
                    onClick={() => {
                      const tk = localStorage.getItem("playsmart_token") || "";
                      const url = `${api.defaults.baseURL}/highlights/${result.highlight_id}/standalone/reel?token=${tk}`;
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `athlyticai_highlights_reel.mp4`;
                      a.click();
                      toast.success("Downloading highlight reel...");
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" /> Download Full Highlight Reel
                  </Button>
                )}

                {/* Preview Video */}
                {result.preview_b64 && (
                  <div className="mb-4 rounded-xl overflow-hidden bg-zinc-800 relative group">
                    <video
                      src={result.preview_b64}
                      className="w-full h-auto max-h-56 object-cover"
                      controls
                      muted
                      playsInline
                      poster={result.clips?.[0]?.thumbnail_b64}
                    />
                    <div className="absolute top-2 left-2">
                      <Badge className="bg-black/60 text-purple-400 border-purple-400/20 text-[10px]">
                        <Scissors className="w-2.5 h-2.5 mr-1" /> AI Highlight Preview
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Inline Video Player for selected clip */}
                {playingClip !== null && result.highlight_id && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-zinc-400">
                        Playing Clip {playingClip + 1} — <span className="text-purple-400">
                          {result.clips[playingClip]?.label === "power_moment" ? "Power Moment" :
                           result.clips[playingClip]?.label === "rally" ? "Rally" :
                           result.clips[playingClip]?.label === "transition" ? "Active Play" :
                           result.clips[playingClip]?.label}
                        </span> ({result.clips[playingClip]?.duration?.toFixed(1)}s)
                      </p>
                      <Button size="sm" variant="ghost"
                        className="h-6 text-[10px] text-zinc-400 hover:text-white px-2"
                        onClick={() => setPlayingClip(null)}>
                        <X className="w-3 h-3 mr-1" /> Close
                      </Button>
                    </div>
                    <div className="rounded-xl overflow-hidden bg-black">
                      <video
                        key={playingClip}
                        src={`${api.defaults.baseURL}/highlights/${result.highlight_id}/standalone/clip/${playingClip}?token=${localStorage.getItem("playsmart_token") || ""}`}
                        className="w-full h-auto max-h-80"
                        controls
                        autoPlay
                        playsInline
                      />
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        onClick={() => {
                          const tk = localStorage.getItem("playsmart_token") || "";
                          const url = `${api.defaults.baseURL}/highlights/${result.highlight_id}/standalone/clip/${playingClip}?token=${tk}`;
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `highlight_clip_${playingClip + 1}.mp4`;
                          a.click();
                          toast.success("Downloading clip...");
                        }}>
                        <Download className="w-3 h-3 mr-1" /> Download Clip
                      </Button>
                      {playingClip > 0 && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-400"
                          onClick={() => setPlayingClip(playingClip - 1)}>Prev</Button>
                      )}
                      {playingClip < result.clips.length - 1 && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-400"
                          onClick={() => setPlayingClip(playingClip + 1)}>Next</Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Individual Clips Grid */}
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">Individual Clips</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {result.clips.map((clip, i) => (
                    <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 + i * 0.06 }}
                      className={`relative group rounded-xl overflow-hidden bg-zinc-800 cursor-pointer transition-all ${
                        playingClip === i ? "ring-2 ring-purple-400" : "hover:ring-1 hover:ring-purple-400/30"
                      }`}
                      onClick={() => setPlayingClip(i)}
                    >
                      {clip.thumbnail_b64 ? (
                        <img src={clip.thumbnail_b64} alt={`Clip ${i + 1}`} className="w-full h-24 object-cover" />
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center">
                          <Video className="w-6 h-6 text-zinc-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                        <div className="flex items-center justify-between w-full">
                          <Badge className={`text-[9px] px-1.5 py-0 ${
                            clip.label === "power_moment" ? "bg-red-500/20 text-red-400 border-red-500/20" :
                            clip.label === "rally" ? "bg-sky-500/20 text-sky-400 border-sky-500/20" :
                            "bg-amber-500/20 text-amber-400 border-amber-500/20"
                          }`}>
                            {clip.label === "power_moment" ? "Power" : clip.label === "rally" ? "Rally" : "Active"}
                          </Badge>
                          <span className="text-[10px] text-zinc-400">{clip.duration?.toFixed(1)}s</span>
                        </div>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-8 h-8 rounded-full bg-purple-400/90 flex items-center justify-center">
                          <Play className="w-4 h-4 text-black ml-0.5" />
                        </div>
                      </div>
                      {/* Clip number */}
                      <div className="absolute top-1.5 right-1.5">
                        <span className="text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">#{i + 1}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Share / Copy */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800">
                  <span className="text-[10px] text-zinc-500">
                    {result.clip_count} clips | {result.total_duration?.toFixed(1)}s total highlights
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost"
                      className="h-6 text-[10px] text-zinc-400 hover:text-purple-400 px-2"
                      onClick={() => {
                        const text = `Check out my match highlights on AthlyticAI! ${window.location.origin}/highlights`;
                        const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
                        window.open(waUrl, "_blank");
                      }}>
                      Share on WhatsApp
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="h-6 text-[10px] text-zinc-400 hover:text-purple-400 px-2"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/highlights`);
                        toast.success("Link copied!");
                      }}>
                      <Copy className="w-3 h-3 mr-1" /> Copy Link
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

        </motion.div>
      )}
    </div>
  );
}
