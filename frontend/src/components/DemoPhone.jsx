/**
 * DemoPhone — the walkthrough reel in a clean device frame.
 *
 * IMPORTANT: the frame is aspect-[9/16] to MATCH the source clip (1080x1920).
 * It used to be 9/19, which made object-cover zoom and crop the video/poster —
 * that's what made the demo look "not fitting". Keep these in sync if the clip
 * is ever swapped.
 *
 * CLICK-TO-PLAY (poster + play button), not autoplay: the reel carries audio and
 * we don't want a multi-MB download on every landing visit. On tap it loads and
 * plays with sound + native controls.
 *
 * Swappable: drop a new portrait mp4 at src/assets/demo/formanti-demo-short.mp4
 * (+ poster jpg) — keep the .vercelignore negation for the mp4 so Vercel
 * bundles it.
 */
import { useState } from "react";
import { Play } from "lucide-react";
import demoReel from "@/assets/demo/formanti-demo-short.mp4";
import demoPoster from "@/assets/demo/formanti-demo-short-poster.jpg";

export default function DemoPhone({ className = "" }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className={`relative w-[185px] sm:w-[215px] lg:w-[265px] shrink-0 ${className}`}>
      {/* lime bloom behind the device so it lifts off the dark background */}
      <div className="pointer-events-none absolute -inset-6 bg-lime-400/15 blur-3xl rounded-full" />

      {/* device bezel */}
      <div className="relative rounded-[2rem] p-[5px] bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-900 shadow-2xl shadow-black/70 ring-1 ring-white/10">
        <div className="relative rounded-[1.7rem] overflow-hidden bg-black aspect-[9/16]">
          {playing ? (
            <video
              src={demoReel}
              poster={demoPoster}
              className="absolute inset-0 w-full h-full object-cover"
              controls
              autoPlay
              playsInline
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label="Play the Formanti walkthrough"
              className="absolute inset-0 w-full h-full group"
            >
              <img
                src={demoPoster}
                alt="A real Formanti analysis result — score, level and full report"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 group-hover:from-black/60 transition-colors" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-14 h-14 rounded-full bg-lime-400 flex items-center justify-center shadow-lg shadow-lime-400/40 transition-transform group-hover:scale-110 group-active:scale-95">
                  <Play className="w-6 h-6 text-black ml-0.5" fill="currentColor" />
                </span>
              </span>
              <span className="absolute bottom-3 inset-x-0 flex justify-center">
                <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-white/95 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1">
                  Watch it work · 25s
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
