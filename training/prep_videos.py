"""
Downscale every video in the folder to 480p (h264, no audio) so the
labeling pipeline doesn't run out of memory on 1080p sources.

Output: <name>_480p.mp4 next to the original. The pipeline scripts
will pick those up automatically (just pass --videos-dir to the same
folder).

Run:
   python prep_videos.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

SUFFIX = "_480p"
EXTS = {".mp4", ".mov", ".mkv", ".webm"}


def main():
    if shutil.which("ffmpeg") is None:
        sys.exit("[error] ffmpeg not found in PATH. Install: winget install ffmpeg")

    here = Path(__file__).parent
    videos = sorted(p for p in here.iterdir() if p.suffix.lower() in EXTS and SUFFIX not in p.stem)
    if not videos:
        sys.exit(f"[error] no source videos in {here}")

    for v in videos:
        out = v.with_name(v.stem + SUFFIX + ".mp4")
        if out.exists():
            print(f"[skip] {out.name} already exists")
            continue
        print(f"[ffmpeg] {v.name} -> {out.name}")
        cmd = [
            "ffmpeg", "-y", "-i", str(v),
            "-vf", "scale=-2:480",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
            "-an",
            str(out),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=900)
            mb = out.stat().st_size // 1024 // 1024
            print(f"  ok ({mb} MB)")
        except subprocess.CalledProcessError as e:
            print(f"  FAILED: {e.stderr[:300]}", file=sys.stderr)
        except subprocess.TimeoutExpired:
            print(f"  TIMED OUT", file=sys.stderr)

    print("\n[done] now run the labeler against the *_480p.mp4 files")


if __name__ == "__main__":
    main()
