/**
 * @module posturePolicy
 * Which sports the posture tracker is actually meaningful for.
 *
 * Deliberately dependency-free: poseOverlay imports TensorFlow.js eagerly, so
 * anything that touches it drags in a multi-megabyte bundle. Callers check
 * support from HERE first and only lazy-import the pose stack once a sport
 * qualifies — a swimmer never downloads a model that can't read their stroke.
 *
 * The tracker models exactly ONE movement archetype: a *unilateral strike* —
 * one dominant limb, measured at a single contact instant, graded against
 * curated ideal joint ranges. A sport is listed below only if it fits that
 * archetype AND has curated ranges in poseOverlay's IDEAL_ANGLES. Without a
 * range we can only print a bare number with no sense of whether it's good,
 * which isn't worth the page space or the user's attention.
 *
 * Deliberately NOT supported:
 *   - swimming — MoveNet is trained on upright land poses. A horizontal body
 *     under water, with splash and partial occlusion, produces junk keypoints,
 *     and there is no single contact instant (the stroke is cyclic).
 *   - football — the meaningful joints are the plant foot and the kicking
 *     leg's hip/knee/ankle chain, not a dominant arm. Different archetype.
 *   - gym / strength training — bilateral and rep-based. The useful measures
 *     are hip depth, spine angle and left/right symmetry at the bottom of a
 *     rep, which needs rep detection and a known camera view. Not built yet.
 *
 * Keep in sync with IDEAL_ANGLES; poseOverlay dev-warns if they drift.
 */

export const POSTURE_SUPPORTED_SPORTS = new Set([
  "badminton",
  "tennis",
  "table_tennis",
  "pickleball",
  "squash",
  "cricket",
  "basketball",
  "volleyball",
  "baseball",
  "golf",
]);

// Same shape as poseOverlay's internal normalizer + alias map, duplicated here
// only because this module must stay free of the TF-heavy import chain.
const SPORT_ALIASES = {
  ttennis: "table_tennis",
  pingpong: "table_tennis",
  ping_pong: "table_tennis",
  "ping-pong": "table_tennis",
  bball: "basketball",
  baseball_softball: "baseball",
  fielding: "cricket",
  batting: "cricket",
  bowling: "cricket",
};

export function normalizeSport(sport) {
  const s = (sport || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  return SPORT_ALIASES[s] || s;
}

/** True when the posture tracker can say something useful about this sport. */
export function isPostureSupported(sport) {
  return POSTURE_SUPPORTED_SPORTS.has(normalizeSport(sport));
}
