import { IDEAL_ANGLES, getIdealAngles } from "@/ai/idealAngles";

/**
 * What live practice can coach. Racquet sports only for now: the moment that
 * matters is a swing, and the swing detector keys on hitting-arm speed. Every
 * shot listed has curated target angles (idealAngles); none are invented here.
 */
export const PRACTICE_SPORTS = [
  { key: "badminton", label: "Badminton" },
  { key: "tennis", label: "Tennis" },
  { key: "table_tennis", label: "Table tennis" },
  { key: "pickleball", label: "Pickleball" },
  { key: "squash", label: "Squash" },
];

const prettyKey = (k) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** "Smash — overhead contact" → "Smash". */
export const shortShotName = (label, key) => (label ? label.split(/\s+[—-]\s+/)[0] : prettyKey(key));

export function shotsFor(sport) {
  const table = IDEAL_ANGLES[sport];
  if (!table) return [];
  return Object.entries(table).map(([key, v]) => ({ key, label: v.label || prettyKey(key), name: shortShotName(v.label, key) }));
}

/**
 * Turn free text from the analysis ("Forehand Drive - Flat Crosscourt") into a
 * practiceable shot for `sport`, or null when we have no targets for it.
 */
export function resolveShot(sport, shotText) {
  const table = IDEAL_ANGLES[sport];
  if (!table) return null;
  if (table[shotText]) return { key: shotText, label: table[shotText].label, ideal: table[shotText] };
  const ideal = getIdealAngles(sport, shotText);
  if (!ideal) return null;
  const key = Object.keys(table).find((k) => table[k] === ideal);
  return key ? { key, label: ideal.label, ideal } : null;
}

export const isPracticeSport = (s) => PRACTICE_SPORTS.some((p) => p.key === s);

/** The link that opens live practice for a sport + shot (+ the joint to work on). */
export function practiceUrl({ sport, shot, focus }) {
  const q = new URLSearchParams();
  if (sport) q.set("sport", sport);
  if (shot) q.set("shot", shot);
  if (focus) q.set("focus", focus);
  return `/practice?${q.toString()}`;
}
