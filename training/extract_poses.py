"""
Extract pose features from labeled clips.

Inputs (pick ONE source for labels):
  --labels: path to a labels_*.json downloaded from /label
  --labels-dir: directory containing labels_*.json (concatenated)
  --api: live API base URL — pulls from /api/labels/export

Videos must be on local disk in --videos-dir (matched by video_filename).

Output:
  features.npz: arrays {X: [N, F], y: [N], labels: [...], meta: [...]}

Run examples:
  # local-first (recommended) — just put labels_*.json next to your videos
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
import urllib.request
from pathlib import Path
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np
import requests

from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

NUM_LANDMARKS = 33  # pose has 33 keypoints
FRAMES_PER_CLIP = 12

# Pose Landmarker lite — small (~5MB), fast. Downloaded once and cached.
POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
)
POSE_MODEL_PATH = Path(__file__).parent / "pose_landmarker_lite.task"


def ensure_model() -> Path:
    if POSE_MODEL_PATH.exists() and POSE_MODEL_PATH.stat().st_size > 1_000_000:
        return POSE_MODEL_PATH
    print(f"[model] downloading pose_landmarker_lite.task → {POSE_MODEL_PATH}")
    POSE_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(POSE_MODEL_URL, POSE_MODEL_PATH)
    print(f"[model] ok, {POSE_MODEL_PATH.stat().st_size // 1024} KB")
    return POSE_MODEL_PATH


def make_landmarker():
    model_path = ensure_model()
    options = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.3,
        min_pose_presence_confidence=0.3,
        min_tracking_confidence=0.3,
    )
    return mp_vision.PoseLandmarker.create_from_options(options)


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


def normalize_keypoints(kp: np.ndarray) -> np.ndarray:
    """Center on torso midpoint, scale by shoulder width."""
    # indices: 11 = left_shoulder, 12 = right_shoulder
    if kp[11, 3] < 0.2 or kp[12, 3] < 0.2:
        return kp
    mid = (kp[11, :2] + kp[12, :2]) / 2.0
    scale = np.linalg.norm(kp[11, :2] - kp[12, :2]) + 1e-6
    out = kp.copy()
    out[:, 0] = (kp[:, 0] - mid[0]) / scale
    out[:, 1] = (kp[:, 1] - mid[1]) / scale
    return out


def extract_clip_features(
    landmarker,
    video_path: Path,
    start: float,
    end: float,
) -> Optional[np.ndarray]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    sampled_times = sample_frame_times(start, end, FRAMES_PER_CLIP)
    frame_kps: list[np.ndarray] = []
    last_valid = np.zeros((NUM_LANDMARKS, 4), dtype=np.float32)

    for t in sampled_times:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, frame = cap.read()
        if not ok:
            frame_kps.append(last_valid.copy())
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        # Tasks API expects timestamps in ms, strictly increasing per landmarker instance
        ts_ms = int(t * 1000)
        try:
            result = landmarker.detect_for_video(mp_image, ts_ms)
        except Exception:
            frame_kps.append(last_valid.copy())
            continue

        if result.pose_landmarks and len(result.pose_landmarks) > 0:
            lm = result.pose_landmarks[0]
            kp = np.array(
                [(p.x, p.y, p.z, p.visibility) for p in lm],
                dtype=np.float32,
            )
            kp = normalize_keypoints(kp)
            frame_kps.append(kp)
            last_valid = kp
        else:
            frame_kps.append(last_valid.copy())

    cap.release()

    if not frame_kps:
        return None

    arr = np.stack(frame_kps, axis=0)
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
        # Default: auto-discover in videos_dir
        sessions = collect_local_labels(None, args.videos_dir)

    if not sessions:
        print("[error] no labeled sessions found. Either:", file=sys.stderr)
        print("        1) Drop labels_*.json into the videos folder and re-run", file=sys.stderr)
        print("        2) Pass --labels FILE explicitly", file=sys.stderr)
        print("        3) Use --api https://athlyticai.com if you uploaded labels", file=sys.stderr)
        sys.exit(2)

    landmarker = make_landmarker()

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
        print(f"[video] {vid.name}  {len(shots)} usable shots")
        for shot in shots:
            feats = extract_clip_features(landmarker, vid, shot["start"], shot["end"])
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
                "speed_kmh": shot.get("speed_kmh"),
                "player_level": shot.get("player_level"),
                "player_rating": shot.get("player_rating"),
            })

    landmarker.close()

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
    print(f"     samples: {len(X_arr)}  feature_dim: {X_arr.shape[1]}")
    print(f"     classes: {labels_unique}")
    counts = {l: y.count(l) for l in labels_unique}
    print(f"     counts:  {counts}")
    if missing:
        print(f"\n[warn] missing local videos for: {missing[:5]}{'...' if len(missing) > 5 else ''}")
        print(f"       drop those files into {args.videos_dir}")


if __name__ == "__main__":
    main()
