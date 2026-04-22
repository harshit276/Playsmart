"""
Optional shuttle tracking + court detection for the badminton training
pipeline. Produces OBJECTIVE shot metadata (real speed, landing
position, trajectory) instead of pure pose-based guesses.

╔═══════════════════════════════════════════════════════════════════╗
║  SETUP (one-time, on the powerful PC where you train models)       ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  1. Install PyTorch + OpenCV (if not already):                     ║
║       pip install torch torchvision opencv-python                  ║
║                                                                    ║
║  2. Clone the reference TrackNetV3 implementation into             ║
║     training/external/ so we get the well-tested model code:       ║
║       cd Playsmart/training/external                               ║
║       git clone --depth 1 https://github.com/alenzenx/TrackNetV3   ║
║                                                                    ║
║  3. Download a pretrained weights checkpoint (.pt file) from       ║
║     their release page or train your own. Place it at:             ║
║       Playsmart/training/external/TrackNetV3/exp/best.pt           ║
║     (or set TRACKNET_WEIGHTS_PATH env var to a custom path)        ║
║                                                                    ║
║  4. Run the training pipeline with shuttle tracking enabled:       ║
║       cd Playsmart/training/sports                                 ║
║       python train_for_sport.py --sport badminton \\                ║
║              --use-shuttle-tracking --use-yolo                     ║
║                                                                    ║
╚═══════════════════════════════════════════════════════════════════╝

Architecture: TrackNetV3 = U-Net + CBAM attention. Takes a 9-channel
stack (3 consecutive frames × 3 RGB) at 288×512, outputs a 3-channel
heatmap predicting shuttle position for the middle frame. Peak-pick
over the heatmap → (x, y) pixel position. Court homography converts
those pixel positions to meters → real speeds + landing regions.
"""
from __future__ import annotations

import logging
import os
import sys
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

# TrackNetV3 input expectations (matches the reference repo)
TRACKNET_INPUT_W = 512
TRACKNET_INPUT_H = 288
TRACKNET_NUM_FRAMES = 3   # frames stacked → 9-channel input

# Where the user-cloned repo + weights live
EXTERNAL_DIR = Path(__file__).parent.parent / "external"
TRACKNET_REPO_DIR = EXTERNAL_DIR / "TrackNetV3"
TRACKNET_WEIGHTS_PATH = Path(
    os.environ.get("TRACKNET_WEIGHTS_PATH", str(TRACKNET_REPO_DIR / "exp" / "best.pt"))
)


@dataclass
class ShuttleMeasurement:
    trajectory: list[tuple[float, float, float]]   # [(x_m, y_m, t_s), ...]
    peak_speed_kmh: float
    landing_court_region: str   # e.g., "front_left", "mid_right", "back_center"
    net_clearance_m: float      # rough estimate, requires 3D for accuracy
    confidence: float           # fraction of frames where shuttle was detected


# ────────────────────────────────────────────────────────────────────
# Stage 1: Court detection + homography
# ────────────────────────────────────────────────────────────────────

def detect_court_corners(frame: np.ndarray) -> Optional[np.ndarray]:
    """Detect the 4 outer corners of the badminton court using
    Hough line transform + geometric filtering. Returns a 4x2 array
    of (x, y) pixel coords in order [top-left, top-right,
    bottom-right, bottom-left] or None if detection fails."""
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    edges = cv2.Canny(gray, 50, 150)

    lines = cv2.HoughLinesP(
        edges, rho=1, theta=np.pi / 180, threshold=80,
        minLineLength=min(w, h) // 3, maxLineGap=20,
    )
    if lines is None or len(lines) < 4:
        return None

    horizontal, vertical = [], []
    for x1, y1, x2, y2 in lines[:, 0]:
        angle = np.abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
        if angle < 25 or angle > 155:
            horizontal.append((x1, y1, x2, y2))
        elif 70 < angle < 110:
            vertical.append((x1, y1, x2, y2))

    if len(horizontal) < 2 or len(vertical) < 2:
        return None

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
    """Map pixel coords → court meters (origin at back-left)."""
    corners_m = np.array([
        [0, 0],                             # tl  = back-left
        [COURT_WIDTH_M, 0],                 # tr  = back-right
        [COURT_WIDTH_M, COURT_LENGTH_M],    # br  = front-right
        [0, COURT_LENGTH_M],                # bl  = front-left
    ], dtype=np.float32)
    H, _ = cv2.findHomography(corners_px, corners_m)
    return H


def pixel_to_meters(H: np.ndarray, x: float, y: float) -> tuple[float, float]:
    p = np.array([x, y, 1.0])
    q = H @ p
    if abs(q[2]) < 1e-9:
        return (0.0, 0.0)
    return (float(q[0] / q[2]), float(q[1] / q[2]))


# ────────────────────────────────────────────────────────────────────
# Stage 2: Shuttle tracking via TrackNetV3
# ────────────────────────────────────────────────────────────────────

class ShuttleTracker:
    """Wraps TrackNetV3 inference. The model architecture is imported
    from the user-cloned alenzenx/TrackNetV3 repo (see SETUP at top of
    file). Weights are loaded from training/external/TrackNetV3/exp/best.pt
    by default, or wherever TRACKNET_WEIGHTS_PATH points.

    Usage:
        tracker = ShuttleTracker()
        tracker._ensure_loaded()           # raises with clear msg if setup missing
        positions = tracker.track(frames)  # list of (x, y) per frame, or None
    """

    def __init__(self):
        self._model = None
        self._device = None

    def _ensure_loaded(self):
        if self._model is not None:
            return

        # 1. Verify torch is installed
        try:
            import torch
        except ImportError as e:
            raise RuntimeError(
                "PyTorch missing. Install: pip install torch torchvision opencv-python"
            ) from e

        # 2. Verify the user cloned the reference repo
        if not TRACKNET_REPO_DIR.exists():
            raise RuntimeError(
                f"TrackNetV3 repo not found at {TRACKNET_REPO_DIR}.\n"
                f"Run:\n"
                f"  cd {EXTERNAL_DIR}\n"
                f"  git clone --depth 1 https://github.com/alenzenx/TrackNetV3"
            )

        # 3. Verify weights are present
        if not TRACKNET_WEIGHTS_PATH.exists():
            raise RuntimeError(
                f"TrackNetV3 weights not found at {TRACKNET_WEIGHTS_PATH}.\n"
                f"Either:\n"
                f"  - Download a pretrained checkpoint from the repo's release page\n"
                f"    and place it there, or\n"
                f"  - Set TRACKNET_WEIGHTS_PATH env var to a custom location"
            )

        # 4. Import the model class from the cloned repo
        sys.path.insert(0, str(TRACKNET_REPO_DIR))
        try:
            from model import TrackNetV2  # noqa: WPS433 — dynamic local import
        except ImportError as e:
            raise RuntimeError(
                f"Could not import TrackNetV2 from {TRACKNET_REPO_DIR}/model.py: {e}"
            ) from e

        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"TrackNetV3: loading weights from {TRACKNET_WEIGHTS_PATH.name} on {self._device}")

        self._model = TrackNetV2()
        ckpt = torch.load(str(TRACKNET_WEIGHTS_PATH), map_location=self._device, weights_only=False)
        # Handle both bare state_dicts and checkpoint dicts with metadata
        state_dict = ckpt.get("model_state_dict") if isinstance(ckpt, dict) else ckpt
        if state_dict is None and isinstance(ckpt, dict):
            state_dict = ckpt.get("state_dict", ckpt)
        try:
            self._model.load_state_dict(state_dict)
        except RuntimeError as e:
            # Some checkpoints have a 'module.' prefix from DataParallel
            cleaned = {k.replace("module.", "", 1): v for k, v in state_dict.items()}
            self._model.load_state_dict(cleaned)
            logger.info("TrackNetV3: stripped 'module.' prefix from state_dict")
        self._model.to(self._device).eval()
        logger.info("TrackNetV3: ready")

    def track(self, frames: list[np.ndarray]) -> list[Optional[tuple[int, int]]]:
        """Run shuttle detection on a list of consecutive video frames.
        Returns one (x, y) pixel coord per input frame (or None if no
        detection). Uses sliding 3-frame windows; the first and last
        frames inherit their nearest neighbour's prediction."""
        self._ensure_loaded()
        import torch

        if len(frames) < TRACKNET_NUM_FRAMES:
            return [None] * len(frames)

        original_h, original_w = frames[0].shape[:2]
        # Pre-resize all frames to model input size + normalise to [0, 1]
        resized = [
            cv2.resize(cv2.cvtColor(f, cv2.COLOR_BGR2RGB), (TRACKNET_INPUT_W, TRACKNET_INPUT_H))
            .astype(np.float32) / 255.0
            for f in frames
        ]

        positions: list[Optional[tuple[int, int]]] = [None] * len(frames)
        scale_x = original_w / TRACKNET_INPUT_W
        scale_y = original_h / TRACKNET_INPUT_H

        with torch.no_grad():
            for i in range(len(frames) - TRACKNET_NUM_FRAMES + 1):
                # Stack [F_i, F_i+1, F_i+2] → 9-channel tensor
                stack = np.concatenate(
                    [resized[i + k].transpose(2, 0, 1) for k in range(TRACKNET_NUM_FRAMES)],
                    axis=0,
                )  # shape: (9, H, W)
                inp = torch.from_numpy(stack).unsqueeze(0).to(self._device)  # (1, 9, H, W)
                out = self._model(inp)  # (1, 3, H, W) → 3 heatmaps for 3 frames

                # Peak-pick on the middle frame's heatmap (the strong prediction)
                heatmap = out[0, 1].cpu().numpy()    # (H, W)
                pred_xy = _peak_pick(heatmap, threshold=0.5)
                middle_idx = i + 1
                if pred_xy is not None:
                    px, py = pred_xy
                    positions[middle_idx] = (int(px * scale_x), int(py * scale_y))

        # Edge frames: copy nearest valid prediction
        if positions[1] is not None:
            positions[0] = positions[1]
        if positions[-2] is not None:
            positions[-1] = positions[-2]

        return positions


def _peak_pick(heatmap: np.ndarray, threshold: float = 0.5) -> Optional[tuple[float, float]]:
    """Find the peak of a heatmap. Returns (x, y) in heatmap coords or
    None if no peak exceeds threshold."""
    if heatmap.size == 0:
        return None
    peak_val = float(heatmap.max())
    if peak_val < threshold:
        return None
    py, px = np.unravel_index(int(np.argmax(heatmap)), heatmap.shape)
    return (float(px), float(py))


# ────────────────────────────────────────────────────────────────────
# Stage 3: Derive shot metrics from trajectory
# ────────────────────────────────────────────────────────────────────

def compute_shot_metrics(
    trajectory_px: list[Optional[tuple[int, int]]],
    timestamps: list[float],
    H: np.ndarray,
) -> Optional[ShuttleMeasurement]:
    """Pixel trajectory + court homography → real-world measurements."""
    valid = [(p, t) for p, t in zip(trajectory_px, timestamps) if p is not None]
    if len(valid) < 3:
        return None

    traj_m = [(pixel_to_meters(H, p[0], p[1]), t) for p, t in valid]
    traj = [(x, y, t) for (x, y), t in traj_m]

    # Peak speed: max ‖Δp‖/Δt
    speeds = []
    for i in range(1, len(traj)):
        x1, y1, t1 = traj[i - 1]
        x2, y2, t2 = traj[i]
        dt = t2 - t1
        if dt <= 0:
            continue
        d = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        speeds.append(d / dt)
    peak_speed_mps = max(speeds) if speeds else 0.0
    peak_speed_kmh = peak_speed_mps * 3.6

    # Landing region: final position
    final_x, final_y, _ = traj[-1]
    if final_y < COURT_LENGTH_M / 3:
        length_label = "back"
    elif final_y < 2 * COURT_LENGTH_M / 3:
        length_label = "mid"
    else:
        length_label = "front"
    if final_x < COURT_WIDTH_M / 3:
        width_label = "left"
    elif final_x < 2 * COURT_WIDTH_M / 3:
        width_label = "center"
    else:
        width_label = "right"
    landing_region = f"{length_label}_{width_label}"

    confidence = len(valid) / max(len(trajectory_px), 1)

    return ShuttleMeasurement(
        trajectory=traj,
        peak_speed_kmh=peak_speed_kmh,
        landing_court_region=landing_region,
        net_clearance_m=0.0,  # rough — needs 3D for real value
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
    """Top-level: video clip + start/end seconds → ShuttleMeasurement
    or None on failure. Safe — never raises."""
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

        # 2. Collect frames in range
        frames: list[np.ndarray] = []
        timestamps: list[float] = []
        n_frames = int((end - start) * fps)
        for i in range(n_frames):
            ok, f = cap.read()
            if not ok:
                break
            frames.append(f)
            timestamps.append(start + i / fps)
        cap.release()

        if len(frames) < 3:
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
