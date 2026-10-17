/**
 * Court3D — the floor of a badminton court receding into the distance behind the hero.
 *
 * Pure CSS 3D: a tilted plane with court-line gradients that slides toward the viewer. The slide is a
 * transform on a layer of its own (GPU-composited, no repaint), it fades into the dark at the horizon
 * and at the sides, and it stops for people who asked for reduced motion.
 */
export default function Court3D({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-[62%] overflow-hidden ${className}`}
      style={{
        perspective: "620px",
        perspectiveOrigin: "50% 0%",
        WebkitMaskImage: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.55) 45%, transparent 92%), linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%)",
        maskImage: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.55) 45%, transparent 92%), linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%)",
        WebkitMaskComposite: "source-in",
        maskComposite: "intersect",
      }}
    >
      <style>{`
        @keyframes court3d-run { from { transform: translate3d(0,0,0); } to { transform: translate3d(0,96px,0); } }
        .court3d-plane { position:absolute; left:-60%; right:-60%; top:0; height:260%; transform-origin: 50% 0%; transform: rotateX(70deg); }
        .court3d-lines { position:absolute; inset:-96px 0 0 0; will-change: transform; animation: court3d-run 5.5s linear infinite;
          background-image:
            repeating-linear-gradient(to bottom, rgba(163,230,53,0.42) 0 3px, transparent 3px 96px),
            repeating-linear-gradient(to right, rgba(163,230,53,0.30) 0 3px, transparent 3px 150px); }
        @media (prefers-reduced-motion: reduce) { .court3d-lines { animation: none; } }
      `}</style>
      <div className="court3d-plane"><div className="court3d-lines" /></div>
    </div>
  );
}
