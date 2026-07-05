/**
 * transcodeInWorker — main-thread wrapper around transcode.worker.js.
 *
 * Guarantees the two properties the in-page transcode could never give us:
 *   1. HARD CANCEL: worker.terminate() kills the transcode instantly even if
 *      a software encoder has saturated the worker thread (the failure that
 *      forced the old mobile-only gate — desktop is safe to enable now).
 *   2. EARLY ABORT: a few seconds in, we project the total transcode time
 *      from the progress rate; if it would bust the budget (software encoder,
 *      weak device), we kill it immediately and the caller uploads the
 *      original instead — no 100s dead-end, worst case is today's behaviour.
 *
 * Rejects with err.code:
 *   "unsupported"    – Worker can't be created (caller may fall back to the
 *                      main-thread transcode on mobile)
 *   "abort"          – external AbortSignal fired (user cancelled)
 *   "timeout"        – budget exceeded (hard kill)
 *   "projected_slow" – early projection says it won't fit the budget
 *   anything else    – forwarded from webcodecsTranscode (e.g. verify_*)
 */
export function transcodeInWorker(file, opts = {}) {
  const { maxHeight = 720, onProgress, signal, budgetMs = 45_000 } = opts;
  return new Promise((resolve, reject) => {
    if (typeof Worker !== "function") {
      const e = new Error("worker_unsupported"); e.code = "unsupported"; return reject(e);
    }
    if (signal?.aborted) {
      const e = new Error("Transcode cancelled"); e.code = "abort"; return reject(e);
    }
    let worker;
    try {
      worker = new Worker(new URL("./transcode.worker.js", import.meta.url));
    } catch {
      const e = new Error("worker_spawn_failed"); e.code = "unsupported"; return reject(e);
    }

    const t0 = Date.now();
    let lastPct = 0;
    let settled = false;
    let hardTimer = null;
    let earlyTimer = null;

    const cleanup = () => {
      if (hardTimer) clearTimeout(hardTimer);
      if (earlyTimer) clearTimeout(earlyTimer);
      signal?.removeEventListener("abort", onAbort);
      try { worker.terminate(); } catch { /* noop */ }
    };
    const finish = (fn, arg) => { if (settled) return; settled = true; cleanup(); fn(arg); };
    const kill = (code, msg) => { const e = new Error(msg); e.code = code; finish(reject, e); };
    const onAbort = () => kill("abort", "Transcode cancelled");

    signal?.addEventListener("abort", onAbort, { once: true });
    hardTimer = setTimeout(() => kill("timeout", "transcode_budget_exceeded"), budgetMs);

    // Early projection: by 6s the pipeline is warm (decoder/encoder init done);
    // if the observed rate projects past the budget, bail NOW instead of
    // discovering it at the hard timeout. 1.15x slack absorbs a slow start.
    earlyTimer = setTimeout(() => {
      const elapsed = Date.now() - t0;
      const projected = lastPct > 1 ? elapsed / (lastPct / 100) : Infinity;
      if (projected > budgetMs * 1.15) {
        kill("projected_slow", `transcode_projected_${Math.round(projected / 1000)}s`);
      }
    }, 6_000);

    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "progress") {
        lastPct = m.pct || 0;
        try { onProgress?.(m.pct); } catch { /* noop */ }
      } else if (m.type === "done") {
        const out = new File([m.buffer], m.name || "clip_720p.mp4", { type: "video/mp4" });
        finish(resolve, out);
      } else if (m.type === "error") {
        const err = new Error(m.message || "transcode_failed");
        if (m.code) err.code = m.code;
        finish(reject, err);
      }
    };
    worker.onerror = (e) => {
      const err = new Error(e?.message || "worker_error"); err.code = "worker_error";
      finish(reject, err);
    };

    // Structured clone passes the File by reference (no copy of the bytes).
    worker.postMessage({ file, maxHeight, timeoutMs: budgetMs + 2_000 });
  });
}
