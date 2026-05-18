import { useEffect, useState } from "react";
import { X, Activity, Loader2 } from "lucide-react";


const STATUS_TONE = {
  good: { label: "Good", bg: "bg-lime-400/15", text: "text-lime-300", dot: "bg-lime-400" },
  okay: { label: "Close", bg: "bg-amber-400/15", text: "text-amber-300", dot: "bg-amber-400" },
  off:  { label: "Off",  bg: "bg-red-400/15", text: "text-red-300", dot: "bg-red-400" },
  neutral: { label: "—", bg: "bg-zinc-800", text: "text-zinc-400", dot: "bg-zinc-500" },
};

const JOINT_LABEL = {
  elbow: "Elbow angle",
  shoulder: "Shoulder elevation",
  knee: "Knee bend",
};


export default function PoseOverlayModal({ open, onClose, thumbnail, sport, shotType, shotName }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !thumbnail) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    (async () => {
      try {
        const mod = await import("@/ai/poseOverlay");
        const r = await mod.analyzePoseOnFrame(thumbnail, sport, shotType, { maxDim: 600 });
        if (cancelled) return;
        if (r?.error) setError(r.error);
        else setResult(r);
      } catch (e) {
        if (!cancelled) setError(e.message || "overlay failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, thumbnail, sport, shotType]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm"
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 max-w-3xl w-full max-h-[92vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold">Pose overlay — contact frame</p>
            <h3 className="font-heading font-bold text-lg text-white capitalize">
              Your form: {shotName || shotType?.replace(/_/g, " ")}
            </h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="bg-zinc-800/40 rounded-xl p-10 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-lime-400 animate-spin" />
            <p className="text-xs text-zinc-400">Analyzing your form...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-400/5 border border-red-400/30 rounded-xl p-4 text-center">
            <p className="text-sm text-red-300 font-medium mb-1">Couldn't read pose from this frame</p>
            <p className="text-[11px] text-zinc-500">
              {error === "no-pose-detected"
                ? "The body wasn't clearly visible at the contact moment. Try a clearer side-angle clip."
                : "Try again, or pick a different shot."}
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Annotated image */}
              <div className="bg-black rounded-xl overflow-hidden">
                <img src={result.annotatedDataUrl} alt="Pose overlay" className="w-full h-auto block" />
                <div className="px-3 py-2 bg-zinc-800/50 flex items-center gap-2 flex-wrap">
                  <Activity className="w-3 h-3 text-lime-400" />
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                    Skeleton on your shot
                  </p>
                  <span className="text-[10px] text-zinc-500 ml-auto">
                    Tracking {result.racketSide} arm
                  </span>
                </div>
              </div>

              {/* Measurements */}
              <div className="space-y-2">
                {!result.hasIdealRange && (
                  <p className="text-[11px] text-zinc-500 italic mb-1">
                    We don't have an ideal-angle reference for this shot type yet — measurements shown without grading.
                  </p>
                )}
                {result.measurements.length === 0 ? (
                  <p className="text-xs text-zinc-500">Pose detected but no measurable joints in frame.</p>
                ) : result.measurements.map((m) => {
                  const tone = STATUS_TONE[m.status] || STATUS_TONE.neutral;
                  return (
                    <div key={m.joint} className="bg-zinc-800/40 border border-zinc-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-white">{JOINT_LABEL[m.joint] || m.joint}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${tone.bg} ${tone.text} font-bold uppercase tracking-wider`}>
                          {tone.label}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-2xl font-heading font-bold text-white">{m.value}°</span>
                        {m.ideal && (
                          <span className="text-[11px] text-zinc-500">
                            ideal {m.ideal.min}–{m.ideal.max}° (target {m.ideal.target}°)
                          </span>
                        )}
                      </div>
                      {/* Range bar */}
                      {m.ideal && (
                        <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1">
                          <div
                            className="absolute h-full bg-lime-400/30"
                            style={{
                              left: `${Math.max(0, Math.min(100, (m.ideal.min / 180) * 100))}%`,
                              width: `${Math.max(0, Math.min(100, ((m.ideal.max - m.ideal.min) / 180) * 100))}%`,
                            }}
                          />
                          <div
                            className={`absolute w-1 h-full ${tone.dot}`}
                            style={{ left: `${Math.max(0, Math.min(100, (m.value / 180) * 100))}%` }}
                          />
                        </div>
                      )}
                      {m.ideal?.why && (
                        <p className="text-[11px] text-zinc-400 leading-snug">{m.ideal.why}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">How to read this</p>
              <ul className="text-[11px] text-zinc-400 space-y-1 leading-relaxed">
                <li><span className="inline-block w-2 h-2 rounded-full bg-lime-400 mr-1"></span><span className="text-lime-300 font-medium">Green</span> joints are inside the ideal range for this shot.</li>
                <li><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"></span><span className="text-amber-300 font-medium">Amber</span> joints are within 15° of the range — close, not critical.</li>
                <li><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1"></span><span className="text-red-300 font-medium">Red</span> joints are off by more than 15° — focus here for the biggest gain.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
