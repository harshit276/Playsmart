/**
 * Shared sport configuration - icons, colors, emojis for all pages.
 */

export const SPORT_EMOJI = {
  badminton: "🏸",
  tennis: "🎾",
  table_tennis: "🏓",
  pickleball: "⚡",
  cricket: "🏏",
  football: "⚽",
  swimming: "🏊",
};

export const SPORT_LABEL = {
  badminton: "Badminton",
  tennis: "Tennis",
  table_tennis: "Table Tennis",
  pickleball: "Pickleball",
  cricket: "Cricket",
  football: "Football",
  swimming: "Swimming",
};

export const SPORT_COLOR = {
  badminton: { bg: "bg-lime-400", text: "text-lime-400", border: "border-lime-400/30" },
  tennis: { bg: "bg-amber-400", text: "text-amber-400", border: "border-amber-400/30" },
  table_tennis: { bg: "bg-sky-400", text: "text-sky-400", border: "border-sky-400/30" },
  pickleball: { bg: "bg-emerald-400", text: "text-emerald-400", border: "border-emerald-400/30" },
  cricket: { bg: "bg-blue-400", text: "text-blue-400", border: "border-blue-400/30" },
  football: { bg: "bg-green-400", text: "text-green-400", border: "border-green-400/30" },
  swimming: { bg: "bg-cyan-400", text: "text-cyan-400", border: "border-cyan-400/30" },
};

/** Sports that currently support AI video analysis */
export const VIDEO_ANALYSIS_SPORTS = new Set(["badminton", "tennis", "table_tennis", "pickleball", "cricket"]);

export function hasVideoAnalysis(sport) {
  return VIDEO_ANALYSIS_SPORTS.has(sport);
}

export function getSportEmoji(sport) {
  return SPORT_EMOJI[sport] || "🎯";
}

export function getSportLabel(sport) {
  return SPORT_LABEL[sport] || sport?.replace("_", " ") || "Sport";
}
