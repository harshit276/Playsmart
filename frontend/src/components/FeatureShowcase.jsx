import { motion, useReducedMotion } from "framer-motion";
import {
  Video, Activity, MessageSquare, GitCompareArrows, LineChart,
  FileText, ListChecks, ShoppingBag, Users, Mic,
} from "lucide-react";

/**
 * FeatureShowcase — the landing page's "what this product actually does"
 * section.
 *
 * Every claim here maps to shipped code. Nothing aspirational:
 *   - shot-by-shot + timestamps ....... MatchInsights.jsx / AnalyzePage results
 *   - posture skeleton + joint angles . ai/poseOverlay.js, PoseOverlayModal.jsx
 *     (gated by ai/posturePolicy.js — racket/ball sports ONLY; the card says so)
 *   - ask coach / live voice coach .... VirtualCoach.jsx, LiveVoiceCoach.jsx
 *   - re-analyze & compare ............ FormComparisonModal.jsx, /compare-analyses
 *   - progress & history .............. ProgressPage.jsx
 *   - PDF coach report ................ lib/coachReport.js
 *   - training plans / gear ........... TrainingPlan + EquipmentRecommendModal
 *   - host & join games ............... CommunityPage
 *
 * The inline mockups are CSS/SVG only (no images, no deps) and are labelled
 * "Sample" so nobody reads them as a real user's numbers.
 */

const SampleTag = ({ children = "Sample" }) => (
  <span className="absolute top-3 right-3 text-[9px] uppercase tracking-widest font-semibold text-zinc-500 bg-zinc-950/70 border border-zinc-800 rounded-full px-2 py-0.5">
    {children}
  </span>
);

/* ---------- mockup: shot-by-shot breakdown ---------- */
function ShotBreakdownMock() {
  const shots = [
    { t: "0:08", name: "Smash", intent: "Finish the rally", ok: true },
    { t: "0:14", name: "Net Drop", intent: "Force a lift", ok: true },
    { t: "0:21", name: "Clear", intent: "Reset position", ok: false },
  ];
  return (
    <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 sm:p-4 overflow-hidden">
      <SampleTag />
      {/* timeline strip */}
      <div className="relative h-8 rounded-lg bg-zinc-900 border border-zinc-800 mb-3 overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-lime-400/25 to-transparent" />
        {[18, 42, 63].map((p) => (
          <div key={p} className="absolute inset-y-1 w-0.5 rounded-full bg-lime-400" style={{ left: `${p}%` }} />
        ))}
        <div className="absolute inset-y-0 flex items-center left-2 text-[9px] font-mono text-zinc-500">00:00</div>
        <div className="absolute inset-y-0 flex items-center right-2 text-[9px] font-mono text-zinc-500">00:30</div>
      </div>
      <div className="space-y-1.5">
        {shots.map((s) => (
          <div key={s.t} className="flex items-center gap-2 rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-2.5 py-2">
            <span className="font-mono text-[10px] text-lime-400 tabular-nums shrink-0">{s.t}</span>
            <span className="text-xs font-semibold text-white shrink-0">{s.name}</span>
            <span className="text-[10px] text-zinc-500 truncate hidden sm:inline">{s.intent}</span>
            <span className={`ml-auto shrink-0 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
              s.ok ? "text-lime-300 bg-lime-400/10" : "text-amber-300 bg-amber-400/10"
            }`}>{s.ok ? "Won" : "Lost"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- mockup: posture skeleton + joint angles ---------- */
function PostureMock() {
  return (
    <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 overflow-hidden">
      <SampleTag />
      <svg viewBox="0 0 160 150" className="w-full h-32" aria-hidden="true">
        <g stroke="#a3e635" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9">
          <path d="M78 34 L78 74" />
          <path d="M78 44 L54 60 L44 84" />
          <path d="M78 44 L104 34 L118 16" />
          <path d="M78 74 L60 106 L58 134" />
          <path d="M78 74 L98 104 L104 134" />
        </g>
        {[[78, 28], [78, 44], [54, 60], [44, 84], [104, 34], [118, 16], [78, 74], [60, 106], [58, 134], [98, 104], [104, 134]].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.2" fill="#0a0a0a" stroke="#a3e635" strokeWidth="1.6" />
        ))}
        <circle cx="104" cy="34" r="10" fill="none" stroke="#a3e635" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
      </svg>
      <div className="space-y-1.5 mt-1">
        {[
          { label: "Elbow at contact", val: "152°", ideal: "140–165°", ok: true },
          { label: "Shoulder rotation", val: "71°", ideal: "80–100°", ok: false },
        ].map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-[10px]">
            <span className="text-zinc-400 truncate">{r.label}</span>
            <span className={`ml-auto font-mono font-bold ${r.ok ? "text-lime-400" : "text-amber-400"}`}>{r.val}</span>
            <span className="text-zinc-600 font-mono">/ {r.ideal}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- mockup: coach chat ---------- */
function CoachChatMock() {
  return (
    <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2 overflow-hidden">
      <SampleTag />
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-zinc-800 px-3 py-2 text-[11px] text-zinc-200">
        Why did my clears keep landing short?
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-lime-400/10 border border-lime-400/20 px-3 py-2 text-[11px] text-lime-100">
        You're contacting the shuttle in front of your body instead of overhead — that costs you depth. Try the shadow-clear drill in your plan.
      </div>
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1 h-7 rounded-full bg-zinc-900 border border-zinc-800 flex items-center px-3 text-[10px] text-zinc-600">
          Ask about this session…
        </div>
        <div className="w-7 h-7 rounded-full bg-lime-400 flex items-center justify-center shrink-0">
          <Mic className="w-3.5 h-3.5 text-black" />
        </div>
      </div>
    </div>
  );
}

/* ---------- mockup: compare two sessions ---------- */
function CompareMock() {
  return (
    <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 overflow-hidden">
      <SampleTag />
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 p-2.5 text-center">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">Session 1</p>
          <p className="font-heading font-black text-2xl text-zinc-300">61</p>
        </div>
        <div className="shrink-0 text-lime-400">
          <GitCompareArrows className="w-4 h-4" />
        </div>
        <div className="flex-1 rounded-xl bg-lime-400/10 border border-lime-400/30 p-2.5 text-center">
          <p className="text-[9px] uppercase tracking-wider text-lime-400/80">Today</p>
          <p className="font-heading font-black text-2xl text-lime-400">74</p>
        </div>
      </div>
      <p className="text-[10px] text-zinc-500 mt-2 text-center">Same drill, three weeks apart — what changed, shot by shot.</p>
    </div>
  );
}

/* ---------- mockup: progress sparkline ---------- */
function ProgressMock() {
  return (
    <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 overflow-hidden">
      <SampleTag />
      <svg viewBox="0 0 200 62" className="w-full h-16" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fmt-spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e635" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#a3e635" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,48 L33,42 L66,45 L100,32 L133,26 L166,18 L200,10 L200,62 L0,62 Z" fill="url(#fmt-spark)" />
        <path d="M0,48 L33,42 L66,45 L100,32 L133,26 L166,18 L200,10" fill="none" stroke="#a3e635" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[9px] text-zinc-600 font-mono mt-1">
        <span>Session 1</span><span>Session 7</span>
      </div>
    </div>
  );
}

/* ---------- mockup: PDF report ---------- */
function ReportMock() {
  return (
    <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 overflow-hidden">
      <SampleTag />
      <div className="mx-auto w-28 rounded-lg bg-zinc-100 p-2 shadow-lg shadow-black/40 rotate-[-2deg]">
        <div className="h-1.5 w-10 rounded-full bg-lime-500 mb-1.5" />
        <div className="h-1 w-full rounded-full bg-zinc-300 mb-1" />
        <div className="h-1 w-4/5 rounded-full bg-zinc-300 mb-2" />
        <div className="grid grid-cols-3 gap-1 mb-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-4 rounded bg-zinc-200" />)}
        </div>
        <div className="h-1 w-full rounded-full bg-zinc-300 mb-1" />
        <div className="h-1 w-3/4 rounded-full bg-zinc-300 mb-1" />
        <div className="h-1 w-5/6 rounded-full bg-zinc-300" />
      </div>
    </div>
  );
}

const CARDS = [
  {
    key: "analysis",
    icon: Video,
    tone: "lime",
    title: "Shot-by-shot video analysis",
    desc: "Upload a clip and our AI breaks the session into individual shots with timestamps — what you were trying to do, and how it actually turned out.",
    span: "lg:col-span-2",
    mock: <ShotBreakdownMock />,
  },
  {
    key: "posture",
    icon: Activity,
    tone: "lime",
    title: "Posture tracker",
    desc: "A skeleton overlay on the contact frame, with your joint angles measured against ideal ranges.",
    note: "Racket & ball sports only — not claimed for gym lifting.",
    mock: <PostureMock />,
  },
  {
    key: "coach",
    icon: MessageSquare,
    tone: "sky",
    title: "Ask Coach & Live Voice Coach",
    desc: "Chat with an AI coach about your own clip, or talk to it out loud between sets.",
    mock: <CoachChatMock />,
  },
  {
    key: "compare",
    icon: GitCompareArrows,
    tone: "purple",
    title: "Re-analyze & compare",
    desc: "Re-run a clip later and put it side by side with an earlier session to see what actually changed.",
    mock: <CompareMock />,
  },
  {
    key: "progress",
    icon: LineChart,
    tone: "emerald",
    title: "Progress & history",
    desc: "Every analysis is saved to your account, grouped by sport, so trends show up over time.",
    mock: <ProgressMock />,
  },
  {
    key: "report",
    icon: FileText,
    tone: "amber",
    title: "PDF coach report",
    desc: "Download a written report of a session — verdict, per-shot table, what to fix, next-session plan.",
    mock: <ReportMock />,
  },
  {
    key: "plans",
    icon: ListChecks,
    tone: "sky",
    title: "Training plans",
    desc: "Drills and a weekly plan built around the weaknesses your analysis actually found.",
  },
  {
    key: "gear",
    icon: ShoppingBag,
    tone: "purple",
    title: "Gear recommendations",
    desc: "Racket, shoe and string picks matched to your play style, level and budget.",
  },
  {
    key: "games",
    icon: Users,
    tone: "emerald",
    title: "Host & join games",
    desc: "Post a session, find players near you, and share it out in a tap.",
  },
];

const TONES = {
  lime: { text: "text-lime-400", chip: "bg-lime-400/10 border-lime-400/25", glow: "group-hover:border-lime-400/40" },
  sky: { text: "text-sky-400", chip: "bg-sky-400/10 border-sky-400/25", glow: "group-hover:border-sky-400/40" },
  purple: { text: "text-purple-400", chip: "bg-purple-400/10 border-purple-400/25", glow: "group-hover:border-purple-400/40" },
  emerald: { text: "text-emerald-400", chip: "bg-emerald-400/10 border-emerald-400/25", glow: "group-hover:border-emerald-400/40" },
  amber: { text: "text-amber-400", chip: "bg-amber-400/10 border-amber-400/25", glow: "group-hover:border-amber-400/40" },
};

export default function FeatureShowcase() {
  const reduce = useReducedMotion();
  const rise = reduce
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 24 },
        visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: Math.min(i, 5) * 0.06 } }),
      };

  return (
    <section id="what-you-get" className="relative py-20 md:py-28 overflow-hidden bg-zinc-950">
      {/* layered depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-900/30 to-zinc-950" />
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[46rem] h-[46rem] max-w-full bg-lime-400/5 rounded-full blur-3xl" />

      <div className="relative container mx-auto px-4 max-w-6xl">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={rise}
          className="max-w-2xl mb-12 md:mb-16">
          <span className="inline-flex items-center gap-2 text-lime-400 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
            <span className="w-8 h-px bg-lime-400/60" /> What you get
          </span>
          <h2 className="font-heading font-black text-4xl md:text-6xl tracking-tighter uppercase text-white leading-[0.95] mb-5">
            One clip in.<br />
            <span className="text-lime-400">A whole coaching session out.</span>
          </h2>
          <p className="text-zinc-400 text-base md:text-lg leading-relaxed">
            Most people only ever try the upload. Here is everything that comes with it —
            all of it built, all of it in the app today.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {CARDS.map((c, i) => {
            const tone = TONES[c.tone];
            return (
              <motion.div
                key={c.key}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                variants={rise}
                className={`group relative rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900 to-zinc-900/40 p-5 md:p-6 transition-colors duration-300 ${tone.glow} ${c.span || ""}`}
              >
                {/* top hairline highlight */}
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${tone.chip}`}>
                  <c.icon className={`w-5 h-5 ${tone.text}`} strokeWidth={1.6} />
                </div>
                <h3 className="font-heading font-bold text-lg md:text-xl text-white tracking-tight mb-2">{c.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{c.desc}</p>
                {c.note && (
                  <p className="text-[11px] text-zinc-500 mt-2 border-l-2 border-zinc-700 pl-2">{c.note}</p>
                )}
                {c.mock && <div className="mt-5">{c.mock}</div>}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
