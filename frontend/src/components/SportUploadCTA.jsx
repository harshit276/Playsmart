/**
 * SportUploadCTA — the "just do the thing" box on every sport landing page.
 *
 * These pages are where organic search actually lands (they rank for "AI
 * cricket coach", "basketball shooting form analysis"), but they read like
 * brochures: several links, no obvious single action. A visitor who arrived
 * wanting their own clip analysed had to work out that /analyze was the place.
 *
 * So: one unmistakable drop target. Dropping or picking a file here hands the
 * clip straight to /analyze via IndexedDB, so the visitor does not repeat
 * themselves — finding a clip on a phone is the highest-friction step in the
 * funnel and must only happen once.
 */
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";

// Must match AnalyzePage's PENDING_SIGNUP_VIDEO_KEY — that page looks here for
// a clip chosen elsewhere.
const HANDOFF_KEY = "analysis_pending_signup";

export default function SportUploadCTA({ sport = "", label = "" }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const sportName = label || (sport || "").replace(/[-_]/g, " ");

  const handOff = useCallback(async (f) => {
    if (!f) return;
    if (!f.type?.startsWith("video/")) {
      toast.error("That's not a video file — pick a clip of you playing.");
      return;
    }
    try {
      const vs = await import("@/lib/videoStore");
      await vs.saveVideo(f, 2 * 60 * 60 * 1000, HANDOFF_KEY);
    } catch {
      // Storage blocked (private mode, quota). Still send them to /analyze —
      // they just pick the file once more there.
    }
    navigate(`/analyze${sport ? `?sport=${encodeURIComponent(sport)}` : ""}`);
  }, [navigate, sport]);

  return (
    <section className="py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handOff(e.dataTransfer?.files?.[0]);
          }}
          className={`group cursor-pointer rounded-3xl border-2 border-dashed p-8 sm:p-10 text-center transition-all ${
            dragging
              ? "border-lime-400 bg-lime-400/10"
              : "border-zinc-700 bg-zinc-900/50 hover:border-lime-400/60 hover:bg-zinc-900"
          }`}
        >
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-lime-400/15 border border-lime-400/30 flex items-center justify-center">
            <UploadCloud className="w-7 h-7 text-lime-400" />
          </div>
          <h2 className="font-heading font-black text-2xl sm:text-3xl uppercase tracking-tight text-white mb-2">
            Analyse your {sportName} clip
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base mb-5 max-w-md mx-auto">
            Drop a 10–30 second video here — or tap to choose one. You'll get a
            shot-by-shot breakdown, posture read and a coach's verdict.
          </p>
          <span className="inline-flex items-center gap-2 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-full px-6 py-3 text-sm transition-colors">
            Choose a video <ArrowRight className="w-4 h-4" />
          </span>
          {/* Say the account is coming BEFORE they invest, not after. A signup
              sprung on someone who has already waited through an upload reads
              as a bait-and-switch. */}
          <p className="text-[11px] text-zinc-500 mt-4">
            Your first analysis is free · free account needed to see results
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => handOff(e.target.files?.[0])}
          />
        </div>
      </div>
    </section>
  );
}
