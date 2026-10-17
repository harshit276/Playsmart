import { Link } from "react-router-dom";
import { Dumbbell, Check, X, Sparkles, TrendingUp, Info, Clock } from "lucide-react";

/**
 * The end of a session: how it went in one big number, a report a player can learn from (what went well, what to
 * work on and the drill, check by check, swing by swing, whether they tired, what to do next time), the contact
 * pictures to look back at, and what to do now. The report comes from ai/sessionReport; without one (the lift check)
 * the older, shorter layout is shown.
 *
 * @param {object} p
 * @param {string} p.title
 * @param {number} p.total @param {number} p.good @param {string} p.noun
 * @param {{n:number, inBand:boolean, url:string}[]} p.thumbs
 * @param {{headline:string, feel:string, drill:string, count:number}[]} p.cards  what to work on, worst first
 * @param {object|null} p.report   ai/sessionReport buildReport(...) result
 * @param {{text:string, delta:number}|null} p.compare   against the last session of this shot
 * @param {{title:string, text:string, button:string, onClick:()=>void}|null} p.cta   trial time left / pass / get a pass
 */
const fmtDuration = (s) => {
  if (!s || s < 5) return null;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? `${m} min ${r ? r + " s" : ""}`.trim() : `${r} s`;
};

function Tile({ label, value, unit }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</p>
      <p className="font-heading text-2xl font-black leading-tight mt-0.5">{value}{unit && <span className="text-[12px] font-semibold text-zinc-400"> {unit}</span>}</p>
    </div>
  );
}

function Heading({ children }) {
  return <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-2">{children}</p>;
}

/** One bar per swing, as tall as the swing was fast, green when it was in range. */
function SpeedBars({ series }) {
  const max = Math.max(1, ...series.map((s) => s.speed || 0));
  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-1" role="img" aria-label="Swing speed for each swing, green bars were in range">
      {series.map((s) => (
        <div key={s.n} className="flex flex-col items-center gap-1 shrink-0" style={{ width: series.length > 20 ? 14 : 22 }}>
          <div className="w-full h-16 flex items-end">
            <div className={`w-full rounded-sm ${s.speed == null ? "bg-zinc-700 h-1" : s.inBand ? "bg-lime-400" : "bg-rose-500"}`} style={s.speed == null ? undefined : { height: `${Math.max(8, (s.speed / max) * 100)}%` }} title={s.speed != null ? `${s.n}: ${s.speed.toFixed(1)} m/s` : `${s.n}`} />
          </div>
          <span className="text-[9px] text-zinc-500 tabular-nums">{s.n}</span>
        </div>
      ))}
    </div>
  );
}

function CheckRows({ checks }) {
  return (
    <div className="space-y-2.5">
      {checks.map((c) => (
        <div key={c.key}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold text-zinc-200">{c.label}</span>
            <span className="text-zinc-400 tabular-nums">{c.ok} of {c.seen} right</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-rose-500/70 overflow-hidden" aria-hidden="true">
            <div className="h-full bg-lime-400" style={{ width: `${(c.ok / c.seen) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PracticeSummary({ title, total, good, noun = "rep", thumbs = [], cards = [], report = null, compare = null, cta = null, onAgain, onExit, analyzeText, emptyText }) {
  const rate = total ? Math.round((good / total) * 100) : 0;
  const R = report && total > 0 ? report : null;
  const dur = R ? fmtDuration(R.durationSec) : null;
  const plural = `${noun}${total === 1 ? "" : "s"}`;
  return (
    <div className="fixed inset-0 z-[62] bg-zinc-950 text-white overflow-y-auto">
      <div className="max-w-md mx-auto px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
        <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">Session report · {title}</p>

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
            {(dur || compare) && (
              <p className="mt-2 text-[13px] text-zinc-400 leading-snug flex gap-1.5">
                {compare ? <TrendingUp className={`w-4 h-4 shrink-0 mt-0.5 ${compare.delta >= 0 ? "text-lime-400" : "text-amber-300"}`} /> : <Clock className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>{[dur && `${dur} of practice`, compare && compare.text].filter(Boolean).join(" · ")}</span>
              </p>
            )}
          </>
        )}

        {R && R.speed.n >= 1 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Tile label="Typical speed" value={R.speed.median.toFixed(1)} unit="m/s" />
            <Tile label="Fastest" value={R.speed.best.toFixed(1)} unit="m/s" />
            {R.jumps ? <Tile label="Jumps" value={`${R.jumps.count}/${total}`} /> : <Tile label={`${noun}s`} value={total} />}
          </div>
        )}

        {R && R.strengths.length > 0 && (
          <div className="mt-5 rounded-2xl border border-lime-400/30 bg-lime-400/5 p-4">
            <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> What went well</p>
            <ul className="mt-2 space-y-2">
              {R.strengths.map((s) => (
                <li key={s.key} className="flex gap-2 text-[14px] leading-snug">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-lime-400" strokeWidth={3} />
                  <span><span className="font-semibold">{s.title}</span>{s.detail && <span className="text-zinc-400">: {s.detail}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {R && R.strengths.length === 0 && !R.enough && (
          <p className="mt-5 text-[13px] text-zinc-400 leading-snug">Only {total} {plural} this time, which is too few to say what went well or badly. Take at least 5 for a proper read.</p>
        )}

        {cards.map((c, i) => (
          <div key={c.headline} className="mt-5 rounded-2xl border border-lime-400/30 bg-lime-400/5 p-4">
            <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">
              {i === 0 ? "Work on next" : "Then"}
              <span className="text-zinc-400 normal-case tracking-normal font-medium"> · off on {c.count} of {total} {plural}</span>
            </p>
            <p className="text-[17px] font-bold mt-1 leading-snug">{c.headline}</p>
            <p className="text-[14px] text-zinc-300 mt-1.5 leading-snug">{c.feel}</p>
            <p className="text-[13px] text-sky-200 mt-3 flex gap-2 leading-snug"><Dumbbell className="w-4 h-4 shrink-0 mt-0.5" /><span>{c.drill}</span></p>
          </div>
        ))}
        {R && R.minor.length > 0 && (
          <p className="mt-3 text-[12px] text-zinc-500 leading-snug">Small things, once each: {R.minor.join("; ").toLowerCase()}.</p>
        )}

        {cta && (
          <div className="mt-5 rounded-2xl border border-zinc-700 bg-zinc-900 p-4" data-testid="summary-cta">
            <p className="font-bold text-[15px] leading-snug">{cta.title}</p>
            <p className="text-[13px] text-zinc-400 mt-1 leading-snug">{cta.text}</p>
            {cta.button && <button type="button" onClick={cta.onClick} className="mt-3 w-full py-3 rounded-xl bg-lime-400 text-black font-bold">{cta.button}</button>}
          </div>
        )}

        {R && R.checks.length > 0 && (
          <div className="mt-6">
            <Heading>Check by check</Heading>
            <CheckRows checks={R.checks} />
          </div>
        )}

        {R && R.series.length > 1 && (
          <div className="mt-6">
            <Heading>{noun} by {noun}: how fast, and in range</Heading>
            <SpeedBars series={R.series} />
          </div>
        )}

        {R && R.notes.map((n) => (
          <p key={n.key} className="mt-4 text-[13px] text-zinc-300 leading-snug flex gap-2"><Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />{n.text}</p>
        ))}

        {R && R.next && (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <Heading>Next session</Heading>
            <p className="text-[14px] leading-snug"><span className="font-semibold">{R.next.headline}.</span> <span className="text-zinc-300">{R.next.drill}</span></p>
            {R.next.target != null && <p className="text-[13px] text-zinc-400 mt-1.5 leading-snug">Aim for {R.next.target}% in range, then film a real rally and compare.</p>}
          </div>
        )}

        {R && R.calibration && (
          <p className="mt-4 text-[12px] text-amber-200/90 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2 leading-snug">{R.calibration}</p>
        )}

        {thumbs.length > 0 && (
          <div className="mt-6">
            <Heading>Your {noun}s</Heading>
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
