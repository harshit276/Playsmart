import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ShieldCheck, Smartphone, Camera, Check, ChevronDown } from "lucide-react";
import SEO from "@/components/SEO";
import LivePractice from "@/components/LivePractice";
import LiftPractice from "@/components/LiftPractice";
import { PracticeHero, PracticeInfo } from "@/components/PracticeHero";
import { LIFTS } from "@/ai/liftPose";
import { readyProfile } from "@/ai/bodyCheck";
import { PRACTICE_SPORTS, LIFT_SPORT, isLiftSport, liftShots, shotsFor, resolveShot, isPracticeSport } from "@/lib/practiceShots";
import { unlockSpeech, cuesSupported } from "@/lib/speakCue";
import { hasWebGL, autoGhostAllowed } from "@/lib/webgl";
import { preloadLivePose } from "@/ai/livePose";

const JOINT_LABEL = { shoulder: "Arm height", elbow: "Elbow", knee: "Knee bend" };
const LIFT_LABEL = { hip: "Hips", knee: "Knees", trunk: "Back angle" };
const SPORT_PILLS = [...PRACTICE_SPORTS, LIFT_SPORT];
const norm = (s) => String(s || "").toLowerCase().trim().replace(/[\s-]+/g, "_");

/**
 * /practice — shadow practice. Pick a shot, prop your phone up, practise: the pose is tracked live on
 * the device, a voice coach talks you through your stance between swings, and every swing is checked
 * at contact. No account, no upload.
 *
 * Arriving from a shared link shows what this is first (the hero); a deep link from a result
 * ("Practise this shot") goes straight to the picker.
 * Deep link: /practice?sport=badminton&shot=clear&focus=shoulder&hand=right
 */
export default function PracticePage() {
  const [params] = useSearchParams();
  const askedShot = params.get("shot");
  // Someone coming from a result carries a sport or shot and goes straight to the picker;
  // someone arriving from a shared link gets the page that explains what this is first.
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
  const [changing, setChanging] = useState(false);
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
        shotKey={shot.key}
        sport={sport}
        hand={hand}
        facing={facing}
        clipSrc={clipSrc}
        clipRate={clipRate}
        onExit={() => setActive(false)}
      />
    );
  }

  // what will be checked, in plain words
  const checks = isLift
    ? ["Hips, knees and back at the setup", "Hips, knees and back at the top", "A voice cue while you hold each position"]
    : [
      `Your ${[ideal?.shoulder && "arm", ideal?.elbow && "elbow", ideal?.knee && "knees"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")} at the moment of contact`,
      "Your knees, back and feet in your ready stance",
      "A voice cue between swings, and a verdict on every swing",
    ];
  const body = !isLift ? readyProfile(sport) : null;

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
            <h1 className="font-heading text-3xl font-black leading-tight mt-1">Practise in front of your phone</h1>
            <p className="text-zinc-400 text-sm mt-1.5">Pick your shot, prop the phone up, and start.</p>
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
              className={`px-3.5 py-2 rounded-full text-[14px] font-semibold border ${sport === s.key ? "bg-lime-400 text-black border-lime-400" : "bg-zinc-900 text-zinc-300 border-zinc-700"}`}>
              {s.label}
            </button>
          ))}
        </div>

        <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mt-5 mb-2">Shot</p>
        <div className="flex flex-wrap gap-1.5">
          {shots.map((s) => (
            <button key={s.key} type="button" onClick={() => setShotKey(s.key)} aria-pressed={shot?.key === s.key}
              className={`px-3.5 py-2 rounded-full text-[14px] font-semibold border ${shot?.key === s.key ? "bg-lime-400 text-black border-lime-400" : "bg-zinc-900 text-zinc-300 border-zinc-700"}`}>
              {s.name}
            </button>
          ))}
        </div>

        {ready && (
          <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold">We'll check</p>
            <ul className="mt-2 space-y-1.5">
              {checks.map((c) => (
                <li key={c} className="flex gap-2 text-[14px] text-zinc-200 leading-snug"><Check className="w-4 h-4 shrink-0 mt-0.5 text-lime-400" strokeWidth={3} />{c}</li>
              ))}
            </ul>
            <details className="mt-3 group">
              <summary className="flex items-center gap-1 text-[13px] text-zinc-400 cursor-pointer select-none list-none">
                See the target ranges <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 space-y-3 text-[13px] text-zinc-300 leading-snug">
                {lift && ["setup", "lockout"].map((phase) => (
                  <div key={phase}>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">{phase === "setup" ? "Setup (bar leaves the floor)" : "Lockout"}</p>
                    {["hip", "knee", "trunk"].map((j) => (
                      <p key={j}><span className="font-semibold">{LIFT_LABEL[j]}</span> <span className="font-mono text-lime-300">{lift[phase][j].min}–{lift[phase][j].max}°</span> <span className="text-zinc-500">· {lift[phase][j].why}</span></p>
                    ))}
                  </div>
                ))}
                {ideal && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">At contact</p>
                    {["shoulder", "elbow", "knee"].filter((j) => ideal[j]).map((j) => (
                      <p key={j}><span className="font-semibold">{JOINT_LABEL[j]}</span> <span className="font-mono text-lime-300">{ideal[j].min}–{ideal[j].max}°</span> <span className="text-zinc-500">· {ideal[j].why}</span></p>
                    ))}
                  </div>
                )}
                {body && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Ready stance</p>
                    <p><span className="font-semibold">Knees</span> <span className="font-mono text-lime-300">{body.knee.min}–{body.knee.max}°</span> <span className="text-zinc-500">· {body.knee.why}</span></p>
                    <p><span className="font-semibold">Back lean</span> <span className="font-mono text-lime-300">{body.trunk.min}–{body.trunk.max}° forward</span> <span className="text-zinc-500">· {body.trunk.why}</span></p>
                    <p><span className="font-semibold">Feet apart</span> <span className="font-mono text-lime-300">{body.stance.min}–{body.stance.max}× shoulder width</span> <span className="text-zinc-500">· {body.stance.why}</span></p>
                  </div>
                )}
                <p className="text-[12px] text-zinc-500">Guide ranges, not a coach's verdict. We check your arm and body position, not whether the swing is the right shot.</p>
              </div>
            </details>
          </div>
        )}

        <ul className="mt-4 space-y-2 text-[13px] text-zinc-300">
          <li className="flex gap-2.5"><Smartphone className="w-4 h-4 shrink-0 mt-0.5 text-zinc-500" /> Prop the phone up 2 to 3 metres away, about waist height.</li>
          <li className="flex gap-2.5"><Camera className="w-4 h-4 shrink-0 mt-0.5 text-zinc-500" /> {isLift ? "Stand side-on to the camera, whole body in view from head to feet." : "Turn so your hitting side faces the camera, whole body in view."}</li>
        </ul>

        <div className="mt-4 rounded-xl border border-zinc-800 px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <p className="text-zinc-300">{isLift ? "" : `${hand === "right" ? "Right" : "Left"}-handed · `}{facing === "user" ? "Front" : "Back"} camera</p>
            <button type="button" onClick={() => setChanging((c) => !c)} className="text-lime-300 font-semibold">{changing ? "Done" : "Change"}</button>
          </div>
          {changing && (
            <div className={`mt-3 grid gap-3 ${isLift ? "grid-cols-1" : "grid-cols-2"}`}>
              {!isLift && <Choice label="Racket hand" value={hand} onChange={setHand} options={[["right", "Right"], ["left", "Left"]]} />}
              <Choice label="Camera" value={facing} onChange={setFacing} options={[["user", "Front"], ["environment", "Back"]]} />
            </div>
          )}
        </div>

        <p className="flex gap-2 text-[12px] text-zinc-400 mt-4"><ShieldCheck className="w-4 h-4 shrink-0 text-lime-400" /> {cuesSupported() ? "Turn your volume up: a voice coach talks you through it. " : "This browser can't speak, so you'll get tones and a message on screen. "}Your video stays on your phone.</p>

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
