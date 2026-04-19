/**
 * @module reelComposer
 * Compose a polished highlight reel in the browser:
 *   - Title card (1.5s opening with username + date)
 *   - Cross-fade transitions (0.4s alpha blend) between clips
 *   - Per-clip text overlay (SHOT N · type) + athlyticai watermark
 *   - Optional background music mixed with original audio
 *   - Records to webm/mp4 via MediaRecorder + canvas captureStream
 *
 * Approach: two hidden <video> elements — videoA holds the current clip,
 * videoB holds the next clip. During the overlap window we draw both
 * frames with complementary alpha. Music + both audio tracks are mixed
 * via WebAudio into a MediaStreamDestination and added to the canvas
 * stream so the recording has clean audio.
 */

const TITLE_DURATION = 1.5;       // seconds of opening title card
const OUTRO_DURATION = 0.5;       // closing fade
const CROSSFADE = 0.4;            // overlap between clips
const FPS = 30;

const MUSIC_PATH = "/audio/highlights-music.mp3"; // drop a file here to enable

const BRAND = "athlyticai.com";

/**
 * @param {Object} opts
 * @param {File}   opts.file         original video file
 * @param {Object[]} opts.moments    [{start_time, end_time, type, ...}, ...]
 * @param {string} [opts.title]       title text (default: "Highlights")
 * @param {string} [opts.subtitle]    subtitle (default: today's date)
 * @param {boolean} [opts.addMusic]   try to mix bundled music
 * @param {(p:{percent:number,message:string})=>void} [opts.onProgress]
 * @returns {Promise<Blob>} the recorded reel
 */
export async function composeReel(opts) {
  const {
    file,
    moments,
    title = "Highlights",
    subtitle = new Date().toLocaleDateString(),
    addMusic = false,
    onProgress,
  } = opts;

  if (!moments?.length) throw new Error("No highlight moments provided");

  // Sort + sanity-check moments
  const clips = [...moments]
    .map((m) => ({
      start: Math.max(0, m.start_time),
      end: Math.max(m.start_time + 0.5, m.end_time),
      type: m.type || "shot",
      score: m.score || 0,
    }))
    .sort((a, b) => a.start - b.start);

  // Two video elements pointing at the same source so we can cross-fade.
  const objectUrl = URL.createObjectURL(file);
  const videoA = makeHiddenVideo(objectUrl);
  const videoB = makeHiddenVideo(objectUrl);

  await Promise.all([waitMeta(videoA), waitMeta(videoB)]);
  const W = videoA.videoWidth || 1280;
  const H = videoA.videoHeight || 720;

  // Canvas + recorder
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const stream = canvas.captureStream(FPS);

  // ─── Audio setup ──────────────────────────────────────────────
  // Mix: video original audio + optional bundled music. WebAudio routes
  // both to a MediaStreamDestination whose track we add to the canvas
  // stream so MediaRecorder picks up the audio.
  let audioCtx = null;
  let musicEl = null;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();

    // Original audio from videoA — use only A as the audio source so we
    // don't get phasing during crossfades. Lower its gain to make room
    // for music.
    const srcA = audioCtx.createMediaElementSource(videoA);
    const videoGain = audioCtx.createGain();
    videoGain.gain.value = addMusic ? 0.4 : 1.0;
    srcA.connect(videoGain);
    videoGain.connect(dest);
    videoGain.connect(audioCtx.destination); // also play live so user hears it

    if (addMusic) {
      musicEl = await tryLoadMusic();
      if (musicEl) {
        const srcM = audioCtx.createMediaElementSource(musicEl);
        const musicGain = audioCtx.createGain();
        musicGain.gain.value = 0.6;
        srcM.connect(musicGain);
        musicGain.connect(dest);
        musicGain.connect(audioCtx.destination);
      }
    }

    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  } catch (e) {
    // Audio failed (e.g. cross-origin) — proceed silent
    console.warn("audio mix failed:", e);
  }

  const mimeType =
    MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" :
    MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" :
    MediaRecorder.isTypeSupported("video/webm") ? "video/webm" :
    "video/mp4";

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 3_500_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const recDone = new Promise((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType })); });

  // ─── Recording timeline ──────────────────────────────────────
  const totalDuration =
    TITLE_DURATION +
    clips.reduce((s, c) => s + (c.end - c.start), 0) -
    Math.max(0, (clips.length - 1) * CROSSFADE) +  // each crossfade saves CROSSFADE seconds
    OUTRO_DURATION;

  // Schedule per-clip absolute start times in the OUTPUT timeline
  let cursor = TITLE_DURATION;
  const sched = clips.map((c, i) => {
    const dur = c.end - c.start;
    const outStart = cursor;
    cursor += dur - (i < clips.length - 1 ? CROSSFADE : 0);
    return {
      ...c,
      duration: dur,
      outStart,
      outEnd: outStart + dur,
      idx: i,
    };
  });

  // Pre-position both videos
  videoA.muted = false;
  videoA.currentTime = sched[0].start;
  videoB.muted = true;       // we never use B's audio (avoid phase issues)
  videoB.currentTime = sched[0].start;
  await Promise.all([waitSeek(videoA), waitSeek(videoB)]);

  recorder.start(100);
  if (musicEl) musicEl.play().catch(() => {});

  const tStart = performance.now();

  let nextClipIdx = 1;
  let videoBLoaded = false;

  // Master draw loop
  let lastDrawnT = -1;
  await new Promise((finish) => {
    const tick = () => {
      const t = (performance.now() - tStart) / 1000;
      if (t >= totalDuration) {
        videoA.pause();
        videoB.pause();
        recorder.stop();
        if (musicEl) musicEl.pause();
        finish();
        return;
      }

      // Title card
      if (t < TITLE_DURATION) {
        drawTitleCard(ctx, W, H, title, subtitle, t);
        requestAnimationFrame(tick);
        return;
      }

      // Find which clip(s) we're in
      const active = sched.filter((c) => t >= c.outStart && t < c.outEnd);
      if (active.length === 0) {
        // outro
        drawOutro(ctx, W, H, totalDuration - t);
        requestAnimationFrame(tick);
        return;
      }

      const cur = active[0];
      const next = sched[cur.idx + 1];
      const inFade = next && (cur.outEnd - t) <= CROSSFADE;

      // Where in the source video are we?
      const sourceTimeA = cur.start + (t - cur.outStart);
      videoA.currentTime = sourceTimeA;
      if (!videoA.paused === false) videoA.play().catch(() => {});

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(videoA, 0, 0, W, H);

      // Crossfade with next clip
      if (inFade && next) {
        const fadeProgress = (CROSSFADE - (cur.outEnd - t)) / CROSSFADE; // 0..1
        // Pre-seek B to next clip's start when we enter the fade
        if (!videoBLoaded || Math.abs(videoB.currentTime - next.start) > 0.5) {
          videoB.currentTime = next.start;
          videoB.play().catch(() => {});
          videoBLoaded = true;
        }
        ctx.globalAlpha = fadeProgress;
        ctx.drawImage(videoB, 0, 0, W, H);
        ctx.globalAlpha = 1.0;
      }

      // Once a clip finishes, swap A and B refs by re-seeking A to the
      // next clip's source position. We do this by detecting the
      // boundary on the next tick.
      if (next && t >= next.outStart && t > cur.outEnd - 0.05) {
        // Reposition A to the new current clip
        videoA.currentTime = next.start + (t - next.outStart);
        videoBLoaded = false;
        nextClipIdx = next.idx + 1;
      }

      // Text overlay
      drawOverlay(ctx, W, H, cur, sched.length);

      lastDrawnT = t;
      onProgress?.({ percent: Math.round((t / totalDuration) * 100), message: `Composing ${Math.floor(t)}s/${Math.floor(totalDuration)}s` });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const blob = await recDone;
  URL.revokeObjectURL(objectUrl);
  if (audioCtx) try { await audioCtx.close(); } catch {}
  return blob;
}

// ─── helpers ─────────────────────────────────────────────────────

function makeHiddenVideo(src) {
  const v = document.createElement("video");
  v.src = src;
  v.crossOrigin = "anonymous";
  v.playsInline = true;
  v.preload = "auto";
  v.muted = true;
  v.style.display = "none";
  document.body.appendChild(v);
  return v;
}

function waitMeta(v) {
  return new Promise((resolve) => {
    if (v.readyState >= 1) resolve();
    else v.onloadedmetadata = () => resolve();
  });
}

function waitSeek(v) {
  return new Promise((resolve) => {
    const h = () => { v.removeEventListener("seeked", h); resolve(); };
    v.addEventListener("seeked", h);
  });
}

async function tryLoadMusic() {
  try {
    const r = await fetch(MUSIC_PATH, { method: "HEAD" });
    if (!r.ok) return null;
  } catch {
    return null;
  }
  const a = document.createElement("audio");
  a.src = MUSIC_PATH;
  a.crossOrigin = "anonymous";
  a.loop = true;
  a.volume = 1.0; // gain controlled in WebAudio
  a.style.display = "none";
  document.body.appendChild(a);
  await new Promise((resolve) => {
    if (a.readyState >= 2) resolve();
    else a.oncanplay = () => resolve();
    setTimeout(resolve, 1500); // bail if it doesn't load
  });
  return a;
}

// ─── overlays ────────────────────────────────────────────────────

function drawTitleCard(ctx, W, H, title, subtitle, t) {
  // Fade-in feel
  const alpha = Math.min(1, t / 0.4);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  // Lime accent bar
  ctx.fillStyle = "rgba(190, 242, 100, " + alpha + ")";
  ctx.fillRect(W * 0.12, H * 0.42, W * 0.04, H * 0.18);

  // Title
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.font = `bold ${Math.round(H * 0.09)}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title.toUpperCase(), W * 0.18, H * 0.52);

  // Subtitle
  ctx.fillStyle = `rgba(180,180,180,${alpha * 0.8})`;
  ctx.font = `${Math.round(H * 0.035)}px Inter, system-ui, sans-serif`;
  ctx.fillText(subtitle, W * 0.18, H * 0.58);

  // Footer brand
  ctx.fillStyle = `rgba(190, 242, 100, ${alpha * 0.7})`;
  ctx.font = `${Math.round(H * 0.025)}px Inter, system-ui, sans-serif`;
  ctx.fillText(BRAND, W * 0.18, H * 0.65);
}

function drawOutro(ctx, W, H, remaining) {
  const alpha = Math.min(1, remaining / OUTRO_DURATION);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(190, 242, 100, ${alpha})`;
  ctx.font = `bold ${Math.round(H * 0.05)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(BRAND, W / 2, H / 2);
  ctx.textAlign = "left";
}

function drawOverlay(ctx, W, H, clip, total) {
  // Top-left badge: SHOT N · TYPE
  const padX = Math.round(W * 0.025);
  const padY = Math.round(H * 0.025);
  const badgeH = Math.round(H * 0.07);
  const labelText = `SHOT ${clip.idx + 1}/${total} · ${clip.type.toUpperCase().replace(/_/g, " ")}`;
  ctx.font = `600 ${Math.round(H * 0.028)}px Inter, system-ui, sans-serif`;
  const textW = ctx.measureText(labelText).width;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(padX, padY, textW + padX * 2, badgeH);
  ctx.fillStyle = "#bef264"; // lime-300
  ctx.fillRect(padX, padY, 4, badgeH);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(labelText, padX * 2 + 4, padY + badgeH / 2);

  // Bottom-right watermark
  ctx.font = `500 ${Math.round(H * 0.022)}px Inter, system-ui, sans-serif`;
  const brandW = ctx.measureText(BRAND).width;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(W - brandW - padX * 2, H - badgeH * 0.7 - padY, brandW + padX * 2, badgeH * 0.7);
  ctx.fillStyle = "rgba(190,242,100,0.95)";
  ctx.fillText(BRAND, W - brandW - padX, H - padY - badgeH * 0.35);
  ctx.textBaseline = "alphabetic";
}
