/**
 * @module exercises
 * Strength exercises beyond the deadlift, defined as data: which joint angle drives the rep count, what the
 * bottom and the top of the rep should look like, and what to say and drill when they don't. One small engine
 * (findGenericReps + the dispatch in liftPose) runs all of them, so adding an exercise is adding an entry here.
 *
 * Exercises: squat, push-up, lunge, overhead press, bent-over row, Romanian deadlift.
 *
 * Naming kept compatible with the deadlift code so the live screen needs no special cases:
 *   "setup"   = the low end of the rep signal (the bottom of a squat, push-up or lunge, the rack of a press,
 *               the pulled position of a row, the hinge of an RDL)
 *   "lockout" = the high end (standing tall, arms straight, locked out)
 * `labels` says what to call them on screen.
 *
 * Angles are interior joint angles in degrees (180 = straight) unless a range has a `unit`; trunk is the forward
 * lean from vertical (0 upright, + forward, - back); wristUp is the hands' height above the shoulders in torso
 * lengths.
 *
 * WHERE THE NUMBERS COME FROM, AND HOW FAR TO TRUST THEM (surfaced in the UI as "guide"):
 *   - Squat depth: the standard powerlifting / coaching definition is hip crease to knee height or below; knee
 *     flexion at the bottom is roughly 70-120 degrees depending on bar position and build (biomechanics reviews of
 *     high-bar vs low-bar squats), so the band is wide. Trunk lean 15-65 degrees covers high-bar to low-bar.
 *   - Push-up: elbows near 90 degrees at the bottom, a straight shoulder-hip-ankle line, full lockout at the top
 *     (the common standard in coaching and in open-source rep counters, which use ~90 / ~160).
 *   - Lunge: front knee near 90 degrees, torso upright. Overhead press: full lockout with the hands over the head,
 *     ribs down (no leaning back). Row: torso hinged near 45 degrees and held still, elbow pulled past the ribs.
 *     RDL: hips go back with the knees held softly bent, torso hinges toward parallel.
 *   - The pose model reads a plainly straight body as ~164-170 degrees at the knee and hip (seen on real footage),
 *     and one camera can't see knees caving in, a rounding back or a bar path. Ranges therefore carry margin, and
 *     none of this has been checked against real lifters or reviewed by a coach.
 * Sources of the standards: powerlifting depth rules and squat biomechanics reviews (e.g. Frontiers in Sports and
 * Active Living 2024; AUT high-bar vs low-bar study), open-source MediaPipe rep counters (squat top ~165-170 / bottom
 * ~100, push-up ~160 / ~90), and mainstream strength-coaching references for the press, row and RDL.
 *
 * Pure: no browser.
 */

export const TOLERANCE_DEG = 4;
const R = (min, max, ideal, why, unit) => ({ min, max, ideal, why, ...(unit ? { unit } : {}) });

export const JOINT_LABEL = { hip: "Hips", knee: "Knees", kneeMin: "Front knee", trunk: "Back angle", elbow: "Elbows", wristUp: "Hands overhead" };

export const EXERCISES = {
  squat: {
    key: "squat", setupTip: "Phone at hip height, 2 to 3 metres to your side, whole body in view. A bar, a weight at your chest, or just your bodyweight.", label: "Squat", generic: true, signal: "knee", topAt: 150, bottomAt: 120,
    labels: { setup: "Bottom", lockout: "Top" },
    setup: {
      knee: R(30, 105, 85, "hips down to about knee height or lower"),
      hip: R(30, 105, 70, "sit back as well as down"),
      trunk: R(-5, 65, 40, "chest up: a forward lean, but not folded"),
    },
    lockout: {
      knee: R(155, 185, 170, "stand all the way up"),
      hip: R(155, 185, 170, "hips fully open at the top"),
      trunk: R(-12, 14, 2, "tall, ribs over hips"),
    },
    cues: {
      "setup.knee.high": { headline: "Sit a little deeper", feel: "Your hips stopped above knee height. Keep lowering until the crease of your hips is level with your knees, or a touch below, as far as your mobility allows.", drill: "Pause squats: lower under control, hold 2 seconds at the bottom, then stand. Or squat down to a box set at knee height.", say: "Go a little deeper" },
      "setup.hip.high": { headline: "Sit back as well as down", feel: "Your hips barely folded, so the squat is all knees. Push your hips back and your knees out as you lower.", drill: "Goblet squats: hold a weight at your chest, sit between your knees, and keep your chest up.", say: "Hips back" },
      "setup.trunk.high": { headline: "Chest up, don't fold forward", feel: "You're leaning a long way forward at the bottom. Keep your chest proud and your eyes ahead so your back angle stays steady.", drill: "Front-loaded squats (a weight held at the chest) to teach an upright torso, with a pause at the bottom.", say: "Chest up" },
      "lockout.knee.low": { headline: "Stand all the way up", feel: "You finished with your knees still bent. Drive up until your legs are straight before the next rep.", drill: "Squat and pause for a count of 1 standing tall at the top of every rep.", say: "Stand all the way up" },
      "lockout.hip.low": { headline: "Squeeze your glutes and finish tall", feel: "Your hips weren't fully open at the top. Squeeze your glutes to finish standing tall.", drill: "Pause at the top of each rep and squeeze your glutes for 1 second.", say: "Finish tall" },
      "lockout.trunk.high": { headline: "Finish tall, ribs over hips", feel: "You were still leaning forward at the top. Stand tall with your ribs stacked over your hips.", drill: "Squat with a pause at the top, checking your shoulders sit over your hips.", say: "Stand tall" },
      "lockout.trunk.low": { headline: "Don't lean back at the top", feel: "You leaned back to finish. Stop when you're standing tall: ribs down, glutes tight.", drill: "Film from the side and check your shoulders stack over your hips at the top.", say: "Don't lean back" },
    },
  },

  pushup: {
    key: "pushup", setupTip: "Put the phone on the floor 2 metres to your side, so your whole body from head to feet is in view.", label: "Push-up", generic: true, signal: "elbow", topAt: 150, bottomAt: 115,
    labels: { setup: "Bottom", lockout: "Top" },
    jointLabels: { hip: "Body line" },
    setup: {
      elbow: R(40, 100, 80, "chest to about a fist from the floor, elbows near 90 degrees"),
      hip: R(155, 186, 172, "one straight line from shoulders to ankles"),
    },
    lockout: {
      elbow: R(155, 186, 172, "press all the way to straight arms"),
      hip: R(155, 186, 172, "the body line holds at the top too"),
    },
    cues: {
      "setup.elbow.high": { headline: "Lower until your elbows reach about 90 degrees", feel: "Your chest stopped well above the floor. Lower under control until your elbows are near a right angle, a fist from the floor.", drill: "Tempo push-ups: 3 seconds down, a 1 second pause just above the floor, then press up. Use an incline (hands on a bench) if you can't reach depth yet.", say: "Lower all the way" },
      "setup.hip": { headline: "Keep your body in one straight line", feel: "Your hips sagged or piked, which breaks the line from shoulders to ankles. Squeeze your glutes and brace your abs as in a plank.", drill: "Hold a plank for 30 seconds, then do push-ups with the same plank body, and stop the set the moment the line breaks.", say: "Straight body" },
      "lockout.elbow.low": { headline: "Press all the way up to straight arms", feel: "You stopped short of lockout. Finish each rep with your arms straight before lowering again.", drill: "Push-ups with a 1 second pause at the top, arms locked out, shoulders pushed away from the floor.", say: "Press all the way up" },
      "lockout.hip": { headline: "Keep your body in one straight line", feel: "Your hips broke the line at the top. Keep your glutes and abs tight.", drill: "Plank holds, then short sets of push-ups that stop when the line breaks.", say: "Straight body" },
    },
  },

  lunge: {
    key: "lunge", setupTip: "Phone at hip height, 2 to 3 metres to your side, whole body in view. Forward, reverse or split lunges all work.", label: "Lunge", generic: true, signal: "kneeMin", topAt: 150, bottomAt: 120,
    labels: { setup: "Bottom", lockout: "Top" },
    setup: {
      kneeMin: R(55, 105, 90, "front knee near a right angle"),
      trunk: R(-8, 25, 8, "torso upright, not folded over the front knee"),
    },
    lockout: {
      kneeMin: R(155, 186, 170, "stand fully up between reps"),
    },
    cues: {
      "setup.kneeMin.high": { headline: "Sink lower: front knee towards 90 degrees", feel: "You didn't go down far enough. Lower until your front knee is near a right angle and your back knee is just above the floor.", drill: "Split squats holding a wall or rail for balance: lower until the back knee nearly touches the floor, pause 1 second, drive up.", say: "Sink lower" },
      "setup.kneeMin.low": { headline: "Not quite so deep", feel: "You dropped lower than you need to. Stop when your back knee is just above the floor and your front shin stays close to vertical.", drill: "Lunge to a cushion or folded towel under the back knee, and touch it lightly.", say: "Not so deep" },
      "setup.trunk.high": { headline: "Stay tall: chest up over your hips", feel: "You're leaning forward over your front knee. Keep your chest up and your torso upright through the lunge.", drill: "Lunges with your hands behind your head, keeping your chest facing forward.", say: "Chest up" },
      "lockout.kneeMin.low": { headline: "Stand all the way up between reps", feel: "You didn't stand fully tall at the top. Bring your feet together or level before the next rep.", drill: "Pause standing tall for 1 second after every lunge.", say: "Stand tall" },
    },
  },

  ohp: {
    key: "ohp", setupTip: "Phone at chest height, 2 to 3 metres to your side, with room above your hands.", label: "Overhead press", generic: true, signal: "elbow", topAt: 155, bottomAt: 105,
    labels: { setup: "Rack", lockout: "Lockout" },
    setup: {
      trunk: R(-8, 12, 2, "tall, ribs down, bar over your midfoot"),
    },
    lockout: {
      elbow: R(158, 186, 172, "arms locked out overhead"),
      wristUp: R(0.6, 2.2, 1.0, "hands clearly above the shoulders, arms by your ears", "torso"),
      trunk: R(-10, 10, 0, "ribs down: no leaning back to finish the press"),
    },
    cues: {
      "lockout.elbow.low": { headline: "Press all the way to lockout", feel: "You stopped short of straight arms. Finish every rep with your elbows locked overhead.", drill: "Overhead holds: press to lockout and hold 5 seconds, then pause presses with a 2 second hold at the top.", say: "Lock it out" },
      "lockout.wristUp.low": { headline: "Finish with your hands over your head", feel: "Your hands stayed in front of you. Push your head through as the weight passes your face and finish with your arms by your ears.", drill: "Press and shrug at the top: hold the lockout with your biceps beside your ears for 2 seconds.", say: "Hands over your head" },
      "lockout.trunk.low": { headline: "Don't lean back: ribs down, glutes tight", feel: "You arched back to finish the press, which loads your lower back. Squeeze your glutes and keep your ribs down.", drill: "Press with your back and heels against a wall so you can't lean back, or press half-kneeling.", say: "Ribs down" },
      "lockout.trunk.high": { headline: "Stand tall: don't fold forward", feel: "You leaned forward as you pressed. Keep your torso upright under the weight.", drill: "Press with your back against a wall, brace your abs and keep the wall contact.", say: "Stand tall" },
      "setup.trunk.low": { headline: "Don't lean back at the start", feel: "You're leaning back in the rack position. Stand tall, ribs down, glutes tight, before you press.", drill: "Set up against a wall: heels, hips and shoulder blades touching, then press.", say: "Ribs down" },
      "setup.trunk.high": { headline: "Stand tall in the rack", feel: "You're leaning forward in the rack. Stand tall with the weight at your shoulders.", drill: "Hold the rack position for 5 seconds before each press, chest up.", say: "Stand tall" },
    },
  },

  row: {
    key: "row", setupTip: "Phone at hip height, 2 to 3 metres to your side, so your hinged torso and your arm are both in view.", label: "Bent-over row", generic: true, signal: "elbow", topAt: 150, bottomAt: 105,
    labels: { setup: "Pull", lockout: "Hang" },
    setup: {
      elbow: R(35, 100, 75, "pull the elbow back past your ribs, to the lower chest"),
      trunk: R(25, 70, 45, "hinged over with a flat back, torso held still"),
    },
    lockout: {
      elbow: R(150, 186, 168, "arms hang fully straight between reps"),
      trunk: R(25, 70, 45, "the hinge stays the same on the way down"),
    },
    consistency: [{ key: "swing", joint: "trunk", maxDiff: 22 }],
    cues: {
      "setup.elbow.high": { headline: "Pull higher: elbows back past your ribs", feel: "You didn't pull far enough. Drive your elbow back past your ribs and squeeze your shoulder blades together at the top.", drill: "Chest-supported rows or pause rows: hold the top for 1 second with your torso unchanged.", say: "Pull higher" },
      "setup.trunk.high": { headline: "Come up a little: torso around 45 degrees", feel: "You're folded over very low. Raise your torso until it sits around 45 degrees so the pull comes from your back, not a heave.", drill: "Hinge drill: hands on your thighs, hips back, torso at 45 degrees, then row from there.", say: "Not so low" },
      "setup.trunk.low": { headline: "Hinge over more", feel: "You're too upright, which turns the row into a shrug. Push your hips back until your torso is around 45 degrees.", drill: "Hip hinge against a wall, then hold the hinge for 5 seconds before you start rowing.", say: "Hinge over more" },
      "lockout.elbow.low": { headline: "Let your arms hang fully between reps", feel: "Your arms didn't straighten at the bottom, so you're cutting the rep short. Let them hang fully, then pull.", drill: "Row with a 1 second pause at the bottom, arms straight.", say: "Full stretch" },
      "lockout.trunk.low": { headline: "Keep the same hinge on the way down", feel: "You stood up out of the hinge as you lowered the weight. Hold your torso angle through the whole set.", drill: "Row with your torso angle held for the entire rep, filming from the side.", say: "Hold the hinge" },
      "lockout.trunk.high": { headline: "Keep the same hinge on the way down", feel: "You folded forward as you lowered the weight. Hold your torso angle through the whole set.", drill: "Row with your torso angle held for the entire rep, filming from the side.", say: "Hold the hinge" },
      "between.swing": { headline: "Keep your torso still", feel: "Your torso angle changed a lot between the pull and the hang, so momentum is doing the work. Lighten the weight and hold the hinge.", drill: "Pause rows: 1 second at the top, lowering for 2 seconds, with your torso angle unchanged.", say: "Torso still" },
    },
  },

  rdl: {
    key: "rdl", setupTip: "Phone at hip height, 2 to 3 metres to your side, whole body in view. Dumbbells, a bar, or no weight at all.", label: "Romanian deadlift", generic: true, signal: "hip", topAt: 155, bottomAt: 120,
    labels: { setup: "Hinge", lockout: "Top" },
    setup: {
      hip: R(55, 115, 90, "hinge back until your hamstrings stretch"),
      knee: R(135, 178, 158, "knees stay softly bent and don't change: it's a hinge, not a squat"),
      trunk: R(35, 88, 62, "torso hinges toward parallel with a flat back"),
    },
    lockout: {
      hip: R(158, 186, 172, "hips fully through at the top"),
      knee: R(155, 186, 170, "legs straight at the top"),
      trunk: R(-12, 12, 2, "tall, no leaning back"),
    },
    cues: {
      "setup.hip.high": { headline: "Push your hips back further", feel: "You're not hinging deep enough. Send your hips straight back until you feel your hamstrings stretch, keeping your back flat.", drill: "Wall hinge: stand a foot from a wall and push your hips back to touch it with your knees soft, then add the weight.", say: "Hips back more" },
      "setup.knee.low": { headline: "Keep your knees softer than a squat: hinge, don't sit", feel: "Your knees bent a lot, turning the lift into a squat. Keep a soft, fixed knee bend and send your hips back instead.", drill: "Tempo RDLs: 3 seconds down, keeping the same small knee bend from top to bottom.", say: "Don't squat it" },
      "setup.trunk.low": { headline: "Hinge forward more", feel: "You stayed very upright, so the hamstrings aren't loading. Hinge from the hips until your torso tips well forward, back flat.", drill: "Hands-on-thighs hinge: slide your hands down your thighs as you push your hips back.", say: "Hinge more" },
      "lockout.hip.low": { headline: "Stand all the way up, squeezing your glutes", feel: "You didn't finish standing tall. Drive your hips through and squeeze your glutes at the top.", drill: "Pause at the top of every rep for 1 second, glutes tight.", say: "Finish tall" },
      "lockout.knee.low": { headline: "Straighten your legs at the top", feel: "Your knees stayed bent at the top. Finish with your legs straight, hips through.", drill: "Pause at the top and check both knees are straight.", say: "Legs straight" },
      "lockout.trunk.low": { headline: "Don't lean back at the top", feel: "You leaned back to finish. Stop when you're standing tall, ribs down, glutes tight.", drill: "Film from the side and check your shoulders stack over your hips at the top.", say: "Don't lean back" },
    },
  },
};

export const isGenericLift = (key) => !!EXERCISES[key];

/** Label for a joint on screen, per exercise ("hip" is the "Body line" in a push-up). */
export const jointLabel = (cfg, joint) => cfg?.jointLabels?.[joint] || JOINT_LABEL[joint] || joint;

/** The cue for one out-of-range reading: by direction ("setup.knee.high"), else the joint's general one ("setup.hip"). */
export function genericCue(cfg, phase, joint, measured, range) {
  if (!cfg?.cues || !Number.isFinite(measured) || !range) return null;
  const dir = measured < range.min ? "low" : "high";
  const c = cfg.cues[`${phase}.${joint}.${dir}`] || cfg.cues[`${phase}.${joint}`];
  return c ? { headline: c.headline, feel: c.feel, drill: c.drill } : null;
}

export function genericSay(cfg, phase, joint, measured, range) {
  if (!cfg?.cues || !Number.isFinite(measured) || !range) return null;
  const dir = measured < range.min ? "low" : "high";
  const c = cfg.cues[`${phase}.${joint}.${dir}`] || cfg.cues[`${phase}.${joint}`];
  return c ? c.say || null : null;
}

// ─── reps ───
const median = (a) => { const s = a.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const medianFilter = (vals, half) => vals.map((_, i) => median(vals.slice(Math.max(0, i - half), i + half + 1)));

/**
 * Find the reps of a generic exercise in a series of measured frames.
 * A rep is a stretch where the rep signal is "high" (>= topAt) that follows a stretch where it got "low"
 * (<= bottomAt), so standing around never counts and a half rep that never gets down never counts.
 * @param {object} cfg an EXERCISES entry
 * @param {{t:number, trunkAbs:number|null}[]} frames time-ordered; each carries the measures (hip, knee, kneeMin, trunk, elbow, wristUp)
 * @returns {{tPull:number, tSetup:number, tLock:number, tEnd:number, setup:object, lockout:object, swing:object|null}[]}
 *   tSetup = the moment of the bottom (for its picture), tLock = the best-extended moment at the top.
 */
export function findGenericReps(cfg, frames, o = {}) {
  const c = { gap: 0.3, bottomSpan: 0.15, topSpan: 0.8, lockSpan: 3.0, ...o };
  const key = cfg.signal;
  const fr = frames.filter((f) => f[key] != null);
  if (fr.length < 6) return [];
  const sig = medianFilter(fr.map((f) => f[key]), 2);
  const t = fr.map((f) => f.t);

  const segs = [];
  let cur = null;
  for (let i = 0; i < fr.length; i++) {
    if (sig[i] >= cfg.topAt) {
      if (cur && t[i] - t[cur.b] <= c.gap) cur.b = i;
      else { if (cur) segs.push(cur); cur = { a: i, b: i }; }
    } else if (cur && t[i] - t[cur.b] > c.gap) { segs.push(cur); cur = null; }
  }
  if (cur) segs.push(cur);

  const pick = (a, b, k) => median(fr.filter((f) => f.t >= a && f.t <= b).map((f) => f[k]));
  const reps = [];
  let prevEnd = -Infinity;
  for (const s of segs) {
    let lowest = Infinity, iLow = -1;
    for (let i = 0; i < s.a; i++) if (t[i] > prevEnd && sig[i] < lowest) { lowest = sig[i]; iLow = i; }
    if (!(lowest <= cfg.bottomAt) || iLow < 0) { prevEnd = t[s.b]; continue; }
    const tLow = t[iLow];
    let best = s.a;
    for (let i = s.a; i <= s.b && t[i] <= t[s.a] + c.lockSpan; i++) if (sig[i] > sig[best]) best = i;
    const tL = t[best];
    const tH = Math.min(t[s.b], tL + c.topSpan);
    const setup = {}, lockout = {};
    for (const j of Object.keys(cfg.setup)) setup[j] = pick(tLow - c.bottomSpan, tLow + c.bottomSpan, j);
    for (const j of Object.keys(cfg.lockout)) lockout[j] = pick(tL - 0.2, tH, j);
    // how much the torso moved between the bottom and the top: the "swing" of a row done with momentum
    const swing = setup.trunk != null && lockout.trunk != null ? { trunk: Math.abs(setup.trunk - lockout.trunk) } : null;
    reps.push({ tPull: Math.max(prevEnd, tLow - 0.4), tSetup: tLow, tLock: tL, tEnd: t[s.b], setup, lockout, swing });
    prevEnd = t[s.b];
  }
  return reps;
}
