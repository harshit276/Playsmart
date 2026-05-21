import { useState, useRef } from "react";
import { Loader2, Upload, CheckCircle2, XCircle } from "lucide-react";
import api from "@/lib/api";

// Dev-only diagnostic page: upload one image (or pick a sample), pick
// a sport+shot, fire ONE Replicate prediction via /api/test-ai-gen
// (no auth, no token cost), and watch the raw status come back. Used
// to prove the pipeline is alive when the per-shot UI is rate-limited.
export default function TestAiGenPage() {
  const [refB64, setRefB64] = useState(null);
  const [refPreview, setRefPreview] = useState(null);
  const [sport, setSport] = useState("badminton");
  const [shotType, setShotType] = useState("smash");
  const [backend, setBackend] = useState("minimax");
  const [status, setStatus] = useState("idle"); // idle | running | done | failed
  const [testId, setTestId] = useState(null);
  const [poll, setPoll] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRefB64(reader.result);
      setRefPreview(reader.result);
    };
    reader.readAsDataURL(f);
  };

  const fire = async () => {
    if (!refB64) {
      setError("Pick a reference image first.");
      return;
    }
    setStatus("running");
    setError(null);
    setVideoUrl(null);
    setPoll(null);
    setTestId(null);
    try {
      const { data } = await api.post("/test-ai-gen", {
        reference_image_b64: refB64,
        sport,
        shot_type: shotType,
        backend,
      }, { timeout: 30000 });
      if (data?.status === "feature_unavailable") {
        setStatus("failed");
        setError(data.error || "feature unavailable");
        return;
      }
      const id = data?.test_id;
      if (!id) {
        setStatus("failed");
        setError("No test_id returned");
        return;
      }
      setTestId(id);
      // Poll up to ~4 min
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const { data: p } = await api.get(`/test-ai-gen/${id}`, { timeout: 8000 });
          setPoll(p);
          if (p.status === "done" && p.video_url) {
            setVideoUrl(p.video_url);
            setStatus("done");
            return;
          }
          if (p.status === "failed") {
            setStatus("failed");
            setError(p.error || "generation failed");
            return;
          }
        } catch (e) { /* keep polling */ }
      }
      setStatus("failed");
      setError("polling timed out after 4 minutes");
    } catch (e) {
      setStatus("failed");
      setError(e.response?.data?.detail || e.message || "request failed");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">AI Video Generation — Test Bench</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Dev-only. Fires ONE Replicate prediction with no auth + no token cost.
            Use this to verify the pipeline works independently from the per-shot UI.
          </p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-4">
          {/* Reference image picker */}
          <div>
            <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2 block">
              Reference image (the person to animate)
            </label>
            <input
              type="file" accept="image/*" ref={fileInputRef}
              onChange={onPickFile} className="hidden"
            />
            <div className="flex items-start gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-semibold"
              >
                <Upload className="w-4 h-4" /> Choose image
              </button>
              {refPreview && (
                <img src={refPreview} alt="ref"
                  className="h-24 w-auto rounded-lg border border-zinc-700" />
              )}
            </div>
          </div>

          {/* Sport + shot + backend */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-1 block">Sport</label>
              <select value={sport} onChange={(e) => setSport(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm">
                <option value="badminton">badminton</option>
                <option value="tennis">tennis</option>
                <option value="table_tennis">table_tennis</option>
                <option value="pickleball">pickleball</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-1 block">Shot type</label>
              <input value={shotType} onChange={(e) => setShotType(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm"
                placeholder="smash" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-1 block">Backend</label>
              <select value={backend} onChange={(e) => setBackend(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm">
                <option value="kling">kling 1.6 pro (best, ~$0.50)</option>
                <option value="minimax">minimax video-01 (cheap)</option>
                <option value="mimicmotion">mimicmotion (pose transfer)</option>
              </select>
            </div>
          </div>

          {/* Fire button */}
          <button
            onClick={fire}
            disabled={status === "running" || !refB64}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 hover:bg-purple-400 disabled:opacity-50 rounded-lg font-bold"
          >
            {status === "running"
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : "Fire test generation"}
          </button>
        </div>

        {/* Result panel */}
        {(testId || error) && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              {status === "done" && <CheckCircle2 className="w-5 h-5 text-lime-400" />}
              {status === "failed" && <XCircle className="w-5 h-5 text-red-400" />}
              {status === "running" && <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />}
              <p className="text-sm font-bold">
                {status === "done" ? "Generation succeeded" :
                 status === "failed" ? "Generation failed" :
                 "Generating — usually 60–180s"}
              </p>
            </div>
            {testId && (
              <p className="text-xs text-zinc-400 font-mono">test_id: {testId}</p>
            )}
            {poll && (
              <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-[10px] text-zinc-300 overflow-x-auto">
{JSON.stringify(poll, null, 2)}
              </pre>
            )}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs text-red-300 font-mono whitespace-pre-wrap">{error}</p>
              </div>
            )}
            {videoUrl && (
              <div>
                <p className="text-xs uppercase tracking-wider text-purple-300 font-bold mb-2">Output video</p>
                <video src={videoUrl} controls loop autoPlay muted playsInline
                  className="w-full rounded-lg bg-black" />
                <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-purple-300 hover:text-purple-200 mt-1 inline-block">
                  Open / download ↗
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
