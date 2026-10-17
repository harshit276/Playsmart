import { useEffect, useRef } from "react";

/**
 * Shuttle3D — a badminton shuttlecock, in 3D, that slowly spins and leans toward the pointer.
 *
 * Drawn on a small 2D canvas with its own tiny 3D renderer (rotate, perspective-project, shade, sort
 * back to front): no WebGL and no 3D library, so it costs a few KB and a couple of milliseconds a frame,
 * and it works on every phone. 16 feathers (curved quads, white with a lime shaft), a lime cork, a lime
 * thread around the open rim, one light from the upper left.
 *
 * Polite by default: it only runs while it is on screen and the tab is visible, it starts after the page
 * has finished loading, it draws a single still frame for people who asked for reduced motion or turned
 * on data saver, and it never takes the pointer (pointer-events: none).
 */

const FEATHERS = 16;
const CORK_LAT = 7, CORK_LON = 12;
const R_CORK = 0.3, Y_CORK = -1.0; // cork sphere
const R_BASE = 0.3, Y_BASE = -0.78; // where the feathers leave the cork
const R_RIM = 0.9, Y_RIM = 1.0; // the open end

const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = norm([-0.55, 0.7, 0.75]);

// the model, built once: polygons with a base colour, plus the shaft and thread lines
const MODEL = (() => {
  const polys = [], lines = [];
  for (let i = 0; i < FEATHERS; i++) {
    const a0 = (i / FEATHERS) * Math.PI * 2, a1 = ((i + 0.92) / FEATHERS) * Math.PI * 2, am = (a0 + a1) / 2;
    const pt = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    // a feather bows outward a little in the middle
    const mid0 = pt(a0, (R_BASE + R_RIM) / 2 + 0.08, (Y_BASE + Y_RIM) / 2), mid1 = pt(a1, (R_BASE + R_RIM) / 2 + 0.08, (Y_BASE + Y_RIM) / 2);
    const b0 = pt(a0, R_BASE, Y_BASE), b1 = pt(a1, R_BASE, Y_BASE), t0 = pt(a0, R_RIM, Y_RIM), t1 = pt(a1, R_RIM, Y_RIM);
    polys.push({ pts: [b0, b1, mid1, mid0], color: [236, 241, 232] });
    polys.push({ pts: [mid0, mid1, t1, t0], color: [248, 250, 245] });
    lines.push({ a: pt(am, R_BASE, Y_BASE), b: pt(am, R_RIM, Y_RIM), color: "rgba(190,242,100,0.85)", w: 1.4 });
    lines.push({ a: t0, b: t1, color: "rgba(163,230,53,0.95)", w: 2.2 }); // the thread along the rim
  }
  for (let i = 0; i < CORK_LAT; i++) {
    for (let j = 0; j < CORK_LON; j++) {
      const la0 = (i / CORK_LAT) * Math.PI, la1 = ((i + 1) / CORK_LAT) * Math.PI, lo0 = (j / CORK_LON) * Math.PI * 2, lo1 = ((j + 1) / CORK_LON) * Math.PI * 2;
      const P = (la, lo) => [Math.sin(la) * Math.cos(lo) * R_CORK, Y_CORK + Math.cos(la) * R_CORK, Math.sin(la) * Math.sin(lo) * R_CORK];
      polys.push({ pts: [P(la0, lo0), P(la0, lo1), P(la1, lo1), P(la1, lo0)], color: [163, 230, 53], cork: true });
    }
  }
  return { polys, lines };
})();

function rotY(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }
function rotX(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }

function draw(ctx, W, H, t, lean) {
  ctx.clearRect(0, 0, W, H);
  const spin = t * 0.7, tilt = 0.55 + Math.sin(t * 0.9) * 0.1 + lean.x, yaw = -0.5 + lean.y;
  const S = H * 0.3, cx = W / 2, cy = H / 2 + Math.sin(t * 1.3) * H * 0.012;
  const view = (p) => {
    let q = rotY(p, spin); q = rotX(q, tilt); q = rotY(q, yaw);
    const k = 4.2 / (4.2 + q[2] * 0.5); // gentle perspective
    return { x: cx + q[0] * S * k, y: cy - q[1] * S * k, z: q[2], q };
  };
  const items = [];
  for (const poly of MODEL.polys) {
    const v = poly.pts.map(view);
    const n = norm(cross(sub(v[1].q, v[0].q), sub(v[3].q, v[0].q)));
    const lit = Math.abs(dot(n, LIGHT));
    const facing = n[2] > 0; // the outside of the shuttle faces the viewer
    const shade = poly.cork ? 0.55 + 0.55 * lit : 0.72 + 0.4 * lit * (facing ? 1 : 0.8);
    items.push({ kind: "poly", v, z: (v[0].z + v[1].z + v[2].z + v[3].z) / 4, rgb: poly.color.map((c) => Math.min(255, Math.round(c * shade))), cork: poly.cork });
  }
  for (const l of MODEL.lines) {
    const a = view(l.a), b = view(l.b);
    items.push({ kind: "line", a, b, z: (a.z + b.z) / 2 - 0.02, color: l.color, w: l.w });
  }
  items.sort((p, q) => q.z - p.z); // far first
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (const it of items) {
    if (it.kind === "poly") {
      ctx.beginPath(); ctx.moveTo(it.v[0].x, it.v[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(it.v[i].x, it.v[i].y); ctx.closePath();
      ctx.fillStyle = `rgb(${it.rgb[0]},${it.rgb[1]},${it.rgb[2]})`; ctx.fill();
      ctx.lineWidth = 0.7; ctx.strokeStyle = it.cork ? "rgba(20,40,0,0.25)" : "rgba(30,40,25,0.28)"; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.strokeStyle = it.color; ctx.lineWidth = it.w * (H / 400); ctx.stroke();
    }
  }
}

export default function Shuttle3D({ className = "", size = 360 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size, H = size;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const calm = (() => {
      try {
        const c = navigator.connection;
        return !!(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || c?.saveData === true);
      } catch { return false; }
    })();
    const lean = { x: 0, y: 0, tx: 0, ty: 0 };
    if (calm) { draw(ctx, W, H, 0.6, lean); return undefined; }

    let raf = 0, visible = false, t = Math.random() * 6, last = 0, started = false;
    const tick = (now) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (!last) last = now;
      t += Math.min(0.05, (now - last) / 1000); last = now;
      lean.x += (lean.tx - lean.x) * 0.06; lean.y += (lean.ty - lean.y) * 0.06;
      draw(ctx, W, H, t, lean);
      raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf && visible && started && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } };
    draw(ctx, W, H, t, lean); // a first frame right away so there is no blank gap

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } }, { threshold: 0.05 });
    io.observe(canvas);
    const start = () => { started = true; kick(); };
    let timer;
    if (document.readyState === "complete") timer = setTimeout(start, 300); else window.addEventListener("load", () => { timer = setTimeout(start, 600); }, { once: true });
    const onVis = () => { if (!document.hidden) kick(); };
    document.addEventListener("visibilitychange", onVis);
    // lean toward the pointer, on devices that have one
    const onMove = (e) => {
      const b = canvas.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, (e.clientX - (b.left + b.width / 2)) / (window.innerWidth * 0.5)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - (b.top + b.height / 2)) / (window.innerHeight * 0.5)));
      lean.ty = nx * 0.45; lean.tx = ny * 0.35;
    };
    const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    if (fine) window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      io.disconnect(); clearTimeout(timer); if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pointermove", onMove);
    };
  }, [size]);

  return (
    <div className={`relative pointer-events-none select-none ${className}`} aria-hidden="true" style={{ width: size, height: size, maxWidth: "100%" }}>
      <div className="absolute inset-[12%] rounded-full bg-lime-400/20 blur-3xl" />
      <canvas ref={canvasRef} className="relative h-full w-full" />
    </div>
  );
}
