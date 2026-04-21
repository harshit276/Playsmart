"""
Optional shuttle tracking + court detection for the badminton training
pipeline. Produces OBJECTIVE shot metadata (real speed, landing
position, trajectory) instead of pure pose-based guesses.

Usage: invoked from train_for_sport.py when --use-shuttle-tracking is
set. Each clip gets augmented with:
  {
    "shuttle_trajectory": [(x, y, t), ...]   # normalized to court meters
    "peak_speed_kmh": 185.3                  # real, not estimated
    "landing_court_region": "back_left"      # front/mid/back × left/right
    "net_clearance_m": 0.3                   # how high over net
  }

Dependencies (opt-in):
  pip install ultralytics opencv-python torch

Implementation strategy:
  1. Court detection via Hough line transform — extracts court
     boundary (4 corners). Uses known badminton court dimensions
     (13.4m × 6.1m singles) to build a pixel→meter homography.
  2. Shuttle tracking via TrackNetV3 — CNN trained on small-fast
     sport objects. Downloads weights on first run (~174 MB).
     Produces shuttle (x, y) per frame.
  3. From trajectory + homography: real speed, landing position,
     net clearance.

Currently skeleton — each of the three stages is a TODO but the API
shape is locked so the training pipeline can call it with confidence.
"""
from __future__ import annotations

import logging
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Real badminton court dimensions (doubles outer lines)
COURT_WIDTH_M = 6.1
COURT_LENGTH_M = 13.4
NET_HEIGHT_M = 1.55

TRACKNET_WEIGHTS_URL = "https://github.com/alenzenx/TrackNetV3/releases/download/v1.0/TrackNet_best.pt"
TRACKNET_WEIGHTS_PATH = Path(__file__).parent.parent / "external" / "tracknet_v3.pt"


@dataclass
class ShuttleMeasurement:
    trajectory: list[tuple[float, float, float]]   # [(x_m, y_m, t_s), ...]
    peak_speed_kmh: float
    landing_court_region: str   # e.g., "front_left", "mid_right", "back_center"
    net_clearance_m: float      # max height above net (if positive, cleared)
    confidence: float           # 0-1, how much we trust this measurement


# ────────────────────────────────────────────────────────────────────
# Stage 1: Court detection + homography
# ────────────────────────────────────────────────────────────────────

def detect_court_corners(frame: np.ndarray) -> Optional[np.ndarray]:
    """Detect the 4 outer corners of the badminton court using
    Hough line transform + geometric filtering. Returns a 4x2 array
    of (x, y) pixel coords in order [top-left, top-right,
    bottom-right, bottom-left] or None if detection fails.

    The approach: Canny edge detection → probabilistic Hough lines →
    filter near-horizontal and near-vertical lines → intersect to find
    the 4 extreme corners.
    """
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    # Badminton court lines are typically white on wood/sport flooring
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    edges = cv2.Canny(gray, 50, 150)

    lines = cv2.HoughLinesP(
        edges, rho=1, theta=np.pi / 180, threshold=80,
        minLineLength=min(w, h) // 3, maxLineGap=20,
    )
    if lines is None or len(lines) < 4:
        return None

    # Split into "horizontal" (small angle) and "vertical" (near 90 deg)
    horizontal, vertical = [], []
    for x1, y1, x2, y2 in lines[:, 0]:
        angle = np.abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
        if angle < 25 or angle > 155:
            horizontal.append((x1, y1, x2, y2))
        elif 70 < angle < 110:
            vertical.append((x1, y1, x2, y2))

    if len(horizontal) < 2 or len(vertical) < 2:
        return None

    # Pick the outermost (top/bottom + left/right) lines
    top = min(horizontal, key=lambda L: min(L[1], L[3]))
    bottom = max(horizontal, key=lambda L: max(L[1], L[3]))
    left = min(vertical, key=lambda L: min(L[0], L[2]))
    right = max(vertical, key=lambda L: max(L[0], L[2]))

    def intersect(L1, L2):
        x1, y1, x2, y2 = L1
        x3, y3, x4, y4 = L2
        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(denom) < 1e-6:
            return None
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))

    tl = intersect(top, left)
    tr = intersect(top, right)
    br = intersect(bottom, right)
    bl = intersect(bottom, left)
    if any(p is None for p in (tl, tr, br, bl)):
        return None
    return np.array([tl, tr, br, bl], dtype=np.float32)


def compute_court_homography(corners_px: np.ndarray) -> np.ndarray:
    """Given 4 court corners in pixel coords, return a 3x3 homography
    matrix that maps pixels → court meters (with origin at front-left)."""
    corners_m = np.array([
        [0, 0],                             # top-left   = back-left
        [COURT_WIDTH_M, 0],                 # top-right  = back-right
        [COURT_WIDTH_M, COURT_LENGTH_M],    # bottom-right = front-right
        [0, COURT_LENGTH_M],                # bottom-left  = front-left
    ], dtype=np.float32)
    H, _ = cv2.findHomography(corners_px, corners_m)
    return H


def pixel_to_meters(H: np.ndarray, x: float, y: float) -> tuple[float, float]:
    """Apply homography to a single pixel point."""
    p = np.array([x, y, 1.0])
    q = H @ p
    if abs(q[2]) < 1e-9:
        return (0.0, 0.0)
    return (float(q[0] / q[2]), float(q[1] / q[2]))


# ────────────────────────────────────────────────────────────────────
# Stage 2: Shuttle tracking via TrackNetV3
# ────────────────────────────────────────────────────────────────────

def ensure_tracknet_weights() -> Path:
    """Download TrackNetV3 weights if missing. ~174 MB, one-time."""
    if TRACKNET_WEIGHTS_PATH.exists() and TRACKNET_WEIGHTS_PATH.stat().st_size > 100_000_000:
        return TRACKNET_WEIGHTS_PATH
    TRACKNET_WEIGHTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    logger.info(f"downloading TrackNetV3 weights to {TRACKNET_WEIGHTS_PATH}")
    urllib.request.urlretrieve(TRACKNET_WEIGHTS_URL, TRACKNET_WEIGHTS_PATH)
    return TRACKNET_WEIGHTS_PATH


class ShuttleTracker:
    """Wraps TrackNetV3 inference. Lazy-loads PyTorch + weights only
    when actually used so the rest of the training pipeline isn't
    burdened by the heavy deps."""

    def __init__(self):
        self._model = None

    def _ensure_loaded(self):
        if self._model is not None:
            return
        try:
            import torch
        except ImportError as e:
            raise RuntimeError(
                "TrackNetV3 needs torch. Install: pip install torch ultralytics"
            ) from e

        weights = ensure_tracknet_weights()
        # NOTE: actual TrackNetV3 architecture + weight loading depends on
        # the specific fork — the open-source community has a few
        # compatible variants. We load whatever's at the weights path.
        # If loading fails, the user should clone a known-working
        # TrackNetV3 fork into training/external/ and point us at its
        # __init__.py via PYTHONPATH.
        self._model = torch.load(str(weights), map_location="cpu", weights_only=False)
        if hasattr(self._model, "eval"):
            self._model.eval()
        logger.info("TrackNetV3 ready")

    def track(self, frames: list[np.ndarray]) -> list[Optional[tuple[int, int]]]:
        """Returns a list of (x, y) pixel coords per frame, or None
        where the shuttle couldn't be detected."""
        self._ensure_loaded()
        # Stub: TrackNetV3 expects 3-frame stacks and returns a
        # heatmap per center frame. We peak-pick to get the shuttle
        # position. Implementation depends on the chosen fork — the
        # shape below is what consumers expect.
        return [None] * len(frames)


# ────────────────────────────────────────────────────────────────────
# Stage 3: Derive shot metrics from trajectory
# ────────────────────────────────────────────────────────────────────

def compute_shot_metrics(
    trajectory_px: list[tuple[int, int]],
    timestamps: list[float],
    H: np.ndarray,
) -> Optional[ShuttleMeasurement]:
    """Given pixel-space shuttle trajectory + homography, compute
    real-world shot measurements."""
    valid = [(p, t) for p, t in zip(trajectory_px, timestamps) if p is not None]
    if len(valid) < 3:
        return None

    # Project to meters
    traj_m = [(pixel_to_meters(H, p[0], p[1]), t) for p, t in valid]
    traj = [(x, y, t) for (x, y), t in traj_m]

    # Peak speed: max ||Δp||/Δt between consecutive measured points
    speeds = []
    for i in range(1, len(traj)):
        x1, y1, t1 = traj[i - 1]
        x2, y2, t2 = traj[i]
        dt = t2 - t1
        if dt <= 0:
            continue
        d = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        speeds.append(d / dt)   # m/s
    peak_speed_mps = max(speeds) if speeds else 0.0
    peak_speed_kmh = peak_speed_mps * 3.6

    # Landing region: final y position (along court length) + x position
    final_x, final_y, _ = traj[-1]
    # y in court meters: 0 = back, 13.4 = front
    if final_y < COURT_LENGTH_M / 3:
        length_label = "back"
    elif final_y < 2 * COURT_LENGTH_M / 3:
        length_label = "mid"
    else:
        length_label = "front"
    # x: 0 = left, 6.1 = right
    if final_x < COURT_WIDTH_M / 3:
        width_label = "left"
    elif final_x < 2 * COURT_WIDTH_M / 3:
        width_label = "center"
    else:
        width_label = "right"
    landing_region = f"{length_label}_{width_label}"

    # Net clearance: max height above mid-court (y near COURT_LENGTH_M / 2)
    # Without 3D we approximate: assume the Y coord collapses height;
    # a real implementation needs stereo or camera calibration for 3D
    # position. This field stays rough for now.
    net_clearance = 0.0

    # Confidence: fraction of frames where shuttle was tracked
    confidence = len(valid) / max(len(trajectory_px), 1)

    return ShuttleMeasurement(
        trajectory=traj,
        peak_speed_kmh=peak_speed_kmh,
        landing_court_region=landing_region,
        net_clearance_m=net_clearance,
        confidence=confidence,
    )


# ────────────────────────────────────────────────────────────────────
# Public entry point
# ────────────────────────────────────────────────────────────────────

def measure_shot(
    video_path: Path,
    start: float,
    end: float,
    tracker: Optional[ShuttleTracker] = None,
) -> Optional[ShuttleMeasurement]:
    """Top-level function: given a video clip + start/end seconds,
    returns a ShuttleMeasurement or None if tracking/court detection
    failed. Safe to call — raises nothing, returns None on any issue."""
    try:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return None
        fps = cap.get(cv2.CAP_PROP_FPS) or 30

        # 1. Court detection on first frame of clip
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(start * fps))
        ok, first_frame = cap.read()
        if not ok:
            cap.release()
            return None
        corners = detect_court_corners(first_frame)
        if corners is None:
            cap.release()
            return None
        H = compute_court_homography(corners)

        # 2. Collect all frames in the clip range
        frames = []
        timestamps = []
        n_frames = int((end - start) * fps)
        for i in range(n_frames):
            ok, f = cap.read()
            if not ok:
                break
            frames.append(f)
            timestamps.append(start + i / fps)
        cap.release()

        if not frames:
            return None

        # 3. Shuttle tracking
        tracker = tracker or ShuttleTracker()
        try:
            traj_px = tracker.track(frames)
        except RuntimeError as e:
            logger.warning(f"shuttle tracker unavailable: {e}")
            return None

        # 4. Derive metrics
        return compute_shot_metrics(traj_px, timestamps, H)
    except Exception as e:
        logger.warning(f"measure_shot failed: {e}")
        return None
