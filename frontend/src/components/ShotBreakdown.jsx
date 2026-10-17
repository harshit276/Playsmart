import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, Eye, ChevronDown, ArrowRight } from "lucide-react";
import { racquetBreakdown, liftBreakdown } from "@/lib/practiceBreakdown";
import { PRACTICE_SPORTS, LIFT_SPORT, isLiftSport, shotsFor, liftShots, practiceUrl } from "@/lib/practiceShots";

/**
 * How live practice breaks a shot down: the ready stance, the swing, the drills.
 * Built from the engine's own ranges, cues and drills (lib/practiceBreakdown), so it only ever promises what the
 * coach really does. Used on the home page (with its own pickers) and on /practice (for the shot being chosen).
 *
 * layout "tabs": on phones one step at a time, three columns from md up (home page).
 * layout "stack": the three steps one under the other (the practice page).
 */

const STEP_TITLES = ["Ready", "Swing", "Drills"];

function Quote({ icon: Icon, label, children }) {
  return (
    <p className="mt-3 flex gap-2 text-[13px] leading-snug text-zinc-300">
      <Icon className="w-4 h-4 shrink-0 mt-0.5 text-lime-400" aria-hidden="true" />
      <span><span className="text-zinc-500">{label} </span>{children}</span>
    </p>
  );
}

function Checks({ checks }) {
  return (
    <ul className="mt-3 space-y-2">
      {checks.map((c) => (
        <li key={c.label} className="text-[13px] leading-snug">
          <span className="font-semibold text-white">{c.label}</span>{" "}
          <span className="font-mono text-lime-300 whitespace-nowrap">{c.range}</span>
          <span className="block text-zinc-500 text-[12px]">{c.why}</span>
        </li>
      ))}
    </ul>
  );
}

function Step({ n, title, sub, className = "", children }) {
  return (
    <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 ${className}`}>
      <p className="flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-full bg-lime-400 text-black text-[12px] font-black flex items-center justify-center shrink-0">{n}</span>
        <span className="font-heading font-bold text-lg text-white leading-tight">{title}</span>
      </p>
      {sub && <p className="mt-2 text-[13px] text-zinc-400 leading-snug">{sub}</p>}
      {children}
    </div>
  );
}

function Drills({ drills, limit }) {
  const [all, setAll] = useState(false);
  const shown = all ? drills : drills.slice(0, limit);
  return (
    <div className="mt-3 space-y-2">
      {shown.map((d, i) => (
        <details key={d.id} open={i === 0} className="group rounded-xl border border-zinc-800 bg-zinc-950/50">
          <summary className="flex items-center justify-between gap-2 cursor-pointer list-none px-3 py-2.5 min-h-11 text-[14px] font-semibold text-white">
            <span className="min-w-0">{d.label}</span>
            <ChevronDown className="w-4 h-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="px-3 pb-3 -mt-0.5">
            {d.say && <p className="text-[13px] text-zinc-300 leading-snug"><span className="text-zinc-500">Coach says </span>“{d.say}”</p>}
            <p className="mt-1.5 text-[13px] leading-snug"><span className="font-semibold text-lime-300">Drill </span><span className="text-zinc-200">{d.drill}</span></p>
          </div>
        </details>
      ))}
      {drills.length > limit && (
        <button type="button" onClick={() => setAll((a) => !a)} className="min-h-11 text-[13px] font-semibold text-lime-300 underline underline-offset-4 decoration-lime-400/50">
          {all ? "Show fewer" : `Show all ${drills.length} drills`}
        </button>
      )}
    </div>
  );
}

export function ShotBreakdown({ sport, shotKey, layout = "stack", drillLimit = 4 }) {
  const bd = useMemo(() => (isLiftSport(sport) ? liftBreakdown(shotKey) : racquetBreakdown(sport, shotKey)), [sport, shotKey]);
  const [tab, setTab] = useState(0);
  if (!bd) return null;
  const tabbed = layout === "tabs";
  const pane = (i) => (tabbed ? `${tab === i ? "block" : "hidden"} md:block` : "block");
  return (
    <div data-testid="shot-breakdown">
      {tabbed && (
        <div role="tablist" aria-label="The three steps" className="md:hidden flex rounded-xl overflow-hidden border border-zinc-700 mb-3">
          {STEP_TITLES.map((t, i) => (
            <button key={t} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)}
              className={`flex-1 min-h-11 text-[13px] font-bold ${tab === i ? "bg-lime-400 text-black" : "bg-zinc-900 text-zinc-300"}`}>
              {i + 1} · {t}
            </button>
          ))}
        </div>
      )}
      <div className={tabbed ? "md:grid md:grid-cols-3 md:gap-4" : "space-y-3"}>
        <Step n={1} title={bd.ready.title} sub={bd.ready.sub} className={pane(0)}>
          <Checks checks={bd.ready.checks} />
          {bd.ready.say.length > 0 && <Quote icon={Mic} label="Coach says">{bd.ready.say.map((t) => `“${t}”`).join(" or ")}</Quote>}
          <Quote icon={Eye} label="You see">{bd.ready.show}</Quote>
        </Step>
        <Step n={2} title={bd.swing.title} sub={bd.swing.sub} className={pane(1)}>
          <Checks checks={bd.swing.checks} />
          {bd.swing.say.length > 0 && <Quote icon={Mic} label="Coach says">{bd.swing.say.map((t) => `“${t}”`).join(" or ")}</Quote>}
          <Quote icon={Eye} label="You see">{bd.swing.show}</Quote>
        </Step>
        <Step n={3} title="Then your drill" sub={`Whatever you keep missing on ${bd.name.toLowerCase()}, you get told what to do about it, and the drill that fixes it. Same miss three times and the coach moves from a cue to the drill.`} className={pane(2)}>
          <Drills drills={bd.drills} limit={drillLimit} />
        </Step>
      </div>
      <p className="mt-3 text-[12px] text-zinc-500 leading-snug">
        Guide ranges, not a coach's verdict. Practice checks your arm and body position, not whether the swing is the shot you picked.
        {bd.note && <span className="block mt-1 text-amber-200/80">{bd.note}</span>}
      </p>
    </div>
  );
}

/** The home page section: pick a sport and a shot, see the breakdown. */
export default function PracticeBreakdownSection() {
  const sports = [...PRACTICE_SPORTS, LIFT_SPORT];
  const [sport, setSport] = useState("badminton");
  const shots = useMemo(() => (isLiftSport(sport) ? liftShots() : shotsFor(sport)), [sport]);
  const [shotKey, setShotKey] = useState("smash");
  const shot = shots.find((s) => s.key === shotKey) || shots[0];
  const pickSport = (k) => { setSport(k); setShotKey((isLiftSport(k) ? liftShots() : shotsFor(k))[0]?.key); };
  const pill = (on) => `px-3.5 min-h-11 inline-flex items-center rounded-full text-[14px] font-semibold border whitespace-nowrap ${on ? "bg-lime-400 text-black border-lime-400" : "bg-zinc-900 text-zinc-300 border-zinc-700"}`;
  return (
    <section data-section="breakdown" className="relative py-10 md:py-20 bg-zinc-950" aria-labelledby="breakdown-heading">
      <div className="container mx-auto px-4 max-w-6xl">
        <span className="inline-flex items-center gap-2 text-lime-400 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
          <span className="w-8 h-px bg-lime-400/60" /> Live practice
        </span>
        <h2 id="breakdown-heading" className="font-heading font-black text-4xl md:text-6xl tracking-tighter uppercase text-white leading-[0.95]">
          Every shot, <span className="text-lime-400">broken into drills.</span>
        </h2>
        <p className="mt-4 max-w-2xl text-zinc-400 text-base md:text-lg leading-relaxed">
          Pick a shot. This is exactly what practice checks while you hold your stance and on every swing, what the coach says,
          and the drill you get for what you keep missing.
        </p>

        <div className="mt-6 -mx-4 px-4 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:flex-wrap" style={{ scrollbarWidth: "none" }} role="group" aria-label="Sport">
          {sports.map((s) => (
            <button key={s.key} type="button" onClick={() => pickSport(s.key)} aria-pressed={sport === s.key} className={pill(sport === s.key)}>{s.label}</button>
          ))}
        </div>
        <div className="mt-2 -mx-4 px-4 flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:flex-wrap" style={{ scrollbarWidth: "none" }} role="group" aria-label="Shot">
          {shots.map((s) => (
            <button key={s.key} type="button" onClick={() => setShotKey(s.key)} aria-pressed={shot?.key === s.key} className={pill(shot?.key === s.key)}>{s.name}</button>
          ))}
        </div>

        <div className="mt-4">
          <ShotBreakdown sport={sport} shotKey={shot?.key} layout="tabs" />
        </div>

        <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px]">
          <Link to={practiceUrl({ sport, shot: shot?.key })} data-cta="breakdown_try"
            className="inline-flex items-center gap-1.5 min-h-11 font-bold text-lime-300 hover:text-lime-200">
            Try it free for 10 minutes <ArrowRight className="w-4 h-4" />
          </Link>
          <span className="text-zinc-500 text-sm">Free account, then a pass. Runs on your phone; your video isn't uploaded.</span>
        </p>
      </div>
    </section>
  );
}
