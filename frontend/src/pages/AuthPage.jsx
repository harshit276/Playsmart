import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Zap, Phone, ArrowLeft } from "lucide-react";
import api from "@/lib/api";

export default function AuthPage() {
  const [step, setStep] = useState("phone"); // phone | otp
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpHint, setOtpHint] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (phone.length < 10) { toast.error("Enter a valid phone number"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/send-otp", { phone });
      setOtpHint(data.otp_hint || "");
      setStep("otp");
      toast.success("OTP sent!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send OTP");
    }
    setLoading(false);
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) { toast.error("Enter 6-digit OTP"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/verify-otp", { phone, otp });
      login(data.token, data.user, data.has_profile);
      toast.success("Welcome to PlaySmart!");
      navigate(data.has_profile ? "/dashboard" : "/assessment");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid OTP");
    }
    setLoading(false);
  };

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
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}
          className="w-full max-w-sm">

          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Zap className="w-6 h-6 text-lime-400" />
            <span className="font-heading font-bold text-xl uppercase tracking-tight">PlaySmart</span>
          </div>

          {step === "phone" ? (
            <form onSubmit={handleSendOTP} className="space-y-6">
              <div>
                <h1 className="font-heading font-bold text-3xl uppercase tracking-tight mb-2" data-testid="auth-title">Get Started</h1>
                <p className="text-zinc-400 text-sm">Enter your mobile number to receive an OTP.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-zinc-300 text-sm">Mobile Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input id="phone" type="tel" placeholder="Enter your phone number" value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10 bg-zinc-950 border-zinc-800 focus:border-lime-400 focus:ring-lime-400 h-12 text-white"
                    data-testid="phone-input" />
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
          ) : (
            <div className="space-y-6">
              <div>
                <h1 className="font-heading font-bold text-3xl uppercase tracking-tight mb-2" data-testid="otp-title">Verify OTP</h1>
                <p className="text-zinc-400 text-sm">Enter the 6-digit code sent to <span className="text-lime-400">{phone}</span></p>
              </div>

              {otpHint && (
                <div className="bg-lime-400/10 border border-lime-400/20 rounded-lg p-3 text-center">
                  <p className="text-xs text-zinc-400 mb-1">Demo OTP</p>
                  <p className="text-lime-400 font-mono text-xl font-bold tracking-[0.3em]" data-testid="otp-hint">{otpHint}</p>
                </div>
              )}

              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp} data-testid="otp-input">
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map(i => (
                      <InputOTPSlot key={i} index={i}
                        className="w-11 h-12 text-lg bg-zinc-950 border-zinc-700 text-white data-[active]:border-lime-400 data-[active]:ring-lime-400" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button onClick={handleVerifyOTP} disabled={loading || otp.length !== 6} data-testid="verify-otp-btn"
                className="w-full bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide h-12 rounded-full shadow-[0_0_15px_rgba(190,242,100,0.2)]">
                {loading ? "Verifying..." : "Verify & Continue"}
              </Button>
              <Button variant="ghost" onClick={() => { setStep("phone"); setOtp(""); }} className="w-full text-zinc-500 hover:text-zinc-300" data-testid="change-phone-btn">
                <ArrowLeft className="w-4 h-4 mr-2" /> Change Number
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
