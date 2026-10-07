import { Link } from "react-router-dom";
import { ShieldCheck, Smartphone, Activity, Mic, Check } from "lucide-react";

/**
 * The marketing side of /practice: what shadow practice is, how it works, what it checks and
 * what it doesn't. Shown above and below the sport picker when someone lands on /practice
 * from a shared link; a deep link from a result ("Practise this shot") goes straight to the
 * picker instead. Everything stated here is something the feature really does.
 */

function HeroArt() {
  return (
    <svg viewBox="0 0 320 210" className="w-full max-w-xs mx-auto" role="img"
      aria-label="Illustration: a stick figure whose arm is too low, with the corrected arm raised in green and the coaching line 'Arm higher'">
      <rect x="70" y="4" width="180" height="202" rx="22" fill="#111113" stroke="#2a2a2e" strokeWidth="2" />
      <rect x="92" y="18" width="136" height="30" rx="15" fill="#f43f5e" />
      <text x="160" y="38" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="Inter, Arial, sans-serif">Arm higher</text>
      <circle cx="160" cy="78" r="11" fill="none" stroke="#e5e5e5" strokeWidth="3" />
      <g stroke="#e5e5e5" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M160 90 L160 140" />
        <path d="M160 140 L148 172 L146 198" />
        <path d="M160 140 L174 172 L178 198" />
        <path d="M160 98 L142 122 L138 148" />
      </g>
      <path d="M160 98 L180 120 L190 142" stroke="#f43f5e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="1 7" />
      <path d="M160 98 L184 82 L196 58" stroke="#a3e635" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="184" cy="82" r="4" fill="#fff" />
      <circle cx="196" cy="58" r="4" fill="#fff" />
    </svg>
  );
}

const STEPS = [
  { icon: Smartphone, title: "Prop your phone up", text: "Two to three metres away, side-on, with your whole body in view." },
  { icon: Activity, title: "Swing or lift", text: "Your skeleton follows you live. Hold a position and the correct one appears in green." },
  { icon: Mic, title: "Get coached out loud", text: "A voice tells you what to fix as you go. Every rep gets a verdict, then a summary with a drill." },
];

/** The top of the page: headline, the promise, how it works. */
export function PracticeHero() {
  return (
    <>
      <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">Shadow practice</p>
      <h1 className="font-heading text-4xl md:text-5xl font-black leading-[1.05] mt-1">A form coach in front of your phone</h1>
      <p className="text-zinc-300 text-base mt-3 max-w-xl">
        Prop your phone up and swing, or lift. Formanti follows your body live, draws the correct position in green wherever you're off,
        and tells you out loud what to fix. No account needed.
      </p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <a href="#pick" className="px-5 py-3 rounded-xl bg-lime-400 text-black font-bold text-sm">Choose your shot</a>
        <Link to="/demo" className="px-5 py-3 rounded-xl border border-zinc-700 text-zinc-200 font-semibold text-sm">See an example analysis</Link>
      </div>

      <div className="mt-8"><HeroArt /></div>

      <h2 className="font-heading text-2xl font-black mt-10">How it works</h2>
      <ol className="mt-3 grid gap-2.5 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-lime-400 font-bold">
              <span className="w-5 h-5 rounded-full bg-lime-400 text-black text-[11px] flex items-center justify-center">{i + 1}</span>
              <Icon className="w-3.5 h-3.5" />
            </p>
            <p className="font-bold mt-2">{title}</p>
            <p className="text-[13px] text-zinc-400 mt-1 leading-snug">{text}</p>
          </li>
        ))}
      </ol>

      <h2 id="pick" className="font-heading text-2xl font-black mt-10 scroll-mt-24">Pick your sport and shot</h2>
    </>
  );
}

/** Below the picker: what it checks, privacy, honest limits, and the questions people ask. */
export function PracticeInfo() {
  return (
    <div className="mt-12 space-y-8 border-t border-zinc-800 pt-8">
      <section>
        <h2 className="font-heading text-2xl font-black">What it checks</h2>
        <div className="mt-3 grid gap-2.5 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
            <p className="font-bold">Racquet sports</p>
            <p className="text-[13px] text-zinc-400 mt-1 leading-snug">
              Badminton, tennis, table tennis, pickleball and squash. Arm height and elbow at the moment of contact on every swing,
              and knee bend on the badminton smash and clear.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
            <p className="font-bold">Deadlift</p>
            <p className="text-[13px] text-zinc-400 mt-1 leading-snug">
              Hips, knees and back angle at the setup and the lockout of every rep, with a cue like "chest up" while you hold. More lifts are on the way.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-lime-400/25 bg-lime-400/5 p-4">
        <p className="flex items-center gap-2 font-bold"><ShieldCheck className="w-4 h-4 text-lime-400" /> Your video stays on your phone</p>
        <p className="text-[13px] text-zinc-300 mt-1.5 leading-snug">
          The pose tracking runs on your phone, so nothing is uploaded and you don't need an account. The first time, it downloads a 20 MB pose model.
        </p>
      </section>

      <section>
        <h2 className="font-heading text-2xl font-black">Good to know</h2>
        <ul className="mt-3 space-y-2 text-[13px] text-zinc-300 leading-snug">
          {[
            "The target ranges are guide values, not a coach's verdict, and every body is different.",
            "It works best side-on, in good light, with your whole body in frame.",
            "It's an estimate from one camera, so angles are close, not lab-exact.",
            "Turn your volume up: the coach talks. If your browser can't speak, you get tones and an on-screen line instead.",
          ].map((t) => (
            <li key={t} className="flex gap-2"><Check className="w-4 h-4 shrink-0 mt-0.5 text-lime-400" /> {t}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-heading text-2xl font-black">Questions</h2>
        <div className="mt-3 space-y-3">
          {[
            ["Does it upload my video?", "No. Everything is tracked on your phone, and the video never leaves it."],
            ["Do I need a coach or equipment?", "No. A phone and a spot to prop it up. You can practise with no shuttle, or the hinge with no weight."],
            ["Which phones does it work on?", "Recent phones in Chrome or Safari with the camera allowed. If it runs slowly, it says so on screen."],
          ].map(([q, a]) => (
            <div key={q}>
              <p className="font-semibold text-sm">{q}</p>
              <p className="text-[13px] text-zinc-400 mt-0.5 leading-snug">{a}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[13px] text-zinc-400">
        Want the full AI breakdown of a real rally or lift? <Link to="/analyze" className="text-lime-300 underline">Analyse a clip</Link>.
      </p>
    </div>
  );
}
