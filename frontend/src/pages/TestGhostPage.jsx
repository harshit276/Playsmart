import { useEffect, useMemo, useState } from "react";
import GhostPlayback from "@/components/GhostPlayback";

/**
 * /test-ghost — try the corrected-motion ghost on any local clip without an
 * account or an analysis (same idea as /test-model). Everything runs in the
 * browser; the clip never leaves the device.
 *
 * Dev shortcut: /test-ghost?src=/dev-samples/clip.mp4&t=25.4&sport=badminton&shot=clear&box=ymin,xmin,ymax,xmax
 * Steer by a tap instead of a box with &tap=x,y (0-1 of the frame).
 */
export default function TestGhostPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [file, setFile] = useState(null);
  const [t, setT] = useState(params.get("t") || "");
  const [sport, setSport] = useState(params.get("sport") || "badminton");
  const [shot, setShot] = useState(params.get("shot") || "smash");
  const [box, setBox] = useState(params.get("box") || "");
  const [run, setRun] = useState(0);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    const src = params.get("src");
    if (!src) return;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => { setFile(new File([b], src.split("/").pop() || "clip.mp4", { type: b.type || "video/mp4" })); setRun(1); })
      .catch((e) => setLoadErr(`Couldn't load ${src}: ${e.message}`));
  }, [params]);

  const contactBox = useMemo(() => {
    const n = box.split(",").map((x) => Number(x.trim()));
    return n.length === 4 && n.every(Number.isFinite) ? n : null;
  }, [box]);
  const tapPoint = useMemo(() => {
    const n = (params.get("tap") || "").split(",").map((x) => Number(x.trim()));
    return n.length === 2 && n.every(Number.isFinite) ? { x: n[0], y: n[1] } : null;
  }, [params]);
  const contactSec = Number(t);
  const ready = file && Number.isFinite(contactSec) && t !== "";

  return (
    <div className="min-h-screen bg-zinc-950 text-white px-4 py-8">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="font-heading text-2xl font-black">Corrected motion (test)</h1>
        <p className="text-sm text-zinc-400">
          Pick a clip, enter the moment of contact, and see your arm re-posed to the ideal in 3D.
          Runs on this device only.
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-zinc-400">Clip</span>
            <input id="ghost-file" type="file" accept="video/*" onChange={(e) => { setFile(e.target.files?.[0] || null); setRun(0); }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-400">Contact time (s)</span>
            <input id="ghost-t" className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1" value={t} onChange={(e) => setT(e.target.value)} placeholder="25.4" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-400">Sport</span>
            <input id="ghost-sport" className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1" value={sport} onChange={(e) => setSport(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-400">Shot type</span>
            <input id="ghost-shot" className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1" value={shot} onChange={(e) => setShot(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-400">Contact box (optional)</span>
            <input id="ghost-box" className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1" value={box} onChange={(e) => setBox(e.target.value)} placeholder="ymin,xmin,ymax,xmax (0-1000)" />
          </label>
        </div>
        <button
          type="button"
          disabled={!ready}
          onClick={() => setRun((r) => r + 1)}
          className="bg-lime-400 disabled:opacity-40 text-black font-bold text-sm rounded-lg px-4 py-2"
        >
          Show the fix in motion
        </button>
        {loadErr && <p className="text-sm text-rose-400">{loadErr}</p>}
        {ready && run > 0 && (
          <GhostPlayback
            key={`${run}-${file.name}-${contactSec}-${sport}-${shot}-${box}`}
            videoFile={file}
            contactSec={contactSec}
            sport={sport}
            shotType={shot}
            contactBox={contactBox}
            tapPoint={tapPoint}
            shotLabel={`${shot} · ${contactSec}s`}
          />
        )}
      </div>
    </div>
  );
}
