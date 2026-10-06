import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X as XIcon, Dumbbell, Info, Camera } from "lucide-react";
import { analyzeLiftClip } from "@/ai/liftAnalyze";
import { drawLiftFrame } from "@/ai/liftDraw";
import { LIFTS } from "@/ai/liftPose";
import { hasWebGL, autoGhostAllowed } from "@/lib/webgl";
import { track } from "@/lib/analytics";
import { deviceKind } from "@/lib/frameSource";

/**
 * LiftFix — the form check for a lift (deadlift first), on the lifter's own clip.
 *
 * The pose model runs in the browser (nothing is uploaded). It follows the lifter,
 * finds each rep, and grades the setup (where the bar leaves the floor) and the
 * lockout: hips, knees and back angle. Whatever is out of range gets a plain
 * instruction, and the corrected pose is drawn in green on the lifter's own
 * picture: on two stills and on the moving clip.
 *
 * Props: videoFile (File/Blob/URL of the clip), lift ("deadlift").
 */

const ROW_LABEL = { hip: "Hips", knee: "Knees", trunk: "Back angle" };
const REASONS = {
  "no-rep": "We couldn't find a full rep in this clip. We look for the bar leaving the floor and reaching lockout, so keep the whole lift in frame.",
  "no-lifter": "We couldn't follow you through this clip. Try a clip where you're the nearest person to the camera.",
  "no-webgl": "This browser can't run the pose model because graphics acceleration is off. Try Chrome or Safari.",
  "too-slow": "That took too long on this device, so we stopped. Try again on Wi-Fi, or with a shorter clip.",
  "clip-too-short": "This clip is too short to find a rep in.",
  "frames-blank": "This browser couldn't show the frames of this clip.",
};

export default function LiftFix({ videoFile, lift = "deadlift" }) {
  const L = LIFTS[lift];
  const [status, setStatus] = useState("idle"); // idle | running | done | failed
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [repIdx, setRepIdx] = useState(0);
  const abortRef = useRef(null);

  const run = useCallback(async () => {
    if (!videoFile || !hasWebGL()) { setResult({ ok: false, reason: "no-webgl" }); setStatus("failed"); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus("running");
    setProgress({ phase: "model", done: 0, total: 1 });
    const t0 = Date.now();
    try {
      const r = await analyzeLiftClip({ video: videoFile, lift, signal: ac.signal, onProgress: setProgress });
      if (ac.signal.aborted) return;
      setResult(r);
      setRepIdx(0);
      setStatus(r.ok ? "done" : "failed");
      track("lift_checked", {
        lift, ok: !!r.ok, reason: r.reason || null, reps: r.reps?.length || 0,
        faults: r.reps?.reduce((n, x) => n + x.grade.faults.length, 0) ?? null,
        view: r.view?.label || null, seconds: Math.round((Date.now() - t0) / 1000), device: deviceKind(),
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      setResult({ ok: false, reason: "error" });
      setStatus("failed");
      track("lift_checked", { lift, ok: false, reason: String(e?.message || e).slice(0, 60), device: deviceKind() });
    }
  }, [videoFile, lift]);

  // Starts by itself on a capable device and connection; otherwise waits for a tap.
  useEffect(() => {
    if (videoFile && hasWebGL() && autoGhostAllowed()) run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFile]);

  if (!videoFile) return null;

  return (
    <section className="rounded-2xl border border-lime-400/25 bg-zinc-900/60 p-4 space-y-4" aria-label={`${L.label} form check`}>
      <header>
        <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold flex items-center gap-1.5"><Dumbbell className="w-3.5 h-3.5" /> Form check</p>
        <h3 className="text-lg font-black leading-tight mt-0.5">Your {L.label.toLowerCase()}</h3>
      </header>

      {status === "idle" && (
        <div>
          <p className="text-[13px] text-zinc-300">We'll follow you through the lift on this phone and check your hips, knees and back at the setup and the lockout. Your video isn't uploaded.</p>
          <button type="button" onClick={run} className="mt-3 px-4 py-2.5 rounded-xl bg-lime-400 text-black font-bold text-sm">Check my {L.label.toLowerCase()}</button>
        </div>
      )}

      {status === "running" && <Progress p={progress} />}

      {status === "failed" && (
        <div>
          <p className="text-[13px] text-zinc-300">{REASONS[result?.reason] || "Couldn't check this lift. Try again, or use Chrome or Safari."}</p>
          {result?.reason !== "no-webgl" && <button type="button" onClick={run} className="mt-3 px-4 py-2 rounded-lg border border-zinc-700 text-sm font-semibold">Try again</button>}
        </div>
      )}

      {status === "done" && result?.ok && <Result result={result} repIdx={repIdx} setRepIdx={setRepIdx} videoFile={videoFile} />}
    </section>
  );
}

function Progress({ p }) {
  const pct = p?.phase === "track" && p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <div role="status" aria-live="polite">
      <p className="text-[13px] text-zinc-200">{p?.phase === "model" ? "Loading the pose model (about 20 MB the first time)…" : `Following you through the lift… ${pct}%`}</p>
      <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-lime-400 transition-all" style={{ width: `${p?.phase === "track" ? Math.max(4, pct) : 4}%` }} /></div>
      <p className="text-[11px] text-zinc-500 mt-1.5">Runs on your phone. Nothing is uploaded.</p>
    </div>
  );
}

function Result({ result, repIdx, setRepIdx, videoFile }) {
  const rep = result.reps[Math.min(repIdx, result.reps.length - 1)];
  const g = rep.grade;
  const stills = result.stills?.[rep.n] || {};
  const anyGhost = result.frames.some((f) => f.ghost);

  return (
    <div className="space-y-4">
      {result.reps.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mr-1">Rep</span>
          {result.reps.slice(0, 12).map((r, i) => (
            <button key={r.n} type="button" onClick={() => setRepIdx(i)} aria-pressed={i === repIdx}
              className={`w-7 h-7 rounded-md text-[11px] font-bold ${r.grade.inBand ? "bg-lime-400/90 text-black" : "bg-rose-500/80 text-white"} ${i === repIdx ? "ring-2 ring-white" : "opacity-80"}`}>{r.n}</button>
          ))}
        </div>
      )}

      {/* the verdict */}
      {g.inBand ? (
        <div className="rounded-xl border border-lime-400/30 bg-lime-400/5 p-3">
          <p className="text-[15px] font-bold text-lime-300 flex items-center gap-1.5"><Check className="w-4 h-4" /> Within the guide ranges</p>
          <p className="text-[13px] text-zinc-300 mt-1">Your setup and lockout are inside the common coaching ranges, so there's nothing to correct on those. The green fix only appears where a number is out of range.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {g.cues.map((c) => (
            <div key={`${c.phase}.${c.joint}`} className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-rose-300 font-bold">{c.phase === "setup" ? "At the setup" : c.phase === "lockout" ? "At the top" : "During the pull"}</p>
              <p className="text-[15px] font-bold mt-0.5">{c.headline}</p>
              <p className="text-[13px] text-zinc-300 mt-1">{c.feel}</p>
              <p className="text-[12px] text-sky-200 mt-2 flex gap-1.5"><Dumbbell className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{c.drill}</span></p>
            </div>
          ))}
        </div>
      )}

      {/* the numbers */}
      <div className="grid grid-cols-2 gap-2.5">
        {["setup", "lockout"].map((phase) => (
          <div key={phase} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{phase === "setup" ? "Setup (bar leaves the floor)" : "Lockout"}</p>
            <ul className="mt-1.5 space-y-1.5">
              {["hip", "knee", "trunk"].map((j) => {
                const it = g.items.find((x) => x.phase === phase && x.joint === j);
                if (!it) return <li key={j} className="text-[12px] text-zinc-600">{ROW_LABEL[j]} <span className="float-right">not visible</span></li>;
                return (
                  <li key={j} className="text-[12px] leading-tight">
                    <span className="text-zinc-300">{ROW_LABEL[j]}</span>
                    <span className={`float-right font-mono font-bold flex items-center gap-1 ${it.ok ? "text-lime-300" : "text-rose-300"}`}>
                      {Math.round(it.value)}°{it.ok ? <Check className="w-3.5 h-3.5" /> : <XIcon className="w-3.5 h-3.5" />}
                    </span>
                    <span className="block text-[10px] text-zinc-500 clear-both">aim {it.range.min}–{it.range.max}°</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* the two moments, with the fix drawn on */}
      {(stills.setup || stills.lockout) && (
        <div className="grid grid-cols-2 gap-2.5">
          {["setup", "lockout"].map((phase) => stills[phase] && (
            <figure key={phase} className="rounded-xl overflow-hidden border border-zinc-800 bg-black">
              <img src={stills[phase].url} alt={`Your ${phase} with your skeleton drawn on`} className="w-full h-auto block" />
              <figcaption className="text-[11px] text-zinc-400 px-2 py-1.5">{phase === "setup" ? "Setup" : "Lockout"}{rep.plans[phase].applied.some((x) => x.joint !== "hip") ? " · green is the fix" : ""}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {/* the moving clip */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">Watch it back</p>
        <LiftPlayer videoFile={videoFile} result={result} rep={rep} />
        <p className="text-[11px] text-zinc-500 mt-1.5">{anyGhost ? "The green pose shows the fix, fading in around the setup and the lockout." : "Your skeleton and live angles. Nothing is out of range, so there's no green fix."}</p>
      </div>

      <div className="flex gap-2 text-[11px] text-zinc-500 leading-snug">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          Filmed {result.view?.label || "from an unknown angle"}{result.view?.label && result.view.label !== "side-on" ? ": film from the side for the most accurate hip and back angles" : ""}.
          These are guide ranges, not a coach's verdict, and every lifter's levers differ. We measure back angle, not whether your back is rounding.
        </p>
      </div>

      <Link to="/practice?sport=strength&shot=deadlift" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-200">
        <Camera className="w-4 h-4" /> Practise the hinge with your camera
      </Link>
    </div>
  );
}

function LiftPlayer({ videoFile, result, rep }) {
  const vref = useRef(null);
  const cref = useRef(null);
  const url = useMemo(() => (typeof videoFile === "string" ? videoFile : URL.createObjectURL(videoFile)), [videoFile]);
  useEffect(() => () => { if (typeof videoFile !== "string") URL.revokeObjectURL(url); }, [url, videoFile]);
  const frames = result.frames;
  const cw = 640, ch = Math.round((640 * result.videoHeight) / result.videoWidth);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = vref.current, c = cref.current;
      if (v && c) {
        const t = v.currentTime;
        let lo = 0, hi = frames.length - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t < t) lo = m + 1; else hi = m; }
        const cand = [frames[lo], frames[lo - 1]].filter(Boolean);
        const f = cand.reduce((b, x) => (!b || Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b), null);
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        if (f && Math.abs(f.t - t) < 0.4) drawLiftFrame(ctx, f, c.width / result.videoWidth, { readout: true });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frames, result.videoWidth]);

  const seek = (t) => { const v = vref.current; if (v) { v.pause(); v.currentTime = Math.max(0, t); } };
  return (
    <div>
      {/* the box keeps the clip's exact shape (capped by height through its width), so the overlay lines up with the picture */}
      <div className="relative rounded-xl overflow-hidden bg-black mx-auto" style={{ aspectRatio: `${result.videoWidth} / ${result.videoHeight}`, width: `min(100%, ${((70 * result.videoWidth) / result.videoHeight).toFixed(2)}vh)` }}>
        <video ref={vref} src={url} playsInline muted controls preload="auto" className="absolute inset-0 w-full h-full object-contain" />
        <canvas ref={cref} width={cw} height={ch} className="absolute inset-0 w-full h-full pointer-events-none" />
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={() => seek(rep.tPull - 0.3)} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-[12px] font-semibold">Jump to setup</button>
        <button type="button" onClick={() => seek(rep.tLock)} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-[12px] font-semibold">Jump to lockout</button>
      </div>
    </div>
  );
}
