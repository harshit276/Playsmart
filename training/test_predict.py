"""
Quick local prediction test for the trained shot classifier.

Run examples:
  # predict a single clip from a video
  python test_predict.py --video "match.mp4" --start 12.3 --end 14.5

  # predict using a labels file (predicts every labelled shot, prints
  # the model's guess vs the true label — quick eyeball accuracy check)
  python test_predict.py --labels "labels_abc.json" --videos-dir "."

  # predict a fresh video end-to-end:
  #   1. detect shot moments (same algo as the browser tool)
  #   2. predict each
  python test_predict.py --auto-extract "match.mp4"

Defaults to model=shot_classifier.joblib next to the script.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional

import cv2
import joblib
import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

# Reuse the exact same feature pipeline the trainer used.
from extract_poses import (
    FRAMES_PER_CLIP,
    NUM_KEYPOINTS,
    extract_clip_features,
    load_movenet,
)


def load_model(path: Path):
    if not path.exists():
        raise SystemExit(f"model not found: {path} (run train_classifier.py first)")
    bundle = joblib.load(path)
    print(f"[model] loaded {path.name}")
    print(f"        classes: {list(bundle['labels'])}")
    return bundle


def predict_one(movenet, model_bundle, video: Path, start: float, end: float, position: str = "auto"):
    feats = extract_clip_features(movenet, video, start, end, player_position=position)
    if feats is None:
        return None, None, None
    model = model_bundle["model"]
    labels = list(model_bundle["labels"])
    X = feats.reshape(1, -1)

    pred_idx = int(model.predict(X)[0])
    pred_label = labels[pred_idx]

    # confidence — works for RF and MLP via predict_proba
    conf = None
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X)[0]
        conf = float(proba[pred_idx])
        # also return ranked alternatives
        ranked = sorted(zip(labels, proba), key=lambda t: -t[1])
        return pred_label, conf, ranked
    return pred_label, conf, None


def cmd_single(args, movenet, bundle):
    pred, conf, ranked = predict_one(movenet, bundle, Path(args.video), args.start, args.end, args.position)
    if pred is None:
        print("[error] could not extract features (bad clip range?)")
        sys.exit(2)
    conf_str = f"  ({conf:.0%})" if conf is not None else ""
    print(f"\n→ predicted: {pred}{conf_str}")
    if ranked:
        print("  top 3:")
        for lbl, p in ranked[:3]:
            print(f"    {lbl:<14}  {p:.1%}")


def cmd_labels(args, movenet, bundle):
    with open(args.labels, "r", encoding="utf-8") as f:
        session = json.load(f)
    videos_dir = Path(args.videos_dir)
    vid_name = session.get("video_filename")
    vid = videos_dir / vid_name if vid_name else None
    if not vid or not vid.exists():
        # fuzzy
        candidates = list(videos_dir.rglob(vid_name)) if vid_name else []
        if candidates:
            vid = candidates[0]
        else:
            print(f"[error] could not find {vid_name} in {videos_dir}", file=sys.stderr)
            sys.exit(2)

    position = session.get("player_position") or "auto"
    correct = 0
    total = 0
    print(f"[video] {vid.name}  position={position}")
    for shot in session.get("shots", []):
        true_label = shot.get("label")
        if not true_label or true_label in ("skip", "discard"):
            continue
        pred, conf, _ = predict_one(movenet, bundle, vid, shot["start"], shot["end"], position)
        total += 1
        ok = pred == true_label
        if ok:
            correct += 1
        mark = "✓" if ok else "✗"
        conf_str = f" ({conf:.0%})" if conf is not None else ""
        print(f"  {mark} t={shot['start']:.1f}-{shot['end']:.1f}s  true={true_label:<10} pred={pred}{conf_str}")
    if total:
        print(f"\n[acc] {correct}/{total} = {correct/total:.1%} on this session")


def cmd_auto_extract(args, movenet, bundle):
    # Use the same JS-style peak detector logic in Python? Simpler: chunk
    # the video into 2-second windows centered on the highest-motion frames.
    # Reuse the labelling tool's feature: for now, just sample evenly.
    cap = cv2.VideoCapture(str(args.auto_extract))
    if not cap.isOpened():
        print(f"[error] could not open {args.auto_extract}", file=sys.stderr)
        sys.exit(2)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = n_frames / fps
    cap.release()
    print(f"[video] {Path(args.auto_extract).name}  duration={duration:.1f}s")

    # Sample 1 clip every 3 seconds (centered)
    centers = np.arange(1.0, duration - 1.0, 3.0)
    print(f"        scanning {len(centers)} candidate clips at 3s intervals\n")

    results = []
    for c in centers:
        pred, conf, _ = predict_one(movenet, bundle, Path(args.auto_extract), c - 1.0, c + 1.0, args.position)
        if pred is None:
            continue
        if conf is None or conf >= args.min_conf:
            mark = ""
            if conf is not None and conf >= 0.7:
                mark = " ★"
            print(f"  t={c:5.1f}s  → {pred:<12} {f'{conf:.0%}' if conf is not None else '?':>5}{mark}")
            results.append({"t": float(c), "pred": pred, "conf": conf})

    if not results:
        print("(no clips above min-conf threshold)")
    else:
        from collections import Counter
        top = Counter(r["pred"] for r in results).most_common()
        print(f"\n[summary] {len(results)} confident predictions")
        for label, n in top:
            print(f"   {label:<14}  {n}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="shot_classifier.joblib", type=Path)
    ap.add_argument("--video", type=Path, help="single-clip mode: video path")
    ap.add_argument("--start", type=float, help="single-clip mode: start sec")
    ap.add_argument("--end", type=float, help="single-clip mode: end sec")
    ap.add_argument("--labels", type=Path, help="labels-file mode: predict every labeled shot in a labels_*.json")
    ap.add_argument("--videos-dir", default=".", type=str, help="(labels-file mode) folder containing the video")
    ap.add_argument("--auto-extract", type=Path, help="end-to-end mode: chunk a video and predict each window")
    ap.add_argument("--position", default="auto",
                    help="player position crop (auto / top-left / top-right / bottom-left / bottom-right)")
    ap.add_argument("--min-conf", type=float, default=0.0,
                    help="auto-extract: only print predictions above this confidence")
    args = ap.parse_args()

    bundle = load_model(args.model)
    movenet = load_movenet()

    if args.video and args.start is not None and args.end is not None:
        cmd_single(args, movenet, bundle)
    elif args.labels:
        cmd_labels(args, movenet, bundle)
    elif args.auto_extract:
        cmd_auto_extract(args, movenet, bundle)
    else:
        print("[usage] pick one mode:", file=sys.stderr)
        print("  --video FOO.mp4 --start 12.3 --end 14.5", file=sys.stderr)
        print("  --labels labels_abc.json --videos-dir .", file=sys.stderr)
        print("  --auto-extract FOO.mp4", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
