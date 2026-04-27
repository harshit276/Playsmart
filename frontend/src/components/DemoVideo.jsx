/**
 * DemoVideo — embeds a YouTube demo if REACT_APP_DEMO_VIDEO_ID is set,
 * otherwise shows a clean placeholder. Reuses the iframe pattern from
 * TrainingPage's drill cards.
 *
 * Set the env var on Vercel to a real video ID once you have one — no
 * code change needed.
 */
import { Play } from "lucide-react";

const FEATURES = [
  { emoji: "🎯", text: "Shot detection + technique consistency" },
  { emoji: "🏋️", text: "Personalized weekly training plan" },
  { emoji: "🛒", text: "Equipment picks for your level + budget" },
  { emoji: "👥", text: "Find or host games near you" },
  { emoji: "🪙", text: "Earn tokens — refer friends, host games" },
];

export default function DemoVideo() {
  const videoId = (typeof process !== "undefined"
    && process?.env?.REACT_APP_DEMO_VIDEO_ID
    || "").trim();

  return (
    <section id="demo" className="relative py-12 sm:py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold mb-2">See it in action</p>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl uppercase tracking-tight text-white">
            60 seconds — what AthlyticAI does
          </h2>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 items-center">
          <div className="lg:col-span-2 relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-video">
            {videoId ? (
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
                title="AthlyticAI demo"
                className="w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-lime-500/10 via-zinc-900 to-zinc-950 text-center px-6">
                <div className="w-16 h-16 rounded-full bg-lime-400/15 border border-lime-400/40 flex items-center justify-center mb-3">
                  <Play className="w-7 h-7 text-lime-400 ml-1" fill="currentColor" />
                </div>
                <p className="text-white font-bold text-lg mb-1">Demo video coming soon</p>
                <p className="text-zinc-400 text-sm max-w-md">
                  In the meantime — try the app yourself with a 30-second clip. Free signup gets you 3 analyses on us.
                </p>
              </div>
            )}
          </div>

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
    </section>
  );
}
