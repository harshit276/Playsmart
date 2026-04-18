"""
Extract pose features from labeled clips.

Inputs (pick ONE source for labels):
  --labels: path to a labels.json downloaded from the /label tool (preferred)
  --labels-dir: directory containing multiple labels_*.json files (concatenated)
  --api: live API base URL — pulls all labels from /api/labels/export

Source videos must be on your local disk in --videos-dir
(matched by `video_filename` from each label session).

Output:
  features.npz: arrays {X: [N, F], y: [N], labels: [...], meta: [...]}
  where F is the flattened pose-feature vector for each clip.

Run examples:
  # local-first (recommended): one or more labels_*.json files in the same folder as videos
  python extract_poses.py --videos-dir "C:/Users/mundr/Videos/badminton_clips" --labels-dir "C:/Users/mundr/Videos/badminton_clips"

  # single file
  python extract_poses.py --videos-dir "./videos" --labels "./labels_abc12345.json"

  # API-backed (only if you uploaded labels)
  python extract_poses.py --videos-dir "./videos" --api https://athlyticai.com --sport badminton
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
    """Load one or more labels_*.json exports from disk and return them in
    the same shape as the API returns (list of session dicts)."""
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
    ap.add_argument("--labels", default=None, type=Path,
                    help="Path to a single labels_*.json downloaded from /label")
    ap.add_argument("--labels-dir", default=None, type=Path,
                    help="Folder containing labels_*.json files (loads all)")
    ap.add_argument("--api", default=None,
                    help="API base URL (only used if --labels and --labels-dir are not given)")
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
        # Default: look for labels_*.json in the videos dir itself
        sessions = collect_local_labels(None, args.videos_dir)

    if not sessions:
        print("[error] no labeled sessions found. Either:", file=sys.stderr)
        print("        1) Download labels.json from /label and pass --labels FILE", file=sys.stderr)
        print("        2) Drop labels_*.json into --videos-dir", file=sys.stderr)
        print("        3) Use --api https://athlyticai.com if you uploaded labels", file=sys.stderr)
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
            if not label or label in ("skip", "discard"):
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
