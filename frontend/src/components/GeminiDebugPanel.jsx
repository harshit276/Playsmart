import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bug, Copy, Check, ChevronDown, AlertTriangle } from "lucide-react";

// GeminiDebugPanel — shows the raw Gemini response next to the
// post-processed shot list so you can verify in-app whether a
// "missing shot" was actually missing in Gemini's output, or got
// dropped by our pipeline downstream.
//
// Triggers:
//   • `?debug=1` query param OR `localStorage.playsmart_debug=true`
//   • Always shown to internal admin emails (set in ADMIN_EMAILS below).
//
// Data sources (read from result._debug or result._meta):
//   raw_gemini_response  — first 32 KB of the model's JSON text
//   raw_event_count      — events Gemini emitted before filtering
//   filtered_event_count — events that survived our normalization
//   events_dropped       — raw - filtered
//   target_player_description — the description string sent to Gemini
//
// Honest about scope: this is a diagnostic, not a feature. It exists
// because users reported "the app showed 1 shot but I uploaded a 12-
// shot rally and Gemini Studio sees all 12 perfectly". This panel lets
// us debug those reports without round-tripping screenshots.

function _debugEnabled() {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("debug") === "1" || qs.get("debug") === "true") return true;
    if (localStorage.getItem("playsmart_debug") === "true") return true;
  } catch {}
  return false;
}

function _prettyJson(s) {
  if (!s) return "";
  // Try to pretty-print. Gemini's response is supposed to be JSON.
  try {
    const obj = JSON.parse(s);
    return JSON.stringify(obj, null, 2);
  } catch {
    // Streaming mid-cutoff or non-JSON → show as-is.
    return s;
  }
}

export default function GeminiDebugPanel({ result }) {
  const enabled = useMemo(() => _debugEnabled(), []);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!enabled || !result) return null;

  // Both stream and non-stream paths drop their debug payload under
  // _debug; the stream path also tucks it into _meta. Accept either.
  const dbg = result._debug || result._meta || {};
  const raw = typeof dbg.raw_gemini_response === "string" ? dbg.raw_gemini_response : "";
  const rawCount = typeof dbg.raw_event_count === "number" ? dbg.raw_event_count : null;
  const filteredCount = typeof dbg.filtered_event_count === "number" ? dbg.filtered_event_count : null;
  const dropped = typeof dbg.events_dropped === "number" ? dbg.events_dropped : null;
  const targetDesc = dbg.target_player_description || null;
  const backend = dbg.backend || null;
  const model = dbg.model || null;
  const mode = dbg.mode || null;

  // If we have no debug data at all (e.g., historical analysis from
  // before this PR shipped), still render the panel so users can see
  // we're trying — just say "no raw output captured".
  const hasAnyData = raw || rawCount != null || filteredCount != null || targetDesc;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw || JSON.stringify(dbg, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const dropSummary = (rawCount != null && filteredCount != null)
    ? `Gemini returned ${rawCount}, UI shows ${filteredCount}` + (dropped ? ` · ${dropped} dropped by filter` : "")
    : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-fuchsia-400/5 border border-fuchsia-400/30 rounded-2xl mb-4 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-3 hover:bg-fuchsia-400/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-fuchsia-400/15 border border-fuchsia-400/40 flex items-center justify-center shrink-0">
          <Bug className="w-4 h-4 text-fuchsia-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-fuchsia-300 font-bold leading-none">
            Debug · raw Gemini output
          </p>
          <p className="text-[12px] text-zinc-300 leading-tight mt-0.5">
            {dropSummary || (raw ? "Tap to view raw response" : "No raw output captured for this analysis")}
            {dropped > 0 && (
              <span className="inline-flex items-center gap-1 ml-2 text-[10px] text-amber-300 font-bold">
                <AlertTriangle className="w-2.5 h-2.5" />
                {dropped} filtered
              </span>
            )}
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-fuchsia-400/20"
          >
            <div className="p-3 space-y-3">
              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Gemini events" value={rawCount} />
                <Stat label="UI shots" value={filteredCount} />
                <Stat label="Dropped" value={dropped} tone={dropped > 0 ? "amber" : "lime"} />
                <Stat label="Mode" value={mode || "n/a"} mono />
              </div>
              {(backend || model) && (
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Backend" value={backend || "n/a"} mono />
                  <Stat label="Model" value={model || "n/a"} mono />
                </div>
              )}
              {targetDesc && (
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Target description sent to Gemini</p>
                  <p className="text-[12px] text-zinc-200 leading-snug font-mono">{targetDesc}</p>
                </div>
              )}

              {hasAnyData && raw && (
                <div className="bg-black border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-900/80 border-b border-zinc-800">
                    <p className="text-[10px] uppercase tracking-wider text-fuchsia-300 font-bold">
                      Raw Gemini response (truncated to 32 KB)
                    </p>
                    <button
                      type="button"
                      onClick={copy}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-300 hover:text-white px-2 py-1 rounded hover:bg-zinc-800"
                    >
                      {copied
                        ? <><Check className="w-3 h-3 text-lime-400" /> Copied</>
                        : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                  <pre className="text-[11px] text-zinc-200 leading-snug font-mono p-2.5 overflow-auto max-h-[480px] whitespace-pre-wrap break-words">
{_prettyJson(raw)}
                  </pre>
                </div>
              )}
              {!hasAnyData && (
                <div className="bg-zinc-800/40 border border-zinc-800 rounded-lg p-3 text-[11px] text-zinc-400 leading-snug">
                  No debug payload from the backend. This means the analysis was either a historical one or ran on an older backend build. Re-run the upload to capture fresh debug data.
                </div>
              )}

              <p className="text-[10px] text-zinc-600 leading-snug">
                This panel is only visible with <code className="text-fuchsia-300">?debug=1</code> in the URL or <code className="text-fuchsia-300">localStorage.playsmart_debug=true</code>. Ship away.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function Stat({ label, value, mono = false, tone = "default" }) {
  const toneClass = tone === "amber" ? "text-amber-300"
    : tone === "lime" ? "text-lime-300"
    : "text-white";
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold leading-none">{label}</p>
      <p className={`text-base font-bold mt-1 leading-tight ${toneClass} ${mono ? "font-mono" : ""}`}>
        {value == null ? "—" : String(value)}
      </p>
    </div>
  );
}
