// The session report: does it say what the swings support, and nothing more?  usage: node test_report.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const A = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/ai/");
const { buildReport, compareWithLast, REPORT } = await import(pathToFileURL(A + "sessionReport.js").href);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } };
const cue = (h) => ({ headline: h, feel: "feel", drill: "drill for " + h });
const REACH = { key: "reach", cue: cue("Reach up: hit it above your head") };
const SPEED = { key: "speed", cue: cue("Swing through faster") };
const swing = (n, o = {}) => ({
  n, inBand: true, peakSpeed: 7 + (n % 3) * 0.3, reachUp: 0.7, byReach: true, overhead: true, jump: null,
  chips: { shoulder: "ok", elbow: "ok", prep: "ok", speed: "ok", body: "na" }, faults: [], ...o,
});
const bad = (n, fault, chipKey, o = {}) => swing(n, { inBand: false, faults: [fault], chips: { shoulder: "ok", elbow: "ok", prep: "ok", speed: "ok", body: "na", [chipKey]: "off" }, ...o });

// the session in the founder's screenshot: 14 swings, 10 in range, reach low on 3, one slow
const reps = [...Array(14)].map((_, i) => swing(i + 1));
for (const i of [2, 7, 11]) reps[i] = bad(i + 1, REACH, "shoulder", { reachUp: 0.3 });
reps[4] = bad(5, SPEED, "speed", { peakSpeed: 4.5 });
const r = buildReport({ reps, durationSec: 190 });
console.log(JSON.stringify({ total: r.total, good: r.good, rate: r.rate, validated: r.validated, strengths: r.strengths.map((s) => s.title), work: r.work.map((w) => `${w.headline} x${w.count}`), minor: r.minor, checks: r.checks.map((c) => `${c.label} ${c.ok}/${c.seen}`), notes: r.notes.map((n) => n.text), next: r.next && r.next.headline, calibration: r.calibration }, null, 1));
ok(r.total === 14 && r.good === 10 && r.rate === 71, "headline numbers match the screenshot (10/14, 71%)");
ok(r.validated && r.calibration === null, "an overhead shot judged by the reach logic is validated: no guide-only note");
ok(r.work.length === 1 && r.work[0].key === "reach" && r.work[0].count === 3, "the reach fault (3 of 14) is the thing to work on");
ok(r.minor.length === 1 && /faster/i.test(r.minor[0]), "the one slow swing is 'a small thing', not a headline card");
ok(r.strengths.some((s) => /Elbow was right on 14 of 14/.test(s.title)), "elbow right on every swing is a strength");
ok(r.strengths.some((s) => /Fastest swing/.test(s.title)) && r.strengths.some((s) => /best run/i.test(s.title)), "fastest swing and best run are listed");
ok(r.next && /Reach up/.test(r.next.headline) && r.next.target >= 71, "next session targets the biggest fault with a higher target");
ok(r.checks.find((c) => c.key === "shoulder").label === "Reach", "an overhead shot calls the arm check 'Reach'");

// too few swings: no trends, no strengths drawn from nothing
const few = buildReport({ reps: [swing(1), swing(2)] });
ok(!few.enough && !few.strengths.some((s) => s.key === "improved") && few.calibration === null, "two swings: no 'got better', no verdict on the ranges");
ok(buildReport({ reps: [] }).total === 0 && buildReport({ reps: [] }).next === null, "no swings: an empty report, no advice");

// improving through the session
const imp = [...Array(10)].map((_, i) => (i < 5 ? bad(i + 1, REACH, "shoulder", { reachUp: 0.3 }) : swing(i + 1)));
const ri = buildReport({ reps: imp });
ok(ri.strengths.some((s) => s.key === "improved") && ri.firstHalf === 0 && ri.secondHalf === 100, "0% then 100%: 'got better as you went'");

// tiring
const tire = [...Array(9)].map((_, i) => swing(i + 1, { peakSpeed: i < 3 ? 9 : i < 6 ? 8 : 6 }));
const rt = buildReport({ reps: tire });
ok(rt.speed.tired && rt.notes.some((n) => n.key === "tired"), "swing speed dropping in the last third is noticed");

// jumps: counted, and hitting on the way down is called out only when it repeats
const jr = [...Array(8)].map((_, i) => swing(i + 1, { jump: i < 5 ? { jumped: true, onTop: i < 2, late: i >= 2 } : { jumped: false, onTop: false, late: false } }));
const rj = buildReport({ reps: jr });
ok(rj.jumps.count === 5 && rj.jumps.onTop === 2 && rj.jumps.late === 3 && rj.notes.some((n) => n.key === "jumplate"), "jumps counted; late hits flagged after two");

// a guide-only shot (not judged by reach) flagged on almost every swing: the report doubts the ranges, not the player
const guide = [...Array(7)].map((_, i) => ({ n: i + 1, inBand: false, peakSpeed: 4, reachUp: null, byReach: false, overhead: false, jump: null, chips: { shoulder: "off", elbow: "ok", prep: "na", speed: "na", body: "ok" }, faults: [{ key: "shoulder", cue: cue("Keep your hitting arm a lot lower at contact") }] }));
const rg = buildReport({ reps: guide });
ok(!rg.validated && /Almost every swing was flagged/.test(rg.calibration || ""), "0 of 7 on a guide-only shot: 'the ranges may not suit your style'");
ok(rg.checks.find((c) => c.key === "shoulder").label === "Arm height", "a non-overhead shot calls it 'Arm height'");
const guideOk = buildReport({ reps: guide.map((g, i) => ({ ...g, inBand: i < 4, faults: i < 4 ? [] : g.faults, chips: { ...g.chips, shoulder: i < 4 ? "ok" : "off" } })) });
ok(/guide values/.test(guideOk.calibration || "") && !/Almost every/.test(guideOk.calibration), "a guide-only shot with a decent score gets the gentler 'guide values' note");

// comparison with last time
const now = Date.now();
ok(compareWithLast(null, 10, 7) === null, "no earlier session: no comparison");
const c1 = compareWithLast({ total: 12, good: 7, at: now - 86400000 * 2 }, 14, 10);
ok(c1 && c1.delta === 13 && /Up 13 points/.test(c1.text) && /2 days ago/.test(c1.text), "up 58% -> 71%: " + (c1 && c1.text));
ok(/Down 10 points/.test(compareWithLast({ total: 10, good: 8, at: now }, 10, 7).text || ""), "a drop is stated plainly too");
console.log(fails ? `\n${fails} FAILED` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
