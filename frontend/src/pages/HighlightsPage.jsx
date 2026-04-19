import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Film, Upload, Download, Play, Pause, SkipForward,
  Video, AlertTriangle, ChevronDown, X,
  Sparkles, RefreshCw, Scissors, ChevronRight
} from "lucide-react";
import { SPORT_LABEL, SPORT_EMOJI } from "@/lib/sportConfig";
import SEO from "@/components/SEO";

export default function HighlightsPage() {
  const { profile } = useAuth();
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [selectedSport, setSelectedSport] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [highlights, setHighlights] = useState(null);
  const [error, setError] = useState(null);

  // Reel playback state
  const [isPlayingReel, setIsPlayingReel] = useState(false);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const fileRef = useRef(null);

  useEffect(() => { document.title = "Highlights | AthlyticAI"; }, []);

  const activeSport = profile?.active_sport || "badminton";
  useEffect(() => { if (!selectedSport) setSelectedSport(activeSport); }, [activeSport, selectedSport]);

  // Clean up video URL on unmount
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["mp4", "avi", "mov", "mkv", "webm"].includes(ext)) {
      toast.error("Unsupported format. Use MP4, AVI, MOV, MKV, or WEBM.");
      return;
    }
    setFile(f);
    setHighlights(null);
    setError(null);
    setRecordedBlob(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(f));
  };

  const resetForm = () => {
    setFile(null);
    setHighlights(null);
    setError(null);
    setRecordedBlob(null);
    setIsPlayingReel(false);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ─── Analyze video for highlights ───
  const analyzeVideo = async () => {
    if (!file) return;
    setAnalyzing(true);
    setProgress(0);
    setError(null);
    setHighlights(null);

    try {
      // Pose-based detector picks actual SHOT moments via wrist-acceleration
      // peaks. Falls back to motion-based detection if MoveNet fails.
      let result = null;
      try {
        const { detectPoseHighlights } = await import("@/ai/poseHighlightDetector");
        result = await detectPoseHighlights(file, selectedSport || activeSport, {
          maxHighlights: 8,
          onProgress: ({ percent, message }) => {
            setProgress(percent || 0);
            if (message) setLoadingText(message);
          },
        });
      } catch (poseErr) {
        console.warn("Pose detector failed, falling back to motion-based:", poseErr);
      }

      // Fallback: pixel-motion detector if pose detector found nothing
      if (!result || result.highlights.length === 0) {
        const { detectHighlights } = await import("@/ai/highlightDetector");
        result = await detectHighlights(file, selectedSport || activeSport, {
          maxHighlights: 8,
          onProgress: ({ percent, message }) => {
            setProgress(percent || 0);
            if (message) setLoadingText(message);
          },
        });
      }

      if (result.highlights.length === 0) {
        setError("No highlight moments found. Try a longer video with more action.");
      } else {
        setHighlights(result);
        toast.success(`Found ${result.highlights.length} highlight moments!`);
      }
    } catch (err) {
      console.error("Analysis failed:", err);
      setError(err.message || "Analysis failed");
    }
    setAnalyzing(false);
  };

  // ─── Play highlight reel (seeks through moments) ───
  const playHighlightReel = useCallback(() => {
    if (!highlights?.highlights?.length || !videoRef.current) return;
    setCurrentClipIndex(0);
    setIsPlayingReel(true);
    const firstMoment = highlights.highlights[0];
    videoRef.current.currentTime = firstMoment.start_time;
    videoRef.current.play();
  }, [highlights]);

  const stopReel = useCallback(() => {
    setIsPlayingReel(false);
    if (videoRef.current) videoRef.current.pause();
  }, []);

  // Handle timeupdate during reel playback
  const handleTimeUpdate = useCallback(() => {
    if (!isPlayingReel || !highlights?.highlights?.length || !videoRef.current) return;

    const current = highlights.highlights[currentClipIndex];
    if (!current) { stopReel(); return; }

    if (videoRef.current.currentTime >= current.end_time) {
      const nextIdx = currentClipIndex + 1;
      if (nextIdx < highlights.highlights.length) {
        setCurrentClipIndex(nextIdx);
        videoRef.current.currentTime = highlights.highlights[nextIdx].start_time;
        videoRef.current.play();
      } else {
        stopReel();
        toast.success("Highlight reel complete!");
      }
    }
  }, [isPlayingReel, currentClipIndex, highlights, stopReel]);

  // ─── Record reel using MediaRecorder + Canvas ───
  const downloadReel = async () => {
    if (!highlights?.highlights?.length || !videoRef.current) return;

    setIsRecording(true);
    recordedChunksRef.current = [];

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");

    // Create MediaRecorder from canvas stream
    const stream = canvas.captureStream(30);
    // Also capture audio from the video if available
    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch (e) {
      // Audio capture not supported or no audio track — continue silently
    }

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2500000,
    });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      setRecordedBlob(blob);
      setIsRecording(false);
      toast.success("Highlight reel recorded! Click download.");
    };

    recorder.start(100);

    // Draw frames to canvas in a loop
    let clipIdx = 0;
    const moments = highlights.highlights;
    video.currentTime = moments[0].start_time;
    video.muted = false;

    const drawFrame = () => {
      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state !== "recording"
      )
        return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (video.currentTime >= moments[clipIdx].end_time) {
        clipIdx++;
        if (clipIdx < moments.length) {
          video.currentTime = moments[clipIdx].start_time;
          video.play();
        } else {
          video.pause();
          recorder.stop();
          return;
        }
      }
      requestAnimationFrame(drawFrame);
    };

    video.onseeked = () => {
      video.play();
      requestAnimationFrame(drawFrame);
    };
    video.currentTime = moments[0].start_time;
  };

  // ─── Play individual moment ───
  const playMoment = (moment) => {
    if (!videoRef.current) return;
    setIsPlayingReel(false);
    videoRef.current.currentTime = moment.start_time;
    videoRef.current.play();
    const checkEnd = () => {
      if (videoRef.current && videoRef.current.currentTime >= moment.end_time) {
        videoRef.current.pause();
        videoRef.current.removeEventListener("timeupdate", checkEnd);
      }
    };
    videoRef.current.addEventListener("timeupdate", checkEnd);
  };

  // Calculate total highlight duration
  const totalHighlightDuration =
    highlights?.highlights?.reduce((sum, m) => sum + m.duration, 0) || 0;

  return (
    <div
      className="container mx-auto px-4 max-w-3xl py-6 sm:py-10 min-h-screen bg-zinc-950"
      data-testid="highlights-page"
    >
      <SEO
        title="Free Highlight Reel Generator"
        description="Create highlight reels from your match videos. AI detects the best moments right in your browser."
      />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Film className="w-6 h-6 text-purple-400" />
        <div>
          <h1 className="font-heading font-bold text-xl text-white">
            Highlights
          </h1>
          <p className="text-xs text-zinc-400">
            Create highlight reels from your match videos
          </p>
        </div>
      </div>

      {/* Upload Area (if no highlights yet) */}
      {!highlights && !analyzing && (
        <div>
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-4 text-xs text-zinc-400">
            <p className="text-blue-300 font-medium mb-1">
              100% on-device processing
            </p>
            <p>
              Your video never leaves your phone. We analyze it right here in
              your browser.
            </p>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              file
                ? "border-purple-500/40 bg-purple-500/5"
                : "border-zinc-700 hover:border-purple-500/30"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".mp4,.avi,.mov,.mkv,.webm"
              className="hidden"
              onChange={handleFile}
            />
            {!file ? (
              <>
                <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                <p className="text-sm text-zinc-300">
                  Tap to select your match video
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  MP4, MOV, AVI, MKV, WEBM
                </p>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-left">
                  <Video className="w-8 h-8 text-purple-400" />
                  <div>
                    <p className="text-sm text-white font-medium truncate max-w-[200px]">
                      {file.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-zinc-400 h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetForm();
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {file && (
            <Button
              onClick={analyzeVideo}
              className="w-full mt-4 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl h-12"
            >
              <Scissors className="w-4 h-4 mr-2" /> Find Highlights
            </Button>
          )}

          {error && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mt-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
                <div>
                  <p className="text-sm text-red-400">{error}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={resetForm}
                    className="text-red-400 mt-2 h-7 text-xs"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading/Analyzing */}
      {analyzing && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
            <div>
              <p className="text-sm text-white font-medium">
                {loadingText || "Analyzing..."}
              </p>
              <p className="text-xs text-zinc-500">
                This runs entirely on your device
              </p>
            </div>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 mt-2 text-center">
            {Math.round(progress)}%
          </p>
        </div>
      )}

      {/* Results */}
      {highlights && highlights.highlights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Video Player */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="relative bg-black" style={{ maxHeight: "50vh" }}>
              <video
                ref={videoRef}
                src={videoUrl}
                controls={!isPlayingReel}
                playsInline
                onTimeUpdate={handleTimeUpdate}
                className="w-full h-auto max-h-[50vh] object-contain"
              />
              {/* Hidden canvas for recording */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Reel overlay when playing */}
              {isPlayingReel && (
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                  <Badge className="bg-red-500/90 text-white border-none animate-pulse">
                    Playing Reel · {currentClipIndex + 1}/
                    {highlights.highlights.length}
                  </Badge>
                  <Button
                    size="sm"
                    onClick={stopReel}
                    className="bg-black/60 text-white h-7 text-xs"
                  >
                    Stop
                  </Button>
                </div>
              )}
            </div>

            <div className="p-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-zinc-800/50 rounded-xl p-2 text-center">
                  <p className="text-lg font-bold text-purple-400">
                    {highlights.highlights.length}
                  </p>
                  <p className="text-[10px] text-zinc-500">Moments</p>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-2 text-center">
                  <p className="text-lg font-bold text-purple-400">
                    {Math.round(totalHighlightDuration)}s
                  </p>
                  <p className="text-[10px] text-zinc-500">Highlight</p>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-2 text-center">
                  <p className="text-lg font-bold text-zinc-400">
                    {Math.round(highlights.video_info.duration)}s
                  </p>
                  <p className="text-[10px] text-zinc-500">Original</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Button
                  onClick={playHighlightReel}
                  disabled={isPlayingReel || isRecording}
                  className="bg-purple-500 hover:bg-purple-600 text-white font-bold h-11"
                >
                  <Play className="w-4 h-4 mr-1" /> Play Reel
                </Button>
                <Button
                  onClick={downloadReel}
                  disabled={isRecording}
                  variant="outline"
                  className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 h-11"
                >
                  {isRecording ? (
                    <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-1" />
                  )}
                  {isRecording ? "Recording..." : "Record Reel"}
                </Button>
              </div>

              {/* Download recorded reel */}
              {recordedBlob && (
                <Button
                  onClick={() => {
                    const url = URL.createObjectURL(recordedBlob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "athlyticai_highlights.webm";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                  className="w-full bg-lime-400 text-black hover:bg-lime-500 font-bold h-11 mb-3"
                >
                  <Download className="w-4 h-4 mr-2" /> Download Highlight Reel
                  ({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)
                </Button>
              )}

              {/* New Video button */}
              <Button
                variant="ghost"
                onClick={resetForm}
                className="w-full text-zinc-400 text-xs h-8"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Upload Different Video
              </Button>
            </div>
          </div>

          {/* Individual Moments */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
            <h3 className="font-bold text-white text-sm mb-3">
              Detected Moments
            </h3>
            <div className="space-y-2">
              {highlights.highlights.map((moment, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => playMoment(moment)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 cursor-pointer transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0 group-hover:bg-purple-500/30">
                    <Play className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white capitalize">
                      {String(moment.type || "moment").replace(/_/g, " ")}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {formatTime(moment.start_time)} —{" "}
                      {formatTime(moment.end_time)} · {moment.duration}s
                    </p>
                  </div>
                  <Badge
                    className={`text-[9px] shrink-0 ${
                      moment.score > 70
                        ? "bg-lime-400/10 text-lime-400 border-lime-400/20"
                        : moment.score > 40
                        ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
                        : "bg-zinc-700 text-zinc-300 border-zinc-600"
                    }`}
                  >
                    {moment.score}/100
                  </Badge>
                  {moment.should_slowmo && (
                    <span className="text-[9px] text-blue-400">SloMo</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
