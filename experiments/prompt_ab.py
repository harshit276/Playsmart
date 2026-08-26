"""
prompt_ab.py — settle "do we need the big prompt, or just let Gemini work?"
with measurements instead of opinion.

READ-ONLY w.r.t. production: it imports the live prompt builder and changes
nothing. Nothing here runs in the app; delete this folder and prod is untouched.

Design
------
The app's own preprocessing (MediaRecorder + canvas captureStream at 1.5x) is a
REAL-TIME capture, so the same clip encodes differently every run — dropped
frames depend on CPU/GPU load. That alone changes which shots are found, so
comparing prompts through it would mostly measure noise. Here the clip is
prepared ONCE with ffmpeg (deterministic) and uploaded ONCE, so every arm sees
byte-identical input and the only variables are PROMPT and FPS.

Arms: {A = production prompt, B = minimal prompt} x {4 fps, 8 fps}
Repeats per arm expose run-to-run variance at temperature 0.

Usage
-----
  GEMINI_API_KEY in env, or in backend/.env (gitignored)
  python experiments/prompt_ab.py <video> [--runs 2] [--fps 4,8] [--arms A,B]
"""
import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

SQ = chr(39)  # single quote, kept out of literals to survive shell round-trips


def load_key():
    k = os.getenv("GEMINI_API_KEY", "").strip()
    if k:
        return k
    for cand in (ROOT / "backend" / ".env", ROOT / ".env"):
        if cand.exists():
            for line in cand.read_text(encoding="utf-8", errors="ignore").splitlines():
                m = re.match(r"\s*GEMINI_API_KEY\s*=\s*(.+)\s*$", line)
                if m:
                    return m.group(1).strip().strip('"').strip(SQ)
    sys.exit(
        "GEMINI_API_KEY not found.\n"
        "Put it in backend/.env as GEMINI_API_KEY=...  (that path is gitignored)\n"
        "or export it in this shell. Do NOT paste it into chat."
    )


def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def prepare(src, out, height=1280):
    """One deterministic encode shared by every arm (isolates prompt/fps)."""
    if out.exists():
        return out
    subprocess.run(
        [ffmpeg_exe(), "-y", "-i", str(src), "-vf", "scale=-2:%d" % height,
         "-c:v", "libx264", "-crf", "23", "-preset", "medium",
         "-movflags", "+faststart", "-an", str(out)],
        check=True, capture_output=True)
    return out


# ---- Arm A: exactly what production sends today -------------------------
def prompt_A(roster, target_id):
    os.environ.setdefault("GEMINI_API_KEY", "x")
    from ai_pipeline.vlm import coaching as C
    target = next((p for p in roster if p["id"] == target_id), roster[0])
    return C._build_universal_prompt(
        target.get("description"), doubles_mode=False,
        player_roster=roster, target_player_id=target_id)


# ---- Arm B: minimal. Schema + who + "report what you see". No coaching rules.
def prompt_B(roster, target_id):
    target = next((p for p in roster if p["id"] == target_id), roster[0])
    others = "\n".join("  [%s] %s" % (p["id"], p.get("description", ""))
                       for p in roster if p["id"] != target_id)
    schema = (
        '{"sport_detected":"<sport>",\n'
        '  "events":[{"timestamp_sec":<number>,'
        '"shot_label":"<what a coach would call it>",'
        '"player_id":"<roster id or unsure>",'
        '"confidence":<0-1>,'
        '"reasoning":"<what you saw at contact>"}]}'
    )
    sysp = (
        "You are analysing a sports video.\n\n"
        "TARGET PLAYER: [%s] %s\n"
        "OTHER PEOPLE ON COURT:\n%s\n\n"
        "List every shot the TARGET player hits, in time order. Report only what "
        "you can actually see. If you cannot tell something, say so rather than "
        "guessing: write the shot name without a forehand/backhand qualifier and "
        "lower the confidence.\n\n"
        "Tag every shot with player_id: the roster id of whoever hit it, or "
        '"unsure".\n\n'
        "Return JSON only:\n%s" % (target_id, target.get("description", ""), others, schema)
    )
    return sysp, "Analyse this video and return the JSON described."


ARMS = {"A": ("production", prompt_A), "B": ("minimal", prompt_B)}


def run_once(client, file_ref, sysp, usr, fps, model):
    from google.genai import types as gt
    t0 = time.time()
    resp = client.models.generate_content(
        model=model,
        contents=[gt.Content(role="user", parts=[
            gt.Part(text=usr),
            gt.Part(
                file_data=gt.FileData(
                    file_uri=file_ref.uri,
                    mime_type=file_ref.mime_type or "video/mp4"),
                video_metadata=gt.VideoMetadata(fps=fps)),
        ])],
        config=gt.GenerateContentConfig(
            system_instruction=sysp, temperature=0.0,
            response_mime_type="application/json"),
    )
    return resp.text, time.time() - t0


def parse_events(raw):
    try:
        data = json.loads(raw)
    except Exception:
        m = re.search(r"\{.*\}", raw or "", re.S)
        if not m:
            return None, []
        try:
            data = json.loads(m.group(0))
        except Exception:
            return None, []
    return data, [e for e in (data.get("events") or []) if isinstance(e, dict)]


SIDE = re.compile(r"\b(fore|back)hand\b", re.I)


def summarize(events, target_id):
    labels = [str(e.get("shot_label") or "") for e in events]
    sides = Counter()
    for lab in labels:
        m = SIDE.search(lab)
        sides[m.group(1).lower() if m else "none"] += 1
    ids = Counter(str(e.get("player_id") or "missing").lower() for e in events)
    return {
        "n": len(events),
        "mine": ids.get(target_id, 0),
        "other": sum(v for k, v in ids.items()
                     if k not in (target_id, "unsure", "missing")),
        "unsure": ids.get("unsure", 0) + ids.get("missing", 0),
        "fore": sides["fore"], "back": sides["back"], "no_side": sides["none"],
        "labels": labels,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--fps", default="4,8")
    ap.add_argument("--arms", default="A,B")
    ap.add_argument("--model", default=os.getenv("GEMINI_MODEL", "gemini-3.5-flash"))
    ap.add_argument("--target", default="p1")
    args = ap.parse_args()

    from google import genai
    client = genai.Client(api_key=load_key())

    src = Path(args.video)
    clip = prepare(src, ROOT / "experiments" / ("_prepared_%s.mp4" % src.stem))
    print("clip: %s (%.1f MB) - one encode, shared by all arms"
          % (clip.name, clip.stat().st_size / 1e6))

    print("uploading to Files API once...")
    fref = client.files.upload(file=str(clip))
    while getattr(fref.state, "name", str(fref.state)) == "PROCESSING":
        time.sleep(2)
        fref = client.files.get(name=fref.name)
    print("  %s state=%s" % (fref.name, getattr(fref.state, "name", fref.state)))

    # Roster exactly as the real detector returned it for this clip.
    roster = [
        {"id": "p1", "description": "Player in dark sleeveless top and dark shorts, near court, left side"},
        {"id": "p2", "description": "Player in dark t-shirt and dark shorts, near court, center-right side"},
        {"id": "p3", "description": "Player in dark t-shirt and dark shorts, far court, left side"},
        {"id": "p4", "description": "Player in dark t-shirt and dark shorts, far court, right side"},
    ]

    rows, raw_log = [], []
    for arm in [x.strip() for x in args.arms.split(",") if x.strip()]:
        name, builder = ARMS[arm]
        sysp, usr = builder(roster, args.target)
        for fps in [float(x) for x in args.fps.split(",")]:
            for r in range(args.runs):
                tag = "%s(%s) @%gfps run%d" % (arm, name, fps, r + 1)
                try:
                    raw, secs = run_once(client, fref, sysp, usr, fps, args.model)
                    _, evs = parse_events(raw)
                    s = summarize(evs, args.target)
                    s.update(arm=arm, arm_name=name, fps=fps, run=r + 1,
                             secs=round(secs, 1), prompt_chars=len(sysp))
                    rows.append(s)
                    raw_log.append({"tag": tag, "raw": (raw or "")[:4000]})
                    print("  %-34s -> %2d shots (mine %d, other %d, unsure %d) "
                          "| fore %d back %d none %d | %ss"
                          % (tag, s["n"], s["mine"], s["other"], s["unsure"],
                             s["fore"], s["back"], s["no_side"], s["secs"]))
                except Exception as exc:
                    print("  %-34s -> FAILED %s: %s"
                          % (tag, type(exc).__name__, str(exc)[:140]))
                    rows.append({"arm": arm, "arm_name": name, "fps": fps,
                                 "run": r + 1, "error": str(exc)[:200]})

    out = ROOT / "experiments" / "results.json"
    out.write_text(json.dumps({"rows": rows, "raw": raw_log}, indent=2), encoding="utf-8")

    print("\n=== SUMMARY (mean over runs) ===")
    print("%-22s %4s %6s %5s %6s %7s %5s %5s %5s %7s"
          % ("arm", "fps", "shots", "mine", "other", "unsure", "fore", "back",
             "none", "spread"))
    ok = [r for r in rows if "error" not in r]
    for arm in sorted(set(r["arm"] for r in ok)):
        for fps in sorted(set(r["fps"] for r in ok)):
            g = [r for r in ok if r["arm"] == arm and r["fps"] == fps]
            if not g:
                continue
            ns = [r["n"] for r in g]

            def mean(k):
                return statistics.mean([r[k] for r in g])

            print("%-22s %4g %6.1f %5.1f %6.1f %7.1f %5.1f %5.1f %5.1f %7d"
                  % (arm + " (" + g[0]["arm_name"] + ")", fps, mean("n"),
                     mean("mine"), mean("other"), mean("unsure"),
                     mean("fore"), mean("back"), mean("no_side"),
                     max(ns) - min(ns)))
    print("\nspread = max-min shots across runs of the SAME arm. With "
          "byte-identical input at temperature 0, that is pure non-determinism.")
    print("\nfull output + raw responses: %s" % out)


if __name__ == "__main__":
    main()
