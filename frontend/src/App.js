import { createContext, useContext, useState, useEffect, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";
import LandingPage from "@/pages/LandingPage";
import AuthPage from "@/pages/AuthPage";
import AssessmentPage from "@/pages/AssessmentPage";
import DashboardPage from "@/pages/DashboardPage";
import EquipmentPage from "@/pages/EquipmentPage";
import TrainingPage from "@/pages/TrainingPage";
import ProgressPage from "@/pages/ProgressPage";
import PlayerCardPage from "@/pages/PlayerCardPage";
import AnalyzePage from "@/pages/AnalyzePage";
import CommunityPage from "@/pages/CommunityPage";
import HighlightsPage from "@/pages/HighlightsPage";
import BlogListPage from "@/pages/BlogListPage";
import BlogPostPage from "@/pages/BlogPostPage";
import PrivacyPage from "@/pages/PrivacyPage";
import InstallPrompt from "@/components/InstallPrompt";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem("playsmart_token");
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setProfile(data.profile);
    } catch { localStorage.removeItem("playsmart_token"); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = (token, userData, hasProfile) => {
    localStorage.setItem("playsmart_token", token);
    localStorage.removeItem("guest_mode");
    setUser(userData);
    if (hasProfile) fetchMe();
  };

  const logout = () => {
    localStorage.removeItem("playsmart_token");
    localStorage.removeItem("guest_mode");
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setProfile(data.profile);
      setUser(data.user);
    } catch {}
  };

  const isGuest = !user && localStorage.getItem("guest_mode") === "true";

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <AuthContext.Provider value={{ user, profile, login, logout, refreshProfile, isAuthenticated: !!user, isGuest }}>
      {children}
    </AuthContext.Provider>
  );
}

// All routes are public - guests can browse everything
// Auth is only needed for saving/writing data

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/blog" element={<BlogListPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/assessment" element={<AssessmentPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/equipment" element={<EquipmentPage />} />
      <Route path="/training" element={<TrainingPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/analyze" element={<AnalyzePage />} />
      <Route path="/highlights" element={<HighlightsPage />} />
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/card" element={<PlayerCardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-background">
          <Navbar />
          <AppRoutes />
          <Toaster position="bottom-right" />
          <InstallPrompt />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
