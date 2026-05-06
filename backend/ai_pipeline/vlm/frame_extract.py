"""Extract a small set of keyframes around a shot moment for VLM analysis.

VLMs are expensive (latency + cost), so we don't send full video — we send
3-5 keyframes spaced across the shot window. The middle frame is usually
the contact moment (peak motion), which carries the most signal.
"""
from __future__ import annotations

import base64
import io
from pathlib import Path

import cv2
import numpy as np


def _crop_to_region(frame_bgr: np.ndarray, target_player: str | None) -> np.ndarray:
    """Same region-crop convention as ai_pipeline/pose.py."""
    boxes = {
        "near":         (0.35, 1.0,  0.0, 1.0),
        "far":          (0.0,  0.65, 0.0, 1.0),
        "bottom":       (0.35, 1.0,  0.0, 1.0),
        "top":          (0.0,  0.65, 0.0, 1.0),
        "left":         (0.0,  1.0,  0.0, 0.5),
        "right":        (0.0,  1.0,  0.5, 1.0),
        "top-left":     (0.0,  0.5,  0.0, 0.5),
        "top-right":    (0.0,  0.5,  0.5, 1.0),
        "bottom-left":  (0.5,  1.0,  0.0, 0.5),
        "bottom-right": (0.5,  1.0,  0.5, 1.0),
    }
    if not target_player or target_player == "auto":
        return frame_bgr
    box = boxes.get(target_player)
    if not box:
        return frame_bgr
    h, w = frame_bgr.shape[:2]
    y1f, y2f, x1f, x2f = box
    y1, y2 = int(y1f * h), int(y2f * h)
    x1, x2 = int(x1f * w), int(x2f * w)
    pad_y, pad_x = int((y2 - y1) * 0.1), int((x2 - x1) * 0.1)
    return frame_bgr[max(0, y1 - pad_y):min(h, y2 + pad_y),
                     max(0, x1 - pad_x):min(w, x2 + pad_x)]


def extract_keyframes(
    video_path: Path | str,
    start_sec: float | None = None,
    end_sec: float | None = None,
    n_frames: int = 5,
    target_player: str = "auto",
    max_dim: int = 720,
) -> list[np.ndarray]:
    """Sample n_frames evenly across the shot window.

    Returns BGR numpy arrays. Frames are cropped to target_player and
    downscaled so the long edge is ≤max_dim (saves API tokens / latency).
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total / fps if fps else 0

    s = int((start_sec or 0.0) * fps)
    e = int((end_sec * fps) if end_sec else total)
    s, e = max(0, s), min(total, max(s + 1, e))
    if e <= s:
        cap.release()
        return []

    indices = np.linspace(s, e - 1, n_frames).astype(int)
    out: list[np.ndarray] = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        frame = _crop_to_region(frame, target_player)
        h, w = frame.shape[:2]
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
        out.append(frame)
    cap.release()
    return out


def frame_to_jpeg_bytes(frame_bgr: np.ndarray, quality: int = 85) -> bytes:
    ok, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes() if ok else b""


def frame_to_base64(frame_bgr: np.ndarray, quality: int = 85) -> str:
    return base64.b64encode(frame_to_jpeg_bytes(frame_bgr, quality)).decode("ascii")
