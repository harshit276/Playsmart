/**
 * DemoPhone — the walkthrough reel inside a phone mockup.
 *
 * Portrait 9:16 clip, so it lives in a phone frame. CLICK-TO-PLAY (poster +
 * play button), not autoplay: the reel is ~3 min with narration, so we neither
 * force a multi-MB download on every landing visitor nor mute the audio that
 * carries the point. On tap it loads and plays with sound + native controls.
 *
 * Rendered in the hero (right column) so the demo is visible the moment the
 * home page opens. Swappable: drop a new portrait mp4 at
 * src/assets/demo/formanti-demo.mp4 (+ poster jpg) — keep the .vercelignore
 * negation for the mp4 so Vercel bundles it.
 */
import { useState } from "react";
import { Play } from "lucide-react";
import demoReel from "@/assets/demo/formanti-demo-short.mp4";
import demoPoster from "@/assets/demo/formanti-demo-short-poster.jpg";

export default function DemoPhone({ className = "" }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className={`relative w-[180px] sm:w-[220px] lg:w-[250px] shrink-0 ${className}`}>
      {/* bezel */}
      <div className="relative rounded-[2.4rem] border-[6px] border-zinc-800 bg-black shadow-2xl shadow-black/60 overflow-hidden aspect-[9/19]">
        {/* notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 w-24 h-5 bg-zinc-800 rounded-b-2xl" />
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
              alt="Formanti walkthrough preview"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <span className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-16 h-16 rounded-full bg-lime-400/90 group-hover:bg-lime-400 flex items-center justify-center shadow-lg shadow-lime-400/30 transition-all group-hover:scale-105">
                <Play className="w-7 h-7 text-black ml-1" fill="currentColor" />
              </span>
            </span>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-wider font-bold text-white/90 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
              Tap to watch
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
