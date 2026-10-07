import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ShieldCheck, Smartphone, Camera, Target } from "lucide-react";
import SEO from "@/components/SEO";
import LivePractice from "@/components/LivePractice";
import LiftPractice from "@/components/LiftPractice";
import { PracticeHero, PracticeInfo } from "@/components/PracticeHero";
import { LIFTS } from "@/ai/liftPose";
import { PRACTICE_SPORTS, LIFT_SPORT, isLiftSport, liftShots, shotsFor, resolveShot, isPracticeSport } from "@/lib/practiceShots";
import { unlockSpeech, cuesSupported } from "@/lib/speakCue";
import { hasWebGL, autoGhostAllowed } from "@/lib/webgl";
import { preloadLivePose } from "@/ai/livePose";

const JOINT_LABEL = { shoulder: "Arm height", elbow: "Elbow", knee: "Knee bend" };
const LIFT_LABEL = { hip: "Hips", knee: "Knees", trunk: "Back angle" };
const SPORT_PILLS = [...PRACTICE_SPORTS, LIFT_SPORT];
const norm = (s) => String(s || "").toLowerCase().trim().replace(/[\s-]+/g, "_");

/**
 * /practice — shadow practice. Pick a shot, prop your phone up, swing: the pose
 * is tracked live on the device, the correct form is drawn when you hold still,
 * and every swing is caught at contact and scored. No account, no upload.
 *
 * Deep link: /practice?sport=badminton&shot=clear&focus=shoulder&hand=right
 */
export default function PracticePage() {
  const [params] = useSearchParams();
  const askedShot = params.get("shot");
  // Someone coming from a result ("Practise this shot") carries a sport or shot and goes straight to the
  // picker; someone arriving from a shared link gets the page that explains what this is first.
  const deepLinked = params.has("sport") || params.has("shot") || params.has("clip");
  const askedSport = norm(params.get("sport"));
  const initialSport = isPracticeSport(askedSport) || isLiftSport(askedSport) ? askedSport : "badminton";
  const listShots = (s) => (isLiftSport(s) ? liftShots() : shotsFor(s));
  const lookShot = (s, text) => (isLiftSport(s) ? (liftShots().find((x) => x.key === norm(text)) || null) : resolveShot(s, text));

  const [sport, setSport] = useState(initialSport);
  const [shotKey, setShotKey] = useState(() => lookShot(initialSport, askedShot)?.key || listShots(initialSport)[0]?.key);
  const [hand, setHand] = useState(params.get("hand") === "left" ? "left" : "right");
  const [facing, setFacing] = useState("user");
  const [active, setActive] = useState(false);
  // Practise along with a same-site sample video instead of the camera.
  const clipParam = params.get("clip");
  const clipSrc = clipParam && clipParam.startsWith("/") && !clipParam.startsWith("//") ? clipParam : null;
  const clipRate = Math.min(1, Math.max(0.05, Number(params.get("rate")) || 1));

  const isLift = isLiftSport(sport);
  const shots = useMemo(() => listShots(sport), [sport]);
  const shot = shots.find((s) => s.key === shotKey) || shots[0];
  const resolved = shot && !isLift ? resolveShot(sport, shot.key) : null;
  const ideal = resolved?.ideal;
  const lift = isLift && shot ? LIFTS[shot.key] : null;
  const ready = isLift ? !!lift : !!ideal;
  const focus = ["shoulder", "elbow", "knee"].includes(params.get("focus")) ? params.get("focus") : null;
  const unknownAsked = askedShot && !lookShot(initialSport, askedShot);
  const canRun = hasWebGL();

  // Start fetching the ~20 MB pose model while they read the setup, so Start is
  // usually instant. Skipped on data saver, slow links and low-end devices.
  useEffect(() => { if (canRun && autoGhostAllowed()) preloadLivePose(); }, [canRun]);

  const pickSport = (key) => {
    setSport(key);
    setShotKey(listShots(key)[0]?.key);
  };

  if (active && lift) {
    return (
      <LiftPractice
        key={`${sport}-${shot.key}-${facing}`}
        lift={shot.key}
        facing={facing}
        clipSrc={clipSrc}
        clipRate={clipRate}
        onExit={() => setActive(false)}
      />
    );
  }

  if (active && ideal) {
    return (
      <LivePractice
        key={`${sport}-${shot.key}-${hand}-${facing}`}
        ideal={ideal}
        shotName={shot.name}
        sport={sport}
        focus={focus}
        hand={hand}
        facing={facing}
        clipSrc={clipSrc}
        clipRate={clipRate}
        onExit={() => setActive(false)}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white pb-52 md:pb-28">
      <SEO
        title="Shadow practice: live form coach"
        description="Practise in front of your phone camera. Formanti tracks your form live, shows the correct position, and checks every swing at contact. Runs on your phone; your video is never uploaded."
        url="https://www.formanti.com/practice"
      />
      <div className="max-w-md md:max-w-2xl mx-auto px-4 pt-6">
        {deepLinked ? (
          <>
            <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">Shadow practice</p>
            <h1 className="font-heading text-3xl font-black leading-tight mt-1">Fix it in front of your phone</h1>
            <p className="text-zinc-400 text-sm mt-2">
              {isLift
                ? "Do your reps with a bar, or just the hinge with no weight. We track your form live and check your hips, knees and back at the setup and the lockout of every rep."
                : "Swing with no shuttle. We track your form live, show where your arm and knee should be, and check the moment of contact on every swing."}
            </p>
          </>
        ) : (
          <PracticeHero />
        )}

        {unknownAsked && (
          <p className="mt-4 text-[13px] text-amber-200 bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
            We don't have targets for “{askedShot}” yet. Pick one of these:
          </p>
        )}

        <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mt-6 mb-2">Sport</p>
        <div className="flex flex-wrap gap-1.5">
          {SPORT_PILLS.map((s) => (
            <button key={s.key} type="button" onClick={() => pickSport(s.key)} aria-pressed={sport === s.key}
              className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border ${sport === s.key ? "bg-lime-400 text-black border-lime-400" : "bg-zinc-900 text-zinc-300 border-zinc-700"}`}>
              {s.label}
            </button>
          ))}
        </div>

        <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mt-5 mb-2">Shot</p>
        <div className="flex flex-wrap gap-1.5">
          {shots.map((s) => (
            <button key={s.key} type="button" onClick={() => setShotKey(s.key)} aria-pressed={shot?.key === s.key}
              className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border ${shot?.key === s.key ? "bg-lime-400 text-black border-lime-400" : "bg-zinc-900 text-zinc-300 border-zinc-700"}`}>
              {s.name}
            </button>
          ))}
        </div>

        {lift && (
          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> What good looks like</p>
            {["setup", "lockout"].map((phase) => (
              <div key={phase} className="mt-2">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">{phase === "setup" ? "At the setup (bar leaves the floor)" : "At the lockout"}</p>
                <ul className="mt-1 space-y-1">
                  {["hip", "knee", "trunk"].map((j) => (
                    <li key={j} className="text-[13px] text-zinc-200 leading-snug">
                      <span className="font-semibold">{LIFT_LABEL[j]}</span>{" "}
                      <span className="font-mono text-lime-300">{lift[phase][j].min}–{lift[phase][j].max}°</span>
                      <span className="text-zinc-400"> · {lift[phase][j].why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {ideal && (
          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> What good looks like at contact</p>
            <ul className="mt-2 space-y-1.5">
              {["shoulder", "elbow", "knee"].filter((j) => ideal[j]).map((j) => (
                <li key={j} className="text-[13px] text-zinc-200 leading-snug">
                  <span className="font-semibold">{JOINT_LABEL[j]}</span>{" "}
                  <span className="font-mono text-lime-300">{ideal[j].min}–{ideal[j].max}°</span>
                  {ideal[j].why && <span className="text-zinc-400"> · {ideal[j].why}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mt-5 mb-2">Set up</p>
        <ul className="space-y-2 text-[13px] text-zinc-300">
          <li className="flex gap-2"><Smartphone className="w-4 h-4 shrink-0 mt-0.5 text-zinc-500" /> Prop the phone up 2 to 3 metres away, about waist height.</li>
          <li className="flex gap-2"><Camera className="w-4 h-4 shrink-0 mt-0.5 text-zinc-500" /> {isLift ? "Stand side-on to the camera, and keep your whole body in view from head to feet." : "Turn so your hitting side faces the camera, and keep your whole body in view."}</li>
        </ul>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {!isLift && <Choice label="Racket hand" value={hand} onChange={setHand} options={[["right", "Right"], ["left", "Left"]]} />}
          <Choice label="Camera" value={facing} onChange={setFacing} options={[["user", "Front"], ["environment", "Back"]]} />
        </div>

        <p className="text-[12px] text-zinc-300 mt-4">{cuesSupported() ? "Turn your volume up: a voice coach talks you through it, and says when you have it right." : "This browser can't speak, so you'll get tones and the coaching line on screen instead."}</p>
        <p className="flex gap-2 text-[12px] text-zinc-400 mt-2"><ShieldCheck className="w-4 h-4 shrink-0 text-lime-400" /> Your video stays on your phone. Nothing is uploaded.</p>
        <p className="text-[11px] text-zinc-500 mt-2">These are guide ranges, not a coach's verdict. Works best side-on, in good light.</p>

        {!deepLinked && <PracticeInfo />}
      </div>

      {/* on phones the bottom nav is showing, so the Start bar sits just above it */}
      <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] md:bottom-0 z-50 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent px-4 pt-6 pb-3 md:pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto">
          {!canRun && <p className="text-[12px] text-amber-200 mb-2">This browser can't run the live pose model (graphics acceleration is off). Try Chrome or Safari.</p>}
          <button type="button" disabled={!ready || !canRun} onClick={() => { unlockSpeech(); setActive(true); }}
            className="w-full py-3.5 rounded-xl bg-lime-400 text-black font-bold text-base disabled:opacity-40">
            Start camera
          </button>
          <p className="text-center text-[11px] text-zinc-500 mt-2">Want the full AI breakdown of a real {isLift ? "lift" : "rally"}? <Link to="/analyze" className="text-lime-300 underline">Analyse a clip</Link></p>
        </div>
      </div>
    </div>
  );
}

function Choice({ label, value, onChange, options }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">{label}</p>
      <div className="flex rounded-lg overflow-hidden border border-zinc-700">
        {options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
            className={`flex-1 py-2 text-[13px] font-semibold ${value === v ? "bg-lime-400 text-black" : "bg-zinc-900 text-zinc-300"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}
