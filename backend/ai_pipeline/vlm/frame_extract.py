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


_REGION_BOXES = {
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


def _resolve_target_box(
    target_player: str | None,
    target_box: dict | None,
) -> tuple[float, float, float, float] | None:
    """Return (x, y, w, h) normalized 0-1 for the target player, or None.

    Priority: explicit target_box (e.g., from MoveNet) > corner hint string.
    Returns None when target is "auto" with no box — caller should leave the
    frame unannotated.
    """
    if isinstance(target_box, dict):
        try:
            x = float(target_box.get("x", 0))
            y = float(target_box.get("y", 0))
            w = float(target_box.get("width", 0))
            h = float(target_box.get("height", 0))
            if w > 0.02 and h > 0.02:
                return (
                    max(0.0, min(1.0, x)),
                    max(0.0, min(1.0, y)),
                    max(0.02, min(1.0 - x, w)),
                    max(0.02, min(1.0 - y, h)),
                )
        except (TypeError, ValueError):
            pass
    if target_player and target_player != "auto":
        rect = _REGION_BOXES.get(target_player)
        if rect:
            y1f, y2f, x1f, x2f = rect
            return (x1f, y1f, x2f - x1f, y2f - y1f)
    return None


def _draw_target_box(frame_bgr: np.ndarray, norm_box: tuple[float, float, float, float]) -> np.ndarray:
    """Draw a bright red box + TARGET label on the frame. Returns the
    modified frame (in-place mutation; returned for chaining)."""
    h, w = frame_bgr.shape[:2]
    x, y, bw, bh = norm_box
    x1, y1 = int(x * w), int(y * h)
    x2, y2 = int((x + bw) * w), int((y + bh) * h)
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    line = max(3, w // 220)
    cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), (40, 40, 255), line)
    # TARGET label
    font_scale = max(0.5, w / 1200.0)
    text = "TARGET"
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 2)
    pad = 4
    lx1, ly1 = x1, max(0, y1 - (th + pad * 2))
    lx2, ly2 = x1 + tw + pad * 2, ly1 + th + pad * 2
    cv2.rectangle(frame_bgr, (lx1, ly1), (lx2, ly2), (40, 40, 255), -1)
    cv2.putText(frame_bgr, text, (lx1 + pad, ly1 + th + pad - 2),
                cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), 2,
                lineType=cv2.LINE_AA)
    return frame_bgr


def extract_keyframes(
    video_path: Path | str,
    start_sec: float | None = None,
    end_sec: float | None = None,
    n_frames: int = 5,
    target_player: str = "auto",
    max_dim: int = 720,
    target_box: dict | None = None,
    annotate_target: bool = True,
) -> list[np.ndarray]:
    """Sample n_frames evenly across the shot window.

    Returns BGR numpy arrays. When annotate_target is True and we have a
    target box/region, the frame is kept full-resolution with a red
    bounding box drawn around the target player (preserves shuttle/ball
    trajectory context). When False, falls back to the legacy region-crop
    (smaller image, no shuttle context).
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    s = int((start_sec or 0.0) * fps)
    e = int((end_sec * fps) if end_sec else total)
    s, e = max(0, s), min(total, max(s + 1, e))
    if e <= s:
        cap.release()
        return []

    norm_box = _resolve_target_box(target_player, target_box)

    indices = np.linspace(s, e - 1, n_frames).astype(int)
    out: list[np.ndarray] = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        if norm_box and annotate_target:
            # Full-frame + annotation path (preferred).
            frame = _draw_target_box(frame, norm_box)
        elif norm_box and not annotate_target:
            # Legacy crop path (kept for A/B + fallback).
            h, w = frame.shape[:2]
            x, y, bw, bh = norm_box
            y1, y2 = int(y * h), int((y + bh) * h)
            x1, x2 = int(x * w), int((x + bw) * w)
            pad_y, pad_x = int((y2 - y1) * 0.1), int((x2 - x1) * 0.1)
            frame = frame[max(0, y1 - pad_y):min(h, y2 + pad_y),
                          max(0, x1 - pad_x):min(w, x2 + pad_x)]
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
