"""Per-clip technique metrics derived from the pose tensor.

Inputs everywhere: pose tensor of shape (T, 17, 3) with channels (y, x, conf)
in normalized image coordinates. Output: each metric in [0, 1] (×100 for
the frontend's 0–100 scale).

MoveNet keypoint indices (canonical order):
    0=nose, 1=left_eye, 2=right_eye, 3=left_ear, 4=right_ear,
    5=left_shoulder, 6=right_shoulder, 7=left_elbow, 8=right_elbow,
    9=left_wrist, 10=right_wrist, 11=left_hip, 12=right_hip,
    13=left_knee, 14=right_knee, 15=left_ankle, 16=right_ankle.

Frontend `METRIC_WEIGHTS` (sums to 1.0):
    form_score=0.25, consistency_score=0.20, range_of_motion=0.15,
    balance_score=0.15, elbow_angle_quality=0.10, wrist_action=0.10,
    footwork_score=0.05.
"""
from __future__ import annotations

import math
from typing import Iterable

import numpy as np


# Joint indices
LSH, RSH = 5, 6
LEL, REL = 7, 8
LWR, RWR = 9, 10
LHP, RHP = 11, 12
LKN, RKN = 13, 14
LAN, RAN = 15, 16

# Per-shot expected elbow angle at contact frame (degrees). Empirical.
ELBOW_OPTIMUM = {
    "smash":    (160.0, 12.0),
    "clear":    (170.0, 12.0),
    "drop":     (130.0, 15.0),
    "drive":    (110.0, 20.0),
    "net_shot": ( 95.0, 20.0),
    "serve":    (115.0, 20.0),
    "lift":     (130.0, 20.0),
    "block":    (105.0, 25.0),
}

# Frontend's score weights — duplicated here so the backend computes the
# same "overall" the UI would. Keep in sync with constants.js:METRIC_WEIGHTS.
METRIC_WEIGHTS = {
    "form_score": 0.25,
    "consistency_score": 0.20,
    "range_of_motion": 0.15,
    "balance_score": 0.15,
    "elbow_angle_quality": 0.10,
    "wrist_action": 0.10,
    "footwork_score": 0.05,
}


def _safe(v: float) -> float:
    if v is None or math.isnan(v) or math.isinf(v):
        return 0.0
    return max(0.0, min(1.0, float(v)))


def _angle_deg(p_a: np.ndarray, p_b: np.ndarray, p_c: np.ndarray) -> float:
    """Angle at vertex b made by segments b→a and b→c, in degrees.

    Handles the standard pose-coords convention here: input points are (y, x).
    """
    v1 = np.array([p_a[1] - p_b[1], p_a[0] - p_b[0]], dtype=np.float32)
    v2 = np.array([p_c[1] - p_b[1], p_c[0] - p_b[0]], dtype=np.float32)
    n1 = np.linalg.norm(v1); n2 = np.linalg.norm(v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return float("nan")
    c = float(np.dot(v1, v2) / (n1 * n2))
    c = max(-1.0, min(1.0, c))
    return float(math.degrees(math.acos(c)))


def _pick_active_arm(pose: np.ndarray) -> tuple[int, int, int]:
    """Return (shoulder, elbow, wrist) indices of the more active arm.

    Picks whichever wrist has higher mean confidence × travel.
    """
    travel_l = float(np.linalg.norm(np.diff(pose[:, LWR, :2], axis=0), axis=1).sum())
    travel_r = float(np.linalg.norm(np.diff(pose[:, RWR, :2], axis=0), axis=1).sum())
    conf_l = float(pose[:, LWR, 2].mean())
    conf_r = float(pose[:, RWR, 2].mean())
    score_l = travel_l * conf_l
    score_r = travel_r * conf_r
    if score_r >= score_l:
        return RSH, REL, RWR
    return LSH, LEL, LWR


def _contact_frame(pose: np.ndarray, wrist_idx: int) -> int:
    """Heuristic contact-frame: frame with the highest wrist-y velocity
    magnitude (peak swing). Returns an index into pose."""
    wy = pose[:, wrist_idx, 0]
    if len(wy) < 3:
        return len(wy) // 2
    dy = np.abs(np.diff(wy))
    return int(np.argmax(dy)) + 1  # +1 because diff shifts indices


# ─────────────────────────── individual metrics ───────────────────────────

def consistency_score(pose: np.ndarray) -> float:
    """1 − temporal jitter on smoothed wrist trajectory."""
    sh, el, wr = _pick_active_arm(pose)
    traj = pose[:, wr, :2]
    if len(traj) < 4:
        return 0.5
    # smooth then compare smoothed to raw — high jitter = low consistency
    k = np.ones(3, dtype=np.float32) / 3.0
    sm = np.stack([np.convolve(traj[:, c], k, mode="same") for c in range(2)], axis=1)
    jitter = float(np.linalg.norm(traj - sm, axis=1).mean())
    return _safe(1.0 - jitter * 30.0)  # heuristic scale


def range_of_motion(pose: np.ndarray) -> float:
    """(max − min)(shoulder + elbow angles) over windup→contact, normalized."""
    sh, el, wr = _pick_active_arm(pose)
    angles = np.array([_angle_deg(pose[t, sh], pose[t, el], pose[t, wr])
                       for t in range(len(pose))], dtype=np.float32)
    angles = angles[~np.isnan(angles)]
    if len(angles) < 3:
        return 0.5
    rng = float(angles.max() - angles.min())
    # Expected useful range of motion: 60–220°.
    return _safe((rng - 30.0) / 160.0)


def balance_score(pose: np.ndarray) -> float:
    """1 − ‖mid_hip_x − mid_ankle_x‖ averaged over clip. Penalizes leaning."""
    mid_hip_x = (pose[:, LHP, 1] + pose[:, RHP, 1]) / 2.0
    mid_ank_x = (pose[:, LAN, 1] + pose[:, RAN, 1]) / 2.0
    diff = np.abs(mid_hip_x - mid_ank_x)
    diff = diff[~np.isnan(diff)]
    if not len(diff):
        return 0.5
    return _safe(1.0 - float(diff.mean()) * 4.0)


def elbow_angle_quality(pose: np.ndarray, shot_type: str | None) -> float:
    """Gaussian centered on shot-specific optimum elbow angle at contact."""
    sh, el, wr = _pick_active_arm(pose)
    cf = _contact_frame(pose, wr)
    angle = _angle_deg(pose[cf, sh], pose[cf, el], pose[cf, wr])
    if math.isnan(angle):
        return 0.5
    optimum, sigma = ELBOW_OPTIMUM.get(shot_type or "smash", (150.0, 25.0))
    return _safe(math.exp(-((angle - optimum) ** 2) / (2 * sigma ** 2)))


def wrist_action(pose: np.ndarray) -> float:
    """Wrist angular velocity in last 5 frames before contact, normalized."""
    sh, el, wr = _pick_active_arm(pose)
    cf = _contact_frame(pose, wr)
    lo = max(0, cf - 5); hi = max(lo + 2, cf)
    seg = pose[lo:hi, wr, :2]
    if len(seg) < 2:
        return 0.5
    vel = float(np.linalg.norm(np.diff(seg, axis=0), axis=1).mean())
    return _safe(vel * 25.0)


def footwork_score(pose: np.ndarray, fps: float) -> float:
    """Ankle keypoint travel ÷ clip duration, normalized."""
    travel_l = float(np.linalg.norm(np.diff(pose[:, LAN, :2], axis=0), axis=1).sum())
    travel_r = float(np.linalg.norm(np.diff(pose[:, RAN, :2], axis=0), axis=1).sum())
    duration = max(1.0, len(pose) / max(fps, 1e-3))
    travel_per_sec = (travel_l + travel_r) / duration
    return _safe(travel_per_sec * 6.0)


def form_score(pose: np.ndarray, shot_type: str | None) -> float:
    """First-pass: average of elbow_angle_quality and range_of_motion.

    A future iteration replaces this with cosine similarity to a
    per-shot pose-trajectory centroid stored in form_centroids.npz.
    """
    eaq = elbow_angle_quality(pose, shot_type)
    rom = range_of_motion(pose)
    return _safe(0.6 * eaq + 0.4 * rom)


def compute_all(pose: np.ndarray, shot_type: str | None, fps: float) -> dict[str, float]:
    metrics = {
        "form_score":          form_score(pose, shot_type),
        "consistency_score":   consistency_score(pose),
        "range_of_motion":     range_of_motion(pose),
        "balance_score":       balance_score(pose),
        "elbow_angle_quality": elbow_angle_quality(pose, shot_type),
        "wrist_action":        wrist_action(pose),
        "footwork_score":      footwork_score(pose, fps),
    }
    return {k: round(float(v) * 100.0, 1) for k, v in metrics.items()}


def overall_score(metrics_pct: dict[str, float]) -> float:
    """Weighted sum matching METRIC_WEIGHTS. Output 0–100."""
    total = 0.0
    for k, w in METRIC_WEIGHTS.items():
        total += w * float(metrics_pct.get(k, 0.0))
    return round(total, 1)


# ─────────────────────────── derived / display ───────────────────────────

def grade_from_score(score: float) -> str:
    if score >= 85: return "A"
    if score >= 70: return "B"
    if score >= 55: return "C"
    if score >= 40: return "D"
    return "F"


def skill_level_from_score(score: float, speed_kmh: float | None,
                            speed_thresholds: dict[str, float] | None = None) -> str:
    """Frontend skill level. Speed boost lifts the level by at most 1 tier."""
    if score >= 85: base = "Pro"
    elif score >= 70: base = "Advanced"
    elif score >= 50: base = "Intermediate"
    else: base = "Beginner"

    if speed_kmh is not None and speed_thresholds:
        order = ["Beginner", "Intermediate", "Advanced", "Pro"]
        if speed_kmh >= speed_thresholds.get("pro", 1e9):       boost = "Pro"
        elif speed_kmh >= speed_thresholds.get("advanced", 1e9): boost = "Advanced"
        elif speed_kmh >= speed_thresholds.get("intermediate", 1e9): boost = "Intermediate"
        else: boost = "Beginner"
        # Cap the boost at one tier above the score-based level.
        bi, gi = order.index(base), order.index(boost)
        return order[min(len(order) - 1, max(bi, min(bi + 1, gi)))]
    return base


# ─────────────────────────── shuttle speed (placeholder) ───────────────────────────

def estimate_speed_kmh_placeholder(pose: np.ndarray, fps: float, src_w: int, src_h: int) -> float:
    """Coarse speed estimate from wrist velocity until TrackNet shuttle is wired up.

    Assumes ~1.5 m wide playable region per frame width (court near ~2× frame width).
    Returns 0 when motion is too low to estimate."""
    sh, el, wr = _pick_active_arm(pose)
    seg = pose[:, wr, :2]
    if len(seg) < 3:
        return 0.0
    # Use 95th-percentile per-frame displacement (not just mean) — proxy for shot impulse.
    disp = np.linalg.norm(np.diff(seg, axis=0), axis=1)
    p95 = float(np.quantile(disp, 0.95))
    # Convert from normalized pose coords to meters, then to km/h.
    meters_per_norm_unit = 1.5  # very rough — refine with TrackNet + homography
    m_per_frame = p95 * meters_per_norm_unit
    return round(m_per_frame * float(fps) * 3.6, 1)
