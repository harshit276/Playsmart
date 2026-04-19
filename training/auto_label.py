"""
Auto-label new videos using the trained shot classifier.

Workflow:
  1. Drop fresh videos into --videos-dir
  2. python auto_label.py --videos-dir "C:/path/to/videos"
  3. For each video, the script:
     - finds shot moments (motion peak detection — same algo as the browser tool)
     - runs MoveNet on each moment
     - predicts the shot type using shot_classifier.joblib
     - writes labels_<hash>.json next to the video, with predictions pre-filled
       and a `auto_labeled: true` marker so you can tell them apart from
       human labels.
  4. Open /label, upload the same video → you'll see the predictions already
     filled in. Just CORRECT the wrong ones and click Discard on bad clips.
     Then re-download the JSON.

Confidence threshold:
  By default any prediction with confidence < --min-conf (default 0.30) is
  saved with label="" so you're forced to look at it. Predictions above the
  threshold get the model's guess.

Bootstrap mode (first labels, before our model is any good):
  See README.md "Bootstrap labels with RichardPinter/badminton_shot_type" —
  uses an external pre-trained model to seed the dataset. Run once to break
  the chicken/egg, then retrain our model on the corrected labels.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import cv2
import joblib
import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

# Reuse the exact same feature pipeline the trainer uses.
from extract_poses import (
    FRAMES_PER_CLIP,
    NUM_KEYPOINTS,
    extract_clip_features,
    load_movenet,
)

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}


def video_hash(path: Path) -> str:
    """Stable hash matching the browser computeVideoHash (filename-size-mtime)."""
    s = f"{path.name}-{path.stat().st_size}-{int(path.stat().st_mtime * 1000)}"
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def find_shot_moments(video_path: Path, min_clips: int = 12, max_clips: int = 60) -> list[dict]:
    """Adaptive motion-peak detection on greyscale frame diffs — Python port
    of the JS shotMomentExtractor."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = n_frames / fps
    if duration < 1.0:
        cap.release()
        return []

    sample_fps = 8
    target = min(2400, int(duration * sample_fps))
    step = max(1, int(round(fps / sample_fps)))
    motions: list[float] = []
    times: list[float] = []
    prev = None
    for i in range(0, n_frames, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (128, 128))
        if prev is not None:
            diff = float(np.abs(small.astype(np.int16) - prev.astype(np.int16)).mean())
            motions.append(diff)
            times.append(i / fps)
        prev = small
        if len(motions) >= target:
            break
    cap.release()

    if len(motions) < 5:
        return []

    arr = np.array(motions, dtype=np.float32)
    # smoothing
    k = np.ones(3) / 3
    arr = np.convolve(arr, k, mode="same")
    q25, q50, q75 = np.percentile(arr, [25, 50, 75])
    iqr = max(0.0, q75 - q25)
    threshold = max(q75 + iqr * 0.3, q50 * 1.2, 0.4)

    # local maxima
    peaks = []
    for i in range(1, len(arr) - 1):
        if arr[i] >= threshold and arr[i] >= arr[i - 1] and arr[i] >= arr[i + 1]:
            peaks.append((i, arr[i]))

    # min gap 0.6s (in samples)
    min_gap_idx = max(1, int(0.6 * sample_fps))
    peaks.sort(key=lambda p: p[0])
    filtered = []
    for idx, score in peaks:
        if not filtered or idx - filtered[-1][0] >= min_gap_idx:
            filtered.append((idx, score))
        elif score > filtered[-1][1]:
            filtered[-1] = (idx, score)

    # fallback: top motion frames if too few peaks
    if len(filtered) < min_clips:
        order = np.argsort(-arr)
        for idx in order:
            if any(abs(int(idx) - f[0]) < min_gap_idx for f in filtered):
                continue
            filtered.append((int(idx), float(arr[idx])))
            if len(filtered) >= min_clips * 2:
                break
        filtered.sort(key=lambda p: p[0])

    clip_pad = 1.0
    clips = []
    for idx, score in filtered[:max_clips]:
        peak_t = times[idx]
        clips.append({
            "peak": round(peak_t, 2),
            "start": round(max(0.0, peak_t - clip_pad), 2),
            "end": round(min(duration, peak_t + clip_pad), 2),
            "score": round(float(score), 2),
        })
    return clips


def label_video(
    movenet,
    classifier_bundle: dict,
    video_path: Path,
    min_conf: float,
    sport: str,
    player_position: str,
    out_dir: Path,
) -> Optional[Path]:
    print(f"\n[video] {video_path.name}")
    moments = find_shot_moments(video_path)
    if not moments:
        print("  (no shot moments found)")
        return None
    print(f"  found {len(moments)} candidate clips, running classifier…")

    model = classifier_bundle["model"]
    labels = list(classifier_bundle["labels"])
    has_proba = hasattr(model, "predict_proba")

    shots = []
    counts = {"high_conf": 0, "low_conf": 0}
    t0 = time.time()
    for i, m in enumerate(moments):
        feats = extract_clip_features(movenet, video_path, m["start"], m["end"], player_position=player_position)
        if feats is None:
            continue
        X = feats.reshape(1, -1)
        pred_idx = int(model.predict(X)[0])
        pred_label = labels[pred_idx]
        conf = None
        if has_proba:
            proba = model.predict_proba(X)[0]
            conf = float(proba[pred_idx])

        # confidence gate — leave label blank for low-conf so user MUST review
        keep_label = pred_label if (conf is None or conf >= min_conf) else ""
        if keep_label:
            counts["high_conf"] += 1
        else:
            counts["low_conf"] += 1

        shots.append({
            "start": m["start"],
            "end": m["end"],
            "label": keep_label,
            **({"_predicted": pred_label, "_confidence": round(conf, 3)} if conf is not None else {}),
        })

    if not shots:
        print("  (no usable clips)")
        return None

    out_payload = {
        "video_filename": video_path.name,
        "video_hash": video_hash(video_path),
        "sport": sport,
        "player_position": player_position,
        "duration": None,
        "auto_labeled": True,
        "auto_labeler_min_conf": min_conf,
        "shots": shots,
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    short = out_payload["video_hash"][:8]
    out_path = out_dir / f"labels_{short}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)
    elapsed = time.time() - t0
    print(f"  → {out_path.name}  ({counts['high_conf']} high-conf, "
          f"{counts['low_conf']} low-conf for review)  [{elapsed:.1f}s]")
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos-dir", required=True, type=Path,
                    help="Folder containing the new videos to label")
    ap.add_argument("--model", default="shot_classifier.joblib", type=Path,
                    help="Trained classifier path")
    ap.add_argument("--min-conf", type=float, default=0.30,
                    help="Predictions below this confidence are saved blank for human review")
    ap.add_argument("--sport", default="badminton")
    ap.add_argument("--player-position", default="auto",
                    help="auto / top-left / top-right / bottom-left / bottom-right (singles use auto)")
    ap.add_argument("--out-dir", type=Path, default=None,
                    help="Where to drop labels_*.json (default: same as --videos-dir)")
    args = ap.parse_args()

    if not args.videos_dir.exists():
        print(f"[error] videos dir does not exist: {args.videos_dir}", file=sys.stderr)
        sys.exit(2)
    if not args.model.exists():
        print(f"[error] model not found: {args.model}", file=sys.stderr)
        print("        train one first: python train_classifier.py", file=sys.stderr)
        sys.exit(2)

    out_dir = args.out_dir or args.videos_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[load] {args.model}")
    bundle = joblib.load(args.model)
    print(f"       classes: {list(bundle['labels'])}")

    movenet = load_movenet()

    # collect videos that don't already have a labels file
    videos = sorted(p for p in args.videos_dir.iterdir() if p.suffix.lower() in VIDEO_EXTS)
    if not videos:
        print(f"[error] no videos found in {args.videos_dir}", file=sys.stderr)
        sys.exit(2)

    existing_hashes = set()
    for p in out_dir.glob("labels_*.json"):
        try:
            with open(p, "r", encoding="utf-8") as f:
                existing_hashes.add(json.load(f).get("video_hash", "")[:8])
        except Exception:
            pass

    skipped = 0
    written = 0
    for vid in videos:
        h = video_hash(vid)[:8]
        if h in existing_hashes:
            print(f"[skip] {vid.name} — labels already exist (hash {h})")
            skipped += 1
            continue
        out = label_video(
            movenet, bundle, vid,
            min_conf=args.min_conf,
            sport=args.sport,
            player_position=args.player_position,
            out_dir=out_dir,
        )
        if out:
            written += 1

    print(f"\n[done] {written} new labels written, {skipped} videos skipped (already labelled)")
    print(f"       review them by uploading each video at /label")
    print(f"       or pass --labels-dir {out_dir} to extract_poses.py")


if __name__ == "__main__":
    main()
