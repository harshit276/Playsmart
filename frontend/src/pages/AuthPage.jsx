import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Phone, ArrowLeft, Clock, RefreshCw } from "lucide-react";
import api from "@/lib/api";

const OTP_EXPIRY_SECONDS = 300; // 5 minutes

const normalizePhone = (raw) => {
  const digits = raw.replace(/[^0-9+]/g, "");
  // If user entered 10 digits (Indian number), prepend +91
  if (/^\d{10}$/.test(digits)) return "+91" + digits;
  // If starts with 91 and 12 digits total, add +
  if (/^91\d{10}$/.test(digits)) return "+" + digits;
  // Already has + prefix
  if (digits.startsWith("+")) return digits;
  return digits;
};

const isValidPhone = (phone) => {
  const normalized = normalizePhone(phone);
  // Indian: +91 followed by 10 digits
  if (/^\+91\d{10}$/.test(normalized)) return true;
  // International: + followed by 7-15 digits
  if (/^\+\d{7,15}$/.test(normalized)) return true;
  return false;
};

export default function AuthPage() {
  const [step, setStep] = useState("phone"); // phone | otp
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpHint, setOtpHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!isValidPhone(phone)) {
      toast.error("Enter a valid mobile number (10 digits or international format)");
      return;
    }
    setLoading(true);
    try {
      const normalized = normalizePhone(phone.trim());
      const { data } = await api.post("/auth/send-otp", { phone: normalized });
      setOtpHint(data.otp_hint || "");
      setSecondsLeft(data.expires_in || OTP_EXPIRY_SECONDS);
      setStep("otp");
      toast.success("OTP sent to your mobile number!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send OTP");
    }
    setLoading(false);
  };

  const handleResendOTP = async () => {
    setLoading(true);
    setOtp("");
    try {
      const normalized = normalizePhone(phone.trim());
      const { data } = await api.post("/auth/send-otp", { phone: normalized });
      setOtpHint(data.otp_hint || "");
      setSecondsLeft(data.expires_in || OTP_EXPIRY_SECONDS);
      toast.success("New OTP sent!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to resend OTP");
    }
    setLoading(false);
  };

  const handleVerifyOTP = useCallback(async (otpValue) => {
    const code = otpValue || otp;
    if (code.length !== 6) { toast.error("Enter 6-digit OTP"); return; }
    setLoading(true);
    try {
      const normalized = normalizePhone(phone.trim());
      const { data } = await api.post("/auth/verify-otp", { phone: normalized, otp: code });
      login(data.token, data.user, data.has_profile);
      toast.success("Welcome to AthlyticAI!");
      navigate(data.has_profile ? "/dashboard" : "/assessment");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid OTP");
    }
    setLoading(false);
  }, [otp, phone, login, navigate]);

  const otpRefs = useRef([]);

  const handleOtpDigit = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const digits = otp.split("");
    while (digits.length < 6) digits.push("");
    digits[index] = value;
    const newOtp = digits.join("");
    setOtp(newOtp);
    // Auto-focus next
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    // Auto-submit when all 6 digits entered
    if (newOtp.length === 6 && !newOtp.includes("")) {
      const clean = newOtp.replace(/\s/g, "");
      if (clean.length === 6) handleVerifyOTP(clean);
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    setOtp(pasted);
    if (pasted.length === 6) handleVerifyOTP(pasted);
  };

  const timerExpired = step === "otp" && secondsLeft <= 0;

  return (
    <div className="min-h-screen flex" data-testid="auth-page">
      {/* Left - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-zinc-900" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1200&q=60')", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="absolute inset-0 bg-zinc-950/60" />
        <div className="relative z-10 p-12 max-w-md">
          <Zap className="w-10 h-10 text-lime-400 mb-6" />
          <h2 className="font-heading font-black text-4xl uppercase tracking-tighter text-white leading-tight mb-4">
            Your Game,<br /><span className="text-lime-400">Elevated.</span>
          </h2>
          <p className="text-zinc-300 leading-relaxed">Personalized recommendations backed by real data. No guesswork, just science.</p>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-zinc-950">
        <AnimatePresence mode="wait">
          {step === "phone" ? (
            <motion.div
              key="phone-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-sm"
            >
              <div className="lg:hidden flex items-center gap-2 mb-8">
                <Zap className="w-6 h-6 text-lime-400" />
                <span className="font-heading font-bold text-xl uppercase tracking-tight">AthlyticAI</span>
              </div>

              <form onSubmit={handleSendOTP} className="space-y-6">
                <div>
                  <h1 className="font-heading font-bold text-3xl uppercase tracking-tight mb-2" data-testid="auth-title">Get Started</h1>
                  <p className="text-zinc-400 text-sm">Enter your mobile number to receive a one-time password.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-zinc-300 text-sm">Mobile Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input id="phone" type="tel" inputMode="numeric" placeholder="+91 9876543210" value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-10 bg-zinc-950 border-zinc-800 focus:border-lime-400 focus:ring-lime-400 h-12 text-white"
                      data-testid="phone-input"
                      autoComplete="tel" />
                  </div>
                </div>
                <Button type="submit" disabled={loading} data-testid="send-otp-btn"
                  className="w-full bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide h-12 rounded-full shadow-[0_0_15px_rgba(190,242,100,0.2)]">
                  {loading ? "Sending..." : "Send OTP"}
                </Button>
                <Button variant="ghost" onClick={() => navigate("/")} className="w-full text-zinc-500 hover:text-zinc-300" data-testid="back-to-home">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
                </Button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="otp-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-sm"
            >
              <div className="lg:hidden flex items-center gap-2 mb-8">
                <Zap className="w-6 h-6 text-lime-400" />
                <span className="font-heading font-bold text-xl uppercase tracking-tight">AthlyticAI</span>
              </div>

              <div className="space-y-6">
                <div>
                  <h1 className="font-heading font-bold text-3xl uppercase tracking-tight mb-2" data-testid="otp-title">Verify OTP</h1>
                  <p className="text-zinc-400 text-sm">Enter the 6-digit code sent to <span className="text-lime-400">{normalizePhone(phone)}</span></p>
                </div>

                {otpHint && (
                  <div className="bg-lime-400/10 border border-lime-400/20 rounded-lg p-3 text-center">
                    <p className="text-xs text-zinc-400 mb-1">Demo OTP (dev mode)</p>
                    <p className="text-lime-400 font-mono text-xl font-bold tracking-[0.3em]" data-testid="otp-hint">{otpHint}</p>
                  </div>
                )}

                {/* Timer */}
                <div className="flex items-center justify-center gap-2">
                  <Clock className={`w-4 h-4 ${timerExpired ? "text-red-400" : "text-zinc-400"}`} />
                  {timerExpired ? (
                    <span className="text-red-400 text-sm font-medium">OTP expired</span>
                  ) : (
                    <span className="text-zinc-400 text-sm font-mono">
                      Expires in <span className={`font-bold ${secondsLeft <= 60 ? "text-orange-400" : "text-lime-400"}`}>{formatTime(secondsLeft)}</span>
                    </span>
                  )}
                </div>

                <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <input
                      key={i}
                      ref={el => otpRefs.current[i] = el}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={otp[i] || ""}
                      onChange={e => handleOtpDigit(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      disabled={timerExpired}
                      className="w-11 h-12 text-center text-lg font-mono font-bold rounded-md bg-zinc-950 border border-zinc-700 text-white focus:border-lime-400 focus:ring-1 focus:ring-lime-400 focus:outline-none disabled:opacity-50 transition-all"
                      data-testid={`otp-digit-${i}`}
                    />
                  ))}
                </div>

                <Button onClick={() => handleVerifyOTP()} disabled={loading || otp.length !== 6 || timerExpired} data-testid="verify-otp-btn"
                  className="w-full bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide h-12 rounded-full shadow-[0_0_15px_rgba(190,242,100,0.2)]">
                  {loading ? "Verifying..." : "Verify & Continue"}
                </Button>

                {/* Resend / Change email */}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => { setStep("phone"); setOtp(""); setSecondsLeft(0); }}
                    className="flex-1 text-zinc-500 hover:text-zinc-300 text-sm" data-testid="change-phone-btn">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Change Number
                  </Button>
                  <Button variant="ghost" onClick={handleResendOTP} disabled={loading}
                    className="flex-1 text-zinc-500 hover:text-zinc-300 text-sm" data-testid="resend-otp-btn">
                    <RefreshCw className="w-4 h-4 mr-1" /> Resend OTP
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
