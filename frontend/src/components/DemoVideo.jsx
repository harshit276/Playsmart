/**
 * DemoVideo — a real walkthrough reel shown inside a phone mockup.
 *
 * The reel is a 9:16 (portrait) clip, so it lives in a phone frame rather than
 * a letterboxed 16:9 box. It is CLICK-TO-PLAY (poster + play button), not
 * autoplay: the clip is ~3 min with narration, so we neither force a multi-MB
 * download on every landing visitor nor mute the audio that carries the point.
 * On tap it loads and plays with sound and native controls.
 *
 * Swappable: drop a new portrait mp4 at src/assets/demo/formanti-demo.mp4 (and
 * a poster jpg) — no other change needed. Keep the .vercelignore negation for
 * the mp4 so Vercel bundles it (see that file).
 */
import { useState } from "react";
import { Play } from "lucide-react";
import demoReel from "@/assets/demo/formanti-demo.mp4";
import demoPoster from "@/assets/demo/formanti-demo-poster.jpg";

const FEATURES = [
  { emoji: "🎯", text: "Shot detection + technique consistency" },
  { emoji: "🏋️", text: "Personalized weekly training plan" },
  { emoji: "🛒", text: "Equipment picks for your level + budget" },
  { emoji: "👥", text: "Find or host games near you" },
  { emoji: "🪙", text: "Earn tokens — refer friends, host games" },
];

export default function DemoVideo() {
  const [playing, setPlaying] = useState(false);

  return (
    <section id="demo" className="relative py-12 sm:py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold mb-2">See it in action</p>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl uppercase tracking-tight text-white">
            A quick walkthrough
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* Phone mockup holding the portrait reel */}
          <div className="flex justify-center">
            <div className="relative w-[240px] sm:w-[270px] shrink-0">
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
          </div>

          {/* What you're looking at */}
          <div>
            <h3 className="font-heading font-black text-2xl sm:text-3xl uppercase tracking-tight text-white leading-tight mb-4">
              Upload a clip.<br /><span className="text-lime-400">Get coached back.</span>
            </h3>
            <ul className="space-y-3">
              {FEATURES.map((f) => (
                <li key={f.text} className="flex items-start gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
                  <span className="text-2xl shrink-0 leading-none">{f.emoji}</span>
                  <span className="text-sm text-zinc-200 leading-snug">{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
