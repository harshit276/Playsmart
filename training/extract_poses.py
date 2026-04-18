"""
Extract pose features from labeled clips using MoveNet — the same pose
model the browser uses (@tensorflow-models/pose-detection). Keeping the
feature extractor aligned means a model trained here can be deployed to
the browser without retraining.

Inputs (pick ONE source for labels):
  --labels: path to a labels_*.json downloaded from /label
  --labels-dir: directory containing labels_*.json (concatenated)
  --api: live API base URL — pulls from /api/labels/export

Videos must be on local disk in --videos-dir (matched by video_filename).

Output:
  features.npz: arrays {X: [N, F], y: [N], labels: [...], meta: [...]}
  where F = FRAMES_PER_CLIP × 17 keypoints × 3 (y, x, confidence) = 612.

Run examples:
  # local-first — drop labels_*.json into the videos folder
  python extract_poses.py --videos-dir "C:/path/to/clips"

  # explicit labels file
  python extract_poses.py --videos-dir "./videos" --labels "./labels_abc.json"

  # API-backed
  python extract_poses.py --videos-dir "./videos" --api https://athlyticai.com
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import requests

# Quiet TensorFlow's chatty info logs before importing it.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

import tensorflow as tf
import tensorflow_hub as hub

NUM_KEYPOINTS = 17                  # MoveNet returns 17
FRAMES_PER_CLIP = 12
FEATURE_DIM = FRAMES_PER_CLIP * NUM_KEYPOINTS * 3   # 612

# MoveNet SinglePose Lightning — small (~3MB), 192×192 input, fast on CPU.
# This is the SAME model the browser uses via @tensorflow-models/pose-detection.
MOVENET_HANDLE = "https://tfhub.dev/google/movenet/singlepose/lightning/4"
MOVENET_INPUT_SIZE = 192


def load_movenet():
    """Load MoveNet from TF Hub (cached after first call)."""
    print(f"[model] loading MoveNet SinglePose Lightning")
    module = hub.load(MOVENET_HANDLE)
    movenet = module.signatures["serving_default"]
    print("[model] ok")
    return movenet


def fetch_labels_api(api: str, sport: Optional[str] = None) -> list[dict]:
    url = f"{api.rstrip('/')}/api/labels/export"
    params = {"sport": sport} if sport else {}
    print(f"[api] GET {url} {params}")
    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    sessions = data.get("sessions", [])
    print(f"[api] {len(sessions)} sessions, {sum(s.get('shot_count', 0) for s in sessions)} total shots")
    return sessions


def load_labels_file(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def collect_local_labels(labels_arg: Optional[Path], labels_dir: Optional[Path]) -> list[dict]:
    sessions: list[dict] = []
    if labels_arg:
        sessions.append(load_labels_file(labels_arg))
        print(f"[local] loaded {labels_arg.name}")
    if labels_dir:
        for p in sorted(labels_dir.glob("labels_*.json")):
            sessions.append(load_labels_file(p))
            print(f"[local] loaded {p.name}")
    return sessions


def find_video(videos_dir: Path, filename: Optional[str], video_hash: str) -> Optional[Path]:
    if not filename:
        return None
    direct = videos_dir / filename
    if direct.exists():
        return direct
    matches = list(videos_dir.rglob(filename))
    if matches:
        return matches[0]
    short = video_hash[:8] if video_hash else ""
    if short:
        for p in videos_dir.rglob("*"):
            if p.is_file() and short in p.stem:
                return p
    return None


def sample_frame_times(start: float, end: float, n: int) -> list[float]:
    if end <= start:
        return [start]
    return list(np.linspace(start, end, n))


def crop_to_quadrant(frame_bgr: np.ndarray, position: str) -> np.ndarray:
    """For doubles videos: crop to the quadrant where the labelled player is.
    Returns the original frame for 'auto' or unknown positions."""
    if not position or position == "auto":
        return frame_bgr
    h, w = frame_bgr.shape[:2]
    half_h, half_w = h // 2, w // 2
    crops = {
        "top-left":     (0, half_h, 0, half_w),
        "top-right":    (0, half_h, half_w, w),
        "bottom-left":  (half_h, h, 0, half_w),
        "bottom-right": (half_h, h, half_w, w),
    }
    box = crops.get(position)
    if not box:
        return frame_bgr
    y1, y2, x1, x2 = box
    # Add 10% padding so the player isn't clipped at the edge of the quadrant
    pad_y = int((y2 - y1) * 0.1)
    pad_x = int((x2 - x1) * 0.1)
    y1 = max(0, y1 - pad_y)
    y2 = min(h, y2 + pad_y)
    x1 = max(0, x1 - pad_x)
    x2 = min(w, x2 + pad_x)
    return frame_bgr[y1:y2, x1:x2]


def detect_pose(movenet, frame_bgr: np.ndarray, player_position: str = "auto") -> np.ndarray:
    """Run MoveNet on one BGR frame. Returns [17, 3] = (y, x, confidence)
    in normalized [0,1] image coordinates. If player_position is set,
    crops to that quadrant first so MoveNet picks the intended player."""
    cropped = crop_to_quadrant(frame_bgr, player_position)
    rgb = cv2.cvtColor(cropped, cv2.COLOR_BGR2RGB)
    h, w = rgb.shape[:2]
    scale = MOVENET_INPUT_SIZE / max(h, w)
    new_h, new_w = int(round(h * scale)), int(round(w * scale))
    resized = cv2.resize(rgb, (new_w, new_h))
    pad_h = MOVENET_INPUT_SIZE - new_h
    pad_w = MOVENET_INPUT_SIZE - new_w
    padded = cv2.copyMakeBorder(resized, 0, pad_h, 0, pad_w, cv2.BORDER_CONSTANT, value=(0, 0, 0))
    inp = tf.cast(tf.convert_to_tensor(padded[None, ...]), dtype=tf.int32)
    out = movenet(inp)
    kp = out["output_0"].numpy()[0, 0]  # [17, 3]
    return kp


def normalize_keypoints(kp: np.ndarray) -> np.ndarray:
    """Center on torso midpoint, scale by shoulder width.
    MoveNet keypoint indices:
      5 = left_shoulder, 6 = right_shoulder
    """
    if kp[5, 2] < 0.2 or kp[6, 2] < 0.2:
        return kp.copy()
    mid_y = (kp[5, 0] + kp[6, 0]) / 2.0
    mid_x = (kp[5, 1] + kp[6, 1]) / 2.0
    scale = max(1e-6, np.sqrt((kp[5, 0] - kp[6, 0]) ** 2 + (kp[5, 1] - kp[6, 1]) ** 2))
    out = kp.copy()
    out[:, 0] = (kp[:, 0] - mid_y) / scale
    out[:, 1] = (kp[:, 1] - mid_x) / scale
    return out


def extract_clip_features(
    movenet,
    video_path: Path,
    start: float,
    end: float,
    player_position: str = "auto",
) -> Optional[np.ndarray]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    sampled_times = sample_frame_times(start, end, FRAMES_PER_CLIP)
    frame_kps: list[np.ndarray] = []
    last_valid = np.zeros((NUM_KEYPOINTS, 3), dtype=np.float32)

    for t in sampled_times:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, frame = cap.read()
        if not ok:
            frame_kps.append(last_valid.copy())
            continue
        try:
            kp = detect_pose(movenet, frame, player_position)
        except Exception:
            frame_kps.append(last_valid.copy())
            continue
        kp = normalize_keypoints(kp.astype(np.float32))
        frame_kps.append(kp)
        last_valid = kp

    cap.release()

    if not frame_kps:
        return None

    arr = np.stack(frame_kps, axis=0)   # [FRAMES, 17, 3]
    return arr.flatten()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos-dir", type=Path, default=Path("."),
                    help="Folder containing video files and labels_*.json")
    ap.add_argument("--labels", default=None, type=Path,
                    help="Path to a single labels_*.json")
    ap.add_argument("--labels-dir", default=None, type=Path,
                    help="Folder containing labels_*.json (loads all)")
    ap.add_argument("--api", default=None,
                    help="API base URL (only used if --labels/--labels-dir not given)")
    ap.add_argument("--sport", default=None, help="API mode: filter by sport")
    ap.add_argument("--out", default="features.npz", type=Path)
    args = ap.parse_args()

    if not args.videos_dir.exists():
        print(f"[error] videos dir does not exist: {args.videos_dir}", file=sys.stderr)
        sys.exit(2)

    if args.labels or args.labels_dir:
        sessions = collect_local_labels(args.labels, args.labels_dir)
    elif args.api:
        sessions = fetch_labels_api(args.api, args.sport)
    else:
        sessions = collect_local_labels(None, args.videos_dir)

    if not sessions:
        print("[error] no labeled sessions found. Either:", file=sys.stderr)
        print("        1) Drop labels_*.json into the videos folder and re-run", file=sys.stderr)
        print("        2) Pass --labels FILE explicitly", file=sys.stderr)
        print("        3) Use --api https://athlyticai.com if you uploaded labels", file=sys.stderr)
        sys.exit(2)

    movenet = load_movenet()

    X: list[np.ndarray] = []
    y: list[str] = []
    meta: list[dict] = []
    missing: list[str] = []

    for session in sessions:
        vid = find_video(args.videos_dir, session.get("video_filename"), session.get("video_hash", ""))
        if not vid:
            missing.append(session.get("video_filename") or session.get("video_hash"))
            continue
        shots = [s for s in session.get("shots", []) if s.get("label") and s["label"] not in ("skip", "discard")]
        position = session.get("player_position") or "auto"
        pos_note = f" [crop={position}]" if position != "auto" else ""
        print(f"[video] {vid.name}  {len(shots)} usable shots{pos_note}")
        for shot in shots:
            feats = extract_clip_features(movenet, vid, shot["start"], shot["end"], player_position=position)
            if feats is None:
                continue
            X.append(feats)
            y.append(shot["label"])
            meta.append({
                "video": vid.name,
                "start": shot["start"],
                "end": shot["end"],
                "label": shot["label"],
                "sport": session.get("sport"),
                "player_position": position,
                "speed_kmh": shot.get("speed_kmh"),
                "player_level": shot.get("player_level"),
                "player_rating": shot.get("player_rating"),
            })

    if not X:
        print("[error] no features extracted. Did you label any non-skip/non-discard shots?", file=sys.stderr)
        sys.exit(3)

    X_arr = np.stack(X)
    labels_unique = sorted(set(y))
    label_to_idx = {l: i for i, l in enumerate(labels_unique)}
    y_idx = np.array([label_to_idx[l] for l in y], dtype=np.int32)

    np.savez_compressed(
        args.out,
        X=X_arr,
        y=y_idx,
        labels=np.array(labels_unique),
        meta=np.array([json.dumps(m) for m in meta]),
    )
    print(f"\n[ok] saved {args.out}")
    print(f"     samples: {len(X_arr)}  feature_dim: {X_arr.shape[1]}  (12 frames × 17 kp × 3)")
    print(f"     classes: {labels_unique}")
    counts = {l: y.count(l) for l in labels_unique}
    print(f"     counts:  {counts}")
    if missing:
        print(f"\n[warn] missing local videos for: {missing[:5]}{'...' if len(missing) > 5 else ''}")
        print(f"       drop those files into {args.videos_dir}")


if __name__ == "__main__":
    main()
