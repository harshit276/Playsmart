import { Check, AlertTriangle } from "lucide-react";

/**
 * The verdict on the rep you just did, as a small card above the chips for a few seconds:
 * a tick or a warning, one headline, and one line saying what to do. The contact pictures live
 * in the end-of-session summary, not here.
 */
export default function VerdictCard({ rep, headline, detail, label = "Rep" }) {
  if (!rep) return null;
  const good = rep.inBand;
  return (
    <div className="absolute bottom-3 inset-x-3 flex justify-center pointer-events-none z-10">
      <div className="max-w-md w-full flex items-center gap-3 rounded-2xl bg-zinc-950/95 border border-white/10 shadow-2xl p-3">
        <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${good ? "bg-lime-400 text-black" : "bg-rose-500 text-white"}`}>
          {good ? <Check className="w-6 h-6" strokeWidth={3} /> : <AlertTriangle className="w-5 h-5" strokeWidth={2.5} />}
        </span>
        <div className="min-w-0">
          <p className={`text-[11px] uppercase tracking-wider font-bold ${good ? "text-lime-400" : "text-rose-300"}`}>{label} {rep.n}</p>
          <p className="text-[15px] font-bold leading-snug">{headline}</p>
          {detail && <p className="text-[12px] text-zinc-300 leading-snug mt-0.5">{detail}</p>}
        </div>
      </div>
    </div>
  );
}
