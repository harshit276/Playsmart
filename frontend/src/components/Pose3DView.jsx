import { useEffect, useRef, useState } from "react";
import { Move3d } from "lucide-react";
import demo from "@/data/poseDemo.json";

/**
 * Pose3DView — one real tracked swing, drawn in 3D, that you can turn with your finger.
 *
 * The points are the pose model's 3D world landmarks (metres, hip-centred) at the top of the reach of
 * the first swing in the hero demo, so this is the same player and the same moment: the white skeleton
 * is the real swing with the arm in rose where it is low, and the green arm is that arm corrected in
 * 3D, rotated at the shoulder exactly the way the product's correction does it (see ai/correctPose.js).
 * It is a view of the measurement, not a render of the person: the depth comes from one camera, so it
 * is an estimate, and the card says so.
 *
 * Drag (or arrow keys) turns it. Left alone it sways gently to show it is 3D; it stops swaying when
 * you touch it, and for people who ask for reduced motion it never moves by itself.
 */

const W = 300, H = 330;
const world = demo.world;
const J = Object.fromEntries(demo.joints.map((n, i) => [n, world.joints[i]]));
const FIX_EL = world.fix[0], FIX_WR = world.fix[1];
const BONES = [["lsh", "rsh"], ["lsh", "lhip"], ["rsh", "rhip"], ["lhip", "rhip"], ["lsh", "lel"], ["lel", "lwr"], ["lhip", "lkn"], ["lkn", "lan"], ["rhip", "rkn"], ["rkn", "ran"]];
const HIT = [["rsh", "rel"], ["rel", "rwr"]];
const LIME = "#a3e635", ROSE = "#f43f5e", BONE = "#d4d4d8";
const PITCH = 0.22; // looking a little down, so the floor reads as a floor
const S = (0.8 * H) / 1.75; // pixels per metre: the figure is about 1.7 m with the arm up
const CY = H / 2 + S * 0.1;
// the angle that shows the player from the front: shoulders across the screen, nose nearer than the shoulders
const BASE = Math.atan2(J.rsh[2] - J.lsh[2], J.rsh[0] - J.lsh[0]) - Math.PI;
const FLOOR_Y = Math.max(J.lan[1], J.ran[1]) + 0.03;

function view(p, th) {
  const c = Math.cos(th), s = Math.sin(th);
  const x = p[0] * c + p[2] * s, z = -p[0] * s + p[2] * c; // smaller z is nearer the viewer (the model's own convention)
  return { sx: W / 2 + S * x, sy: CY + S * (p[1] * Math.cos(PITCH) - z * Math.sin(PITCH)), z };
}
const depth = (z) => Math.max(0, Math.min(1, (0.55 - z) / 1.1)); // 1 near, 0 far

function draw(ctx, ang) {
  const th = BASE + ang;
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // the floor: rings and a cross under the player
  ctx.strokeStyle = "rgba(255,255,255,0.11)"; ctx.lineWidth = 1.2;
  for (const r of [0.3, 0.6, 0.9]) {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2, q = view([r * Math.cos(a), FLOOR_Y, r * Math.sin(a)], th);
      if (i) ctx.lineTo(q.sx, q.sy); else ctx.moveTo(q.sx, q.sy);
    }
    ctx.stroke();
  }
  for (const [a, b] of [[[-0.9, 0], [0.9, 0]], [[0, -0.9], [0, 0.9]]]) {
    const p = view([a[0], FLOOR_Y, a[1]], th), q = view([b[0], FLOOR_Y, b[1]], th);
    ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy); ctx.stroke();
  }

  // bones, far ones first so the near ones sit on top
  const segs = [
    ...BONES.map(([a, b]) => ({ a: J[a], b: J[b], color: BONE, w: 3.2 })),
    ...HIT.map(([a, b]) => ({ a: J[a], b: J[b], color: ROSE, w: 4.6 })),
    { a: J.rsh, b: FIX_EL, color: LIME, w: 6 },
    { a: FIX_EL, b: FIX_WR, color: LIME, w: 6 },
  ].map((s) => ({ ...s, va: view(s.a, th), vb: view(s.b, th) }));
  segs.sort((p, q) => (q.va.z + q.vb.z) - (p.va.z + p.vb.z));
  for (const s of segs) {
    const d = depth((s.va.z + s.vb.z) / 2);
    ctx.globalAlpha = 0.5 + 0.5 * d;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.w * (0.8 + 0.4 * d);
    ctx.beginPath(); ctx.moveTo(s.va.sx, s.va.sy); ctx.lineTo(s.vb.sx, s.vb.sy); ctx.stroke();
  }
  // the head
  const n = view(J.nose, th), dn = depth(n.z);
  ctx.globalAlpha = 0.55 + 0.45 * dn; ctx.strokeStyle = BONE; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.arc(n.sx, n.sy, S * 0.1, 0, Math.PI * 2); ctx.stroke();
  // joints
  for (const p of [...Object.values(J).filter((q) => q !== J.nose), FIX_EL, FIX_WR]) {
    const v = view(p, th), d = depth(v.z);
    ctx.globalAlpha = 0.6 + 0.4 * d; ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(v.sx, v.sy, 2.6 + 1.8 * d, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export default function Pose3DView({ className = "" }) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const [touched, setTouched] = useState(false);
  const st = useRef({ ang: 0.9, drag: null, idleAt: 0, t0: 0, reduce: false, visible: true, raf: 0, draw: () => {} });

  useEffect(() => {
    const canvas = canvasRef.current, box = boxRef.current;
    if (!canvas || !box) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = st.current;
    s.reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    s.ang = s.reduce ? 0.55 : 0.9;
    s.draw = () => draw(ctx, s.ang);
    s.draw();

    const tick = (now) => {
      s.raf = 0;
      if (!s.visible || document.hidden) return;
      const idle = !s.drag && (!s.idleAt || now - s.idleAt > 2500);
      if (idle && !s.reduce) {
        if (!s.t0) s.t0 = now - Math.asin(Math.max(-1, Math.min(1, s.ang / 1.0))) / 0.0009; // pick the sway up from where it is
        s.ang = 1.0 * Math.sin((now - s.t0) * 0.0009);
      } else s.t0 = 0;
      s.draw();
      if (!s.reduce || s.drag) s.raf = requestAnimationFrame(tick);
    };
    s.kick = () => { if (!s.raf && s.visible && !document.hidden) s.raf = requestAnimationFrame(tick); };
    const io = new IntersectionObserver(([e]) => { s.visible = e.isIntersecting; if (s.visible) s.kick(); else if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; } }, { threshold: 0.15 });
    io.observe(box);
    const onVis = () => { if (!document.hidden) s.kick(); };
    document.addEventListener("visibilitychange", onVis);
    s.kick();
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); if (s.raf) cancelAnimationFrame(s.raf); };
  }, []);

  const turn = (d) => { const s = st.current; s.ang = Math.max(-2.2, Math.min(2.2, s.ang + d)); s.idleAt = performance.now(); s.draw(); setTouched(true); s.kick?.(); };
  const onDown = (e) => { const s = st.current; s.drag = { x: e.clientX }; s.idleAt = performance.now(); e.currentTarget.setPointerCapture?.(e.pointerId); setTouched(true); s.kick?.(); };
  const onMove = (e) => { const s = st.current; if (!s.drag) return; const dx = e.clientX - s.drag.x; s.drag.x = e.clientX; s.ang = Math.max(-2.2, Math.min(2.2, s.ang + dx * 0.012)); s.idleAt = performance.now(); s.draw(); };
  const onUp = () => { const s = st.current; s.drag = null; s.idleAt = performance.now(); s.kick?.(); };

  return (
    <div ref={boxRef} className={`relative rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800/80 ${className}`} style={{ aspectRatio: `${W} / ${H}` }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-pan-y select-none"
        tabIndex={0} role="img"
        aria-label="A 3D view of one real tracked swing. The white skeleton is the player, the rose arm is held too low, and the green arm is the corrected position. Drag, or use the left and right arrow keys, to turn it."
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); turn(-0.12); } else if (e.key === "ArrowRight") { e.preventDefault(); turn(0.12); } }} />
      <div className="pointer-events-none absolute top-2.5 left-2.5 flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950/80 border border-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-200"><span className="w-2 h-2 rounded-full" style={{ background: ROSE }} />Your arm</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950/80 border border-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-200"><span className="w-2 h-2 rounded-full" style={{ background: LIME }} />Corrected</span>
      </div>
      <span className="pointer-events-none absolute bottom-2 left-2.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400 bg-zinc-950/80 border border-zinc-800 rounded-full px-2 py-0.5">
        3D · 33 body points
      </span>
      {!touched && (
        <span className="pointer-events-none absolute top-2.5 right-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-lime-300 bg-zinc-950/80 border border-lime-400/30 rounded-full px-2 py-0.5">
          <Move3d className="w-3.5 h-3.5" aria-hidden="true" /> Drag to turn
        </span>
      )}
    </div>
  );
}
