"""Pose extraction with player crop.

Uses MediaPipe (legacy `mp.solutions.pose`) and maps its 33 BlazePose
landmarks to MoveNet's 17-keypoint topology so the same trained model
can run regardless of which pose backend is used at inference.

Why two backends compatible:
- Browser side (Playsmart frontend) uses TFJS MoveNet → 17 KP.
- Server side here uses MediaPipe Pose → 33 KP, mapped to 17 KP.
- The trained TCN sees the same 17×3 tensor shape from both.
"""
from __future__ import annotations

import sys
import types
from pathlib import Path

import cv2
import numpy as np

from .models import FRAMES_PER_CLIP, NUM_KEYPOINTS


# MediaPipe's tensorflow optional-dependency import can collide with newer
# TF versions; stub before importing.
def _stub_tensorflow_for_mediapipe() -> None:
    if "tensorflow" in sys.modules:
        return
    import importlib.machinery as _mach

    def _mk(name: str) -> types.ModuleType:
        m = types.ModuleType(name)
        m.__spec__ = _mach.ModuleSpec(name, loader=None)
        return m

    tf_stub = _mk("tensorflow")
    tools_stub = _mk("tensorflow.tools")
    docs_stub = _mk("tensorflow.tools.docs")

    class _DocControls:
        @staticmethod
        def do_not_generate_docs(obj):
            return obj

    docs_stub.doc_controls = _DocControls
    tools_stub.docs = docs_stub
    tf_stub.tools = tools_stub
    sys.modules["tensorflow"] = tf_stub
    sys.modules["tensorflow.tools"] = tools_stub
    sys.modules["tensorflow.tools.docs"] = docs_stub


_stub_tensorflow_for_mediapipe()
import mediapipe as mp  # noqa: E402
# Force-import the legacy solutions submodule (lazy on some MP versions).
from mediapipe import solutions as _mp_solutions  # noqa: E402,F401


# MediaPipe BlazePose 33-landmark index → MoveNet 17-keypoint slot.
# MoveNet order (canonical): nose, left_eye, right_eye, left_ear, right_ear,
#   left_shoulder, right_shoulder, left_elbow, right_elbow,
#   left_wrist, right_wrist, left_hip, right_hip,
#   left_knee, right_knee, left_ankle, right_ankle.
MP_TO_MOVENET = [
    0,   # nose
    2,   # left_eye  (MP 'left_eye' inner=1, center=2, outer=3 — pick center)
    5,   # right_eye
    7,   # left_ear
    8,   # right_ear
    11,  # left_shoulder
    12,  # right_shoulder
    13,  # left_elbow
    14,  # right_elbow
    15,  # left_wrist
    16,  # right_wrist
    23,  # left_hip
    24,  # right_hip
    25,  # left_knee
    26,  # right_knee
    27,  # left_ankle
    28,  # right_ankle
]


# Region cropping for match clips with known player position.
_REGION_BOXES = {
    "top-left":     (0.0, 0.5,  0.0, 0.5),
    "top-right":    (0.0, 0.5,  0.5, 1.0),
    "bottom-left":  (0.5, 1.0,  0.0, 0.5),
    "bottom-right": (0.5, 1.0,  0.5, 1.0),
    "top":          (0.0, 0.65, 0.0, 1.0),
    "bottom":       (0.35, 1.0, 0.0, 1.0),
    "near":         (0.35, 1.0, 0.0, 1.0),
    "far":          (0.0, 0.65, 0.0, 1.0),
    "left":         (0.0, 1.0,  0.0, 0.5),
    "right":        (0.0, 1.0,  0.5, 1.0),
}


def crop_to_region(frame_bgr: np.ndarray, target_player: str | None) -> np.ndarray:
    if not target_player or target_player == "auto":
        return frame_bgr
    box = _REGION_BOXES.get(target_player)
    if not box:
        return frame_bgr
    h, w = frame_bgr.shape[:2]
    y1f, y2f, x1f, x2f = box
    y1 = int(y1f * h); y2 = int(y2f * h)
    x1 = int(x1f * w); x2 = int(x2f * w)
    pad_y = int((y2 - y1) * 0.1)
    pad_x = int((x2 - x1) * 0.1)
    return frame_bgr[max(0, y1 - pad_y):min(h, y2 + pad_y),
                     max(0, x1 - pad_x):min(w, x2 + pad_x)]


def _sample_frame_indices(total: int, n: int) -> list[int]:
    if total <= 0 or n <= 0:
        return []
    if total <= n:
        return list(range(total))
    return list(np.linspace(0, total - 1, n).astype(int))


def extract_pose_tensor(
    video_path: Path | str,
    target_player: str = "auto",
    n_frames: int = FRAMES_PER_CLIP,
    start_sec: float | None = None,
    end_sec: float | None = None,
) -> tuple[np.ndarray, dict]:
    """Run pose extraction and return a (T, 17, 3) tensor in (y, x, conf) format.

    Returns (tensor, info) where info has fps, src_w, src_h, total_frames,
    detected_count (frames with a pose).
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)

    # Restrict to a time window if requested.
    if start_sec is not None or end_sec is not None:
        s = int((start_sec or 0.0) * fps)
        e = int((end_sec * fps) if end_sec else total_frames)
        s = max(0, s); e = min(total_frames, max(s + 1, e))
    else:
        s, e = 0, total_frames

    take = _sample_frame_indices(e - s, n_frames)
    out = np.zeros((n_frames, NUM_KEYPOINTS, 3), dtype=np.float32)

    pose = mp.solutions.pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.4,
        min_tracking_confidence=0.4,
    )

    detected = 0
    last_kp = np.zeros((NUM_KEYPOINTS, 3), dtype=np.float32)
    for i, rel_idx in enumerate(take):
        cap.set(cv2.CAP_PROP_POS_FRAMES, s + rel_idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            out[i] = last_kp
            continue
        focused = crop_to_region(frame, target_player)
        rgb = cv2.cvtColor(focused, cv2.COLOR_BGR2RGB)
        result = pose.process(rgb)
        if result.pose_landmarks:
            detected += 1
            lm = result.pose_landmarks.landmark
            kp = np.zeros((NUM_KEYPOINTS, 3), dtype=np.float32)
            for slot, mp_idx in enumerate(MP_TO_MOVENET):
                p = lm[mp_idx]
                # MoveNet convention: (y, x, confidence) in normalized coords.
                kp[slot] = [float(p.y), float(p.x), float(p.visibility)]
            out[i] = kp
            last_kp = kp
        else:
            out[i] = last_kp  # carry forward last good pose

    pose.close()
    cap.release()

    info = {
        "fps": float(fps),
        "src_w": src_w,
        "src_h": src_h,
        "total_frames": total_frames,
        "detected_frames": int(detected),
        "n_sampled": len(take),
        "target_player": target_player,
    }
    return out, info
