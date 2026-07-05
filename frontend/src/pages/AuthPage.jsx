import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Zap, ArrowLeft, LogIn, Phone } from "lucide-react";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, getRedirectResult, signInWithPhoneNumber, RecaptchaVerifier } from "firebase/auth";
import api from "@/lib/api";

export default function AuthPage() {
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Phone OTP flow state
  const [phoneStep, setPhoneStep] = useState("idle"); // idle | sending | sent | verifying
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const confirmationRef = useRef(null);
  const recaptchaRef = useRef(null);

  // If already logged in, redirect
  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  // Handle redirect result on page load
  useEffect(() => {
    getRedirectResult(auth).then(async (result) => {
      if (!result) return;
      setLoading(true);
      try {
        await processFirebaseUser(result.user);
      } catch (err) {
        console.error("Redirect auth error:", err);
        toast.error("Login failed after redirect. Please try again.");
      }
      setLoading(false);
    }).catch((err) => {
      if (err.code !== "auth/popup-closed-by-user") {
        console.error("Redirect result error:", err);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processFirebaseUser = async (firebaseUser) => {
    const email = firebaseUser.email || "";
    const name = firebaseUser.displayName || "";
    const photo = firebaseUser.photoURL || "";

    let idToken = "";
    try { idToken = await firebaseUser.getIdToken(); } catch {}

    const { data } = await api.post("/auth/firebase", {
      firebase_token: idToken,
      name,
      email,
      photo,
    });

    login(data.token, data.user, data.has_profile, data.tokens);
    if (typeof data.tokens === "number" && data.tokens >= 300) {
      toast.success(`Welcome${name ? ", " + name : ""}! 🪙 ${data.tokens} tokens credited.`);
    } else {
      toast.success(`Welcome${name ? ", " + name : ""}!`);
    }
    // No profile yet → drop straight into the analyzer instead of forcing
    // the long intake quiz. Profile is captured post-analysis via the
    // PostAnalysisProfilePrompt modal.
    navigate(data.has_profile ? "/dashboard" : "/analyze");
  };

  // ─── Phone OTP via Firebase (free up to 10K/month) ───
  const ensureRecaptcha = () => {
    if (recaptchaRef.current) return recaptchaRef.current;
    // Invisible reCAPTCHA — Google's bot check; required by Firebase Phone.
    recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
    });
    return recaptchaRef.current;
  };

  const sendOtp = async () => {
    const cleaned = phone.replace(/\s+/g, "");
    if (!/^\+\d{10,15}$/.test(cleaned)) {
      toast.error("Enter phone with country code, e.g. +919876543210");
      return;
    }
    setPhoneStep("sending");
    try {
      const verifier = ensureRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, cleaned, verifier);
      confirmationRef.current = confirmation;
      setPhoneStep("sent");
      toast.success("OTP sent — check your SMS");
    } catch (err) {
      console.error("sendOtp failed:", err);
      const msg = err?.code === "auth/invalid-phone-number" ? "Invalid phone number"
        : err?.code === "auth/too-many-requests" ? "Too many attempts — try later"
        : err?.code === "auth/invalid-app-credential" ? "Phone auth not enabled in Firebase Console yet"
        : err?.message || "Couldn't send OTP";
      toast.error(msg);
      setPhoneStep("idle");
      // Reset recaptcha so user can retry
      try { recaptchaRef.current?.clear(); recaptchaRef.current = null; } catch {}
    }
  };

  const verifyOtp = async () => {
    if (!confirmationRef.current) { toast.error("Please request OTP first"); return; }
    if (!/^\d{4,8}$/.test(otp)) { toast.error("Enter the OTP code"); return; }
    setPhoneStep("verifying");
    try {
      const result = await confirmationRef.current.confirm(otp);
      // Same backend flow as Google login — Firebase issues a token
      // regardless of provider, so /auth/firebase handles both.
      await processFirebaseUser(result.user);
    } catch (err) {
      console.error("verifyOtp failed:", err);
      toast.error(err?.code === "auth/invalid-verification-code" ? "Wrong OTP — try again" : (err?.message || "Verification failed"));
      setPhoneStep("sent");
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/demo-login", {});
      login(data.token, data.user, data.has_profile, data.tokens);
      toast.success(`Logged in as Demo Player · 🪙 ${data.tokens} tokens`);
      navigate(data.has_profile ? "/dashboard" : "/analyze");
    } catch (err) {
      toast.error("Demo login failed: " + (err?.response?.data?.detail || err.message || "unknown"));
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await processFirebaseUser(result.user);
    } catch (err) {
      // Ignore user-cancelled
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        setLoading(false);
        return;
      }

      console.error("Login error:", err.code, err.message);

      // Show specific error
      if (err.response?.status === 405) {
        // 405 from our API — shouldn't happen but handle it
        toast.error("Server error (405). Please try again in a moment.");
      } else if (err.code?.startsWith("auth/")) {
        // Firebase error
        toast.error(`Firebase: ${err.message}`);
      } else if (err.response) {
        // API error
        toast.error(`Server error: ${err.response.status}`);
      } else {
        toast.error(err.message || "Login failed. Please try again.");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] flex" data-testid="auth-page">
      {/* Left - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-zinc-900" style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1200&q=60')",
          backgroundSize: "cover", backgroundPosition: "center"
        }} />
        <div className="absolute inset-0 bg-zinc-950/60" />
        <div className="relative z-10 p-12 max-w-md">
          <Zap className="w-10 h-10 text-lime-400 mb-6" />
          <h2 className="font-heading font-black text-4xl uppercase tracking-tighter text-white leading-tight mb-4">
            Your AI<br />Sports Coach<span className="text-lime-400">.</span>
          </h2>
          <p className="text-zinc-300 leading-relaxed">
            Personalized training, smart gear picks, and instant video analysis — like having a pro coach in your pocket.
          </p>
        </div>
      </div>

      {/* Right - Login. flex-col + overflow-y-auto + my-auto: centers when
          the form fits, scrolls from the top when it's taller than the
          screen (fixes the form getting clipped on short Android viewports). */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-zinc-950 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm my-auto"
        >
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <Zap className="w-6 h-6 text-lime-400" />
            <span className="font-heading font-bold text-xl uppercase tracking-tight">Formanti</span>
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="font-heading font-bold text-3xl uppercase tracking-tight mb-2">Get Started</h1>
              <p className="text-zinc-400 text-sm">
                Sign in to save your progress, get personalized recommendations, and track your improvement.
              </p>
            </div>

            {/* Google Login */}
            <Button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full h-14 bg-white text-black hover:bg-zinc-100 font-medium text-base rounded-xl shadow-lg flex items-center justify-center gap-3 transition-all hover:shadow-xl"
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

            {/* Phone OTP — Firebase Phone Auth (free, 10K/month). India-friendly. */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> Or sign in with phone
              </p>
              {phoneStep !== "sent" && phoneStep !== "verifying" ? (
                <div className="flex gap-2">
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="+91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={loading || phoneStep === "sending"}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
                  />
                  <Button onClick={sendOtp} disabled={loading || phoneStep === "sending"}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg text-xs px-4">
                    {phoneStep === "sending" ? "Sending…" : "Send OTP"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-400">
                    Code sent to <span className="text-white font-mono">{phone}</span>
                    <button onClick={() => { setPhoneStep("idle"); setOtp(""); }}
                      className="ml-2 text-lime-400 hover:text-lime-300 underline">change</button>
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="6-digit OTP"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      disabled={phoneStep === "verifying"}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none font-mono tracking-widest"
                    />
                    <Button onClick={verifyOtp} disabled={phoneStep === "verifying"}
                      className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-lg text-xs px-4">
                      {phoneStep === "verifying" ? "Verifying…" : "Verify →"}
                    </Button>
                  </div>
                </div>
              )}
              {/* Invisible reCAPTCHA target — Firebase Phone Auth requires this */}
              <div id="recaptcha-container" />
            </div>

            {/* Demo account — instant 5000-token test login */}
            <Button
              onClick={handleDemoLogin}
              disabled={loading}
              className="w-full h-12 bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 border border-purple-400/30 font-medium text-sm rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <span className="text-base">🪙</span>
              Try Demo Account (5000 tokens, no signup)
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-xs text-zinc-500">or</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {/* Guest Mode */}
            <Button
              variant="outline"
              onClick={() => {
                localStorage.setItem("guest_mode", "true");
                navigate("/dashboard");
              }}
              className="w-full h-12 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Explore as Guest
            </Button>

            <p className="text-[11px] text-zinc-600 text-center">
              Guests can browse but can't save progress.{" "}
              <a href="/privacy" className="text-zinc-500 hover:text-zinc-400 underline">Privacy Policy</a>
            </p>

            <Button variant="ghost" onClick={() => navigate("/")}
              className="w-full text-zinc-500 hover:text-zinc-300">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
