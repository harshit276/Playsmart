// Portrait-video rotation normalization.
//
// THE BUG THIS FIXES: phone portrait videos store landscape frames + a
// rotation flag (−90/90/180°) in the container. Browsers apply that flag for
// display, but when we upload the raw file bytes to Gemini, Gemini analyzes
// the UN-rotated (sideways) pixels — a push-up reads as a "wall squat", a
// tricep pushdown becomes an unreadable horizontal scene → wrong labels or
// "no shots detected". Proven by extracting raw vs display frames.
//
// THE FIX: detect the rotation flag, and for rotated clips re-encode them
// UPRIGHT in the browser before upload. We draw the <video> (which the
// browser already renders upright) onto a canvas and record it with
// MediaRecorder — the output has the rotation BAKED INTO THE PIXELS and no
// flag, so Gemini sees exactly what the user sees. Verified end-to-end:
// canvas+MediaRecorder produces a valid, upright, Gemini-readable MP4.
//
// We only re-encode genuinely rotated clips (flag ≠ 0). Landscape clips and
// natively-portrait clips (no flag → Gemini already sees them correctly)
// stay on the fast upload-original path.

// ── Rotation-flag parser (ISO-BMFF / MP4 / MOV) ──────────────────────────
// Walks moov → trak → tkhd and reads the 3x3 transform matrix. We only need
// the (a, b) terms to recover the rotation angle. Reads just the moov box via
// File.slice() so we never load a 50–200 MB file into memory.

async function _readBoxHeader(file, pos) {
  const buf = await file.slice(pos, pos + 16).arrayBuffer();
  if (buf.byteLength < 8) return null;
  const dv = new DataView(buf);
  let size = dv.getUint32(0);
  const type = String.fromCharCode(dv.getUint8(4), dv.getUint8(5), dv.getUint8(6), dv.getUint8(7));
  let headerSize = 8;
  if (size === 1) {
    if (buf.byteLength < 16) return null;
    // 64-bit largesize. Number() is safe for any real video size.
    size = Number(dv.getBigUint64(8));
    headerSize = 16;
  }
  return { size, type, headerSize };
}

function _rotationFromMatrix(dv, matrixOffset) {
  // 9 fixed-point values; a = [0] (16.16), b = [1] (16.16).
  const a = dv.getInt32(matrixOffset) / 65536;
  const b = dv.getInt32(matrixOffset + 4) / 65536;
  let deg = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  deg = ((deg % 360) + 360) % 360; // normalize 0..359
  // Snap to the four cardinal rotations.
  if (deg > 45 && deg <= 135) return 90;
  if (deg > 135 && deg <= 225) return 180;
  if (deg > 225 && deg <= 315) return 270;
  return 0;
}

function _scanForTkhd(moov) {
  // moov: ArrayBuffer of the moov box CONTENTS (after its header).
  const dv = new DataView(moov);
  let best = 0;
  function walk(start, end) {
    let p = start;
    while (p + 8 <= end) {
      let size = dv.getUint32(p);
      const type = String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
      let hs = 8;
      if (size === 1) { size = Number(dv.getBigUint64(p + 8)); hs = 16; }
      if (size <= 0 || p + size > end) break;
      if (type === "trak" || type === "mdia") {
        walk(p + hs, p + size); // containers — recurse
      } else if (type === "tkhd") {
        const version = dv.getUint8(p + hs);
        // matrix offset within tkhd box: header + ver/flags(4) + body + 16
        const body = version === 1 ? 32 : 20;
        const matrixOffset = p + hs + 4 + body + 16;
        // Track width/height sit right after the 36-byte matrix; a video
        // track has non-zero dims (audio/data tracks are 0) — only trust
        // a rotation from a track that actually has pixels.
        const w = dv.getUint32(matrixOffset + 36) >>> 16;
        const h = dv.getUint32(matrixOffset + 40) >>> 16;
        if (w > 0 && h > 0) {
          const r = _rotationFromMatrix(dv, matrixOffset);
          if (r !== 0) best = r;
        }
      }
      p += size;
    }
  }
  walk(0, moov.byteLength);
  return best;
}

/**
 * Returns the clip's stored rotation flag in degrees (0/90/180/270).
 * 0 means "no rotation" (or couldn't parse — we fail safe to not re-encoding).
 */
export async function getVideoRotationDegrees(file) {
  try {
    let pos = 0;
    const max = file.size;
    // Scan top-level boxes for moov (may be at start [faststart] or end).
    for (let guard = 0; guard < 64 && pos + 8 <= max; guard++) {
      const box = await _readBoxHeader(file, pos);
      if (!box || box.size <= 0) break;
      if (box.type === "moov") {
        const moov = await file.slice(pos + box.headerSize, pos + box.size).arrayBuffer();
        return _scanForTkhd(moov);
      }
      pos += box.size;
    }
  } catch (e) {
    console.warn("[rotation] parse failed, assuming none:", e?.message || e);
  }
  return 0;
}

// ── Upright re-encode (canvas + MediaRecorder) ───────────────────────────

function _pickRecorderMime() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((m) => {
    try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
  }) || "";
}

/**
 * Re-encode a video so its pixels are upright (rotation baked in, no flag).
 * Draws the browser-rendered (already-rotated) <video> to a canvas and
 * records it. Returns a new File. Throws if the browser can't record — the
 * caller should fall back to the original file (no worse than today).
 *
 * @param {File} file
 * @param {Object} [opts]
 * @param {(p:{percent:number,message:string})=>void} [opts.onProgress]
 * @param {number} [opts.maxSeconds=180] safety cap on clip length to process
 */
export async function reencodeUpright(file, opts = {}) {
  const { onProgress, maxSeconds = 180 } = opts;
  const mime = _pickRecorderMime();
  if (!mime || typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder unsupported");
  }

  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  const url = URL.createObjectURL(file);
  v.src = url;

  try {
    await new Promise((res, rej) => {
      v.onloadedmetadata = res;
      v.onerror = () => rej(new Error("video decode failed"));
    });

    // videoWidth/Height are the DISPLAY dims (browser already applied the
    // rotation flag), so the canvas captures the upright orientation.
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) throw new Error("no video dimensions");
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });

    const stream = canvas.captureStream(30);
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const dur = Math.min(v.duration || maxSeconds, maxSeconds);
    onProgress?.({ percent: 2, message: "Rotating video to the right orientation…" });
    await v.play().catch(() => {});
    rec.start(500);
    await new Promise((res) => {
      const tick = () => {
        ctx.drawImage(v, 0, 0, w, h);
        const t = v.currentTime || 0;
        if (onProgress && dur > 0) {
          onProgress({ percent: 2 + Math.min(1, t / dur) * 16, message: "Rotating video to the right orientation…" });
        }
        if (v.ended || t >= dur) {
          try { rec.stop(); } catch { /* already stopped */ }
          res();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
    await new Promise((res) => { rec.onstop = res; });
    try { v.pause(); } catch { /* noop */ }

    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    const outType = mime.split(";")[0];
    const blob = new Blob(chunks, { type: outType });
    if (!blob.size) throw new Error("empty re-encode output");
    const baseName = (file.name || "video").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}_upright.${ext}`, { type: outType });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * If the clip is rotated, return an upright re-encoded copy; otherwise return
 * the original unchanged. Never throws — on any failure it returns the
 * original (no worse than the pre-fix behaviour).
 */
export async function normalizeRotationIfNeeded(file, onProgress) {
  try {
    const rot = await getVideoRotationDegrees(file);
    if (!rot) return file; // landscape or native-portrait → Gemini sees it right
    console.info(`[rotation] clip is rotated ${rot}° — re-encoding upright before upload`);
    const fixed = await reencodeUpright(file, { onProgress });
    console.info(`[rotation] upright re-encode ok: ${(fixed.size / 1024 / 1024).toFixed(1)}MB ${fixed.type}`);
    return fixed;
  } catch (e) {
    console.warn("[rotation] normalize failed, uploading original:", e?.message || e);
    return file;
  }
}
