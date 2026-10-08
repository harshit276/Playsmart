import { Link } from "react-router-dom";
import { Dumbbell, Check, X } from "lucide-react";

/**
 * The end of a session: how it went in one big number, the contact pictures to look back at,
 * the one or two things to work on next, and what to do now.
 *
 * @param {{title:string, total:number, good:number, noun:string,
 *   thumbs:{n:number, inBand:boolean, url:string}[],
 *   cards:{headline:string, feel:string, drill:string, count:number}[],
 *   onAgain:()=>void, onExit:()=>void, analyzeText:string, emptyText:string}} p
 */
export default function PracticeSummary({ title, total, good, noun = "rep", thumbs = [], cards = [], onAgain, onExit, analyzeText, emptyText }) {
  const rate = total ? Math.round((good / total) * 100) : 0;
  return (
    <div className="fixed inset-0 z-[62] bg-zinc-950 text-white overflow-y-auto">
      <div className="max-w-md mx-auto px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
        <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">Session done · {title}</p>

        {total === 0 ? (
          <>
            <h1 className="font-heading text-4xl font-black mt-2 leading-none">No {noun}s counted</h1>
            <p className="text-zinc-300 text-[15px] mt-3 leading-snug">{emptyText}</p>
          </>
        ) : (
          <>
            <div className="mt-2 flex items-end gap-3">
              <h1 className="font-heading text-6xl font-black leading-none">{good}<span className="text-zinc-600">/{total}</span></h1>
              <p className="text-zinc-300 text-[15px] pb-1.5">{noun}s in range<span className="text-zinc-500"> · {rate}%</span></p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden" aria-hidden="true">
              <div className="h-full bg-lime-400" style={{ width: `${rate}%` }} />
            </div>
          </>
        )}

        {cards.map((c, i) => (
          <div key={c.headline} className="mt-5 rounded-2xl border border-lime-400/30 bg-lime-400/5 p-4">
            <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">
              {i === 0 ? "Work on next" : "Then"}
              <span className="text-zinc-400 normal-case tracking-normal font-medium"> · off on {c.count} of {total} {noun}{total === 1 ? "" : "s"}</span>
            </p>
            <p className="text-[17px] font-bold mt-1 leading-snug">{c.headline}</p>
            <p className="text-[14px] text-zinc-300 mt-1.5 leading-snug">{c.feel}</p>
            <p className="text-[13px] text-sky-200 mt-3 flex gap-2 leading-snug"><Dumbbell className="w-4 h-4 shrink-0 mt-0.5" /><span>{c.drill}</span></p>
          </div>
        ))}

        {thumbs.length > 0 && (
          <div className="mt-6">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Your {noun}s</p>
            <div className="grid grid-cols-3 gap-2">
              {thumbs.map((t) => (
                <figure key={t.n} className={`relative rounded-xl overflow-hidden bg-zinc-900 border-2 ${t.inBand ? "border-lime-400/60" : "border-rose-500/70"}`}>
                  <img src={t.url} alt={`${noun} ${t.n}`} className="w-full aspect-[3/4] object-cover" />
                  <figcaption className={`absolute bottom-1 left-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${t.inBand ? "bg-lime-400 text-black" : "bg-rose-500 text-white"}`}>
                    {t.inBand ? <Check className="w-3 h-3" strokeWidth={3} /> : <X className="w-3 h-3" strokeWidth={3} />}{t.n}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-2.5">
          <button type="button" onClick={onAgain} className="w-full py-3.5 rounded-xl bg-lime-400 text-black font-bold text-base">Practise again</button>
          <button type="button" onClick={onExit} className="w-full py-3.5 rounded-xl border border-zinc-700 font-semibold text-zinc-200">Done</button>
          <Link to="/analyze" className="text-center text-[13px] text-lime-300 underline pt-1">{analyzeText}</Link>
        </div>
        <p className="text-[11px] text-zinc-500 mt-5 leading-snug">Your video stayed on your phone: nothing was uploaded. Guide ranges, not a coach's verdict.</p>
      </div>
    </div>
  );
}
