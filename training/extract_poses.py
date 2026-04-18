"""
Extract pose features from labeled clips.

Inputs:
  - Labels are pulled from the live API: GET /api/labels/export
  - Source videos must be on your local disk in --videos-dir
    (matched by `video_filename` from the label session)

Output:
  - features.npz: arrays {X: [N, F], y: [N], labels: [...], meta: [...]}
    where F is the flattened pose-feature vector for each clip.

Run:
  python extract_poses.py \
      --videos-dir "C:/Users/mundr/Videos/badminton_clips" \
      --api https://athlyticai.com \
      --sport badminton \
      --out features.npz
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np
import requests

# 33 pose landmarks × (x, y, z, visibility) = 132 features per frame
NUM_LANDMARKS = 33
FRAMES_PER_CLIP = 12  # uniform sample within [start, end]

mp_pose = mp.solutions.pose


def fetch_labels(api: str, sport: Optional[str] = None) -> list[dict]:
    url = f"{api.rstrip('/')}/api/labels/export"
    params = {"sport": sport} if sport else {}
    print(f"[fetch] GET {url} {params}")
    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    sessions = data.get("sessions", [])
    print(f"[fetch] {len(sessions)} sessions, {sum(s.get('shot_count', 0) for s in sessions)} total shots")
    return sessions


def find_video(videos_dir: Path, filename: Optional[str], video_hash: str) -> Optional[Path]:
    if not filename:
        return None
    direct = videos_dir / filename
    if direct.exists():
        return direct
    # Fuzzy: any file with the same name (regardless of subfolder)
    matches = list(videos_dir.rglob(filename))
    if matches:
        return matches[0]
    # Last resort: by hash prefix in the filename
    short = video_hash[:8]
    for p in videos_dir.rglob("*"):
        if p.is_file() and short in p.stem:
            return p
    return None


def sample_frame_times(start: float, end: float, n: int) -> list[float]:
    if end <= start:
        return [start]
    return list(np.linspace(start, end, n))


def normalize_keypoints(kp: np.ndarray) -> np.ndarray:
    """Center on torso midpoint, scale by shoulder width.
    kp shape: [33, 4]  ->  returns same shape with x,y normalized.
    """
    if kp[11, 3] < 0.2 or kp[12, 3] < 0.2:  # shoulders
        return kp
    mid = (kp[11, :2] + kp[12, :2]) / 2.0
    scale = np.linalg.norm(kp[11, :2] - kp[12, :2]) + 1e-6
    out = kp.copy()
    out[:, 0] = (kp[:, 0] - mid[0]) / scale
    out[:, 1] = (kp[:, 1] - mid[1]) / scale
    return out


def extract_clip_features(
    pose: mp_pose.Pose,
    video_path: Path,
    start: float,
    end: float,
) -> Optional[np.ndarray]:
    """Returns flattened pose features: [FRAMES_PER_CLIP * 33 * 4]."""
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
        result = pose.process(rgb)
        if result.pose_landmarks:
            kp = np.array(
                [(lm.x, lm.y, lm.z, lm.visibility) for lm in result.pose_landmarks.landmark],
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

    arr = np.stack(frame_kps, axis=0)  # [FRAMES, 33, 4]
    return arr.flatten()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos-dir", required=True, type=Path)
    ap.add_argument("--api", default="https://athlyticai.com")
    ap.add_argument("--sport", default=None, help="Filter by sport (badminton/tennis/...)")
    ap.add_argument("--out", default="features.npz", type=Path)
    args = ap.parse_args()

    if not args.videos_dir.exists():
        print(f"[error] videos dir does not exist: {args.videos_dir}", file=sys.stderr)
        sys.exit(2)

    sessions = fetch_labels(args.api, args.sport)
    if not sessions:
        print("[error] no labeled sessions returned. Label some clips first via /label.", file=sys.stderr)
        sys.exit(2)

    pose = mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.4,
        min_tracking_confidence=0.4,
    )

    X: list[np.ndarray] = []
    y: list[str] = []
    meta: list[dict] = []
    missing: list[str] = []

    for session in sessions:
        vid = find_video(args.videos_dir, session.get("video_filename"), session.get("video_hash", ""))
        if not vid:
            missing.append(session.get("video_filename") or session.get("video_hash"))
            continue
        print(f"[video] {vid.name}  shots={len(session.get('shots', []))}")
        for shot in session.get("shots", []):
            label = shot.get("label")
            if not label or label == "skip":
                continue
            feats = extract_clip_features(pose, vid, shot["start"], shot["end"])
            if feats is None:
                continue
            X.append(feats)
            y.append(label)
            meta.append({
                "video": vid.name,
                "start": shot["start"],
                "end": shot["end"],
                "label": label,
                "sport": session.get("sport"),
                "speed_kmh": shot.get("speed_kmh"),
                "player_level": shot.get("player_level"),
                "player_rating": shot.get("player_rating"),
            })

    pose.close()

    if not X:
        print("[error] no features extracted. Did you label any non-skip shots?", file=sys.stderr)
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
        print(f"       drop those files into {args.videos_dir} (matching video_filename)")


if __name__ == "__main__":
    main()
