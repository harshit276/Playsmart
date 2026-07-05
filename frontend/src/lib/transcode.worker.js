/* eslint-disable no-restricted-globals */
/**
 * transcode.worker.js — runs the WebCodecs 720p transcode OFF the main thread.
 *
 * Why a worker: the transcode itself is async (WebCodecs), but on a machine
 * that falls back to a SOFTWARE H.264 encoder the pipeline saturates its
 * thread and Mediabunny's cancel() never gets a chance to run — the old
 * desktop "can't cancel a 100s transcode" failure. In a worker the main
 * thread stays free and worker.terminate() is a guaranteed, instant kill,
 * which is what makes enabling the transcode on DESKTOP safe.
 *
 * Protocol: receives { file, maxHeight, timeoutMs }; posts
 *   { type: "progress", pct }   0-100 while converting
 *   { type: "done", buffer, name }  (ArrayBuffer transferred)
 *   { type: "error", message, code }
 */
import { webcodecsTranscode } from "./webcodecsTranscode";

self.onmessage = async (e) => {
  const { file, maxHeight, timeoutMs } = e.data || {};
  try {
    const out = await webcodecsTranscode(file, {
      maxHeight: maxHeight || 720,
      timeoutMs: timeoutMs || 45_000,
      onProgress: (pct) => {
        try { self.postMessage({ type: "progress", pct }); } catch { /* noop */ }
      },
    });
    const buffer = await out.arrayBuffer();
    self.postMessage({ type: "done", buffer, name: out.name }, [buffer]);
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err?.message || String(err),
      code: err?.code || null,
    });
  }
};
