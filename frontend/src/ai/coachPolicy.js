/**
 * @module coachPolicy
 * Decides what a coach would say after a swing, and remembers the session so it can say it like one.
 *
 * The angle checks (ai/overheadSwing, ai/bodyCheck) answer "was this swing in range?". This answers "what is worth
 * saying now?": it praises what was good (not only fixes what was bad), notices a personal best, a streak, a fix
 * that finally worked, the same fault coming back (and moves from a cue to a shorter reminder to a drill), a
 * tired arm, and the end of a set. It says ONE thing per swing, picks wording it has not used lately, and
 * leaves a swing unspoken (a soft tone) rather than say "good" for the fourth time running.
 *
 * Everything it returns is a list of phrase ids/text from ai/coachPhrases (so the voice layer can play a recording)
 * plus the on-screen note. Pure: no browser, no clock; pass `rng` to make it deterministic.
 */
import { BANK, STREAK_MARKS, fixKeyFor, pickLine } from "./coachPhrases.js";
import { compareToSelf } from "./coachSignals.js";

const median = (a) => { const s = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

export const POLICY = {
  snapRatio: 1.15, // a swing this much faster than the player's usual earns "good snap"
  setSize: 5, // swings per set: a spoken summary after each
  fatigueRatio: 0.8, // last four swings slower than this share of the first four: tired
  fatigueEvery: 10, // swings between two "you're slowing down" remarks
  genericRun: 2, // plain "good one"s in a row before the next in-range swing gets a soft tone instead
  tipEvery: 6, // swings between two jump-timing tips
};

export function createCoachPolicy({ rng = Math.random } = {}) {
  let s;
  const reset = () => {
    s = { reps: [], used: {}, run: { key: null, count: 0 }, drillSaid: new Set(), genericRun: 0, lastPrefixAt: -9, fatigueAt: -99, tipAt: -99, wasFaulted: false };
  };
  reset();

  const part = (key) => pickLine(key, s.used, rng);

  /**
   * @param {object} rep
   * @param {boolean} rep.inBand
   * @param {{key:string, area?:string, low?:boolean, cue?:{headline:string, drill?:string}}[]} rep.faults  worst first
   * @param {number|null} [rep.peakSpeed]
   * @param {number|null} [rep.reachUp]
   * @param {boolean} [rep.overhead]
   * @param {{jumped:boolean, late:boolean, onTop:boolean}|null} [rep.jump]
   * @returns {{ parts:{id:string,text:string}[], fallbackText:string|null, tone:"good"|"flag"|null, note:string|null,
   *             drill:string|null, later:null|{kind:"set"|"fatigue", parts:{id:string,text:string}[]} }}
   */
  function judge(rep) {
    const prev = s.reps;
    const n = prev.length + 1;
    const cmp = compareToSelf(rep, prev);
    const jump = rep.jump || null;
    const faults = rep.faults || [];
    const top = faults[0] || null;
    const topKey = top ? fixKeyFor(top) || top.key : null;
    const out = { parts: [], fallbackText: null, tone: null, note: null, drill: null, later: null };

    if (rep.inBand) {
      s.run = { key: null, count: 0 };
      const streak = (() => { let k = 1; for (let i = prev.length - 1; i >= 0 && prev[i].inBand; i--) k++; return k; })();
      const snap = cmp.speedRatio != null && cmp.speedRatio >= POLICY.snapRatio;
      const reachStrong = !!rep.overhead && cmp.reachStrong;
      let key = null, note = null, generic = false;
      if (n === 1) { key = "praise.first"; }
      else if (cmp.bestSpeed) { key = "praise.bestSpeed"; note = "Fastest swing yet"; }
      else if (STREAK_MARKS.includes(streak)) { key = `streak.${streak}`; note = `${streak} in a row`; }
      else if (s.wasFaulted) { key = "praise.fixed"; note = "That's the fix"; }
      else if (cmp.bestReach) { key = "praise.bestReach"; note = "Highest reach yet"; }
      else if (jump?.onTop) { key = "praise.timing"; note = "Hit at the top of your jump"; }
      else if (jump?.jumped) { key = "praise.jump"; note = "Nice jump"; }
      else if (snap) { key = "praise.snap"; note = "Good snap"; }
      else if (reachStrong) { key = "praise.reach"; note = "Great reach"; }
      else if (jump?.late && n - s.tipAt >= POLICY.tipEvery) { key = "tip.jumpLate"; note = "Hit it at the top of your jump"; s.tipAt = n; }
      else { key = "praise.generic"; generic = true; }

      if (generic) {
        if (s.genericRun >= POLICY.genericRun) { out.tone = "good"; s.genericRun = 0; key = null; } else s.genericRun++;
      } else s.genericRun = 0;
      if (key) { out.parts = [part(key)]; out.tone = "good"; }
      out.note = note;
      s.wasFaulted = false;
    } else {
      s.genericRun = 0;
      s.wasFaulted = true;
      const same = s.run.key === topKey;
      s.run = { key: topKey, count: same ? s.run.count + 1 : 1 };
      const fixKey = top ? fixKeyFor(top) : null;
      const level = s.run.count >= 3 && fixKey && !s.drillSaid.has(fixKey) ? 3 : s.run.count >= 2 ? 2 : 1;
      out.tone = "flag";
      if (fixKey && BANK[`${fixKey}.${level}`]) {
        const lead = [];
        // something good about the same swing first, but not on every swing and never before a drill
        if (level < 3 && n - s.lastPrefixAt >= 2) {
          const snap = cmp.speedRatio != null && (cmp.bestSpeed || cmp.speedRatio >= POLICY.snapRatio);
          const pre = jump?.jumped ? "pre.jump" : snap && top.key !== "speed" ? "pre.snap" : rep.overhead && cmp.reachStrong && top.key !== "reach" ? "pre.reach" : null;
          if (pre) { lead.push(part(pre)); s.lastPrefixAt = n; }
        }
        out.parts = [...lead, part(`${fixKey}.${level}`)];
        if (level === 3) { s.drillSaid.add(fixKey); out.drill = top.cue?.drill || null; }
      } else if (top?.cue?.headline) {
        out.fallbackText = top.cue.headline; // no wording for this one yet: the phone's voice reads the on-screen line
      }
    }

    s.reps.push({ inBand: !!rep.inBand, topKey, peakSpeed: rep.peakSpeed ?? null, reachUp: rep.reachUp ?? null, keys: faults.map((f) => fixKeyFor(f) || f.key) });

    // what to say once the player has stopped and is back in the ready stance
    const fatigue = (() => {
      if (n < 8 || n - s.fatigueAt < POLICY.fatigueEvery) return false;
      const sp = s.reps.map((r) => r.peakSpeed).filter(Number.isFinite);
      if (sp.length < 8) return false;
      return median(sp.slice(-4)) < POLICY.fatigueRatio * median(sp.slice(0, 4));
    })();
    if (fatigue) { s.fatigueAt = n; out.later = { kind: "fatigue", parts: [part("fatigue")] }; }
    else if (n % POLICY.setSize === 0) {
      const set = s.reps.slice(-POLICY.setSize);
      const share = set.filter((r) => r.inBand).length / set.length;
      const kind = share >= 0.8 ? "strong" : share >= 0.4 ? "mixed" : "rough";
      const parts = [part(`set.${kind}`)];
      if (kind !== "strong") {
        const counts = {};
        for (const r of set) for (const k of new Set(r.keys)) counts[k] = (counts[k] || 0) + 1;
        const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (worst && worst[1] >= 2 && BANK[`${worst[0]}.1`]) parts.push(part(`${worst[0]}.1`));
      }
      out.later = { kind: "set", parts };
    }
    return out;
  }

  /** A varied spoken wording for a ready-stance cue whose on-screen wording is `text`; text itself when it has none. */
  function varyReady(text) {
    const key = Object.keys(BANK).find((k) => k.startsWith("ready.") && BANK[k][0] === text);
    return key ? part(key) : { id: null, text };
  }

  /** What the session looks like so far: for tests, and for a later "brain" that writes the commentary. */
  function stats() {
    const sp = s.reps.map((r) => r.peakSpeed).filter(Number.isFinite);
    const counts = {};
    for (const r of s.reps) for (const k of new Set(r.keys)) counts[k] = (counts[k] || 0) + 1;
    return { reps: s.reps.length, good: s.reps.filter((r) => r.inBand).length, speedMedian: median(sp), speedBest: sp.length ? Math.max(...sp) : null, faults: counts };
  }

  return { reset, judge, varyReady, stats };
}
