import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, Upload, Play, AlertTriangle, CheckCircle2, Target,
  TrendingUp, Dumbbell, ChevronRight, Star, Shield, Sparkles,
  Clock, BarChart3, Zap, RefreshCw, History, ArrowRight,
  ChevronDown, ChevronUp, ExternalLink, ThumbsUp, Calendar,
  Bot, Lightbulb, Youtube, Download, Share2, Film, Scissors, Copy,
  Users, Cpu, Cloud
} from "lucide-react";
import api from "@/lib/api";
import ShareModal from "@/components/ShareModal";
import { NewBadgeOverlay } from "@/components/BadgeDisplay";

const CLIENT_LOADING_STEPS = [
  { pct: 10, text: "Loading AI model..." },
  { pct: 25, text: "Extracting frames from video..." },
  { pct: 45, text: "Detecting poses with AI..." },
  { pct: 60, text: "Classifying your technique..." },
  { pct: 75, text: "Computing performance metrics..." },
  { pct: 90, text: "Getting coaching feedback..." },
];

const QUICK_LOADING_STEPS = [
  { pct: 15, text: "Analyzing your stance..." },
  { pct: 35, text: "Checking your swing technique..." },
  { pct: 60, text: "Identifying key improvements..." },
  { pct: 85, text: "Preparing quick coaching tips..." },
];

const FULL_LOADING_STEPS = [
  { pct: 8, text: "Uploading video..." },
  { pct: 18, text: "Analyzing your stance and posture..." },
  { pct: 30, text: "Detecting shot type and technique..." },
  { pct: 42, text: "Checking your swing mechanics..." },
  { pct: 55, text: "Analyzing footwork patterns..." },
  { pct: 65, text: "Comparing with pro players..." },
  { pct: 75, text: "Identifying strengths..." },
  { pct: 85, text: "Generating improvement plan..." },
  { pct: 92, text: "Preparing your coaching report..." },
];

export default function AnalyzePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [file, setFile] = useState(null);
  const [analysisMode, setAnalysisMode] = useState(searchParams.get("mode") || null);
  const [selectedSport, setSelectedSport] = useState(null);

  // Set page title
  useEffect(() => { document.title = "Analyze | AthlyticAI"; }, []);

  const [targetPlayer, setTargetPlayer] = useState("auto");
  const [playerSelectorOpen, setPlayerSelectorOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("upload");
  const [expandedIssue, setExpandedIssue] = useState(null);
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  const [improvementData, setImprovementData] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareData, setShareData] = useState(null);
  const [newBadge, setNewBadge] = useState(null);
  const [viewingHistorical, setViewingHistorical] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [processingMode, setProcessingMode] = useState("client"); // "client" or "server"

  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await api.get(`/progress/analysis-history/${user.id}`);
      setHistory(data.analyses || []);
      setImprovementData({
        metric_improvements: data.metric_improvements || [],
        coach_message: data.coach_improvement_message,
        improvement_summary: data.improvement_summary,
        dimension_improvements: data.dimension_improvements || [],
        earned_badges: data.earned_badges || [],
        upload_streak: data.upload_streak || 0,
      });
    } catch {
      // Fallback to basic history endpoint
      try {
        const { data } = await api.get(`/analysis-history/${user.id}`);
        setHistory(data.analyses || []);
      } catch {}
    }
  }, [user?.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const viewAnalysisDetail = async (analysisId) => {
    if (!analysisId || loadingDetail) return;
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/analysis/${analysisId}`);
      setResult(data);
      setViewingHistorical(true);
      setActiveTab("results");
    } catch (err) {
      toast.error("Failed to load analysis details");
    }
    setLoadingDetail(false);
  };

  const backToHistory = () => {
    setViewingHistorical(false);
    setResult(null);
    setActiveTab("history");
  };

  // Drag & drop handlers
  const handleDragOver = (e) => { e.preventDefault(); dropRef.current?.classList.add("border-lime-400", "bg-lime-400/5"); };
  const handleDragLeave = (e) => { e.preventDefault(); dropRef.current?.classList.remove("border-lime-400", "bg-lime-400/5"); };
  const handleDrop = (e) => {
    e.preventDefault();
    dropRef.current?.classList.remove("border-lime-400", "bg-lime-400/5");
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("video/")) setFile(f);
    else toast.error("Please drop a video file.");
  };

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
  };

  const clearFile = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setTargetPlayer("auto");
    setPlayerSelectorOpen(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const analyze = async () => {
    if (!file) return;
    if (!analysisMode) { toast.error("Please select an analysis mode"); return; }

    setAnalyzing(true);
    setResult(null);
    setError(null);
    setProgress(0);

    const VIDEO_ANALYSIS_SPORTS = ["badminton", "tennis", "table_tennis", "pickleball"];
    const activeSport = profile?.active_sport || "badminton";
    const sportToAnalyze = selectedSport || (VIDEO_ANALYSIS_SPORTS.includes(activeSport) ? activeSport : "badminton");

    if (processingMode === "client") {
      // ─── Client-side analysis (on-device) ───
      setLoadingText("Loading AI model...");
      const steps = CLIENT_LOADING_STEPS;
      let stepIdx = 0;
      const interval = setInterval(() => {
        if (stepIdx < steps.length) {
          setProgress(steps[stepIdx].pct);
          setLoadingText(steps[stepIdx].text);
          stepIdx++;
        }
      }, 2000);

      try {
        let analyzeVideo;
        try {
          const mod = await import("@/ai/videoProcessor");
          analyzeVideo = mod.analyzeVideo;
        } catch (importErr) {
          toast.error("On-device AI not available. Switching to server mode...");
          clearInterval(interval);
          setProcessingMode("server");
          setAnalyzing(false);
          return;
        }

        const clientResult = await analyzeVideo(file, sportToAnalyze, {
          mode: analysisMode,
          targetPlayer,
          onProgress: (info) => {
            // videoProcessor sends { step, percent, message }
            const pct = typeof info === "number" ? info : info?.percent;
            const msg = typeof info === "string" ? info : info?.message;
            if (pct != null) setProgress(pct);
            if (msg) setLoadingText(msg);
          },
        });

        if (!clientResult || clientResult.error) {
          throw new Error(clientResult?.error || "Analysis returned no results");
        }

        // Send client results to backend for coaching enrichment (only if logged in)
        const hasToken = !!localStorage.getItem('playsmart_token');
        if (hasToken) {
          setProgress(92);
          setLoadingText("Getting coaching feedback...");
          try {
            const { data } = await api.post("/analyze-client-results", {
              sport: sportToAnalyze,
              shot_type: clientResult.shot_type || clientResult.shot_analysis?.shot_type || "unknown",
              confidence: clientResult.confidence || clientResult.shot_analysis?.confidence || 0,
              metrics: clientResult.metrics || {},
              speed: clientResult.speed || clientResult.speed_analysis || {},
              skill_level: clientResult.skill_level || "Beginner",
              shot_grade: clientResult.shot_grade || "C",
              segments: clientResult.segments || [],
              video_info: clientResult.video_info || {},
              player_preview: clientResult.player_preview || null,
              weaknesses: clientResult.weaknesses || [],
            }, { timeout: 30000 });

            clearInterval(interval);
            setProgress(100);
            setLoadingText("Complete!");

            if (data.success !== false) {
              data._processingMode = "client";
              setResult(data);
              setViewingHistorical(false);
              setActiveTab("results");
              refreshProfile();
              loadHistory();
              toast.success("Analysis complete!");
              if (data.new_badges?.length > 0) {
                setTimeout(() => setNewBadge(data.new_badges[0]), 1500);
              }
            } else {
              throw new Error("Server enrichment failed");
            }
          } catch (serverErr) {
            // Server enrichment failed — show full client-side results anyway
            clearInterval(interval);
            setProgress(100);
            setLoadingText("Complete!");

            clientResult._processingMode = "client";
            setResult(clientResult);
            setViewingHistorical(false);
            setActiveTab("results");
            toast.info("Analysis complete! Coaching feedback will be available when connected.");
          }
        } else {
          // Guest user - show full client-side results directly
          clearInterval(interval);
          setProgress(100);
          setLoadingText("Complete!");

          clientResult._processingMode = "client";
          setResult(clientResult);
          setViewingHistorical(false);
          setActiveTab("results");
          toast.success("Analysis complete!");
        }
      } catch (err) {
        clearInterval(interval);
        const msg = err.response?.data?.detail || err.message || "Analysis failed";
        setError(msg);
        toast.error(msg);
      }
    } else {
      // ─── Server-side analysis (upload) ───
      setLoadingText("Uploading video...");
      const steps = analysisMode === "quick" ? QUICK_LOADING_STEPS : FULL_LOADING_STEPS;
      let stepIdx = 0;
      const interval = setInterval(() => {
        if (stepIdx < steps.length) {
          setProgress(steps[stepIdx].pct);
          setLoadingText(steps[stepIdx].text);
          stepIdx++;
        }
      }, analysisMode === "quick" ? 1800 : 2500);

      try {
        const formData = new FormData();
        formData.append("video", file);
        const playerParam = targetPlayer !== "auto" ? `&target_player=${targetPlayer}` : "";
        const { data } = await api.post(
          `/analyze-video?sport=${sportToAnalyze}&analysis_mode=${analysisMode}${playerParam}`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 }
        );

        clearInterval(interval);
        setProgress(100);
        setLoadingText("Complete!");

        if (data.success) {
          data._processingMode = "server";
          setResult(data);
          setViewingHistorical(false);
          setActiveTab("results");
          refreshProfile();
          loadHistory();
          toast.success("Analysis complete!");
          if (data.new_badges?.length > 0) {
            setTimeout(() => setNewBadge(data.new_badges[0]), 1500);
          }
        } else {
          throw new Error("Analysis returned unsuccessful");
        }
      } catch (err) {
        clearInterval(interval);
        const msg = err.response?.data?.detail || err.message || "Analysis failed";
        setError(msg);
        toast.error(msg);
      }
    }
    setAnalyzing(false);
  };

  // ── Pre-upload: Mode Selection ──
  const renderModeSelection = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
      <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">Choose Analysis Mode</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <motion.button
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setAnalysisMode("quick")}
          className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
            analysisMode === "quick"
              ? "border-lime-400/50 bg-lime-400/5 shadow-[0_0_20px_rgba(190,242,100,0.15)]"
              : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
          }`}
        >
          {analysisMode === "quick" && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="absolute top-3 right-3 w-6 h-6 rounded-full ring-2 ring-lime-400 bg-zinc-900 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-lime-400" />
            </motion.div>
          )}
          <Zap className={`w-8 h-8 mb-3 ${analysisMode === "quick" ? "text-lime-400" : "text-zinc-500"}`} strokeWidth={1.5} />
          <p className="font-heading font-bold text-lg text-white uppercase tracking-tight">Quick Analysis</p>
          <p className="text-zinc-400 text-sm mt-1">Get 1-2 key fixes in seconds</p>
          <div className="flex items-center gap-2 mt-3">
            <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
              <Clock className="w-2.5 h-2.5 mr-1" /> ~30 sec
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
              Max 20 sec video
            </Badge>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setAnalysisMode("full")}
          className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
            analysisMode === "full"
              ? "border-sky-400/50 bg-sky-400/5 shadow-[0_0_20px_rgba(56,189,248,0.15)]"
              : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
          }`}
        >
          {analysisMode === "full" && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="absolute top-3 right-3 w-6 h-6 rounded-full ring-2 ring-sky-400 bg-zinc-900 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-sky-400" />
            </motion.div>
          )}
          <Target className={`w-8 h-8 mb-3 ${analysisMode === "full" ? "text-sky-400" : "text-zinc-500"}`} strokeWidth={1.5} />
          <p className="font-heading font-bold text-lg text-white uppercase tracking-tight">Full Analysis</p>
          <p className="text-zinc-400 text-sm mt-1">Complete technique breakdown</p>
          <div className="flex items-center gap-2 mt-3">
            <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
              <Clock className="w-2.5 h-2.5 mr-1" /> ~2 min
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
              Max 60 sec video
            </Badge>
          </div>
        </motion.button>
      </div>
    </motion.div>
  );

  const SPORT_OPTIONS = [
    { key: "badminton", label: "Badminton", icon: "🏸", videoAnalysis: true },
    { key: "tennis", label: "Tennis", icon: "🎾", videoAnalysis: true },
    { key: "table_tennis", label: "Table Tennis", icon: "🏓", videoAnalysis: true },
    { key: "pickleball", label: "Pickleball", icon: "⚡", videoAnalysis: true },
    { key: "cricket", label: "Cricket", icon: "🏏", videoAnalysis: false },
    { key: "football", label: "Football", icon: "⚽", videoAnalysis: false },
    { key: "swimming", label: "Swimming", icon: "🏊", videoAnalysis: false },
  ];

  const renderSportSelector = () => {
    const activeSport = profile?.active_sport || "badminton";
    const supportedSports = SPORT_OPTIONS.filter(s => s.videoAnalysis).map(s => s.key);
    const currentSport = selectedSport || (supportedSports.includes(activeSport) ? activeSport : "badminton");
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">Sport in Video</p>
        <div className="flex flex-wrap gap-2">
          {SPORT_OPTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => s.videoAnalysis && setSelectedSport(s.key)}
              disabled={!s.videoAnalysis}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                !s.videoAnalysis
                  ? "border-zinc-800/50 bg-zinc-900/40 text-zinc-600 cursor-not-allowed opacity-60"
                  : currentSport === s.key
                    ? "border-lime-400/50 bg-lime-400/10 text-lime-400"
                    : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <span className="mr-1">{s.icon}</span> {s.label}
              {!s.videoAnalysis && (
                <span className="ml-1.5 text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Soon</span>
              )}
            </button>
          ))}
        </div>
      </motion.div>
    );
  };

  const playerPositionLabels = {
    "top-left": "Far Court - Left",
    "top-right": "Far Court - Right",
    "bottom-left": "Near Court - Left",
    "bottom-right": "Near Court - Right",
  };

  const renderPlayerSelector = () => (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        {/* Doubles match toggle */}
        <button
          onClick={() => {
            const opening = !playerSelectorOpen;
            setPlayerSelectorOpen(opening);
            if (!opening) setTargetPlayer("auto");
          }}
          className="flex items-center gap-3 text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 hover:text-zinc-300 transition-colors"
        >
          <Users className="w-3.5 h-3.5" />
          <span>Doubles Match</span>
          {/* Toggle switch */}
          <div className={`relative w-9 h-5 rounded-full transition-colors ${playerSelectorOpen ? "bg-lime-400/40" : "bg-zinc-700"}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${playerSelectorOpen ? "left-[18px] bg-lime-400" : "left-0.5 bg-zinc-400"}`} />
          </div>
          {targetPlayer !== "auto" && (
            <Badge variant="outline" className="border-orange-400/50 text-orange-400 text-[10px] ml-1">
              {playerPositionLabels[targetPlayer] || targetPlayer}
            </Badge>
          )}
        </button>
        <AnimatePresence>
          {playerSelectorOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <p className="text-xs text-zinc-600 mb-3">
                Select which player to analyze. The AI will focus on that area of the frame.
              </p>
              {/* Visual court diagram */}
              <div className="max-w-xs space-y-1">
                {/* Far court label */}
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider text-center">Far Court</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTargetPlayer("top-left")}
                    className={`px-3 py-3 rounded-xl text-xs font-medium border transition-all ${
                      targetPlayer === "top-left"
                        ? "border-orange-400/50 bg-orange-400/10 text-orange-400"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    Far Court - Left
                  </button>
                  <button
                    onClick={() => setTargetPlayer("top-right")}
                    className={`px-3 py-3 rounded-xl text-xs font-medium border transition-all ${
                      targetPlayer === "top-right"
                        ? "border-orange-400/50 bg-orange-400/10 text-orange-400"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    Far Court - Right
                  </button>
                </div>
                {/* Net divider */}
                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 border-t border-dashed border-zinc-700" />
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Net</span>
                  <div className="flex-1 border-t border-dashed border-zinc-700" />
                </div>
                {/* Near court */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTargetPlayer("bottom-left")}
                    className={`px-3 py-3 rounded-xl text-xs font-medium border transition-all ${
                      targetPlayer === "bottom-left"
                        ? "border-orange-400/50 bg-orange-400/10 text-orange-400"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    Near Court - Left
                  </button>
                  <button
                    onClick={() => setTargetPlayer("bottom-right")}
                    className={`px-3 py-3 rounded-xl text-xs font-medium border transition-all ${
                      targetPlayer === "bottom-right"
                        ? "border-orange-400/50 bg-orange-400/10 text-orange-400"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    Near Court - Right
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider text-center">Near Court (Camera Side)</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
  );

  const renderProcessingModeToggle = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
      <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">Processing Mode</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setProcessingMode("client")}
          className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
            processingMode === "client"
              ? "border-lime-400/50 bg-lime-400/5 shadow-[0_0_15px_rgba(190,242,100,0.1)]"
              : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
          }`}
        >
          {processingMode === "client" && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full ring-2 ring-lime-400 bg-zinc-900 flex items-center justify-center">
              <CheckCircle2 className="w-3 h-3 text-lime-400" />
            </motion.div>
          )}
          <Cpu className={`w-6 h-6 mb-2 ${processingMode === "client" ? "text-lime-400" : "text-zinc-500"}`} strokeWidth={1.5} />
          <p className="font-heading font-bold text-sm text-white uppercase tracking-tight">On Device</p>
          <p className="text-zinc-500 text-xs mt-1">Fast, private — video never leaves your device</p>
        </button>

        <button
          onClick={() => setProcessingMode("server")}
          className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
            processingMode === "server"
              ? "border-sky-400/50 bg-sky-400/5 shadow-[0_0_15px_rgba(56,189,248,0.1)]"
              : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
          }`}
        >
          {processingMode === "server" && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full ring-2 ring-sky-400 bg-zinc-900 flex items-center justify-center">
              <CheckCircle2 className="w-3 h-3 text-sky-400" />
            </motion.div>
          )}
          <Cloud className={`w-6 h-6 mb-2 ${processingMode === "server" ? "text-sky-400" : "text-zinc-500"}`} strokeWidth={1.5} />
          <p className="font-heading font-bold text-sm text-white uppercase tracking-tight">Server</p>
          <p className="text-zinc-500 text-xs mt-1">Upload to server for processing</p>
        </button>
      </div>
    </motion.div>
  );

  const renderUpload = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {/* Processing Mode Toggle */}
      {renderProcessingModeToggle()}

      {/* Sport Selection */}
      {renderSportSelector()}

      {/* Player Selection for Doubles */}
      {renderPlayerSelector()}

      {/* Mode Selection */}
      {renderModeSelection()}

      {/* Upload area */}
      <div
        ref={dropRef}
        onClick={() => fileRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="border-2 border-dashed border-zinc-700 rounded-2xl p-8 sm:p-12 text-center cursor-pointer hover:border-lime-400/50 hover:bg-lime-400/5 transition-all"
        data-testid="video-drop-zone"
      >
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Upload className="w-12 h-12 text-lime-400 mx-auto mb-4" strokeWidth={1.5} />
        </motion.div>
        <p className="font-heading font-semibold text-lg text-white uppercase tracking-tight mb-1">
          Drag & Drop Your Video
        </p>
        <p className="text-zinc-500 text-sm">or click to browse</p>
        <p className="text-zinc-600 text-xs mt-3">
          MP4, AVI, MOV &middot; Max {analysisMode === "full" ? "60" : "20"} seconds
        </p>
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
      </div>

      {/* File size warning */}
      {file && file.size > 100 * 1024 * 1024 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="mt-3 bg-amber-400/5 border border-amber-400/20 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">Large file detected ({(file.size / (1024 * 1024)).toFixed(0)} MB). Upload may take longer.</p>
        </motion.div>
      )}

      {/* Selected file */}
      {file && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mt-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-lime-400/10 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5 text-lime-400" strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{file.name}</p>
              <p className="text-xs text-zinc-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
            </div>
            <Button size="sm" variant="ghost" onClick={clearFile}
              className="text-zinc-500 hover:text-red-400 text-xs shrink-0">Remove</Button>
          </div>
          <div className="mt-3 flex justify-end sm:mt-3">
            <Button size="sm" onClick={analyze} disabled={analyzing || !analysisMode}
              className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-xs px-5 w-full sm:w-auto"
              data-testid="analyze-btn">
              {analyzing ? (
                <><div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin mr-1" /> Analyzing...</>
              ) : (
                <><Zap className="w-3 h-3 mr-1" /> Analyze</>
              )}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Mobile sticky analyze button */}
      {file && !analyzing && !result && !error && (
        <div className="fixed bottom-4 left-4 right-4 z-50 sm:hidden">
          <Button onClick={analyze} disabled={!analysisMode}
            className="w-full bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-sm py-3 shadow-lg shadow-lime-400/20"
            data-testid="analyze-btn-mobile">
            <Zap className="w-4 h-4 mr-2" /> Analyze Video
          </Button>
        </div>
      )}

      {/* Loading state */}
      {analyzing && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="mt-6 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-2 border-lime-400 border-t-transparent rounded-full mx-auto mb-4"
          />
          <p className="font-heading font-semibold text-white uppercase tracking-tight mb-2">
            {processingMode === "client" ? "On-Device" : analysisMode === "quick" ? "Quick" : "Full"} Analysis in Progress
          </p>
          <motion.p
            key={loadingText}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-zinc-400 text-sm mb-4"
          >
            {loadingText}
          </motion.p>
          <div className="max-w-xs mx-auto">
            <Progress value={progress} className="h-2 bg-zinc-800 [&>div]:bg-lime-400 [&>div]:rounded-full [&>div]:transition-all [&>div]:duration-700" />
          </div>
          <p className="text-zinc-600 text-xs mt-2">{progress}%</p>
        </motion.div>
      )}

      {/* Error state */}
      {error && !analyzing && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="mt-6 bg-zinc-900/80 border border-red-500/30 rounded-2xl p-5 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-red-400 font-medium text-sm mb-1">Analysis Failed</p>
          <p className="text-zinc-500 text-xs mb-4">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <Button size="sm" onClick={clearFile} className="text-xs border-zinc-700 text-zinc-400 hover:text-lime-400" variant="outline">
              <RefreshCw className="w-3 h-3 mr-1" /> Try Again
            </Button>
            {processingMode === "client" && (
              <Button size="sm" onClick={() => { setError(null); setProcessingMode("server"); toast.info("Switched to Server mode. Try analyzing again."); }}
                className="text-xs bg-sky-500 hover:bg-sky-600 text-white">
                <Cloud className="w-3 h-3 mr-1" /> Try Server Mode
              </Button>
            )}
          </div>
        </motion.div>
      )}

      {/* Tips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-6 bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4"
      >
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-lime-400" /> Tips for best results
        </p>
        <ul className="space-y-1 text-xs text-zinc-500">
          <li>&bull; Record a single action or shot for best accuracy</li>
          <li>&bull; Keep only one player visible in the frame</li>
          <li>&bull; 5-15 seconds is the ideal length</li>
          <li>&bull; Front or side camera angle works best</li>
        </ul>
      </motion.div>
    </motion.div>
  );

  const renderResults = () => {
    if (!result) return null;
    const shot = result.shot_analysis || {};
    const pro = result.pro_comparison || {};
    const coaching = result.coaching || {};
    const gearTips = result.gear_tips || [];
    const trainingPrios = result.training_priorities || [];
    const strengths = result.coach_feedback?.strengths || result.strengths || coaching?.strengths || [];
    const videos = result.recommended_videos || coaching?.recommended_videos || [];
    const perfScores = result.performance_scores || {};
    const scoreMessages = result.score_messages || [];
    const plan7day = result.training_plan_7day || [];
    const badges = result.earned_badges || [];
    const scoreComparison = result.score_comparison || [];
    const coachFeedback = result.coach_feedback || {};

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

        {/* Back to History button when viewing a past analysis */}
        {viewingHistorical && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Button
              variant="ghost"
              onClick={backToHistory}
              className="text-lime-400 hover:text-lime-300 hover:bg-lime-400/10 text-sm font-medium mb-2"
            >
              <History className="w-4 h-4 mr-2" /> Back to Analysis History
            </Button>
            {result.date && (
              <p className="text-xs text-zinc-500 mb-2">
                Viewing analysis from {new Date(result.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </motion.div>
        )}

        {/* ── HERO: Grade + Shot + Speed ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-lime-400/5 to-transparent" />
          <div className="relative">
            {/* Grade + Shot row */}
            <div className="flex items-center gap-5 mb-4">
              {/* Big Grade */}
              {shot.grade && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                  className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0 ${
                    shot.grade === "A" ? "bg-lime-400 text-black" :
                    shot.grade === "B" ? "bg-sky-400 text-black" :
                    shot.grade === "C" ? "bg-amber-400 text-black" :
                    "bg-red-500 text-white"
                  }`}
                >
                  <span className="font-heading font-black text-4xl leading-none">{shot.grade}</span>
                  {shot.score != null && <span className="text-[10px] font-bold opacity-80">{shot.score}/100</span>}
                </motion.div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {(shot.shot_type && shot.shot_type !== "unknown") && (
                    <h3 className="font-heading font-bold text-xl text-white uppercase tracking-tight">{shot.shot_name || shot.shot_type}</h3>
                  )}
                  <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs px-2 py-0.5 font-bold uppercase">
                    {result.skill_level || "Unknown"}
                  </Badge>
                  {result._processingMode && (
                    <Badge className={`text-[10px] px-2 py-0.5 ${
                      result._processingMode === "client"
                        ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                        : "bg-sky-400/10 text-sky-400 border-sky-400/20"
                    }`}>
                      {result._processingMode === "client" ? (
                        <><Cpu className="w-2.5 h-2.5 mr-1 inline" /> On Device</>
                      ) : (
                        <><Cloud className="w-2.5 h-2.5 mr-1 inline" /> Server</>
                      )}
                    </Badge>
                  )}
                  {result.target_player && result.target_player !== "auto" && (
                    <Badge className="text-[10px] px-2 py-0.5 bg-violet-400/10 text-violet-400 border-violet-400/20">
                      <Target className="w-2.5 h-2.5 mr-1 inline" /> Analyzed: {result.target_player.replace("-", " ")} player
                    </Badge>
                  )}
                </div>
                {(shot.confidence != null && shot.confidence > 0) && (
                  <p className="text-zinc-500 text-xs">Confidence: {Math.round(shot.confidence * 100)}%</p>
                )}
                {/* Speed inline */}
                {result.speed_analysis?.estimated_speed_kmh > 0 && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span className="font-heading font-bold text-lg text-white">{Math.round(result.speed_analysis.estimated_speed_kmh)} km/h</span>
                    <Badge className={`text-[10px] font-bold uppercase ${
                      result.speed_analysis.speed_class === "Elite" ? "bg-amber-400/10 text-amber-400 border-amber-400/20" :
                      result.speed_analysis.speed_class === "Advanced" ? "bg-sky-400/10 text-sky-400 border-sky-400/20" :
                      "bg-zinc-800 text-zinc-300 border-zinc-700"
                    }`}>{result.speed_analysis.speed_class}</Badge>
                  </div>
                )}
              </div>
            </div>
            {/* Coach summary */}
            <div className="flex items-start gap-3 pt-3 border-t border-zinc-800/50">
              <Bot className="w-5 h-5 text-lime-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {coachFeedback.summary || result.comprehensive_coaching?.general_feedback || result.quick_summary || coaching?.header?.summary || "Great effort! Here's what I noticed in your game..."}
                </p>
                {coachFeedback.encouragement && (
                  <p className="text-xs text-lime-400/80 mt-1 italic">{coachFeedback.encouragement}</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Multi-Shot Summary (if match video) ── */}
        {result.multi_shot && result.shots?.length > 1 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
              <Film className="w-3 h-3 text-sky-400" /> Match Analysis — {result.total_shots_detected} Shots Detected
            </p>

            {/* Dominant hand + Play style */}
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <Badge className="bg-violet-400/10 text-violet-400 border-violet-400/20 text-[10px] uppercase font-bold">
                {result.dominant_hand === "right" ? "Right-handed" : "Left-handed"}
              </Badge>
              {result.player_profile?.play_style && (
                <Badge className="bg-sky-400/10 text-sky-400 border-sky-400/20 text-[10px] uppercase font-bold">
                  {result.player_profile.play_style} Style
                </Badge>
              )}
            </div>

            {/* Shot distribution bars */}
            {result.shot_distribution && Object.keys(result.shot_distribution).length > 0 && (
              <div className="space-y-2 mb-4">
                {Object.entries(result.shot_distribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([shotType, count], i) => {
                    const pct = Math.round((count / result.total_shots_detected) * 100);
                    const shotLabel = shotType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <div key={shotType}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-zinc-300">{shotLabel}</span>
                          <span className="text-xs text-zinc-500">{count}x ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, delay: 0.1 + i * 0.05 }}
                            className="h-full rounded-full bg-lime-400"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Individual shots timeline */}
            <details className="group">
              <summary className="text-xs text-zinc-500 cursor-pointer hover:text-lime-400 flex items-center gap-1">
                <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" /> View all shots
              </summary>
              <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                {result.shots.map((s, i) => (
                  <div key={i} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                        s.grade === "A" ? "bg-lime-400 text-black" :
                        s.grade === "B" ? "bg-sky-400 text-black" :
                        s.grade === "C" ? "bg-amber-400 text-black" :
                        "bg-red-500 text-white"
                      }`}>{s.grade}</span>
                      <span className="text-xs text-zinc-300 font-medium">{s.name}</span>
                      {s.isBackhand && (
                        <Badge className="text-[9px] bg-violet-400/10 text-violet-400 border-violet-400/20 px-1 py-0">BH</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {s.speed > 0 && <span className="text-[10px] text-zinc-500">{s.speed} km/h</span>}
                      <span className="text-[10px] text-zinc-600">{s.timestamp}s</span>
                    </div>
                  </div>
                ))}
              </div>
            </details>

            {/* Strengths and weaknesses */}
            {result.player_profile?.strengths?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-800/50">
                <p className="text-[10px] text-zinc-500 uppercase mb-1 font-medium">Strong shots</p>
                <div className="flex flex-wrap gap-1">
                  {result.player_profile.strengths.map((s, i) => (
                    <Badge key={i} className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-[10px]">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {result.player_profile?.weaknesses?.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-zinc-500 uppercase mb-1 font-medium">Needs work</p>
                <div className="flex flex-wrap gap-1">
                  {result.player_profile.weaknesses.map((w, i) => (
                    <Badge key={i} className="bg-red-400/10 text-red-400 border-red-400/20 text-[10px]">{w}</Badge>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Dominant hand badge (single shot mode) ── */}
        {result.dominant_hand && !result.multi_shot && (
          <div className="flex items-center gap-2 -mt-1">
            <Badge className="bg-violet-400/10 text-violet-400 border-violet-400/20 text-[10px] uppercase font-bold">
              {result.dominant_hand === "right" ? "Right-handed" : "Left-handed"} player detected
            </Badge>
          </div>
        )}

        {/* ── Score Comparison with Previous ── */}
        {scoreComparison?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="bg-zinc-900/80 border border-sky-400/20 rounded-2xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-sky-400" /> Progress Since Last Analysis
            </p>
            <div className="space-y-2">
              {scoreComparison.map((cmp, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300">{cmp.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{cmp.previous}/10</span>
                    <ArrowRight className="w-3 h-3 text-zinc-600" />
                    <span className={`text-sm font-bold ${cmp.improved ? "text-lime-400" : "text-red-400"}`}>{cmp.current}/10</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${cmp.improved ? "bg-lime-400/10 text-lime-400 border-lime-400/20" : "bg-red-400/10 text-red-400 border-red-400/20"}`}>
                      {cmp.change > 0 ? "+" : ""}{cmp.change}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Performance Scores ── */}
        {perfScores.dimension_list?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-4 flex items-center gap-1">
              <BarChart3 className="w-3 h-3 text-sky-400" /> Performance Scores
            </p>
            <div className="flex items-center justify-between mb-4">
              <span className="text-zinc-400 text-sm">Overall</span>
              <span className="font-heading font-bold text-2xl text-white">{perfScores.overall_score}/10</span>
            </div>
            <div className="space-y-3">
              {perfScores.dimension_list.map((dim, i) => {
                const pct = Math.round((dim.score / 10) * 100);
                const color = dim.score >= 7.5 ? "bg-lime-400" : dim.score >= 5 ? "bg-sky-400" : dim.score >= 3 ? "bg-amber-400" : "bg-red-400";
                const textColor = dim.score >= 7.5 ? "text-lime-400" : dim.score >= 5 ? "text-sky-400" : dim.score >= 3 ? "text-amber-400" : "text-red-400";
                return (
                  <motion.div key={dim.key}
                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-zinc-300">{dim.label}</span>
                      <span className={`text-sm font-bold ${textColor}`}>{dim.score}/10</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.15 + i * 0.08 }}
                        className={`h-full rounded-full ${color}`}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-0.5">{dim.description}</p>
                  </motion.div>
                );
              })}
            </div>
            {scoreMessages.length > 0 && (
              <div className="mt-4 pt-3 border-t border-zinc-800 space-y-1">
                {scoreMessages.slice(0, 3).map((msg, i) => (
                  <p key={i} className="text-xs text-zinc-400">
                    <span className="text-zinc-300 font-medium">{msg.label}:</span> {msg.message}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Player Preview (if available) ── */}
        {result.analyzed_player_preview && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
              <Video className="w-3 h-3" /> Player Detected
            </p>
            <div className="rounded-xl overflow-hidden bg-zinc-800 max-h-48">
              <img src={result.analyzed_player_preview} alt="Detected player" className="w-full h-auto object-cover" />
            </div>
          </motion.div>
        )}

        {/* ── Top Issues (Coach Style) ── */}
        {(shot.weaknesses?.length > 0 || coachFeedback.top_issues?.length > 0) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="space-y-3" data-testid="weaknesses-card">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" /> Top 3 Things to Improve
            </p>
            {(shot.weaknesses || coachFeedback.top_issues || []).slice(0, 3).map((w, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.08 }}
                className={`bg-zinc-900/80 border rounded-2xl overflow-hidden transition-all ${
                  w.severity === "high" ? "border-red-500/30" :
                  w.severity === "low" ? "border-lime-400/30" :
                  "border-amber-400/30"
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        w.severity === "high" ? "bg-red-500" :
                        w.severity === "low" ? "bg-lime-400" : "bg-amber-400"
                      }`} />
                      <span className="text-sm font-semibold text-white">{w.area || "Technique"}</span>
                      <Badge variant="outline" className={`text-[10px] uppercase ${
                        w.severity === "high" ? "border-red-500/30 text-red-400" :
                        w.severity === "low" ? "border-lime-400/30 text-lime-400" :
                        "border-amber-400/30 text-amber-400"
                      }`}>{w.severity}</Badge>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setExpandedIssue(expandedIssue === i ? null : i)}
                      className="text-zinc-500 hover:text-lime-400 h-7 w-7 p-0"
                    >
                      {expandedIssue === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-400">{w.coach_says || w.issue}</p>
                </div>

                <AnimatePresence>
                  {expandedIssue === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-zinc-800"
                    >
                      <div className="p-4 space-y-3">
                        {w.fix && (
                          <div className="flex items-start gap-2">
                            <Lightbulb className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs text-zinc-500 uppercase font-medium mb-1">How to Fix</p>
                              <p className="text-sm text-zinc-300">{w.fix}</p>
                            </div>
                          </div>
                        )}
                        {w.drill && (
                          <div className="flex items-start gap-2">
                            <Dumbbell className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs text-zinc-500 uppercase font-medium mb-1">Recommended Drill</p>
                              <p className="text-sm text-zinc-300">{w.drill}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* ── Strengths ── */}
        {(strengths.length > 0 || shot.strengths?.length > 0) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-zinc-900/80 border border-lime-400/20 rounded-2xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
              <ThumbsUp className="w-3 h-3 text-lime-400" /> What You're Doing Well
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(strengths.length > 0 ? strengths : shot.strengths || []).map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35 + i * 0.05 }}
                  className="flex items-center gap-2 bg-lime-400/5 rounded-xl p-3"
                >
                  <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" />
                  <span className="text-sm text-zinc-300">{typeof s === "string" ? s : s.area || s.description || ""}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Pro Tips + Player Match ── */}
        {(pro.pro_tips?.length > 0 || pro.player_match?.player) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5" data-testid="pro-comparison-card">
            {pro.pro_tips?.length > 0 && (
              <>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-400" /> Pro Tips
                </p>
                <div className="space-y-1.5">
                  {pro.pro_tips.slice(0, 3).map((tip, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                      <ChevronRight className="w-3 h-3 text-lime-400 shrink-0 mt-0.5" />
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {pro.player_match?.player && (
              <div className={`${pro.pro_tips?.length > 0 ? "mt-4 pt-3 border-t border-zinc-800" : ""}`}>
                <p className="text-xs text-zinc-500 mb-2">You play most like:</p>
                <div className="flex items-center gap-3 bg-zinc-800/50 rounded-xl p-3">
                  <span className="font-heading font-bold text-white">{pro.player_match.player}</span>
                  <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs">
                    {Math.round(pro.player_match.similarity)}% match
                  </Badge>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── (e) 7-Day Training Plan (dynamic) ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-purple-400" /> Your 7-Day Training Plan
          </p>
          {plan7day.length > 0 ? (
            <>
              <div className="grid grid-cols-7 gap-2 mb-4">
                {plan7day.map((day, i) => {
                  const typeColors = {
                    focus: "border-sky-400/30 bg-sky-400/5",
                    drill: "border-lime-400/30 bg-lime-400/5",
                    rest: "border-zinc-700 bg-zinc-800/30",
                    review: "border-purple-400/30 bg-purple-400/5",
                  };
                  const typeText = {
                    focus: "text-sky-400",
                    drill: "text-lime-400",
                    rest: "text-zinc-500",
                    review: "text-purple-400",
                  };
                  return (
                    <motion.div key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.38 + i * 0.04 }}
                      className="text-center"
                      title={day.description}
                    >
                      <div className={`w-full aspect-square rounded-xl border flex flex-col items-center justify-center mb-1 ${typeColors[day.type] || typeColors.drill}`}>
                        <span className={`text-[10px] font-medium ${typeText[day.type] || "text-zinc-400"}`}>{day.label.split(" ")[0]}</span>
                      </div>
                      <span className="text-[9px] text-zinc-600">D{day.day}</span>
                    </motion.div>
                  );
                })}
              </div>
              {/* Expanded plan details */}
              <div className="space-y-2 mb-4">
                {plan7day.filter(d => d.type !== "rest").slice(0, 4).map((day, i) => (
                  <div key={i} className="bg-zinc-800/30 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Day {day.day}</span>
                      <span className="text-xs font-medium text-white">{day.title}</span>
                      {day.drill && (
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px] ml-auto">
                          {day.drill.duration}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400">{day.description}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-7 gap-2 mb-4">
              {["Focus", "Drill", "Rest", "Drill", "Focus", "Drill", "Review"].map((day, i) => (
                <div key={i} className="text-center">
                  <div className="w-full aspect-square rounded-xl bg-zinc-800/50 flex items-center justify-center mb-1">
                    <span className="text-[10px] text-zinc-400">{day}</span>
                  </div>
                  <span className="text-[9px] text-zinc-600">D{i + 1}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-zinc-400 mb-3">
            Follow this plan for 7 days, then upload another video to track your improvement!
          </p>
          <Link to={`/training${result.sport ? `?sport=${result.sport}` : ''}`}
            className="inline-flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300 font-medium">
            Start Training Plan <ArrowRight className="w-3 h-3" />
          </Link>
        </motion.div>

        {/* ── Earned Badges ── */}
        {badges.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.37 }}
            className="bg-zinc-900/80 border border-amber-400/20 rounded-2xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400" /> Your Achievements
            </p>
            <div className="flex flex-wrap gap-2">
              {badges.map((badge, i) => (
                <motion.div key={badge.id || i}
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.4 + i * 0.06 }}
                  className="flex items-center gap-2 bg-amber-400/5 border border-amber-400/20 rounded-xl px-3 py-2"
                  title={badge.description}
                >
                  <Star className="w-3 h-3 text-amber-400 shrink-0" />
                  <div>
                    <span className="text-xs font-medium text-zinc-300">{badge.title}</span>
                    <p className="text-[10px] text-zinc-500">{badge.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Coach Feedback + Drills ── */}
        {coaching?.issues?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-lime-400" /> Detailed Coaching
            </p>
            <div className="space-y-2">
              {coaching.issues.map((issue, i) => (
                <div key={i} className="bg-zinc-800/40 rounded-xl p-3">
                  <p className="text-sm font-medium text-white mb-1">{issue.title}</p>
                  <p className="text-xs text-zinc-400">{issue.description}</p>
                  {issue.solution && <p className="text-xs text-lime-400/80 mt-1">Solution: {issue.solution}</p>}
                </div>
              ))}
            </div>

            {coaching?.action_plan?.drills?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2 flex items-center gap-1">
                  <Dumbbell className="w-3 h-3" /> Recommended Drills
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {coaching.action_plan.drills.map((drill, i) => (
                    <motion.div
                      key={i}
                      whileHover={{ scale: 1.02 }}
                      className="bg-zinc-800 text-zinc-300 rounded-xl px-3 py-2 text-xs text-center hover:bg-lime-400 hover:text-black transition-colors cursor-default"
                    >
                      {drill}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Recommended Videos ── */}
        {videos.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
              <Youtube className="w-3 h-3 text-red-400" /> Recommended Videos
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
              {videos.map((v, i) => (
                <a
                  key={i}
                  href={v.url || v.youtube_url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 w-48 bg-zinc-800/50 rounded-xl overflow-hidden hover:bg-zinc-800 transition-colors group"
                >
                  <div className="w-full h-28 bg-zinc-700 flex items-center justify-center relative">
                    {v.thumbnail ? (
                      <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                    ) : (
                      <Play className="w-8 h-8 text-zinc-500" />
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-white line-clamp-2">{v.title || "Watch Tutorial"}</p>
                    <p className="text-[10px] text-zinc-500 mt-1">{v.channel || v.channel_name || ""}</p>
                  </div>
                </a>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Connected: Gear + Training ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gearTips.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
                <Target className="w-3 h-3 text-sky-400" /> Equipment Tips
              </p>
              <div className="space-y-2">
                {gearTips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <ChevronRight className="w-3 h-3 text-sky-400 shrink-0 mt-0.5" />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
              <Link to={`/equipment${result.sport ? `?sport=${result.sport}` : ''}`} className="mt-4 inline-flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300 font-medium">
                View Equipment <ArrowRight className="w-3 h-3" />
              </Link>
            </motion.div>
          )}

          {trainingPrios.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
                <Dumbbell className="w-3 h-3 text-purple-400" /> Training Priorities
              </p>
              <div className="space-y-2">
                {trainingPrios.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 bg-zinc-800/40 rounded-xl p-3">
                    <span className="w-5 h-5 rounded-full bg-lime-400/10 flex items-center justify-center shrink-0 text-lime-400 font-bold text-xs">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{p.area}</p>
                      <p className="text-xs text-zinc-400">{p.issue}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${
                      p.severity === "high" ? "border-red-500/30 text-red-400" : "border-amber-400/30 text-amber-400"
                    }`}>{p.severity}</Badge>
                  </div>
                ))}
              </div>
              <Link to={`/training${result.sport ? `?sport=${result.sport}` : ''}`} className="mt-4 inline-flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300 font-medium">
                Go to Training <ArrowRight className="w-3 h-3" />
              </Link>
            </motion.div>
          )}
        </div>

        {/* ── Best Moments / Highlights ── */}
        {result.highlights && result.highlights.clip_count > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1">
                <Film className="w-3 h-3 text-lime-400" /> Best Moments
              </p>
              <div className="flex items-center gap-2">
                {result.highlights.reel_available && result.analysis_id && (
                  <Button size="sm" variant="outline"
                    className="h-7 text-[10px] border-lime-400/20 text-lime-400 hover:bg-lime-400/10"
                    onClick={() => {
                      const tk = localStorage.getItem("playsmart_token") || "";
                      const url = `${api.defaults.baseURL}/highlights/${result.analysis_id}/reel?token=${tk}`;
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `athlyticai_highlights_${result.analysis_id}.mp4`;
                      a.click();
                      toast.success("Downloading highlight reel...");
                    }}>
                    <Download className="w-3 h-3 mr-1" /> Download Reel
                  </Button>
                )}
                <Button size="sm" variant="outline"
                  className="h-7 text-[10px] border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/analyze?highlights=${result.analysis_id}`;
                    if (navigator.share) {
                      navigator.share({ title: "My AthlyticAI Highlights", url: shareUrl }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(shareUrl);
                      toast.success("Link copied to clipboard!");
                    }
                  }}>
                  <Share2 className="w-3 h-3 mr-1" /> Share
                </Button>
              </div>
            </div>

            {/* Highlight Preview */}
            {result.highlights.preview_b64 && (
              <div className="mb-4 rounded-xl overflow-hidden bg-zinc-800 relative group">
                <video
                  src={result.highlights.preview_b64}
                  className="w-full h-auto max-h-48 object-cover"
                  controls
                  muted
                  playsInline
                  poster={result.highlights.clips?.[0]?.thumbnail_b64}
                />
                <div className="absolute top-2 left-2">
                  <Badge className="bg-black/60 text-lime-400 border-lime-400/20 text-[10px]">
                    <Scissors className="w-2.5 h-2.5 mr-1" /> AI Highlight
                  </Badge>
                </div>
              </div>
            )}

            {/* Clip Thumbnails Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {result.highlights.clips.map((clip, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  className="relative group rounded-xl overflow-hidden bg-zinc-800 cursor-pointer hover:ring-1 hover:ring-lime-400/30 transition-all"
                  onClick={() => {
                    if (result.analysis_id) {
                      const tk = localStorage.getItem("playsmart_token") || "";
                      const url = `${api.defaults.baseURL}/highlights/${result.analysis_id}/clip/${i}?token=${tk}`;
                      window.open(url, "_blank");
                    }
                  }}>
                  {clip.thumbnail_b64 ? (
                    <img src={clip.thumbnail_b64} alt={`Clip ${i + 1}`} className="w-full h-24 object-cover" />
                  ) : (
                    <div className="w-full h-24 flex items-center justify-center">
                      <Video className="w-6 h-6 text-zinc-600" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1">
                        <Badge className={`text-[9px] px-1.5 py-0 ${
                          clip.label === "power_moment" ? "bg-red-500/20 text-red-400 border-red-500/20" :
                          clip.label === "rally" ? "bg-sky-500/20 text-sky-400 border-sky-500/20" :
                          "bg-zinc-700 text-zinc-300 border-zinc-600"
                        }`}>
                          {clip.label === "power_moment" ? "Power" : clip.label === "rally" ? "Rally" : clip.label}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-zinc-400">{clip.duration?.toFixed(1)}s</span>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-8 rounded-full bg-lime-400/90 flex items-center justify-center">
                      <Play className="w-4 h-4 text-black ml-0.5" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Summary stats */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
              <span className="text-[10px] text-zinc-500">
                {result.highlights.clip_count} clips &middot; {result.highlights.total_duration?.toFixed(1)}s total
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost"
                  className="h-6 text-[10px] text-zinc-400 hover:text-lime-400 px-2"
                  onClick={() => {
                    const text = `Check out my sports analysis highlights on AthlyticAI! ${window.location.origin}/analyze`;
                    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
                    window.open(waUrl, "_blank");
                  }}>
                  Share on WhatsApp
                </Button>
                <Button size="sm" variant="ghost"
                  className="h-6 text-[10px] text-zinc-400 hover:text-lime-400 px-2"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/analyze?highlights=${result.analysis_id}`);
                    toast.success("Link copied!");
                  }}>
                  <Copy className="w-3 h-3 mr-1" /> Copy Link
                </Button>
              </div>
              <Link to="/highlights" className="inline-flex items-center gap-1 text-xs text-lime-400 hover:text-lime-300 font-medium mt-2">
                <Film className="w-3 h-3" /> Create highlights from a full match video <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </motion.div>
        )}

        {/* Share + Analyze another */}
        <div className="flex gap-3">
          <Button
            onClick={async () => {
              try {
                const { data } = await api.get(`/share/generate-card/${result.analysis_id}`);
                setShareData(data);
                setShareOpen(true);
              } catch {
                // Fallback share
                setShareData({
                  title: "My AthlyticAI Analysis",
                  text: `AthlyticAI Analysis: ${result.shot_analysis?.shot_name || "Game"} - Score: ${result.shot_analysis?.score || "N/A"}/100 - ${result.skill_level || ""}`,
                  card: {
                    shot_name: result.shot_analysis?.shot_name,
                    score: result.shot_analysis?.score,
                    grade: result.shot_analysis?.grade,
                    skill_level: result.skill_level,
                    sport: result.sport,
                  },
                });
                setShareOpen(true);
              }
            }}
            className="flex-1 bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-2xl h-12 min-h-[44px]"
          >
            <Share2 className="w-4 h-4 mr-2" /> Share Results
          </Button>
          <Button onClick={() => { clearFile(); setActiveTab("upload"); setAnalysisMode(null); }}
            className="flex-1 bg-zinc-900/80 border border-zinc-800 text-zinc-300 hover:border-lime-400/30 hover:text-lime-400 rounded-2xl h-12 min-h-[44px]"
            variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" /> Analyze Again
          </Button>
        </div>

        {/* ── (g) Upload Again CTA ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
          className="bg-gradient-to-r from-lime-400/10 to-sky-400/10 border border-lime-400/20 rounded-2xl p-5 text-center">
          <p className="font-heading font-bold text-lg text-white uppercase tracking-tight mb-2">Track Your Progress</p>
          <p className="text-sm text-zinc-400 mb-4">
            Upload again in 7 days to see how much you have improved. Your scores will be compared automatically.
          </p>
          <Button onClick={() => { clearFile(); setActiveTab("upload"); setAnalysisMode(null); }}
            className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-8">
            <Upload className="w-4 h-4 mr-2" /> Upload Next Video
          </Button>
        </motion.div>

      </motion.div>
    );
  };

  const renderHistory = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {history.length === 0 ? (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
          <History className="w-10 h-10 text-zinc-600 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-zinc-500 text-sm">No previous analyses yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Upload a video to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Coach Improvement Message */}
          {improvementData?.coach_message && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-zinc-900/80 border border-lime-400/20 rounded-2xl p-5 mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2 flex items-center gap-1">
                <Bot className="w-3 h-3 text-lime-400" /> Coach's Assessment
              </p>
              <p className="text-sm text-zinc-300">{improvementData.coach_message}</p>
              {improvementData.improvement_summary && (
                <div className="flex items-center gap-3 mt-3">
                  <Badge className={`text-xs ${
                    improvementData.improvement_summary.direction === "improved"
                      ? "bg-lime-400/10 text-lime-400 border-lime-400/20"
                      : improvementData.improvement_summary.direction === "declined"
                        ? "bg-red-400/10 text-red-400 border-red-400/20"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}>
                    {improvementData.improvement_summary.direction === "improved" ? "+" : ""}
                    {improvementData.improvement_summary.total_improvement_pct}% overall
                  </Badge>
                  <span className="text-[10px] text-zinc-600">
                    {improvementData.improvement_summary.total_analyses} sessions over {improvementData.improvement_summary.time_span_days} days
                  </span>
                </div>
              )}
            </motion.div>
          )}

          {/* Per-Metric Improvements */}
          {improvementData?.metric_improvements?.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-lime-400" /> Metric Progress
              </p>
              <div className="space-y-3">
                {improvementData.metric_improvements.map((m) => (
                  <div key={m.metric} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-white">{m.label}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${
                          m.improved
                            ? "bg-lime-400/10 text-lime-400 border-lime-400/20"
                            : "bg-red-400/10 text-red-400 border-red-400/20"
                        }`}>
                          {m.change > 0 ? "+" : ""}{m.change}{m.unit} ({m.change_pct > 0 ? "+" : ""}{m.change_pct}%)
                        </Badge>
                      </div>
                      <p className="text-[10px] text-zinc-500">{m.coach_note}</p>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-xs text-zinc-400">{m.first_value}{m.unit}</p>
                      <ArrowRight className="w-3 h-3 text-zinc-600 mx-auto" />
                      <p className={`text-xs font-medium ${m.improved ? "text-lime-400" : "text-red-400"}`}>
                        {m.latest_value}{m.unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Dimension Improvements */}
          {improvementData?.dimension_improvements?.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-zinc-900/80 border border-sky-400/20 rounded-2xl p-5 mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-sky-400" /> Dimension Progress
              </p>
              <div className="space-y-2">
                {improvementData.dimension_improvements.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-300">{d.label}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${
                      d.change > 0 ? "bg-lime-400/10 text-lime-400 border-lime-400/20" : "bg-red-400/10 text-red-400 border-red-400/20"
                    }`}>
                      {d.change > 0 ? "+" : ""}{d.change} pts
                    </Badge>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Badges in History */}
          {improvementData?.earned_badges?.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-zinc-900/80 border border-amber-400/20 rounded-2xl p-5 mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400" /> Your Achievements
                {improvementData.upload_streak > 1 && (
                  <Badge className="bg-orange-400/10 text-orange-400 border-orange-400/20 text-[10px] ml-auto">
                    {improvementData.upload_streak} week streak
                  </Badge>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {improvementData.earned_badges.map((badge, i) => (
                  <div key={badge.id || i}
                    className="flex items-center gap-1.5 bg-amber-400/5 border border-amber-400/20 rounded-xl px-3 py-1.5"
                    title={badge.description}>
                    <Star className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="text-[11px] font-medium text-zinc-300">{badge.title}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Improvement Trend Chart */}
          {history.length >= 2 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 mb-4"
            >
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
                <BarChart3 className="w-3 h-3 text-lime-400" /> Score Trend
              </p>
              <div className="flex items-center gap-4">
                {history.slice(-5).reverse().map((a, i, arr) => (
                  <div key={a.id || i} className="flex-1 text-center">
                    <div className={`w-full h-16 rounded-xl flex items-end justify-center pb-1 ${
                      i === arr.length - 1 ? "bg-lime-400/10" : "bg-zinc-800/50"
                    }`}>
                      <div
                        className="w-6 bg-lime-400 rounded-t-md"
                        style={{ height: `${Math.max(20, (a.shot_analysis?.score || 50) * 0.6)}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-zinc-500 mt-1">
                      {new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Loading overlay */}
          {loadingDetail && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-zinc-900/80 border border-lime-400/20 rounded-2xl p-6 flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">Loading analysis details...</p>
            </motion.div>
          )}

          {/* History List */}
          {history.map((a, i) => {
            const shot = a.shot_analysis || {};
            const comparison = a.improvement_vs_previous;
            return (
              <motion.div key={a.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="group bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-all cursor-pointer"
                onClick={() => viewAnalysisDetail(a.id)}
                data-testid={`history-item-${i}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-lime-400/10 flex items-center justify-center">
                      {shot.grade ? (
                        <span className="font-heading font-bold text-lime-400">{shot.grade}</span>
                      ) : (
                        <Video className="w-4 h-4 text-lime-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {shot.shot_name || "Unknown Shot"}
                        {a.sport && (
                          <span className="text-zinc-500 text-xs ml-1">{{"badminton":"🏸","tennis":"🎾","table_tennis":"🏓","pickleball":"⚡","cricket":"🏏","football":"⚽","swimming":"🏊"}[a.sport] || ""}</span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {a.skill_level && <> &middot; {a.skill_level}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {comparison && (
                      <Badge className={`text-[10px] px-1.5 ${
                        comparison.direction === "improved"
                          ? "bg-lime-400/10 text-lime-400 border-lime-400/20"
                          : comparison.direction === "declined"
                            ? "bg-red-400/10 text-red-400 border-red-400/20"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}>
                        {comparison.percentage > 0 ? "+" : ""}{comparison.percentage}%
                      </Badge>
                    )}
                    {shot.score != null && (
                      <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 text-xs">{shot.score}/100</Badge>
                    )}
                    {a.skill_level && (
                      <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs">{a.skill_level}</Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-lime-400 transition-colors shrink-0" />
                  </div>
                </div>
                {/* Show resolved/new issues */}
                {a.comparison && (a.comparison.resolved_issues?.length > 0 || a.comparison.new_issues?.length > 0) && (
                  <div className="mt-2 ml-13 flex flex-wrap gap-1">
                    {a.comparison.resolved_issues?.map((issue, j) => (
                      <Badge key={`r-${j}`} className="bg-lime-400/5 text-lime-400/80 border-lime-400/10 text-[9px]">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Fixed: {issue}
                      </Badge>
                    ))}
                    {a.comparison.new_issues?.map((issue, j) => (
                      <Badge key={`n-${j}`} className="bg-amber-400/5 text-amber-400/80 border-amber-400/10 text-[9px]">
                        New: {issue}
                      </Badge>
                    ))}
                  </div>
                )}
                {a.quick_summary && (
                  <p className="text-xs text-zinc-500 mt-2 ml-13 line-clamp-2">{a.quick_summary}</p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="analyze-page">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="font-heading font-bold text-2xl sm:text-3xl md:text-5xl uppercase tracking-tight text-white mb-2" data-testid="analyze-title">
            Analyze Game
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base">Upload a video and get AI-powered coaching feedback instantly.</p>
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-zinc-800 border-zinc-700 mb-6 w-full grid grid-cols-3" data-testid="analyze-tabs">
            <TabsTrigger value="upload" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <Upload className="w-3.5 h-3.5 mr-1" /> Upload
            </TabsTrigger>
            <TabsTrigger value="results" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium"
              disabled={!result}>
              <BarChart3 className="w-3.5 h-3.5 mr-1" /> Results
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs data-[state=active]:bg-lime-400 data-[state=active]:text-black font-medium">
              <History className="w-3.5 h-3.5 mr-1" /> History
              {history.length > 0 && (
                <Badge className="bg-zinc-700 text-zinc-300 ml-1 text-[10px] px-1.5 py-0">{history.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">{renderUpload()}</TabsContent>
          <TabsContent value="results">{renderResults()}</TabsContent>
          <TabsContent value="history">{renderHistory()}</TabsContent>
        </Tabs>
      </div>

      {/* Share Modal */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareData={shareData}
        cardType="analysis"
      />

      {/* New Badge Celebration */}
      {newBadge && (
        <NewBadgeOverlay
          badge={newBadge}
          onClose={() => setNewBadge(null)}
        />
      )}
    </div>
  );
}
