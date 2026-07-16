import { createContext, useContext, useState, useEffect, useCallback, lazy, Suspense } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/sonner";
import api from "@/lib/api";
import { invalidateMatching } from "@/lib/cachedFetch";
import Navbar from "@/components/Navbar";
import LandingPage from "@/pages/LandingPage"; // Eager — first paint
import InstallPrompt from "@/components/InstallPrompt";
import VirtualCoach from "@/components/VirtualCoach";

// Code-split — each page loads on demand
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const AssessmentPage = lazy(() => import("@/pages/AssessmentPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const EquipmentPage = lazy(() => import("@/pages/EquipmentPage"));
const TrainingPage = lazy(() => import("@/pages/TrainingPage"));
const ProgressPage = lazy(() => import("@/pages/ProgressPage"));
const PlayerCardPage = lazy(() => import("@/pages/PlayerCardPage"));
const AnalyzePage = lazy(() => import("@/pages/AnalyzePage"));
const CommunityPage = lazy(() => import("@/pages/CommunityPage"));
const BlogListPage = lazy(() => import("@/pages/BlogListPage"));
const BlogPostPage = lazy(() => import("@/pages/BlogPostPage"));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage"));
const TermsPage = lazy(() => import("@/pages/TermsPage"));
const RefundPage = lazy(() => import("@/pages/RefundPage"));
const CancellationPage = lazy(() => import("@/pages/CancellationPage"));
const ShippingPage = lazy(() => import("@/pages/ShippingPage"));
const ContactPage = lazy(() => import("@/pages/ContactPage"));
const BadmintonPage = lazy(() => import("@/pages/BadmintonPage"));
const TennisPage = lazy(() => import("@/pages/TennisPage"));
const TableTennisPage = lazy(() => import("@/pages/TableTennisPage"));
const PickleballPage = lazy(() => import("@/pages/PickleballPage"));
const CricketPage = lazy(() => import("@/pages/CricketPage"));
const SwimmingPage = lazy(() => import("@/pages/SwimmingPage"));
const FootballPage = lazy(() => import("@/pages/FootballPage"));
const BasketballPage = lazy(() => import("@/pages/BasketballPage"));
const GymPage = lazy(() => import("@/pages/GymPage"));
const WeightLiftingPage = lazy(() => import("@/pages/WeightLiftingPage"));
const PhysiotherapyPage = lazy(() => import("@/pages/PhysiotherapyPage"));
const LabelPage = lazy(() => import("@/pages/LabelPage"));
const TestModelPage = lazy(() => import("@/pages/TestModelPage"));
const TestAiGenPage = lazy(() => import("@/pages/TestAiGenPage"));
const WalletPage = lazy(() => import("@/pages/WalletPage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));
const ReferralPage = lazy(() => import("@/pages/ReferralPage"));
const MarketplacePage = lazy(() => import("@/pages/MarketplacePage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const HelpPage = lazy(() => import("@/pages/HelpPage"));
const DownloadPage = lazy(() => import("@/pages/DownloadPage"));

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// localStorage keys for the cached auth snapshot. Reading these on initial
// state means pages render in their authenticated layout instantly on
// refresh, instead of flashing the "guest" UI while /auth/me hits the
// serverless cold-start.
const AUTH_USER_CACHE = "playsmart_user";
const AUTH_PROFILE_CACHE = "playsmart_profile";
const AUTH_TOKENS_CACHE = "playsmart_tokens";

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// Everything on this device that belongs to whoever is signed in. Cleared on
// logout and on an account switch so one user's data can never surface under
// another's account. `pending_referral` is deliberately NOT cleared — it
// describes an incoming invite, not the outgoing user.
const USER_SCOPED_LOCAL_KEYS = [
  "playsmart_last_analysis",
  "last_analysis_score",
  "next_analysis_reminder",
  "guest_analysis_used",
  "playsmart_active_analysis_job",
  "playsmart_picker_session",
];
const USER_SCOPED_SESSION_KEYS = [
  "playsmart_progress_baseline",
  "pending_analysis",
];

export function clearUserScopedData() {
  for (const k of USER_SCOPED_LOCAL_KEYS) {
    try { localStorage.removeItem(k); } catch {}
  }
  for (const k of USER_SCOPED_SESSION_KEYS) {
    try { sessionStorage.removeItem(k); } catch {}
  }
  // The SWR cache is keyed by URL only (/analyses, /progress, /tokens/balance,
  // /badges…), so it is NOT user-safe on its own — drop all of it.
  try { invalidateMatching(() => true); } catch {}
  // The analyzed video itself lives in IndexedDB; drop it too.
  import("@/lib/videoStore").then((vs) => { try { vs.purgeVideo?.(); } catch {} }).catch(() => {});
}

function AuthProvider({ children }) {
  // Hydrate from localStorage on first render so the UI is "logged in"
  // immediately if a token + cached user are present. /auth/me runs in
  // the background and refreshes the cache (or clears it on 401).
  const hasToken = !!(typeof window !== "undefined" && localStorage.getItem("playsmart_token"));
  const [user, setUser] = useState(() => hasToken ? readCache(AUTH_USER_CACHE) : null);
  const [profile, setProfile] = useState(() => hasToken ? readCache(AUTH_PROFILE_CACHE) : null);
  const [tokens, setTokens] = useState(() => hasToken ? readCache(AUTH_TOKENS_CACHE) : null);
  const [referralCode, setReferralCode] = useState(null);

  // Wrap setters so the cache stays in sync with React state
  const setUserCached = useCallback((u) => {
    setUser(u);
    writeCache(AUTH_USER_CACHE, u);
  }, []);
  const setProfileCached = useCallback((p) => {
    setProfile(p);
    writeCache(AUTH_PROFILE_CACHE, p);
  }, []);
  const setTokensCached = useCallback((t) => {
    setTokens(t);
    writeCache(AUTH_TOKENS_CACHE, t);
  }, []);

  const fetchTokens = useCallback(async () => {
    if (!localStorage.getItem("playsmart_token")) return;
    try {
      const { data } = await api.get("/tokens/balance", { timeout: 5000 });
      setTokensCached(data.balance);
      setReferralCode(data.referral_code);
    } catch {
      // Best-effort — silently keep current value if fetch fails
    }
  }, [setTokensCached]);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem("playsmart_token");
    if (!token) return;
    try {
      const { data } = await api.get("/auth/me", { timeout: 8000 });
      setUserCached(data.user);
      setProfileCached(data.profile);
      // Pull the token balance once auth is established
      fetchTokens();
    } catch (err) {
      // Only drop the token on 401/403 — keep it (and the cached user) on
      // network/timeout errors so a flaky cold-start doesn't log you out.
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem("playsmart_token");
        writeCache(AUTH_USER_CACHE, null);
        writeCache(AUTH_PROFILE_CACHE, null);
        writeCache(AUTH_TOKENS_CACHE, null);
        setUser(null);
        setProfile(null);
        setTokens(null);
      }
    }
  }, [fetchTokens, setUserCached, setProfileCached]);

  // Hydrate auth in the background — never block initial render
  useEffect(() => { fetchMe(); }, [fetchMe]);

  // Capture a referral code from ?ref=CODE on ANY landing (the referral link
  // now points at /auth?ref=CODE, but this also catches /?ref= etc.) and
  // stash it so it survives the navigation to sign-in. It's redeemed right
  // after login() — the old flow only read the URL deep inside the Assessment
  // page, by which point the query param was long gone, so referrals never
  // credited.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && !localStorage.getItem("pending_referral")) {
        localStorage.setItem("pending_referral", ref.trim());
      }
    } catch {}
  }, []);

  const redeemPendingReferral = useCallback(() => {
    let code;
    try { code = localStorage.getItem("pending_referral"); } catch {}
    if (!code) return;
    // Records the pending referral server-side; both sides are credited when
    // the new user completes their first analysis. Idempotent + safe.
    api.post("/tokens/redeem-referral", { code }, { timeout: 6000 })
      .then(() => { try { localStorage.removeItem("pending_referral"); } catch {} })
      .catch((err) => {
        // Clear on a definitive server rejection (own code / not found /
        // already redeemed); keep it only on a network error so a flaky
        // cold-start can retry on the next login.
        if (err?.response) { try { localStorage.removeItem("pending_referral"); } catch {} }
      });
  }, []);

  const login = (token, userData, hasProfile, initialTokens) => {
    // Account switch on a shared device: if a DIFFERENT user was cached,
    // wipe their data before we hand the app to this one.
    const prev = readCache(AUTH_USER_CACHE);
    if (prev?.id && userData?.id && prev.id !== userData.id) clearUserScopedData();
    localStorage.setItem("playsmart_token", token);
    localStorage.removeItem("guest_mode");
    setUserCached(userData);
    if (typeof initialTokens === "number") setTokensCached(initialTokens);
    redeemPendingReferral();
    if (hasProfile) fetchMe();
    else fetchTokens();
  };

  const logout = () => {
    localStorage.removeItem("playsmart_token");
    localStorage.removeItem("guest_mode");
    writeCache(AUTH_USER_CACHE, null);
    writeCache(AUTH_PROFILE_CACHE, null);
    writeCache(AUTH_TOKENS_CACHE, null);
    // Everything below is the signed-in user's data. Without this the next
    // account to sign in on this device inherits it — the previous user's
    // saved analysis reappeared under a brand-new account's Results, and the
    // URL-keyed SWR cache served their history/progress/balance too.
    clearUserScopedData();
    setUser(null);
    setProfile(null);
    setTokens(null);
    setReferralCode(null);
  };

  const refreshProfile = async () => {
    try {
      const { data } = await api.get("/auth/me", { timeout: 6000 });
      setProfileCached(data.profile);
      setUserCached(data.user);
    } catch {}
  };

  const isGuest = !user && localStorage.getItem("guest_mode") === "true";

  // Optimistic token updates — call this from any spend/credit response
  // that includes the new balance. Avoids the network round-trip flicker
  // of fetchTokens(). Pass null/undefined to ignore (caller doesn't have to
  // null-check).
  const updateTokens = useCallback((newBalance) => {
    if (typeof newBalance === "number") setTokensCached(newBalance);
  }, [setTokensCached]);

  return (
    <AuthContext.Provider value={{
      user, profile, login, logout, refreshProfile,
      tokens, referralCode, refreshTokens: fetchTokens,
      updateTokens,
      isAuthenticated: !!user, isGuest,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// All routes are public - guests can browse everything
// Auth is only needed for saving/writing data

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-7 h-7 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/blog" element={<BlogListPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/refund" element={<RefundPage />} />
      <Route path="/cancellation" element={<CancellationPage />} />
      <Route path="/shipping" element={<ShippingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/badminton" element={<BadmintonPage />} />
      <Route path="/tennis" element={<TennisPage />} />
      <Route path="/table-tennis" element={<TableTennisPage />} />
      <Route path="/pickleball" element={<PickleballPage />} />
      <Route path="/cricket" element={<CricketPage />} />
      <Route path="/swimming" element={<SwimmingPage />} />
      <Route path="/football" element={<FootballPage />} />
      <Route path="/basketball" element={<BasketballPage />} />
      <Route path="/gym" element={<GymPage />} />
      <Route path="/weight-lifting" element={<WeightLiftingPage />} />
      <Route path="/physiotherapy" element={<PhysiotherapyPage />} />
      <Route path="/assessment" element={<AssessmentPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/wallet" element={<WalletPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/plans" element={<Navigate to="/pricing" replace />} />
      <Route path="/referral" element={<ReferralPage />} />
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/download" element={<DownloadPage />} />
      <Route path="/install" element={<Navigate to="/download" replace />} />
      <Route path="/app" element={<Navigate to="/download" replace />} />
      <Route path="/equipment" element={<Navigate to="/marketplace" replace />} />
      <Route path="/equipment-legacy" element={<EquipmentPage />} />
      <Route path="/training" element={<TrainingPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/analyze" element={<AnalyzePage />} />
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/card" element={<PlayerCardPage />} />
      <Route path="/label" element={<LabelPage />} />
      <Route path="/test-model" element={<TestModelPage />} />
      <Route path="/test-ai-gen" element={<TestAiGenPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
          <div className="min-h-screen bg-background">
            <Navbar />
            <AppRoutes />
            <Toaster position="bottom-right" />
            <InstallPrompt />
            <VirtualCoach />
          </div>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}

export default App;
