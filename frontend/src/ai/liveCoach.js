/**
 * @module liveCoach
 * The continuous coach for live practice: while the player holds a position it
 * says, again and again as needed, what is wrong and what to do ("Chest up"),
 * and says "Good" when it is right. It never talks while they are moving, never
 * talks over itself, and rotates through the faults so the legs get a turn
 * instead of the biggest miss being repeated forever.
 *
 * Pure (time is passed in), so the cadence can be tested without a phone.
 *
 * Each call to update() says what to put on screen (`line`, always) and, when
 * it is time, one short phrase to speak (`say`) with the matching tone.
 */

/**
 * @param {object} [o]
 * @param {number} [o.holdMs=700]      how long a position must be held before it is judged
 * @param {number} [o.cooldownMs=3200] minimum gap between spoken cues
 * @param {number} [o.repeatMs=10000]  a fault already spoken is not repeated sooner than this
 * @param {number} [o.goodAfterMs=1500] "Good" may follow a fix this soon after the last cue
 * @param {number} [o.goodGapMs=9000]  "Good" is not repeated sooner than this
 * @param {number} [o.lineClearMs=1800] the on-screen line fades this long after they start moving
 * @param {string} [o.goodText="Good: hold it"] what the on-screen line says when everything is right
 */
export function createCoach(o = {}) {
  const cfg = { holdMs: 700, cooldownMs: 3200, repeatMs: 10000, goodAfterMs: 1500, goodGapMs: 9000, lineClearMs: 1800, goodText: "Good: hold it", ...o };
  let s;
  const reset = () => {
    s = { holdStart: 0, lastSayAt: -1e9, lastGoodAt: -1e9, goodSaid: false, spoken: new Map(), state: null, line: null, lineKey: null, lineSince: 0 };
  };
  reset();

  const show = (now, kind, text) => {
    const key = `${kind}:${text}`;
    if (key !== s.lineKey) { s.line = { kind, text }; s.lineKey = key; s.lineSince = now; }
  };
  const out = (say = null, tone = null) => ({ say, tone, line: s.line });

  return {
    reset,
    /**
     * @param {{now:number, active:boolean, faults:{key:string, say:string}[]|null}} a
     *   active: armed, holding still, and in a position that can be judged
     *   faults: what is out of range right now, worst first
     */
    update({ now, active, faults }) {
      if (!active) {
        s.holdStart = 0;
        if (s.line && now - s.lineSince > cfg.lineClearMs) { s.line = null; s.lineKey = null; }
        return out();
      }
      if (!s.holdStart) s.holdStart = now;
      if (now - s.holdStart < cfg.holdMs) return out();

      if (faults && faults.length) {
        show(now, "fix", faults[0].say);
        s.state = "fix";
        s.goodSaid = false;
        // the first fault not said recently, so the legs get a turn after the arm
        const fresh = faults.find((f) => now - (s.spoken.get(f.key) ?? -1e9) >= cfg.repeatMs);
        if (fresh && now - s.lastSayAt >= cfg.cooldownMs) {
          s.spoken.set(fresh.key, now);
          s.lastSayAt = now;
          return out(fresh.say, "flag");
        }
        return out();
      }

      show(now, "good", cfg.goodText);
      if (s.state !== "good") s.spoken.clear(); // a later slip is worth saying again straight away
      s.state = "good";
      // "Good" waits for its turn (it may follow a fix by a second or so) rather than being skipped
      if (!s.goodSaid && now - s.lastGoodAt >= cfg.goodGapMs && now - s.lastSayAt >= cfg.goodAfterMs) {
        s.goodSaid = true; s.lastGoodAt = now; s.lastSayAt = now;
        return out("Good", "good");
      }
      return out();
    },
  };
}
