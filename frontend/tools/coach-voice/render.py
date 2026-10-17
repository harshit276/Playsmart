"""
Records the coach's lines (src/ai/coachPhrases.js) as short mp3 clips with Kokoro-82M (Apache-2.0, runs offline),
for public/coach-voice/v1/<voice>/<id>.mp3, and writes public/coach-voice/v1/manifest.json.

Needs: Python with `kokoro-onnx` and `soundfile`, ffmpeg (with libmp3lame) on PATH, and Kokoro's model files
(kokoro-v1.0.onnx + voices-v1.0.bin, from github.com/thewh1teagle/kokoro-onnx releases, model-files-v1.0).
Only lines that do not have a clip yet are recorded; pass --force to redo all, --only <prefix> to redo one group.

  node dump_phrases.mjs
  python render.py --model <dir with the two model files> [--voices f,m] [--force] [--only praise.]
"""
import argparse, json, os, subprocess, sys
import soundfile as sf
from kokoro_onnx import Kokoro

VOICES = {
    "f": {"label": "Female", "kokoro": "af_heart"},
    "m": {"label": "Male", "kokoro": "am_michael"},
}
# trim silence at both ends, take the rumble out, even the level, and a touch of compression, then a mono mp3
POLISH = ("highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.10,areverse,"
          "loudnorm=I=-17:TP=-2:LRA=7")

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--voices", default="f,m")
ap.add_argument("--force", action="store_true")
ap.add_argument("--only", default="")
ap.add_argument("--phrases", default=os.path.join(os.path.dirname(__file__), "phrases.json"))
ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "..", "public", "coach-voice", "v1"))
a = ap.parse_args()

phrases = json.load(open(a.phrases, encoding="utf-8"))
k = Kokoro(os.path.join(a.model, "kokoro-v1.0.onnx"), os.path.join(a.model, "voices-v1.0.bin"))
tmp = os.path.join(a.out, "_tmp"); os.makedirs(tmp, exist_ok=True)

def dur(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], capture_output=True, text=True)
    return round(float(r.stdout.strip()) * 1000)

manifest = {"version": 1, "voices": {v: {"label": VOICES[v]["label"]} for v in a.voices.split(",")}, "clips": {}}
for v in a.voices.split(","):
    os.makedirs(os.path.join(a.out, v), exist_ok=True)
    for i, p in enumerate(phrases):
        mp3 = os.path.join(a.out, v, p["id"] + ".mp3")
        redo = a.force or (a.only and p["id"].startswith(a.only))
        if not os.path.exists(mp3) or redo:
            samples, sr = k.create(p["text"], voice=VOICES[v]["kokoro"], speed=1.0, lang="en-us")
            raw = os.path.join(tmp, v + "_" + p["id"] + ".wav"); sf.write(raw, samples, sr)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", POLISH, "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "56k", mp3], check=True)
            os.remove(raw)
            print(v, i + 1, "/", len(phrases), p["id"], flush=True)
        if os.path.exists(mp3):
            manifest["clips"].setdefault(p["id"], {})[v] = dur(mp3)
json.dump(manifest, open(os.path.join(a.out, "manifest.json"), "w"), separators=(",", ":"))
try: os.rmdir(tmp)
except OSError: pass
print("manifest:", len(manifest["clips"]), "clips")
