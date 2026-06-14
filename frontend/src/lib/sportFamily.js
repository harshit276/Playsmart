// Which metric SET a sport belongs to. The racquet metrics (shots/min,
// aggression %, FH/BH) are meaningless for a gym or running clip, so the
// results UI branches on this. Keyword-matched against the sport Gemini
// detected (free-form names like "Strength Training", "Bodyweight
// Exercise", "Weightlifting", "Trail Running").
const RACQUET = ["badminton", "tennis", "table_tennis", "ping_pong", "pickleball", "squash", "padel"];
const STRENGTH = ["weightlift", "strength", "gym", "workout", "calisthenic", "bodybuild", "crossfit", "bodyweight", "fitness", "powerlift"];
const CONTINUOUS = ["run", "jog", "sprint", "cycl", "swim", "row", "tread", "ellipt", "skip"];

export function sportFamily(sport) {
  const s = (sport || "").toLowerCase().replace(/\s+/g, "_");
  if (!s || s === "unknown") return "racquet"; // blank → legacy racquet behaviour
  if (RACQUET.some((k) => s.includes(k))) return "racquet";
  if (STRENGTH.some((k) => s.includes(k))) return "strength";
  if (CONTINUOUS.some((k) => s.includes(k))) return "continuous";
  return "other";
}
