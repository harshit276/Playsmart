import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Quote, Activity } from "lucide-react";
import FormChips from "@/components/practice/FormChips";
import Pose3DView from "@/components/Pose3DView";
import demo from "@/data/demoAnalysis.json";
import pose from "@/data/poseDemo.json";

/**
 * "This is what you get back": ONE real result, split into the four things a result contains, each
 * named in plain words so nobody has to guess what they are looking at.
 *
 *   1  Shots   the swings found and timed, with what worked and what to fix on each (tap a time)
 *   2  3D pose the player's pose in 3D with the corrected arm in green (drag to turn it)
 *   3  Coach   the written read of the clip
 *   4  Practise rehearse the fix live in front of the phone
 *
 * Phones get one panel at a time behind four tabs (so it is short); from lg all four sit in a grid.
 * The shots and the coach's words are the sample analysis the /demo page uses (data/demoAnalysis.json);
 * the 3D pose is the tracked swing from the hero (data/poseDemo.json). No pose model runs here.
 */

const EVENTS = (demo.events || []).map((e) => ({
  sec: e.timestamp_sec,
  t: `0:${String(Math.max(1, Math.round(e.timestamp_sec))).padStart(2, "0")}`,
  label: (e.shot_label || "Shot").replace(/\s+with\s+.*/i, ""),
  strength: (e.strengths && e.strengths[0]) || null,
  fix: (e.weaknesses && e.weaknesses[0] && !/^none/i.test(e.weaknesses[0]) ? e.weaknesses[0] : e.tip) || null,
}));
const END = Math.max(...EVENTS.map((e) => e.sec)) + 0.8;
const COACH = demo.coach_narrative || {};
const TABS = [["shots", "Shots"], ["3d", "3D pose"], ["coach", "Coach"], ["practise", "Practise"]];

function Panel({ n, title, lead, shown, className = "", children }) {
  return (
    <section className={`${shown ? "flex" : "hidden"} lg:flex flex-col rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-900/40 p-4 sm:p-5 ${className}`} aria-label={title}>
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="w-7 h-7 rounded-full bg-lime-400 text-black text-sm font-black flex items-center justify-center shrink-0" aria-hidden="true">{n}</span>
        <h3 className="font-heading font-bold text-xl text-white tracking-tight">{title}</h3>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed mb-3.5">{lead}</p>
      {children}
    </section>
  );
}

function ShotsPanel({ shown }) {
  const [i, setI] = useState(2);
  const e = EVENTS[i];
  return (
    <Panel n="1" title="Your swings, found and timed" lead="Formanti finds the swings in your clip, times each one, and says what worked and what to fix on it. Tap a time." shown={shown} className="lg:col-start-1 lg:row-start-1">
      <div className="relative h-1.5 rounded-full bg-zinc-800 mx-3 mb-2.5" aria-hidden="true">
        {EVENTS.map((ev, k) => (
          <span key={k} className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-zinc-900 transition-colors ${k === i ? "bg-lime-400 scale-125" : "bg-zinc-500"}`} style={{ left: `${(ev.sec / END) * 100}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1.5 mb-3" role="tablist" aria-label="Swings in the clip">
        {EVENTS.map((ev, k) => (
          <button key={k} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)}
            className={`min-h-11 min-w-0 px-0 rounded-xl border text-[13px] sm:text-sm font-mono font-semibold transition-colors ${k === i ? "bg-lime-400 text-black border-lime-400" : "bg-zinc-950 border-zinc-700 text-zinc-200 hover:border-zinc-500"}`}>
            {ev.t}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 flex-1">
        <div className="flex items-baseline justify-between gap-3 mb-2.5">
          <p className="font-heading font-bold text-lg text-white">{e.label}</p>
          <p className="font-mono text-xs text-lime-300">at {e.t} · swing {i + 1} of {EVENTS.length}</p>
        </div>
        {e.strength && <p className="text-sm text-zinc-200 leading-snug mb-2"><span className="text-lime-400 font-bold">Worked: </span>{e.strength}</p>}
        {e.fix && <p className="text-sm text-zinc-200 leading-snug"><span className="text-amber-400 font-bold">Fix: </span>{e.fix}</p>}
      </div>
    </Panel>
  );
}

function PosePanel({ shown }) {
  const w = pose.world;
  return (
    <Panel n="2" title="Your pose, in 3D" lead="We track 33 points on your body in 3D, measure your arm and legs, and show the corrected position in green. Drag to turn it." shown={shown} className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
      <Pose3DView />
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wider font-bold text-rose-300">Arm height</p>
          <p className="text-sm text-zinc-100 mt-0.5"><span className="font-mono font-bold">{w.measured.shoulder}°</span> <span className="text-zinc-400">→ aim for</span> <span className="font-mono font-bold text-lime-300">{w.target.shoulder}°</span></p>
        </div>
        <div className="rounded-xl border border-lime-400/30 bg-lime-400/5 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wider font-bold text-lime-300">Elbow</p>
          <p className="text-sm text-zinc-100 mt-0.5"><span className="font-mono font-bold">{w.measured.elbow}°</span> <span className="text-zinc-400">· in range</span></p>
        </div>
      </div>
      <p className="text-xs text-zinc-400 leading-snug mt-2.5">Measured in 3D from one camera: close, not lab-exact. Treat the green as the direction to move.</p>
    </Panel>
  );
}

function CoachPanel({ shown }) {
  const worked = (COACH.strengths_points || [])[1] || (COACH.strengths_points || [])[0];
  const work = (COACH.improvements_points || [])[1] || (COACH.improvements_points || [])[0];
  return (
    <Panel n="3" title="A coach's read" lead="A written summary of the whole clip: what worked, what to work on, and the one thing to take away." shown={shown} className="lg:col-start-1 lg:row-start-2">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 flex-1 space-y-3">
        {worked && <p className="text-sm text-zinc-200 leading-snug"><span className="text-lime-400 font-bold">What worked: </span>{worked}</p>}
        {work && <p className="text-sm text-zinc-200 leading-snug"><span className="text-amber-400 font-bold">Work on: </span>{work}</p>}
        {COACH.takeaway && (
          <div className="flex gap-2.5 rounded-xl bg-lime-400/5 border border-lime-400/20 p-3">
            <Quote className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[13px] text-zinc-100 leading-relaxed"><span className="font-bold text-lime-300">Takeaway: </span>{COACH.takeaway}</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function PractisePanel({ shown }) {
  return (
    <Panel n="4" title="Practise the fix" lead="Then rehearse it live in front of your phone. A voice tells you what to fix on every swing. The first 10 minutes are free, and nothing is uploaded." shown={shown} className="lg:col-span-2 lg:row-start-3">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 flex-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex flex-col gap-3 lg:shrink-0 lg:items-start">
        <div className="flex justify-center lg:justify-start">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 text-white px-3.5 py-1.5 text-[13px] font-bold">Arm a little higher</span>
        </div>
        <FormChips groups={[{ label: "Last swing", items: [
          { key: "reach", label: "Reach", state: "off" },
          { key: "elbow", label: "Elbow", state: "ok" },
          { key: "prep", label: "Prep", state: "ok" },
          { key: "speed", label: "Speed", state: "ok" },
        ] }]} />
        </div>
        <ol className="text-sm text-zinc-300 space-y-1.5 mt-1 lg:mt-0 lg:flex-1">
          <li><span className="font-bold text-lime-300">1.</span> Prop your phone up, whole body in view.</li>
          <li><span className="font-bold text-lime-300">2.</span> Swing. Your skeleton follows you live.</li>
          <li><span className="font-bold text-lime-300">3.</span> Hear what to fix, then go again.</li>
        </ol>
        <Link to="/practice" className="mt-auto lg:mt-0 lg:shrink-0 inline-flex items-center justify-center gap-2 min-h-11 rounded-full border border-lime-400/50 bg-lime-400/10 hover:bg-lime-400/20 text-lime-200 font-bold text-[15px] px-5 transition-colors">
          <Activity className="w-4 h-4" aria-hidden="true" /> Try live practice <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </Panel>
  );
}

export default function ResultPreview({ rise }) {
  const [tab, setTab] = useState(0);
  return (
    <section className="relative py-12 md:py-24 bg-zinc-950 overflow-hidden" aria-labelledby="result-heading">
      <div className="pointer-events-none absolute -right-40 top-0 w-[30rem] h-[30rem] bg-lime-400/[0.05] rounded-full blur-3xl" />
      <div className="relative container mx-auto px-4 max-w-5xl">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise} className="mb-6 md:mb-10 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lime-400 text-black text-xs sm:text-sm font-black uppercase tracking-[0.15em] mb-4 shadow-[0_0_24px_rgba(163,230,53,0.35)]">
            <Sparkles className="w-3.5 h-3.5" /> See it first — real result
          </span>
          <h2 id="result-heading" className="font-heading font-black text-4xl md:text-6xl tracking-tighter uppercase text-white leading-[0.95] mb-3">
            This is what you<br />get back.
          </h2>
          <p className="text-zinc-300 text-base md:text-lg max-w-xl mx-auto">
            One real analysis from one short {demo.sport_detected || "badminton"} clip, in four parts. Try each one.
          </p>
        </motion.div>

        {/* phones: one part at a time */}
        <div className="lg:hidden -mx-4 px-4 mb-3 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Parts of a result" style={{ scrollbarWidth: "none" }}>
          {TABS.map(([key, label], i) => (
            <button key={key} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)}
              className={`shrink-0 inline-flex items-center gap-2 min-h-11 rounded-full border px-4 text-[14px] font-semibold transition-colors ${tab === i ? "bg-lime-400 text-black border-lime-400" : "bg-zinc-900/70 border-zinc-700 text-zinc-200"}`}>
              <span className={`w-5 h-5 rounded-full text-[11px] font-black flex items-center justify-center ${tab === i ? "bg-black text-lime-400" : "bg-zinc-700 text-zinc-100"}`}>{i + 1}</span>{label}
            </button>
          ))}
        </div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={rise} className="grid lg:grid-cols-2 gap-4 lg:gap-5">
          <ShotsPanel shown={tab === 0} />
          <PosePanel shown={tab === 1} />
          <CoachPanel shown={tab === 2} />
          <PractisePanel shown={tab === 3} />
        </motion.div>

        <div className="text-center mt-7">
          <Link to="/demo" className="inline-flex items-center justify-center gap-2 min-h-12 bg-lime-400 hover:bg-lime-300 text-black font-bold rounded-full px-7 py-3 text-[15px] shadow-[0_0_24px_rgba(190,242,100,0.25)] transition-colors">
            Open the full interactive analysis <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-xs text-zinc-400 mt-3">Shot-by-shot breakdown · coach chat · downloadable PDF. No signup to look.</p>
        </div>
      </div>
    </section>
  );
}
