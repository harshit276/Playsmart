import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Volume2, ShieldCheck } from "lucide-react";
import FormChips from "@/components/practice/FormChips";
import demo from "@/data/poseDemo.json";

/**
 * PoseDemo — the home page's hero visual: a real tracked badminton smash, replayed as a skeleton.
 *
 * What you see is what shadow practice does: the pose tracker follows the body, and at the top of the
 * reach the swing is judged. The first swing is a little low, so the coach says "Arm higher" and the
 * correct arm is drawn in green; the second is good. The motion is the actual landmark data of one
 * tracked session (src/data/poseDemo.json: landmarks only, no video pixels, lightly smoothed), not an
 * animation someone drew. The two verdicts are what the practice screen's own judge returned for those
 * two swings (ai/overheadSwing.js), so the card can't promise anything the product doesn't do.
 *
 * Cheap on purpose: one small canvas, paused when off screen or when the tab is hidden, a still frame
 * for people who ask for reduced motion, and the data is ~12 KB.
 */

const BONES = [
  ["lsh", "rsh"], ["lhip", "rhip"], ["lsh", "lhip"], ["rsh", "rhip"],
  ["lsh", "lel"], ["lel", "lwr"],
  ["lhip", "lkn"], ["lkn", "lan"], ["rhip", "rkn"], ["rkn", "ran"],
];
const HIT_ARM = [["rsh", "rel"], ["rel", "rwr"]];
const LIME = "#a3e635", ROSE = "#f43f5e", BONE = "#e4e4e7", DIM = "#a1a1aa";
const PLAY_RATE = 0.8; // a touch slower than real time so the eye can follow the swing
const HOLD_MS = 1900;
const TRAIL = 9;

const J = Object.fromEntries(demo.joints.map((n, i) => [n, i]));
const N = demo.frames.length;
const marks = demo.marks;
const A = marks.find((m) => m.fix) || marks[0];
const B = marks.find((m) => !m.faults.length) || marks[marks.length - 1];
const frameMs = 1000 / demo.fps / PLAY_RATE;

// the replay as a list of timed pieces: play to the first reach, hold, play to the second, hold, play out, rest
const SEGS = [
  { k: "play", a: 0, b: A.frame },
  { k: "hold", f: A.frame, ms: HOLD_MS, view: "A" },
  { k: "play", a: A.frame, b: B.frame },
  { k: "hold", f: B.frame, ms: HOLD_MS, view: "B" },
  { k: "play", a: B.frame, b: N - 1 },
  { k: "rest", ms: 500 },
].map((s) => ({ ...s, ms: s.ms ?? Math.abs(s.b - s.a) * frameMs }));
const TOTAL = SEGS.reduce((t, s) => t + s.ms, 0);

const pt = (frame, name) => {
  const i = Math.max(0, Math.min(N - 1, frame));
  const lo = Math.floor(i), hi = Math.min(N - 1, lo + 1), f = i - lo;
  const a = demo.frames[lo], b = demo.frames[hi];
  return [a[J[name] * 2] * (1 - f) + b[J[name] * 2] * f, a[J[name] * 2 + 1] * (1 - f) + b[J[name] * 2 + 1] * f];
};

function line(ctx, pts, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
const dot = (ctx, p, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); };

function drawScene(ctx, frame, hold) {
  const { w, h } = demo;
  ctx.clearRect(0, 0, w, h);
  // faint court lines, so the figure stands on something
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1.5;
  for (const [x1, y1, x2, y2] of [[0, h * 0.86, w, h * 0.86], [w * 0.5, h * 0.86, w * 0.5, h], [w * 0.12, h * 0.86, w * 0.02, h], [w * 0.88, h * 0.86, w * 0.98, h]]) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // the swing path of the hitting hand: where it has been over the last few frames
  const f0 = Math.floor(frame);
  for (let k = TRAIL; k >= 1; k--) {
    const a = pt(f0 - k, "rwr"), b = pt(f0 - k + 1, "rwr");
    ctx.globalAlpha = (1 - k / (TRAIL + 1)) * 0.85;
    line(ctx, [a, b], LIME, 2.5 + (1 - k / TRAIL) * 4);
  }
  ctx.globalAlpha = 1;

  // body
  for (const [a, b] of BONES) line(ctx, [pt(frame, a), pt(frame, b)], DIM, 4);
  // head: a ring at the nose, sized from the shoulders
  const sh = [pt(frame, "lsh"), pt(frame, "rsh")];
  const shW = Math.hypot(sh[0][0] - sh[1][0], sh[0][1] - sh[1][1]);
  const nose = pt(frame, "nose");
  ctx.strokeStyle = BONE; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(nose[0], nose[1], Math.max(9, shW * 0.36), 0, Math.PI * 2); ctx.stroke();
  // the hitting arm: what is judged
  const wrong = hold && hold.view === "A";
  for (const [a, b] of HIT_ARM) line(ctx, [pt(frame, a), pt(frame, b)], wrong ? ROSE : BONE, 6);
  for (const n of ["lsh", "rsh", "lel", "rel", "lwr", "rwr", "lhip", "rhip", "lkn", "rkn", "lan", "ran"]) dot(ctx, pt(frame, n), 4, "#fff");

  // the correction: the arm where it should be, in green, easing in
  if (hold && hold.view === "A" && A.fix) {
    const t = Math.min(1, hold.t / 420);
    const e = 1 - Math.pow(1 - t, 3);
    const sh2 = pt(A.frame, "rsh");
    const lerp = (p) => [sh2[0] + (p[0] - sh2[0]) * e, sh2[1] + (p[1] - sh2[1]) * e];
    const el = lerp(A.fix[1]), wr = lerp(A.fix[2]);
    ctx.globalAlpha = 0.25 + 0.75 * e;
    line(ctx, [[sh2[0], sh2[1]], el, wr], "rgba(10,10,10,0.85)", 11);
    line(ctx, [[sh2[0], sh2[1]], el, wr], LIME, 7);
    dot(ctx, el, 5.5, "#fff"); dot(ctx, wr, 5.5, "#fff");
    ctx.globalAlpha = 1;
  }
}

/** Where the replay is at time t (ms): the frame to draw, the hold (if any) and how long into it. */
function stateAt(t) {
  let rem = t % TOTAL;
  for (const s of SEGS) {
    if (rem <= s.ms) {
      if (s.k === "play") return { frame: s.a + (s.b - s.a) * (rem / s.ms), view: null };
      if (s.k === "hold") return { frame: s.f, view: s.view, hold: { view: s.view, t: rem } };
      return { frame: N - 1, view: null };
    }
    rem -= s.ms;
  }
  return { frame: N - 1, view: null };
}

const CHIPS = {
  idle: [["shoulder", "Reach", "na"], ["elbow", "Elbow", "na"], ["prep", "Prep", "na"], ["speed", "Speed", "na"]],
  A: [["shoulder", "Reach", "off"], ["elbow", "Elbow", "ok"], ["prep", "Prep", "na"], ["speed", "Speed", "ok"]],
  B: [["shoulder", "Reach", "ok"], ["elbow", "Elbow", "ok"], ["prep", "Prep", "ok"], ["speed", "Speed", "ok"]],
};

export default function PoseDemo({ className = "" }) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const [view, setView] = useState(() => (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "A" : "idle"));
  const viewRef = useRef(view);

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = demo.w * dpr; canvas.height = demo.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { drawScene(ctx, A.frame, { view: "A", t: 9999 }); return undefined; }

    let raf = 0, visible = true, last = 0, clock = 0;
    const tick = (now) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (!last) last = now;
      clock += Math.min(64, now - last); last = now; // a stalled tab doesn't jump the replay
      const st = stateAt(clock);
      drawScene(ctx, st.frame, st.hold);
      const v = st.view || "idle";
      if (v !== viewRef.current) { viewRef.current = v; setView(v); }
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } }, { threshold: 0.15 });
    io.observe(box);
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const chips = CHIPS[view] || CHIPS.idle;
  const speedOf = view === "A" ? A.speed : view === "B" ? B.speed : null;
  const banner = view === "A"
    ? { text: "Arm a little higher", tone: "bg-rose-500 text-white" }
    : view === "B"
      ? { text: "Good reach and arm", tone: "bg-lime-400 text-black" }
      : { text: "Tracking your swing…", tone: "bg-zinc-800 text-zinc-300" };

  return (
    <div className={`relative w-full max-w-[320px] ${className}`}>
      <div className="pointer-events-none absolute -inset-6 bg-lime-400/10 blur-3xl rounded-full" aria-hidden="true" />
      <div className="relative rounded-3xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-2xl shadow-black/60">
        <div ref={boxRef} className="relative rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800/80" style={{ aspectRatio: `${demo.w} / ${demo.h}` }}>
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" role="img"
            aria-label="A stick figure replays a real tracked badminton smash. On the first swing the arm is a little low, so the coach says 'Arm higher' and the correct arm appears in green. The second swing is good." />
          <div className="absolute top-2.5 inset-x-2.5 flex justify-center pointer-events-none" aria-live="off">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold shadow-lg transition-colors duration-200 ${banner.tone}`}>
              {view !== "idle" && <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />}{banner.text}
            </span>
          </div>
          <span className="absolute bottom-2 left-2.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400 bg-zinc-950/80 border border-zinc-800 rounded-full px-2 py-0.5">
            Real tracked swing · sample
          </span>
        </div>
        <div className="mt-2.5">
          <FormChips groups={[{ label: "Swing", items: chips.map(([key, label, state]) => ({ key, label, state, detail: key === "speed" && speedOf ? `${speedOf.toFixed(1)} m/s` : null })) }]} showValues />
        </div>
        <Link to="/practice?sport=badminton&shot=smash"
          className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-zinc-950 border border-lime-400/30 hover:border-lime-400/70 px-3.5 py-3 min-h-11 text-[14px] font-bold text-white transition-colors">
          <span>Try it live. No account.</span>
          <ArrowRight className="w-4 h-4 text-lime-400" aria-hidden="true" />
        </Link>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-lime-400 shrink-0" aria-hidden="true" /> Runs on your phone. Your video never leaves it.
        </p>
      </div>
    </div>
  );
}
