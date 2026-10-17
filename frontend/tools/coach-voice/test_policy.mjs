// The live coach policy on simulated sessions: what would it say, and does it follow its own rules?
// usage: node test_policy.mjs   (Node 22+)
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const A = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/ai/");
const { createCoachPolicy } = await import(pathToFileURL(A + "coachPolicy.js").href);
const { jumpOf } = await import(pathToFileURL(A + "coachSignals.js").href);
const { BANK, ALL_PHRASES, fixKeyFor, phraseForText } = await import(pathToFileURL(A + "coachPhrases.js").href);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } };
const quiet = process.argv.includes("--quiet");

const rngFrom = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const F = (key, low, extra = {}) => ({ key, area: "arm", low, severity: 1, cue: { headline: `on-screen ${key}`, drill: "the drill" }, ...extra });
const say = (r) => (r.parts.length ? r.parts.map((p) => p.text).join(" ") : r.fallbackText ? `[phone voice] ${r.fallbackText}` : r.tone === "good" ? "(soft tone)" : "(silent)");
function session(name, reps, seed = 1) {
  const p = createCoachPolicy({ rng: rngFrom(seed) });
  if (!quiet) console.log(`\n── ${name}`);
  const spoken = [];
  reps.forEach((rep, i) => {
    const r = p.judge({ overhead: true, peakSpeed: 7, reachUp: 0.6, ...rep });
    const line = say(r);
    spoken.push({ rep, r, line });
    if (!quiet) console.log(`  #${i + 1} ${rep.inBand ? "good " : "fault"} ${rep.inBand ? "" : rep.faults[0].key.padEnd(14)} -> ${line}${r.note ? `   [screen: ${r.note}]` : ""}${r.drill ? "   [drill on screen]" : ""}${r.later ? `\n       later(${r.later.kind}): ${r.later.parts.map((x) => x.text).join(" ")}` : ""}`);
  });
  return { p, spoken };
}
const good = (extra = {}) => ({ inBand: true, faults: [], ...extra });
const bad = (key, low = true, extra = {}) => ({ inBand: false, faults: [F(key, low)], ...extra });

// the complaint: the same fault again and again used to get the same sentence every time
const a = session("same fault five times, then fixed", [bad("shoulder"), bad("shoulder"), bad("shoulder"), bad("shoulder"), bad("shoulder"), good()]);
const aLines = a.spoken.map((s) => s.line);
ok(new Set(aLines.slice(0, 5)).size >= 4, "the same fault is not said the same way each time");
ok(a.spoken[2].r.drill && /drill|slow|freeze|shadow/i.test(aLines[2]), "the third time in a row brings the drill");
ok(aLines[1].split(" ").length <= 6, "the second time is a short reminder");
ok(!a.spoken[3].r.drill, "the drill is said once per fault");
ok(/fix|better|that's it|what we wanted|do that again/i.test(aLines[5]), "the fix is acknowledged");

const b = session("good session", [good(), good({ peakSpeed: 7 }), good({ peakSpeed: 7.1 }), good({ peakSpeed: 7.2 }), good({ peakSpeed: 7.1 }), good({ peakSpeed: 8.3 }), good({ jump: { jumped: true, onTop: true, late: false } }), good({ jump: { jumped: true, late: true, onTop: false } }), good(), good(), good()], 7);
const bLines = b.spoken.map((s) => s.line);
ok(bLines.some((l) => /fastest|best|quickest/i.test(l)), "a personal best speed is noticed");
ok(bLines.some((l) => /in a row/i.test(l)), "a streak is noticed");
ok(bLines.some((l) => /top of the jump|peak/i.test(l)), "jump timing is praised");
ok(b.spoken.some((s) => s.r.later?.kind === "set"), "a set summary is queued after five swings");

const long20 = session("twenty good swings", [...Array(20)].map(() => good()), 4);
const plain = /^(Good one|That's it|Clean|Nice, that's the shape|Yes, like that|There you go|Good, again|That's what I want|Smooth|Good swing)/;
const runs = long20.spoken.map((s) => (plain.test(s.line) ? 1 : 0)).join("").split("0").map((x) => x.length);
ok(Math.max(...runs) <= 2, "never a plain 'good' more than twice running: " + runs.join(","));
ok(long20.spoken.some((s) => s.line === "(soft tone)"), "a soft tone stands in for the third plain 'good'");
ok(long20.spoken.filter((s) => /in a row/.test(s.line)).length <= 6, "streak lines only at the milestones");

const c = session("a fast swing that is too low gets credit first", [good(), good(), good({ peakSpeed: 6 }), bad("reach", true, { reachUp: 0.3, peakSpeed: 9 }), bad("elbow", false, { peakSpeed: 9, jump: { jumped: true, late: false, onTop: false } })], 3);
ok(/snap|pace/i.test(c.spoken[3].line) || /reach/i.test(c.spoken[3].line), "credit for speed before the reach correction");

const dd = session("slowing down", [...Array(4)].map(() => good({ peakSpeed: 8 })).concat([...Array(4)].map(() => good({ peakSpeed: 5.5 }))), 11);
ok(dd.spoken.some((s) => s.r.later?.kind === "fatigue"), "a slowing arm is noticed");

// every fault the engine produces has wording at three levels; an unknown one falls back to the phone's voice
for (const k of ["reach", "prep", "speed", "shoulder", "elbow", "knee", "body.knee", "body.trunk"]) for (const low of [true, false]) {
  if (["reach", "prep", "speed"].includes(k) && !low) continue;
  const fk = fixKeyFor({ key: k, low });
  ok(fk && BANK[`${fk}.1`] && BANK[`${fk}.2`] && BANK[`${fk}.3`], `wording for ${k} low=${low} (${fk})`);
}
const e = createCoachPolicy({ rng: rngFrom(5) }).judge({ inBand: false, faults: [{ key: "body.stance", low: true, cue: { headline: "Feet a bit wider" } }] });
ok(e.fallbackText === "Feet a bit wider" && !e.parts.length, "a fault without wording falls back to its on-screen line");
ok(/^ready\.knee\.high\./.test(createCoachPolicy({ rng: rngFrom(2) }).varyReady("Bend your knees").id || ""), "ready cue varied from its original wording");
ok(phraseForText("Bend your knees")?.id === "ready.knee.high.0", "original wording maps to its recorded clip");

// the jump signal needs a stable baseline and does not fire on a standing swing
const frames = (hipY) => [...Array(40)].map((_, i) => {
  const t = i * 0.04, px = Array.from({ length: 33 }, () => [100, 100]), vis = Array(33).fill(1);
  px[11] = [90, 200]; px[12] = [110, 200]; px[23] = [92, hipY(t)]; px[24] = [108, hipY(t)];
  return { t, px, vis };
});
const standing = jumpOf(frames(() => 400), 1.4);
ok(standing && !standing.jumped, "standing still is not a jump");
const jumped = jumpOf(frames((t) => 400 - (t > 1.0 && t < 1.5 ? 140 * Math.sin(((t - 1.0) / 0.5) * Math.PI) : 0)), 1.28);
ok(jumped && jumped.jumped && jumped.onTop, "a real rise with the swing at its top is a jump on top: " + JSON.stringify(jumped));
const late = jumpOf(frames((t) => 400 - (t > 0.8 && t < 1.3 ? 140 * Math.sin(((t - 0.8) / 0.5) * Math.PI) : 0)), 1.44);
ok(late && late.jumped && late.late, "the swing well after the top is late: " + JSON.stringify(late));

// wording hygiene
const ids = new Set(), texts = new Set();
for (const p of ALL_PHRASES) { ok(!ids.has(p.id), "unique id " + p.id); ids.add(p.id); ok(!texts.has(p.text), "unique text " + p.text); texts.add(p.text); }
const longLines = ALL_PHRASES.filter((p) => p.text.split(/\s+/).length > 22);
ok(longLines.length === 0, "no line over 22 words: " + longLines.map((l) => l.id).join(","));
console.log(`\nphrases: ${ALL_PHRASES.length}, longest ${Math.max(...ALL_PHRASES.map((p) => p.text.split(/\s+/).length))} words`);
console.log(fails ? `\n${fails} FAILED` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
