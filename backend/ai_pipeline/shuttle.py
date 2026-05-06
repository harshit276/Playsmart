"""Shuttle tracking + feature extraction for the shot head.

Two-tier behavior:
  Tier 1 - TrackNetV3 set up (tracknet/setup.py + extract weights):
      Calls vendored TrackNetV3 predict.py on the video, parses output CSV,
      computes 12 trajectory features, and returns real-shuttle-based speed.
  Tier 2 - TrackNet not set up:
      extract_shuttle_features_for_video returns None (caller passes zeros).
      estimate_shuttle_speed_kmh falls back to the wrist-velocity proxy.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

from .metrics import estimate_speed_kmh_placeholder

# tracknet/ folder is one level up from ai_pipeline/
TRACKNET_DIR = Path(__file__).resolve().parents[1] / "tracknet"
REPO_DIR = TRACKNET_DIR / "repo"
CKPT_DIR = TRACKNET_DIR / "ckpts"
SHUTTLE_CACHE = Path(__file__).resolve().parents[1] / "dataset" / "shuttle_cache"


def tracknet_available() -> bool:
    """Files on disk + explicit opt-in. TrackNet inference on CPU is ~8 min
    per clip, so we don't auto-enable just because the files are there.
    Set TRACKNET_ENABLE=1 to opt in."""
    import os as _os
    if _os.getenv("TRACKNET_ENABLE", "").lower() not in ("1", "true", "yes"):
        return False
    return ((REPO_DIR / "predict.py").exists() and
            (CKPT_DIR / "TrackNet_best.pt").exists() and
            (CKPT_DIR / "InpaintNet_best.pt").exists())


def _run_tracknet_on_video(video_path: Path) -> Path | None:
    """Run TrackNetV3 on a single video. Returns path to CSV or None on failure."""
    if not tracknet_available():
        return None
    SHUTTLE_CACHE.mkdir(parents=True, exist_ok=True)
    cached = SHUTTLE_CACHE / f"{video_path.stem}.csv"
    if cached.exists() and cached.stat().st_size > 50:
        return cached

    scratch = SHUTTLE_CACHE / "_scratch" / video_path.stem
    scratch.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "predict.py",
        "--video_file", str(video_path.resolve()),
        "--tracknet_file", str((CKPT_DIR / "TrackNet_best.pt").resolve()),
        "--inpaintnet_file", str((CKPT_DIR / "InpaintNet_best.pt").resolve()),
        "--save_dir", str(scratch.resolve()),
        "--batch_size", "8",
    ]
    try:
        proc = subprocess.run(cmd, cwd=REPO_DIR, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return None
    if proc.returncode != 0:
        return None
    candidates = list(scratch.glob("*.csv"))
    if not candidates:
        return None
    shutil.copy(candidates[0], cached)
    shutil.rmtree(scratch.parent, ignore_errors=True)
    return cached


def extract_shuttle_features_for_video(video_path: Path | str | None) -> np.ndarray | None:
    """Returns a 12-d shuttle feature vector for the video, or None if TrackNet
    isn't set up. Used by ai_pipeline.pipeline at inference time."""
    if video_path is None or not tracknet_available():
        return None
    csv = _run_tracknet_on_video(Path(video_path))
    if csv is None:
        return None
    # Defer import: pipeline/ may not be on path in all consumers
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from pipeline.shuttle_features import shuttle_features_from_csv
    import cv2
    cap = cv2.VideoCapture(str(video_path))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360)
    cap.release()
    return shuttle_features_from_csv(csv, clip_w=w, clip_h=h)


def estimate_shuttle_speed_kmh(
    pose: np.ndarray, fps: float, src_w: int, src_h: int,
    enable_tracknet: bool = False, video_path: Path | None = None,
) -> dict:
    """Returns {estimated_speed_kmh, source}. With TrackNet, uses shuttle
    trajectory peak speed; otherwise falls back to wrist proxy."""
    if enable_tracknet and video_path is not None and tracknet_available():
        csv = _run_tracknet_on_video(Path(video_path))
        if csv is not None:
            try:
                import pandas as pd
                df = pd.read_csv(csv)
                df = df[df["Visibility"].astype(int) > 0]
                if len(df) >= 3:
                    dx = df["X"].diff().fillna(0).to_numpy() / src_w
                    dy = df["Y"].diff().fillna(0).to_numpy() / src_h
                    speed_norm = np.sqrt(dx * dx + dy * dy)
                    # Approx: full frame width ~ 6.1 m of court (singles half)
                    meters_per_unit = 6.1 / 0.75
                    m_per_frame = float(np.quantile(speed_norm, 0.95)) * meters_per_unit
                    return {
                        "estimated_speed_kmh": round(m_per_frame * fps * 3.6, 1),
                        "source": "tracknet",
                    }
            except Exception:
                pass

    speed = estimate_speed_kmh_placeholder(pose, fps, src_w, src_h)
    return {"estimated_speed_kmh": float(speed), "source": "wrist_proxy"}
