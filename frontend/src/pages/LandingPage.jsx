import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Zap, Target, Dumbbell, BarChart3, Play, ShieldCheck, ChevronRight } from "lucide-react";

const FEATURES = [
  { icon: Target, title: "AI Equipment Match", desc: "Data-driven racket recommendations based on your exact profile.", color: "text-lime-400" },
  { icon: Dumbbell, title: "Training Plans", desc: "Structured 30-day programs tailored to your skill level.", color: "text-sky-400" },
  { icon: BarChart3, title: "Progress Tracking", desc: "Track streaks, completed sessions, and skill development.", color: "text-purple-400" },
  { icon: Play, title: "Video Tutorials", desc: "Curated coaching videos from top badminton channels.", color: "text-amber-400" },
  { icon: ShieldCheck, title: "Price Comparison", desc: "Compare prices across Amazon, Flipkart, and Decathlon.", color: "text-emerald-400" },
  { icon: Zap, title: "Skill Assessment", desc: "Understand your level, strengths, and areas to improve.", color: "text-rose-400" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuth();

  const handleCTA = () => {
    if (isAuthenticated && profile) navigate("/dashboard");
    else if (isAuthenticated) navigate("/assessment");
    else navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-900/50 to-zinc-950" />
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1613918431703-aa50889e3be4?w=1920&q=60')", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="absolute inset-0 bg-zinc-950/70" />

        <div className="relative z-10 container mx-auto px-4 max-w-5xl text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lime-400/10 border border-lime-400/20 mb-8" data-testid="hero-badge">
              <Zap className="w-4 h-4 text-lime-400" />
              <span className="text-sm font-medium text-lime-400 tracking-wide">AI-Powered Badminton Companion</span>
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
            className="font-heading font-black text-5xl md:text-7xl lg:text-8xl tracking-tighter uppercase leading-[0.9] mb-6" data-testid="hero-heading">
            <span className="text-white">Train Smarter.</span><br />
            <span className="neon-glow text-lime-400">Buy Right.</span><br />
            <span className="text-white">Play Better.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
            className="text-lg text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed" data-testid="hero-subtitle">
            Personalized equipment recommendations, structured training plans, and progress tracking — all powered by deterministic AI that explains every decision.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}>
            <Button onClick={handleCTA} size="lg" data-testid="hero-cta-btn"
              className="bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide px-10 py-6 text-lg rounded-full shadow-[0_0_20px_rgba(190,242,100,0.3)] hover:shadow-[0_0_30px_rgba(190,242,100,0.5)] transition-all hover:scale-105 active:scale-95">
              Start Skill Assessment <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-zinc-950" data-testid="features-section">
        <div className="container mx-auto px-4 max-w-7xl">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="font-heading font-bold text-3xl md:text-5xl tracking-tight uppercase text-white mb-4">Everything You Need</h2>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto">Data-driven tools to elevate every aspect of your badminton game.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-lime-400/30 transition-all duration-300 card-glow cursor-pointer"
                data-testid={`feature-card-${i}`}>
                <f.icon className={`w-8 h-8 ${f.color} mb-4`} strokeWidth={1.5} />
                <h3 className="font-heading font-semibold text-xl text-white mb-2 tracking-tight">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-zinc-950 border-t border-zinc-800/50">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h2 className="font-heading font-bold text-3xl md:text-5xl uppercase tracking-tight text-white mb-4">Ready to Level Up?</h2>
          <p className="text-zinc-400 text-lg mb-8">Join players who train smarter, not harder. Start with a free skill assessment.</p>
          <Button onClick={handleCTA} size="lg" data-testid="cta-bottom-btn"
            className="bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide px-10 py-5 text-base rounded-full shadow-[0_0_20px_rgba(190,242,100,0.3)] hover:scale-105 transition-all">
            Get Started Free <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-zinc-800/50 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-lime-400" />
          <span className="font-heading font-bold text-sm uppercase tracking-wide text-zinc-500">PlaySmart</span>
        </div>
        <p className="text-zinc-600 text-xs">AI-powered badminton companion. All recommendations are data-driven.</p>
      </footer>
    </div>
  );
}
