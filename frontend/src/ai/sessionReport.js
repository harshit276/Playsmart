/**
 * @module sessionReport
 * Turns a finished practice session (the list of swings) into a report a player can learn from: how it went,
 * what was good, what to work on and the drill for it, check by check, swing by swing, whether they tired, and
 * what to do next time. Everything is computed from the swings; nothing is guessed or padded: a strength is only
 * listed when the numbers back it, and with too few swings the report says so instead of drawing conclusions.
 *
 * HONEST LIMITS, carried into the report: only shots hit up high (smash, clear, drop, tennis serve / overhead /
 * lob, table tennis smash) are judged with logic tuned on real footage (reach, elbow lead, speed). Every other shot
 * is judged against rule-of-thumb guide ranges that have not been validated, so the report says "guide", and when
 * nearly every swing is flagged on such a shot it says the ranges may not suit the player rather than "you were
 * wrong 7 times out of 7".
 *
 * Pure: no browser, no clock. Reps are what components/LivePractice records:
 *   { n, inBand, peakSpeed, reachUp, byReach, overhead, jump:{jumped,onTop,late}|null,
 *     chips:{shoulder, elbow, prep, speed, body}: "ok"|"off"|"na", faults:[{key, cue:{headline, feel, drill}}] }
 */

const median = (a) => { const s = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export const REPORT = {
  minForConclusions: 5, // fewer swings than this: no trends, no "you got better"
  strengthShare: 0.8, // a check is a strength when it was right this often
  minorShare: 0.15, // a fault on fewer than this share of swings (and under 2 swings) is "a small thing"
  fatigueDrop: 0.85, // last third slower than this share of the first third
  evenCv: 0.12, // speed spread under this (coefficient of variation) is "very even"
  betterBy: 15, // points in range, second half over first, to say they improved
  guideLowRate: 0.2, // on a guide-only shot, at or under this share in range means the ranges may not fit the player
};

const CHECK_LABEL = (overhead) => ({
  shoulder: overhead ? "Reach" : "Arm height",
  elbow: "Elbow",
  prep: "Elbow lead",
  speed: "Swing speed",
  body: "Body position",
  contact: "Contact point",
  backswing: "Backswing",
});

/** Longest run of in-range swings: { len, from, to } (swing numbers). */
function bestRun(reps) {
  let best = { len: 0, from: 0, to: 0 };
  let cur = null;
  for (const r of reps) {
    if (r.inBand) {
      cur = cur ? { ...cur, len: cur.len + 1, to: r.n } : { len: 1, from: r.n, to: r.n };
      if (cur.len > best.len) best = cur;
    } else cur = null;
  }
  return best;
}

/**
 * @param {{reps:object[], durationSec?:number|null, noun?:string}} p
 */
export function buildReport({ reps, durationSec = null }) {
  const total = reps.length;
  const good = reps.filter((r) => r.inBand).length;
  const rate = total ? Math.round((good / total) * 100) : 0;
  const overhead = reps.some((r) => r.overhead);
  const validated = reps.some((r) => r.byReach); // judged with the reach logic tuned on real footage
  const enough = total >= REPORT.minForConclusions;
  const labels = CHECK_LABEL(overhead);

  // speed
  const speeds = reps.map((r) => r.peakSpeed).filter(Number.isFinite);
  const bestSpeedRep = reps.reduce((b, r) => (Number.isFinite(r.peakSpeed) && (!b || r.peakSpeed > b.peakSpeed) ? r : b), null);
  const third = Math.max(1, Math.floor(speeds.length / 3));
  const firstThird = mean(speeds.slice(0, third));
  const lastThird = mean(speeds.slice(-third));
  const tired = speeds.length >= 6 && firstThird && lastThird / firstThird < REPORT.fatigueDrop;
  const cv = speeds.length >= 5 ? Math.sqrt(mean(speeds.map((s) => (s - mean(speeds)) ** 2))) / mean(speeds) : null;
  const speed = {
    n: speeds.length, median: median(speeds), best: bestSpeedRep ? bestSpeedRep.peakSpeed : null, bestN: bestSpeedRep ? bestSpeedRep.n : null,
    first: firstThird, last: lastThird, tired: !!tired, even: cv != null && cv < REPORT.evenCv,
  };

  // reach and jumps (shots hit up high)
  const reaches = reps.map((r) => r.reachUp).filter(Number.isFinite);
  const reach = reaches.length ? { median: median(reaches), best: Math.max(...reaches) } : null;
  const jumpReps = reps.filter((r) => r.jump && r.jump.jumped);
  const jumps = overhead && reps.some((r) => r.jump) ? { count: jumpReps.length, onTop: jumpReps.filter((r) => r.jump.onTop).length, late: jumpReps.filter((r) => r.jump.late).length } : null;

  // check by check
  const checks = [];
  for (const key of ["shoulder", "elbow", "prep", "speed", "contact", "backswing", "body"]) {
    const ok = reps.filter((r) => r.chips?.[key] === "ok").length;
    const off = reps.filter((r) => r.chips?.[key] === "off").length;
    if (ok + off === 0) continue;
    checks.push({ key, label: labels[key], ok, off, seen: ok + off });
  }

  // what to work on: how many swings each fault cost, worst first; a fault on very few swings is "a small thing"
  const counts = {};
  for (const r of reps) for (const f of r.faults || []) {
    counts[f.key] = counts[f.key] || { n: 0, f };
    counts[f.key].n++;
    counts[f.key].f = f;
  }
  const ranked = Object.values(counts).sort((a, b) => b.n - a.n).map((c) => ({ ...c.f.cue, key: c.f.key, count: c.n }));
  const isMinor = (c) => total >= 8 && c.count < 2 && c.count / total < REPORT.minorShare;
  const work = ranked.filter((c) => !isMinor(c)).slice(0, 3);
  const minor = ranked.filter(isMinor).map((c) => c.headline);

  // halves
  const half = Math.floor(total / 2);
  const rateOf = (rs) => (rs.length ? Math.round((rs.filter((r) => r.inBand).length / rs.length) * 100) : null);
  const firstHalf = rateOf(reps.slice(0, half)), secondHalf = rateOf(reps.slice(half));
  const improved = enough && total >= 8 && firstHalf != null && secondHalf != null && secondHalf - firstHalf >= REPORT.betterBy;
  const run = bestRun(reps);

  // what went well: only what the numbers back, most telling first; the per-check strengths come last and are capped at
  // two, so a session where every check was fine does not read as a list of the same compliment
  const strengths = [];
  if (improved) strengths.push({ key: "improved", title: "You got better as you went", detail: `${firstHalf}% in range in the first half, ${secondHalf}% in the second` });
  if (run.len >= 3) strengths.push({ key: "run", title: `Your best run: ${run.len} good swings in a row`, detail: `swings ${run.from} to ${run.to}` });
  if (speed.n >= 3 && speed.best != null) strengths.push({ key: "fastest", title: `Fastest swing: ${speed.best.toFixed(1)} m/s`, detail: `swing ${speed.bestN}` });
  if (jumps && jumps.count >= 1) strengths.push({ key: "jump", title: `You jumped on ${jumps.count} of ${total} swings`, detail: jumps.onTop ? `${jumps.onTop} of them were hit at the top of the jump` : null });
  if (speed.even) strengths.push({ key: "even", title: "A very even swing speed", detail: "your swings were about as fast as each other, which is what a repeatable stroke looks like" });
  const solid = checks
    .filter((c) => c.seen >= 3 && c.ok / c.seen >= REPORT.strengthShare && c.ok >= 3)
    .sort((x, y) => y.ok / y.seen - x.ok / x.seen || y.seen - x.seen)
    .slice(0, 2);
  for (const c of solid) strengths.push({ key: `check.${c.key}`, title: `${c.label} was right on ${c.ok} of ${c.seen} swings` });
  const strong = strengths.slice(0, 4);

  // notes
  const notes = [];
  if (speed.tired) notes.push({ key: "tired", text: `Your swing speed dropped late in the session (${speed.first.toFixed(1)} to ${speed.last.toFixed(1)} m/s). Rest between sets, or shorten the set.` });
  if (jumps && jumps.late >= 2) notes.push({ key: "jumplate", text: `On ${jumps.late} swings you hit on the way down. Jump a touch earlier so you meet it at the top.` });
  // contact height varied a lot from swing to swing (shots judged by where the hand is at contact)
  const heights = reps.map((r) => r.feat && r.feat.height).filter(Number.isFinite);
  if (heights.length >= 6) {
    const spread = Math.max(...heights) - Math.min(...heights);
    if (spread > 1.1) notes.push({ key: "heightvar", text: "Your contact height varied a lot from swing to swing. Aim to meet the ball at the same height each time: a repeatable contact point is what makes a stroke reliable." });
  }
  // the player was facing the camera on most swings, so contact point and backswing could not be judged
  const ruled = reps.filter((r) => r.ruled);
  if (ruled.length >= 4 && ruled.filter((r) => r.feat && r.feat.sideOn === false).length / ruled.length >= 0.6) {
    notes.push({ key: "sideon", text: "You were facing the camera on most swings, so how far in front you hit and how big your backswing was could not be checked. Film from the side to include them." });
  }
  let calibration = null;
  if (!validated && total >= REPORT.minForConclusions) {
    calibration = rate / 100 <= REPORT.guideLowRate
      ? "Almost every swing was flagged. The guide ranges for this shot haven't been validated against real players yet, so they may not suit your style. Use the swing-by-swing view and your own consistency rather than the verdicts, and tell us if it felt wrong."
      : "The ranges for this shot are guide values, not yet validated against real players. Use them as a steer, and watch your consistency from session to session.";
  }

  // what to do next time
  let next = null;
  if (work[0]) next = { headline: work[0].headline, drill: work[0].drill, target: Math.min(100, Math.max(rate + 10, 50)) };
  else if (total >= 1) next = { headline: "Keep the standard and add pace", drill: "Same shot, a little faster each set of five, and stop the moment the shape slips.", target: null };

  return {
    total, good, rate, enough, validated, overhead, durationSec,
    speed, reach, jumps, checks, strengths: strong, work, minor, notes, calibration, next,
    series: reps.map((r) => ({ n: r.n, speed: Number.isFinite(r.peakSpeed) ? r.peakSpeed : null, inBand: !!r.inBand })),
    run, firstHalf, secondHalf,
  };
}

// ─── remembering sessions on this device, to compare with last time ───
const KEY = "formanti_practice_history_v1";

export function readHistory() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}

/** Save a session (kept: the last 40). Returns the previous session of the same shot, or null. */
export function rememberSession({ sport, shot, total, good, speedMedian, at }) {
  const hist = readHistory();
  const prev = [...hist].reverse().find((h) => h.sport === sport && h.shot === shot) || null;
  if (total > 0) {
    hist.push({ sport, shot, total, good, speedMedian: speedMedian ?? null, at: at ?? Date.now() });
    try { localStorage.setItem(KEY, JSON.stringify(hist.slice(-40))); } catch { /* private mode: no comparison next time */ }
  }
  return prev;
}

/** "Last time 58%, now 71%": a sentence, or null when there is no earlier session of this shot. */
export function compareWithLast(prev, total, good) {
  if (!prev || !prev.total || !total) return null;
  const was = Math.round((prev.good / prev.total) * 100), now = Math.round((good / total) * 100);
  const d = now - was;
  const when = (() => { const days = Math.floor((Date.now() - (prev.at || 0)) / 86400000); return days <= 0 ? "earlier today" : days === 1 ? "yesterday" : `${days} days ago`; })();
  return { was, now, delta: d, text: d === 0 ? `Same as last time (${when}): ${now}% in range.` : `${d > 0 ? "Up" : "Down"} ${Math.abs(d)} points on last time (${when}): ${was}% then, ${now}% now.` };
}
