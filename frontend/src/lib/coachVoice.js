/**
 * @module coachVoice
 * Plays the coach's pre-recorded lines (public/coach-voice/v1/<voice>/<id>.mp3, made from ai/coachPhrases by
 * tools/coach-voice) through the Web Audio API.
 *
 * Why recordings and not the phone's speech engine: they sound like a person (the phone's default voice is the
 * robotic part of the old coach), they start in a few milliseconds (a decoded buffer, no engine warm-up), they
 * behave the same on every phone, and they cost nothing per use. The phone's voice stays as the fallback for any
 * line without a recording, for people who pick "Phone voice", and for when a clip cannot be loaded in time.
 *
 * The AudioContext lives here and is shared with the tones in lib/speakCue (one context per page, resumed from the
 * Start tap, which iOS requires).
 */

const BASE = "/coach-voice/v1";
const VOICE_KEY = "formanti_coach_voice";
const MAX_WAIT_MS = 450; // a clip not ready within this long is skipped for the phone's voice rather than late
const GAP_S = 0.16; // pause between two clips said as one utterance

export const COACH_VOICES = [["f", "Female"], ["m", "Male"], ["device", "Phone"]];

let ctx = null;
let manifest = null;
let manifestP = null;
const buffers = new Map(); // "f:praise.generic.0" -> AudioBuffer | Promise<AudioBuffer|null>
let current = { sources: [], priority: 0, until: 0, token: 0 };

export function audioClipsSupported() {
  try { return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext) && typeof fetch === "function"; } catch { return false; }
}

export function ensureAudioContext() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
  } catch { /* no audio: the screen still coaches */ }
  return ctx;
}

export function getVoicePref() {
  try { const v = localStorage.getItem(VOICE_KEY); if (COACH_VOICES.some(([k]) => k === v)) return v; } catch { /* private mode */ }
  return "f";
}
export function setVoicePref(v) {
  try { localStorage.setItem(VOICE_KEY, v); } catch { /* private mode */ }
}

let allowed = true;
/** Turn the recordings off for a screen that has no recorded wording (the lift check), so one voice speaks throughout. */
export const allowClips = (yes) => { allowed = !!yes; };

/** The recorded voice in use ("f" | "m"), or null when the player chose the phone's own voice. */
export const clipVoice = () => { if (!allowed) return null; const v = getVoicePref(); return v === "device" ? null : v; };

export function loadManifest() {
  if (manifest) return Promise.resolve(manifest);
  if (!manifestP) {
    manifestP = fetch(`${BASE}/manifest.json`, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { manifest = m && m.clips ? m : null; if (!manifest) manifestP = null; return manifest; })
      .catch(() => { manifestP = null; return null; });
  }
  return manifestP;
}

const key = (v, id) => `${v}:${id}`;
export const hasClip = (id, v = clipVoice()) => !!(v && manifest?.clips?.[id]?.[v]);

function loadClip(id, v) {
  const k = key(v, id);
  const have = buffers.get(k);
  if (have) return Promise.resolve(have);
  const c = ensureAudioContext();
  if (!c) return Promise.resolve(null);
  const p = fetch(`${BASE}/${v}/${id}.mp3`, { credentials: "omit" })
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((ab) => (ab ? new Promise((res) => { try { const out = c.decodeAudioData(ab, res, () => res(null)); if (out && out.then) out.then(res, () => res(null)); } catch { res(null); } }) : null))
    .then((buf) => { if (buf) buffers.set(k, buf); else buffers.delete(k); return buf; })
    .catch(() => { buffers.delete(k); return null; });
  buffers.set(k, p);
  return p;
}

/** Warm the clips in the background (a few at a time, in the order given). Skipped on data saver. */
export async function prefetch(ids, { concurrency = 3 } = {}) {
  const v = clipVoice();
  if (!v || !audioClipsSupported()) return;
  try { if (navigator.connection?.saveData) return; } catch { /* noop */ }
  await loadManifest();
  const todo = ids.filter((id) => hasClip(id, v) && !(buffers.get(key(v, id)) instanceof AudioBuffer));
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => { while (i < todo.length) await loadClip(todo[i++], v); }));
}

/** True while a recorded line is playing: the speech layer waits (or interrupts) accordingly. */
export function clipState() {
  const now = ctx ? ctx.currentTime : 0;
  return { busy: current.sources.length > 0 && now < current.until, priority: current.priority };
}

export function stopClips() {
  current.token++;
  for (const s of current.sources) { try { s.onended = null; s.stop(); } catch { /* already ended */ } }
  current = { sources: [], priority: 0, until: 0, token: current.token };
}

/**
 * Play lines one after another as a single utterance.
 * @param {{id:string}[]} parts
 * @returns {Promise<boolean>} false when a clip could not be had in time (the caller speaks it with the phone's voice)
 */
export async function playParts(parts, { priority = 1 } = {}) {
  const v = clipVoice();
  if (!v || !parts.length || !audioClipsSupported()) return false;
  const c = ensureAudioContext();
  if (!c) return false;
  if (!manifest) await Promise.race([loadManifest(), new Promise((r) => setTimeout(r, MAX_WAIT_MS))]);
  if (!parts.every((p) => p.id && hasClip(p.id, v))) return false;
  const token = ++current.token;
  const loaded = await Promise.race([
    Promise.all(parts.map((p) => loadClip(p.id, v))),
    new Promise((r) => setTimeout(() => r(null), MAX_WAIT_MS)),
  ]);
  if (!loaded || loaded.some((b) => !b)) return false;
  if (token !== current.token) return true; // a newer line took over while this one was loading
  if (c.state === "suspended") { try { await c.resume(); } catch { /* noop */ } }
  let at = c.currentTime + 0.02;
  const sources = [];
  loaded.forEach((buf, i) => {
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.value = 1;
    src.connect(gain); gain.connect(c.destination);
    src.start(at);
    at += buf.duration + (i < loaded.length - 1 ? GAP_S : 0);
    sources.push(src);
  });
  current = { sources, priority, until: at, token };
  const last = sources[sources.length - 1];
  last.onended = () => { if (current.token === token) current = { sources: [], priority: 0, until: 0, token }; };
  return true;
}
