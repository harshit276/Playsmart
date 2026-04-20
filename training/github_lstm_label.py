"""
Auto-label badminton videos using the GitHub LSTM model
(RichardPinter/badminton_shot_type).

Their full pipeline is YOLO11x-pose + their custom code → LSTM. We
skip the heavy install and feed our existing MoveNet keypoints into
their LSTM directly. Their model just needs:
  - 41 frames per clip (we pad shorter with zeros — masking layer handles it)
  - 13 keypoints × 2 (x, y) = 26 features per frame, normalized to [0, 1]

We also fix two real bugs in their code:
  1. confidence: 0.0 (TODO in their script) — we return softmax max.
  2. Whole-video-as-one-shot — we run inference per detected shot moment.

The model has 7 output classes: index 0 appears to be a 'background /
no shot' class, indices 1-6 map to clear/drive/drop/lob/net/smash. We
classify class 0 as 'unknown' so we don't pollute the training set
with mislabeled non-shots.

Run:
   python github_lstm_label.py --video PATH [--out-dir DIR]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import numpy as np
import tensorflow as tf
import cv2

from extract_poses import load_movenet, detect_pose
from full_pipeline import detect_shot_moments, video_hash

LSTM_WEIGHTS = Path(__file__).parent / "external" / "badminton_shot_type" / "weights" / "15Matches_LSTM.h5"

# MoveNet keypoint indices for the 13 joints their LSTM expects.
# Their order (from convert_bst_to_lstm.py / training data convention):
#   nose, l_shoulder, r_shoulder, l_elbow, r_elbow, l_wrist, r_wrist,
#   l_hip, r_hip, l_knee, r_knee, l_ankle, r_ankle
MOVENET_TO_LSTM_13 = [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]

INPUT_FRAMES = 41
INPUT_FEATURES = 26  # 13 × 2 (x, y)

# 7-class output. Index 0 looks like "background" — keep it as
# 'unknown'. The remaining six map to the SHOT_TYPES list in the
# repo's run_video_classifier.py.
LSTM_CLASSES = ["unknown", "clear", "drive", "drop", "lob", "net", "smash"]


# ── Keras 3 compat — strip time_major kwarg from saved LSTM config
class CompatLSTM(tf.keras.layers.LSTM):
    @classmethod
    def from_config(cls, config):
        config.pop("time_major", None)
        return cls(**config)


def load_lstm():
    if not LSTM_WEIGHTS.exists():
        sys.exit(f"[error] LSTM weights not found at {LSTM_WEIGHTS}")
    print(f"[load] {LSTM_WEIGHTS.name}")
    return tf.keras.models.load_model(
        str(LSTM_WEIGHTS), compile=False,
        custom_objects={"LSTM": CompatLSTM},
    )


def grab_frames(video_path: Path, start: float, end: float, n: int) -> list[np.ndarray]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    times = np.linspace(start, end, n)
    frames = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, frame = cap.read()
        if ok:
            frames.append(frame)
    cap.release()
    return frames


def keypoints_to_lstm_input(keypoint_seq: list[np.ndarray]) -> np.ndarray:
    """keypoint_seq: list of [17, 3] arrays from MoveNet (y, x, conf in [0,1]).
    Returns [1, 41, 26] padded with zeros for masking."""
    arr = np.zeros((INPUT_FRAMES, INPUT_FEATURES), dtype=np.float32)
    for i, kp in enumerate(keypoint_seq[:INPUT_FRAMES]):
        for j, src_idx in enumerate(MOVENET_TO_LSTM_13):
            # Their order is (x, y) — we have MoveNet (y, x, conf)
            arr[i, j * 2 + 0] = kp[src_idx, 1]   # x
            arr[i, j * 2 + 1] = kp[src_idx, 0]   # y
    return arr.reshape(1, INPUT_FRAMES, INPUT_FEATURES)


def extract_keypoints(movenet, video_path: Path, start: float, end: float) -> list[np.ndarray]:
    """Sample frames between [start, end] and run MoveNet on each. Returns
    a list of [17, 3] arrays."""
    frames = grab_frames(video_path, start, end, INPUT_FRAMES)
    out = []
    for f in frames:
        try:
            kp = detect_pose(movenet, f)
            out.append(kp.astype(np.float32))
        except Exception:
            out.append(np.zeros((17, 3), dtype=np.float32))
    return out


def _save_partial(video_path: Path, shots: list, out_dir: Path):
    payload = {
        "video_filename": video_path.name,
        "video_hash": video_hash(video_path),
        "backend": "github_lstm",
        "shots": shots,
        "partial": True,
    }
    out_path = out_dir / f"github_labels_{video_hash(video_path)[:8]}.json"
    out_path.write_text(json.dumps(payload, indent=2))


def label_video(video_path: Path, out_dir: Path, max_clips: int = 60, movenet=None, lstm=None) -> dict:
    if movenet is None:
        movenet = load_movenet()
    if lstm is None:
        lstm = load_lstm()

    moments = detect_shot_moments(video_path)[:max_clips]
    print(f"[detect] using {len(moments)} shot moments (cap={max_clips})", flush=True)
    if not moments:
        return {"shots": [], "video_filename": video_path.name}

    shots = []
    t0 = time.time()
    for i, m in enumerate(moments):
        kp_seq = extract_keypoints(movenet, video_path, m["start"], m["end"])
        if not kp_seq:
            continue
        x = keypoints_to_lstm_input(kp_seq)
        proba = lstm.predict(x, verbose=0)[0]   # shape (7,)
        idx = int(np.argmax(proba))
        conf = float(proba[idx])
        label = LSTM_CLASSES[idx] if idx < len(LSTM_CLASSES) else "unknown"
        # Treat 'unknown' as low-quality
        if label == "unknown":
            conf = min(conf, 0.1)
        shots.append({
            "start": m["start"],
            "end": m["end"],
            "label": label if label != "unknown" else "",
            "confidence": conf,
        })
        if (i + 1) % 3 == 0:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            print(f"  {i + 1}/{len(moments)}  last: {label} @ {conf:.0%}  ({rate:.1f} clip/s)", flush=True)
            # save partial periodically — survives crashes
            if (i + 1) % 9 == 0:
                _save_partial(video_path, shots, out_dir)

    payload = {
        "video_filename": video_path.name,
        "video_hash": video_hash(video_path),
        "backend": "github_lstm",
        "shots": shots,
    }
    out_path = out_dir / f"github_labels_{video_hash(video_path)[:8]}.json"
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"[ok] {out_path.name}  total={len(shots)}")
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True, type=Path)
    ap.add_argument("--out-dir", type=Path, default=Path("pipeline_out"))
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    if not args.video.exists():
        sys.exit(f"[error] video not found: {args.video}")
    label_video(args.video, args.out_dir)


if __name__ == "__main__":
    main()
