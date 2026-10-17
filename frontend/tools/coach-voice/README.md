# Coach voice recordings

The live coach (`src/ai/coachPolicy.js`) picks lines from `src/ai/coachPhrases.js`. Each line has a pre-recorded
clip in `public/coach-voice/v1/<voice>/<id>.mp3` (voices `f` and `m`, ~3 MB each, 193 lines), played through Web Audio
by `src/lib/coachVoice.js`. The phone's own speech engine is the fallback for any line without a clip, for people who
pick "Phone voice" in the practice settings, and when a clip is not ready in time.

## Add or change a line

1. Edit `src/ai/coachPhrases.js`. **Append** new lines at the END of their array (an id is `key.index`; reordering or
   deleting would point ids at the wrong recordings). To reword a line, change its text and record it with `--only`.
2. `node dump_phrases.mjs` (writes `phrases.json`).
3. `python render.py --model <folder> [--only <id prefix>] [--force]`, which records only the lines that have no clip yet.
   Needs Python with `kokoro-onnx` + `soundfile`, ffmpeg with libmp3lame, and the Kokoro model files
   (`kokoro-v1.0.onnx`, `voices-v1.0.bin`: github.com/thewh1teagle/kokoro-onnx, release `model-files-v1.0`).
   The voices are Kokoro-82M `af_heart` (f) and `am_michael` (m); both Apache-2.0.
4. `node test_policy.mjs` checks the wording rules (unique ids, short lines, every fault has three levels).
5. Commit the new mp3s and `manifest.json`.

## Replace the voice (e.g. with a paid human-sounding one)

Render the same ids with another engine into a new folder `public/coach-voice/v2/` (keep the mp3 mono, ~24 kHz,
loudness around -17 LUFS, silence trimmed), write `manifest.json` with each id's duration per voice, then change
`BASE` in `src/lib/coachVoice.js` and the `/coach-voice/v1/` route in `vercel.json`. `v1` is cached as immutable for a
year, so never overwrite files in place on a deployed version: bump the folder.
