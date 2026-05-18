import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Edit3, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const SPORT_LABELS = {
  badminton: "Badminton",
  tennis: "Tennis",
  table_tennis: "Table Tennis",
  pickleball: "Pickleball",
  cricket: "Cricket",
  football: "Football",
  swimming: "Swimming",
};

const SKILL_DESC = {
  Beginner: "Just getting started, learning the basics",
  Intermediate: "Comfortable with rallies, working on consistency",
  Advanced: "Solid technique, competing in club matches",
  Pro: "Tournament-level player",
};

/**
 * Shown after a NEW user (no profile yet) finishes their first analysis.
 * Offers two paths: auto-fill profile from this analysis, OR take the
 * 30-second quiz. Either path unlocks the dashboard.
 */
export default function PostAnalysisProfilePrompt({
  open,
  onClose,
  analysisResult,
  onProfileSaved,
  onTakeQuiz,
}) {
  const [saving, setSaving] = useState(false);

  if (!analysisResult) return null;

  const sport = analysisResult.sport || "badminton";
  const skillLevel = analysisResult.skill_level || "Beginner";
  const shotType = analysisResult.shot_type || analysisResult.shot_analysis?.shot_type;
  const sportLabel = SPORT_LABELS[sport] || sport;

  const autoFill = async () => {
    setSaving(true);
    try {
      // Minimal profile derived from the analysis. User can refine later
      // via the regular /assessment page from their profile.
      const profilePayload = {
        selected_sports: [sport],
        sports_profiles: {
          [sport]: {
            level: skillLevel,
            years_played: 1,
            primary_goals: ["Improve technique"],
          },
        },
        goals: ["Improve technique"],
        active_sport: sport,
        play_style_personality: null,
        quiz_answers: {
          _auto_filled_from_analysis: true,
          _analysis_id: analysisResult.analysis_id,
          _initial_skill: skillLevel,
        },
      };
      await api.post("/profile", profilePayload, { timeout: 10000 });
      toast.success("Profile created from your analysis!");
      onProfileSaved?.();
      onClose?.();
    } catch (err) {
      toast.error("Couldn't save profile — try the quiz instead");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md p-0 overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-lime-400/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-lime-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">Want better coaching?</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Set up your player profile in 5 seconds — we already know enough from your analysis.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 p-1"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 mb-5">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">
              From your analysis
            </p>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Sport</span>
                <span className="text-white font-medium">{sportLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Skill level</span>
                <span className="text-lime-400 font-semibold">{skillLevel}</span>
              </div>
              {shotType && shotType !== "unknown" && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Last shot</span>
                  <span className="text-white font-medium capitalize">{shotType.replace(/_/g, " ")}</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
              {SKILL_DESC[skillLevel] || "We'll personalize drills + gear for this level."}
            </p>
          </div>

          <div className="space-y-2">
            <Button
              onClick={autoFill}
              disabled={saving}
              className="w-full h-12 bg-lime-400 hover:bg-lime-500 text-black font-semibold rounded-xl"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Use this — set up my profile
                </>
              )}
            </Button>
            <Button
              onClick={() => {
                onClose?.();
                onTakeQuiz?.();
              }}
              disabled={saving}
              variant="ghost"
              className="w-full h-12 text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Take 30-second quiz instead
            </Button>
            <button
              onClick={onClose}
              disabled={saving}
              className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-2"
            >
              Skip for now
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
