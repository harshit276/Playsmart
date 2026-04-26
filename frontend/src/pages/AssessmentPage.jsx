import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { invalidateMatching } from "@/lib/cachedFetch";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Zap, Feather, CircleDot, Target, Check,
  Waves, Trophy, Sparkles, Swords, Users, Heart, Smile, Shield,
  Flame, Dumbbell, Star, GraduationCap, Phone, X, Clock, RefreshCw,
  Brain, BookOpen, Crosshair, BarChart3, User
} from "lucide-react";
import api from "@/lib/api";

// Sport icons mapping - expanded for 6 sports
const SPORT_ICONS = {
  Feather, CircleDot, Target, Zap, Waves, Trophy,
  badminton: Feather,
  table_tennis: CircleDot,
  swimming: Waves,
  cricket: Trophy,
  pickleball: Target,
  football: Zap,
};

const SPORT_COLORS = {
  lime: "border-lime-400/50 bg-lime-400/5 shadow-[0_0_15px_rgba(190,242,100,0.15)]",
  sky: "border-sky-400/50 bg-sky-400/5 shadow-[0_0_15px_rgba(56,189,248,0.15)]",
  amber: "border-amber-400/50 bg-amber-400/5 shadow-[0_0_15px_rgba(251,191,36,0.15)]",
  emerald: "border-emerald-400/50 bg-emerald-400/5 shadow-[0_0_15px_rgba(52,211,153,0.15)]",
  blue: "border-blue-400/50 bg-blue-400/5 shadow-[0_0_15px_rgba(96,165,250,0.15)]",
  green: "border-green-400/50 bg-green-400/5 shadow-[0_0_15px_rgba(74,222,128,0.15)]",
  orange: "border-orange-400/50 bg-orange-400/5 shadow-[0_0_15px_rgba(251,146,60,0.15)]",
};
const SPORT_TEXT = {
  lime: "text-lime-400", sky: "text-sky-400", amber: "text-amber-400",
  emerald: "text-emerald-400", blue: "text-blue-400", green: "text-green-400",
  orange: "text-orange-400",
};
const SPORT_RING = {
  lime: "ring-lime-400", sky: "ring-sky-400", amber: "ring-amber-400",
  emerald: "ring-emerald-400", blue: "ring-blue-400", green: "ring-green-400",
  orange: "ring-orange-400",
};

// Fallback sports when API doesn't return all 6
const FALLBACK_SPORTS = [
  { key: "badminton", name: "Badminton", icon: "Feather", color: "lime", video_analysis: true,
    skill_levels: [
      { value: "Beginner", label: "Beginner", desc: "Just started or learning basics" },
      { value: "Intermediate", label: "Intermediate", desc: "Know the rules, working on technique" },
      { value: "Advanced", label: "Advanced", desc: "Competitive player with solid skills" },
      { value: "Elite", label: "Elite", desc: "Tournament-level or professional" },
    ],
    play_styles: [
      { value: "Aggressive", label: "Aggressive", desc: "Attack-first, power play" },
      { value: "Defensive", label: "Defensive", desc: "Patient, wait for mistakes" },
      { value: "All-Round", label: "All-Round", desc: "Balanced mix of attack and defense" },
      { value: "Deceptive", label: "Deceptive", desc: "Trick shots and placement" },
    ]},
  { key: "table_tennis", name: "Table Tennis", icon: "CircleDot", color: "sky", video_analysis: true,
    skill_levels: [
      { value: "Beginner", label: "Beginner", desc: "Just started playing" },
      { value: "Intermediate", label: "Intermediate", desc: "Consistent rallies, learning spins" },
      { value: "Advanced", label: "Advanced", desc: "Strong spin game, competitive" },
      { value: "Elite", label: "Elite", desc: "Tournament-level player" },
    ],
    play_styles: [
      { value: "Offensive", label: "Offensive", desc: "Loop and attack focused" },
      { value: "Defensive", label: "Defensive", desc: "Chop and block focused" },
      { value: "All-Round", label: "All-Round", desc: "Balanced approach" },
      { value: "Penholder", label: "Penholder", desc: "Quick wrist-based play" },
    ]},
  { key: "swimming", name: "Swimming", icon: "Waves", color: "blue", video_analysis: false,
    skill_levels: [
      { value: "Beginner", label: "Beginner", desc: "Learning basic strokes" },
      { value: "Intermediate", label: "Intermediate", desc: "Can swim multiple strokes" },
      { value: "Advanced", label: "Advanced", desc: "Training for competition" },
      { value: "Elite", label: "Elite", desc: "Competitive swimmer" },
    ],
    play_styles: [
      { value: "Sprint", label: "Sprinter", desc: "Short distance, explosive speed" },
      { value: "Distance", label: "Distance", desc: "Long distance endurance" },
      { value: "IM", label: "Individual Medley", desc: "All four strokes" },
      { value: "Technique", label: "Technique Focus", desc: "Form and efficiency first" },
    ]},
  { key: "cricket", name: "Cricket", icon: "Trophy", color: "green", video_analysis: false,
    skill_levels: [
      { value: "Beginner", label: "Beginner", desc: "Gully cricket and learning" },
      { value: "Intermediate", label: "Intermediate", desc: "Club-level player" },
      { value: "Advanced", label: "Advanced", desc: "District or state level" },
      { value: "Elite", label: "Elite", desc: "Professional / first class" },
    ],
    play_styles: [
      { value: "Batsman", label: "Batsman", desc: "Primary focus on batting" },
      { value: "Bowler", label: "Bowler", desc: "Primary focus on bowling" },
      { value: "All-Rounder", label: "All-Rounder", desc: "Both batting and bowling" },
      { value: "Keeper", label: "Wicket Keeper", desc: "Behind the stumps" },
    ]},
  { key: "pickleball", name: "Pickleball", icon: "Target", color: "emerald", video_analysis: true,
    skill_levels: [
      { value: "Beginner", label: "Beginner", desc: "New to pickleball" },
      { value: "Intermediate", label: "Intermediate", desc: "Consistent dinks and drives" },
      { value: "Advanced", label: "Advanced", desc: "Tournament player" },
      { value: "Elite", label: "Elite", desc: "Pro-level competitor" },
    ],
    play_styles: [
      { value: "Power", label: "Power Player", desc: "Hard drives and slams" },
      { value: "Dink", label: "Dink Specialist", desc: "Soft game at the net" },
      { value: "All-Court", label: "All-Court", desc: "Versatile, adapts to opponent" },
      { value: "Strategic", label: "Strategic", desc: "Shot placement and patience" },
    ]},
  { key: "football", name: "Football", icon: "Zap", color: "orange", video_analysis: false,
    skill_levels: [
      { value: "Beginner", label: "Beginner", desc: "Casual player" },
      { value: "Intermediate", label: "Intermediate", desc: "Regular in local leagues" },
      { value: "Advanced", label: "Advanced", desc: "Competitive / club level" },
      { value: "Elite", label: "Elite", desc: "Professional level" },
    ],
    play_styles: [
      { value: "Forward", label: "Forward", desc: "Goal scoring focus" },
      { value: "Midfielder", label: "Midfielder", desc: "Playmaker and link-up play" },
      { value: "Defender", label: "Defender", desc: "Solid at the back" },
      { value: "Goalkeeper", label: "Goalkeeper", desc: "Last line of defense" },
    ]},
];

// Goals for multi-select
const GOALS = [
  { value: "improve_technique", label: "Improve Technique", icon: Target, desc: "Refine your skills and form" },
  { value: "win_matches", label: "Win More Matches", icon: Trophy, desc: "Competitive edge and strategy" },
  { value: "get_fit", label: "Get Fit", icon: Dumbbell, desc: "Use sport for fitness goals" },
  { value: "learn_new", label: "Learn New Sport", icon: GraduationCap, desc: "Pick up a new sport from scratch" },
  { value: "have_fun", label: "Have Fun", icon: Smile, desc: "Enjoy and destress through play" },
  { value: "prevent_injuries", label: "Prevent Injuries", icon: Shield, desc: "Stay healthy and avoid setbacks" },
  { value: "join_community", label: "Join Community", icon: Users, desc: "Meet people and play together" },
  { value: "compete_pro", label: "Compete Professionally", icon: Flame, desc: "Train for tournaments and rankings" },
];

// Play style personality quiz
const QUIZ_QUESTIONS = [
  {
    question: "Do you prefer power or finesse?",
    options: [
      { value: "power", label: "Power", desc: "I want to dominate with force", icon: Zap },
      { value: "finesse", label: "Finesse", desc: "I prefer precision and touch", icon: Feather },
    ],
  },
  {
    question: "Attack first or wait for mistakes?",
    options: [
      { value: "attack", label: "Attack First", desc: "I take the initiative", icon: Swords },
      { value: "counter", label: "Wait & Counter", desc: "I exploit opponent errors", icon: Shield },
    ],
  },
  {
    question: "What do you struggle with most?",
    options: [
      { value: "footwork", label: "Footwork", desc: "Movement and court coverage", icon: Zap },
      { value: "power", label: "Power", desc: "Not enough pace on my shots", icon: Flame },
      { value: "consistency", label: "Consistency", desc: "Too many unforced errors", icon: Target },
      { value: "strategy", label: "Strategy", desc: "Reading the game and tactics", icon: Brain },
      { value: "fitness", label: "Fitness", desc: "Stamina and endurance", icon: Dumbbell },
    ],
  },
  {
    question: "How do you prefer to train?",
    options: [
      { value: "structured", label: "Structured Plans", desc: "Follow a program step by step", icon: BookOpen },
      { value: "free_practice", label: "Free Practice", desc: "Hit around and figure it out", icon: Sparkles },
      { value: "with_coach", label: "With a Coach", desc: "Guided sessions and feedback", icon: GraduationCap },
      { value: "solo_drills", label: "Solo Drills", desc: "Independent focused practice", icon: User },
    ],
  },
  {
    question: "Do you play in tournaments?",
    options: [
      { value: "no", label: "No", desc: "Just recreational play", icon: Smile },
      { value: "local", label: "Local", desc: "Club and local events", icon: Star },
      { value: "district", label: "District", desc: "District-level competitions", icon: Trophy },
      { value: "state_plus", label: "State+", desc: "State, national, or higher", icon: Flame },
    ],
  },
];

// Shared questions (same for all sports)
const SHARED_STEPS = [
  { key: "playing_frequency", title: "How Often Do You Play?", subtitle: "Frequency affects equipment durability needs.",
    options: [
      { value: "1-2 days/week", label: "1-2 days/week", desc: "Casual / recreational" },
      { value: "3-4 days/week", label: "3-4 days/week", desc: "Regular player" },
      { value: "5-7 days/week", label: "5-7 days/week", desc: "Serious / competitive" },
    ]},
  { key: "budget_range", title: "What's Your Budget?", subtitle: "We'll find the best value at every price point.",
    options: [
      { value: "Low", label: "Budget Friendly", desc: "Under Rs.3,000" },
      { value: "Medium", label: "Mid Range", desc: "Rs.3,000 - Rs.8,000" },
      { value: "High", label: "Performance", desc: "Rs.8,000 - Rs.15,000" },
      { value: "Premium", label: "Premium", desc: "Rs.15,000+" },
    ]},
  { key: "primary_goal", title: "What's Your Main Goal?", subtitle: "This shapes your training and equipment priority.",
    options: [
      { value: "Power", label: "More Power", desc: "Harder shots, stronger attacks" },
      { value: "Speed", label: "More Speed", desc: "Faster movement and reactions" },
      { value: "Control", label: "Better Control", desc: "Precise placement and accuracy" },
      { value: "Consistency", label: "Consistency", desc: "Fewer errors, reliable play" },
      { value: "Defense", label: "Better Defense", desc: "Solid returns under pressure" },
    ]},
  { key: "injury_history", title: "Any Injury Concerns?", subtitle: "We'll avoid equipment that could aggravate injuries.",
    options: [
      { value: "none", label: "None", desc: "No current injuries" },
      { value: "elbow", label: "Elbow / Tennis Elbow", desc: "Joint or tendon pain" },
      { value: "shoulder", label: "Shoulder", desc: "Rotator cuff or shoulder pain" },
      { value: "wrist", label: "Wrist", desc: "Wrist strain or sprain" },
      { value: "knee", label: "Knee", desc: "Knee joint issues" },
    ]},
];

const OTP_EXPIRY_SECONDS = 300;

const normalizePhone = (raw) => {
  const digits = raw.replace(/[^0-9+]/g, "");
  if (/^\d{10}$/.test(digits)) return "+91" + digits;
  if (/^91\d{10}$/.test(digits)) return "+" + digits;
  if (digits.startsWith("+")) return digits;
  return digits;
};

const isValidPhone = (phone) => {
  const normalized = normalizePhone(phone);
  if (/^\+91\d{10}$/.test(normalized)) return true;
  if (/^\+\d{7,15}$/.test(normalized)) return true;
  return false;
};

const slideVariants = {
  enter: (direction) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
};

function derivePlayStyle(quizAnswers) {
  const { q0, q1 } = quizAnswers;
  if (q0 === "power" && q1 === "attack") return "Aggressive Attacker";
  if (q0 === "power" && q1 === "counter") return "Power Counter-Puncher";
  if (q0 === "finesse" && q1 === "attack") return "Crafty Attacker";
  if (q0 === "finesse" && q1 === "counter") return "Patient Strategist";
  return "All-Rounder";
}

export default function AssessmentPage() {
  const [sports, setSports] = useState([]);
  const [selectedSports, setSelectedSports] = useState([]);
  // phases: "sports" | "per_sport" | "intro" | "goals" | "quiz" | "shared" | "summary"
  const [phase, setPhase] = useState("sports");
  const [currentSportIdx, setCurrentSportIdx] = useState(0);
  const [currentSharedStep, setCurrentSharedStep] = useState(0);
  const [sportsProfiles, setSportsProfiles] = useState({});
  const [perSportStep, setPerSportStep] = useState(0);
  const [sharedAnswers, setSharedAnswers] = useState({});
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [currentQuizQ, setCurrentQuizQ] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingSports, setLoadingSports] = useState(true);
  const [direction, setDirection] = useState(1);
  // Login modal state (for unauthenticated users after quiz)
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginStep, setLoginStep] = useState("phone"); // phone | otp
  const [loginPhone, setLoginPhone] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [loginOtpHint, setLoginOtpHint] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginSecondsLeft, setLoginSecondsLeft] = useState(0);
  const otpRefs = useRef([]);
  const { refreshProfile, isAuthenticated, login } = useAuth();
  const navigate = useNavigate();

  // Render immediately with FALLBACK_SPORTS — don't block the user on
  // /api/sports (serverless cold start can be 10+s). If the API responds,
  // merge in any extras; if it doesn't, the fallback is already live.
  useEffect(() => {
    setSports(FALLBACK_SPORTS);
    setLoadingSports(false);
    api.get("/sports", { timeout: 6000 }).then(r => {
      const apiSports = r.data?.sports || [];
      if (apiSports.length) {
        const sportKeys = new Set(apiSports.map(s => s.key));
        const merged = [...apiSports];
        FALLBACK_SPORTS.forEach(fb => {
          if (!sportKeys.has(fb.key)) merged.push(fb);
        });
        setSports(merged);
      }
    }).catch(() => {});
  }, []);

  // Login modal countdown timer
  useEffect(() => {
    if (loginSecondsLeft <= 0) return;
    const timer = setInterval(() => {
      setLoginSecondsLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loginSecondsLeft]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Build the profile payload (reusable)
  const buildProfilePayload = () => {
    const playStylePersonality = derivePlayStyle(quizAnswers);
    return {
      selected_sports: selectedSports,
      sports_profiles: sportsProfiles,
      goals: selectedGoals,
      play_style_personality: playStylePersonality,
      quiz_answers: quizAnswers,
      ...sharedAnswers,
    };
  };

  // Save profile and navigate to dashboard
  const saveProfileAndRedirect = async () => {
    setLoading(true);
    try {
      await api.post("/profile", buildProfilePayload(), { timeout: 10000 });
      await refreshProfile();
      // Profile changed → all profile-derived recommendations are stale.
      // Drop their caches so the dashboard / training / equipment fetch
      // fresh data with the new skill_level + play_style + budget.
      invalidateMatching((k) => k.includes("/recommendations/") || k.includes("/badges/") || k.includes("/progress/") || k.startsWith("/tokens/"));
      // If they arrived via ?ref=CODE, redeem it. Server credits both
      // sides on the new user's first analysis (background settle).
      const refCode = new URLSearchParams(window.location.search).get("ref");
      if (refCode) {
        try {
          await api.post("/tokens/redeem-referral", { code: refCode }, { timeout: 5000 });
        } catch (e) { /* invalid code or already redeemed — silent */ }
      }
      toast.success("Profile created! Let's see your recommendations.");
    } catch (err) {
      console.warn("Profile save failed, continuing anyway:", err);
      toast.info("Profile will sync later. Enjoy exploring!");
    }
    navigate("/dashboard");
    setLoading(false);
  };

  // Login modal handlers
  const handleLoginSendOTP = async (e) => {
    e.preventDefault();
    if (!isValidPhone(loginPhone)) {
      toast.error("Enter a valid mobile number");
      return;
    }
    setLoginLoading(true);
    try {
      const normalized = normalizePhone(loginPhone.trim());
      const { data } = await api.post("/auth/send-otp", { phone: normalized });
      setLoginOtpHint(data.otp_hint || "");
      setLoginSecondsLeft(data.expires_in || OTP_EXPIRY_SECONDS);
      setLoginStep("otp");
      toast.success("OTP sent!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send OTP");
    }
    setLoginLoading(false);
  };

  const handleLoginResendOTP = async () => {
    setLoginLoading(true);
    setLoginOtp("");
    try {
      const normalized = normalizePhone(loginPhone.trim());
      const { data } = await api.post("/auth/send-otp", { phone: normalized });
      setLoginOtpHint(data.otp_hint || "");
      setLoginSecondsLeft(data.expires_in || OTP_EXPIRY_SECONDS);
      toast.success("New OTP sent!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to resend OTP");
    }
    setLoginLoading(false);
  };

  const handleLoginVerifyOTP = async (otpValue) => {
    const code = otpValue || loginOtp;
    if (code.length !== 6) { toast.error("Enter 6-digit OTP"); return; }
    setLoginLoading(true);
    try {
      const normalized = normalizePhone(loginPhone.trim());
      const { data } = await api.post("/auth/verify-otp", { phone: normalized, otp: code });
      login(data.token, data.user, data.has_profile);
      toast.success("Logged in! Saving your profile...");
      setShowLoginModal(false);
      // Now save profile and redirect
      try {
        await api.post("/profile", buildProfilePayload(), { timeout: 10000 });
        await refreshProfile();
        toast.success("Profile created! Let's see your recommendations.");
      } catch (profileErr) {
        console.warn("Profile save failed, continuing:", profileErr);
        toast.info("Profile will sync later. Enjoy exploring!");
      }
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid OTP");
    }
    setLoginLoading(false);
  };

  const handleLoginOtpDigit = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const digits = loginOtp.split("");
    while (digits.length < 6) digits.push("");
    digits[index] = value;
    const newOtp = digits.join("");
    setLoginOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (newOtp.length === 6 && /^\d{6}$/.test(newOtp)) {
      handleLoginVerifyOTP(newOtp);
    }
  };

  const handleLoginOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !loginOtp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleLoginOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    setLoginOtp(pasted);
    if (pasted.length === 6) handleLoginVerifyOTP(pasted);
  };

  // Total steps for progress bar (3 per sport: skill_level, play_style, play_format)
  const perSportSteps = selectedSports.length * 3;
  const totalSteps = 1 + perSportSteps + 1 + 1 + QUIZ_QUESTIONS.length + SHARED_STEPS.length + 1; // sports + per_sport + intro + goals + quiz + shared + summary
  const currentStepNum =
    phase === "sports" ? 1 :
    phase === "per_sport" ? 2 + (currentSportIdx * 3) + perSportStep :
    phase === "intro" ? 2 + perSportSteps :
    phase === "goals" ? 3 + perSportSteps :
    phase === "quiz" ? 4 + perSportSteps + currentQuizQ :
    phase === "shared" ? 4 + perSportSteps + QUIZ_QUESTIONS.length + currentSharedStep :
    totalSteps;
  const progressPct = (currentStepNum / totalSteps) * 100;

  const toggleSport = (key) => {
    setSelectedSports(prev => {
      if (prev.includes(key)) return prev.filter(s => s !== key);
      if (prev.length >= 3) { toast.error("Maximum 3 sports"); return prev; }
      return [...prev, key];
    });
  };

  const toggleGoal = (value) => {
    setSelectedGoals(prev => {
      if (prev.includes(value)) return prev.filter(g => g !== value);
      if (prev.length >= 3) { toast.error("Choose up to 3 goals"); return prev; }
      return [...prev, value];
    });
  };

  const getCurrentSportConfig = () => sports.find(s => s.key === selectedSports[currentSportIdx]);

  const goForward = () => setDirection(1);
  const goBackward = () => setDirection(-1);

  const handleNext = async () => {
    goForward();

    if (phase === "sports") {
      if (selectedSports.length === 0) { toast.error("Pick at least one sport"); return; }
      setPhase("per_sport");
      setCurrentSportIdx(0);
      setPerSportStep(0);
      return;
    }

    if (phase === "per_sport") {
      const sportKey = selectedSports[currentSportIdx];
      const current = sportsProfiles[sportKey] || {};
      if (perSportStep === 0 && !current.skill_level) { toast.error("Select your level"); return; }
      if (perSportStep === 1 && !current.play_style) { toast.error("Select your style"); return; }
      if (perSportStep === 2 && !current.play_format) { toast.error("Select your play format"); return; }

      if (perSportStep < 2) {
        setPerSportStep(perSportStep + 1);
      } else {
        if (currentSportIdx < selectedSports.length - 1) {
          setCurrentSportIdx(currentSportIdx + 1);
          setPerSportStep(0);
        } else {
          setPhase("intro");
        }
      }
      return;
    }

    if (phase === "intro") {
      setPhase("goals");
      return;
    }

    if (phase === "goals") {
      if (selectedGoals.length === 0) { toast.error("Select at least one goal"); return; }
      setPhase("quiz");
      setCurrentQuizQ(0);
      return;
    }

    if (phase === "quiz") {
      if (!quizAnswers[`q${currentQuizQ}`]) { toast.error("Pick an option"); return; }
      if (currentQuizQ < QUIZ_QUESTIONS.length - 1) {
        setCurrentQuizQ(currentQuizQ + 1);
      } else {
        setPhase("shared");
        setCurrentSharedStep(0);
      }
      return;
    }

    if (phase === "shared") {
      const step = SHARED_STEPS[currentSharedStep];
      if (!sharedAnswers[step.key]) { toast.error("Please select an option"); return; }
      if (currentSharedStep < SHARED_STEPS.length - 1) {
        setCurrentSharedStep(currentSharedStep + 1);
      } else {
        setPhase("summary");
      }
      return;
    }

    if (phase === "summary") {
      if (!isAuthenticated) {
        // Show login modal for unauthenticated users
        setShowLoginModal(true);
        setLoginStep("phone");
        setLoginPhone("");
        setLoginOtp("");
        setLoginOtpHint("");
        return;
      }
      // Authenticated user - save directly
      await saveProfileAndRedirect();
      setLoading(false);
    }
  };

  const handleBack = () => {
    goBackward();
    if (phase === "summary") {
      setPhase("shared");
      setCurrentSharedStep(SHARED_STEPS.length - 1);
    } else if (phase === "shared" && currentSharedStep > 0) {
      setCurrentSharedStep(currentSharedStep - 1);
    } else if (phase === "shared" && currentSharedStep === 0) {
      setPhase("quiz");
      setCurrentQuizQ(QUIZ_QUESTIONS.length - 1);
    } else if (phase === "quiz" && currentQuizQ > 0) {
      setCurrentQuizQ(currentQuizQ - 1);
    } else if (phase === "quiz" && currentQuizQ === 0) {
      setPhase("goals");
    } else if (phase === "goals") {
      setPhase("intro");
    } else if (phase === "intro") {
      setPhase("per_sport");
      setCurrentSportIdx(selectedSports.length - 1);
      setPerSportStep(2);
    } else if (phase === "per_sport" && perSportStep > 0) {
      setPerSportStep(perSportStep - 1);
    } else if (phase === "per_sport" && currentSportIdx > 0) {
      setCurrentSportIdx(currentSportIdx - 1);
      setPerSportStep(2);
    } else if (phase === "per_sport" && currentSportIdx === 0 && perSportStep === 0) {
      setPhase("sports");
    }
  };

  const canGoBack = phase !== "sports";

  if (loadingSports) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const renderSportSelection = () => (
    <motion.div
      key="sports"
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Badge className="mb-3 bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs uppercase">
            <Sparkles className="w-3 h-3 mr-1" /> Let's Get Started
          </Badge>
        </motion.div>
        <h1 className="font-heading font-bold text-3xl md:text-4xl uppercase tracking-tight text-white mb-2" data-testid="step-title">
          Pick Your Sports
        </h1>
        <p className="text-zinc-400">Choose up to 3 sports you play.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" data-testid="sport-grid">
        {sports.map((sport, idx) => {
          const IconComp = SPORT_ICONS[sport.key] || SPORT_ICONS[sport.icon] || Zap;
          const isSelected = selectedSports.includes(sport.key);
          const colorClass = SPORT_COLORS[sport.color] || SPORT_COLORS.lime;
          const textClass = SPORT_TEXT[sport.color] || "text-lime-400";
          const ringClass = SPORT_RING[sport.color] || "ring-lime-400";

          return (
            <motion.button
              key={sport.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toggleSport(sport.key)}
              className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
                isSelected ? colorClass : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
              }`}
              data-testid={`sport-${sport.key}`}
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={`absolute top-3 right-3 w-6 h-6 rounded-full ring-2 ${ringClass} bg-zinc-900 flex items-center justify-center`}
                >
                  <Check className={`w-3.5 h-3.5 ${textClass}`} />
                </motion.div>
              )}
              <span className="text-4xl mb-2 block">{{"badminton":"🏸","tennis":"🎾","table_tennis":"🏓","pickleball":"⚡","cricket":"🏏","football":"⚽","swimming":"🏊"}[sport.key] || "🎯"}</span>
              <p className="font-heading font-bold text-base text-white uppercase tracking-tight">{sport.name}</p>
              {sport.video_analysis && (
                <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px] mt-2">AI Video</Badge>
              )}
            </motion.button>
          );
        })}
      </div>

      {selectedSports.length > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-zinc-500 text-xs mt-4"
        >
          {selectedSports.length}/3 selected
        </motion.p>
      )}
    </motion.div>
  );

  const PLAY_FORMAT_OPTIONS = [
    { value: "singles", label: "Singles", desc: "I mostly play one-on-one", icon: User },
    { value: "doubles", label: "Doubles", desc: "I mostly play with a partner", icon: Users },
    { value: "mixed", label: "Both / Mixed", desc: "I play singles and doubles equally", icon: Crosshair },
  ];

  const renderPerSportStep = () => {
    const sportConfig = getCurrentSportConfig();
    if (!sportConfig) return null;
    const sportKey = selectedSports[currentSportIdx];
    const current = sportsProfiles[sportKey] || {};
    const textClass = SPORT_TEXT[sportConfig.color] || "text-lime-400";

    // Step 0: skill level, Step 1: play style, Step 2: play format (singles/doubles)
    if (perSportStep === 2) {
      // Play format step
      return (
        <motion.div
          key={`${sportKey}-format`}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="mb-8">
            <Badge className={`mb-3 ${textClass} bg-zinc-800 border-zinc-700 text-xs uppercase`}>
              {sportConfig.name} {currentSportIdx + 1}/{selectedSports.length}
            </Badge>
            <h1 className="font-heading font-bold text-3xl md:text-4xl uppercase tracking-tight text-white mb-2">
              Singles, Doubles, or Both?
            </h1>
            <p className="text-zinc-400">
              This shapes your training plan and equipment recommendations.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLAY_FORMAT_OPTIONS.map((opt, idx) => {
              const selected = current.play_format === opt.value;
              const OptIcon = opt.icon;
              return (
                <motion.button
                  key={opt.value}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.08 }}
                  whileHover={{ scale: 1.03, y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSportsProfiles(prev => ({
                    ...prev,
                    [sportKey]: { ...prev[sportKey], play_format: opt.value }
                  }))}
                  className={`relative p-6 rounded-2xl border-2 text-center transition-all ${
                    selected
                      ? "border-lime-400/50 bg-lime-400/5 shadow-[0_0_20px_rgba(190,242,100,0.15)]"
                      : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
                  }`}
                >
                  {selected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-3 right-3 w-6 h-6 rounded-full ring-2 ring-lime-400 bg-zinc-900 flex items-center justify-center"
                    >
                      <Check className="w-3.5 h-3.5 text-lime-400" />
                    </motion.div>
                  )}
                  <OptIcon className={`w-10 h-10 mx-auto mb-3 ${selected ? "text-lime-400" : "text-zinc-500"}`} strokeWidth={1.5} />
                  <p className="font-heading font-bold text-lg text-white uppercase tracking-tight mb-1">{opt.label}</p>
                  <p className="text-zinc-500 text-sm">{opt.desc}</p>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      );
    }

    const isSkillStep = perSportStep === 0;
    const options = isSkillStep ? sportConfig.skill_levels : sportConfig.play_styles;
    const value = isSkillStep ? current.skill_level : current.play_style;

    return (
      <motion.div
        key={`${sportKey}-${perSportStep}`}
        custom={direction}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div className="mb-8">
          <Badge className={`mb-3 ${textClass} bg-zinc-800 border-zinc-700 text-xs uppercase`}>
            {sportConfig.name} {currentSportIdx + 1}/{selectedSports.length}
          </Badge>
          <h1 className="font-heading font-bold text-3xl md:text-4xl uppercase tracking-tight text-white mb-2">
            {isSkillStep ? `Your ${sportConfig.name} Level?` : `How Do You Play ${sportConfig.name}?`}
          </h1>
          <p className="text-zinc-400">
            {isSkillStep ? "Be honest - this helps us recommend the right gear." : "Your dominant style shapes equipment choice."}
          </p>
        </div>

        <RadioGroup value={value || ""} onValueChange={(v) => {
          setSportsProfiles(prev => ({
            ...prev,
            [sportKey]: { ...prev[sportKey], [isSkillStep ? "skill_level" : "play_style"]: v }
          }));
        }} className="space-y-3">
          {options.map((opt, idx) => (
            <motion.div
              key={opt.value}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Label htmlFor={`${sportKey}-${opt.value}`}
                className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all ${
                  value === opt.value
                    ? "border-lime-400/50 bg-lime-400/5 shadow-[0_0_15px_rgba(190,242,100,0.1)]"
                    : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
                }`}>
                <RadioGroupItem value={opt.value} id={`${sportKey}-${opt.value}`}
                  className="mt-0.5 border-zinc-600 data-[state=checked]:border-lime-400 data-[state=checked]:bg-lime-400" />
                <div>
                  <p className="font-semibold text-white text-sm">{opt.label}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{opt.desc}</p>
                </div>
              </Label>
            </motion.div>
          ))}
        </RadioGroup>
      </motion.div>
    );
  };

  const renderGoalsStep = () => (
    <motion.div
      key="goals"
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="mb-8">
        <Badge className="mb-3 bg-purple-400/10 text-purple-400 border-purple-400/20 text-xs uppercase">
          <Heart className="w-3 h-3 mr-1" /> Your Goals
        </Badge>
        <h1 className="font-heading font-bold text-3xl md:text-4xl uppercase tracking-tight text-white mb-2">
          What Do You Want to Achieve?
        </h1>
        <p className="text-zinc-400">Select up to 3 goals that matter most.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GOALS.map((goal, idx) => {
          const isSelected = selectedGoals.includes(goal.value);
          const GoalIcon = goal.icon;
          return (
            <motion.button
              key={goal.value}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => toggleGoal(goal.value)}
              className={`relative flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                isSelected
                  ? "border-lime-400/50 bg-lime-400/5 shadow-[0_0_15px_rgba(190,242,100,0.1)]"
                  : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
              }`}
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-3 right-3 w-5 h-5 rounded-full ring-2 ring-lime-400 bg-zinc-900 flex items-center justify-center"
                >
                  <Check className="w-3 h-3 text-lime-400" />
                </motion.div>
              )}
              <GoalIcon className={`w-5 h-5 mt-0.5 shrink-0 ${isSelected ? "text-lime-400" : "text-zinc-500"}`} strokeWidth={1.5} />
              <div>
                <p className="font-semibold text-white text-sm">{goal.label}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{goal.desc}</p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {selectedGoals.length > 0 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-zinc-500 text-xs mt-4">
          {selectedGoals.length}/3 selected
        </motion.p>
      )}
    </motion.div>
  );

  const renderIntroStep = () => (
    <motion.div
      key="intro"
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="flex flex-col items-center text-center py-6">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
          className="w-20 h-20 rounded-2xl bg-gradient-to-br from-lime-400/20 to-amber-400/10 border border-lime-400/20 flex items-center justify-center mb-8"
        >
          <Brain className="w-10 h-10 text-lime-400" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="font-heading font-bold text-3xl md:text-4xl uppercase tracking-tight text-white mb-4"
        >
          Your answers shape everything
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-zinc-400 text-lg mb-8 max-w-md"
        >
          The next few questions help us build your personalized experience.
        </motion.p>

        <div className="space-y-3 text-left max-w-sm w-full">
          {[
            { icon: Target, text: "Training plan tailored to your goals", delay: 0.35 },
            { icon: Sparkles, text: "Equipment recommendations for your play style", delay: 0.4 },
            { icon: GraduationCap, text: "Coaching feedback in your language", delay: 0.45 },
            { icon: BarChart3, text: "Progress tracking aligned to what matters to you", delay: 0.5 },
          ].map(({ icon: Icon, text, delay }) => (
            <motion.div
              key={text}
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay }}
              className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/50"
            >
              <div className="w-8 h-8 rounded-lg bg-lime-400/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-lime-400" />
              </div>
              <p className="text-sm text-zinc-300">{text}</p>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-zinc-500 text-sm mt-8 italic"
        >
          Take your time. Answer honestly. There are no wrong answers.
        </motion.p>
      </div>
    </motion.div>
  );

  const renderQuizStep = () => {
    const q = QUIZ_QUESTIONS[currentQuizQ];
    return (
      <motion.div
        key={`quiz-${currentQuizQ}`}
        custom={direction}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div className="mb-8">
          <Badge className="mb-3 bg-amber-400/10 text-amber-400 border-amber-400/20 text-xs uppercase">
            <Sparkles className="w-3 h-3 mr-1" /> Play Style Quiz {currentQuizQ + 1}/{QUIZ_QUESTIONS.length}
          </Badge>
          <h1 className="font-heading font-bold text-3xl md:text-4xl uppercase tracking-tight text-white mb-2">
            {q.question}
          </h1>
          <p className="text-zinc-400">This helps us understand your play personality.</p>
        </div>

        {q.options.length <= 2 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {q.options.map((opt, idx) => {
              const selected = quizAnswers[`q${currentQuizQ}`] === opt.value;
              const OptIcon = opt.icon;
              return (
                <motion.button
                  key={opt.value}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ scale: 1.03, y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setQuizAnswers(prev => ({ ...prev, [`q${currentQuizQ}`]: opt.value }))}
                  className={`relative p-8 rounded-2xl border-2 text-center transition-all ${
                    selected
                      ? "border-amber-400/50 bg-amber-400/5 shadow-[0_0_20px_rgba(251,191,36,0.15)]"
                      : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
                  }`}
                >
                  {selected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-3 right-3 w-6 h-6 rounded-full ring-2 ring-amber-400 bg-zinc-900 flex items-center justify-center"
                    >
                      <Check className="w-3.5 h-3.5 text-amber-400" />
                    </motion.div>
                  )}
                  <OptIcon className={`w-12 h-12 mx-auto mb-4 ${selected ? "text-amber-400" : "text-zinc-500"}`} strokeWidth={1.5} />
                  <p className="font-heading font-bold text-xl text-white uppercase tracking-tight mb-1">{opt.label}</p>
                  <p className="text-zinc-500 text-sm">{opt.desc}</p>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {q.options.map((opt, idx) => {
              const selected = quizAnswers[`q${currentQuizQ}`] === opt.value;
              const OptIcon = opt.icon;
              return (
                <motion.button
                  key={opt.value}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setQuizAnswers(prev => ({ ...prev, [`q${currentQuizQ}`]: opt.value }))}
                  className={`relative w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                    selected
                      ? "border-amber-400/50 bg-amber-400/5 shadow-[0_0_15px_rgba(251,191,36,0.1)]"
                      : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
                  }`}
                >
                  {selected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-3 right-3 w-5 h-5 rounded-full ring-2 ring-amber-400 bg-zinc-900 flex items-center justify-center"
                    >
                      <Check className="w-3 h-3 text-amber-400" />
                    </motion.div>
                  )}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-amber-400/10" : "bg-zinc-800"}`}>
                    <OptIcon className={`w-5 h-5 ${selected ? "text-amber-400" : "text-zinc-500"}`} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{opt.label}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">{opt.desc}</p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>
    );
  };

  const renderSharedStep = () => {
    const step = SHARED_STEPS[currentSharedStep];
    return (
      <motion.div
        key={`shared-${currentSharedStep}`}
        custom={direction}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div className="mb-8">
          <h1 className="font-heading font-bold text-3xl md:text-4xl uppercase tracking-tight text-white mb-2">{step.title}</h1>
          <p className="text-zinc-400">{step.subtitle}</p>
        </div>

        <RadioGroup value={sharedAnswers[step.key] || ""} onValueChange={(v) => setSharedAnswers(prev => ({ ...prev, [step.key]: v }))}
          className="space-y-3">
          {step.options.map((opt, idx) => (
            <motion.div
              key={opt.value}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Label htmlFor={`sh-${opt.value}`}
                className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all ${
                  sharedAnswers[step.key] === opt.value
                    ? "border-lime-400/50 bg-lime-400/5 shadow-[0_0_15px_rgba(190,242,100,0.1)]"
                    : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700"
                }`}>
                <RadioGroupItem value={opt.value} id={`sh-${opt.value}`}
                  className="mt-0.5 border-zinc-600 data-[state=checked]:border-lime-400 data-[state=checked]:bg-lime-400" />
                <div>
                  <p className="font-semibold text-white text-sm">{opt.label}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{opt.desc}</p>
                </div>
              </Label>
            </motion.div>
          ))}
        </RadioGroup>
      </motion.div>
    );
  };

  const renderSummary = () => {
    const playStylePersonality = derivePlayStyle(quizAnswers);
    const goalLabels = selectedGoals.map(g => GOALS.find(gl => gl.value === g)?.label).filter(Boolean);

    return (
      <motion.div
        key="summary"
        custom={direction}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div className="mb-8">
          <Badge className="mb-3 bg-lime-400/10 text-lime-400 border-lime-400/20 text-xs uppercase">
            <Star className="w-3 h-3 mr-1" /> Profile Summary
          </Badge>
          <h1 className="font-heading font-bold text-3xl md:text-4xl uppercase tracking-tight text-white mb-2">
            Looking Good!
          </h1>
          <p className="text-zinc-400">Review your profile before we set things up.</p>
        </div>

        <div className="space-y-4">
          {/* Sports */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
          >
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">Your Sports</p>
            <div className="flex flex-wrap gap-2">
              {selectedSports.map(sk => {
                const sc = sports.find(s => s.key === sk);
                const sp = sportsProfiles[sk] || {};
                const textClass = SPORT_TEXT[sc?.color] || "text-lime-400";
                return (
                  <div key={sk} className="bg-zinc-800/60 rounded-xl p-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-zinc-700/50 flex items-center justify-center`}>
                      {(() => {
                        const IC = SPORT_ICONS[sk] || Zap;
                        return <IC className={`w-4 h-4 ${textClass}`} />;
                      })()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{sc?.name || sk}</p>
                      <p className="text-xs text-zinc-500">{sp.skill_level} / {sp.play_style}{sp.play_format ? ` / ${sp.play_format}` : ""}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Play Style Personality */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
          >
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">Play Personality</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-400/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="font-heading font-bold text-xl text-white uppercase tracking-tight">{playStylePersonality}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Based on your quiz answers</p>
              </div>
            </div>
          </motion.div>

          {/* Goals */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
          >
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">Your Goals</p>
            <div className="flex flex-wrap gap-2">
              {goalLabels.map(g => (
                <Badge key={g} className="bg-purple-400/10 text-purple-400 border-purple-400/20 text-xs">{g}</Badge>
              ))}
            </div>
          </motion.div>

          {/* Details */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
          >
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">Details</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Frequency", value: sharedAnswers.playing_frequency },
                { label: "Budget", value: sharedAnswers.budget_range },
                { label: "Priority", value: sharedAnswers.primary_goal },
                { label: "Injury", value: sharedAnswers.injury_history === "none" ? "None" : sharedAnswers.injury_history },
              ].map(item => (
                <div key={item.label} className="bg-zinc-800/50 rounded-xl p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{item.label}</p>
                  <p className="text-sm font-medium text-white mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    );
  };

  const isLastStep = phase === "summary";

  return (
    <div className="min-h-screen bg-zinc-950 pt-8 pb-16" data-testid="assessment-page">
      <div className="container mx-auto px-4 max-w-2xl">
        {/* Progress */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-8"
        >
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
              Step {currentStepNum} of {totalSteps}
            </span>
            <span className="text-xs text-lime-400 font-mono">{Math.round(progressPct)}%</span>
          </div>
          <Progress value={progressPct} className="h-1.5 bg-zinc-800 [&>div]:bg-lime-400 [&>div]:transition-all [&>div]:duration-500" data-testid="assessment-progress" />
        </motion.div>

        {/* Content */}
        <AnimatePresence mode="wait" custom={direction}>
          {phase === "sports" && renderSportSelection()}
          {phase === "per_sport" && renderPerSportStep()}
          {phase === "intro" && renderIntroStep()}
          {phase === "goals" && renderGoalsStep()}
          {phase === "quiz" && renderQuizStep()}
          {phase === "shared" && renderSharedStep()}
          {phase === "summary" && renderSummary()}
        </AnimatePresence>

        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex gap-3 mt-10"
        >
          {canGoBack && (
            <Button variant="ghost" onClick={handleBack}
              className="text-zinc-400 hover:text-white border border-zinc-800 rounded-full px-6">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          <Button onClick={handleNext} disabled={loading}
            className="flex-1 bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide rounded-full h-12 shadow-[0_0_15px_rgba(190,242,100,0.2)]"
            data-testid="next-step-btn">
            {loading ? (
              <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin mr-2" /> Creating Profile...</>
            ) : isLastStep ? (
              <><Zap className="w-4 h-4 mr-2" /> Get My Recommendations</>
            ) : (
              <>Continue <ChevronRight className="w-4 h-4 ml-1" /></>
            )}
          </Button>
        </motion.div>
      </div>

      {/* Login Modal for unauthenticated users */}
      <AnimatePresence>
        {showLoginModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowLoginModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm relative"
            >
              <button
                onClick={() => setShowLoginModal(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-6 h-6 text-lime-400" />
                <span className="font-heading font-bold text-lg uppercase tracking-tight text-white">Save Your Results</span>
              </div>

              <p className="text-zinc-400 text-sm mb-6">
                Sign in to save your personalized profile and get recommendations tailored just for you.
              </p>

              {/* Google Login */}
              <Button
                onClick={async () => {
                  setLoading(true);
                  try {
                    const { signInWithPopup } = await import("firebase/auth");
                    const { auth, googleProvider } = await import("@/lib/firebase");
                    const result = await signInWithPopup(auth, googleProvider);
                    const firebaseUser = result.user;
                    const idToken = await firebaseUser.getIdToken();
                    const { data } = await api.post("/auth/firebase", {
                      firebase_token: idToken,
                      name: firebaseUser.displayName || "",
                      email: firebaseUser.email || "",
                      photo: firebaseUser.photoURL || "",
                    });
                    login(data.token, data.user, data.has_profile);
                    toast.success("Signed in! Saving your profile...");
                    setShowLoginModal(false);
                    try {
                      await api.post("/profile", buildProfilePayload(), { timeout: 10000 });
                      await refreshProfile();
                      toast.success("Profile created! Let's see your recommendations.");
                    } catch (profileErr) {
                      console.warn("Profile save failed, continuing:", profileErr);
                      toast.info("Profile will sync later. Enjoy exploring!");
                    }
                    navigate("/dashboard");
                  } catch (err) {
                    if (err.code !== "auth/popup-closed-by-user") {
                      toast.error("Login failed. Please try again.");
                    }
                  }
                  setLoading(false);
                }}
                disabled={loading}
                className="w-full h-14 bg-white text-black hover:bg-zinc-100 font-medium text-base rounded-xl shadow-lg flex items-center justify-center gap-3 mb-4"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                {loading ? "Signing in..." : "Continue with Google"}
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-500">or</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              {/* Skip */}
              <Button
                variant="ghost"
                onClick={() => {
                  localStorage.setItem("guest_mode", "true");
                  setShowLoginModal(false);
                  navigate("/dashboard");
                }}
                className="w-full text-zinc-400 hover:text-zinc-200 text-sm"
              >
                Skip, explore as guest
              </Button>
              <p className="text-[10px] text-zinc-600 mt-2 text-center">Your quiz results won't be saved</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
