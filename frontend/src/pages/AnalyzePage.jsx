import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
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
  Users, Cpu, Cloud, Lock, Footprints, Wind, Activity, Flame, Crosshair
} from "lucide-react";
import api from "@/lib/api";
import InsufficientTokensModal from "@/components/InsufficientTokensModal";
import ShareModal from "@/components/ShareModal";
import PlayerSelectionModal from "@/components/PlayerSelectionModal";
import { NewBadgeOverlay } from "@/components/BadgeDisplay";
import MatchInsights from "@/components/MatchInsights";
import SEO from "@/components/SEO";

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

// ─── Drill library (client-side) ───────────────────────────────────────
// A compact catalogue of drills keyed by "theme". Each drill carries
// enough info for a rich card UI. Themes map from weakness keywords.
const DRILL_LIBRARY = {
  balance: [
    {
      name: "Single-Leg Stance Hold",
      type: "balance",
      difficulty: "easy",
      duration: "3 x 30s each leg",
      why: "Builds core and ankle stability — the foundation of every shot.",
      video: "https://www.youtube.com/results?search_query=single+leg+balance+drill",
    },
    {
      name: "Split-Step Recovery",
      type: "footwork",
      difficulty: "medium",
      duration: "4 sets x 45s",
      why: "Trains you to re-center after each shot so you never get caught off-balance.",
      video: "https://www.youtube.com/results?search_query=split+step+badminton+drill",
    },
  ],
  footwork: [
    {
      name: "Six-Corner Shadow Footwork",
      type: "footwork",
      difficulty: "medium",
      duration: "4 x 60s",
      why: "Sharpens court coverage and teaches efficient movement patterns.",
      video: "https://www.youtube.com/results?search_query=six+corner+footwork+badminton",
    },
    {
      name: "Lateral Shuffle Ladder",
      type: "footwork",
      difficulty: "easy",
      duration: "3 x 40s",
      why: "Improves lateral quickness so you reach wide shots with time to spare.",
      video: "https://www.youtube.com/results?search_query=agility+ladder+lateral+shuffle",
    },
  ],
  elbow: [
    {
      name: "Wall Elbow-Angle Drill",
      type: "technique",
      difficulty: "easy",
      duration: "3 x 15 reps",
      why: "Grooves the ideal 90 degree elbow position for a clean overhead.",
      video: "https://www.youtube.com/results?search_query=elbow+angle+overhead+drill",
    },
    {
      name: "Slow-Mo Swing Shadowing",
      type: "technique",
      difficulty: "medium",
      duration: "4 x 20 swings",
      why: "Isolates elbow path so muscle memory locks in correct form.",
      video: "https://www.youtube.com/results?search_query=shadow+swing+technique",
    },
  ],
  form: [
    {
      name: "Mirror Shadow Swings",
      type: "technique",
      difficulty: "easy",
      duration: "3 x 20 reps",
      why: "Visual feedback helps you self-correct posture and swing path.",
      video: "https://www.youtube.com/results?search_query=shadow+swing+mirror+technique",
    },
    {
      name: "Resistance Band Stroke",
      type: "technique",
      difficulty: "medium",
      duration: "3 x 15 reps",
      why: "Adds resistance so proper form becomes second nature under load.",
      video: "https://www.youtube.com/results?search_query=resistance+band+swing+drill",
    },
  ],
  power: [
    {
      name: "Explosive Medicine Ball Throw",
      type: "power",
      difficulty: "hard",
      duration: "4 x 8 reps",
      why: "Trains rotational power — essential for smashes and drives.",
      video: "https://www.youtube.com/results?search_query=medicine+ball+rotational+throw",
    },
    {
      name: "Jump Smash Progression",
      type: "power",
      difficulty: "hard",
      duration: "3 x 10 reps",
      why: "Builds vertical leg drive for devastating overhead power.",
      video: "https://www.youtube.com/results?search_query=jump+smash+drill+badminton",
    },
  ],
  speed: [
    {
      name: "Reaction Ball Catches",
      type: "power",
      difficulty: "medium",
      duration: "3 x 60s",
      why: "Sharpens reaction time so you respond to fast shots instantly.",
      video: "https://www.youtube.com/results?search_query=reaction+ball+training",
    },
    {
      name: "Short Sprint Intervals",
      type: "power",
      difficulty: "hard",
      duration: "6 x 15s sprints",
      why: "Raises top-end speed and explosive acceleration on-court.",
      video: "https://www.youtube.com/results?search_query=short+sprint+intervals+athlete",
    },
  ],
  consistency: [
    {
      name: "Wall Rally Challenge",
      type: "technique",
      difficulty: "easy",
      duration: "3 x 2 min",
      why: "Forces clean, repeatable contact — the bedrock of consistency.",
      video: "https://www.youtube.com/results?search_query=wall+rally+racket+drill",
    },
    {
      name: "Target Placement Drill",
      type: "technique",
      difficulty: "medium",
      duration: "4 x 20 shots",
      why: "Trains accuracy so your shots land where you intend, every time.",
      video: "https://www.youtube.com/results?search_query=target+placement+drill",
    },
  ],
  default: [
    {
      name: "Dynamic Warm-Up Flow",
      type: "technique",
      difficulty: "easy",
      duration: "5 min",
      why: "Primes your body so every training session is safer and more effective.",
      video: "https://www.youtube.com/results?search_query=athlete+dynamic+warm+up",
    },
    {
      name: "Shadow Footwork Routine",
      type: "footwork",
      difficulty: "medium",
      duration: "3 x 60s",
      why: "A universal base drill that sharpens movement for any sport.",
      video: "https://www.youtube.com/results?search_query=shadow+footwork+routine",
    },
  ],
};

const WEAKNESS_THEME_MAP = [
  { keywords: ["balance", "stabil", "stance"], theme: "balance" },
  { keywords: ["footwork", "movement", "positioning", "court coverage"], theme: "footwork" },
  { keywords: ["elbow", "angle", "wrist"], theme: "elbow" },
  { keywords: ["form", "posture", "technique", "mechanics", "swing"], theme: "form" },
  { keywords: ["power", "smash", "strength"], theme: "power" },
  { keywords: ["speed", "reaction", "quick", "explosive"], theme: "speed" },
  { keywords: ["consisten", "accuracy", "placement", "control"], theme: "consistency" },
];

function extractWeaknessText(w) {
  if (!w) return "";
  if (typeof w === "string") return w;
  return [w.issue, w.area, w.description, w.title].filter(Boolean).join(" ");
}

function generateDrillsFromAnalysis(analysis) {
  if (!analysis) return DRILL_LIBRARY.default.slice(0, 3);

  const weaknessPool = [];
  const shot = analysis.shot_analysis || {};
  if (Array.isArray(shot.weaknesses)) weaknessPool.push(...shot.weaknesses);
  if (Array.isArray(analysis.coach_feedback?.top_issues)) weaknessPool.push(...analysis.coach_feedback.top_issues);
  if (Array.isArray(analysis.coaching?.issues)) {
    weaknessPool.push(...analysis.coaching.issues);
  }
  if (Array.isArray(analysis.training_priorities)) weaknessPool.push(...analysis.training_priorities);
  if (Array.isArray(analysis.player_profile?.weaknesses)) weaknessPool.push(...analysis.player_profile.weaknesses);

  const themes = new Set();
  for (const w of weaknessPool) {
    const text = extractWeaknessText(w).toLowerCase();
    if (!text) continue;
    for (const { keywords, theme } of WEAKNESS_THEME_MAP) {
      if (keywords.some((k) => text.includes(k))) {
        themes.add(theme);
        break;
      }
    }
  }

  // If shot grade is poor, always include form work.
  if (["C", "D", "F"].includes(shot.grade)) themes.add("form");
  // If score is low, add power/consistency.
  const score = shot.score ?? analysis.pro_comparison?.overall_score ?? 0;
  if (score && score < 60) themes.add("consistency");

  const selected = [];
  const seen = new Set();
  for (const theme of themes) {
    for (const drill of DRILL_LIBRARY[theme] || []) {
      if (seen.has(drill.name)) continue;
      seen.add(drill.name);
      selected.push(drill);
      if (selected.length >= 5) break;
    }
    if (selected.length >= 5) break;
  }

  // Top up from default if we have fewer than 3.
  if (selected.length < 3) {
    for (const drill of DRILL_LIBRARY.default) {
      if (seen.has(drill.name)) continue;
      seen.add(drill.name);
      selected.push(drill);
      if (selected.length >= 3) break;
    }
  }

  return selected.slice(0, 5);
}

const DRILL_TYPE_ICON = {
  footwork: Footprints,
  power: Flame,
  technique: Crosshair,
  balance: Activity,
  speed: Wind,
};

const DRILL_DIFFICULTY_STYLE = {
  easy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  hard: "bg-red-500/10 text-red-400 border-red-500/30",
};

export default function AnalyzePage() {
  const { user, profile, refreshProfile, login, tokens, refreshTokens } = useAuth();
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [insufficientBalance, setInsufficientBalance] = useState(0);
  const [showGuestUpgrade, setShowGuestUpgrade] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isGuest = !user?.id;
  const showLockedSections = isGuest;
  const [reminderDue, setReminderDue] = useState(false);
  const [previousScore, setPreviousScore] = useState(null);
  const [file, setFile] = useState(null);
  const [analysisMode, setAnalysisMode] = useState(searchParams.get("mode") || "full");
  const [selectedSport, setSelectedSport] = useState(null);

  // Set page title
  useEffect(() => { document.title = "Analyze | AthlyticAI"; }, []);

  // Check for a pending reminder from a prior session
  useEffect(() => {
    try {
      const due = parseInt(localStorage.getItem("next_analysis_reminder") || "0", 10);
      const lastScore = parseInt(localStorage.getItem("last_analysis_score") || "0", 10);
      if (due && Date.now() >= due) {
        setReminderDue(true);
      }
      if (lastScore > 0) setPreviousScore(lastScore);
    } catch {
      // ignore localStorage errors
    }
  }, []);

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
  // Reanalyze flow: when set, the next analysis run will auto-trigger a
  // VLM comparison vs this stored analysis after the new one saves.
  const [reanalyzeContext, setReanalyzeContext] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);
  // Sport detected from the uploaded video (always set when VLM is up).
  // Surfaced in the player selection modal so the user can override.
  const [detectedSport, setDetectedSport] = useState(null);
  const [detectedSportConfidence, setDetectedSportConfidence] = useState(null);
  // Save-to-profile confirmation modal
  const [showProfileUpdateModal, setShowProfileUpdateModal] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // Server-side analysis is disabled — TF.js client-side handles everything.
  const processingMode = "client";
  const setProcessingMode = () => {}; // no-op for any leftover callers
  const [scanResult, setScanResult] = useState(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [pendingAnalysisSport, setPendingAnalysisSport] = useState(null);

  // When an analysis completes, persist the score so the next visit can
  // compute improvement and schedule a reminder for 7 days out.
  useEffect(() => {
    if (!result?.success) return;
    const score =
      result.shot_analysis?.score ??
      result.pro_comparison?.overall_score ??
      0;
    if (score > 0) {
      try {
        localStorage.setItem("last_analysis_score", String(score));
        localStorage.setItem(
          "next_analysis_reminder",
          String(Date.now() + 7 * 24 * 60 * 60 * 1000),
        );
      } catch {
        // ignore
      }
    }
  }, [result]);

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

  // Post-login replay: if the user signed in mid-analysis (guest path),
  // re-send the result to /analyze-client-results so it lands in their
  // history. The server will spend 100 tokens this time (they have 300
  // from signup). Only fires once per stashed analysis.
  useEffect(() => {
    if (!user?.id) return;
    let stash = null;
    try {
      const raw = sessionStorage.getItem("pending_analysis");
      if (raw) stash = JSON.parse(raw);
    } catch {}
    if (!stash?.result) return;
    // Old stash (>10 min) → ignore
    if (Date.now() - (stash.savedAt || 0) > 10 * 60 * 1000) {
      sessionStorage.removeItem("pending_analysis");
      return;
    }
    // Clear immediately so we don't replay on re-renders
    sessionStorage.removeItem("pending_analysis");

    const r = stash.result;
    const body = {
      sport: stash.sport || r.sport || "badminton",
      shot_type: r.shot_analysis?.shot_type || "unknown",
      confidence: r.shot_analysis?.confidence || 0,
      metrics: r.metrics || {},
      speed: r.speed_analysis || {},
      skill_level: r.skill_level || "Beginner",
      shot_grade: r.shot_analysis?.grade || "C",
      segments: r.segments?.power_moments || [],
      video_info: r.video_info || {},
      shots: r.shots || [],
      weaknesses: r.shot_analysis?.weaknesses || [],
    };
    (async () => {
      try {
        const { data } = await api.post("/analyze-client-results", body, { timeout: 30000 });
        // Update the on-screen result with the persisted analysis_id so
        // the user can navigate to it from history later.
        if (data?.analysis_id) setResult((prev) => ({ ...(prev || r), analysis_id: data.analysis_id }));
        loadHistory();
        refreshTokens?.();
        toast.success("Analysis saved to your history.");
      } catch (e) {
        // 402 means they're somehow already short — don't spam the user
        if (e?.response?.status !== 402) {
          console.warn("post-login analysis replay failed", e);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

  // Create a profile from the current analysis result. Used when a user
  // signs in after analyzing a video without first taking the quiz.
  const createProfileFromAnalysis = async () => {
    if (!result || !user) return;

    const sport = result.sport || "badminton";
    const skillLevel = result.skill_level || "Beginner";

    // Derive play style from shot distribution
    const distribution = result.shot_distribution || {};
    const totalShots = Object.values(distribution).reduce((a, b) => a + b, 0);
    let playStyle = "All-round";
    if (totalShots > 0) {
      const aggressiveShots = (distribution.smash || 0) + (distribution.drive || 0);
      const defensiveShots = (distribution.clear || 0) + (distribution.drop || 0) + (distribution.net_shot || 0);
      if (aggressiveShots > defensiveShots) playStyle = sport === "badminton" ? "Power" : "Offensive";
      else if (defensiveShots > aggressiveShots * 1.5) playStyle = "Defense";
    }

    try {
      await api.post("/profile", {
        selected_sports: [sport],
        sports_profiles: {
          [sport]: { skill_level: skillLevel, play_style: playStyle },
        },
        playing_frequency: "1-2 days/week",
        budget_range: "Medium",
        injury_history: "none",
        primary_goal: "Improve technique",
      });
      await refreshProfile();
      toast.success("Profile created from your analysis!");
    } catch (err) {
      toast.error("Failed to create profile");
    }
  };

  // Update existing profile with derived fields from the current analysis.
  // Targeted: only touches sports_profiles[sport] + top-level fields if
  // this is the user's active sport.
  const updateProfileFromAnalysis = async () => {
    if (!result?.analysis_id || !user) {
      toast.error("Sign in to update your profile.");
      return;
    }
    try {
      const { data } = await api.post("/profile/update-from-analysis", {
        analysis_id: result.analysis_id,
      });
      if (data?.success) {
        await refreshProfile();
        toast.success(`Profile updated for ${data.sport.replace("_", " ")}!`);
        setShowProfileUpdateModal(false);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update profile");
    }
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

  // Reanalyze flow: stash the old analysis and prompt the user to upload a
  // new video. After it analyzes, we automatically call /compare-analyses.
  const startReanalyze = (oldAnalysis) => {
    setReanalyzeContext(oldAnalysis);
    setComparisonResult(null);
    setActiveTab("upload");
    setResult(null);
    setError(null);
    // Pre-select the same sport so the new video is comparable
    if (oldAnalysis.sport) {
      try { setSelectedSport(oldAnalysis.sport); } catch {}
    }
    toast.info(`Upload a new ${oldAnalysis.shot_analysis?.shot_name || oldAnalysis.sport || "video"} to see your progress.`);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  };

  // Trigger backend comparison and show the result. Called after the new
  // analysis completes when reanalyzeContext is set.
  const fetchComparison = async (oldId, newId) => {
    try {
      const { data } = await api.post("/compare-analyses",
        { old_analysis_id: oldId, new_analysis_id: newId },
        { timeout: 60000 },
      );
      if (data?.success && data.comparison) {
        setComparisonResult(data.comparison);
        toast.success("Progress comparison ready!");
      }
    } catch (err) {
      console.warn("Comparison failed:", err?.response?.data || err.message);
      toast.error("Could not compare with previous session.");
    } finally {
      setReanalyzeContext(null);
    }
  };

  const analyze = async () => {
    if (!file) return;
    // mode selector removed — always run full analysis

    // Token spend gate — UX hint, server enforces. If we know the user
    // is short, intercept now so they don't burn an upload only to
    // hit a 402 later. Guests/missing-balance get through (server gates).
    const ANALYSIS_COST = 100;
    if (user && tokens != null && tokens < ANALYSIS_COST) {
      setInsufficientBalance(tokens);
      setShowInsufficientModal(true);
      return;
    }

    // Guests get ONE free analysis. After that, force sign-up — they can
    // claim 300 tokens for free which unlocks ~3 more analyses.
    if (!user) {
      const used = localStorage.getItem("guest_analysis_used") === "true";
      if (used) {
        setShowGuestUpgrade(true);
        return;
      }
    }

    setAnalyzing(true);
    setResult(null);
    setError(null);
    setProgress(0);
    // Scroll to top so the user sees the loading panel immediately
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}

    const VIDEO_ANALYSIS_SPORTS = ["badminton", "tennis", "table_tennis", "pickleball", "cricket"];
    const activeSport = profile?.active_sport || "badminton";
    // The user's picked sport becomes a *hint*, not authoritative. We always
    // auto-detect from the actual video frames so a TT video uploaded with
    // sport=badminton selected doesn't get badminton-flavored results.
    let sportToAnalyze = selectedSport && selectedSport !== "auto"
      ? selectedSport
      : (VIDEO_ANALYSIS_SPORTS.includes(activeSport) ? activeSport : "badminton");
    let detected = null;

    setLoadingText("Detecting sport from video...");
    try {
      const mod = await import("@/ai/videoProcessor");
      // 1 mid-video keyframe is plenty for sport detection — halves the
      // payload + Gemini processing vs 2 frames, leaves more headroom for
      // Vercel cold-start latency.
      const keyframes = await mod.extractDetectKeyframes(file, { count: 1 });
      if (keyframes.length > 0) {
        // 45s timeout — Vercel cold-start + first Gemini call can take 25-35s.
        const { data } = await api.post("/detect-sport-vlm", { keyframes }, { timeout: 45000 });
        if (data?.success && data.sport) {
          detected = { sport: data.sport, confidence: data.confidence ?? 0 };
          setDetectedSport(data.sport);
          setDetectedSportConfidence(data.confidence ?? 0);
          console.info(`[sport] detected: ${data.sport} (conf=${data.confidence?.toFixed?.(2)})`);
        }
      }
    } catch (e) {
      console.warn("[sport] detection failed, falling back to selection:", e?.response?.data || e.message);
    }
    // Use detected sport when user picked Auto OR when detection disagrees
    // with the user's pick (with high confidence).
    if (detected) {
      if (selectedSport === "auto" || !selectedSport) {
        sportToAnalyze = detected.sport;
      } else if (detected.sport !== selectedSport && detected.confidence >= 0.75) {
        // High-confidence override — let the player modal display this so
        // the user can correct if they really meant the picked sport.
        sportToAnalyze = detected.sport;
      }
    }

    // ─── Pre-scan the video for players (used by BOTH client + server modes) ───
    setLoadingText("Scanning video for players...");
    setProgress(5);
    try {
      const mod = await import("@/ai/videoProcessor");
      if (typeof mod.scanVideoForPlayers === "function") {
        // Soft cap: if the scan stalls (rare codec quirk, slow device),
        // proceed without player selection rather than hang the UI.
        const scanPromise = mod.scanVideoForPlayers(file, (msg) => {
          setLoadingText(msg);
        });
        const scan = await Promise.race([
          scanPromise,
          new Promise((resolve) => setTimeout(() => resolve(null), 25000)),
        ]);
        if (!scan) {
          console.warn("Player scan timed out, proceeding without selection");
          throw new Error("scan timeout");
        }
        const maxPeople = Math.max(0, ...scan.frames.map((f) => f.people.length));
        if (maxPeople >= 1) {
          // Show modal for both client + server modes — handlePlayerSelected
          // dispatches to the correct analysis path based on processingMode.
          setScanResult(scan);
          setPendingAnalysisSport(sportToAnalyze);
          setShowPlayerModal(true);
          setAnalyzing(false);
          return;
        }
      }
    } catch (scanErr) {
      console.warn("Player scan failed, proceeding without selection", scanErr);
    }

    // No players detected → analyze whole video
    if (processingMode === "client") {
      await runClientAnalysis(sportToAnalyze, null);
    } else {
      await runServerAnalysis(sportToAnalyze, null);
    }
  };

  /**
   * Run the on-device analysis pipeline. Optionally scoped to a custom crop
   * box chosen by the user from the player selection modal.
   */
  const runClientAnalysis = async (sportToAnalyze, customCropBox) => {
    setAnalyzing(true);
    setResult(null);
    setError(null);
    setProgress(0);
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
        clearInterval(interval);
        setError("On-device AI failed to load. Try a different browser or refresh.");
        toast.error("AI model failed to load");
        setAnalyzing(false);
        return;
      }

      // Detect doubles/multi-player video so the VLM call sends wider
      // frames + a position hint instead of cropping tightly to a stale
      // bbox (which fails when the player moves during a rally).
      const maxPeopleSeen = scanResult?.frames
        ? Math.max(0, ...scanResult.frames.map((f) => f.people?.length || 0))
        : 1;
      const isMultiPlayer = maxPeopleSeen >= 2;

      const clientResult = await analyzeVideo(file, sportToAnalyze, {
        mode: analysisMode,
        targetPlayer,
        customCropBox,
        isMultiPlayer,
        // Delegate shot classification to Gemini (server-side). Browser still
        // does pose extraction + metrics; we just upgrade shot_type +
        // reasoning + speed via the lightweight VLM endpoint.
        vlmClassify: async (payload) => {
          const t0 = Date.now();
          console.info(`[vlm] sending ${payload.shots.length} shots (${payload.shots.reduce((a, s) => a + s.length, 0)} keyframes total) to /classify-shots-vlm`);
          try {
            const { data } = await api.post("/classify-shots-vlm", payload, { timeout: 60000 });
            const ms = Date.now() - t0;
            const shots = data?.shots || [];
            const named = shots.filter((s) => s.shot_type && s.shot_type !== "unknown").length;
            console.info(`[vlm] ${ms}ms — ${named}/${shots.length} shots classified by Gemini`,
                         shots.map((s) => `${s.shot_type}@${s.confidence?.toFixed?.(2)}`).join(", "));
            if (named === 0 && shots.length > 0) {
              console.warn("[vlm] every shot returned 'unknown' — Gemini responded but the parse mapped nothing.");
              if (shots[0]?.reasoning) console.warn("[vlm] first reasoning:", shots[0].reasoning);
              const rawPreview = shots[0]?._meta?.raw_preview || shots[0]?._meta?.error_friendly;
              if (rawPreview) console.warn("[vlm] Gemini raw response preview:\n", rawPreview);
              const errMeta = shots[0]?._meta?.error;
              if (errMeta) console.warn("[vlm] _meta.error:", errMeta);
            }
            return shots;
          } catch (e) {
            const status = e?.response?.status;
            const detail = e?.response?.data?.detail || e.message;
            console.error(`[vlm] HTTP ${status}: ${detail}`);
            if (status === 502 && /no VLM backend|GEMINI_API_KEY/i.test(detail || "")) {
              toast.error("AI coach unavailable. We'll use on-device analysis only for now.");
            }
            return [];
          }
        },
        onProgress: (info) => {
          // videoProcessor sends { step, percent, message }
          // Once real progress arrives, stop the fake interval steps
          clearInterval(interval);
          const pct = typeof info === "number" ? info : info?.percent;
          const msg = typeof info === "string" ? info : info?.message;
          if (pct != null) setProgress(pct);
          if (msg) setLoadingText(msg);
        },
      });

      if (!clientResult || clientResult.error) {
        throw new Error(clientResult?.error || "Analysis returned no results");
      }

      // Send client results to backend for coaching enrichment.
      // Guests get ONE free analysis (gated above by guest_analysis_used flag);
      // their request goes through with no Authorization header → backend
      // skips token spend + DB save but still returns the enriched result.
      {
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
            // Send the per-shot list (with VLM reasoning/form_feedback if any)
            // so the backend can use it for VLM coaching + return it for UI render.
            // The reasoning + form_feedback text is the metadata the AI Coach
            // uses later for cross-session comparison — no images stored.
            // Strip thumbnails (used for in-memory visual verification only).
            shots: (clientResult.shots || []).map((s) => {
              const { thumbnail, ...rest } = s;
              return rest;
            }),
          }, { timeout: 30000 });

          clearInterval(interval);
          setProgress(100);
          setLoadingText("Complete!");

          if (data.success !== false) {
            data._processingMode = "client";
            // Diagnostic: surface VLM coaching state for debugging
            const vc = data.vlm_coaching || {};
            const drillCount = Array.isArray(vc.priority_drills) ? vc.priority_drills.length : 0;
            const eqCount = Array.isArray(vc.equipment_recommendations) ? vc.equipment_recommendations.length : 0;
            console.info(`[vlm-coach] drills=${drillCount} equipment=${eqCount} keys=${Object.keys(vc).join(",")}`);
            if (vc._error) console.warn("[vlm-coach] backend error:", vc._error);
            // If the backend couldn't persist the analysis (Mongo timeout
            // most often), warn the user so they don't expect it in history.
            // Surface the actual error message when present.
            if (user && data.saved_to_history === false) {
              const reason = data.save_error || data.error || "backend error";
              console.error("[history-save] FAILED:", reason, data.traceback_tail || data._debug);
              toast.error(`Analysis didn't save to history: ${reason.slice(0, 80)}`);
            }
            // Merge in-memory thumbnails back onto each shot for the UI
            // (backend strips them per the no-image-storage rule).
            if (Array.isArray(data.shots) && Array.isArray(clientResult.shots)) {
              for (let i = 0; i < data.shots.length && i < clientResult.shots.length; i++) {
                if (clientResult.shots[i]?.thumbnail) {
                  data.shots[i].thumbnail = clientResult.shots[i].thumbnail;
                }
              }
            }
            setResult(data);
            setViewingHistorical(false);
            setActiveTab("results");
            // Guest path: mark the free analysis used + auto-show the
            // sign-up prompt so the next analyze attempt converts.
            if (data.guest_mode || !user) {
              try { localStorage.setItem("guest_analysis_used", "true"); } catch {}
              setTimeout(() => setShowGuestUpgrade(true), 2500);
              toast.success("Free analysis complete! Sign up for 300 free tokens to analyze more.");
            } else {
              refreshProfile();
              loadHistory();
              toast.success("Analysis complete!");
              if (data.new_badges?.length > 0) {
                setTimeout(() => setNewBadge(data.new_badges[0]), 1500);
              }
              // Reanalyze flow: kick off the comparison call now that both
              // analyses exist on the server.
              if (reanalyzeContext?.id && data.analysis_id) {
                fetchComparison(reanalyzeContext.id, data.analysis_id);
              }
            }
          } else {
            throw new Error("Server enrichment failed");
          }
        } catch (serverErr) {
          // 402 = insufficient tokens. Open the buy/earn modal and bail
          // out — don't show the partial client-side result as success.
          if (serverErr?.response?.status === 402) {
            const detail = serverErr.response.data?.detail || {};
            clearInterval(interval);
            setAnalyzing(false);
            setResult(null);
            setProgress(0);
            setInsufficientBalance(detail.balance ?? 0);
            setShowInsufficientModal(true);
            // Sync the navbar chip with the server's actual balance so the
            // user doesn't see "🪙 300" up top while the modal says "0".
            try { refreshTokens?.(); } catch {}
            return;
          }

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
      }
    } catch (err) {
      clearInterval(interval);
      const msg = err.response?.data?.detail || err.message || "Analysis failed";
      setError(msg);
      toast.error(msg);
    }
    setAnalyzing(false);
  };

  // Map a normalized box {x, y, width, height} ∈ [0,1] to one of the
  // backend's quadrant strings ("top-left", "bottom-right", etc.).
  const _boxToQuadrant = (box) => {
    if (!box) return "auto";
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const horiz = cx < 0.5 ? "left" : "right";
    const vert = cy < 0.5 ? "top" : "bottom";
    return `${vert}-${horiz}`;
  };

  const runServerAnalysis = async (sportToAnalyze, customCropBox) => {
    setAnalyzing(true);
    setResult(null);
    setError(null);
    setProgress(0);

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
      // Player target: prefer the box selected from the modal, fall back to
      // the explicit dropdown, else 'auto'.
      const resolvedPlayer = customCropBox ? _boxToQuadrant(customCropBox) : targetPlayer;
      const playerParam = resolvedPlayer && resolvedPlayer !== "auto" ? `&target_player=${resolvedPlayer}` : "";
      const { data } = await api.post(
        `/analyze-video?sport=${sportToAnalyze}&analysis_mode=${analysisMode}${playerParam}&predictor=auto`,
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
    setAnalyzing(false);
  };

  const handlePlayerSelected = async (box, _idx) => {
    setShowPlayerModal(false);
    const sportToAnalyze = pendingAnalysisSport;
    setPendingAnalysisSport(null);
    setScanResult(null);
    if (!sportToAnalyze) return;
    // box is null if user clicked "Skip — Analyze Whole Video".
    // Dispatch by processing mode: client = on-device, server = backend VLM.
    if (processingMode === "client") {
      await runClientAnalysis(sportToAnalyze, box);
    } else {
      await runServerAnalysis(sportToAnalyze, box);
    }
  };

  // "Analyze All Players": fan out one server request per detected box,
  // collect all responses, render as multiple result cards.
  const handleAnalyzeAllPlayers = async (boxes) => {
    setShowPlayerModal(false);
    const sportToAnalyze = pendingAnalysisSport;
    setPendingAnalysisSport(null);
    setScanResult(null);
    if (!sportToAnalyze || !boxes || boxes.length === 0) return;
    if (processingMode === "client") {
      // Client mode: only single-player on-device today; fall back to first.
      await runClientAnalysis(sportToAnalyze, boxes[0]);
      return;
    }

    setAnalyzing(true);
    setResult(null);
    setError(null);
    setProgress(0);
    setLoadingText(`Analyzing ${boxes.length} players in parallel...`);
    try {
      const formData = (box) => {
        const fd = new FormData();
        fd.append("video", file);
        return fd;
      };
      const resolved = boxes.map((b) => _boxToQuadrant(b));
      // Fire all requests in parallel — server-side, batched VLM still costs
      // ~1 API call per player regardless of shot count.
      const results = await Promise.all(resolved.map(async (player, i) => {
        try {
          const { data } = await api.post(
            `/analyze-video?sport=${sportToAnalyze}&analysis_mode=${analysisMode}&target_player=${player}&predictor=auto`,
            formData(boxes[i]),
            { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 }
          );
          return { player_index: i, box: boxes[i], target_player: player, data };
        } catch (err) {
          return { player_index: i, box: boxes[i], target_player: player,
                   error: err.response?.data?.detail || err.message || "Analysis failed" };
        }
      }));
      setProgress(100);
      setLoadingText("Complete!");
      // Aggregate into a multi-player result envelope. The renderer can
      // detect the `all_players` field and switch to multi-card view.
      setResult({
        success: results.some((r) => r.data?.success),
        all_players: results,
        sport: sportToAnalyze,
        _processingMode: "server",
      });
      setViewingHistorical(false);
      setActiveTab("results");
      refreshProfile();
      loadHistory();
      const okCount = results.filter((r) => r.data?.success).length;
      toast.success(`Analyzed ${okCount}/${boxes.length} players`);
    } catch (err) {
      const msg = err.message || "Multi-player analysis failed";
      setError(msg);
      toast.error(msg);
    }
    setAnalyzing(false);
  };

  const handlePlayerModalClose = () => {
    setShowPlayerModal(false);
    setScanResult(null);
    setPendingAnalysisSport(null);
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
    { key: "auto", label: "Auto-detect", icon: "✨", videoAnalysis: true },
    { key: "badminton", label: "Badminton", icon: "🏸", videoAnalysis: true },
    { key: "tennis", label: "Tennis", icon: "🎾", videoAnalysis: true },
    { key: "table_tennis", label: "Table Tennis", icon: "🏓", videoAnalysis: true },
    { key: "pickleball", label: "Pickleball", icon: "⚡", videoAnalysis: true },
    { key: "cricket", label: "Cricket", icon: "🏏", videoAnalysis: true },
    { key: "football", label: "Football", icon: "⚽", videoAnalysis: false },
    { key: "swimming", label: "Swimming", icon: "🏊", videoAnalysis: false },
  ];

  // renderSportSelector was deleted: sport is now auto-detected from the
  // uploaded video and confirmed in PlayerSelectionModal where the user can
  // override if the detection is wrong.

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
      {/* Token-cost banner — always visible so user knows the price BEFORE
          uploading. Three states: guest, signed-in + enough, signed-in + short. */}
      <div className={`mb-4 rounded-2xl border p-3 sm:p-4 flex items-center gap-3 flex-wrap ${
        user && tokens != null && tokens < 100
          ? "bg-amber-400/5 border-amber-400/30"
          : "bg-purple-400/5 border-purple-400/30"
      }`}>
        <div className="w-10 h-10 rounded-xl bg-purple-400/15 flex items-center justify-center shrink-0 text-xl">
          🪙
        </div>
        <div className="flex-1 min-w-0">
          {!user ? (
            <>
              <p className="text-sm font-semibold text-white">
                This analysis costs 100 tokens — sign up to get 300 free.
              </p>
              <p className="text-[11px] text-zinc-400">
                That's 3 free analyses on us. Tokens never expire.
              </p>
            </>
          ) : tokens != null && tokens < 100 ? (
            <>
              <p className="text-sm font-semibold text-white">Need 100 tokens · You have {tokens}</p>
              <p className="text-[11px] text-zinc-400">Earn more for free or top up to continue.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-white">
                This analysis costs 100 tokens · You have {tokens ?? "—"}
              </p>
              <p className="text-[11px] text-zinc-400">
                Tokens never expire. Earn more by referring friends or hosting games.
              </p>
            </>
          )}
        </div>
        {!user ? (
          <Link to="/auth"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-lime-400 hover:bg-lime-500 text-black transition-colors">
            Sign up free →
          </Link>
        ) : (
          <Link to="/wallet"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-purple-400/15 hover:bg-purple-400/25 text-purple-200 border border-purple-400/30 transition-colors">
            Wallet →
          </Link>
        )}
      </div>

      {/* Loading state pinned to top so user sees progress immediately */}
      {analyzing && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="mb-6 bg-zinc-900/80 border border-lime-400/30 rounded-2xl p-6 text-center shadow-lg shadow-lime-400/10">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-10 h-10 border-2 border-lime-400 border-t-transparent rounded-full mx-auto mb-3"
          />
          <p className="font-heading font-semibold text-white uppercase tracking-tight mb-2 text-sm">
            Analyzing your video
          </p>
          <motion.p
            key={loadingText}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-zinc-400 text-xs mb-3"
          >
            {loadingText}
          </motion.p>
          <div className="max-w-xs mx-auto">
            <Progress value={progress} className="h-1.5 bg-zinc-800 [&>div]:bg-lime-400 [&>div]:rounded-full [&>div]:transition-all [&>div]:duration-700" />
          </div>
          <p className="text-zinc-600 text-[10px] mt-2">{progress}%</p>
        </motion.div>
      )}

      {/* Sport Selection — removed from upload UI. We auto-detect from the
          actual video frames and confirm in the Player Selection modal where
          the user can override if the detection is wrong. */}

      {/* Player Selection for Doubles */}
      {renderPlayerSelector()}

      {/* Tips for best results */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 mb-4">
        <p className="text-xs text-blue-400 font-medium mb-2 flex items-center gap-1">
          <Lightbulb className="w-3 h-3" /> For Best Results
        </p>
        <ul className="text-xs text-zinc-400 space-y-1 ml-4">
          <li>• Side-angle camera view (90° from player) works best</li>
          <li>• Player should be clearly visible, full body in frame</li>
          <li>• 5-30 seconds of clean footage</li>
          <li>• Good lighting, minimal background motion</li>
          <li>• 1-3 distinct shots is ideal for accurate analysis</li>
        </ul>
      </div>

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
          MP4, AVI, MOV &middot; Up to a few minutes (longer = slower)
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
          <Button onClick={analyze} disabled={false}
            className="w-full bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-sm py-3 shadow-lg shadow-lime-400/20"
            data-testid="analyze-btn-mobile">
            <Zap className="w-4 h-4 mr-2" /> Analyze Video
          </Button>
        </div>
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

  const handleInlineGoogleSignIn = async () => {
    try {
      // Stash the in-progress analysis so it survives the sign-in popup
      // and we can re-attach it to the new user's history (+ deduct 100
      // tokens for the previously-free analysis).
      if (result) {
        try {
          sessionStorage.setItem("pending_analysis", JSON.stringify({
            result, sport: selectedSport || result.sport, savedAt: Date.now(),
          }));
        } catch {}
      }
      const { signInWithPopup } = await import("firebase/auth");
      const { auth, googleProvider } = await import("@/lib/firebase");
      const fb = await signInWithPopup(auth, googleProvider);
      const idToken = await fb.user.getIdToken();
      const { data } = await api.post("/auth/firebase", {
        firebase_token: idToken,
        name: fb.user.displayName || "",
        email: fb.user.email || "",
        photo: fb.user.photoURL || "",
      });
      login(data.token, data.user, data.has_profile, data.tokens);
      toast.success(`Signed in! 🪙 ${data.tokens || 300} tokens credited — coaching unlocked.`);
      // The result we already have on screen will now show un-gated since
      // user is authenticated. The pending_analysis stash gets picked up
      // by the post-login useEffect below to save it to history server-side.
    } catch (err) {
      if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return;
      console.error("Inline sign-in failed:", err);
      toast.error(err?.message || "Sign in failed");
    }
  };

  const renderLockedOverlay = (children) => (
    <div className="relative">
      <div className="blur-sm pointer-events-none select-none opacity-50">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-zinc-900/95 border border-lime-400/30 rounded-2xl p-5 max-w-sm text-center shadow-2xl">
          <div className="text-3xl mb-2">🪙</div>
          <h3 className="font-bold text-white mb-1">Unlock Full Coaching · 300 free tokens</h3>
          <p className="text-xs text-zinc-400 mb-4">
            Sign in to keep this analysis, get personalized training, equipment picks, and 300 free tokens for more analyses.
          </p>
          <Button
            onClick={handleInlineGoogleSignIn}
            className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-6"
          >
            Sign in with Google →
          </Button>
        </div>
      </div>
    </div>
  );
  const gate = (children) => (showLockedSections ? renderLockedOverlay(children) : children);

  const renderResults = () => {
    if (!result) return null;
    // Multi-player branch: render one summary card per analyzed player.
    if (result.all_players && Array.isArray(result.all_players)) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="text-xs text-zinc-500">
            Analyzed {result.all_players.length} players in {result.sport || "the video"}.
          </div>
          {result.all_players.map((p) => {
            const d = p.data || {};
            const sh = d.shot_analysis || {};
            const co = d.coaching || {};
            const ok = d.success;
            return (
              <div key={p.player_index} className="border border-zinc-800 rounded-2xl p-4 bg-zinc-900/60">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-heading font-bold text-white">
                    Player {p.player_index + 1} <span className="text-xs text-zinc-500 ml-2">({p.target_player})</span>
                  </div>
                  {ok && (
                    <Badge className="bg-lime-400/15 text-lime-300 border-lime-400/30 text-[11px]">
                      {d.skill_level || "—"}
                    </Badge>
                  )}
                </div>
                {!ok ? (
                  <div className="text-xs text-rose-400">Analysis failed: {p.error || "unknown error"}</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                      <div><span className="text-zinc-500">Shot:</span> <span className="text-white font-semibold">{sh.shot_name || "—"}</span></div>
                      <div><span className="text-zinc-500">Score:</span> <span className="text-white font-semibold">{sh.assessment?.overall_score ?? 0}/100</span></div>
                      <div><span className="text-zinc-500">Speed:</span> <span className="text-white font-semibold">{d.speed_analysis?.estimated_speed_kmh ?? 0} km/h</span></div>
                      <div><span className="text-zinc-500">Shots detected:</span> <span className="text-white font-semibold">{d.summary?.n_shots_detected ?? d.shots?.length ?? 0}</span></div>
                    </div>
                    {co.summary && <p className="text-zinc-300 text-sm mb-2">{co.summary}</p>}
                    {co.shot_tip && <p className="text-lime-300 text-xs">💡 {co.shot_tip}</p>}
                  </>
                )}
              </div>
            );
          })}
        </motion.div>
      );
    }

    const shot = result.shot_analysis || {};
    const pro = result.pro_comparison || {};
    const coaching = result.coaching || {};
    const contextualDrills = generateDrillsFromAnalysis(result);
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
    const vlmCoaching = result.vlm_coaching || {};
    // Single source of truth for skill level — Gemini's most-common per-shot
    // verdict. Falls back to backend's skill_level (which the backend has
    // already overridden with VLM data when available), then to "Intermediate".
    // Both the Match Summary badge AND the Coaching Insights tile read this
    // so they never disagree.
    const aiSkillLevel = (() => {
      const seen = (result.shots || [])
        .map((s) => s.vlmSkill || s.vlm_skill || s.estimated_skill)
        .filter((s) => s && s !== "Unknown" && s !== "unknown");
      if (seen.length === 0) return result.skill_level || "Intermediate";
      const counts = seen.reduce((a, l) => { a[l] = (a[l] || 0) + 1; return a; }, {});
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    })();
    // True when VLM produced real coaching content. When true, we hide the
    // static template cards (Top 3 to improve / Pro tips / 7-day plan /
    // Drills for you) so the user gets ONE coaching surface, not duplicated.
    const vlmCoachingActive = !!(vlmCoaching.priority_drills?.length
      || vlmCoaching.equipment_recommendations?.length
      || vlmCoaching.seven_day_plan?.length);

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

        {/* Progress comparison — rich multi-section card surfaced after a
            Reanalyze flow. Sections: hero deltas, AI-coach visual verdict,
            drill attribution (did the focus areas improve?), narrative. */}
        {comparisonResult && (() => {
          const c = comparisonResult;
          const d = c.deltas || {};
          const score = d.score || {};
          const speed = d.speed_kmh || {};
          const w = d.weaknesses || {};
          // Verdict derived from score + weakness deltas (no visual call now)
          const scoreUp = (score.delta || 0) > 2;
          const scoreDown = (score.delta || 0) < -2;
          const hasResolved = (w.resolved?.length || 0) > 0;
          const hasEmerged = (w.emerged?.length || 0) > 0;
          const verdict = scoreUp || (hasResolved && !hasEmerged) ? "improved"
            : scoreDown || (hasEmerged && !hasResolved) ? "regressed"
            : (hasResolved && hasEmerged) || (Math.abs(score.delta || 0) > 0.5) ? "mixed"
            : "same";
          const verdictTone = verdict === "improved" ? "border-lime-400/40 bg-lime-400/5"
            : verdict === "regressed" ? "border-red-400/40 bg-red-400/5"
            : verdict === "mixed" ? "border-amber-400/40 bg-amber-400/5"
            : "border-sky-400/30 bg-sky-400/5";
          const verdictBadge = verdict === "improved" ? "bg-lime-400 text-black"
            : verdict === "regressed" ? "bg-red-400 text-black"
            : verdict === "mixed" ? "bg-amber-400 text-black"
            : "bg-sky-400 text-black";
          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={`border-2 rounded-2xl p-5 ${verdictTone} bg-gradient-to-br from-transparent to-zinc-900/80`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`text-[10px] uppercase font-bold ${verdictBadge}`}>
                    {verdict}
                  </Badge>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-400 font-semibold">
                    Progress on your {c.shot_type?.replace(/_/g, " ") || "shot"} · {c.days_between} days
                  </p>
                </div>
                <button
                  className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
                  onClick={() => setComparisonResult(null)}
                  aria-label="dismiss">×</button>
              </div>

              {/* Session mismatch warning — different sport, no shared shot
                  types, or a multi-tier skill jump (often = different player). */}
              {c.session_mismatch && (c.session_mismatch.sport_changed
                  || c.session_mismatch.no_shared_shot_type
                  || c.session_mismatch.skill_jumped) && (
                <div className="mb-4 bg-amber-400/5 border border-amber-400/30 rounded-lg px-3 py-2 text-[11px] text-amber-200">
                  <p className="font-semibold mb-1">⚠ The two sessions don't fully match</p>
                  <ul className="space-y-0.5 text-zinc-300">
                    {c.session_mismatch.sport_changed && (
                      <li>• Sport changed since the last session — comparison may not be meaningful.</li>
                    )}
                    {c.session_mismatch.no_shared_shot_type && (
                      <li>• No shared shot types ({c.session_mismatch.only_in_old.join("/")} vs {c.session_mismatch.only_in_new.join("/")}).</li>
                    )}
                    {c.session_mismatch.skill_jumped && (
                      <li>• Skill level changed by 2+ tiers — could be a different player.</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Hero deltas */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                <div className="bg-zinc-900/60 rounded-lg p-3">
                  <p className="text-[10px] uppercase text-zinc-500">Score</p>
                  <p className="text-lg font-bold text-white">
                    {Math.round(score.old)} → {Math.round(score.new)}
                    <span className={`ml-2 text-sm ${score.delta > 0 ? "text-lime-400" : score.delta < 0 ? "text-red-400" : "text-zinc-500"}`}>
                      ({score.delta > 0 ? "+" : ""}{score.delta})
                    </span>
                  </p>
                </div>
                <div className="bg-zinc-900/60 rounded-lg p-3">
                  <p className="text-[10px] uppercase text-zinc-500">Speed (km/h)</p>
                  <p className="text-lg font-bold text-white">
                    {Math.round(speed.old)} → {Math.round(speed.new)}
                    <span className={`ml-2 text-sm ${speed.delta > 0 ? "text-lime-400" : speed.delta < 0 ? "text-red-400" : "text-zinc-500"}`}>
                      ({speed.delta > 0 ? "+" : ""}{speed.delta})
                    </span>
                  </p>
                </div>
                {d.skill_level?.changed && (
                  <div className="bg-zinc-900/60 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-zinc-500">Level</p>
                    <p className="text-lg font-bold text-lime-400">{d.skill_level.old} → {d.skill_level.new}</p>
                  </div>
                )}
              </div>

              {/* AI Coach verdict — derived from per-shot reasoning text
                  (no images; the coach compares the textual descriptions
                  the AI Coach wrote about each shot in both sessions). */}
              {(c.narrative?.improved?.length || c.narrative?.regressed?.length || c.narrative?.persistent_issues?.length) && (
                <div className="mb-4 bg-zinc-900/60 rounded-lg p-3">
                  <p className="text-[11px] uppercase text-zinc-500 font-semibold mb-2">AI Coach verdict</p>
                  {c.narrative.improved?.length > 0 && (
                    <div className="mb-2">
                      <span className="text-[10px] uppercase font-semibold text-lime-300">↑ Improved: </span>
                      <ul className="text-xs text-zinc-300 space-y-0.5 ml-3 list-disc">
                        {c.narrative.improved.map((x, i) => <li key={`i-${i}`}>{x}</li>)}
                      </ul>
                    </div>
                  )}
                  {c.narrative.regressed?.length > 0 && (
                    <div className="mb-2">
                      <span className="text-[10px] uppercase font-semibold text-red-400">↓ Regressed: </span>
                      <ul className="text-xs text-zinc-300 space-y-0.5 ml-3 list-disc">
                        {c.narrative.regressed.map((x, i) => <li key={`r-${i}`}>{x}</li>)}
                      </ul>
                    </div>
                  )}
                  {c.narrative.persistent_issues?.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-amber-300">↻ Still working on: </span>
                      <ul className="text-xs text-zinc-300 space-y-0.5 ml-3 list-disc">
                        {c.narrative.persistent_issues.map((x, i) => <li key={`p-${i}`}>{x}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Drill attribution — did the focus areas pay off? */}
              {Array.isArray(c.drill_attribution) && c.drill_attribution.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] uppercase text-zinc-500 font-semibold mb-2">What you were told to work on</p>
                  <div className="space-y-1.5">
                    {c.drill_attribution.map((da, i) => {
                      const tone = da.outcome === "resolved" ? "border-lime-400/40 text-lime-300"
                        : da.outcome === "improving" ? "border-amber-400/40 text-amber-300"
                        : da.outcome === "still working" ? "border-zinc-700 text-zinc-400"
                        : "border-zinc-800 text-zinc-500";
                      return (
                        <div key={i} className={`border rounded-lg p-2 ${tone}`}>
                          <span className="text-xs">{da.focus_area} · </span>
                          <span className="text-[11px] uppercase font-semibold">{da.outcome}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Weakness diff */}
              {(w.resolved?.length || w.emerged?.length) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  {w.resolved?.length > 0 && (
                    <div className="bg-lime-400/5 border border-lime-400/20 rounded-lg p-2">
                      <p className="text-[10px] text-lime-400 font-semibold mb-1">✓ Resolved</p>
                      <ul className="text-[11px] text-zinc-300 space-y-0.5">
                        {w.resolved.map((x, i) => <li key={i}>• {x}</li>)}
                      </ul>
                    </div>
                  )}
                  {w.emerged?.length > 0 && (
                    <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-2">
                      <p className="text-[10px] text-amber-400 font-semibold mb-1">⚠ New</p>
                      <ul className="text-[11px] text-zinc-300 space-y-0.5">
                        {w.emerged.map((x, i) => <li key={i}>• {x}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Narrative summary + next focus */}
              {c.narrative?.summary && (
                <p className="text-zinc-200 text-sm mb-2 italic">"{c.narrative.summary}"</p>
              )}
              {c.narrative?.next_focus && (
                <div className="mt-3 p-3 rounded-lg bg-sky-400/10 border border-sky-400/20">
                  <p className="text-[11px] text-sky-300 font-semibold mb-1">🎯 Focus for next session</p>
                  <p className="text-zinc-200 text-xs">{c.narrative.next_focus}</p>
                </div>
              )}
            </motion.div>
          );
        })()}

        {/* AI coach plan — VLM-personalized drills + equipment + 7-day plan,
            grounded in this analysis's actual weaknesses and per-shot reasoning. */}
        {(vlmCoaching.priority_drills?.length > 0
          || vlmCoaching.equipment_recommendations?.length > 0
          || vlmCoaching.seven_day_plan?.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="border border-lime-400/30 bg-gradient-to-br from-lime-400/5 to-zinc-900/80 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-lime-400/15 text-lime-300 border-lime-400/30 text-[10px]">AI Coach</Badge>
              {vlmCoaching.key_focus_areas?.length > 0 && (
                <p className="text-zinc-400 text-xs">
                  Focus: {vlmCoaching.key_focus_areas.join(" · ")}
                </p>
              )}
            </div>
            {vlmCoaching.motivational_message && (
              <p className="text-zinc-200 text-sm mb-4 italic">"{vlmCoaching.motivational_message}"</p>
            )}

            {vlmCoaching.priority_drills?.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-wide text-lime-300 font-semibold mb-2">Priority drills</p>
                <div className="space-y-2">
                  {vlmCoaching.priority_drills.map((d, i) => (
                    <div key={`drill-${i}`} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-white">{d.name}</p>
                        {d.duration_min && (
                          <span className="text-[10px] text-zinc-500">{d.duration_min} min</span>
                        )}
                      </div>
                      {d.why && <p className="text-xs text-lime-300/80 mb-1">→ {d.why}</p>}
                      {d.instructions && <p className="text-xs text-zinc-300">{d.instructions}</p>}
                      {d.equipment_needed?.length > 0 && (
                        <p className="text-[10px] text-zinc-500 mt-1">Need: {d.equipment_needed.join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {vlmCoaching.equipment_recommendations?.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-wide text-sky-300 font-semibold mb-2">Equipment that helps</p>
                <div className="space-y-2">
                  {vlmCoaching.equipment_recommendations.map((eq, i) => (
                    <div key={`eq-${i}`} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
                      <p className="text-sm font-semibold text-white">{eq.name}</p>
                      {eq.why && <p className="text-xs text-sky-300/80 mt-0.5">{eq.why}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {vlmCoaching.seven_day_plan?.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-amber-300 font-semibold mb-2">7-day plan</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {vlmCoaching.seven_day_plan.map((d, i) => (
                    <div key={`day-${i}`} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2">
                      <p className="text-xs font-semibold text-white">Day {d.day} · {d.minutes ? `${d.minutes} min` : ""}</p>
                      {d.focus && <p className="text-xs text-amber-300/80">{d.focus}</p>}
                      {Array.isArray(d.drills) && d.drills.length > 0 && (
                        <p className="text-[10px] text-zinc-500 mt-0.5">{d.drills.join(" · ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Honest "we couldn't read this video" banner: when AI Coach
            failed for ALL shots (every shot is unknown OR confidence near 0),
            don't show the misleading Pro/Attacking/etc heuristic badges.
            Surface the AI Coach's reasoning if available so the user knows
            why (e.g. "looks like table tennis, not badminton"). */}
        {result.multi_shot && result.shots?.length > 1 && (() => {
          const shots = result.shots || [];
          const confident = shots.filter((s) => s.type && s.type !== "unknown" && (s.confidence ?? 0) >= 0.4);
          const allFailed = shots.length > 0 && confident.length === 0;
          if (!allFailed) return null;
          // Pull the most informative reasoning from the failed shots
          const sampleReason = shots.map((s) => s.reasoning).filter(Boolean)
            .sort((a, b) => b.length - a.length)[0] || null;
          return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="border-2 border-amber-400/40 bg-amber-400/5 rounded-2xl p-4">
              <div className="flex items-start gap-2">
                <span className="text-amber-300 text-lg leading-none">⚠</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-200 mb-1">AI Coach couldn't read this video</p>
                  {sampleReason && (
                    <p className="text-xs text-zinc-300 mb-2"><span className="text-amber-300/80">Coach: </span>{sampleReason}</p>
                  )}
                  <p className="text-[11px] text-zinc-500">
                    Tip: pick a clearer side-angle clip with the player fully in frame.
                    If the sport was wrong, re-upload — we'll auto-detect it.
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })()}

        {/* ── Match summary — moved here from below for at-a-glance read.
            Skill level + style + speed badges + shot distribution upfront.
            ONLY shown when at least one shot was confidently classified. */}
        {result.multi_shot && result.shots?.length > 1
          && (result.shots || []).some((s) => s.type && s.type !== "unknown" && (s.confidence ?? 0) >= 0.4) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
              <Film className="w-3 h-3 text-sky-400" /> Match Summary — {result.total_shots_detected} shots detected
            </p>
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {aiSkillLevel && (
                <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-[10px] uppercase font-bold">
                  {aiSkillLevel} level
                </Badge>
              )}
              {result.player_profile?.play_style && (
                <Badge className="bg-sky-400/10 text-sky-400 border-sky-400/20 text-[10px] uppercase font-bold">
                  {result.player_profile.play_style} Style
                </Badge>
              )}
              {(() => {
                const power = (result.shots || []).filter(
                  (s) => ["smash", "drive", "clear"].includes(s.type) && s.speed > 0,
                );
                if (power.length === 0) return null;
                const avg = Math.round(power.reduce((a, b) => a + b.speed, 0) / power.length);
                return (
                  <Badge className="bg-amber-400/10 text-amber-400 border-amber-400/20 text-[10px] uppercase font-bold">
                    <Zap className="w-2.5 h-2.5 mr-1 inline" /> Avg {avg} km/h
                  </Badge>
                );
              })()}
            </div>
            {result.shot_distribution && Object.keys(result.shot_distribution).length > 0 && (
              <div className="space-y-2">
                {Object.entries(result.shot_distribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([shotType, count], i) => {
                    const pct = Math.round((count / result.total_shots_detected) * 100);
                    const shotLabel = shotType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <div key={shotType}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-zinc-300">{shotLabel}</span>
                          <span className="text-xs text-zinc-500">{count}× ({pct}%)</span>
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
          </motion.div>
        )}

        {/* Match Insights — multi-shot analysis with skill score + coaching narrative */}
        {file && !viewingHistorical && (
          <MatchInsights
            videoFile={file}
            shots={result.shots}
            sport={result.sport || selectedSport || profile?.active_sport || "badminton"}
            playerPosition={targetPlayer || "auto"}
          />
        )}

        {/* Profile setup prompt for signed-in users without a profile */}
        {user && !profile?.active_sport && result && !viewingHistorical && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5 mb-4"
          >
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-blue-400 mt-1 shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-white mb-1">Get personalized training</h3>
                <p className="text-sm text-zinc-400 mb-3">
                  You haven't set up your profile yet. Choose an option:
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={() => navigate("/assessment")}
                    className="bg-lime-400 text-black hover:bg-lime-500 font-bold text-xs"
                  >
                    Take 1-min Quiz (Best)
                  </Button>
                  <Button
                    onClick={createProfileFromAnalysis}
                    variant="outline"
                    className="border-lime-400/30 text-lime-400 hover:bg-lime-400/10 text-xs"
                  >
                    Use This Analysis
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

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

        {/* ── Analysis Quality (compact chip — full card was visual noise) ── */}
        {result.analysis_quality?.confidence_level === 'low' && result.analysis_quality?.warning && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">{result.analysis_quality.warning}</p>
          </div>
        )}

        {/* ── HERO: Grade + Shot + Speed ──
             Hidden in multi-shot mode (the Match Analysis card below has the
             same info) and when single-shot confidence is too low to be
             meaningful — Coaching Insights covers that case.
        */}
        {!result.multi_shot && shot.shot_type !== 'unknown' && !(shot.confidence != null && shot.confidence < 0.3) && (
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
                  {result.target_player && (
                    <Badge className="text-[10px] px-2 py-0.5 bg-violet-400/10 text-violet-400 border-violet-400/20">
                      <Target className="w-2.5 h-2.5 mr-1 inline" /> {result.target_player === "auto" ? "Primary player" : `${result.target_player.replace("-", " ")} player`}
                    </Badge>
                  )}
                </div>
                {(shot.confidence != null && shot.confidence > 0) && (
                  <p className="text-zinc-500 text-xs">
                    {shot.confidence >= 0.7 ? '🟢 High confidence' :
                     shot.confidence >= 0.4 ? '🟡 Medium confidence' :
                     '🔴 Low confidence — try a clearer video'} ({Math.round(shot.confidence * 100)}%)
                  </p>
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
        )}

        {/* (Match Summary card was relocated above — appears before Coaching
            Insights now so the at-a-glance read happens first.) */}

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

        {/* ── Top Issues (Coach Style) — hidden when VLM coaching present ── */}
        {!vlmCoachingActive && (shot.weaknesses?.length > 0 || coachFeedback.top_issues?.length > 0) && gate(
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
                      <span className="text-sm font-semibold text-white">{
                        (w.area || "Technique")
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())
                      }</span>
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

        {/* ── Progress Reminder Banner ── */}
        {reminderDue && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 flex items-start gap-3">
            <Calendar className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-white text-sm">Welcome back!</h4>
              <p className="text-xs text-zinc-400 mb-1">
                It has been over 7 days since your last analysis{previousScore ? ` (${previousScore}/100)` : ""}. Upload a new video to see your improvement.
              </p>
            </div>
            <button
              onClick={() => { setReminderDue(false); try { localStorage.removeItem("next_analysis_reminder"); } catch { /* ignore */ } }}
              className="text-zinc-500 hover:text-white text-xs">
              Dismiss
            </button>
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
        {(pro.pro_tips?.length > 0 || pro.player_match?.player) && gate(
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

        {/* ── (e) 7-Day Training Plan (dynamic) — hidden when VLM coach plan present ── */}
        {!vlmCoachingActive && gate(
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
        )}

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

          </motion.div>
        )}

        {/* ── Personalized Drills (derived from this video) — hidden when VLM coach drills present ── */}
        {!vlmCoachingActive && contextualDrills.length > 0 && gate(
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.39 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1">
                <Dumbbell className="w-3 h-3 text-lime-400" /> Drills For You
              </p>
              <Badge className="bg-lime-400/10 text-lime-400 border-lime-400/20 text-[10px]">
                Based on this video
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {contextualDrills.map((drill, i) => {
                const Icon = DRILL_TYPE_ICON[drill.type] || Dumbbell;
                const diffClass = DRILL_DIFFICULTY_STYLE[drill.difficulty] || DRILL_DIFFICULTY_STYLE.medium;
                return (
                  <motion.div
                    key={i}
                    whileHover={{ y: -2, scale: 1.01 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="group relative bg-zinc-800/40 border border-zinc-800 hover:border-lime-400/40 rounded-2xl p-4 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center shrink-0 group-hover:bg-lime-400/20 transition-colors">
                        <Icon className="w-5 h-5 text-lime-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="font-heading font-bold text-sm text-white leading-tight">
                            {drill.name}
                          </h4>
                          <Badge
                            variant="outline"
                            className={`text-[9px] uppercase font-bold shrink-0 ${diffClass}`}
                          >
                            {drill.difficulty}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-zinc-500 mb-2">
                          <Clock className="w-3 h-3" />
                          <span>{drill.duration}</span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                          {drill.why}
                        </p>
                        <a
                          href={drill.video}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-lime-400 hover:text-lime-300 transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" /> Try It
                          <ArrowRight className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
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
          {!vlmCoachingActive && gearTips.length > 0 && (
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

          {!vlmCoachingActive && trainingPrios.length > 0 && (
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

        {/* Save-to-profile CTA — every analysis result has the option to
            update the user's profile for that sport. Shown only for logged-in
            users with a successfully-saved analysis. */}
        {user && result?.analysis_id && result?.saved_to_history !== false && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-sky-400/5 border border-sky-400/20 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Target className="w-5 h-5 text-sky-300 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Save these results to your {(result.sport || "sport").replace("_", " ")} profile</p>
                <p className="text-xs text-zinc-400 truncate">Updates your skill level, play style, strengths, and focus areas based on this analysis.</p>
              </div>
            </div>
            <Button
              onClick={() => setShowProfileUpdateModal(true)}
              className="bg-sky-400 text-black hover:bg-sky-500 font-bold text-xs shrink-0">
              Update Profile
            </Button>
          </motion.div>
        )}

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
                {/* Reanalyze CTA — appears for analyses ≥7 days old. Lets the
                    player upload a fresh video and get a VLM-driven progress
                    comparison vs this old session. */}
                {(() => {
                  const ageDays = a.date ? (Date.now() - new Date(a.date).getTime()) / 86_400_000 : 0;
                  if (ageDays < 7) return null;
                  return (
                    <div className="mt-3 ml-13 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-sky-400/30 text-sky-300 hover:bg-sky-400/10 text-[11px] h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          startReanalyze(a);
                        }}
                      >
                        <BarChart3 className="w-3 h-3 mr-1" />
                        Reanalyze · see your progress
                      </Button>
                      <span className="text-[10px] text-zinc-600">{Math.floor(ageDays)} days ago</span>
                    </div>
                  );
                })()}
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="analyze-page">
      <InsufficientTokensModal
        open={showInsufficientModal}
        onOpenChange={setShowInsufficientModal}
        balance={insufficientBalance}
        required={100}
      />
      {/* Guest upgrade prompt — shown after the free analysis completes
          and on the second guest analyze attempt. */}
      {showGuestUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowGuestUpgrade(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-lime-500/10 via-zinc-900 to-zinc-950 border border-lime-400/30 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center relative">
            <div className="text-5xl mb-3">🪙</div>
            <h2 className="font-heading font-black text-2xl sm:text-3xl text-white uppercase tracking-tight mb-2">
              Sign up — get 300 tokens free
            </h2>
            <p className="text-zinc-300 text-sm mb-5 leading-relaxed">
              You've used your one free analysis. Sign up to unlock 3 more analyses on us
              (300 tokens), plus history, training plan, and equipment recs.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate("/auth")}
                className="w-full bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full h-11">
                Sign up free →
              </Button>
              <button onClick={() => setShowGuestUpgrade(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300">
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
      <SEO
        title="AI Video Analysis - Analyze Your Badminton, Tennis, Table Tennis Shots"
        description="Upload a video and get instant AI-powered shot analysis. Detect smashes, drives, drops, and more. Get speed estimation, technique scoring, and personalized improvement tips. Free for badminton, tennis, table tennis, and pickleball."
        keywords="badminton shot analysis, tennis video analyzer, table tennis stroke analysis, AI sports video analysis, badminton smash speed, tennis serve analyzer"
        url="https://athlyticai.com/analyze"
      />
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

      {/* Player Selection Modal (multi-person videos) */}
      <PlayerSelectionModal
        isOpen={showPlayerModal}
        scanResult={scanResult}
        onSelect={handlePlayerSelected}
        onSelectAll={handleAnalyzeAllPlayers}
        onClose={handlePlayerModalClose}
        allowAnalyzeAll={processingMode !== "client"}
        detectedSport={detectedSport}
        detectedSportConfidence={detectedSportConfidence}
        onSportOverride={(sport) => {
          setDetectedSport(sport);
          // Update the pending sport so the next-stage analysis uses the
          // user's override (otherwise it'd run with the auto-detected one).
          setPendingAnalysisSport(sport);
          setSelectedSport(sport);
        }}
      />

      {/* Save-to-profile confirmation modal — preview what changes,
          confirm before writing. */}
      {showProfileUpdateModal && result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowProfileUpdateModal(false)}>
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading font-bold text-lg text-white mb-2">
              Update your {(result.sport || "sport").replace("_", " ")} profile?
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              We'll save these values from your analysis to your profile. Your training plan and recommendations will adapt.
            </p>
            <div className="space-y-2 mb-4 text-sm">
              <div className="bg-zinc-800/40 rounded-lg p-3 flex items-center justify-between">
                <span className="text-zinc-400">Skill level</span>
                <span className="text-white font-semibold">{result.skill_level || "—"}</span>
              </div>
              <div className="bg-zinc-800/40 rounded-lg p-3 flex items-center justify-between">
                <span className="text-zinc-400">Play style</span>
                <span className="text-white font-semibold">{result.player_profile?.play_style || "All-round"}</span>
              </div>
              {(() => {
                const seen = new Set();
                const strengths = [];
                for (const s of (result.shots || [])) {
                  for (const x of ((s.formFeedback || s.form_feedback || {}).strengths || []).slice(0, 2)) {
                    const k = String(x).trim().toLowerCase();
                    if (k && !seen.has(k)) { seen.add(k); strengths.push(String(x).trim()); }
                  }
                }
                return strengths.length > 0 && (
                  <div className="bg-zinc-800/40 rounded-lg p-3">
                    <p className="text-zinc-400 mb-1">Strengths</p>
                    <ul className="text-white text-xs space-y-0.5 ml-3 list-disc">
                      {strengths.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                );
              })()}
              {(() => {
                const seen = new Set();
                const focus = [];
                for (const s of (result.shots || [])) {
                  for (const x of ((s.formFeedback || s.form_feedback || {}).weaknesses || []).slice(0, 2)) {
                    const k = String(x).trim().toLowerCase();
                    if (k && !seen.has(k)) { seen.add(k); focus.push(String(x).trim()); }
                  }
                }
                return focus.length > 0 && (
                  <div className="bg-zinc-800/40 rounded-lg p-3">
                    <p className="text-zinc-400 mb-1">Focus areas</p>
                    <ul className="text-white text-xs space-y-0.5 ml-3 list-disc">
                      {focus.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                );
              })()}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowProfileUpdateModal(false)}
                variant="outline"
                className="flex-1 border-zinc-700 text-zinc-300">
                Cancel
              </Button>
              <Button
                onClick={updateProfileFromAnalysis}
                className="flex-1 bg-sky-400 text-black hover:bg-sky-500 font-bold">
                Save to Profile
              </Button>
            </div>
          </div>
        </div>
      )}

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
