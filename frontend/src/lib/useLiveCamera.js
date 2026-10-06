import { useCallback, useEffect, useRef, useState } from "react";
import { startLivePose, resetLivePose } from "@/ai/livePose";
import { cancelCue } from "@/lib/speakCue";
import { track } from "@/lib/analytics";
import { deviceKind } from "@/lib/frameSource";

/**
 * useLiveCamera — the camera + live pose session behind a full-screen practice
 * screen: open the camera (or a same-site sample clip standing in for it), load
 * the pose model with a slow-link hint and a give-up, run it on every frame,
 * keep the screen awake, and release everything on the way out.
 *
 * Same behaviour as LivePractice's own session code (which this was lifted
 * from), for screens that only differ in what they do with each frame.
 *
 * @param {object} o
 * @param {string|null} o.clipSrc  a same-site video to practise along with instead of the camera
 * @param {number} o.clipRate
 * @param {"user"|"environment"} o.facing  initial camera
 * @param {(frame: object|null) => void} o.onFrame  called for every pose frame (latest callback is used)
 * @param {string} o.trackName  analytics event prefix, e.g. "lift_practice"
 * @param {object} o.trackProps  extra analytics properties
 */
export function useLiveCamera({ clipSrc = null, clipRate = 1, facing: facingProp = "user", onFrame, trackName = "practice", trackProps = {} }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const streamRef = useRef(null);
  const engineRef = useRef(null);
  const wakeRef = useRef(null);
  const aliveRef = useRef(true);
  const timeoutsRef = useRef(0);
  const facingRef = useRef(facingProp);
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);

  const [phase, setPhase] = useState("starting"); // starting | live | stopped | error
  const [error, setError] = useState(null);
  const [facing, setFacing] = useState(facingProp);
  const [slowLoad, setSlowLoad] = useState(false);
  const [box, setBox] = useState({ w: 320, h: 480 });
  const [aspect, setAspect] = useState(9 / 16);

  // layout: fit the picture into the space, canvas at device resolution
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const fit = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const viewW = Math.max(1, Math.min(box.w, box.h * aspect));
  const viewH = viewW / aspect;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(viewW * dpr);
    c.height = Math.round(viewH * dpr);
  }, [viewW, viewH]);

  const stop = useCallback(() => {
    try { engineRef.current?.stop(); } catch { /* noop */ }
    engineRef.current = null;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    streamRef.current = null;
    try { wakeRef.current?.release?.(); } catch { /* noop */ }
    wakeRef.current = null;
    cancelCue();
  }, []);

  const start = useCallback(async (face) => {
    stop();
    setError(null);
    setPhase("starting");
    facingRef.current = face;
    setSlowLoad(false);
    // The pose model is ~20 MB from a CDN. Say so if it's slow; give up after 150 s with a way to
    // retry. The first retry rejoins the SAME download; only a second consecutive timeout starts fresh.
    const slowTimer = setTimeout(() => setSlowLoad(true), 12000);
    try {
      const v = videoRef.current;
      if (clipSrc) {
        v.srcObject = null;
        v.src = clipSrc;
        v.muted = true;
        v.playbackRate = clipRate;
        await v.play();
      } else {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("no-camera-api"), { name: "NotSupportedError" });
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: face }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false,
          });
        } catch (e) {
          if (e?.name === "OverconstrainedError") stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          else throw e;
        }
        streamRef.current = stream;
        v.srcObject = stream;
        v.muted = true;
        await v.play();
      }
      setAspect((v.videoWidth || 9) / (v.videoHeight || 16));
      try { wakeRef.current = await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
      const enginePromise = startLivePose({
        video: v,
        onFrame: (f) => onFrameRef.current?.(f),
        onError: (e) => { setError(e); setPhase("error"); track(`${trackName}_error`, { reason: String(e?.message || e).slice(0, 80), device: deviceKind() }); },
      });
      let giveUp = 0;
      const timeout = new Promise((_, reject) => {
        giveUp = setTimeout(() => reject(Object.assign(new Error("model-timeout"), { name: "ModelTimeout" })), 150000);
      });
      try {
        engineRef.current = await Promise.race([enginePromise, timeout]);
      } catch (e) {
        enginePromise.then((eng) => eng.stop()).catch(() => {});
        if (e?.name === "ModelTimeout" && ++timeoutsRef.current >= 2) { resetLivePose(); timeoutsRef.current = 0; }
        throw e;
      } finally {
        clearTimeout(giveUp);
      }
      timeoutsRef.current = 0;
      if (!aliveRef.current) { stop(); return; } // closed while loading
      setPhase("live");
    } catch (e) {
      stop();
      setError(e);
      setPhase("error");
      track(`${trackName}_error`, { reason: e?.name || String(e?.message || e).slice(0, 80), device: deviceKind() });
    } finally {
      clearTimeout(slowTimer);
      setSlowLoad(false);
    }
  }, [stop, clipSrc, clipRate, trackName]);

  useEffect(() => {
    aliveRef.current = true;
    track(`${trackName}_started`, { facing: facingProp, device: deviceKind(), ...trackProps });
    start(facingProp);
    const onVis = async () => {
      if (document.visibilityState === "visible" && streamRef.current && !wakeRef.current) {
        try { wakeRef.current = await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { aliveRef.current = false; document.removeEventListener("visibilitychange", onVis); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = useCallback(() => {
    const next = facingRef.current === "user" ? "environment" : "user";
    setFacing(next);
    start(next);
  }, [start]);

  return { videoRef, canvasRef, boxRef, engineRef, phase, setPhase, error, slowLoad, facing, flip, start, stop, viewW, viewH };
}

export function cameraErrorMessage(e) {
  const n = e?.name || "";
  if (n === "NotAllowedError" || n === "SecurityError") return "Camera access is blocked. Allow the camera for this site in your browser's settings, then try again.";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "We couldn't find a camera on this device.";
  if (n === "NotReadableError") return "Another app is using the camera. Close it and try again.";
  if (n === "ModelTimeout") return "The pose model didn't finish loading. Check your connection and try again.";
  if (n === "NotSupportedError") return "This browser can't open the camera here. Try Chrome or Safari over a secure (https) connection.";
  const m = String(e?.message || e || "");
  if (/activeTexture|webgl|WebGL|GL context/.test(m)) return "This browser can't run the live pose model because graphics acceleration is off. Try Chrome or Safari with hardware acceleration on.";
  return "Couldn't start live practice on this device. Try again, or use Chrome or Safari.";
}
