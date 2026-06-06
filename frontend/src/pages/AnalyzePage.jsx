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
  Users, Cpu, Cloud, Lock, Footprints, Wind, Activity, Flame, Crosshair,
  Eye, BarChart2, Volume2, AlertCircle, MessageCircle, GitCompare, Bell
} from "lucide-react";
import api from "@/lib/api";
import InsufficientTokensModal from "@/components/InsufficientTokensModal";
import ShareModal from "@/components/ShareModal";
import PlayerSelectionModal from "@/components/PlayerSelectionModal";
import { NewBadgeOverlay } from "@/components/BadgeDisplay";
import MatchInsights from "@/components/MatchInsights";
import ProReferencePanel from "@/components/ProReferencePanel";
import SEO from "@/components/SEO";
import PostAnalysisProfilePrompt from "@/components/PostAnalysisProfilePrompt";
import ProgressTrendPanel from "@/components/ProgressTrendPanel";
import VoiceCoachButton from "@/components/VoiceCoachButton";
import AnalysisFeedback from "@/components/AnalysisFeedback";
import LiveVoiceCoach from "@/components/LiveVoiceCoach";
import SessionSummaryHero from "@/components/SessionSummaryHero";
import GeminiDebugPanel from "@/components/GeminiDebugPanel";
import CoachNarrativeCard from "@/components/CoachNarrativeCard";
import AnalysisScroller from "@/components/AnalysisScroller";
import AnalysisQuickNav from "@/components/AnalysisQuickNav";
import PlayerDetectionCard from "@/components/PlayerDetectionCard";

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

// localStorage key for an in-flight async analysis job so the user can leave
// the page (or reload) and we resume polling / show the result on return.
const ACTIVE_JOB_KEY = "playsmart_active_analysis_job";
// localStorage key for the PRE-analysis "pick a player" stage, so a refresh
// or returning to the page lands the user back on the player picker instead
// of losing the upload. The compressed clip itself is too big for
// localStorage, so it's kept in IndexedDB under INFLIGHT_VIDEO_KEY.
const PICKER_SESSION_KEY = "playsmart_picker_session";
const INFLIGHT_VIDEO_KEY = "analysis_inflight";

// Base64-encode a Blob/File the FAST way. The old approach built a string
// char-by-char (`bin += String.fromCharCode(bytes[i])`) which is O(n²) and
// memory-heavy — a few seconds on desktop but 30-60s (or an out-of-memory
// crash) on iPhone for a multi-MB clip, which surfaced as "universal mode
// timeout" on iOS while PC worked. FileReader.readAsDataURL does the encoding
// natively in O(n); we just strip the "data:<mime>;base64," prefix.
function fileToBase64(blob) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || "");
        const comma = res.indexOf(",");
        resolve(comma >= 0 ? res.slice(comma + 1) : res);
      };
      reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

// Build the universal-mode result object the UI renders, from the raw backend
// `data` (events + narrative + sport). Extracted to module scope so BOTH the
// live analyze flow and the resume-on-return path produce identical results.
function buildUniversalResult(data, targetDesc, pickedPlayer) {
  const events = data?.events || [];
  return {
    success: true,
    _universal: true,
    _target_player_description: targetDesc,
    _target_player_thumbnail: pickedPlayer?.thumbnail || null,
    _target_player: pickedPlayer || null,
    _meta: data?._meta || null,
    _debug: data?._debug || data?._meta || null,
    coach_narrative: data?.coach_narrative || null,
    target_mismatch_warning: data?.target_mismatch_warning || null,
    sport: data?.sport_detected || "unknown",
    skill_level: data?.overall_skill_level || "Intermediate",
    quick_summary: data?.summary || "",
    coach_feedback: { summary: data?.summary || "", encouragement: "" },
    shots: events.map((e) => ({
      type: (e.event_type || "event").toLowerCase().replace(/\s+/g, "_"),
      name: e.shot_label || e.event_type || "Event",
      shot_label: e.shot_label || e.event_type || null,
      shot_category: e.shot_category || e.event_type || null,
      intent: e.intent || null,
      outcome: e.outcome || null,
      quality_observation: e.quality_observation || null,
      confidence: e.confidence ?? 0.7,
      timestamp: Math.round((e.timestamp_sec || 0) * 10) / 10,
      grade: (e.confidence ?? 0.7) >= 0.7 ? "A" : (e.confidence ?? 0) >= 0.5 ? "B" : "C",
      score: Math.round((e.confidence ?? 0.7) * 100),
      reasoning: e.description || "",
      formFeedback: { strengths: e.strengths || [], weaknesses: e.weaknesses || [], tip: e.tip || "" },
      vlmSkill: e.skill_level || "Intermediate",
      powerLevel: null,
      speed: null,
      thumbnail: null,
    })),
    total_shots_detected: events.length,
    multi_shot: events.length > 1,
    shot_distribution: events.reduce((d, e) => {
      const k = (e.event_type || "event").toLowerCase().replace(/\s+/g, "_");
      d[k] = (d[k] || 0) + 1;
      return d;
    }, {}),
    _accuracy_mode: "universal",
  };
}

export default function AnalyzePage() {
  const { user, profile, refreshProfile, login, tokens, refreshTokens, updateTokens } = useAuth();
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [insufficientBalance, setInsufficientBalance] = useState(0);
  const [showGuestUpgrade, setShowGuestUpgrade] = useState(false);
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isGuest = !user?.id;
  const showLockedSections = isGuest;
  const [reminderDue, setReminderDue] = useState(false);
  const [previousScore, setPreviousScore] = useState(null);
  const [file, setFile] = useState(null);
  const [analysisMode, setAnalysisMode] = useState(searchParams.get("mode") || "full");
  // Accuracy mode: locked to "premium" — every video goes through the
  // whole-video Gemini pipeline. The old Standard/Premium toggle was
  // confusing users (Standard ran a less accurate path that often
  // missed shots on phone-recorded clips) and the mapper at the bottom
  // of this block was already silently upgrading Standard → Premium on
  // refresh anyway. Keeping the state variable (instead of removing
  // every conditional reference) so the existing premium branches
  // stay live without a full sweep of the file.
  const [accuracyMode] = useState("premium");
  const [selectedSport, setSelectedSport] = useState(null);
  // Doubles toggle. When ON, backend analyses BOTH near-court players
  // and tags each event with player_role (you|partner). Persists in
  // localStorage so doubles players don't have to flip it every upload.
  const [doublesMode, setDoublesMode] = useState(() => {
    try {
      // Default ON: most users upload doubles footage, and with doubles off
      // the strict single-target filter drops every near-court player's shots
      // (reported "3 shots, only 1 detected"). Only an explicit "0" (user
      // turned it off) disables it; absence of a stored pref => on.
      return localStorage.getItem("playsmart_doubles_mode") !== "0";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("playsmart_doubles_mode", doublesMode ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [doublesMode]);

  // Set page title
  useEffect(() => { document.title = "Analyze | AthlyticAI"; }, []);

  // Lambda pre-warm: fire-and-forget a ping when the page mounts so the
  // serverless container is hot by the time the user finishes picking a
  // file and clicks Analyze. Saves ~3-5s of cold-start latency on the
  // first analysis of a session.
  useEffect(() => {
    api.get("/warm", { timeout: 8000 }).catch(() => { /* silent */ });
  }, []);

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
  const [loadingSubtext, setLoadingSubtext] = useState("");
  const [displayProgress, setDisplayProgress] = useState(0);
  const [loadingStartedAt, setLoadingStartedAt] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("upload");
  const [expandedIssue, setExpandedIssue] = useState(null);
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  const [improvementData, setImprovementData] = useState(null);
  // History sport filter — null/"all" shows everything; a specific sport
  // scopes the improvement card + history list so we never compare a
  // bowling clip's speed to a smash, which is what made the global
  // "+X% speed increase" card baseless across sports.
  const [historySportFilter, setHistorySportFilter] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareData, setShareData] = useState(null);
  const [newBadge, setNewBadge] = useState(null);
  const [viewingHistorical, setViewingHistorical] = useState(false);
  // Reanalyze flow: when set, the next analysis run will auto-trigger a
  // VLM comparison vs this stored analysis after the new one saves.
  const [reanalyzeContext, setReanalyzeContext] = useState(null);
  // Set when the user picked a baseline analysis in sport X but uploaded
  // a clip detected as sport Y. The modal at the bottom of the page
  // surfaces the conflict so the user can either continue without
  // comparison or cancel and upload a matching-sport clip.
  const [reanalyzeMismatch, setReanalyzeMismatch] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);
  // Universal mode player picker — Gemini describes everyone visible,
  // we surface those descriptions in a modal so the user explicitly
  // chooses which athlete to analyze. Stored alongside the compressed
  // video so we don't have to re-compress on selection.
  const [universalPlayers, setUniversalPlayers] = useState(null);
  const [universalUploadData, setUniversalUploadData] = useState(null);
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
  // Streaming-mode UI scratch state. Populated as SSE shot_detected
  // events arrive so the loader can show "Shot 3: Forehand Drive · 95"
  // chips while Gemini is still generating. Cleared whenever a new
  // analysis run starts.
  const [liveShots, setLiveShots] = useState([]);

  // Restore the most-recent analysis on mount so a page refresh doesn't
  // wipe the user's session. We restore in TWO layers:
  //   1. The analysis result (text JSON) from localStorage — always.
  //   2. The original videoFile (Blob) from IndexedDB — when present.
  //
  // When the video IS restored, we DO NOT mark viewingHistorical — the
  // session behaves like a live upload, so the FormComparisonModal's
  // slow-mo player works after refresh. When the video is missing or
  // expired (>1h since last upload), we fall back to viewingHistorical
  // mode and the modal shows the honest "re-upload" hint.
  //
  // IMPORTANT — must be declared AFTER all useState calls above; we
  // hit a TDZ-via-React (blank page on /analyze) the first time this
  // was placed earlier in the file because `setResult` / `result` /
  // `setViewingHistorical` weren't initialized yet at that point.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem("playsmart_last_analysis");
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (cancelled) return;
        if (!saved || typeof saved !== "object" || !saved.result) return;
        if (!Array.isArray(saved.result.shots)) return;
        if (saved.sport) setSelectedSport(saved.sport);
        setResult(saved.result);
        // Land directly on the results view so a return visit (incl. tapping
        // a "your analysis is ready" notification) shows the last analysis
        // instead of the empty upload screen. It stays until a new run.
        setActiveTab("results");

        // Try to rehydrate the original video from IndexedDB. If it's
        // there and not expired, we get the full slow-mo experience
        // back; otherwise we degrade gracefully to historical mode.
        try {
          const vs = await import("@/lib/videoStore");
          const cached = await vs.loadVideo();
          if (cancelled) return;
          if (cached?.file) {
            setFile(cached.file);
            setViewingHistorical(false);
          } else {
            setViewingHistorical(true);
          }
        } catch {
          if (!cancelled) setViewingHistorical(true);
        }
      } catch {
        // ignore corrupt storage entries
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cache the actual video Blob in IndexedDB whenever we have both a
  // file AND a successful result. 1-hour TTL keeps storage bounded —
  // long enough to cover the realistic "I refreshed mid-review" case
  // without committing us to long-term video storage.
  useEffect(() => {
    if (!result || !file) return;
    if (!Array.isArray(result.shots)) return;
    let cancelled = false;
    (async () => {
      try {
        const vs = await import("@/lib/videoStore");
        if (cancelled) return;
        await vs.saveVideo(file, 60 * 60 * 1000);
      } catch {
        // Storage is best-effort — quota exceeded / private mode just
        // means the modal will need the re-upload hint after refresh.
      }
    })();
    return () => { cancelled = true; };
  }, [result, file]);

  // Persist the latest analysis whenever it changes to something useful.
  // Skips null/empty results; clips payloads near 1.5 MB by stripping
  // thumbnails so we don't blow past localStorage quota.
  useEffect(() => {
    if (!result) return;
    if (!Array.isArray(result.shots)) return;
    try {
      const payload = JSON.stringify({
        result,
        sport: result.sport || selectedSport || null,
        savedAt: Date.now(),
      });
      if (payload.length < 1_500_000) {
        localStorage.setItem("playsmart_last_analysis", payload);
      } else {
        const slim = {
          ...result,
          shots: (result.shots || []).map((s) => ({ ...s, thumbnail: null })),
        };
        const slimPayload = JSON.stringify({
          result: slim,
          sport: result.sport || selectedSport || null,
          savedAt: Date.now(),
          _slim: true,
        });
        localStorage.setItem("playsmart_last_analysis", slimPayload);
      }
    } catch {
      // ignore quota / serialization errors — persistence is best-effort.
    }
  }, [result, selectedSport]);

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

  // Smooth-progress + rotating subtext so the loading panel never appears
  // frozen between real progress callbacks. `displayProgress` interpolates
  // toward `progress`; `loadingSubtext` rotates through phase-appropriate
  // micro-hints every ~3.5s while analyzing.
  useEffect(() => {
    if (!analyzing) {
      setDisplayProgress(0);
      setLoadingSubtext("");
      return;
    }
    const id = setInterval(() => {
      setDisplayProgress((prev) => {
        // Two-mode smoothing so the bar never appears frozen:
        // 1. Real progress jumped > displayProgress  → fast catch-up.
        // 2. Real progress is plateaued              → slow creep toward
        //    the END of the current phase (cap 1% below boundary). This
        //    gives visible motion during long stages like pose extraction
        //    or VLM calls where the real progress callback is silent.
        const phaseEnd = progress < 25 ? 24 : progress < 70 ? 69 : progress < 92 ? 91 : 99;
        const creepTarget = Math.min(phaseEnd, progress + 8);
        if (prev >= creepTarget) return prev;
        const gap = creepTarget - prev;
        // Large gaps (real jump) move quickly; small creeps inch forward.
        const step = gap > 5 ? Math.max(0.5, gap * 0.18) : 0.18;
        return Math.min(creepTarget, prev + step);
      });
    }, 120);
    return () => clearInterval(id);
  }, [analyzing, progress]);

  useEffect(() => {
    if (!analyzing) return;
    const HINTS_BY_PHASE = {
      scan: [
        "Locating players in frame...",
        "Tracking court positions...",
        "Picking the cleanest shot moments...",
      ],
      analyze: [
        "Watching your form frame-by-frame...",
        "Measuring shoulder, elbow & wrist angles...",
        "Comparing to pro-level reference...",
        "Estimating shuttle/ball speed...",
      ],
      coach: [
        "Drafting your personalized feedback...",
        "Picking drills that match your level...",
        "Choosing pros with similar style...",
      ],
      save: [
        "Saving to your history...",
        "Updating your progress profile...",
        "Almost there...",
      ],
    };
    const phase = progress < 25 ? "scan" : progress < 70 ? "analyze" : progress < 92 ? "coach" : "save";
    const hints = HINTS_BY_PHASE[phase];
    let idx = 0;
    setLoadingSubtext(hints[0]);
    const id = setInterval(() => {
      idx = (idx + 1) % hints.length;
      setLoadingSubtext(hints[idx]);
    }, 3500);
    return () => clearInterval(id);
  }, [analyzing, progress]);

  useEffect(() => {
    if (analyzing && !loadingStartedAt) setLoadingStartedAt(Date.now());
    if (!analyzing && loadingStartedAt) setLoadingStartedAt(null);
  }, [analyzing, loadingStartedAt]);

  // Ticker forces a re-render every second while analyzing so the elapsed
  // counter stays accurate even during long plateaus between real progress.
  const [, _setElapsedTick] = useState(0);
  useEffect(() => {
    if (!analyzing) return;
    const id = setInterval(() => _setElapsedTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [analyzing]);

  // ─── Async analysis job (submit → poll; user can leave the page) ──────
  // analysisJobId drives the "you can leave, we'll notify you" banner.
  const [analysisJobId, setAnalysisJobId] = useState(null);
  // Tracks whether THIS component is still mounted, so a poll loop that
  // resolves after the user navigated away doesn't clear the persisted job
  // (the resume effect on return needs it) or setState on an unmounted tree.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Re-register the push subscription on every app open (if already granted).
  // iOS rotates/expires push subscriptions; when ours goes stale the backend
  // pushes to a dead endpoint, prunes it, and the device silently stops
  // getting notifications ("worked in the afternoon, then nothing on the same
  // phone"). Re-subscribing on open keeps a fresh, valid endpoint registered.
  // Cheap + idempotent (reuses the existing subscription when still valid).
  useEffect(() => {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        import("@/lib/push").then((m) => m.subscribeToPush(api)).catch(() => {});
      }
    } catch { /* unsupported */ }
  }, []);

  // Current notification permission, for the "Notify me" control's label.
  const [notifyPermission, setNotifyPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );

  // Ask for notification permission lazily (only when a job/picker starts, or
  // from the explicit "Notify me" button), then register a Web Push
  // subscription so we can ping the user even when the tab is closed / phone
  // locked. Fire-and-forget — never blocks the flow.
  const requestAnalysisNotifyPermission = useCallback(() => {
    (async () => {
      try {
        if (!("Notification" in window)) return;
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        setNotifyPermission(Notification.permission);
        if (Notification.permission === "granted") {
          const m = await import("@/lib/push");
          await m.subscribeToPush(api);
        }
      } catch { /* unsupported / denied — local notification still works in-app */ }
    })();
  }, []);

  // Fire a local notification when the result lands — only useful if the tab
  // is backgrounded (phone locked / switched tabs), which is the common
  // "I left the page" case while the SPA stays mounted.
  const notifyAnalysisReady = useCallback((sport, count) => {
    try {
      if ("Notification" in window && Notification.permission === "granted"
          && typeof document !== "undefined" && document.hidden) {
        const n = new Notification("Your analysis is ready 🎉", {
          body: `${sport} — ${count} event${count === 1 ? "" : "s"} analyzed. Tap to view.`,
          icon: "/logo192.png",
          tag: "playsmart-analysis",
        });
        n.onclick = () => { try { window.focus(); n.close(); } catch {} };
      }
    } catch { /* noop */ }
  }, []);

  // Poll a job until it reaches a terminal state. Returns the result payload
  // on success; throws on error/timeout. Updates progress + queue messaging.
  const pollAnalysisJob = useCallback(async (jobId) => {
    let waited = 0;
    // ~6 min ceiling so a stuck job can't poll forever.
    while (waited < 360) {
      await new Promise((r) => setTimeout(r, 3000));
      waited += 3;
      let s;
      try {
        const resp = await api.get(`/analyze-jobs/${jobId}`, { timeout: 15000 });
        s = resp.data;
      } catch (e) {
        // Transient network blip — keep trying for a while before giving up.
        if (waited > 90 && e?.response?.status === 404) throw new Error("job_not_found");
        continue;
      }
      if (s.status === "complete") return s.result;
      if (s.status === "error") throw new Error(s.error || "analysis_error");
      if (!mountedRef.current) continue; // keep polling but don't touch UI
      if (s.status === "queued" && typeof s.queue_position === "number") {
        setLoadingText(
          s.queue_position > 0
            ? `In queue — ${s.queue_position} ${s.queue_position === 1 ? "person" : "people"} ahead. You can leave; we'll notify you.`
            : "Next up — starting your analysis…",
        );
      } else if (s.status === "running") {
        setProgress((p) => Math.min(92, Math.max(p, 72)));
        setLoadingText("AI Coach is analyzing your video — feel free to leave; we'll notify you when it's ready.");
      }
    }
    throw new Error("poll_timeout");
  }, []);

  // Clear the persisted picker stage (localStorage + the IndexedDB clip).
  const clearPickerSession = useCallback(() => {
    try { localStorage.removeItem(PICKER_SESSION_KEY); } catch {}
    import("@/lib/videoStore").then((vs) => vs.purgeVideo(INFLIGHT_VIDEO_KEY)).catch(() => {});
  }, []);

  // Notify the user to come back and pick a player, if they wandered off
  // while the picker was open. Clicking focuses the tab — the picker is
  // still there (or restored on reload via the resume effect below).
  const notifyPickPlayer = useCallback(() => {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        const n = new Notification("Pick a player to analyze 🎯", {
          body: "We spotted multiple players — tap to choose who to coach.",
          icon: "/logo192.png",
          tag: "playsmart-pick",
        });
        n.onclick = () => { try { window.focus(); n.close(); } catch {} };
      }
    } catch { /* noop */ }
  }, []);

  // While the picker is open, fire the "pick a player" nudge the moment the
  // user backgrounds the tab (switches away / locks phone) without choosing.
  useEffect(() => {
    if (!universalPlayers || universalPlayers.length < 2) return;
    const onHide = () => { if (document.hidden) notifyPickPlayer(); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [universalPlayers, notifyPickPlayer]);

  // Resume the PICKER stage after a reload / returning to the page: restore
  // the compressed clip from IndexedDB + the detected players so the user
  // lands back on the picker instead of losing their upload. Skipped when a
  // running job exists (that resume takes precedence below).
  useEffect(() => {
    let cancelled = false;
    let sess = null;
    try {
      if (localStorage.getItem(ACTIVE_JOB_KEY)) return; // running job wins
      const raw = localStorage.getItem(PICKER_SESSION_KEY);
      if (raw) sess = JSON.parse(raw);
    } catch { /* ignore */ }
    if (!sess?.players?.length) return;
    if (Date.now() - (sess.savedAt || 0) > 30 * 60 * 1000) {
      clearPickerSession();
      return;
    }
    (async () => {
      try {
        const vs = await import("@/lib/videoStore");
        const cached = await vs.loadVideo(INFLIGHT_VIDEO_KEY);
        if (cancelled || !cached?.file) { clearPickerSession(); return; }
        // Recompute b64 from the restored clip (cheaper to recompute than to
        // also persist the ~5MB base64 string).
        const b64 = await fileToBase64(cached.file);
        if (cancelled || !mountedRef.current) return;
        setFile(cached.file);
        setSelectedSport(sess.sport || selectedSport);
        setUniversalUploadData({
          uploadFile: cached.file, b64, midFrame: sess.midFrame || null,
          timeScale: sess.timeScale || 1,
        });
        setUniversalPlayers(sess.players);
        toast("Picked up where you left off — choose a player to analyze.", { icon: "🎯" });
      } catch {
        clearPickerSession();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume an in-flight job after a reload or returning to the analyze page.
  // The job record + result live in Mongo, so re-polling returns the finished
  // result even if the original poll loop was torn down on navigation.
  useEffect(() => {
    let cancelled = false;
    let stash = null;
    try {
      const raw = localStorage.getItem(ACTIVE_JOB_KEY);
      if (raw) stash = JSON.parse(raw);
    } catch { /* ignore */ }
    if (!stash?.jobId) return;
    if (Date.now() - (stash.savedAt || 0) > 15 * 60 * 1000) {
      try { localStorage.removeItem(ACTIVE_JOB_KEY); } catch {}
      return;
    }
    (async () => {
      setAnalyzing(true);
      setAnalysisJobId(stash.jobId);
      setProgress(65);
      setLoadingText("Resuming your analysis…");
      try {
        const result = await pollAnalysisJob(stash.jobId);
        if (cancelled || !mountedRef.current) return;
        // 0 events = failed analysis — don't render/save a fake-score result.
        if (!(result?.events || []).length) {
          setError("We couldn't detect any shots in that clip — please check your connection and try again.");
          return;
        }
        const universalResult = buildUniversalResult(result, stash.targetDesc, stash.pickedPlayer);
        setResult(universalResult);
        setActiveTab("results");
        setProgress(100);
        notifyAnalysisReady(universalResult.sport, universalResult.total_shots_detected);
        // Save to history too — the inline completion was skipped because the
        // page was unmounted (user navigated away), so without this the
        // analysis they see on return wouldn't land in their history/timeline.
        try {
          const { data: saved } = await api.post("/save-universal-analysis", {
            sport: universalResult.sport,
            skill_level: universalResult.skill_level,
            quick_summary: universalResult.quick_summary,
            coach_narrative: universalResult.coach_narrative,
            shots: (universalResult.shots || []).map(({ thumbnail, ...r }) => r),
          }, { timeout: 20000 });
          if (saved?.analysis_id && mountedRef.current) {
            setResult((prev) => (prev ? { ...prev, analysis_id: saved.analysis_id } : prev));
            try { loadHistory(); } catch {}
          }
        } catch { /* best-effort */ }
      } catch {
        // Errored / expired — drop it silently; the user can re-upload.
      } finally {
        try { localStorage.removeItem(ACTIVE_JOB_KEY); } catch {}
        if (!cancelled && mountedRef.current) {
          setAnalyzing(false);
          setAnalysisJobId(null);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // Instant chip update from server's post-debit balance (no round-trip)
        updateTokens?.(data?.token_balance);
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
    // User is explicitly starting over → wipe BOTH the persisted
    // analysis result (localStorage) AND the cached video blob
    // (IndexedDB). Other in-flight resets (errors, tab switches)
    // deliberately don't wipe — those want refresh-to-recover.
    try { localStorage.removeItem("playsmart_last_analysis"); } catch {}
    import("@/lib/videoStore")
      .then((vs) => vs.purgeVideo())
      .catch(() => { /* storage purge is best-effort */ });
    setViewingHistorical(false);
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

  // Progress Review entry from the History/Progress page: a baseline analysis
  // was stashed in sessionStorage by the "Check My Progress" button → enter
  // compare mode so the next upload is measured against it. This is now the
  // PRIMARY, discoverable way to start a progress review (the old in-page
  // baseline picker was buried and nobody found it).
  useEffect(() => {
    let baseline = null;
    try {
      const raw = sessionStorage.getItem("playsmart_progress_baseline");
      if (raw) {
        baseline = JSON.parse(raw);
        sessionStorage.removeItem("playsmart_progress_baseline");
      }
    } catch { /* ignore */ }
    if (baseline?.id) startReanalyze(baseline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // iOS requires Notification.requestPermission() to be called DIRECTLY in
    // a user-gesture (before any await), or it's silently ignored and push
    // never gets granted. This runs synchronously inside the button tap that
    // invoked analyze(), so the prompt actually appears on iPhone. The push
    // subscription itself is registered once permission is granted.
    requestAnalysisNotifyPermission();

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
    // Reset historical flag at the start of a new analysis so a
    // localStorage-restored historical view doesn't keep videoFile=null.
    setViewingHistorical(false);
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

    // Reanalyze: TRUST the baseline sport the user explicitly picked.
    // The single-keyframe /detect-sport-vlm is flaky — it has misread a clear
    // basketball clip as "badminton (conf 1.00)", which then tripped a false
    // "sport mismatch" error and blocked the whole re-analysis (even though
    // analyzing the same clip standalone correctly returns basketball, because
    // the FULL universal analysis is reliable). So in compare mode we force the
    // baseline sport and no longer hard-block on the keyframe guess. The
    // universal pass still detects the true sport, and the comparison's
    // session_mismatch flag warns (reliably, post-analysis) if the two sessions
    // genuinely differ.
    if (reanalyzeContext?.sport) {
      sportToAnalyze = reanalyzeContext.sport;
    }

    // Universal AND Premium modes skip the MoveNet pre-scan — Gemini
    // identifies the sport AND the players itself in a single request.
    if (accuracyMode === "universal" || accuracyMode === "premium") {
      await runClientAnalysis(sportToAnalyze, null);
      return;
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
  const runClientAnalysis = async (sportToAnalyze, customCropBox, options = {}) => {
    setAnalyzing(true);
    setResult(null);
    setError(null);
    setProgress(0);
    setLiveShots([]);
    // A fresh analyze run is by definition NOT a historical view. The
    // localStorage-restore on mount can leave viewingHistorical=true
    // even when the user has loaded a new file — that turns videoFile
    // into null for MatchInsights → AutoProReferencePanel's YOU panel
    // shows "No preview available" despite a perfectly good upload.
    setViewingHistorical(false);

    // ─── Universal & Premium mode short-circuit ─────────────────────
    // Both modes use the same 2-pass flow (describe → pick → analyze);
    // Premium swaps Gemini Flash → Gemini 2.5 Pro for the analysis pass
    // by sending tier: "premium" to the endpoint. Costs 250 tokens vs
    // 100 for Standard/Universal.
    if (accuracyMode === "universal" || accuracyMode === "premium") {
      try {
        // If the picker already returned a selection (options.universalPick),
        // skip straight to the analysis call with the stored compressed
        // video. Otherwise: compress + describe players + show picker.
        let uploadFile, b64;
        // timeScale maps Gemini's timestamps (measured in the COMPRESSED
        // clip's time domain) back to the ORIGINAL clip the user views. It's
        // 1.0 unless we sped up capture for a big file (see below), in which
        // case the compressed clip is shorter and every event timestamp must
        // be multiplied by origDuration/compressedDuration before display.
        let timeScale = 1;
        if (options.universalPick && universalUploadData) {
          uploadFile = universalUploadData.uploadFile;
          b64 = universalUploadData.b64;
          timeScale = universalUploadData.timeScale || 1;
        } else {
          setLoadingText("Preparing video for Universal AI Coach...");
          setProgress(15);
          const vp = await import("@/ai/videoProcessor");
          // Compression preset: 540p / 1.0 Mbps keeps shuttle/ball visible
          // for shot identification while staying under Vercel's 4.5 MB
          // body cap for a 30s clip. Was 480p / 0.8 Mbps which lost too
          // much detail on personal phone-recorded clips.
          // Tighter compression: 480p / 0.8 Mbps / 20s. Cuts upload payload
          // and Gemini processing time by ~30-40% vs the previous 540p /
          // 1Mbps / 30s, which was the main reason Standard analyses hit
          // the 120s frontend timeout on mobile networks.
          // compressUnderSize retries with tighter rungs until output
          // fits the 4 MB Vercel body cap. Was throwing immediately on
          // any overshoot, which surfaced as "compressed video too large
          // (5.5 MB)" for moderately long phone clips. Now we step down
          // bitrate + dims + duration before giving up.
          // CRITICAL: target stays under Vercel's 4.5MB serverless cap.
          // /api/* on the custom domain routes through Vercel before
          // Railway — anything bigger gets 413'd at the edge. A previous
          // raise to 8MB caused exactly that on 4-8MB phone clips.
          //
          // Duration NOT capped here on purpose. Earlier code set
          // maxDurationSec to 20s (15s for >30MB) which silently cut
          // off the END of any longer video — users reported "Gemini
          // saw the preparation but not the actual shot" on basketball
          // clips where the action lands at second 22+. Now the full
          // clip up to 90s (compressVideoForUpload default) is encoded,
          // and the retry ladder drops bitrate/resolution to fit the
          // 4MB cap instead of trimming the back end.
          // Big-file speed-up: for sources over 30 MB, capture at 2x so the
          // real-time encode finishes in half the wall-clock time. This DOES
          // shorten the encoded clip's duration (it records in wall-clock),
          // so Gemini's timestamps come back in the sped-up domain — we undo
          // that below with timeScale (measured, not assumed). Small clips
          // stay at 1x (perfect frame fidelity, no scaling needed).
          // Heavy sources decode slowly client-side, so the real-time capture
          // is the bottleneck. Play them back faster so the encode finishes
          // sooner; timeScale (measured below) undoes the speed-up on Gemini's
          // timestamps, and the stall-based watchdog still guarantees the
          // COMPLETE clip is captured even if the decoder can't keep up at the
          // requested rate. Capped at 3x so we still capture >=4 content-fps
          // (Gemini's sampling floor) at captureStream's 20 wall-fps.
          const origMb = file.size / 1024 / 1024;
          const captureRate = origMb > 70 ? 3.0 : origMb > 30 ? 2.0 : 1.0;
          uploadFile = await vp.compressUnderSize(file, 4 * 1024 * 1024, {
            maxDim: 480, bitrate: 800_000,
            playbackRate: captureRate,
            onProgress: (pct) => { setLoadingText(`Compressing video... ${pct}%`); setProgress(15 + Math.round(pct * 0.15)); },
          });
          // Measure BOTH the original and compressed durations. timeScale is
          // derived from the actual measured ratio — robust even if the
          // browser capped playbackRate or fell back to the seek-loop (either
          // of which changes the real output duration). Also doubles as the
          // diagnostic: compare compressed duration to the response's
          // _debug.gemini_ts_max_sec to tell "Gemini stopped early" apart
          // from "compression cut the tail".
          const _measureDur = (blobOrFile) => new Promise((resolve) => {
            const v = document.createElement("video");
            v.preload = "metadata";
            v.muted = true;
            const objUrl = URL.createObjectURL(blobOrFile);
            const cleanup = () => { try { URL.revokeObjectURL(objUrl); } catch {} };
            v.onloadedmetadata = () => {
              const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null;
              cleanup();
              resolve(d);
            };
            v.onerror = () => { cleanup(); resolve(null); };
            v.src = objUrl;
            setTimeout(() => { cleanup(); resolve(null); }, 4000);
          });
          try {
            const [origDur, compDur] = await Promise.all([
              _measureDur(file),
              _measureDur(uploadFile),
            ]);
            if (origDur && compDur && origDur / compDur > 1.1) {
              // Clamp to [1, 4] so a bad measurement can't wildly mis-scale.
              timeScale = Math.min(4, Math.max(1, origDur / compDur));
            } else if (captureRate > 1) {
              // Measurement failed but we explicitly sped up — best estimate
              // is the rate we requested.
              timeScale = captureRate;
            }
            // eslint-disable-next-line no-console
            console.info(
              `[upload] compressed=${(uploadFile.size / 1024).toFixed(0)}KB, `
              + `duration=${compDur ? compDur.toFixed(1) + 's' : 'unknown'}, `
              + `original=${origMb.toFixed(1)}MB`
              + `${timeScale !== 1 ? `, timeScale=${timeScale.toFixed(2)}x (capture ${captureRate}x)` : ''}`,
            );
          } catch {
            /* noop — diagnostic only */
          }
          b64 = await fileToBase64(uploadFile);

          // Pass 1 — let Gemini identify the visible players (optional).
          // 25s cap (was 45s): this is just the player-PICKER pre-pass. On a
          // cold serverless start or a Gemini latency spike it would hang the
          // whole flow for 45s and then skip anyway — so fail fast and move
          // straight to analysis. The full analysis still identifies the
          // player itself (and doubles mode covers both near-court players),
          // so skipping the picker is a graceful degrade, not a failure.
          setLoadingText("AI Coach is spotting players (skips automatically if slow)...");
          setProgress(35);
          try {
            const { data: descData } = await api.post("/describe-players", {
              mime_type: uploadFile.type || file.type || "video/mp4",
              video_b64: b64,
            }, { timeout: 25000 });
            let players = (descData?.players || []).filter((p) => p.is_likely_athlete !== false);
            // Also extract a single mid-frame keyframe of the whole
            // video — used as the BACKGROUND of the player picker so
            // bboxes can be overlaid on it (the old MoveNet-style UI
            // worked great, just swap detection source to Gemini).
            let midFrame = null;
            if (players.length > 0) {
              try {
                const vp2 = await import("@/ai/videoProcessor");
                // Use an EARLY frame (1.5s in, or first 10% — whichever is
                // smaller) instead of mid-video. The describe-players prompt
                // tells Gemini to estimate bboxes at the EARLIEST frame
                // where every player is visible, so the rendered frame
                // needs to be near that same point or boxes look "off".
                // Mid-video frames showed players mid-rally, where they'd
                // moved 1-2m from where Gemini estimated the box.
                midFrame = await vp2.extractMidFrameKeyframe(file, {
                  maxDim: 720, jpegQuality: 0.8, atFraction: 0.08,
                });
                const seekSec = Math.min(1.5, (uploadFile.duration || 5) * 0.08);
                const bboxes = players.map((p) => p.bbox || null);
                const thumbs = await vp2.extractPlayerThumbnails(file, seekSec, bboxes, { maxDim: 96, jpegQuality: 0.75 });
                players = players.map((p, idx) => ({ ...p, thumbnail: thumbs[idx] || null }));
              } catch (thumbErr) {
                console.warn("[universal] keyframe extraction failed:", thumbErr?.message);
              }
            }
            if (players.length >= 2) {
              // Multiple athletes visible → show picker and pause.
              setUniversalUploadData({ uploadFile, b64, midFrame, timeScale });
              setUniversalPlayers(players);
              setAnalyzing(false);
              setProgress(0);
              // Persist the picker stage so a refresh / returning to the page
              // lands back here instead of losing the upload. The compressed
              // clip goes to IndexedDB (too big for localStorage); the player
              // list + midFrame go to localStorage.
              try {
                const vs = await import("@/lib/videoStore");
                await vs.saveVideo(uploadFile, 30 * 60 * 1000, INFLIGHT_VIDEO_KEY);
                localStorage.setItem(PICKER_SESSION_KEY, JSON.stringify({
                  players, midFrame, timeScale,
                  sport: sportToAnalyze || null,
                  savedAt: Date.now(),
                }));
              } catch { /* persistence is best-effort */ }
              // Ask for notify permission now so the "pick a player" nudge can
              // fire if the user wanders off before selecting.
              requestAnalysisNotifyPermission();
              return;
            }
            if (players.length === 1) {
              // Single athlete → auto-select, skip the picker.
              options = { ...options, universalPick: players[0] };
            }
          } catch (descErr) {
            // Description failed — proceed without target_player_description.
            console.warn("[universal] player description failed:", descErr?.response?.data?.detail || descErr.message);
          }
        }

        setLoadingText("AI Coach is watching the whole video...");
        setProgress(55);
        const targetDesc = options.universalPick
          ? `${options.universalPick.description} (${options.universalPick.clothing}, ${options.universalPick.court_position})`.replace(/\(\s*,\s*\)/g, "").trim()
          : null;
        // When the user explicitly PICKED one player from the multi-player
        // picker, analyze ONLY that player (doubles-both off) — otherwise a
        // doubles clip with 4 people would mix several players' shots into one
        // confusing list. doubles_mode stays on only when no specific player
        // was chosen (so a clip the user didn't disambiguate still covers both
        // near-court players).
        const effectiveDoubles = options.fromPicker ? false : doublesMode;
        // ─── Streaming-first path (premium tier only) ─────────────────
        // Default-enabled for premium: gets the user perceived progress
        // (uploaded / analyzing / per-shot badges) while Gemini is still
        // generating, instead of staring at a spinner for ~10-15s. The
        // base64-in-JSON fallback below runs untouched if either:
        //   - user opted out via ?stream=0
        //   - streaming throws for any reason (network, CORS, abort)
        const useStream = (
          accuracyMode === "premium"
          && new URLSearchParams(window.location.search).get("stream") !== "0"
          && typeof window.fetch === "function"
          && typeof FormData !== "undefined"
        );
        let data = null;
        let streamFailed = false;
        let streamTimedOut = false;

        // ─── Async job path (primary) ─────────────────────────────────
        // Submit the analysis as a background job and poll it. This frees the
        // user to leave the page / lock their phone — we persist the job id,
        // notify on completion, and resume on return — instead of pinning
        // them to a spinner for 1-3 min. Only if the SUBMIT itself fails
        // (network / older backend without the endpoint) do we fall through
        // to the streaming + JSON paths below.
        try {
          let pushEndpoint = null;
          try { pushEndpoint = localStorage.getItem("playsmart_push_endpoint"); } catch {}
          const submitResp = await api.post("/analyze-video-async", {
            mime_type: uploadFile.type || file.type || "video/mp4",
            video_b64: b64,
            target_player_description: targetDesc,
            tier: accuracyMode === "premium" ? "premium" : "standard",
            doubles_mode: effectiveDoubles,
            time_scale: timeScale,
            push_endpoint: pushEndpoint,
          }, { timeout: 45000 });
          const jobId = submitResp.data?.job_id;
          if (jobId) {
            try {
              localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({
                jobId, savedAt: Date.now(), targetDesc,
                pickedPlayer: options.universalPick || null,
              }));
            } catch { /* storage full / private mode — non-fatal */ }
            setAnalysisJobId(jobId);
            requestAnalysisNotifyPermission();
            setProgress(62);
            setLoadingText("Analysis started — you can leave this page; we'll notify you when it's ready.");
            data = await pollAnalysisJob(jobId);
          }
        } catch (asyncErr) {
          console.warn("[universal] async submit/poll failed, falling back:",
                       asyncErr?.response?.data?.detail || asyncErr?.message);
          // data stays null → streaming/JSON fallback runs below.
        }

        if (!data && useStream) {
          setLiveShots([]);
          try {
            const fd = new FormData();
            fd.append("video", uploadFile, uploadFile.name || "clip.mp4");
            fd.append("sport", sportToAnalyze || "badminton");
            fd.append("tier", "premium");
            if (targetDesc) fd.append("target_player_description", targetDesc);
            // Doubles flag forwarded to backend — flips the prompt to
            // analyse-both-near-court mode and tags each event with
            // player_role.
            if (effectiveDoubles) fd.append("doubles_mode", "true");
            // Tell the backend how to map Gemini's (possibly sped-up)
            // timestamps back to the original clip the user views.
            if (timeScale && timeScale !== 1) fd.append("time_scale", String(timeScale));
            const token = localStorage.getItem("playsmart_token");
            const baseUrl = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
            // NOTE: do NOT set Content-Type — fetch sets it (with the
            // multipart boundary) automatically when body is FormData.
            const resp = await fetch(`${baseUrl}/api/analyze-video-stream`, {
              method: "POST",
              body: fd,
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!resp.ok || !resp.body) {
              throw new Error(`stream_http_${resp.status}`);
            }
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let final = null;
            let streamErr = null;
            // Idle watchdog. The backend sends SSE keepalive frames
            // (`: keepalive\n\n`) ~every 2s while it's waiting on
            // Gemini, so under normal conditions reader.read() should
            // return well within this budget. On flaky mobile networks
            // the upstream connection can silently drop mid-stream
            // and reader.read() hangs forever — that surfaced to users
            // as "stuck at 78%". Racing each read against a 35s timer
            // lets us bail and fall through to the non-streaming
            // /analyze-video-universal call instead.
            const IDLE_TIMEOUT_MS = 35000;
            const readWithIdleTimeout = () => {
              return Promise.race([
                reader.read(),
                new Promise((_, reject) => {
                  setTimeout(
                    () => reject(new Error("stream_idle_timeout")),
                    IDLE_TIMEOUT_MS,
                  );
                }),
              ]);
            };
            outer: while (true) {
              const { done, value } = await readWithIdleTimeout();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              // Parse out every complete `data: <json>\n\n` frame.
              let nlIdx;
              while ((nlIdx = buf.indexOf("\n\n")) >= 0) {
                const frame = buf.slice(0, nlIdx);
                buf = buf.slice(nlIdx + 2);
                if (!frame.startsWith("data:")) continue; // comment / keepalive
                const jsonStr = frame.replace(/^data:\s*/, "").trim();
                if (!jsonStr) continue;
                let ev;
                try { ev = JSON.parse(jsonStr); } catch { continue; }
                const phase = ev?.phase;
                if (phase === "uploaded") {
                  setLoadingText(ev.msg || "Got your video...");
                  setProgress(60);
                } else if (phase === "analyzing") {
                  setLoadingText(ev.msg || "AI Coach is analyzing...");
                  setProgress(70);
                } else if (phase === "shot_detected" && ev.shot) {
                  setLiveShots((prev) => [...prev, ev.shot]);
                  const n = (ev.total_seen ?? (ev.index ?? 0) + 1);
                  const label = ev.shot.shot_label || ev.shot.shot_category || ev.shot.event_type || "Event";
                  const score = Math.round(((ev.shot.confidence ?? 0.7) * 100));
                  setLoadingText(`Shot ${n}: ${label} · ${score}`);
                  setProgress(Math.min(92, 75 + n * 2));
                } else if (phase === "complete") {
                  final = ev;
                } else if (phase === "error") {
                  streamErr = ev.msg || "stream_error";
                  break outer;
                }
              }
            }
            if (streamErr) throw new Error(streamErr);
            if (!final) throw new Error("stream_no_complete_event");
            // Reshape into the same `data` the non-streaming endpoint
            // returns so the universalResult builder below is unchanged.
            data = {
              sport_detected: final.sport_detected,
              summary: final.summary,
              overall_skill_level: final.overall_skill_level,
              // The multi-paragraph coach voice — rendered prominently at
              // the top of the analyze result so users see the same
              // Gemini-grade narrative they would in Gemini Studio.
              coach_narrative: final.coach_narrative || {},
              // Backend-side detection of "user picked Player A but
              // Gemini described Player B" — surfaces as an amber banner.
              target_mismatch_warning: final.target_mismatch_warning || null,
              events: final.events || final.shots || [],
              _meta: { ...(final._meta || {}), streamed: true },
            };
          } catch (streamExc) {
            const m = streamExc?.message || "";
            console.warn("[universal] stream failed, falling back to base64:", m);
            streamFailed = true;
            // Was a backend analysis timeout (Gemini genuinely slow on a
            // busy/doubles clip) — the JSON re-run hits the SAME Gemini
            // budget and would just double the wait. Flag it so we don't
            // pretend the re-run is quick.
            streamTimedOut = /timeout/i.test(m);
            data = null;
            setLiveShots([]);
          }
        }
        if (!data) {
          // The JSON fallback is a plain POST with no progress events, so the
          // bar would otherwise sit frozen at ~78% for the whole call. Set an
          // honest, moving message so the user knows it's still working and
          // shouldn't leave — this was the #1 confusion ("stuck, no idea if I
          // should wait").
          setProgress(80);
          setLoadingText(
            streamTimedOut
              ? "This clip is dense — finalizing the deep analysis. Busy doubles rallies can take 2-3 min. Keep this page open…"
              : "Finalizing analysis — almost there, keep this page open…",
          );
          const resp = await api.post("/analyze-video-universal", {
            mime_type: uploadFile.type || file.type || "video/mp4",
            video_b64: b64,
            target_player_description: targetDesc,
            tier: accuracyMode === "premium" ? "premium" : "standard",
            doubles_mode: effectiveDoubles,
            time_scale: timeScale,
            // Bumped to 210s so we don't false-fail when Gemini has a slow
            // moment on a dense clip. The backend caps Gemini at 180s and
            // returns 504 if it overruns — these are upper bounds for
            // upload + processing + transit combined.
          }, { timeout: accuracyMode === "premium" ? 210000 : 180000 });
          data = resp.data;
          if (streamFailed) {
            data._meta = { ...(data._meta || {}), stream_fallback: true };
          }
        }
        setProgress(95);
        setLoadingText("Building results...");
        const events = data?.events || [];
        // ZERO events = the analysis effectively FAILED (Gemini saw nothing
        // usable — usually a truncated upload, a network drop, or an unclear
        // clip). Do NOT fabricate a result: previously this still rendered a
        // fake score (~70) + "plateau" and saved it to history. Surface a
        // clear, actionable error instead and let the user retry. No charge
        // (the backend already skips billing on 0-event jobs).
        if (events.length === 0) {
          throw new Error(
            "We couldn't detect any shots in this clip. This usually means the upload was interrupted or the connection dropped — please check your network and try again."
          );
        }
        const universalResult = buildUniversalResult(data, targetDesc, options.universalPick);
        notifyAnalysisReady(universalResult.sport, events.length);
        // If the user navigated away mid-job, DON'T clear the persisted job
        // here — this poll resolved on an unmounted tree, so setResult is a
        // no-op and the result would be lost. Leave the breadcrumb so the
        // resume effect re-polls (Mongo still holds the finished result) when
        // they return. Only clear + show when we're still mounted.
        if (mountedRef.current) {
          setResult(universalResult);
          setProgress(100);
          setLoadingText("Complete!");
          try { localStorage.removeItem(ACTIVE_JOB_KEY); } catch {}
          setAnalysisJobId(null);
          // Persist to history + (if this was a Progress Review) run the
          // comparison. The universal path did NEITHER before — that's why
          // analyses never showed in Progress and comparisons never fired.
          // Save-only endpoint: no Gemini, no extra token charge.
          try {
            const { data: saved } = await api.post("/save-universal-analysis", {
              sport: universalResult.sport,
              skill_level: universalResult.skill_level,
              quick_summary: universalResult.quick_summary,
              coach_narrative: universalResult.coach_narrative,
              shots: (universalResult.shots || []).map(({ thumbnail, ...r }) => r),
            }, { timeout: 20000 });
            if (saved?.analysis_id && mountedRef.current) {
              setResult((prev) => (prev ? { ...prev, analysis_id: saved.analysis_id } : prev));
              if (Array.isArray(saved.new_badges) && saved.new_badges.length) {
                setTimeout(() => setNewBadge(saved.new_badges[0]), 1500);
              }
              try { loadHistory(); } catch {}
              // Progress Review: both analyses now exist server-side → compare.
              if (reanalyzeContext?.id) {
                fetchComparison(reanalyzeContext.id, saved.analysis_id);
              }
            }
          } catch (saveErr) {
            console.warn("[universal] history save failed:",
                         saveErr?.response?.data?.detail || saveErr?.message);
          }
        }
        toast.success(`Detected: ${universalResult.sport} — ${events.length} events analyzed`);
        setActiveTab("results");
        // Clear cached upload data so a follow-up run starts fresh.
        setUniversalPlayers(null);
        setUniversalUploadData(null);
      } catch (err) {
        const raw = err?.response?.data?.detail || err.message || "";
        const status = err?.response?.status;
        // Translate any failure into a clear, actionable on-screen message
        // (the user shouldn't see raw codes or a fake result).
        let msg;
        if (/couldn't detect any shots|no shots in this clip/i.test(raw)) {
          msg = raw; // already friendly (the 0-event case)
        } else if (status === 413 || status === 403 || /too large|413|compress.*large|overshoot/i.test(raw)) {
          msg = "That video was too large to upload. Record a shorter clip (~10–15s) or at a lower resolution (720p), then try again.";
        } else if (!status || /timeout|network|aborted|failed to fetch|50[234]|stream_idle|ping_failed/i.test(raw)) {
          msg = "Your analysis didn't go through — this is usually a network issue. Please check your connection and try again.";
        } else {
          msg = "Something went wrong analyzing this clip. Please try again.";
        }
        console.error("[universal] failed:", raw || msg);
        setError(msg);
        toast.error(msg.length > 100 ? msg.slice(0, 100) + "…" : msg);
        try { localStorage.removeItem(ACTIVE_JOB_KEY); } catch {}
        setAnalysisJobId(null);
      } finally {
        // If the user navigated away mid-job, leave the persisted job in
        // place so the resume effect can recover it; only the mounted path
        // clears it (above). Always release the spinner.
        setAnalyzing(false);
      }
      return;
    }

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

      // High-accuracy mode: fetch the whole-video classification from
      // Gemini in parallel with the on-device analysis. Results are merged
      // back below — Gemini's per-shot data overrides the on-device shot
      // type/reasoning/speed when available.
      let videoDirectShots = null;
      let videoDirectError = null;
      const videoDirectPromise = (accuracyMode === "video")
        ? (async () => {
            try {
              setLoadingText("Preparing video for AI Coach...");
              const t0 = Date.now();
              // 540p / 1.0 Mbps — preserves shuttle/ball detail for shot
              // identification on personal phone clips. Still fits Vercel's
              // 4.5 MB body limit for ~30s clips.
              const mod = await import("@/ai/videoProcessor");
              // Retry ladder: 540p/1Mbps → 540p/700k → 432p/500k → 360p/400k/24s.
              // Same fix as the universal/premium path — uncompressed
              // 5-12 MB phone clips no longer fail outright with
              // "compressed video still too large".
              let uploadFile;
              try {
                // 4MB target — Vercel edge cap. See universal-path
                // comment above. Duration not capped here on purpose:
                // we were silently trimming long clips and Gemini was
                // missing the back-end action.
                uploadFile = await mod.compressUnderSize(file, 4 * 1024 * 1024, {
                  maxDim: 540,
                  bitrate: 1_000_000,
                  onProgress: (pct) => setLoadingText(`Preparing video... ${pct}%`),
                });
              } catch (compErr) {
                videoDirectError = compErr.code === "COMPRESSION_OVERSHOOT"
                  ? compErr.message
                  : `Compression failed: ${compErr.message}`;
                return;
              }
              setLoadingText("Sending video to AI Coach for full analysis...");
              const b64 = await fileToBase64(uploadFile);
              console.info(`[video-direct] uploading ${(file.size / 1024).toFixed(0)} KB to Gemini...`);
              const { data } = await api.post("/analyze-video-direct", {
                sport: sportToAnalyze,
                target_player: targetPlayer,
                target_box: customCropBox || null,
                mime_type: uploadFile.type || file.type || "video/mp4",
                video_b64: b64,
              }, { timeout: 90000 });
              const ms = Date.now() - t0;
              videoDirectShots = data?.shots || [];
              console.info(`[video-direct] ${ms}ms — ${videoDirectShots.length} shots`,
                videoDirectShots.map((s) => `${s.shot_type}@${(s.confidence || 0).toFixed(2)}`).join(", "));
            } catch (e) {
              videoDirectError = e?.response?.data?.detail || e.message;
              console.warn("[video-direct] failed:", videoDirectError);
            }
          })()
        : Promise.resolve();

      const clientResult = await analyzeVideo(file, sportToAnalyze, {
        mode: analysisMode,
        targetPlayer,
        customCropBox,
        isMultiPlayer,
        // Skip the keyframe VLM call when whole-video mode is on — we'll
        // merge those results instead.
        vlmClassify: accuracyMode === "video" ? null : async (payload) => {
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

      // If high-accuracy mode was active, await the whole-video Gemini call
      // and REPLACE the heuristic shots[] with Gemini's. Each shot gets a
      // pose-derived thumbnail snapped to its timestamp_sec.
      if (accuracyMode === "video") {
        await videoDirectPromise;
        if (videoDirectShots && videoDirectShots.length > 0) {
          // Map video-direct shots to the shape the rest of the pipeline expects
          try {
            const vp = await import("@/ai/videoProcessor");
            // De-duplicate: a single physical shot's windup + contact +
            // follow-through can come back as multiple timestamps of the
            // SAME shot type within ~1-2 seconds. Collapse those into one
            // shot so the count and per-shot list reflect reality (this
            // was producing "5 backhands" from a single backhand swing).
            const sortedByTime = [...videoDirectShots].sort(
              (a, b) => (a.timestamp_sec || 0) - (b.timestamp_sec || 0)
            );
            const MERGE_WINDOW_SEC = 1.5;
            const dedupedShots = [];
            for (const s of sortedByTime) {
              const prev = dedupedShots[dedupedShots.length - 1];
              if (
                prev &&
                prev.shot_type === s.shot_type &&
                (s.timestamp_sec || 0) - (prev.timestamp_sec || 0) <= MERGE_WINDOW_SEC
              ) {
                // Same physical shot, different phase. Keep the higher-
                // confidence entry; prefer the longer reasoning.
                if ((s.confidence || 0) > (prev.confidence || 0)) {
                  const longerReason = (s.reasoning?.length || 0) > (prev.reasoning?.length || 0) ? s.reasoning : prev.reasoning;
                  Object.assign(prev, s, { reasoning: longerReason });
                }
              } else {
                dedupedShots.push({ ...s });
              }
            }
            if (dedupedShots.length < videoDirectShots.length) {
              console.info(`[video-direct] merged ${videoDirectShots.length} → ${dedupedShots.length} shots (de-duplicated phases of same swing)`);
            }
            const peakTimes = dedupedShots.map((s) => s.timestamp_sec || 0);
            // Always extract a snippet per shot — falls back to a
            // center-square crop when no player bbox is available so the
            // history card / shot list always renders a thumbnail.
            const snippets = await vp.extractPlayerSnippets(
              file, peakTimes, customCropBox,
              { maxDim: 180, jpegQuality: 0.7, expandFactor: 1.5 },
            );
            clientResult.shots = dedupedShots.map((s, i) => ({
              type: s.shot_type,
              name: (s.shot_type || "shot").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              confidence: s.confidence,
              timestamp: Math.round((s.timestamp_sec || 0) * 10) / 10,
              grade: s.confidence >= 0.7 ? "A" : s.confidence >= 0.5 ? "B" : "C",
              score: Math.round((s.confidence || 0) * 100),
              speed: null,  // backend can compute from power_level
              reasoning: s.reasoning || null,
              formFeedback: s.form_feedback || null,
              alternatives: s.alternatives || null,
              vlmSkill: s.estimated_skill || null,
              powerLevel: s.power_level || null,
              thumbnail: snippets[i] || null,
            }));
            clientResult.total_shots_detected = clientResult.shots.length;
            clientResult.multi_shot = clientResult.shots.length > 1;
            // Rebuild shot_distribution from the new shots so the Match
            // Summary card agrees with the per-shot list. Otherwise the
            // pre-VLM heuristic distribution stays visible (Forehand 1×
            // / 8%) while the per-shot section shows the real Gemini
            // tally (5 forehands etc.) — visibly inconsistent.
            const dist = {};
            for (const s of clientResult.shots) {
              if (s.type && s.type !== "unknown") {
                dist[s.type] = (dist[s.type] || 0) + 1;
              }
            }
            clientResult.shot_distribution = dist;
            clientResult._accuracy_mode = "video";
            console.info(`[video-direct] replaced ${clientResult.shots.length} shots from whole-video analysis`);
          } catch (mergeErr) {
            console.warn("[video-direct] merge failed, keeping keyframe shots:", mergeErr);
          }
        } else if (videoDirectError) {
          toast.error(`High-accuracy mode failed: ${videoDirectError.slice(0, 80)} — using keyframe results.`);
        }
      }

      // Send client results to backend for coaching enrichment.
      // Guests get ONE free analysis (gated above by guest_analysis_used flag);
      // their request goes through with no Authorization header → backend
      // skips token spend + DB save but still returns the enriched result.
      {
        setProgress(92);
        setLoadingText("Getting coaching feedback...");
        try {
          // Inline retry: /analyze-client-results occasionally 502/504s on
          // cold lambdas (VLM coaching + Mongo writes all squeezed into 60s).
          // Retry once before bailing — much better than throwing the user
          // to the error screen for a transient hiccup.
          const _postWithRetry = async (path, body, cfg) => {
            try {
              return await api.post(path, body, cfg);
            } catch (e) {
              const status = e?.response?.status;
              const retryable = !status || [502, 503, 504, 408].includes(status) || /timeout|network|aborted/i.test(e.message || "");
              if (!retryable) throw e;
              console.warn(`[${path}] failed (${status || e.message}) — retrying once...`);
              await new Promise((r) => setTimeout(r, 1500));
              return await api.post(path, body, cfg);
            }
          };
          const { data } = await _postWithRetry("/analyze-client-results", {
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
              // Instant wallet update from server's post-debit balance
              updateTokens?.(data.token_balance);
              const spent = data.tokens_spent;
              toast.success(spent
                ? `Analysis complete! 🪙 -${spent} tokens (balance: ${data.token_balance ?? "?"})`
                : "Analysis complete!"
              );
              if (data.new_badges?.length > 0) {
                setTimeout(() => setNewBadge(data.new_badges[0]), 1500);
              }
              // First-analysis-by-a-new-user nudge: offer auto-profile
              // or short quiz so the dashboard gets personalized.
              if (!profile && user) {
                setTimeout(() => setShowProfilePrompt(true), 1800);
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
      // Auto-retry once on transient failures — most analysis errors come
      // from Vercel cold-start timeouts, Gemini quota-hiccups, or Mongo
      // connection drops. A second attempt usually succeeds (the user has
      // told us they manually retry and it works).
      const isRetryable = /timeout|network|fetch|502|503|504|ECONN|aborted/i.test(msg);
      if (isRetryable && !options?._isRetry) {
        console.warn(`[analyze] failed (${msg}) — retrying once after 2s...`);
        toast.info("Hiccup — retrying automatically...");
        await new Promise((r) => setTimeout(r, 2000));
        setAnalyzing(false);
        return runClientAnalysis(sportToAnalyze, customCropBox, { ...options, _isRetry: true });
      }
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
    setViewingHistorical(false);

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
    setViewingHistorical(false);
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

      {/* Notify-me — at the top so users opt in before analyzing. Simple,
          one line + action. Analysis runs in the background; this is just
          how we ping them when it's done. */}
      {typeof window !== "undefined" && "Notification" in window && (
        <div className="mb-4 rounded-2xl border border-sky-400/30 bg-sky-400/5 p-3 sm:p-4 flex items-center gap-3">
          <Bell className="w-5 h-5 text-sky-400 shrink-0" strokeWidth={1.75} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Leave anytime — we'll ping you</p>
            <p className="text-[11px] text-zinc-400">
              {notifyPermission === "denied"
                ? "Notifications are blocked — enable them in settings to get pinged."
                : "We'll notify you when your report is ready. iPhone: add to Home Screen first."}
            </p>
          </div>
          {notifyPermission === "granted" ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-lime-400">
                <CheckCircle2 className="w-4 h-4" /> On
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { data } = await api.post("/reengagement/test");
                    console.info("[push-test]", data);
                    if (data?.sent) toast.success("Test notification sent — check your tray.");
                    else if (!data?.subscriptions) toast.error("This device isn't subscribed yet — toggle notifications off/on.");
                    else toast.error(`Send failed: ${(data?.results?.[0]?.detail || "unknown").slice(0, 90)}`);
                  } catch (e) {
                    toast.error("Test failed: " + (e?.response?.data?.detail || e.message));
                  }
                }}
                className="text-[11px] text-sky-300 hover:text-sky-200 underline underline-offset-2"
              >
                Send test
              </button>
            </div>
          ) : notifyPermission !== "denied" ? (
            <button type="button" onClick={requestAnalysisNotifyPermission}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-sky-400/15 hover:bg-sky-400/25 text-sky-200 border border-sky-400/30 transition-colors shrink-0">
              <Bell className="w-3 h-3" /> Notify me
            </button>
          ) : null}
        </div>
      )}

      {/* Reanalysis baseline banner — pinned above the loading panel
          when a reanalysis is in flight. Shows the previous analysis
          we're comparing against so the user understands the
          before/after relationship before any results come back. */}
      {analyzing && reanalyzeContext && (() => {
        const old = reanalyzeContext;
        const oldShot = old.shot_analysis || {};
        const oldScore = oldShot.score ?? old.pro_comparison?.overall_score ?? null;
        const oldSpeed = old.speed_analysis?.estimated_speed_kmh;
        const oldLevel = old.skill_level;
        const dateLabel = old.date
          ? new Date(old.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "previous";
        return (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-4 bg-sky-400/5 border border-sky-400/30 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[10px] uppercase tracking-wider text-sky-300 font-bold">
                Reanalysis in progress — comparing against {dateLabel}
              </p>
              <button
                onClick={() => { setReanalyzeContext(null); toast.info("Reanalysis dropped — running as fresh analysis"); }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                Cancel comparison
              </button>
            </div>
            <p className="text-xs text-zinc-400 mb-2">
              {(oldShot.shot_name || old.sport || "Previous")} baseline:
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-zinc-900/60 rounded-lg p-2.5">
                <p className="text-[10px] uppercase text-zinc-500">Score</p>
                <p className="text-base font-bold text-white">{oldScore != null ? `${oldScore}/100` : "—"}</p>
              </div>
              <div className="bg-zinc-900/60 rounded-lg p-2.5">
                <p className="text-[10px] uppercase text-zinc-500">Level</p>
                <p className="text-base font-bold text-white">{oldLevel || "—"}</p>
              </div>
              <div className="bg-zinc-900/60 rounded-lg p-2.5">
                <p className="text-[10px] uppercase text-zinc-500">Speed</p>
                <p className="text-base font-bold text-white">{oldSpeed ? `${Math.round(oldSpeed)} km/h` : "—"}</p>
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* Loading state pinned to top so user sees progress immediately */}
      {analyzing && (() => {
        const STAGES = [
          { key: "scan", label: "Scan", min: 0, max: 25 },
          { key: "analyze", label: "Analyze", min: 25, max: 70 },
          { key: "coach", label: "Coach", min: 70, max: 92 },
          { key: "save", label: "Save", min: 92, max: 100 },
        ];
        const activeStageIdx = STAGES.findIndex((s) => progress < s.max);
        const currentStage = activeStageIdx === -1 ? STAGES.length - 1 : activeStageIdx;
        const elapsed = loadingStartedAt ? Math.floor((Date.now() - loadingStartedAt) / 1000) : 0;
        return (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="mb-6 bg-zinc-900/80 border border-lime-400/30 rounded-2xl p-5 shadow-lg shadow-lime-400/10 overflow-hidden">
            {/* Header row: spinner + title + elapsed.
                Use a pure CSS animation (Tailwind animate-spin) instead of
                framer-motion: CSS runs on the compositor thread so the
                spinner keeps moving even when the main thread is busy with
                pose detection / keyframe extraction. */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 border-2 border-lime-400 border-t-transparent rounded-full flex-shrink-0 animate-spin"
                  style={{ animationDuration: "0.9s" }}
                />
                <div className="text-left">
                  <p className="font-heading font-semibold text-white uppercase tracking-tight text-sm leading-tight">
                    Analyzing your video
                  </p>
                  <motion.p
                    key={loadingText}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-zinc-300 text-xs mt-0.5"
                  >
                    {loadingText || "Getting started..."}
                  </motion.p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lime-400 text-sm font-mono font-bold tabular-nums">{Math.round(displayProgress)}%</p>
                <p className="text-zinc-500 text-[10px] tabular-nums">{elapsed}s elapsed</p>
              </div>
            </div>

            {/* "You can leave" banner — shown once the analysis is a queued
                background job. Reassures the user they don't have to wait. */}
            {analysisJobId && (
              <div className="mb-4 flex items-start gap-2 rounded-xl bg-lime-400/10 border border-lime-400/30 px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-lime-400 flex-shrink-0 mt-0.5" />
                <p className="text-lime-200/90 text-[11px] leading-snug">
                  Analysis is running in the background — <span className="font-semibold">you can leave this page or lock your phone.</span> We'll notify you and keep your result ready when it's done.
                </p>
              </div>
            )}

            {/* Pre-handoff phase (uploading on the phone) — this part runs in
                the browser and PAUSES if you background the app on iOS, so
                tell the user to stay until the green "you can leave" banner. */}
            {!analysisJobId && (
              <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-400/10 border border-amber-400/30 px-3 py-2">
                <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-amber-200/90 text-[11px] leading-snug">
                  Preparing your video on this device — <span className="font-semibold">please keep this page open until the green "you can leave" message appears.</span> After that, you can switch apps or lock your phone.
                </p>
              </div>
            )}

            {/* Progress bar with continuous shimmer overlay so it never looks frozen */}
            <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden mb-4">
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-lime-500 to-lime-400 rounded-full"
                style={{ width: `${displayProgress}%` }}
                transition={{ ease: "easeOut" }}
              />
              <motion.div
                className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ["-100%", "400%"] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                style={{ width: `${Math.max(displayProgress, 8)}%` }}
              />
            </div>

            {/* Stage indicator row */}
            <div className="flex items-center justify-between">
              {STAGES.map((stage, idx) => {
                const isDone = idx < currentStage;
                const isActive = idx === currentStage;
                return (
                  <div key={stage.key} className="flex-1 flex flex-col items-center gap-1.5 relative">
                    <div className="relative">
                      <motion.div
                        animate={isActive ? { scale: [1, 1.15, 1], opacity: [1, 0.6, 1] } : { scale: 1, opacity: 1 }}
                        transition={isActive ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : {}}
                        className={`w-2.5 h-2.5 rounded-full ${
                          isDone ? "bg-lime-400" : isActive ? "bg-lime-400 ring-2 ring-lime-400/30" : "bg-zinc-700"
                        }`}
                      />
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider ${
                      isDone || isActive ? "text-lime-400" : "text-zinc-600"
                    }`}>{stage.label}</span>
                    {idx < STAGES.length - 1 && (
                      <div className={`absolute top-1 left-[calc(50%+0.625rem)] right-[calc(-50%+0.625rem)] h-px ${
                        isDone ? "bg-lime-400/50" : "bg-zinc-700"
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Rotating subtle hint so the user always sees motion */}
            <motion.p
              key={loadingSubtext}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ duration: 0.5 }}
              className="text-center text-zinc-500 text-[11px] mt-3 italic"
            >
              {loadingSubtext || "Setting up..."}
            </motion.p>

            {elapsed > 25 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`text-center text-[10px] mt-2 ${elapsed > 90 ? "text-amber-400/80" : "text-zinc-600"}`}
              >
                {elapsed > 150
                  ? "Still working — busy doubles rallies are the slowest to analyze. It won't fail silently; please keep this page open."
                  : elapsed > 90
                  ? "Deep analysis of a dense clip can take up to 2-3 minutes. Hang tight — keep this page open and it'll finish on its own."
                  : "Longer videos take a bit more time — hang tight, this won't fail silently."}
              </motion.p>
            )}

            {/* Live shots strip — only shown when the streaming endpoint is
                feeding shots in incrementally. Each badge appears the moment
                Gemini emits the next event object. Cleared on next run. */}
            {liveShots.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                  Live shots ({liveShots.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {liveShots.map((s, i) => {
                    const label = s.shot_label || s.shot_category || s.event_type || "Event";
                    const score = Math.round(((s.confidence ?? 0.7) * 100));
                    return (
                      <motion.span
                        key={`live-${i}-${label}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="px-2 py-0.5 rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-300 text-[11px]"
                      >
                        {i + 1}. {label} · {score}
                      </motion.span>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        );
      })()}

      {/* Sport Selection — removed from upload UI. We auto-detect from the
          actual video frames and confirm in the Player Selection modal where
          the user can override if the detection is wrong. */}

      {/* Player Selection for Doubles */}
      {renderPlayerSelector()}

      {/* Upload area — moved to top per user feedback so the primary
          action is the first thing visible after the loading panel. */}
      <div
        ref={dropRef}
        onClick={() => fileRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="border-2 border-dashed border-zinc-700 rounded-2xl p-6 sm:p-8 text-center cursor-pointer hover:border-lime-400/50 hover:bg-lime-400/5 transition-all mb-4"
        data-testid="video-drop-zone"
      >
        <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 2, repeat: Infinity }}>
          <Upload className="w-10 h-10 text-lime-400 mx-auto mb-3" strokeWidth={1.5} />
        </motion.div>
        <p className="font-heading font-semibold text-base text-white uppercase tracking-tight mb-1">
          Drag & Drop Your Video
        </p>
        <p className="text-zinc-500 text-sm">or click to browse</p>
        <p className="text-zinc-600 text-xs mt-2">
          MP4, AVI, MOV &middot; up to a few minutes
        </p>
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
      </div>

      {/* Doubles toggle. ONLY shown before a file is picked / mid-flow
          — once analysis is running, the flag is locked in. Persists
          via localStorage so doubles players don't have to re-flip on
          every upload. */}
      {!analyzing && !result && (
        <div className="mb-3 flex items-center justify-between gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-white uppercase tracking-wide">
              Doubles match
            </p>
            <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">
              Analyse BOTH near-court players (you + partner) and tag each shot.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={doublesMode}
            aria-label="Doubles match toggle"
            onClick={() => setDoublesMode((v) => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              doublesMode ? "bg-lime-400" : "bg-zinc-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                doublesMode ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {/* File size warning */}
      {file && file.size > 100 * 1024 * 1024 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="mb-3 bg-amber-400/5 border border-amber-400/20 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400">Large file ({(file.size / (1024 * 1024)).toFixed(0)} MB). Upload may take longer.</p>
        </motion.div>
      )}

      {/* Selected file + analyze button */}
      {file && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
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
          <div className="mt-3 flex justify-end">
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

      {/* (Upload area + selected file moved to top of page, just below
          the loading state, so the primary action is reachable first.) */}

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
    // The static DRILL_LIBRARY / training-plan / pro-tip templates were
    // hand-curated for badminton & tennis. For other sports they render
    // nonsense like "Net Rally Challenge" on a cricket bowling clip. Gate
    // those static cards by sport so they only show where they're useful;
    // VLM coaching is fully sport-aware and always wins when present.
    const staticTemplatesSupported = ["badminton", "tennis"].includes(
      (result.sport || selectedSport || profile?.active_sport || "").toLowerCase()
    );
    // Historical analyses must be a FAITHFUL snapshot — never regenerate
    // drill / training-plan content from a static template at view time,
    // since that produces "Focus/Drill/Rest" placeholders that didn't
    // exist at the moment of analysis. Only render static templates for
    // FRESH analyses where no VLM coaching is available.
    const showStaticTemplates = !vlmCoachingActive && staticTemplatesSupported && !viewingHistorical;

    // Dominant shot type for the trend lookup — prefer top-level
    // shot_analysis.shot_type, fall back to most common in shots[].
    const trendSport = result.sport || selectedSport || profile?.active_sport || "";
    const dominantShotType = (() => {
      if (shot.shot_type) return shot.shot_type;
      const types = (result.shots || [])
        .map((s) => s?.type || s?.shot_type)
        .filter(Boolean);
      if (!types.length) return null;
      const counts = types.reduce((a, t) => { a[t] = (a[t] || 0) + 1; return a; }, {});
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    })();

    // Section nav for the scroller. Mounts ONLY when there's an actual
    // result with shots (mirrors the existing result?.shots?.length > 0
    // gates used throughout this page). The component itself filters
    // entries to only those whose id is mounted in the DOM, so missing
    // sub-sections (e.g. no Pro reference for any shot type) cleanly
    // drop off the rail.
    const analysisScrollerSections = result?.shots?.length > 0 ? [
      { id: "analysis-section-overview", label: "Overview", icon: Eye },
      { id: "analysis-section-player-detection", label: "Player Detection", icon: Users },
      { id: "analysis-section-shot-analysis", label: "Shot Analysis", icon: Target },
      { id: "analysis-section-rally-breakdown", label: "Rally Breakdown", icon: Film },
      { id: "analysis-section-tactical-mistakes", label: "Tactical Mistakes", icon: AlertCircle },
      { id: "analysis-section-improvement-areas", label: "Improvement Areas", icon: TrendingUp },
      { id: "analysis-section-coach-notes", label: "Coach Notes", icon: MessageCircle },
      { id: "analysis-section-pro-comparison", label: "Pro Comparison", icon: GitCompare },
      { id: "analysis-section-audio-coaching", label: "Audio Coaching", icon: Volume2 },
      { id: "analysis-section-metrics-dashboard", label: "Metrics Dashboard", icon: BarChart2 },
    ] : [];

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 md:pr-16 lg:pr-48">

        {/* Floating section nav (desktop/tablet right-rail or mobile
            bottom-sheet). Lives in `fixed` layout — invisible if the
            user has DevTools docked over the corner OR an extension
            overlay covering it. The in-flow QuickNav below is the
            always-visible fallback. */}
        {result?.shots?.length > 0 && (
          <AnalysisScroller sections={analysisScrollerSections} />
        )}

        {/* In-flow sticky quick-nav — always visible because it's part
            of the document flow, not `fixed` positioned. Sticks to the
            top of the viewport as the user scrolls past the hero. */}
        {result?.shots?.length > 0 && (
          <AnalysisQuickNav sections={analysisScrollerSections} />
        )}

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

        {/* YOUR PROGRESS — session-to-session trend tracking. Sits ABOVE
            the per-shot AI coach cards so users see their multi-session
            improvement before the single-clip breakdown. Hidden silently
            on auth-less / network-error / no-history cases. */}
        {trendSport && !viewingHistorical && (
          <ProgressTrendPanel
            sport={trendSport}
            shotType={dominantShotType}
            currentId={result.analysis_id}
          />
        )}

        {/* AI coach plan — VLM-personalized drills + equipment + 7-day plan,
            grounded in this analysis's actual weaknesses and per-shot reasoning. */}
        {(vlmCoaching.priority_drills?.length > 0
          || vlmCoaching.equipment_recommendations?.length > 0
          || vlmCoaching.seven_day_plan?.length > 0) && (
          <motion.div
            id="analysis-section-improvement-areas"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="border border-lime-400/30 bg-gradient-to-br from-lime-400/5 to-zinc-900/80 rounded-2xl p-5 scroll-mt-24">
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
                      {/* Explicit weakness link — surfaces WHY this drill
                          was picked from the catalog. Hidden when missing
                          so we don't show a generic-looking card. */}
                      {d.addresses_weakness && (
                        <div className="bg-amber-400/5 border border-amber-400/20 rounded px-2 py-1 mb-2">
                          <p className="text-[10px] uppercase tracking-wide text-amber-400 font-bold mb-0.5">Fixes</p>
                          <p className="text-xs text-amber-200/90">{d.addresses_weakness}</p>
                        </div>
                      )}
                      {d.why && <p className="text-xs text-lime-300/80 mb-1">→ {d.why}</p>}
                      {d.instructions && <p className="text-xs text-zinc-300">{d.instructions}</p>}
                      {d.equipment_needed?.length > 0 && (
                        <p className="text-[10px] text-zinc-500 mt-1">Need: {d.equipment_needed.join(", ")}</p>
                      )}
                      {d.video_url && (
                        <a href={d.video_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-lime-400 hover:text-lime-300 font-medium mt-2">
                          <Play className="w-3 h-3 fill-current" /> Watch drill
                          {d.video_channel && <span className="text-zinc-500"> · {d.video_channel}</span>}
                          <ArrowRight className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7-day plan moved to /training — keeps the analysis page
                focused on what happened in THIS clip. The training page
                has the full plan + checkbox tracking. */}
            {false && vlmCoaching.seven_day_plan?.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-amber-300 font-semibold mb-2">7-day plan</p>
                <div className="space-y-2">
                  {vlmCoaching.seven_day_plan.map((d, i) => {
                    const isRest = (d.label || "").toLowerCase() === "rest"
                      || /^active recovery|^rest/i.test(d.focus || "");
                    const tone = isRest
                      ? "border-zinc-700 bg-zinc-800/30"
                      : "border-amber-400/20 bg-amber-400/5";
                    const drillsDetailed = d.drills_detailed || (Array.isArray(d.drills) ? d.drills.map((n) => ({ name: n })) : []);
                    return (
                      <div key={`day-${i}`} className={`border ${tone} rounded-lg p-3`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Day {d.day}</span>
                            {d.label && (
                              <Badge className={`text-[9px] uppercase font-bold ${
                                isRest ? "bg-zinc-700 text-zinc-300 border-zinc-600"
                                  : (d.label || "").toLowerCase() === "review" ? "bg-purple-400/15 text-purple-300 border-purple-400/30"
                                  : "bg-amber-400/15 text-amber-300 border-amber-400/30"
                              }`}>{d.label}</Badge>
                            )}
                            {d.minutes ? <span className="text-[10px] text-zinc-500">{d.minutes} min</span> : null}
                          </div>
                        </div>
                        {d.title && <p className="text-sm font-semibold text-white">{d.title}</p>}
                        {d.focus && !isRest && (
                          <p className="text-[11px] text-amber-300/90 mt-0.5">→ Fixes: {d.focus}</p>
                        )}
                        {d.description && <p className="text-[11px] text-zinc-400 mt-1">{d.description}</p>}
                        {drillsDetailed.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {drillsDetailed.map((dr, j) => (
                              dr.url ? (
                                <a key={`pd-${j}`} href={dr.url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-lime-400 hover:text-lime-300 mr-3">
                                  <Play className="w-2.5 h-2.5 fill-current" /> {dr.name}
                                </a>
                              ) : (
                                <span key={`pd-${j}`} className="inline-block text-[11px] text-zinc-400 mr-3">• {dr.name}</span>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Equipment Recommendations — promoted to its own prominent
            card (was buried inside Coaching Insights). Each rec links to
            our marketplace / equipment catalog so users have a one-tap
            path from "this is what's holding me back" to "here's gear
            that helps". */}
        {vlmCoaching.equipment_recommendations?.length > 0 && (() => {
          const sportSlug = result.sport ? `?sport=${result.sport}` : "";
          return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="bg-zinc-900/80 border border-sky-400/30 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1">
                  <Target className="w-3 h-3 text-sky-400" /> Gear that fixes your weaknesses
                </p>
                <Badge className="bg-sky-400/10 text-sky-300 border-sky-400/30 text-[10px]">Personalized</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                {vlmCoaching.equipment_recommendations.map((eq, i) => {
                  const href = eq.item_id
                    ? `/marketplace?item=${encodeURIComponent(eq.item_id)}`
                    : `/equipment${sportSlug}`;
                  return (
                    <Link key={`eq-${i}`} to={href}
                      className="block bg-zinc-800/40 border border-zinc-800 hover:border-sky-400/40 rounded-xl p-3 transition-colors group">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-white leading-tight">{eq.name}</p>
                        <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-sky-400 transition-colors shrink-0 mt-0.5" />
                      </div>
                      {eq.addresses_weakness && (
                        <div className="bg-sky-400/5 border border-sky-400/20 rounded px-2 py-1 mb-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-sky-400 font-bold mb-0.5">Helps with</p>
                          <p className="text-[11px] text-sky-200/90">{eq.addresses_weakness}</p>
                        </div>
                      )}
                      {eq.why && <p className="text-[11px] text-zinc-400 leading-relaxed">{eq.why}</p>}
                    </Link>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-800/50">
                <Link to={`/equipment${sportSlug}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-sky-400 hover:text-sky-300">
                  Browse all {result.sport || ""} equipment <ArrowRight className="w-3 h-3" />
                </Link>
                <Link to="/marketplace"
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
                  Visit marketplace <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </motion.div>
          );
        })()}

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

        {/* Voice coach — auto-narrates the summary the moment results load,
            so it sits at the TOP. Browser TTS, zero cost; hidden on
            unsupported browsers. */}
        <div id="analysis-section-audio-coaching" className="scroll-mt-24 mb-4">
          <VoiceCoachButton result={result} narrative={null} />
        </div>

        {/* Universal-mode player detection card — replaces the old
            "Analyzing: …" banner with a richer, premium card that shows
            who was analyzed (thumbnail + ID + confidence) plus stat tiles
            and highlight tags derived client-side from result.shots and
            coach_narrative. */}
        {result._universal && (
          <div id="analysis-section-player-detection" className="scroll-mt-24">
            <PlayerDetectionCard
              result={result}
              sport={result.sport || "unknown"}
            />
          </div>
        )}

        {/* Player-pick mismatch banner — fires when the user selected
            Player A (e.g. "blue shirt, white shorts") but Gemini's
            coach read clearly describes Player B (e.g. "dark blue
            tshirt"). Shows the picked description + the conflicting
            phrases Gemini used so users aren't confused why the
            analysis describes a different person. Honest about what
            usually causes it (selected player partially out of frame,
            another athlete being more prominent on screen). */}
        {result?.target_mismatch_warning && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-amber-400/8 border border-amber-400/40 rounded-2xl p-4 mb-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center shrink-0">
                <span className="text-lg">⚠</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold leading-none mb-1">
                  Player-pick mismatch detected
                </p>
                <p className="text-sm text-white leading-snug">
                  {result.target_mismatch_warning.reason}
                </p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {result.target_mismatch_warning.picked && (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-sky-300 font-bold mb-1">You selected</p>
                      <p className="text-[12px] text-zinc-100 leading-snug">
                        {result.target_mismatch_warning.picked}
                      </p>
                    </div>
                  )}
                  {Array.isArray(result.target_mismatch_warning.detected_phrases)
                    && result.target_mismatch_warning.detected_phrases.length > 0 && (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold mb-1">Gemini described</p>
                      <p className="text-[12px] text-zinc-100 leading-snug capitalize">
                        {result.target_mismatch_warning.detected_phrases.join(" · ")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* Coach's full read — the Gemini-Studio-grade multi-paragraph
            narrative (intro / strengths / improvements / takeaway). This
            is the FIRST thing the user sees after the universal-mode
            banner so the rich coach voice is the lead, not buried under
            metric tiles. Renders nothing if Gemini returned empty. */}
        {result?.coach_narrative && (
          <div id="analysis-section-overview" className="scroll-mt-24">
            <CoachNarrativeCard narrative={result.coach_narrative} />
          </div>
        )}

        {/* Debug panel — visible with ?debug=1 or localStorage.playsmart_debug=true.
            Shows raw Gemini output + filtered/dropped event counts so
            "missing shots" can be triaged in-app. */}
        {result?.shots && (
          <GeminiDebugPanel result={result} />
        )}

        {/* ── Coach's read of the session — lead with a Gemini-style
            one-line summary + identified-shot chips so users can verify
            the AI got the basic shape right BEFORE scrolling through
            stats. Confidence-aware: opens "I watched ..." on high-conf
            sessions, "Looks like ..." on low-conf, "Best guess —" when
            we're really unsure. */}
        {result?.shots?.length > 0 && (
          <div id="analysis-section-coach-notes" className="scroll-mt-24">
            <SessionSummaryHero
              result={result}
              sport={result.sport || selectedSport || profile?.active_sport || "badminton"}
            />
          </div>
        )}

        {/* ── Match summary — moved here from below for at-a-glance read.
            Skill level + style + speed badges + shot distribution upfront.
            ONLY shown when at least one shot was confidently classified. */}
        {result.multi_shot && result.shots?.length > 1
          && (result.shots || []).some((s) => s.type && s.type !== "unknown" && (s.confidence ?? 0) >= 0.4) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
              <Film className="w-3 h-3 text-sky-400" /> Shot mix
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

        {/* Match Insights — renders for live AND historical analyses.
            When viewingHistorical, we have no video file but the saved
            shots[] is enough to surface AI Coach feedback + tiles. */}
        {(file || viewingHistorical) && result?.shots?.length > 0 && (
          <MatchInsights
            videoFile={viewingHistorical ? null : file}
            shots={result.shots}
            sport={result.sport || selectedSport || profile?.active_sport || "badminton"}
            playerPosition={targetPlayer || "auto"}
            fallbackSkillLevel={aiSkillLevel}
            videoInfo={result.video_info || null}
            // Cropped avatar of the player Gemini analyzed (from
            // /describe-players via universalPick.thumbnail). Each shot
            // card shows it next to the shot name so users have a
            // visual "this is who was analyzed" confirmation —
            // especially important on multi-player clips where the
            // target-pick can be subtle.
            targetPlayerThumbnail={result._target_player_thumbnail || null}
            targetPlayerDescription={result._target_player_description || null}
            // When PlayerDetectionCard renders above (universal mode),
            // it already shows the best-shot hero + 4 tiles +
            // match-metrics row. Hide them inside MatchInsights so
            // users don't see the same content twice.
            hideOverviewBlocks={!!result._universal}
          />
        )}

        {/* VS PRO REFERENCE — one collapsible card per distinct shot
            type. Data (pro_reference + biomechanical_comparison) is
            attached per-shot by the backend (/api/analyze-client-results
            → per-shot enrichment block + vlm_coaching.pro_comparisons),
            so this component does no network calls of its own. Renders
            below the existing Match Insights so per-shot detail comes
            BEFORE the coaching plan downstream. */}
        {result?.shots?.length > 0 && (
          <div id="analysis-section-pro-comparison" className="scroll-mt-24">
            <ProReferencePanel
              shots={result.shots}
              sport={result.sport || selectedSport || profile?.active_sport || "badminton"}
            />
          </div>
        )}

        {/* Removed: "Get personalized training" profile-setup nudge. The
            analyze result page is meant for analysis content; profile
            setup belongs in onboarding, not as a banner on every fresh
            analysis. Functionality preserved in /assessment for users
            who want it. */}

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
                    {aiSkillLevel || result.skill_level || "Unknown"}
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

        {/* Removed: "Welcome back" reminder banner — it cluttered the
            analyze result with onboarding-style content unrelated to
            the analysis at hand. The reminder timer in localStorage is
            still maintained so future surfaces (Dashboard) can use it. */}

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
        {/* Pro Tips uses the static template content — gated by sport so we
            don't show badminton-flavored tips on cricket/TT/pickleball.
            Player Match is sport-agnostic, so we still render the card if
            we have one even when Pro Tips is hidden. */}
        {((pro.pro_tips?.length > 0 && showStaticTemplates) || pro.player_match?.player) && gate(
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5" data-testid="pro-comparison-card">
            {pro.pro_tips?.length > 0 && showStaticTemplates && (
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

        {/* ── (e) 7-Day Training Plan — fully disabled on the analysis
            page. Users found it noise; the dedicated /training page has
            the same content + checkbox tracking. ── */}
        {false && showStaticTemplates && gate(
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

        {/* Removed: static "Drills For You" generic template cards
            (Dynamic Warm-Up Flow / Shadow Footwork Routine). They
            rendered alongside the personalized AI-coach drills and
            made the page feel cluttered. The AI-coach drills inside
            MatchInsights (`ImprovementCards` + the VLM priority
            drills block) cover the same need with shot-specific
            content tailored to THIS analysis. Static template
            rendering can be reinstated for offline/cold-start cases
            if needed — keep the contextualDrills compute in case a
            future use-case wants it. */}

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

        {/* Live two-way voice coach — browser STT + TTS, streaming Gemini
            reply grounded in this analysis. Renders only once we have
            actual shots to ground on (the floating pill is also gated
            inside the component, but we gate here too so the heavier
            recognizer setup isn't even mounted on empty results). */}
        {result?.shots?.length > 0 && (
          <LiveVoiceCoach
            result={result}
            onRequestReanalyze={() => {
              // Coach detected "wrong sport / wrong shots" — re-run the full
              // Gemini analysis on the same clip (fresh sport + shot detection).
              if (!file) { toast.error("Re-upload the clip so I can re-analyze it."); return; }
              try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
              analyze();
            }}
          />
        )}

        {/* Post-analysis feedback — rate accuracy (once per analysis) */}
        <AnalysisFeedback
          analysisId={result.analysis_id || result._analysis_id || null}
          sport={result.sport || result.sport_detected || selectedSport}
        />

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

  const renderHistory = () => {
    const SPORT_ICONS = { badminton: "🏸", tennis: "🎾", table_tennis: "🏓", pickleball: "⚡", cricket: "🏏", football: "⚽", swimming: "🏊" };
    const SPORT_LABELS = { badminton: "Badminton", tennis: "Tennis", table_tennis: "Table Tennis", pickleball: "Pickleball", cricket: "Cricket", football: "Football", swimming: "Swimming" };
    const availableSports = Array.from(new Set(history.map((a) => a.sport).filter(Boolean)));
    const selectedSport = historySportFilter || (availableSports.includes(profile?.active_sport) ? profile.active_sport : availableSports[0]) || null;
    const filteredHistory = selectedSport ? history.filter((a) => a.sport === selectedSport) : history;
    // Per-sport simple improvement stats (computed client-side from
    // filteredHistory). This replaces the cross-sport aggregate from the
    // backend which was the source of the baseless "speed increase" card.
    const scoredHistory = filteredHistory
      .filter((a) => a.shot_analysis?.score != null)
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstScore = scoredHistory[0]?.shot_analysis?.score;
    const lastScore = scoredHistory[scoredHistory.length - 1]?.shot_analysis?.score;
    const scoreDelta = (firstScore != null && lastScore != null) ? (lastScore - firstScore) : null;
    const bestScore = scoredHistory.length > 0 ? Math.max(...scoredHistory.map((a) => a.shot_analysis?.score || 0)) : null;

    return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {history.length === 0 ? (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
          <History className="w-10 h-10 text-zinc-600 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-zinc-500 text-sm">No previous analyses yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Upload a video to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">

          {/* Sport selector chips — keeps cross-sport progress from
              mixing, so a cricket bowling speed isn't compared against a
              badminton smash. */}
          {availableSports.length > 0 && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium mb-2 ml-1">View progress for</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {availableSports.map((s) => {
                  const count = history.filter((a) => a.sport === s).length;
                  const active = selectedSport === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setHistorySportFilter(s)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                        active
                          ? "bg-lime-400 text-black border-lime-400"
                          : "bg-zinc-800/50 text-zinc-300 border-zinc-700 hover:border-zinc-600"
                      }`}
                    >
                      <span>{SPORT_ICONS[s] || "🎯"}</span>
                      <span>{SPORT_LABELS[s] || s}</span>
                      <span className={`text-[10px] ${active ? "text-black/70" : "text-zinc-500"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Honest reanalysis guidance — explains the mechanism + the
              critical caveat about using your own videos. */}
          <div className="bg-sky-400/5 border border-sky-400/20 rounded-2xl p-4">
            <p className="text-xs text-sky-300 font-semibold mb-1 flex items-center gap-1">
              <Lightbulb className="w-3 h-3" /> How reanalysis works
            </p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Pick any past analysis, then upload a new clip of <span className="text-sky-300">yourself doing the same shot</span>.
              We remember the technique metrics from the previous video and the AI Coach compares the two — telling you exactly
              what improved, what regressed, and whether your drills paid off.
            </p>
            <p className="text-[10px] text-amber-400/80 mt-1.5">
              ⚠ For honest progress tracking, only reanalyze against your own videos. Comparing against someone else's clip won't reflect <em>your</em> growth.
            </p>
          </div>

          {/* If the selected sport has no records, show an explicit empty
              state instead of awkwardly hiding the list. */}
          {selectedSport && filteredHistory.length === 0 && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
              <span className="text-3xl block mb-2">{SPORT_ICONS[selectedSport] || "🎯"}</span>
              <p className="text-zinc-400 text-sm font-medium">No analyzed videos yet for {SPORT_LABELS[selectedSport] || selectedSport}.</p>
              <p className="text-zinc-600 text-xs mt-1">Upload a {SPORT_LABELS[selectedSport] || selectedSport} clip to start tracking progress in this sport.</p>
            </div>
          )}

          {/* Per-sport quick-stat card. Computed client-side from
              filteredHistory so the numbers are always honest. */}
          {filteredHistory.length > 0 && bestScore != null && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-zinc-900/80 border border-lime-400/20 rounded-2xl p-5">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-lime-400" /> {SPORT_LABELS[selectedSport] || "Your"} Progress
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] uppercase text-zinc-500 tracking-wide">Sessions</p>
                  <p className="text-2xl font-heading font-bold text-white">{filteredHistory.length}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-zinc-500 tracking-wide">Best score</p>
                  <p className="text-2xl font-heading font-bold text-lime-400">{bestScore}<span className="text-xs text-zinc-500">/100</span></p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-zinc-500 tracking-wide">Trend</p>
                  {scoreDelta != null && scoredHistory.length >= 2 ? (
                    <p className={`text-2xl font-heading font-bold ${scoreDelta > 0 ? "text-lime-400" : scoreDelta < 0 ? "text-red-400" : "text-zinc-400"}`}>
                      {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-500 mt-1">Need 2+ clips</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* The backend-aggregated improvement cards below mix data
              across all sports. They're only meaningful when the user has
              played a single sport — otherwise the "+X% speed" numbers
              compare apples to oranges. Hide them when the user has
              multiple sports in history. */}
          {availableSports.length <= 1 && filteredHistory.length >= 2 && improvementData?.coach_message && (
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

          {/* Per-Metric Improvements — cross-sport aggregate, hidden when
              user has multiple sports (would mix bowling speed vs smash). */}
          {availableSports.length <= 1 && improvementData?.metric_improvements?.length > 0 && (
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

          {/* Dimension Improvements — cross-sport aggregate, gated. */}
          {availableSports.length <= 1 && improvementData?.dimension_improvements?.length > 0 && (
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

          {/* Improvement Trend Chart — scoped to the selected sport. */}
          {filteredHistory.length >= 2 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 mb-4"
            >
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
                <BarChart3 className="w-3 h-3 text-lime-400" /> Score Trend
              </p>
              <div className="flex items-center gap-4">
                {filteredHistory.slice(-5).reverse().map((a, i, arr) => (
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

          {/* History List — scoped to selected sport */}
          {filteredHistory.map((a, i) => {
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
                    {/* Comparison badge only when there's an actual signed
                        movement. "0%" was rendering on cards where the
                        previous analysis didn't move the score either way,
                        which made every history card look broken. */}
                    {comparison && comparison.percentage != null && Math.abs(comparison.percentage) >= 1 && (
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
                {/* Resolved / new issue badges. Filter out:
                    (a) phrases that appear on BOTH sides of the diff
                        (Gemini contradicting itself — "Fixed X" + "New X"
                        produces a nonsensical pair on the same card),
                    (b) empty / trivially short phrases. */}
                {a.comparison && (a.comparison.resolved_issues?.length > 0 || a.comparison.new_issues?.length > 0) && (() => {
                  const norm = (s) => String(s || "").trim().toLowerCase();
                  const resolved = (a.comparison.resolved_issues || []).filter((x) => norm(x).length >= 6);
                  const emerged = (a.comparison.new_issues || []).filter((x) => norm(x).length >= 6);
                  const emergedSet = new Set(emerged.map(norm));
                  const resolvedSet = new Set(resolved.map(norm));
                  const cleanResolved = resolved.filter((x) => !emergedSet.has(norm(x)));
                  const cleanEmerged = emerged.filter((x) => !resolvedSet.has(norm(x)));
                  if (cleanResolved.length === 0 && cleanEmerged.length === 0) return null;
                  return (
                    <div className="mt-2 ml-13 flex flex-wrap gap-1">
                      {cleanResolved.map((issue, j) => (
                        <Badge key={`r-${j}`} className="bg-lime-400/5 text-lime-400/80 border-lime-400/10 text-[9px]">
                          <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Fixed: {issue}
                        </Badge>
                      ))}
                      {cleanEmerged.map((issue, j) => (
                        <Badge key={`n-${j}`} className="bg-amber-400/5 text-amber-400/80 border-amber-400/10 text-[9px]">
                          New: {issue}
                        </Badge>
                      ))}
                    </div>
                  );
                })()}
                {a.quick_summary && (
                  <p className="text-xs text-zinc-500 mt-2 ml-13 line-clamp-2">{a.quick_summary}</p>
                )}
                {/* Reanalyze CTA — on every history card (was 7-day-gated).
                    Lets the user pick any past analysis as the baseline and
                    upload a new clip to get a Gemini progress comparison. */}
                {(() => {
                  const ageDays = a.date ? Math.floor((Date.now() - new Date(a.date).getTime()) / 86_400_000) : 0;
                  return (
                    <div className="mt-3 ml-13 flex items-center gap-2 flex-wrap">
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
                        Reanalyze
                      </Button>
                      {ageDays > 0 && (
                        <span className="text-[10px] text-zinc-600">{ageDays} day{ageDays === 1 ? "" : "s"} ago</span>
                      )}
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
  };

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8" data-testid="analyze-page">
      <InsufficientTokensModal
        open={showInsufficientModal}
        onOpenChange={setShowInsufficientModal}
        balance={insufficientBalance}
        required={100}
      />
      {/* Reanalyze sport-mismatch guard. The user picked a baseline from
          one sport but uploaded a clip detected as a different sport;
          the cross-sport comparison would be meaningless so we ask
          before doing anything destructive. */}
      {/* Universal mode player picker — Gemini lists every visible
          athlete with a short description; user picks which one to
          analyze. Description goes into the next /analyze-video-universal
          call as target_player_description so Gemini anchors on the right
          person. */}
      {universalPlayers && universalPlayers.length > 0 && (() => {
        const onPick = (picked) => {
          // Prime notification permission within this tap (iOS gesture rule).
          requestAnalysisNotifyPermission();
          setUniversalPlayers(null);
          // Picker stage is done — the analysis job is about to be submitted
          // (which persists its own resumable job id).
          clearPickerSession();
          setAnalyzing(true);
          setProgress(50);
          runClientAnalysis(
            result?.sport || selectedSport || "unknown",
            null,
            { universalPick: picked, fromPicker: true },
          );
        };
        const BOX_COLORS = [
          { border: "border-lime-400", bg: "bg-lime-400/15", label: "bg-lime-400 text-black" },
          { border: "border-sky-400", bg: "bg-sky-400/15", label: "bg-sky-400 text-black" },
          { border: "border-purple-400", bg: "bg-purple-400/15", label: "bg-purple-400 text-black" },
          { border: "border-amber-400", bg: "bg-amber-400/15", label: "bg-amber-400 text-black" },
          { border: "border-pink-400", bg: "bg-pink-400/15", label: "bg-pink-400 text-black" },
          { border: "border-emerald-400", bg: "bg-emerald-400/15", label: "bg-emerald-400 text-black" },
        ];
        const midFrame = universalUploadData?.midFrame;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => { setUniversalPlayers(null); setUniversalUploadData(null); clearPickerSession(); }}>
            <div onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-2xl w-full max-h-[90vh] overflow-auto">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-lime-400" />
                <h3 className="font-heading font-bold text-lg text-white">
                  {universalPlayers.length} {universalPlayers.length === 1 ? "Player Detected" : "Players Detected"}
                </h3>
              </div>
              <p className="text-sm text-zinc-400 mb-1">
                Tap the player you want to analyze. We'll focus the AI Coach on them.
              </p>
              <p className="text-[11px] text-zinc-500 mb-2">
                Boxes are approximate — if one looks off, pick by clothing color or court position from the list below.
              </p>
              <div className="flex items-start gap-2 rounded-lg bg-lime-400/10 border border-lime-400/30 px-2.5 py-1.5 mb-4">
                <CheckCircle2 className="w-3.5 h-3.5 text-lime-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-lime-200/90 leading-snug">
                  Your upload is saved — you can leave and come back. We'll remind you to pick a player.
                </p>
              </div>

              {/* Full-frame keyframe with Gemini bboxes overlaid as
                  clickable buttons — same pattern as the old MoveNet
                  PlayerSelectionModal, just sourced from Gemini. */}
              {midFrame?.dataUrl ? (
                <div className="relative w-full bg-black rounded-xl overflow-hidden mb-4">
                  <img src={midFrame.dataUrl} alt="Video frame" className="w-full h-auto block" />
                  <div className="absolute inset-0">
                    {universalPlayers.map((p, idx) => {
                      const c = BOX_COLORS[idx % BOX_COLORS.length];
                      const b = p.bbox;
                      if (!b || !b.width || !b.height) return null;
                      return (
                        <button
                          key={p.id || idx}
                          onClick={() => onPick(p)}
                          className={`absolute border-2 rounded transition-all hover:scale-[1.02] ${c.border} ${c.bg} hover:shadow-lg`}
                          style={{
                            left: `${b.x * 100}%`,
                            top: `${b.y * 100}%`,
                            width: `${b.width * 100}%`,
                            height: `${b.height * 100}%`,
                          }}
                          aria-label={`Select ${p.description}`}
                          title={p.description}
                        >
                          <div className={`absolute -top-6 left-0 ${c.label} text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap`}>
                            Player {idx + 1}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Player rows — clickable description list, mirrors the
                  bbox colors so user can match box → description. Works
                  even when bbox extraction failed for one or more players. */}
              <div className="space-y-2 mb-4">
                {universalPlayers.map((p, idx) => {
                  const c = BOX_COLORS[idx % BOX_COLORS.length];
                  return (
                    <button
                      key={p.id || idx}
                      onClick={() => onPick(p)}
                      className={`w-full text-left bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 hover:${c.border} rounded-xl p-3 transition-colors`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`${c.label} text-sm font-bold px-2.5 py-1 rounded shrink-0`}>{idx + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium leading-snug">{p.description}</p>
                          {(p.clothing || p.court_position) && (
                            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                              {[p.clothing, p.court_position].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => { setUniversalPlayers(null); setUniversalUploadData(null); setAnalyzing(false); setProgress(0); clearPickerSession(); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onPick({ description: null })}
                  className="text-xs text-zinc-400 hover:text-white py-1.5"
                >
                  Skip — analyze whole video
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {reanalyzeMismatch && (() => {
        const SPORT_ICONS = { badminton: "🏸", tennis: "🎾", table_tennis: "🏓", pickleball: "⚡", cricket: "🏏", football: "⚽", swimming: "🏊" };
        const SPORT_LABELS = { badminton: "Badminton", tennis: "Tennis", table_tennis: "Table Tennis", pickleball: "Pickleball", cricket: "Cricket", football: "Football", swimming: "Swimming" };
        const m = reanalyzeMismatch;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setReanalyzeMismatch(null)}>
            <div onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-amber-500/10 via-zinc-900 to-zinc-950 border border-amber-400/40 rounded-3xl p-6 sm:p-7 max-w-md w-full relative">
              <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-2">Sport mismatch</p>
              <h2 className="font-heading font-black text-xl sm:text-2xl text-white tracking-tight mb-3">
                Can't compare across sports
              </h2>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 mb-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Baseline:</span>
                  <span className="text-white font-medium">
                    {SPORT_ICONS[m.oldSport] || "🎯"} {SPORT_LABELS[m.oldSport] || m.oldSport}
                    {m.oldShot && <span className="text-zinc-500"> · {m.oldShot}</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">New clip:</span>
                  <span className="text-white font-medium">
                    {SPORT_ICONS[m.newSport] || "🎯"} {SPORT_LABELS[m.newSport] || m.newSport}
                    {m.confidence != null && (
                      <span className="text-zinc-500 text-xs"> · {Math.round(m.confidence * 100)}% confident</span>
                    )}
                  </span>
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                Shuttle speed vs ball speed, smash vs forehand loop — these don't compare honestly.
                Your options:
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    // Continue as a fresh analysis (no comparison narrative).
                    setReanalyzeContext(null);
                    const mm = reanalyzeMismatch;
                    setReanalyzeMismatch(null);
                    toast.info(`Running as a fresh ${SPORT_LABELS[mm.newSport] || mm.newSport} analysis — no comparison.`);
                    setTimeout(() => analyze(), 100);
                  }}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-sm h-10"
                >
                  Continue without comparison (fresh {SPORT_LABELS[m.newSport] || m.newSport} analysis)
                </Button>
                <Button
                  onClick={() => {
                    // Cancel: keep the baseline, drop the file so the user
                    // can upload a matching-sport clip.
                    setFile(null);
                    setReanalyzeMismatch(null);
                    toast.info(`Upload a ${SPORT_LABELS[m.oldSport] || m.oldSport} clip to compare against your baseline.`);
                  }}
                  className="w-full bg-lime-400 hover:bg-lime-500 text-black font-bold text-sm h-10"
                >
                  Cancel — upload a {SPORT_LABELS[m.oldSport] || m.oldSport} clip instead
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* First-analysis profile prompt — fires when a logged-in user with no
          saved profile finishes their first analysis. */}
      <PostAnalysisProfilePrompt
        open={showProfilePrompt}
        onClose={() => setShowProfilePrompt(false)}
        analysisResult={result}
        onProfileSaved={() => {
          refreshProfile();
          toast.success("Profile saved — your dashboard is ready!");
        }}
        onTakeQuiz={() => navigate("/assessment")}
      />
    </div>
  );
}
