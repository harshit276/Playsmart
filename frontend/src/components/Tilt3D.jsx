import { useRef } from "react";

/**
 * Tilt3D — wraps something so it leans toward the pointer, with a soft light that follows it.
 *
 * CSS 3D only. It does nothing on touch screens (no hover there, and a card that tilts under a
 * scrolling thumb is more annoying than nice) and nothing for people who asked for reduced motion.
 * Keep `max` small: it is meant to be felt, not noticed.
 */
export default function Tilt3D({ children, max = 6, className = "", glare = true, as: Tag = "div" }) {
  const ref = useRef(null);
  const ok = () => {
    try {
      return window.matchMedia("(hover: hover) and (pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch { return false; }
  };
  const move = (e) => {
    const el = ref.current; if (!el || !ok()) return;
    const b = el.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
    el.style.transform = `perspective(900px) rotateX(${((0.5 - py) * max * 2).toFixed(2)}deg) rotateY(${((px - 0.5) * max * 2).toFixed(2)}deg) translateZ(0)`;
    if (glare) { el.style.setProperty("--gx", `${(px * 100).toFixed(0)}%`); el.style.setProperty("--gy", `${(py * 100).toFixed(0)}%`); }
  };
  const leave = () => { const el = ref.current; if (el) el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)"; };
  return (
    <Tag ref={ref} onPointerMove={move} onPointerLeave={leave} className={`group/tilt relative transition-transform duration-200 ease-out will-change-transform ${className}`} style={{ transformStyle: "preserve-3d" }}>
      {children}
      {glare && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200 group-hover/tilt:opacity-100"
          style={{ background: "radial-gradient(260px circle at var(--gx, 50%) var(--gy, 50%), rgba(255,255,255,0.10), transparent 60%)" }} />
      )}
    </Tag>
  );
}
