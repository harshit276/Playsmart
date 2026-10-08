/**
 * @module bodyCheck
 * The rest of the body, for racquet-sport practice: are the knees bent, is the player leaning
 * the right way, are the feet apart enough? The arm at contact has always been judged against
 * the shot's own targets (idealAngles); this is everything else.
 *
 * Two moments, because a ready stance and a contact position are different things:
 *   - READY: holding still, before the swing. Knees, back lean and stance width against a
 *     sport's "athletic stance". This is what the coach talks about between swings.
 *   - CONTACT: at the moment of the swing, only gross faults (legs locked straight, leaning
 *     back), and not at all for overhead shots, where an arched back and straight legs are
 *     normal.
 *
 * HONEST LIMITS: these are common coaching rules of thumb with generous bands, not a coach's
 * verdict, and they have not been reviewed by a coach. They say nothing about whether the
 * movement is the shot that was picked; that needs real footage of each shot to calibrate.
 *
 * Pure functions, no browser needed. Inputs are one person's MediaPipe pose for one frame:
 *   wl  — 33 world landmarks [x, y, z] metres, y pointing down;  vis — 33 visibility scores.
 */
import { measureLift } from "./liftPose.js";
import { L_SH, R_SH, L_AN, R_AN, sub, norm } from "./correctPose.js";

export const BODY_LABEL = { knee: "Knees", trunk: "Back", stance: "Stance" };

// Bands as [min, max]. knee: interior angle in degrees (180 = straight). trunk: lean in degrees
// from vertical, positive = forward. stance: feet apart as a multiple of shoulder width.
const GENERIC = { knee: [110, 165], trunk: [0, 35], stance: [1.0, 2.2] };
const READY_BY_SPORT = {
  table_tennis: { knee: [100, 150], trunk: [8, 40], stance: [1.2, 2.2] },
  badminton: { knee: [120, 165], trunk: [-5, 25], stance: [1.0, 2.0] },
  tennis: { knee: [115, 165], trunk: [0, 30], stance: [1.2, 2.2] },
  pickleball: { knee: [115, 160], trunk: [5, 30], stance: [1.0, 2.0] },
  squash: { knee: [110, 160], trunk: [5, 35], stance: [1.0, 2.0] },
};
const WHY = {
  knee: "Soft, bent knees let you push off in any direction",
  trunk: "A little forward: not upright, not hunched",
  stance: "Feet wider than your shoulders, for balance",
};

// A reading just outside a band is within the noise of a single-camera estimate, so it is not called a miss.
const TOLERANCE = { knee: 4, trunk: 4, stance: 0.12 };

const mk = (b, why) => ({ min: b[0], max: b[1], ideal: Math.round(((b[0] + b[1]) / 2) * 100) / 100, why });

/** The athletic-stance bands for a sport, as { knee, trunk, stance } = { min, max, ideal, why }. */
export function readyProfile(sport) {
  const b = READY_BY_SPORT[sport] || GENERIC;
  return { knee: mk(b.knee, WHY.knee), trunk: mk(b.trunk, WHY.trunk), stance: mk(b.stance, WHY.stance) };
}

/** Overhead shots arch the back and extend the legs on purpose, so the body isn't judged at contact. */
export function isOverheadShot(sport, shot) {
  const s = String(shot || "").toLowerCase();
  return /smash|clear|overhead|lob|jump/.test(s) || (sport === "tennis" && /serve/.test(s));
}

/** Contact: only the gross faults, and nothing for overhead shots. */
export function contactProfile(sport, shot) {
  if (isOverheadShot(sport, shot)) return {};
  return { knee: mk([100, 168], "Don't lock your legs straight as you hit"), trunk: mk([-8, 45], "Don't lean back as you hit") };
}

/**
 * Knees, back lean and stance for one frame. Sides the model can't see are left out.
 * @param {number[]|null} fwd  the way the player faces (unit [x,0,z]); without it the lean can't be told forward from back
 * @returns {{knee:number|null, trunk:number|null, stance:number|null, signed:boolean, fwdFrame:number[]|null}}
 */
export function measureBody(wl, vis, fwd = null) {
  const m = measureLift(wl, vis, fwd);
  let stance = null;
  if (Math.min(vis[L_AN], vis[R_AN]) >= 0.5 && Math.min(vis[L_SH], vis[R_SH]) >= 0.5) {
    const shoulderW = norm(sub(wl[L_SH], wl[R_SH]));
    const gap = Math.hypot(wl[L_AN][0] - wl[R_AN][0], wl[L_AN][2] - wl[R_AN][2]);
    if (shoulderW > 0.1) stance = gap / shoulderW;
  }
  return { knee: m.knee, trunk: m.signed ? m.trunk : null, stance, signed: m.signed, fwdFrame: m.fwdFrame };
}

// ─── what to say ───
const SAY = {
  knee: (low) => (low ? "Stand a little taller" : "Bend your knees"),
  trunk: (low) => (low ? "Lean forward a little" : "Chest up, don't hunch"),
  stance: (low) => (low ? "Feet a bit wider" : "Bring your feet in a little"),
};
const CUE = {
  knee: (low) => (low
    ? { headline: "Stand a little taller", feel: "You're sitting too low to move quickly. Come up a touch so you can push off.", drill: "Hold your ready stance for 20 seconds, then split-step and react." }
    : { headline: "Bend your knees", feel: "Soft, bent knees let you push off in any direction. Locked legs make you slow to react.", drill: "Hold a low ready stance for 20 seconds between reps." }),
  trunk: (low) => (low
    ? { headline: "Lean forward a little", feel: "Tip forward from the hips so your weight is over the balls of your feet, ready to move.", drill: "Practise the ready stance in front of a mirror: nose over toes." }
    : { headline: "Chest up, don't hunch", feel: "You're folding too far forward. Keep your chest up and your back long.", drill: "Hold the ready stance with your chest proud for 20 seconds." }),
  stance: (low) => (low
    ? { headline: "Feet a bit wider", feel: "Feet wider than your shoulders give you a stable base to hit from and push off.", drill: "Set your feet just outside your shoulders, then shadow 10 swings without them drifting in." }
    : { headline: "Bring your feet in a little", feel: "A very wide stance makes it slow to recover. Aim for just wider than your shoulders.", drill: "Shadow 10 swings and step back to a shoulder-plus stance after each." }),
};

/**
 * What is out of range in the body, worst first, each with the few words to say and the full cue.
 * @param {"ready"|"contact"} phase
 * @param {{knee?:number|null, trunk?:number|null, stance?:number|null}} vals
 * @param {{sport:string, shot?:string, skip?:string[]}} o  skip: measures to leave out (e.g. knee when the shot has its own knee target)
 */
export function bodyFaults(phase, vals, { sport, shot = "", skip = [] }) {
  const prof = phase === "ready" ? readyProfile(sport) : contactProfile(sport, shot);
  const out = [];
  for (const j of ["knee", "trunk", "stance"]) {
    const r = prof[j];
    const v = vals?.[j];
    if (!r || v == null || skip.includes(j)) continue;
    const miss = v < r.min ? r.min - v : v > r.max ? v - r.max : 0;
    if (miss <= TOLERANCE[j]) continue;
    const low = v < r.min;
    out.push({
      key: `body.${j}`,
      area: "body",
      joint: j,
      value: v,
      range: r,
      say: SAY[j](low),
      cue: CUE[j](low),
      severity: miss / (j === "stance" ? 0.4 : Math.max(10, (r.max - r.min) / 2)),
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/** "ok", "off" or "na" (not measured / not judged) for one reading: the chips and the coach share this. */
export function bodyState(phase, joint, value, { sport, shot = "" }) {
  const prof = phase === "ready" ? readyProfile(sport) : contactProfile(sport, shot);
  const r = prof[joint];
  if (!r || value == null) return "na";
  const miss = value < r.min ? r.min - value : value > r.max ? value - r.max : 0;
  return miss <= TOLERANCE[joint] ? "ok" : "off";
}

/** Degrees to move knee and trunk to the middle of their band, for drawing the corrected stance. */
export function bodyDelta(phase, vals, { sport, shot = "", skip = [] }) {
  const faults = bodyFaults(phase, vals, { sport, shot, skip });
  const delta = { knee: 0, trunk: 0 };
  for (const f of faults) if (f.joint === "knee" || f.joint === "trunk") delta[f.joint] = f.range.ideal - f.value;
  return { delta, faults };
}
