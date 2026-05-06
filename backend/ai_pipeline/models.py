"""Model architectures + artifact loading for the badminton AI pipeline.

The shipped artifact `tcn_multitask.pt` bundles:
    - encoder weights (1D Temporal CNN over per-frame pose)
    - 3 head weights (shot, level, posture)
    - per-head temperature scalar (for calibrated confidences)
    - class label lists per head
    - input feature normalization (mean/std)
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn


# Dimensions: 17 keypoints (MoveNet-style) × 3 channels (y, x, conf) per frame.
NUM_KEYPOINTS = 17
KEYPOINT_CHANNELS = 3
INPUT_CHANNELS = NUM_KEYPOINTS * KEYPOINT_CHANNELS   # 51

# Number of evenly-sampled frames per clip used for training + inference.
FRAMES_PER_CLIP = 30

# Extra rally-context features concatenated to the encoder embedding for
# level + posture heads (NOT shot head). Order is fixed:
#   [rally_tempo, repeated_shot_consistency, shuttle_speed_p90, footwork_pattern]
RALLY_FEATURE_DIM = 4


class TCNEncoder(nn.Module):
    """Pose sequence encoder.

    Flatten-MLP encoder: feed the full (T × 51) pose tensor through a
    standard MLP. With ~1700 train clips and 30 frames per clip this
    reliably learns shot-discriminative features (a deeper TCN failed
    to fit even the training data at this scale).

    Input: (B, T=30, 51). Output: (B, hidden=128).
    """

    def __init__(self, in_ch: int = INPUT_CHANNELS, hidden: int = 128,
                 dropout: float = 0.5, frames: int = FRAMES_PER_CLIP):
        super().__init__()
        in_dim = frames * in_ch
        self.net = nn.Sequential(
            nn.Flatten(),
            nn.Linear(in_dim, 256), nn.ReLU(inplace=True), nn.Dropout(dropout),
            nn.Linear(256, hidden), nn.ReLU(inplace=True), nn.Dropout(dropout * 0.6),
        )
        self.out_dim = hidden

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def _shot_aux_features(x: torch.Tensor) -> torch.Tensor:
    """Extra hand-crafted features for the shot head only — wrist-specific
    motion descriptors that pose-only encoders struggle to extract.

    Input x: (B, T, 51) where channels are (kp0_y, kp0_x, kp0_c, kp1_y, ...).
    Returns: (B, AUX_DIM) of shot-discriminative numbers.

    Channel-index reminder (MoveNet keypoints, 3 channels each):
        right_wrist y=10*3+0=30, x=31, c=32
        left_wrist  y=9*3+0=27,  x=28, c=29
        right_shoulder y=6*3+0=18, x=19
        left_shoulder  y=5*3+0=15, x=16
        right_hip y=12*3+0=36, x=37
        left_hip  y=11*3+0=33, x=34
    """
    rwy = x[:, :, 30]; rwx = x[:, :, 31]
    lwy = x[:, :, 27]; lwx = x[:, :, 28]
    rsy = x[:, :, 18]; lsy = x[:, :, 15]
    midshy = (rsy + lsy) / 2.0           # mid-shoulder y
    midhpy = (x[:, :, 36] + x[:, :, 33]) / 2.0   # mid-hip y

    # Both wrists' velocities
    rwy_vel = rwy[:, 1:] - rwy[:, :-1]
    rwx_vel = rwx[:, 1:] - rwx[:, :-1]
    lwy_vel = lwy[:, 1:] - lwy[:, :-1]
    lwx_vel = lwx[:, 1:] - lwx[:, :-1]

    # Pick the active wrist per clip (whichever travels more in y)
    r_travel = rwy_vel.abs().sum(dim=1)
    l_travel = lwy_vel.abs().sum(dim=1)
    pick_r = (r_travel >= l_travel).float()             # (B,)
    pick_r_t = pick_r.unsqueeze(1)                       # (B, 1)
    awy = pick_r_t * rwy + (1 - pick_r_t) * lwy
    awx = pick_r_t * rwx + (1 - pick_r_t) * lwx
    awy_vel = awy[:, 1:] - awy[:, :-1]
    awx_vel = awx[:, 1:] - awx[:, :-1]

    # Position of active wrist relative to shoulders/hips
    overhead_peak = (midshy - awy).amax(dim=1)           # peak above shoulder
    avg_above_sh  = (midshy - awy).mean(dim=1)           # mean above shoulder
    below_hip_peak = (awy - midhpy).amax(dim=1)          # peak below hip

    # Velocity statistics of active wrist
    feats = torch.stack([
        awy_vel.amax(dim=1),                # max downward velocity (positive y)
        (-awy_vel).amax(dim=1),             # max upward velocity
        awy_vel.abs().mean(dim=1),          # mean abs y velocity
        awx_vel.abs().amax(dim=1),          # max horizontal velocity
        awx_vel.abs().mean(dim=1),          # mean horizontal velocity
        overhead_peak,
        avg_above_sh,
        below_hip_peak,
        # Asymmetry: which arm is more active?
        r_travel - l_travel,
        # Body center motion (nose y std as proxy for jumping/lunging)
        x[:, :, 0].std(dim=1),
        # Stance: ankle distance change
        (x[:, :, 48] - x[:, :, 45]).abs().mean(dim=1),  # right_ankle_x - left_ankle_x
    ], dim=1)
    return feats


SHOT_AUX_DIM = 11
SHUTTLE_FEATURE_DIM = 12   # mirrors pipeline/shuttle_features.SHUTTLE_FEATURE_DIM


class MultiTaskTCN(nn.Module):
    """Shared encoder + 3 heads (shot, level, posture).

    Shot head receives:
      - encoder embedding (`hidden` dims)
      - 11 hand-crafted wrist-motion features (auto-derived from pose)
      - 12 shuttle-trajectory features (from TrackNetV3, all-zero when absent)

    Backward-compatible: artifacts trained without shuttle still load — the
    `use_shuttle` flag in the saved state controls whether shuttle features
    are concatenated. Old artifacts have it absent (treated as False).
    """

    def __init__(
        self,
        n_shot: int,
        n_level: int,
        n_posture: int,
        hidden: int = 128,
        dropout: float = 0.5,
        rally_dim: int = RALLY_FEATURE_DIM,
        use_shuttle: bool = False,
    ):
        super().__init__()
        self.use_shuttle = use_shuttle
        self.encoder = TCNEncoder(hidden=hidden, dropout=dropout)
        shot_in = hidden + SHOT_AUX_DIM + (SHUTTLE_FEATURE_DIM if use_shuttle else 0)
        self.head_shot = nn.Sequential(
            nn.Linear(shot_in, 64), nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(64, n_shot),
        )
        self.head_level = nn.Sequential(
            nn.Linear(hidden + rally_dim, 64), nn.ReLU(inplace=True), nn.Dropout(dropout),
            nn.Linear(64, n_level),
        )
        self.head_posture = nn.Sequential(
            nn.Linear(hidden + rally_dim, 64), nn.ReLU(inplace=True), nn.Dropout(dropout),
            nn.Linear(64, n_posture),
        )

    def forward(
        self,
        x: torch.Tensor,                       # (B, T, 51)
        rally: torch.Tensor | None = None,     # (B, RALLY_FEATURE_DIM)
        shuttle: torch.Tensor | None = None,   # (B, SHUTTLE_FEATURE_DIM)
    ) -> dict[str, torch.Tensor]:
        emb = self.encoder(x)
        if rally is None:
            rally = torch.zeros(emb.size(0), RALLY_FEATURE_DIM,
                                dtype=emb.dtype, device=emb.device)
        emb_rally = torch.cat([emb, rally], dim=1)

        shot_pieces = [emb, _shot_aux_features(x)]
        if self.use_shuttle:
            if shuttle is None:
                shuttle = torch.zeros(emb.size(0), SHUTTLE_FEATURE_DIM,
                                      dtype=emb.dtype, device=emb.device)
            shot_pieces.append(shuttle)
        emb_shot = torch.cat(shot_pieces, dim=1)

        return {
            "shot": self.head_shot(emb_shot),
            "level": self.head_level(emb_rally),
            "posture": self.head_posture(emb_rally),
        }


# ─────────────────────────── artifact loader ───────────────────────────

ARTIFACT_PATH_DEFAULT = Path(__file__).parent / "artifacts" / "tcn_multitask.pt"


def load_artifact(path: Path | str | None = None) -> dict[str, Any]:
    """Load the trained multi-task TCN artifact.

    Returns dict with: model (nn.Module in eval mode), classes (per-head list),
    temperatures (per-head scalar), feature_mean/feature_std (51-d normalization).
    Raises FileNotFoundError if the artifact is missing — caller should handle
    by falling back to heuristic metrics.
    """
    p = Path(path or ARTIFACT_PATH_DEFAULT)
    if not p.exists():
        raise FileNotFoundError(f"artifact not found at {p}")

    art = torch.load(p, map_location="cpu", weights_only=False)
    classes = art["classes"]  # {"shot": [...], "level": [...], "posture": [...]}
    model = MultiTaskTCN(
        n_shot=len(classes["shot"]),
        n_level=len(classes["level"]),
        n_posture=len(classes["posture"]),
        use_shuttle=bool(art.get("use_shuttle", False)),
    )
    model.load_state_dict(art["model_state"])
    model.eval()
    return {
        "model": model,
        "classes": classes,
        "temperatures": art.get("temperatures", {"shot": 1.0, "level": 1.0, "posture": 1.0}),
        "feature_mean": np.asarray(art.get("feature_mean", np.zeros(INPUT_CHANNELS, dtype=np.float32))),
        "feature_std": np.asarray(art.get("feature_std", np.ones(INPUT_CHANNELS, dtype=np.float32))),
        "use_shuttle": bool(art.get("use_shuttle", False)),
        "shuttle_mean": np.asarray(art.get("shuttle_mean", np.zeros(SHUTTLE_FEATURE_DIM, dtype=np.float32))),
        "shuttle_std": np.asarray(art.get("shuttle_std", np.ones(SHUTTLE_FEATURE_DIM, dtype=np.float32))),
    }
