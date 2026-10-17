// Stroke rules (shots not hit up high): the hand's position at contact, and what is said when it is off.
// usage: node test_strokes.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const A = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/ai/");
const S = await import(pathToFileURL(A + "strokeRules.js").href);
const { IDEAL_ANGLES } = await import(pathToFileURL(A + "idealAngles.js").href);
const { usesReach } = await import(pathToFileURL(A + "overheadSwing.js").href);
const { BANK, fixKeyFor } = await import(pathToFileURL(A + "coachPhrases.js").href);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } };

// a standing player, side-on, facing +x: shoulders 0.5 m above the hips (torso = 0.5), hand placed relative to the right shoulder
const frame = (t, hand) => {
  const wl = Array.from({ length: 33 }, () => [0, 0, 0]), vis = Array(33).fill(1);
  wl[11] = [0, -0.5, 0.15]; wl[12] = [0, -0.5, -0.15]; wl[23] = [0, 0, 0.1]; wl[24] = [0, 0, -0.1];
  wl[16] = [hand[0], -0.5 - hand[1], -0.15]; // right wrist: [forward, up] metres from the shoulder (world y points down)
  wl[15] = [0, -0.2, 0.15];
  return { t, wl, vis };
};
const FWD = [1, 0, 0];
// a swing: the hand goes back by `backM` metres behind the shoulder, then through to the contact point
const swing = ({ frontM, upM, backM = 0.1 }) => {
  const fr = [];
  for (let i = 0; i <= 30; i++) {
    const t = i * 0.025; // 0 .. 0.75 s, contact at 0.75
    const x = i < 20 ? -backM * Math.sin((i / 20) * Math.PI / 2) : -backM + ((frontM + backM) * (i - 20)) / 10;
    fr.push(frame(t, [x, upM * (i / 30) - 0.05 * (1 - i / 30)]));
  }
  return fr;
};
const feat = (spec, fwd = FWD) => S.strokeFeatures({ frames: swing(spec), tContact: 0.75, side: "right", fwd });
const R = 0.5; // torso length in the test figure

// ── features ──
let f = feat({ frontM: 0.6, upM: 0.0, backM: 0.1 });
ok(Math.abs(f.height - 0) < 0.15 && Math.abs(f.front - 0.6 / R) < 0.15 && f.sideOn, "hand level with the shoulder and 0.6 m ahead: height ~0, front ~1.2: " + JSON.stringify(f));
f = feat({ frontM: 0.4, upM: -0.5 });
ok(Math.abs(f.height - -1.0) < 0.2, "hand 0.5 m below the shoulder = waist height (about -1): " + f.height.toFixed(2));
f = feat({ frontM: 0.4, upM: -0.5, backM: 0.5 });
ok(f.back > 0.8, "hand went 0.5 m behind the shoulder: backswing about 1: " + f.back.toFixed(2));
f = feat({ frontM: 0.4, upM: -0.5 }, [0, 0, 1]);
ok(f && f.sideOn === false && f.front === null && f.back === null && Math.abs(f.height - -1.0) < 0.2, "facing the camera: height still read, front and backswing not judged");
ok(S.strokeFeatures({ frames: swing({ frontM: 0.4, upM: 0 }), tContact: 30, side: "right", fwd: FWD }) === null, "no frame near the contact time: null");

// ── judging, by shot ──
const judge = (sport, shot, spec) => S.judgeStroke(S.strokeRule(sport, shot), feat(spec));
const keys = (j) => j.faults.map((x) => x.key + (x.low === undefined ? "" : x.low ? ".low" : ".high"));
let j = judge("pickleball", "dink", { frontM: 0.6, upM: -0.95, backM: 0.1 });
ok(j.faults.length === 0 && j.chips.contact === "ok" && j.chips.backswing === "ok", "a dink near knee height, out in front, short backswing: no faults: " + JSON.stringify(keys(j)));
j = judge("pickleball", "dink", { frontM: 0.6, upM: -0.2 });
ok(keys(j).includes("contact.height.high") && /lower/i.test(j.faults[0].cue.headline), "a dink hit at chest height is too high: " + JSON.stringify(keys(j)));
j = judge("pickleball", "dink", { frontM: 0.0, upM: -0.95 });
ok(keys(j).includes("contact.front.low") && j.chips.contact === "off", "a dink beside the body: meet it in front");
j = judge("pickleball", "dink", { frontM: 0.6, upM: -0.95, backM: 0.5 });
ok(keys(j).includes("backswing.high") && /short/i.test(j.faults.find((x) => x.key === "backswing").cue.headline), "a dink with a big backswing: keep it short");
j = judge("pickleball", "volley", { frontM: 0.6, upM: -0.2, backM: 0.05 });
ok(j.faults.length === 0, "a chest-high volley in front is fine: " + JSON.stringify(keys(j)));
j = judge("squash", "forehand_drive", { frontM: 0.35, upM: -1.0 });
ok(j.faults.length === 0, "a squash drive near knee height just ahead of the shoulder: fine: " + JSON.stringify(keys(j)));
j = judge("squash", "forehand_drive", { frontM: 0.35, upM: 0.0 });
ok(keys(j).includes("contact.height.high"), "a squash drive hit at shoulder height is too high");
j = judge("badminton", "serve", { frontM: 0.5, upM: -0.1, backM: 0.2 });
ok(keys(j).includes("contact.height.high"), "a badminton serve struck at chest height breaks the below-the-waist rule");
j = judge("badminton", "net_shot", { frontM: 0.2, upM: 0.1, backM: 0.1 });
ok(keys(j).includes("contact.front.low"), "a net shot with the arm not reaching forward: meet it further in front");
j = judge("tennis", "forehand", { frontM: 0.5, upM: -0.6 });
ok(j.faults.length === 0, "a tennis forehand at waist height in front: fine: " + JSON.stringify(keys(j)));
// facing the camera: nothing about front / backswing, but the height is still judged
const jf = S.judgeStroke(S.strokeRule("pickleball", "dink"), S.strokeFeatures({ frames: swing({ frontM: 0.0, upM: -0.2, backM: 0.6 }), tContact: 0.75, side: "right", fwd: [0, 0, 1] }));
ok(jf.chips.contact === "off" && jf.chips.backswing === "na" && keys(jf).every((k) => k.startsWith("contact.height")), "facing the camera: only the height is judged: " + JSON.stringify(keys(jf)));
// a miss inside the margin is not a fault
j = S.judgeStroke(S.strokeRule("tennis", "forehand"), { height: -1.7 - S.TOL.height + 0.02, front: 0.25, back: null });
ok(j.faults.length === 0, "a miss inside the margin is not a fault");
// the knee rule
j = S.judgeStroke(S.strokeRule("pickleball", "dink"), { height: -1.5, front: 0.6, back: 0.1 }, { kneeAtContact: 172 });
ok(j.kneeTooStraight, "a dink with straight legs asks for a knee bend");

// ── coverage: every shot that is not hit up high has a rule, and every fault has wording at three levels ──
const missing = [];
for (const [sport, shots] of Object.entries(IDEAL_ANGLES)) {
  if (!["badminton", "tennis", "table_tennis", "pickleball", "squash"].includes(sport)) continue;
  for (const [shot, ideal] of Object.entries(shots)) if (!usesReach(sport, shot, ideal) && !S.strokeRule(sport, shot)) missing.push(`${sport}/${shot}`);
}
ok(missing.length === 0, "every ground stroke / volley / serve has a rule; missing: " + missing.join(", "));
for (const [sport, shots] of Object.entries(S.STROKE_RULES)) for (const [shot, rule] of Object.entries(shots)) {
  ok(rule.height && rule.height[0] < rule.height[1], `${sport}/${shot}: a sane height band`);
  ok(!!rule.source, `${sport}/${shot}: says what the rule rests on`);
  ok(IDEAL_ANGLES[sport] && IDEAL_ANGLES[sport][shot], `${sport}/${shot}: is a shot practice knows`);
}
for (const fault of [{ key: "contact.front", low: true }, { key: "contact.height", low: true }, { key: "contact.height", low: false }, { key: "backswing", low: false }]) {
  const fk = fixKeyFor(fault);
  ok(fk && BANK[`${fk}.1`] && BANK[`${fk}.2`] && BANK[`${fk}.3`], `spoken wording at 3 levels for ${fault.key} low=${fault.low} (${fk})`);
}
console.log(fails ? `\n${fails} FAILED` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
