import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Zap } from "lucide-react";
import api from "@/lib/api";

const STEPS = [
  { key: "skill_level", title: "What's Your Experience?", subtitle: "Be honest — this helps us recommend the right gear.",
    options: [
      { value: "Beginner", label: "Beginner", desc: "Just starting out, learning basic shots" },
      { value: "Beginner+", label: "Beginner+", desc: "Know basics, developing consistency" },
      { value: "Intermediate", label: "Intermediate", desc: "Comfortable in rallies, working on strategy" },
      { value: "Advanced", label: "Advanced", desc: "Competitive player with strong technique" },
    ]},
  { key: "play_style", title: "How Do You Play?", subtitle: "Your dominant style shapes equipment choice.",
    options: [
      { value: "Power", label: "Power", desc: "Aggressive smashes and attacking play" },
      { value: "Control", label: "Control", desc: "Precise placement and deception" },
      { value: "Speed", label: "Speed", desc: "Fast rallies, quick reactions" },
      { value: "All-round", label: "All-round", desc: "Balanced mix of all styles" },
      { value: "Defense", label: "Defense", desc: "Solid returns and counter-attacks" },
    ]},
  { key: "playing_frequency", title: "How Often Do You Play?", subtitle: "Frequency affects equipment durability needs.",
    options: [
      { value: "1-2 days/week", label: "1-2 days/week", desc: "Casual / recreational" },
      { value: "3-4 days/week", label: "3-4 days/week", desc: "Regular player" },
      { value: "5-7 days/week", label: "5-7 days/week", desc: "Serious / competitive" },
    ]},
  { key: "budget_range", title: "What's Your Budget?", subtitle: "We'll find the best value at every price point.",
    options: [
      { value: "Low", label: "Budget Friendly", desc: "Under 3,000" },
      { value: "Medium", label: "Mid Range", desc: "3,000 - 8,000" },
      { value: "High", label: "Performance", desc: "8,000 - 15,000" },
      { value: "Premium", label: "Premium", desc: "15,000+" },
    ]},
  { key: "primary_goal", title: "What's Your Main Goal?", subtitle: "This shapes your training and equipment priority.",
    options: [
      { value: "Power", label: "More Power", desc: "Harder smashes, stronger shots" },
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

export default function AssessmentPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  const step = STEPS[currentStep];
  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const canProceed = !!answers[step.key];

  const handleNext = async () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setLoading(true);
      try {
        await api.post("/profile", answers);
        await refreshProfile();
        toast.success("Profile created! Let's see your recommendations.");
        navigate("/dashboard");
      } catch (err) {
        toast.error(err.response?.data?.detail || "Failed to create profile");
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 pt-8 pb-16" data-testid="assessment-page">
      <div className="container mx-auto px-4 max-w-2xl">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Step {currentStep + 1} of {STEPS.length}</span>
            <span className="text-xs text-lime-400 font-mono">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-1.5 bg-zinc-800 [&>div]:bg-lime-400" data-testid="assessment-progress" />
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
            <div className="mb-8">
              <h1 className="font-heading font-bold text-3xl md:text-4xl uppercase tracking-tight text-white mb-2" data-testid="step-title">{step.title}</h1>
              <p className="text-zinc-400">{step.subtitle}</p>
            </div>

            <RadioGroup value={answers[step.key] || ""} onValueChange={(v) => setAnswers({ ...answers, [step.key]: v })} className="space-y-3" data-testid="step-options">
              {step.options.map((opt) => (
                <Label key={opt.value} htmlFor={opt.value}
                  className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                    answers[step.key] === opt.value
                      ? "border-lime-400/50 bg-lime-400/5 shadow-[0_0_15px_rgba(190,242,100,0.1)]"
                      : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                  }`} data-testid={`option-${opt.value}`}>
                  <RadioGroupItem value={opt.value} id={opt.value} className="mt-0.5 border-zinc-600 data-[state=checked]:border-lime-400 data-[state=checked]:bg-lime-400" />
                  <div>
                    <p className="font-semibold text-white text-sm">{opt.label}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">{opt.desc}</p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex gap-3 mt-10">
          {currentStep > 0 && (
            <Button variant="ghost" onClick={() => setCurrentStep(currentStep - 1)}
              className="text-zinc-400 hover:text-white border border-zinc-800 rounded-full px-6" data-testid="prev-step-btn">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          <Button onClick={handleNext} disabled={!canProceed || loading}
            className="flex-1 bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide rounded-full h-12 shadow-[0_0_15px_rgba(190,242,100,0.2)]"
            data-testid="next-step-btn">
            {loading ? "Creating Profile..." : currentStep === STEPS.length - 1 ? (
              <><Zap className="w-4 h-4 mr-2" /> Get My Recommendations</>
            ) : (
              <>Continue <ChevronRight className="w-4 h-4 ml-1" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
