import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Film, Upload, Download, Scissors, Copy,
  Video, AlertTriangle, ChevronDown, Info, X,
  Settings, Sparkles, RefreshCw, Shield
} from "lucide-react";
import { SPORT_LABEL, SPORT_EMOJI } from "@/lib/sportConfig";
import SEO from "@/components/SEO";

const HIGHLIGHT_COUNT_OPTIONS = [
  { value: 4, label: "4 clips" },
  { value: 6, label: "6 clips" },
  { value: 8, label: "8 clips" },
  { value: 12, label: "12 clips" },
];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function HighlightsPage() {
  const { profile } = useAuth();
  const [file, setFile] = useState(null);
  const [selectedSport, setSelectedSport] = useState(null);
  const [maxClips, setMaxClips] = useState(8);
  const [includeSlomo, setIncludeSlomo] = useState(true);

  // Set page title
  useEffect(() => { document.title = "Highlights | AthlyticAI"; }, []);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  const activeSport = profile?.active_sport || "badminton";

  useEffect(() => {
    if (!selectedSport) setSelectedSport(activeSport);
  }, [activeSport, selectedSport]);

  // Convert blobs to playable URLs
  const reelUrl = useMemo(
    () => (result?.reel ? URL.createObjectURL(result.reel) : null),
    [result?.reel]
  );
  const clipUrls = useMemo(
    () =>
      result?.clips?.map((c) => ({
        url: URL.createObjectURL(c.blob),
        thumbUrl: URL.createObjectURL(c.thumbnail),
        moment: c.moment,
      })) || [],
    [result?.clips]
  );

  // Cleanup blob URLs when they change or on unmount
  useEffect(() => {
    return () => {
      if (reelUrl) URL.revokeObjectURL(reelUrl);
      clipUrls.forEach((c) => {
        URL.revokeObjectURL(c.url);
        URL.revokeObjectURL(c.thumbUrl);
      });
    };
  }, [reelUrl, clipUrls]);

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
    setLoadingText("Loading video editor...");

    try {
      // Lazy-load the highlight generator so ffmpeg.wasm is code-split
      const { generateHighlightReel } = await import("@/ai/highlightGenerator");

      const reelResult = await generateHighlightReel(file, selectedSport || activeSport, {
        maxClips,
        includeSlomo,
        onProgress: ({ percent, message }) => {
          if (typeof percent === "number") setProgress(percent);
          if (message) setLoadingText(message);
        },
      });

      setProgress(100);
      setLoadingText("Done!");
      setResult(reelResult);
      toast.success(`Generated ${reelResult.clips.length} highlight clips!`);
    } catch (err) {
      console.error("Highlight generation failed:", err);
      const msg = err?.message || "Highlight generation failed";
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
    setLoadingText("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 container mx-auto px-4 max-w-4xl py-6 sm:py-10" data-testid="highlights-page">
      <SEO
        title="Free Highlight Reel Generator - Create Match Highlights Instantly"
        description="Create stunning highlight reels from your match videos. AI detects the best moments - smashes, rallies, winning points - and combines them with slo-mo and speed overlays. Free, no upload needed."
        keywords="sports highlight generator, badminton highlight reel, tennis highlights creator, match highlights video, sports video editor"
        url="https://athlyticai.com/highlights"
      />
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
        className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 mb-4 flex items-center gap-3">
        <Info className="w-4 h-4 text-purple-400 shrink-0" />
        <p className="text-xs text-zinc-400">
          Upload a match video (MP4, MOV, etc.) up to <span className="text-white font-medium">500 MB</span> to auto-generate highlights.
        </p>
      </motion.div>

      {/* First-Use Warning */}
      {!generating && !result && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 mb-6 flex items-start gap-2">
          <Shield className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            First-time use: We'll download the video editor (~25MB) which works entirely in your browser.
            Your video never leaves your device.
          </p>
        </div>
      )}

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
                      {/* Max Clips */}
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2 block">
                          Max Clips
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {HIGHLIGHT_COUNT_OPTIONS.map((d) => (
                            <button
                              key={d.value}
                              onClick={() => setMaxClips(d.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                maxClips === d.value
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                  : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600"
                              }`}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Slo-mo Toggle */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-zinc-300 font-medium">Include slo-mo on power moments</p>
                          <p className="text-[10px] text-zinc-500">Slow-motion on high-speed shots</p>
                        </div>
                        <button
                          onClick={() => setIncludeSlomo(!includeSlomo)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            includeSlomo ? "bg-purple-500" : "bg-zinc-700"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              includeSlomo ? "translate-x-5" : ""
                            }`}
                          />
                        </button>
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
                    <p className="text-sm text-white font-medium">{loadingText || "Working..."}</p>
                    <p className="text-xs text-zinc-500">This may take a few minutes</p>
                  </div>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className="text-[10px] text-zinc-600 mt-2 text-center">{Math.round(progress)}%</p>
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
      {result && reelUrl && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-6">

          {/* Main Reel Player */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-white text-lg">Your Highlight Reel</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20">
                  {result.clips.length} clips
                </Badge>
                <Button size="sm" variant="outline"
                  className="h-7 text-xs border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  onClick={resetForm}>
                  <RefreshCw className="w-3 h-3 mr-1" /> New Video
                </Button>
              </div>
            </div>
            <video
              src={reelUrl}
              controls
              className="w-full rounded-xl bg-black"
              poster={clipUrls[0]?.thumbUrl}
            />
            <Button
              onClick={() => downloadBlob(result.reel, "athlyticai_highlights.mp4")}
              className="w-full mt-4 bg-lime-400 text-black hover:bg-lime-500 font-bold"
            >
              <Download className="w-4 h-4 mr-2" /> Download Highlight Reel
            </Button>

            {/* Share / Copy */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
              <span className="text-[10px] text-zinc-500">
                Generated entirely in your browser
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
          </div>

          {/* Individual Clips Grid */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <h3 className="font-bold text-white text-lg mb-4">Individual Clips</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {clipUrls.map((clip, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 * i }}
                  className="bg-zinc-800/50 rounded-xl overflow-hidden"
                >
                  <video
                    src={clip.url}
                    controls
                    poster={clip.thumbUrl}
                    className="w-full aspect-video bg-black"
                  />
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-white text-sm capitalize">
                        {String(clip.moment.type || "moment").replace(/_/g, " ")}
                      </p>
                      <Badge className="bg-purple-400/10 text-purple-400 border-purple-400/20 text-xs">
                        {Math.round(clip.moment.score || 0)}/100
                      </Badge>
                    </div>
                    {clip.moment.description && (
                      <p className="text-xs text-zinc-400 mb-2">{clip.moment.description}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>{clip.moment.duration?.toFixed(1)}s</span>
                      {clip.moment.speed_kmh > 0 && (
                        <span className="text-amber-400">{Math.round(clip.moment.speed_kmh)} km/h</span>
                      )}
                      {clip.moment.should_slowmo && (
                        <span className="text-blue-400">Slo-mo</span>
                      )}
                    </div>
                    <Button
                      onClick={() => downloadBlob(result.clips[i].blob, `clip_${i + 1}.mp4`)}
                      size="sm"
                      variant="outline"
                      className="w-full mt-2 border-zinc-700 text-zinc-300 text-xs h-8"
                    >
                      <Download className="w-3 h-3 mr-1" /> Download
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

        </motion.div>
      )}
    </div>
  );
}
