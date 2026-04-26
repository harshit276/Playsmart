import { createContext, useContext, useState, useEffect, useCallback, lazy, Suspense } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/sonner";
import api from "@/lib/api";
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
const BadmintonPage = lazy(() => import("@/pages/BadmintonPage"));
const TennisPage = lazy(() => import("@/pages/TennisPage"));
const TableTennisPage = lazy(() => import("@/pages/TableTennisPage"));
const PickleballPage = lazy(() => import("@/pages/PickleballPage"));
const LabelPage = lazy(() => import("@/pages/LabelPage"));
const TestModelPage = lazy(() => import("@/pages/TestModelPage"));
const WalletPage = lazy(() => import("@/pages/WalletPage"));
const ReferralPage = lazy(() => import("@/pages/ReferralPage"));

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tokens, setTokens] = useState(null); // null = unknown, number = balance
  const [referralCode, setReferralCode] = useState(null);

  const fetchTokens = useCallback(async () => {
    if (!localStorage.getItem("playsmart_token")) return;
    try {
      const { data } = await api.get("/tokens/balance", { timeout: 5000 });
      setTokens(data.balance);
      setReferralCode(data.referral_code);
    } catch {
      // Best-effort — silently keep current value if fetch fails
    }
  }, []);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem("playsmart_token");
    if (!token) return;
    try {
      const { data } = await api.get("/auth/me", { timeout: 6000 });
      setUser(data.user);
      setProfile(data.profile);
      // Pull the token balance once auth is established
      fetchTokens();
    } catch (err) {
      // Only drop the token on 401/403 — keep it on network/timeout errors
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem("playsmart_token");
      }
    }
  }, [fetchTokens]);

  // Hydrate auth in the background — never block initial render
  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = (token, userData, hasProfile) => {
    localStorage.setItem("playsmart_token", token);
    localStorage.removeItem("guest_mode");
    setUser(userData);
    if (hasProfile) fetchMe();
    else fetchTokens(); // still fetch tokens so the navbar chip lights up
  };

  const logout = () => {
    localStorage.removeItem("playsmart_token");
    localStorage.removeItem("guest_mode");
    setUser(null);
    setProfile(null);
    setTokens(null);
    setReferralCode(null);
  };

  const refreshProfile = async () => {
    try {
      const { data } = await api.get("/auth/me", { timeout: 6000 });
      setProfile(data.profile);
      setUser(data.user);
    } catch {}
  };

  const isGuest = !user && localStorage.getItem("guest_mode") === "true";

  return (
    <AuthContext.Provider value={{
      user, profile, login, logout, refreshProfile,
      tokens, referralCode, refreshTokens: fetchTokens,
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
      <Route path="/badminton" element={<BadmintonPage />} />
      <Route path="/tennis" element={<TennisPage />} />
      <Route path="/table-tennis" element={<TableTennisPage />} />
      <Route path="/pickleball" element={<PickleballPage />} />
      <Route path="/assessment" element={<AssessmentPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/wallet" element={<WalletPage />} />
      <Route path="/referral" element={<ReferralPage />} />
      <Route path="/equipment" element={<EquipmentPage />} />
      <Route path="/training" element={<TrainingPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/analyze" element={<AnalyzePage />} />
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/card" element={<PlayerCardPage />} />
      <Route path="/label" element={<LabelPage />} />
      <Route path="/test-model" element={<TestModelPage />} />
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
