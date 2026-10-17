/**
 * @module coachPhrases
 * Everything the live coach can say, as wording a coach would use: short, varied, spoken.
 *
 * Each entry is `key -> lines[]`. A line's id is `key.index` (e.g. "praise.snap.2"); that id is also the file
 * name of its pre-recorded clip (public/coach-voice/<voice>/<id>.mp3). So: ADD a line at the END of its array,
 * never reorder or delete (the ids would shift under the recorded clips), then re-run the recorder
 * (frontend/tools/coach-voice/README.md).
 *
 * Fix lines come in three levels: 1 = the first time (what to do), 2 = the same thing again (a few words),
 * 3 = the same thing a third time (a drill). Numbers are not spoken (they are on screen); streaks are the one
 * exception, written out per count so each has its own clip.
 *
 * Pure data and helpers: no browser.
 */

const STREAK_WORDS = { 3: "Three", 5: "Five", 8: "Eight", 10: "Ten", 15: "Fifteen", 20: "Twenty" };
export const STREAK_MARKS = Object.keys(STREAK_WORDS).map(Number);

const streakLines = (n) => {
  const w = STREAK_WORDS[n];
  return n >= 10
    ? [`${w} in a row.`, `${w} clean ones in a row. That's seriously good.`]
    : [`${w} in a row.`, `${w} clean ones in a row, keep going.`];
};

export const BANK = {
  // ── the player pressed Start / the sound button ──
  "voice.on": ["Coach is on. Take your stance, and swing when you're ready.", "Okay, I'm watching. Take your stance, then swing."],
  "voice.test": ["Voice on."],

  // ── the swing was in range ──
  "praise.generic": ["Good one.", "That's it.", "Clean.", "Nice, that's the shape.", "Yes, like that.", "There you go.", "Good, again.", "That's what I want.", "Smooth.", "Good swing."],
  "praise.first": ["First one in. Keep them coming.", "Got it, I'm tracking you. Keep going."],
  "praise.reach": ["Great reach, right up at the top.", "That's the height. Well done.", "Love that reach.", "Up high, exactly right.", "Great, you got right up to it."],
  "praise.snap": ["Good snap on that one.", "Nice and quick through the ball.", "That one had some pace.", "Fast hands. Good.", "Great whip on that."],
  "praise.jump": ["Nice jump into it.", "Good, you got off the ground.", "Great, you jumped for that one.", "That's it. Jump and hit."],
  "praise.timing": ["Perfect timing. You hit it at the top of the jump.", "Great timing, right at the peak of the jump."],
  "praise.bestSpeed": ["That's your fastest swing yet.", "New best. That's the quickest so far.", "Fastest one of the session."],
  "praise.bestReach": ["Highest reach so far.", "That's your highest one yet."],
  "praise.fixed": ["There it is. That's the fix.", "Yes, that's better.", "Much better. Hold on to that.", "That's it, that's what we wanted.", "Better. Do that again."],
  ...Object.fromEntries(STREAK_MARKS.map((n) => [`streak.${n}`, streakLines(n)])),

  // ── short good thing said before a correction ──
  "pre.reach": ["Good reach.", "Nice height."],
  "pre.snap": ["Good snap.", "Nice pace."],
  "pre.jump": ["Nice jump.", "Good, you jumped."],
  "pre.arm": ["Arm's good.", "That arm was right."],

  // ── a tip on an otherwise good swing ──
  "tip.jumpLate": ["Good one. Try hitting at the top of your jump, you're coming down.", "Nice. Jump a touch earlier, so you hit it at the peak."],

  // ── corrections: level 1 (first time), 2 (again), 3 (drill) ──
  "fix.reach.1": ["Reach up, hit it at the very top.", "Get up higher. Meet it above your head.", "That one stayed low. Stretch up to it."],
  "fix.reach.2": ["Higher. Reach for it.", "Up. Hit it above your head.", "Stay tall and reach."],
  "fix.reach.3": ["Same thing again, so let's slow it down. Ten shadow swings, freeze with your hand high above your head.", "Let's fix this one properly. Slow shadow swings, pause at the top with your hand well above your head."],

  "fix.shoulder.low.1": ["Get that arm up a bit higher.", "Lift the elbow a little. Reach higher.", "Reach a bit higher at the top."],
  "fix.shoulder.low.2": ["Higher again.", "A bit higher. Reach.", "Up a little more."],
  "fix.shoulder.low.3": ["You keep dropping the arm. Slow it down: ten swings, freeze at the top, and check where your elbow is.", "Let's slow this one down. Freeze at the top of each swing and check your elbow."],
  "fix.shoulder.high.1": ["Keep that arm a bit lower.", "Don't reach up past it. A touch lower.", "Meet it a little lower, close to your body."],
  "fix.shoulder.high.2": ["Lower this time.", "A bit lower.", "Bring it down a little."],
  "fix.shoulder.high.3": ["You keep reaching too high. Slow shadow swings, freeze at contact, and check your elbow height.", "Let's slow it down. Pause at contact and see where your elbow is."],

  "fix.elbow.low.1": ["Straighten the arm more. Meet it long.", "Reach out with a longer arm.", "Extend through the hit. A longer arm."],
  "fix.elbow.low.2": ["Longer arm.", "Straighter. Reach out.", "Extend more."],
  "fix.elbow.low.3": ["Your arm keeps staying bent. Slow shadow swings, pausing at contact with the arm almost straight.", "Let's fix the elbow. Slow swings, and reach out long at contact."],
  "fix.elbow.high.1": ["Keep a little bend in the elbow.", "Soft elbow. Don't lock it out.", "Let the elbow stay a touch bent."],
  "fix.elbow.high.2": ["Softer elbow.", "A bit more bend.", "Don't lock it."],
  "fix.elbow.high.3": ["You keep locking the elbow. Slow shadow swings, a soft bend, and snap the wrist through.", "Let's soften that arm. Slow swings with a little bend, then snap through."],

  "fix.prep.1": ["Get your elbow up before you swing.", "Lead with the elbow, then throw the racket up.", "Elbow up first, then hit."],
  "fix.prep.2": ["Elbow up first.", "Lead with the elbow.", "Get it up, then swing."],
  "fix.prep.3": ["Point your elbow at the sky, hold it a second, then throw your hand up to the top. Ten of those."],

  "fix.speed.1": ["Swing through faster. Snap it.", "More whip. Let the forearm snap.", "Quicker through the ball. Relax the grip."],
  "fix.speed.2": ["Faster hands.", "Snap it.", "More speed."],
  "fix.speed.3": ["Loosen the grip and make a whoosh at the top. Ten fast shadow swings."],

  "fix.knee.low.1": ["Stand a little taller as you hit.", "Push up out of the front leg.", "Drive up through your front leg."],
  "fix.knee.low.2": ["Taller.", "Push up.", "Drive up."],
  "fix.knee.low.3": ["Lunge, then drive up through the front leg as you swing. Ten of those."],
  "fix.knee.high.1": ["Bend that front knee more.", "Get lower. Sink into it.", "Sink your hips as you hit."],
  "fix.knee.high.2": ["Lower.", "Bend the knee.", "Sink in."],
  "fix.knee.high.3": ["Hold a low ready stance, then lunge and freeze on the front knee. Ten times."],

  "fix.body.knee.high.1": ["Soft knees as you hit. Don't lock the legs.", "Keep a bend in the knees.", "Don't straighten the legs on contact."],
  "fix.body.knee.high.2": ["Soft knees.", "Bend the knees.", "Don't lock the legs."],
  "fix.body.knee.high.3": ["Your legs keep locking. Hold a low stance and shadow slowly, knees soft through contact."],
  "fix.body.knee.low.1": ["Come up a little. You're sitting too low.", "Stand a touch taller.", "Not so deep. Come up a bit."],
  "fix.body.knee.low.2": ["Come up.", "Up a little.", "Not so low."],
  "fix.body.knee.low.3": ["You're sitting too low. Hold a ready stance, then split-step and react. Ten times."],
  "fix.body.trunk.low.1": ["Don't lean back. Stay over the shot.", "Stay forward, over the ball.", "Keep your weight forward."],
  "fix.body.trunk.low.2": ["Stay forward.", "Don't lean back.", "Weight forward."],
  "fix.body.trunk.low.3": ["You keep leaning back. Slow shadow swings with your chest over your front foot."],
  "fix.body.trunk.high.1": ["Chest up. Don't fold over.", "Stand a little more upright.", "Lift the chest."],
  "fix.body.trunk.high.2": ["Chest up.", "More upright.", "Lift up."],
  "fix.body.trunk.high.3": ["You keep folding over. Slow shadow swings, chest up, back long."],

  "fix.contact.front.low.1": ["Meet it further out in front.", "Reach out and hit it in front of you.", "Too close to your body. Get it out in front."],
  "fix.contact.front.low.2": ["Further out front.", "Hit it in front.", "Reach for it."],
  "fix.contact.front.low.3": ["Same thing again. Slow shadow swings, freezing at contact with your hand well in front of your shoulder.", "Let's fix the contact point. Shadow slowly and freeze with your hand out in front, then swing for real."],
  "fix.contact.height.high.1": ["Let it drop. Meet it lower.", "You're hitting it too high. Get lower to it.", "Bend your knees and meet it lower."],
  "fix.contact.height.high.2": ["Drop it lower.", "Let it come down.", "Meet it lower."],
  "fix.contact.height.high.3": ["You keep hitting it too high. Slow shadow swings, bending your knees so your hand meets it at the right height.", "Let's drop the contact point. Knees down, and freeze at contact at the right height."],
  "fix.contact.height.low.1": ["Take it a bit higher.", "You're hitting it too low. Meet it higher.", "Get your hand up to meet it."],
  "fix.contact.height.low.2": ["Higher.", "Take it higher.", "Hand up."],
  "fix.contact.height.low.3": ["You keep hitting it too low. Slow shadow swings, freezing at contact with your hand at the right height.", "Let's raise the contact point. Freeze at contact at the right height, then swing for real."],
  "fix.backswing.high.1": ["Shorten the backswing.", "Keep it compact. Less backswing.", "Too big a swing back. Keep it short."],
  "fix.backswing.high.2": ["Shorter.", "Compact.", "Less backswing."],
  "fix.backswing.high.3": ["Your backswing keeps getting too big. Shadow with a wall behind you that your racket can't touch.", "Let's tighten it up. Short, compact swings, never past your shoulder line."],

  // ── between swings, while holding the ready stance (ai/liveCoach). Line 0 is the on-screen wording ──
  "ready.knee.low": ["Stand a little taller", "Come up a touch.", "Not so low. Stand up a bit."],
  "ready.knee.high": ["Bend your knees", "Get lower. Soft knees.", "Sink down a bit. Bend the knees."],
  "ready.trunk.low": ["Lean forward a little", "Tip forward from the hips.", "Weight over your toes."],
  "ready.trunk.high": ["Chest up, don't hunch", "Lift your chest.", "Stand tall. Chest up."],
  "ready.stance.low": ["Feet a bit wider", "Widen your stance a little.", "Spread your feet out a bit."],
  "ready.stance.high": ["Bring your feet in a little", "Feet a touch closer together.", "Narrow your stance a bit."],
  "ready.good": ["Good", "Good stance.", "That's it. Hold that.", "Nice stance."],

  // ── after a set of five swings, said when the player is back in the ready stance ──
  "set.strong": ["Strong set. Keep that going.", "That's a really good set.", "Nice set. You're in a rhythm."],
  "set.mixed": ["Decent set. Let's tighten it up.", "Okay set. A few to clean up.", "Some good ones in there. Now make them consistent."],
  "set.rough": ["Tough set. Slow down and get the shape right.", "That one got away from you. Reset, take it slower.", "Let's reset. Slower swings, shape first."],
  "fatigue": ["Your speed's dropping. Shake the arm out for ten seconds.", "You're slowing down. Take a breather.", "Getting tired? Shake it out, then go again."],
};

/** Every line as { id, text }, for the recorder and for lookups. */
export const ALL_PHRASES = Object.entries(BANK).flatMap(([key, lines]) => lines.map((text, i) => ({ id: `${key}.${i}`, text })));

/**
 * Ids in the order they are worth fetching: what the first minute needs first (greeting, "good", the stance cues,
 * the first-time fixes), the rest after, drills last.
 */
export function prefetchIds() {
  const rank = (id) => {
    if (id.startsWith("voice.") || id.startsWith("praise.first") || id.startsWith("praise.generic")) return 0;
    if (id.startsWith("ready.")) return 1;
    if (/^fix\..*\.[12]\.\d+$/.test(id)) return 2;
    if (id.startsWith("streak.3") || id.startsWith("streak.5") || id.startsWith("pre.") || id.startsWith("praise.")) return 3;
    if (/^fix\..*\.3\.\d+$/.test(id)) return 5;
    return 4;
  };
  return ALL_PHRASES.map((p) => p.id).sort((a, b) => rank(a) - rank(b));
}

const BY_TEXT = new Map(ALL_PHRASES.map((p) => [p.text, p]));
/** The recorded phrase for exactly this text, or null (the caller then speaks it with the phone's voice). */
export const phraseForText = (text) => BY_TEXT.get(text) || null;

/** Fix key for a fault ("shoulder", "body.knee", "reach", ...) and its direction, or null when there is no wording for it. */
export function fixKeyFor(fault) {
  const k = fault?.key;
  if (!k) return null;
  if (k === "reach" || k === "prep" || k === "speed") return `fix.${k}`;
  if (["shoulder", "elbow", "knee", "body.knee", "body.trunk", "contact.height"].includes(k)) return `fix.${k}.${fault.low ? "low" : "high"}`;
  if (k === "contact.front") return "fix.contact.front.low";
  if (k === "backswing") return "fix.backswing.high";
  return null;
}

/**
 * Pick a line from `key` that was not used recently (the last few picks of that key are skipped), remember it, and
 * return { id, text }. `used` is a plain object the caller keeps per session.
 */
export function pickLine(key, used, rng = Math.random) {
  const lines = BANK[key];
  if (!lines || !lines.length) return null;
  const recent = used[key] || (used[key] = []);
  const skip = Math.min(recent.length, Math.max(0, lines.length - 1), 3);
  const banned = new Set(recent.slice(-skip));
  const open = lines.map((_, i) => i).filter((i) => !banned.has(i));
  const i = open[Math.floor(rng() * open.length)] ?? 0;
  recent.push(i);
  if (recent.length > 6) recent.shift();
  return { id: `${key}.${i}`, text: lines[i] };
}
