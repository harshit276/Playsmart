import { useEffect, useRef, useState } from "react";
import { Loader2, Activity } from "lucide-react";


/**
 * Phase 1 of pose-corrected video. Looped canvas player showing:
 *   - User's actual pose skeleton drawn on every frame.
 *   - A GREEN "ideal-ghost" skeleton overlaid at the contact frame
 *     showing where the user's joints SHOULD be (computed via forward
 *     kinematics from the user's own bone lengths + curated target
 *     angles — so it looks like THEM with corrected form, not a generic
 *     pro).
 *
 * Honest scope:
 *   - No AI video generation. Frames come from the user's actual video.
 *   - Ghost only renders at the contact frame because that's the only
 *     moment we have curated ideal angles for. We deliberately don't
 *     invent ideal motion for the windup or follow-through.
 *   - One-time pose-extraction cost ~1-3s, then the loop is canvas-only.
 */
export default function FormCoachReplay({ videoFile, timestamp, sport, shotType, className }) {
  const canvasRef = useRef(null);
  const [replay, setReplay] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Build the frame stack once whenever the inputs change.
  useEffect(() => {
    let cancelled = false;
    if (!videoFile || typeof timestamp !== "number") return;
    setReplay(null); setError(null); setLoading(true);
    (async () => {
      try {
        const mod = await import("@/ai/formReplay");
        const r = await mod.extractFormReplay(videoFile, timestamp, sport, shotType, {
          framesPerSecond: 10, windowSec: 2.5, leadSec: 1.0, maxDim: 480,
        });
        if (!cancelled) setReplay(r);
      } catch (e) {
        if (!cancelled) setError(e.message || "failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [videoFile, timestamp, sport, shotType]);

  // Animation loop. Canvas intrinsic size tracks its DISPLAY size (so
  // it fills the 16:9 panel cleanly) and frames are letterboxed inside.
  // ResizeObserver keeps the canvas backing store in sync when the
  // parent flex container reflows.
  useEffect(() => {
    if (!replay || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const drawMod = import("@/ai/formReplay");

    // Pre-cache all frame Image objects so the draw loop is synchronous.
    // 25 frames × ~30 KB JPEG = ~750 KB total, fine for memory.
    const imgs = new Array(replay.frames.length);
    let loadedCount = 0;
    replay.frames.forEach((f, i) => {
      const img = new Image();
      img.onload = img.onerror = () => { loadedCount++; };
      img.src = f.dataUrl;
      imgs[i] = img;
    });

    // Track canvas display size so frames are letterboxed inside the
    // actual rendered box, not the video's intrinsic resolution.
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas);

    let cancelled = false;
    let frameIdx = 0;
    let lastSwap = performance.now();
    const FRAME_MS = 1000 / 10;
    const CONTACT_HOLD_MS = 600;

    const tick = async (now) => {
      if (cancelled) return;
      const f = replay.frames[frameIdx];
      const wait = f.isContact ? CONTACT_HOLD_MS : FRAME_MS;
      if (now - lastSwap >= wait) {
        frameIdx = (frameIdx + 1) % replay.frames.length;
        lastSwap = now;
      }
      const cur = replay.frames[frameIdx];
      const img = imgs[frameIdx];
      const mod = await drawMod;
      mod.drawFormFrame(ctx, cur, replay, {
        canvasW: canvas.width,
        canvasH: canvas.height,
        cachedImage: img && img.complete && img.naturalWidth > 0 ? img : null,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { cancelled = true; ro.disconnect(); };
  }, [replay]);

  if (!videoFile || typeof timestamp !== "number") return null;

  return (
    <div className={className || "relative w-full h-full"}>
      <canvas ref={canvasRef} className="w-full h-full block bg-black object-cover" />
      {loading && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 text-lime-400 animate-spin" />
          <p className="text-[11px] text-zinc-300">Generating form coach replay…</p>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center px-3">
          <p className="text-[11px] text-zinc-400 text-center">
            Couldn't read pose from this clip. Showing raw video on the YOU panel above.
          </p>
        </div>
      )}
      {/* Status pill on the contact frame */}
      {replay?.contactStatus && (
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          <div className="inline-flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded px-2 py-0.5">
            <Activity className="w-3 h-3 text-lime-400" />
            <span className="text-[9px] uppercase tracking-wider text-zinc-300 font-bold">
              Coach replay · {replay.racketSide} arm
            </span>
          </div>
        </div>
      )}
      {/* Legend in the bottom-right */}
      <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm rounded px-2 py-1">
        <p className="text-[9px] text-white leading-tight">
          <span className="text-white/90">━ Your pose</span><br/>
          <span className="text-lime-400">┄ Ideal (at contact)</span>
        </p>
      </div>
    </div>
  );
}
