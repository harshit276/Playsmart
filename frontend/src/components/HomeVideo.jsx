import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { track } from "@/lib/analytics";

/**
 * HomeVideo — the 25-second Formanti film, in the shape that fits the screen.
 *
 * One film, two cuts: 16:9 for computers and tablets (md and up), 9:16 for phones. The right cut is
 * chosen from the viewport and follows it if the window is resized or the device is rotated.
 *
 * Built so it costs nothing until it is wanted:
 *   - no video bytes until the player is near the screen (the poster is all that loads with the page);
 *   - it autoplays muted, looped, inline, only while on screen, and pauses when scrolled away;
 *   - it does not autoplay at all for people who asked for reduced motion or turned on data saver:
 *     they see the poster and a play button;
 *   - tapping it the first time turns the sound on from the start; after that a tap plays and pauses.
 *
 * The files live in public/videos (see .vercelignore and .gitignore: *.mp4 is ignored by default and these
 * are the exceptions). Names carry a version: bump -v1 when the film changes so caches pick up the new one.
 */

const CUTS = {
  wide: { src: "/videos/formanti-teaser-16x9-v1.mp4", poster: "/videos/formanti-teaser-16x9-v1.jpg", label: "16x9" },
  tall: { src: "/videos/formanti-teaser-9x16-v1.mp4", poster: "/videos/formanti-teaser-9x16-v1.jpg", label: "9x16" },
};

function useWide() {
  const query = "(min-width: 768px)";
  const [wide, setWide] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : true));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, []);
  return wide;
}

const quiet = () => {
  try {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const saver = navigator.connection?.saveData === true;
    return !!(reduce || saver);
  } catch { return false; }
};

export default function HomeVideo({ className = "" }) {
  const wide = useWide();
  const cut = wide ? CUTS.wide : CUTS.tall;
  const boxRef = useRef(null);
  const videoRef = useRef(null);
  const trackedPlay = useRef(false);
  const [near, setNear] = useState(false); // close enough to start fetching
  const [onScreen, setOnScreen] = useState(false); // enough of it visible to play
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [blocked, setBlocked] = useState(false); // the browser refused to autoplay: show the play button

  // when the player gets near, then when it is mostly visible
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof IntersectionObserver === "undefined") { setNear(true); setOnScreen(true); return undefined; }
    const ioNear = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { rootMargin: "200px 0px" });
    const ioSee = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting && e.intersectionRatio >= 0.4), { threshold: [0, 0.4, 0.7] });
    ioNear.observe(box); ioSee.observe(box);
    return () => { ioNear.disconnect(); ioSee.disconnect(); };
  }, []);

  // the muted flag is a property, not just an attribute
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted, cut.src]);

  // autoplay while it is on screen; pause when it is not
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !near) return;
    if (onScreen && !quiet()) {
      const p = v.play();
      if (p && p.catch) p.catch(() => setBlocked(true));
    } else if (!onScreen) {
      v.pause();
    }
  }, [onScreen, near, cut.src]);

  const onPlay = useCallback(() => {
    setPlaying(true); setBlocked(false);
    if (!trackedPlay.current) { trackedPlay.current = true; track("home_video_play", { cut: cut.label, muted: videoRef.current?.muted !== false }); }
  }, [cut.label]);

  const toggleSound = useCallback((e) => {
    e?.stopPropagation();
    const v = videoRef.current; if (!v) return;
    const next = !v.muted;
    v.muted = next; setMuted(next);
    if (!next) { track("home_video_sound", { cut: cut.label }); if (v.paused) v.play().catch(() => {}); }
  }, [cut.label]);

  // first tap while muted: sound on, from the start. Afterwards: play / pause.
  const onTap = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.muted) { v.currentTime = 0; v.muted = false; setMuted(false); v.play().catch(() => {}); track("home_video_sound", { cut: cut.label, by: "tap" }); return; }
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, [cut.label]);

  const fullscreen = useCallback((e) => {
    e.stopPropagation();
    const v = videoRef.current; if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iPhone Safari
  }, []);

  const frame = wide
    ? { className: "w-full max-w-[1000px] aspect-video", style: undefined }
    : { className: "mx-auto", style: { height: "min(78svh, 640px)", aspectRatio: "9 / 16" } };

  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none absolute -inset-6 sm:-inset-10 bg-lime-400/10 blur-3xl rounded-full" aria-hidden="true" />
      <div
        ref={boxRef}
        className={`relative mx-auto overflow-hidden rounded-3xl border border-zinc-800 bg-black shadow-2xl shadow-black/60 ${frame.className}`}
        style={frame.style}
        data-testid="home-video"
      >
        <video
          key={cut.src}
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain bg-black cursor-pointer"
          src={near ? cut.src : undefined}
          poster={cut.poster}
          preload={near ? "metadata" : "none"}
          muted
          loop
          playsInline
          aria-label="Formanti in 25 seconds: film a rally, see the breakdown, your pose in 3D, practise the fix"
          onClick={onTap}
          onPlay={onPlay}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }}
        />

        {/* paused (or autoplay refused): a clear play button */}
        {!playing && (
          <button type="button" onClick={onTap} aria-label="Play the video"
            className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/0 transition-colors">
            <span className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-lime-400 text-black shadow-lg shadow-lime-400/30">
              <Play className="h-7 w-7 sm:h-9 sm:w-9 ml-1" fill="currentColor" aria-hidden="true" />
            </span>
          </button>
        )}

        {/* while it plays muted: say how to hear it */}
        {playing && muted && (
          <button type="button" onClick={toggleSound}
            className="absolute left-3 bottom-3 inline-flex items-center gap-1.5 min-h-11 rounded-full bg-black/70 px-3.5 text-[13px] font-bold text-white backdrop-blur-sm border border-white/15">
            <VolumeX className="h-4 w-4" aria-hidden="true" /> Tap for sound
          </button>
        )}

        <div className="absolute right-2.5 bottom-3 flex items-center gap-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); const v = videoRef.current; if (v) (v.paused ? v.play() : v.pause()); }} aria-label={playing ? "Pause" : "Play"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/65 text-white border border-white/15">
            {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4 ml-0.5" aria-hidden="true" />}
          </button>
          <button type="button" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Turn sound off"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/65 text-white border border-white/15">
            {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button type="button" onClick={fullscreen} aria-label="Full screen"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/65 text-white border border-white/15">
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10" aria-hidden="true"><div className="h-full bg-lime-400" style={{ width: `${progress * 100}%` }} /></div>
        {blocked && <span className="sr-only">Autoplay was blocked by your browser. Press play to watch.</span>}
      </div>
    </div>
  );
}
