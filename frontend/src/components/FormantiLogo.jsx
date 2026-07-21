import { useId } from "react";

/**
 * Formanti brand mark — inlined SVG paths (no network fetch, themeable via
 * gradient defs). The mark's native proportions are 200x230 (taller than
 * wide); we deliberately do NOT set width/height attributes on the <svg>
 * itself so it scales from a single CSS height (e.g. `h-6`) while the
 * `aspectRatio` style keeps the width correct — this avoids stretching the
 * mark into a square box the way a plain `w-6 h-6` className would.
 *
 * Gradient <defs> ids are suffixed with a per-instance useId() so multiple
 * logos rendered on the same page (e.g. Navbar + a modal) never collide.
 */
function FormantiMark({ className = "h-6", style }) {
  const uid = useId().replace(/[:]/g, "");
  const whiteId = `fm-white-${uid}`;
  const limeId = `fm-lime-${uid}`;
  const tailId = `fm-tail-${uid}`;

  return (
    <svg
      viewBox="0 0 200 230"
      className={className}
      style={{ aspectRatio: "200 / 230", width: "auto", flexShrink: 0, ...style }}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={whiteId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C9C9C9" />
        </linearGradient>
        <linearGradient id={limeId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#DCFF66" />
          <stop offset="100%" stopColor="#8FCB00" />
        </linearGradient>
        <linearGradient id={tailId} x1="0%" y1="0%" x2="30%" y2="100%">
          <stop offset="0%" stopColor="#9CDA00" />
          <stop offset="100%" stopColor="#0B0B0B" />
        </linearGradient>
      </defs>
      <path fill={`url(#${whiteId})`} d="M50,60 L170,60 L140,95 L20,95 Z" />
      <path fill={`url(#${limeId})`} d="M50,105 L150,105 L120,140 L20,140 Z" />
      <path fill={`url(#${tailId})`} d="M20,140 L60,140 L25,215 L5,175 Z" />
    </svg>
  );
}

/** Icon-only variant — use wherever the old lone `<Zap />` brand mark sat. */
export function FormantiIcon({ className = "h-6", style }) {
  return <FormantiMark className={className} style={style} />;
}

/** Full lockup — mark + "Formanti" wordmark, replaces `<Zap /><span>Formanti</span>` pairs. */
export function FormantiLogo({
  className = "",
  markClassName = "h-6",
  textClassName = "font-heading font-bold text-xl uppercase tracking-tight text-white",
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <FormantiMark className={markClassName} />
      <span className={textClassName}>Formanti</span>
    </span>
  );
}

export default FormantiLogo;
