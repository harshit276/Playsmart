/**
 * @module swingDetector
 * Finds swings in a live stream of pose frames.
 *
 * The signal is how fast the hitting wrist moves RELATIVE TO THE SHOULDER, in
 * metres per second, from MediaPipe's 3D world landmarks. World landmarks are
 * hip-centred, so walking, lunging or turning in place does not register: only
 * the arm doing something does. A swing is a clear peak of that speed, and the
 * peak is taken as the moment of contact (the wrist is fastest as the arm
 * drives through the ball; for practice reps this is within a frame or two).
 *
 * A peak is confirmed a moment AFTER it happens (confirmDelay) because you can
 * only know it was the maximum once speed has started to fall.
 *
 * Pure: no browser, no clock. Times are whatever the caller passes (seconds).
 */

const DEFAULTS = {
  threshold: 2.5, // m/s: the peak must be at least this fast to count (fast shadow swings peak at 3-5+)
  refractory: 0.8, // s: minimum gap between two swings
  lookBack: 0.3, // s: the peak must be the fastest of this much before it...
  confirmDelay: 0.15, // s: ...and this much after it
  prominence: 0.45, // speed before the peak must drop under this share of it
  prominenceWindow: 0.5, // s: how far back "before the peak" looks
  maxGap: 0.25, // s: a longer gap between frames means tracking was lost
};

export function createSwingDetector(options = {}) {
  const o = { ...DEFAULTS, ...options };
  /** @type {{t:number, s:number, p:number[]}[]} */
  let buf = [];
  let prev = null;
  let recent = []; // last few instantaneous speeds, for smoothing
  let lastPeakT = -Infinity;
  let testedT = -Infinity;

  const reset = () => { buf = []; prev = null; recent = []; lastPeakT = -Infinity; testedT = -Infinity; };

  /**
   * @param {number} t         seconds (any monotonic clock)
   * @param {number[]|null} wrist     [x,y,z] world metres, or null when not visible
   * @param {number[]|null} shoulder  [x,y,z] world metres, or null when not visible
   * @returns {{tPeak:number, peakSpeed:number}|null} a confirmed swing, else null
   */
  function push(t, wrist, shoulder) {
    if (!wrist || !shoulder) { prev = null; recent = []; return null; }
    const p = [wrist[0] - shoulder[0], wrist[1] - shoulder[1], wrist[2] - shoulder[2]];
    let inst = 0;
    if (prev) {
      const dt = t - prev.t;
      if (dt > 0 && dt <= o.maxGap) inst = Math.hypot(p[0] - prev.p[0], p[1] - prev.p[1], p[2] - prev.p[2]) / dt;
    }
    prev = { t, p };
    recent.push(inst);
    if (recent.length > 3) recent.shift();
    const s = recent.reduce((a, b) => a + b, 0) / recent.length;
    buf.push({ t, s, p });
    while (buf.length && buf[0].t < t - 2.0) buf.shift();

    // Test every frame that is now old enough to have its "after" window filled.
    let found = null;
    for (const c of buf) {
      if (c.t <= testedT || c.t > t - o.confirmDelay) continue;
      testedT = c.t;
      if (c.s < o.threshold || c.t - lastPeakT < o.refractory) continue;
      let isMax = true, before = Infinity;
      for (const f of buf) {
        if (f.t >= c.t - o.lookBack && f.t <= c.t + o.confirmDelay && f.s > c.s) { isMax = false; break; }
        if (f.t >= c.t - o.prominenceWindow && f.t < c.t) before = Math.min(before, f.s);
      }
      if (!isMax) continue;
      if (before === Infinity || before > o.prominence * c.s) continue; // no clear run-up: not a swing
      lastPeakT = c.t;
      found = { tPeak: c.t, peakSpeed: c.s };
    }
    return found;
  }

  /** The latest smoothed wrist-to-shoulder speed in m/s (0 when tracking was lost). */
  const speed = () => (prev && buf.length ? buf[buf.length - 1].s : 0);

  return { push, reset, speed, options: o };
}
