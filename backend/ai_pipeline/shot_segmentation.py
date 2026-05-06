"""Shot segmentation — detect WHEN shots happen in a video.

Strategy:
  1. Sample frames at MOTION_SAMPLE_FPS, compute per-sample motion intensity
     via greyscale frame differencing (cheap; same as our training pipeline).
  2. Smooth the motion curve (moving average).
  3. Find local peaks above a motion threshold.
  4. Enforce a minimum gap between peaks (so a single 1-second shot doesn't
     register as 5 separate shots).
  5. Cap to the top N peaks by score.
  6. For each peak, return a (start, peak, end) window around it.

A subsequent step (per-shot pose extraction + the shot-evidence gate
already in pipeline.phase4_label) will discard moments that turn out to
be camera cuts / talking-head / replays rather than real shots.
"""
from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import cv2
import numpy as np


# Tuning constants
MOTION_SAMPLE_FPS = 5         # samples per second for motion analysis
CLIP_LEN_SEC = 3.0            # seconds per detected shot window
CLIP_HALF = CLIP_LEN_SEC / 2.0
MIN_GAP_SEC = 2.0             # min seconds between detected shots
MOTION_PERCENTILE = 88        # peaks above this percentile are candidates
MAX_SHOTS = 12                # cap the number of returned shots per video


class ShotMoment(TypedDict):
    index: int
    start_sec: float
    peak_sec: float
    end_sec: float
    motion_score: float


def _motion_curve(video_path: Path) -> tuple[np.ndarray, float, float]:
    """Returns (motion_intensity_per_sample, sample_dt, video_duration_sec)."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return np.array([]), 0.0, 0.0

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    duration = (cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) / src_fps if src_fps else 0.0
    step = max(int(round(src_fps / MOTION_SAMPLE_FPS)), 1)
    sample_dt = step / src_fps

    prev_gray = None
    motion: list[float] = []
    idx = 0

    while True:
        ok = cap.grab()
        if not ok: break
        if idx % step == 0:
            ok, frame = cap.retrieve()
            if not ok or frame is None:
                idx += 1; continue
            small = cv2.resize(frame, (320, 180))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (5, 5), 0)
            if prev_gray is not None:
                motion.append(float(cv2.absdiff(gray, prev_gray).mean()))
            prev_gray = gray
        idx += 1
    cap.release()
    return np.asarray(motion, dtype=np.float32), sample_dt, duration


def detect_shot_moments(video_path: Path | str, max_shots: int = MAX_SHOTS) -> list[ShotMoment]:
    """Detect shot moments in a video. Returns time-ordered list."""
    motion, sample_dt, duration = _motion_curve(Path(video_path))
    if motion.size < 4 or sample_dt <= 0:
        return []

    # Smooth
    kernel = np.ones(3, dtype=np.float32) / 3.0
    smoothed = np.convolve(motion, kernel, mode="same")

    threshold = float(np.percentile(smoothed, MOTION_PERCENTILE))
    candidates = np.where(smoothed >= threshold)[0]
    if candidates.size == 0:
        return []

    times = (candidates + 1) * sample_dt
    scores = smoothed[candidates]

    # Sort by score desc, enforce min gap, then re-sort by time
    order = np.argsort(-scores)
    chosen: list[tuple[float, float]] = []  # [(time, score)]
    for idx in order:
        t = float(times[idx])
        if t - CLIP_HALF < 0 or t + CLIP_HALF > duration:
            continue
        if any(abs(t - prev_t) < MIN_GAP_SEC for prev_t, _ in chosen):
            continue
        chosen.append((t, float(scores[idx])))
        if len(chosen) >= max_shots:
            break

    chosen.sort(key=lambda p: p[0])  # by time
    out: list[ShotMoment] = []
    for i, (t, s) in enumerate(chosen):
        start = max(t - CLIP_HALF, 0.0)
        end = min(t + CLIP_HALF, duration)
        out.append({
            "index": i,
            "start_sec": round(start, 3),
            "peak_sec": round(t, 3),
            "end_sec": round(end, 3),
            "motion_score": round(s, 4),
        })
    return out


def is_short_video(duration_sec: float, threshold: float = 6.0) -> bool:
    """Videos shorter than threshold are treated as a single shot — no segmentation."""
    return duration_sec <= threshold
