// SpeakTipButton — was a per-card "Listen" button (Volume2 icon) that
// read individual coaching tips via window.speechSynthesis. Removed in
// favour of the single auto-narrated summary that fires once on
// analysis load (see VoiceCoachButton) plus the live coach pill.
//
// Kept as a no-op component so callsites in MatchInsights /
// CoachNarrativeCard / SessionSummaryHero / ImprovementCards /
// FormComparisonModal don't need to be edited in lockstep — they
// continue to render `<SpeakTipButton ... />` but the button is gone.
//
// To revert: `git show HEAD~1:frontend/src/components/SpeakTipButton.jsx`
// gives back the full implementation.

export default function SpeakTipButton() {
  return null;
}
