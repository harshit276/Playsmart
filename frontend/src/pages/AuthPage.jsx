import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ArrowLeft, LogIn, Mail, MailCheck } from "lucide-react";
import { FormantiIcon, FormantiLogo } from "@/components/FormantiLogo";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, getRedirectResult } from "firebase/auth";
import api from "@/lib/api";

export default function AuthPage() {
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Email + password flow. Signup does NOT log you in or grant tokens — it
  // emails a magic verify link, and the 100 tokens land when that link is
  // clicked (see /auth/verify-email). That's what stops throwaway addresses
  // from farming free analyses.
  const [mode, setMode] = useState("signup"); // signup | login
  const [name, setName] = useState("");
  const [emailAddr, setEmailAddr] = useState("");
  const [emailPass, setEmailPass] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");   // set once the verify link is emailed
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false); // consuming a ?verify= link

  // If already logged in, redirect — unless we're mid-way through consuming a
  // magic verify link, which must run to completion so the tokens get granted.
  useEffect(() => {
    if (isAuthenticated && !verifying && !window.location.search.includes("verify=")) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, verifying, navigate]);

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
    if (typeof data.tokens === "number" && data.tokens >= 100) {
      toast.success(`Welcome${name ? ", " + name : ""}! 🪙 ${data.tokens} tokens credited.`);
    } else {
      toast.success(`Welcome${name ? ", " + name : ""}!`);
    }
    // No profile yet → drop straight into the analyzer instead of forcing
    // the long intake quiz. Profile is captured post-analysis via the
    // PostAnalysisProfilePrompt modal.
    navigate(data.has_profile ? "/dashboard" : "/analyze");
  };

  // ─── Magic verify link: /auth?verify=<token> ───
  // Clicking the emailed link lands here. We exchange the token for a session
  // and the 100-token grant, then drop the user straight into the analyzer.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("verify");
    if (!token) return;
    setVerifying(true);
    (async () => {
      try {
        const { data } = await api.post("/auth/verify-email", { token });
        login(data.token, data.user, data.has_profile, data.tokens);
        toast.success(`Email verified! 🪙 ${data.tokens} tokens credited.`);
        navigate(data.has_profile ? "/dashboard" : "/analyze", { replace: true });
      } catch (err) {
        toast.error(err?.response?.data?.detail || "That verification link didn't work. Please sign up again.");
        setMode("signup");
      }
      setVerifying(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Email signup / login ───
  const handleEmailAuth = async () => {
    const email = emailAddr.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast.error("Enter a valid email address"); return; }
    if (emailPass.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setEmailBusy(true);
    try {
      if (mode === "signup") {
        const { data } = await api.post("/auth/register", {
          name: name.trim(), email, password: emailPass,
        });
        // No session yet — the account stays unverified (and token-less)
        // until the emailed link is clicked.
        setSentTo(data.email || email);
        if (data.email_sent === false) {
          toast.error("Account created, but we couldn't send the email. Try 'Resend' in a moment.");
        } else {
          toast.success("Check your inbox to verify your email");
        }
      } else {
        const { data } = await api.post("/auth/login-password", { email, password: emailPass });
        login(data.token, data.user, data.has_profile, data.tokens);
        toast.success(`Welcome back${data.user?.name ? ", " + data.user.name : ""}!`);
        navigate(data.has_profile ? "/dashboard" : "/analyze");
      }
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 403) {
        // Right password, unverified email — the backend just re-sent the link.
        setSentTo(email);
        toast.error(detail || "Please verify your email first.");
      } else if (status === 409) {
        setMode("login");
        toast.error(detail || "Account already exists — please log in.");
      } else {
        toast.error(detail || "Something went wrong. Please try again.");
      }
    }
    setEmailBusy(false);
  };

  const handleResend = async () => {
    if (!sentTo) return;
    setResending(true);
    try {
      await api.post("/auth/resend-verification", { email: sentTo });
      toast.success("Verification link sent again");
    } catch {
      toast.error("Couldn't resend right now — try again shortly");
    }
    setResending(false);
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

  // Internal test access: no public button. Visiting /auth?demo=<code> with the
  // right code auto-logs in as the demo account. Regular users never see this.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("demo");
    if (code && code === (process.env.REACT_APP_DEMO_CODE || "formanti-test-2026")) {
      handleDemoLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      if (err.response?.status === 405) {
        toast.error("Server error (405). Please try again in a moment.");
      } else if (err.code?.startsWith("auth/")) {
        toast.error(`Firebase: ${err.message}`);
      } else if (err.response) {
        toast.error(`Server error: ${err.response.status}`);
      } else {
        toast.error(err.message || "Login failed. Please try again.");
      }
    }
    setLoading(false);
  };

  // Consuming a magic link — full-screen spinner so the user isn't shown a
  // login form they're about to be redirected away from.
  if (verifying) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-zinc-950 p-6" data-testid="auth-verifying">
        <div className="w-10 h-10 border-2 border-lime-400 border-t-transparent rounded-full animate-spin mb-5" />
        <p className="text-zinc-300 text-sm">Verifying your email…</p>
      </div>
    );
  }

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
          <FormantiIcon className="h-10 mb-6" />
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
          <div className="lg:hidden mb-10">
            <FormantiLogo textClassName="font-heading font-bold text-xl uppercase tracking-tight text-white" />
          </div>

          {sentTo ? (
            /* ── Post-signup: waiting on the magic link ── */
            <div className="space-y-6" data-testid="verify-sent">
              <div className="w-14 h-14 rounded-2xl bg-lime-400/10 border border-lime-400/30 flex items-center justify-center">
                <MailCheck className="w-7 h-7 text-lime-400" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-3xl uppercase tracking-tight mb-2">Check your email</h1>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  We sent a verification link to{" "}
                  <span className="text-white font-medium break-all">{sentTo}</span>.
                  Click it to activate your account and get your{" "}
                  <span className="text-lime-400 font-semibold">100 free tokens</span>.
                </p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Can't find it? Check your spam folder — the link expires in 24 hours.
                </p>
              </div>
              <Button
                onClick={handleResend}
                disabled={resending}
                variant="outline"
                className="w-full h-12 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl"
              >
                {resending ? "Sending…" : "Resend verification link"}
              </Button>
              <Button variant="ghost" onClick={() => { setSentTo(""); setMode("login"); setEmailPass(""); }}
                className="w-full text-zinc-500 hover:text-zinc-300">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to sign in
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h1 className="font-heading font-bold text-3xl uppercase tracking-tight mb-2">
                  {mode === "signup" ? "Get Started" : "Welcome Back"}
                </h1>
                <p className="text-zinc-400 text-sm">
                  {mode === "signup"
                    ? "Create an account to save your progress, get personalized recommendations, and track your improvement."
                    : "Sign in to pick up where you left off."}
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

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-500">or</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              {/* Email + password */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold flex items-center gap-1.5">
                  <Mail className="w-3 h-3" /> {mode === "signup" ? "Sign up with email" : "Sign in with email"}
                </p>

                {mode === "signup" && (
                  <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                    disabled={emailBusy}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
                  />
                )}
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={emailAddr}
                  maxLength={120}
                  onChange={(e) => setEmailAddr(e.target.value)}
                  disabled={emailBusy}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
                />
                <input
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="Password"
                  value={emailPass}
                  maxLength={200}
                  onChange={(e) => setEmailPass(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEmailAuth(); }}
                  disabled={emailBusy}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
                />
                <Button
                  onClick={handleEmailAuth}
                  disabled={emailBusy}
                  className="w-full h-11 bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-lg text-sm"
                >
                  {emailBusy
                    ? (mode === "signup" ? "Creating account…" : "Signing in…")
                    : (mode === "signup" ? "Create account" : "Sign in")}
                </Button>

                {mode === "signup" && (
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    We'll email you a link to verify your address. Your 100 free tokens are credited once you click it.
                  </p>
                )}

                <button
                  onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setEmailPass(""); }}
                  className="w-full text-[11px] text-zinc-500 hover:text-zinc-300 pt-1"
                >
                  {mode === "signup"
                    ? "Already have an account? Sign in"
                    : "New here? Create an account"}
                </button>
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
          )}
        </motion.div>
      </div>
    </div>
  );
}
