/**
 * What live practice does with a shot, in three steps, built from the engine's own data: nothing here is
 * written separately, so the page cannot promise a check or a drill the coach does not really do.
 *
 *   1. the ready stance   (ai/bodyCheck readyProfile: knees, back, feet; the coach speaks while you hold still)
 *   2. the swing          (idealAngles: arm / elbow / knee at contact, or reach / prep / speed for overhead shots)
 *   3. the drills         (ai/fixCues + ai/overheadSwing + ai/bodyCheck cues: what you are told to do about each miss,
 *                          with the line the voice coach says and the drill you are given)
 *
 * Lifting is the same idea with a setup and a lockout instead of a ready stance and a swing.
 */
import { IDEAL_ANGLES } from "@/ai/idealAngles";
import { fixCue } from "@/ai/fixCues";
import { usesReach, widen, REACH_CUE, PREP_CUE, SPEED_CUE } from "@/ai/overheadSwing";
import { readyProfile, bodyFaults } from "@/ai/bodyCheck";
import { LIFTS, liftCue, liftSay } from "@/ai/liftPose";
import { jointLabel } from "@/ai/exercises";
import { BANK } from "@/ai/coachPhrases";
import { shortShotName } from "@/lib/practiceShots";
import { strokeRule, strokeCue, heightWords, grossOnly } from "@/ai/strokeRules";

const deg = (r) => (r.unit ? `at least ${r.min}× your torso above the shoulders` : `${r.min}–${r.max}°`);
const spoken = (key) => (BANK[key] && BANK[key][0]) || null;
const atTop = (cue) => ({ ...cue, headline: cue.headline.replace(/ at contact$/, " at the top of the swing") });

const ARM_LABEL = {
  shoulder: ["Arm too low", "Arm too high"],
  elbow: ["Arm too bent", "Arm locked straight"],
  knee: ["Standing too low", "Legs too straight"],
};

/** @returns {null | {kind:"racquet", sport:string, key:string, name:string, overhead:boolean, ready:object, swing:object, drills:object[]}} */
export function racquetBreakdown(sport, key) {
  const ideal = IDEAL_ANGLES[sport]?.[key];
  if (!ideal) return null;
  const overhead = usesReach(sport, key, ideal);
  // shots not hit up high are judged by where the hand is at contact (ai/strokeRules); their arm angles only count when far off
  const rule = !overhead ? strokeRule(sport, key) : null;
  const w = overhead ? widen(ideal) : rule ? grossOnly(ideal) : ideal;
  const rp = readyProfile(sport);

  const ready = {
    title: "Your ready stance",
    sub: "Hold still between swings and the coach talks you into position.",
    checks: [
      { label: "Knees", range: deg(rp.knee), why: rp.knee.why },
      { label: "Back lean", range: `${rp.trunk.min}–${rp.trunk.max}° forward`, why: rp.trunk.why },
      { label: "Feet apart", range: `${rp.stance.min}–${rp.stance.max}× shoulder width`, why: rp.stance.why },
    ],
    say: [spoken("ready.knee.high"), spoken("ready.trunk.high")].filter(Boolean),
    show: "Wherever you are off, the correct stance appears in green on your own skeleton.",
  };

  const checks = [];
  if (overhead) checks.push({ label: "Reach", range: "hand clearly above your shoulder", why: "an overhead shot is hit up high" });
  if (rule) {
    if (rule.front) checks.push({ label: "Contact in front", range: "hand clearly in front of your shoulder", why: "meet it in front of you, not beside or behind" });
    if (rule.height) checks.push({ label: "Contact height", range: heightWords(rule.height), why: "the height this shot is usually hit at" });
    if (rule.back) checks.push({ label: "Backswing", range: "short and compact", why: "less swing back means more control on this shot" });
    if (rule.kneeMax) checks.push({ label: "Knee bend", range: `bent: under ${rule.kneeMax}°`, why: "get low with your legs, not your back" });
  }
  if (w.shoulder) checks.push({ label: overhead ? "Arm height at the top" : rule ? "Arm height (only if far off)" : "Arm height at contact", range: deg(w.shoulder), why: ideal.shoulder.why });
  if (w.elbow) checks.push({ label: rule ? "Elbow (only if far off)" : "Elbow", range: deg(w.elbow), why: ideal.elbow.why });
  if (overhead) checks.push({ label: "Elbow lead", range: "elbow up before you swing", why: "lead with the elbow, then throw" });
  if (ideal.knee && !rule?.kneeMax) checks.push({ label: "Knee bend", range: deg(ideal.knee), why: ideal.knee.why });
  if (overhead) checks.push({ label: "Speed", range: "against your own other swings", why: "power comes from a quick whip, not a push" });
  else checks.push({ label: "Body at contact", range: "legs not locked, no leaning back", why: "a stable base to hit from" });
  const swing = {
    title: "Every swing is judged",
    sub: overhead ? "At the top of the reach, not at the follow-through where the arm is already coming down." : "At the moment of contact, on every swing you take.",
    checks,
    say: [spoken("praise.generic"), spoken(overhead ? "fix.reach.1" : "fix.shoulder.low.1")].filter(Boolean),
    show: "A tick or the one thing to fix, a picture of the moment with the correction drawn on it, and a running count of good swings.",
  };

  const drills = [];
  const addArm = (joint) => {
    const r = w[joint];
    if (!r) return;
    for (const [i, low] of [[0, true], [1, false]]) {
      const raw = fixCue(joint, low ? r.min - 25 : r.max + 25, r.ideal);
      if (!raw) continue;
      const cue = overhead && joint === "shoulder" ? atTop(raw) : raw;
      const fk = `fix.${joint}.${low ? "low" : "high"}.1`;
      drills.push({ id: `${joint}.${low ? "low" : "high"}`, label: ARM_LABEL[joint][i], headline: cue.headline, say: spoken(fk), drill: cue.drill });
    }
  };
  if (overhead) {
    drills.push({ id: "reach", label: "Hand not high enough", headline: REACH_CUE.headline, say: spoken("fix.reach.1"), drill: REACH_CUE.drill });
    addArm("shoulder");
    addArm("elbow");
    drills.push({ id: "prep", label: "Elbow not leading", headline: PREP_CUE.headline, say: spoken("fix.prep.1"), drill: PREP_CUE.drill });
    drills.push({ id: "speed", label: "A slow swing", headline: SPEED_CUE.headline, say: spoken("fix.speed.1"), drill: SPEED_CUE.drill });
    addArm("knee");
  } else {
    if (rule) {
      const addRule = (id, label, k, low, fixKey) => {
        const c = strokeCue(k, low, rule);
        if (c) drills.push({ id, label, headline: c.headline, say: spoken(fixKey), drill: c.drill });
      };
      if (rule.front) addRule("contact.front", "Hitting it too close to you", "contact.front", true, "fix.contact.front.low.1");
      if (rule.height) {
        addRule("contact.height.high", "Hitting it too high", "contact.height", false, "fix.contact.height.high.1");
        addRule("contact.height.low", "Hitting it too low", "contact.height", true, "fix.contact.height.low.1");
      }
      if (rule.back) addRule("backswing", "Too big a backswing", "backswing", false, "fix.backswing.high.1");
    }
    addArm("shoulder");
    addArm("elbow");
    addArm("knee");
  }
  const stance = (vals, id, label, sayKey) => {
    const f = bodyFaults("ready", vals, { sport })[0];
    if (f) drills.push({ id, label, headline: f.cue.headline, say: spoken(sayKey), drill: f.cue.drill });
  };
  stance({ knee: rp.knee.max + 30 }, "stance.knee", "Legs too straight in your stance", "ready.knee.high");
  stance({ trunk: rp.trunk.max + 30 }, "stance.trunk", "Hunched over in your stance", "ready.trunk.high");

  const note = rule ? "Guide values: where the hand should be at contact comes from coaching rules (" + rule.source + ") and has not yet been checked against real players. Contact point and backswing need you side-on to the camera." : null;
  return { kind: "racquet", sport, key, name: shortShotName(ideal.label, key), overhead, ready, swing, drills, note };
}

/** The lift version: the low and the high end of the rep, then the same drills idea. Any lift, from its own config. */
export function liftBreakdown(key) {
  const L = LIFTS[key];
  if (!L) return null;
  const old = !L.generic; // the deadlift keeps its own wording
  const JL = { hip: "Hips", knee: "Knees", trunk: "Back angle" };
  const name = (j) => (old ? JL[j] : jointLabel(L, j));
  const lower = (s) => String(s).toLowerCase();
  const sayFor = (phase, joints) => {
    const out = [];
    for (const j of joints) {
      const r = L[phase][j];
      for (const v of [r.min - 20, r.max + 20]) { const s = liftSay(key, phase, j, v, r); if (s && !out.includes(s)) out.push(s); }
    }
    return out.slice(0, 2);
  };
  const moment = (phase, title, sub) => ({
    title, sub,
    checks: Object.keys(L[phase]).map((j) => ({ label: name(j), range: deg(L[phase][j]), why: L[phase][j].why })),
    say: sayFor(phase, Object.keys(L[phase])),
    show: "Wherever you are off, the correct position appears in green on your own skeleton.",
  });
  const setup = old
    ? moment("setup", "Your setup", "Where the bar leaves the floor. Hold the position and the coach talks you into it.")
    : moment("setup", `Your ${lower(L.labels.setup)}`, "The low point of every rep, judged against the guide ranges.");
  const lockout = old
    ? moment("lockout", "Your lockout", "The top of every rep, judged the same way, plus a check that your chest rises with your hips on the pull.")
    : moment("lockout", `Your ${lower(L.labels.lockout)}`, "The top of every rep, judged the same way." + (L.consistency && L.consistency.length ? " Plus a check that your torso stays still between the two." : ""));
  const drills = [];
  for (const phase of ["setup", "lockout"]) {
    for (const j of Object.keys(L[phase])) {
      const r = L[phase][j];
      for (const low of [true, false]) {
        const v = low ? r.min - 20 : r.max + 20;
        const cue = liftCue(key, phase, j, v, r);
        if (!cue) continue;
        // some joints have a single cue whichever way you are off: list those once
        if (drills.some((d) => d.headline === cue.headline)) continue;
        drills.push({ id: `${phase}.${j}.${low ? "low" : "high"}`, label: cue.headline, headline: cue.headline, say: liftSay(key, phase, j, v, r), drill: cue.drill });
      }
    }
  }
  const between = L.cues && L.cues["between.swing"];
  if (between) drills.push({ id: "between.swing", label: between.headline, headline: between.headline, say: between.say || null, drill: between.drill });
  const pull = old ? liftCue(key, "pull", "hips", null, null) : null;
  if (pull) drills.push({ id: "pull", label: pull.headline, headline: pull.headline, say: null, drill: pull.drill });
  return { kind: "lift", sport: "strength", key, name: L.label, overhead: false, ready: setup, swing: lockout, drills, note: old ? null : "New: ranges from standard coaching references, not yet checked against real lifters." };
}
