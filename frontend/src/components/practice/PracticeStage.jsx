import { Camera } from "lucide-react";
import { cameraErrorMessage } from "@/lib/useLiveCamera";

/**
 * The camera picture with the skeleton drawn over it, mirrored for the front camera, plus the
 * "starting" and "something went wrong" screens. Overlays (the coaching message, the verdict)
 * are passed in as children and sit on top of the picture.
 *
 * @param {object} cam  what useLiveCamera returns
 */
export default function PracticeStage({ cam, mirrored, onExit, children }) {
  const { videoRef, canvasRef, boxRef, phase, error, slowLoad, viewW, viewH, start, facing } = cam;
  return (
    <div ref={boxRef} className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className="relative bg-zinc-900 overflow-hidden" style={{ width: viewW, height: viewH, transform: mirrored ? "scaleX(-1)" : "none" }}>
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>

      {phase === "starting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center">
          <div className="w-9 h-9 rounded-full border-2 border-lime-400/30 border-t-lime-400 animate-spin" />
          <p className="text-base font-semibold">Starting your camera…</p>
          <p className="text-[12px] text-zinc-400">The first time, it also loads a 20 MB pose model.</p>
          {slowLoad && <p className="text-[12px] text-amber-200 max-w-xs">Still loading. Your connection looks slow; this only takes long the first time.</p>}
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center">
          <Camera className="w-9 h-9 text-zinc-500" />
          <p className="text-[15px] text-zinc-200 max-w-xs">{cameraErrorMessage(error)}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => start(facing)} className="px-5 py-2.5 rounded-xl bg-lime-400 text-black font-bold text-sm">Try again</button>
            <button type="button" onClick={onExit} className="px-5 py-2.5 rounded-xl border border-zinc-700 text-sm">Back</button>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
