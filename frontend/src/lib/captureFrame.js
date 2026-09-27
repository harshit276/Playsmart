// Capture a single frame from a video FILE at time t as a JPEG data URL.
// Takes the File (not a shared object URL) and owns its own URL lifecycle —
// sharing the parent's URL caused net::ERR_FILE_NOT_FOUND when the parent
// revoked it mid-capture (seen in prod console).
export async function captureFrameAt(videoFile, t, maxDim = 720, cropBox = null) {
  return new Promise((resolve) => {
    let url = null;
    const finish = (val) => {
      if (url) { try { URL.revokeObjectURL(url); } catch {} url = null; }
      resolve(val);
    };
    try {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto";
      url = URL.createObjectURL(videoFile);
      v.src = url;
      const fail = setTimeout(() => finish(null), 8000);
      const grab = () => {
        try {
          const vw = v.videoWidth, vh = v.videoHeight;
          if (!vw || !vh) { clearTimeout(fail); finish(null); return; }
          // Crop to the performing player's contact box when available
          // ([ymin,xmin,ymax,xmax], 0-1000) with 20% padding — otherwise
          // MoveNet's single-pose model can lock onto the wrong (more
          // prominent) person in the frame.
          let sx = 0, sy = 0, sw = vw, sh = vh;
          if (Array.isArray(cropBox) && cropBox.length === 4) {
            const [ymin, xmin, ymax, xmax] = cropBox.map(Number);
            if (ymax > ymin && xmax > xmin) {
              const padY = (ymax - ymin) * 0.2;
              const padX = (xmax - xmin) * 0.2;
              sy = Math.max(0, ((ymin - padY) / 1000) * vh);
              sx = Math.max(0, ((xmin - padX) / 1000) * vw);
              sh = Math.min(vh - sy, ((ymax - ymin + 2 * padY) / 1000) * vh);
              sw = Math.min(vw - sx, ((xmax - xmin + 2 * padX) / 1000) * vw);
              if (sw < 40 || sh < 40) { sx = 0; sy = 0; sw = vw; sh = vh; }
            }
          }
          const scale = Math.min(1, maxDim / Math.max(sw, sh));
          const c = document.createElement("canvas");
          c.width = Math.max(2, Math.round(sw * scale));
          c.height = Math.max(2, Math.round(sh * scale));
          c.getContext("2d").drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
          clearTimeout(fail);
          finish(c.toDataURL("image/jpeg", 0.85));
        } catch { clearTimeout(fail); finish(null); }
      };
      v.onloadedmetadata = () => {
        try {
          v.currentTime = Math.max(0.05, Math.min(t, (v.duration || t + 1) - 0.05));
        } catch { grab(); }
      };
      v.onseeked = grab;
      v.onerror = () => { finish(null); };
    } catch { finish(null); }
  });
}
