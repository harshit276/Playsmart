import { Check, AlertTriangle, ScanLine } from "lucide-react";

/**
 * The one thing to read while practising: a single message at the top of the picture.
 *   "good"  green: what you're doing is right
 *   "fix"   red:   one thing to change
 *   "info"  quiet: where to stand, or what to do next
 * It is the same words the voice coach says, so it works with the sound off.
 */
const STYLE = {
  good: "bg-lime-400 text-black",
  fix: "bg-rose-500 text-white",
  info: "bg-black/65 backdrop-blur text-white",
};

export default function CoachBanner({ kind = "info", text, sub = null }) {
  if (!text) return null;
  const big = kind !== "info";
  const Icon = kind === "good" ? Check : kind === "fix" ? AlertTriangle : ScanLine;
  return (
    <div className="absolute top-3 inset-x-3 flex justify-center pointer-events-none z-10">
      <div role="status" aria-live="polite" className={`max-w-md w-full rounded-2xl px-4 py-3 text-center shadow-lg ${STYLE[kind]}`}>
        <p className={`flex items-center justify-center gap-2 leading-tight ${big ? "text-[20px] font-black" : "text-[15px] font-semibold"}`}>
          <Icon className={`shrink-0 ${big ? "w-6 h-6" : "w-4 h-4 text-zinc-300"}`} strokeWidth={kind === "info" ? 2 : 3} />
          <span>{text}</span>
        </p>
        {sub && <p className={`mt-1 text-[13px] leading-snug ${kind === "good" ? "text-black/70" : "text-white/80"}`}>{sub}</p>}
      </div>
    </div>
  );
}
