"""Public entrypoint matching playsmart's `analyze_video()` contract.

Used by `Playsmart/backend/server.py:_run_ai_pipeline`. Must return a dict
shaped per server.py:2110-2160 expectations.

Behavior tiers (all reachable today):
  Tier 1 (model artifact present):  full TCN multi-task prediction.
  Tier 2 (artifact missing):        heuristic-only labels from pose features.

Either way, returns the full schema with sensible defaults so the website
never crashes on a missing field.
"""
from __future__ import annotations

import base64
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .feedback import (
    SHOT_TIPS, POSTURE_TIPS, LEVEL_TIPS,
    build_coaching, build_pro_comparison,
)
from .metrics import (
    METRIC_WEIGHTS, compute_all, grade_from_score,
    overall_score, skill_level_from_score,
)
from .pose import extract_pose_tensor
from .shuttle import estimate_shuttle_speed_kmh

# Per-sport speed thresholds — mirror frontend SPEED_SKILL_BOOST.
SPEED_SKILL_BOOST = {
    "badminton":    {"intermediate": 60, "advanced": 100, "pro": 150},
    "table_tennis": {"intermediate": 25, "advanced": 40,  "pro": 60},
    "tennis":       {"intermediate": 60, "advanced": 90,  "pro": 130},
    "pickleball":   {"intermediate": 22, "advanced": 35,  "pro": 50},
    "cricket":      {"intermediate": 55, "advanced": 85,  "pro": 120},
}

SPORT_SHOT_TYPES = {
    "badminton": ["clear", "drop", "smash", "net_shot", "drive", "serve", "lift", "block"],
}

DEFAULT_LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"]


# ─────────────────────────── helpers ───────────────────────────

def _video_info(video_path: Path) -> dict:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return {"duration_seconds": 0.0, "resolution": "0x0", "fps": 0.0}
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    cap.release()
    return {
        "duration_seconds": float(n / fps if fps else 0.0),
        "resolution": f"{w}x{h}",
        "fps": float(fps),
    }


def _player_preview_b64(video_path: Path, target_player: str) -> str:
    """Grab the middle frame, crop to target_player region, encode as base64 JPEG."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return ""
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, n // 2))
    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        return ""
    from .pose import crop_to_region
    frame = crop_to_region(frame, target_player)
    # Cap preview to ~480px wide.
    h, w = frame.shape[:2]
    if w > 480:
        s = 480 / w
        frame = cv2.resize(frame, (480, int(h * s)))
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buf.tobytes()).decode("ascii") if ok else ""


def _heuristic_predictions(pose: np.ndarray, sport: str) -> dict[str, dict]:
    """Tier 2 fallback: simple pose heuristics for shot/level/posture.

    Mirrors the heuristic logic from the dataset-pipeline's phase4_label.py
    so we still produce believable fields when the trained TCN is missing.
    """
    # Pull joint indices (MoveNet topology)
    LSH, RSH = 5, 6
    LWR, RWR = 9, 10

    # Active wrist
    travel_l = float(np.linalg.norm(np.diff(pose[:, LWR, :2], axis=0), axis=1).sum())
    travel_r = float(np.linalg.norm(np.diff(pose[:, RWR, :2], axis=0), axis=1).sum())
    wr_idx = RWR if travel_r >= travel_l else LWR
    sh_idx = RSH if travel_r >= travel_l else LSH

    wy = pose[:, wr_idx, 0]
    sh_y = pose[:, sh_idx, 0]
    overhead_peak = float((sh_y - wy).max())  # +ve when wrist above shoulder
    wy_diff = np.diff(wy)
    max_down = float(wy_diff.max()) if len(wy_diff) else 0.0
    max_up = float(-wy_diff.min()) if len(wy_diff) else 0.0
    horiz_motion = float(np.abs(np.diff(pose[:, wr_idx, 1])).mean()) if len(pose) > 1 else 0.0

    if overhead_peak >= 0.05 and max_down >= 0.06:
        shot = "smash"
    elif overhead_peak >= 0.05 and max_up >= 0.05:
        shot = "clear"
    elif overhead_peak >= 0.04:
        shot = "drop"
    elif horiz_motion >= 0.025:
        shot = "drive"
    else:
        shot = "net_shot"

    # Crude level / posture heuristic — placeholders only.
    return {
        "shot":    {"label": shot, "confidence": 0.5},
        "level":   {"label": "Intermediate", "confidence": 0.5},
        "posture": {"label": "average",      "confidence": 0.5},
    }


def _tcn_predictions(pose: np.ndarray, video_path: Path | None = None) -> dict[str, dict] | None:
    """Tier 1: try loading the trained TCN artifact and predict 3 heads.

    If the artifact has `use_shuttle=True`, also runs TrackNetV3 on the video
    to extract shuttle features and feeds them to the shot head.
    Returns None if the artifact is missing. Caller falls back to heuristics.
    """
    try:
        from .models import load_artifact
        art = load_artifact()
    except (FileNotFoundError, ImportError):
        return None
    import torch

    mu = art["feature_mean"].reshape(1, 1, -1)
    sd = art["feature_std"].reshape(1, 1, -1) + 1e-6
    flat = pose.reshape(pose.shape[0], -1)
    norm = (flat - mu.reshape(1, -1)) / sd.reshape(1, -1)
    x = torch.tensor(norm, dtype=torch.float32).unsqueeze(0)  # (1, T, 51)

    # Shuttle features if model expects them.
    shuttle_t = None
    if art.get("use_shuttle"):
        from .shuttle import extract_shuttle_features_for_video
        shuttle_vec = extract_shuttle_features_for_video(video_path) if video_path else None
        if shuttle_vec is not None:
            smu = art.get("shuttle_mean", np.zeros_like(shuttle_vec))
            ssd = art.get("shuttle_std", np.ones_like(shuttle_vec)) + 1e-6
            shuttle_norm = (shuttle_vec - smu) / ssd
            shuttle_t = torch.tensor(shuttle_norm, dtype=torch.float32).unsqueeze(0)

    with torch.no_grad():
        out = art["model"](x, None, shuttle_t)
    pred = {}
    for head, classes in art["classes"].items():
        logits = out[head] / float(art["temperatures"].get(head, 1.0))
        probs = torch.softmax(logits, dim=1).numpy().reshape(-1)
        order = np.argsort(-probs)
        i = int(order[0])
        # Top-3 alternatives sorted by probability
        top3 = [{"label": classes[int(j)], "confidence": float(probs[int(j)])}
                for j in order[:3]]
        # Honest confidence threshold: 1/n_classes is random; require at least
        # 2× random to call it "confident". Below that → flag uncertain.
        random_baseline = 1.0 / max(len(classes), 1)
        is_confident = float(probs[i]) >= max(0.30, 2.0 * random_baseline)
        pred[head] = {
            "label": classes[i],
            "confidence": float(probs[i]),
            "is_confident": bool(is_confident),
            "top3": top3,
            "probs": {classes[j]: float(probs[j]) for j in range(len(classes))},
        }
    return pred


# ─────────────────────────── per-shot analysis ───────────────────────────

def _vlm_classify(
    video_path: Path, sport: str, target_player: str,
    start_sec: float | None, end_sec: float | None,
    backend: str = "auto",
) -> dict | None:
    """Call the VLM classifier on this shot window. Returns normalized dict
    or None on failure (caller falls back to TCN).
    """
    try:
        from .vlm import VLMShotClassifier
        clf = VLMShotClassifier(backend=backend, sport=sport)
        return clf.predict(video_path, start_sec, end_sec, target_player)
    except Exception as exc:
        print(f"[vlm] {exc.__class__.__name__}: {exc}", file=__import__('sys').stderr)
        return None


def _analyze_one_shot(
    video_path: Path, target_player: str, sport: str, fps: float,
    src_w: int, src_h: int,
    start_sec: float | None = None, end_sec: float | None = None,
    shot_index: int = 0,
    predictor: str = "tcn",     # "tcn" | "vlm" | "auto"
    vlm_backend: str = "auto",
    precomputed_vlm: dict | None = None,
) -> dict[str, Any] | None:
    """Run classification + metrics on a single shot window.

    predictor:
      - "tcn": pose-based TCN (current default; offline; ~30% shot acc)
      - "vlm": vision LLM (Gemini / Claude / OpenAI / local Qwen2.5-VL)
      - "auto": VLM if any backend is configured, else TCN

    Returns None if neither predictor + pose check produces a usable result.
    """
    # Pose features are needed regardless (for metrics, even when VLM classifies the shot).
    try:
        pose, pose_info = extract_pose_tensor(
            video_path, target_player=target_player,
            start_sec=start_sec, end_sec=end_sec,
        )
    except Exception:
        return None
    if pose_info["detected_frames"] < pose_info["n_sampled"] * 0.4:
        return None

    # ── Shot prediction
    vlm_result: dict | None = None
    used_predictor = "tcn"

    if predictor in ("vlm", "auto"):
        # Use pre-computed batch result when caller did the API call already.
        if precomputed_vlm is not None:
            vlm_result = precomputed_vlm
        else:
            vlm_result = _vlm_classify(video_path, sport, target_player, start_sec, end_sec, vlm_backend)
        if vlm_result and vlm_result.get("shot_type") not in (None, "unknown") and vlm_result.get("confidence", 0) > 0.0:
            used_predictor = "vlm"
        elif predictor == "vlm":
            # Explicit VLM mode — but it failed. Surface the failure rather than silently falling back.
            return {
                "index": shot_index,
                "start_sec": round(start_sec or 0.0, 2) if start_sec is not None else None,
                "end_sec": round(end_sec, 2) if end_sec is not None else None,
                "shot_type": "unknown",
                "shot_name": "Unknown",
                "confidence": 0.0,
                "is_confident": False,
                "top3": [],
                "level_raw": "Intermediate",
                "posture": "average",
                "metrics": dict(compute_all(pose, "smash", fps)),
                "metrics_full": compute_all(pose, "smash", fps),
                "overall_score": 0.0,
                "grade": "F",
                "speed": estimate_shuttle_speed_kmh(pose, fps, src_w, src_h),
                "predictor": "vlm",
                "vlm_meta": (vlm_result or {}).get("_meta", {"error": "VLM unavailable"}),
                "vlm_error": (vlm_result or {}).get("reasoning", "VLM not configured"),
                "_pose_info": pose_info,
            }

    if used_predictor == "vlm":
        shot_label = vlm_result["shot_type"]
        shot_conf = float(vlm_result["confidence"])
        shot_is_confident = shot_conf >= 0.5
        # Build top3 from VLM alternatives + the predicted shot itself
        top3 = [{"label": shot_label, "confidence": shot_conf}]
        for a in vlm_result.get("alternatives", []):
            if len(top3) >= 3:
                break
            if a["shot"] not in {t["label"] for t in top3}:
                top3.append({"label": a["shot"], "confidence": float(a["confidence"])})
        level_raw = vlm_result.get("estimated_skill", "Intermediate")
        ff = vlm_result.get("form_feedback", {})
        reasoning = vlm_result.get("reasoning", "")
        vlm_meta = dict(vlm_result.get("_meta", {}))
        if vlm_result.get("_raw_response"):
            vlm_meta["raw_response_preview"] = vlm_result["_raw_response"][:600]
    else:
        # TCN path (existing logic)
        pred = _tcn_predictions(pose, video_path=video_path) or _heuristic_predictions(pose, sport)
        shot_label = pred["shot"]["label"]
        shot_conf = pred["shot"]["confidence"]
        shot_is_confident = pred["shot"].get("is_confident", True)
        top3 = pred["shot"].get("top3", [{"label": shot_label, "confidence": shot_conf}])
        level_raw = pred["level"]["label"]
        ff = {}
        reasoning = ""
        vlm_meta = {}

    # ── Metrics (always pose-derived)
    metrics_full = compute_all(pose, shot_label, fps)
    metrics_for_display = dict(metrics_full)
    if not shot_is_confident:
        metrics_for_display["form_score"] = None
        metrics_for_display["elbow_angle_quality"] = None
    overall = overall_score(metrics_full)
    grade = grade_from_score(overall)

    speed_block = estimate_shuttle_speed_kmh(
        pose, fps, src_w, src_h, enable_tracknet=True, video_path=video_path,
    )
    # If VLM produced a power_level + confident shot, prefer that estimate
    # over the wrist-proxy (which under-reads ~5x for smashes). TrackNet still
    # wins when enabled (it sees the actual shuttle).
    if (used_predictor == "vlm" and vlm_result is not None
            and speed_block.get("source") != "tracknet"
            and shot_is_confident):
        from .vlm import estimate_speed_from_power
        power = vlm_result.get("power_level", "medium")
        if power:
            speed_block = estimate_speed_from_power(sport, shot_label, power)

    return {
        "index": shot_index,
        "start_sec": round(start_sec or 0.0, 2) if start_sec is not None else None,
        "end_sec": round(end_sec, 2) if end_sec is not None else None,
        "shot_type": shot_label,
        "shot_name": shot_label.replace("_", " ").title(),
        "confidence": float(shot_conf),
        "is_confident": bool(shot_is_confident),
        "top3": top3,
        "level_raw": level_raw,
        "posture": "average",
        "metrics": metrics_for_display,
        "metrics_full": metrics_full,
        "overall_score": overall,
        "grade": grade,
        "speed": speed_block,
        # VLM-specific extras (empty for TCN path)
        "reasoning": reasoning,
        "form_feedback": ff,
        "predictor": used_predictor,
        "vlm_meta": vlm_meta,
        "_pose_info": pose_info,
    }


# ─────────────────────────── aggregation across shots ───────────────────────────

def _aggregate_shots(shots: list[dict], sport: str) -> dict[str, Any]:
    """Synthesize a player-level summary across multiple detected shots."""
    from collections import Counter

    if not shots:
        return {}

    confident_shots = [s for s in shots if s.get("is_confident")]
    scoring_pool = confident_shots or shots
    distribution = Counter(s["shot_type"] for s in confident_shots)
    if not distribution:
        # No confident shots — fall back to all shots' top1
        distribution = Counter(s["shot_type"] for s in shots)

    # Average metrics + score across CONFIDENT shots only (so 0-score unknowns
    # don't drag down a player who landed two clean shots and missed two).
    keys = ["form_score", "consistency_score", "range_of_motion", "balance_score",
            "elbow_angle_quality", "wrist_action", "footwork_score"]
    avg_metrics: dict[str, float | None] = {}
    for k in keys:
        vals = [s["metrics_full"][k] for s in scoring_pool if s["metrics_full"].get(k) is not None]
        avg_metrics[k] = round(float(np.mean(vals)), 1) if vals else None

    avg_overall = round(float(np.mean([s["overall_score"] for s in scoring_pool])), 1)

    # Speed: peak across confident shots
    peak_speed = max((s["speed"]["estimated_speed_kmh"] for s in scoring_pool), default=0.0)
    speed_sources = {s["speed"].get("source") for s in scoring_pool}
    if "tracknet" in speed_sources:
        speed_source = "tracknet"
    elif "vlm_power_map" in speed_sources:
        speed_source = "vlm_power_map"
    else:
        speed_source = "wrist_proxy"

    # Skill level: score is the floor. VLM can pull it DOWN one tier (rarely
    # useful) but cannot push it UP — Gemini will happily say "Pro" on a single
    # nice net shot, which is wrong for a 24/100 overall.
    level_votes = Counter(s.get("level_raw", "Intermediate").title() for s in confident_shots)
    pred_level = level_votes.most_common(1)[0][0] if level_votes else "Intermediate"
    if pred_level not in DEFAULT_LEVELS:
        pred_level = "Intermediate"
    score_level = skill_level_from_score(avg_overall, peak_speed, SPEED_SKILL_BOOST.get(sport))
    skill_level = min([pred_level, score_level], key=DEFAULT_LEVELS.index)

    # Consistency: how concentrated is the shot distribution?
    # If all detected shots are the same type → consistency=1.0
    # If spread evenly across N types → consistency=1/N
    n = sum(distribution.values())
    consistency_pct = round(100.0 * (max(distribution.values()) / n) if n else 0.0, 1)

    return {
        "n_shots_detected": len(shots),
        "n_shots_confident": len(confident_shots),
        "shot_distribution": dict(distribution),
        "primary_shot": distribution.most_common(1)[0][0] if distribution else None,
        "avg_metrics": avg_metrics,
        "avg_overall_score": avg_overall,
        "peak_speed_kmh": peak_speed,
        "speed_source": speed_source,
        "skill_level": skill_level,
        "consistency_pct": consistency_pct,
    }


def _aggregate_coaching(shots: list[dict], summary: dict, sport: str) -> dict:
    """Build aggregated coach feedback across all detected shots.

    When VLM is the predictor we use Gemini's per-shot reasoning + form_feedback
    (specific, observed) instead of the generic deterministic templates.
    """
    if not shots:
        return {"summary": "No shots detected in video.", "top_issues": [],
                "strengths": [], "encouragement": ""}

    primary = summary.get("primary_shot") or shots[0]["shot_type"]
    skill = summary.get("skill_level", "Intermediate")
    avg_overall = summary.get("avg_overall_score", 50.0)
    avg_metrics = summary.get("avg_metrics", {})

    # Per-shot-type breakdown for the summary line
    dist = summary.get("shot_distribution", {})
    if len(dist) <= 1:
        breakdown = f"{dist.get(primary, 0)} {primary.replace('_',' ')}{'s' if dist.get(primary,0) != 1 else ''}"
    else:
        breakdown = ", ".join(f"{n} {t.replace('_',' ')}{'s' if n != 1 else ''}"
                              for t, n in sorted(dist.items(), key=lambda x: -x[1]))

    n_detected = summary.get("n_shots_detected", 0)
    n_confident = summary.get("n_shots_confident", 0)
    n_unread = max(0, n_detected - n_confident)
    summary_line = (
        f"Detected {n_detected} shots: {breakdown}"
        + (f" ({n_unread} unclear)." if n_unread else ".")
        + f" You look like an {skill} player (overall {avg_overall:.0f}/100, "
        f"shot consistency {summary.get('consistency_pct', 0):.0f}%)."
    )

    # Confident shots with VLM feedback present?
    vlm_shots = [s for s in shots if s.get("predictor") == "vlm"
                 and s.get("is_confident")
                 and (s.get("form_feedback") or s.get("reasoning"))]

    if vlm_shots:
        coaching_card = _build_vlm_coaching(vlm_shots, primary, skill, avg_overall)
    else:
        coaching_card = build_coaching(primary, skill, "average", avg_overall, avg_metrics)

    coaching_card["summary"] = summary_line
    return coaching_card


def _build_vlm_coaching(
    vlm_shots: list[dict], primary: str, skill: str, avg_overall: float
) -> dict:
    """Aggregate Gemini's per-shot reasoning + form_feedback into one card."""
    strengths: list[str] = []
    weaknesses: list[str] = []
    tips: list[str] = []
    seen_s, seen_w, seen_t = set(), set(), set()

    for s in vlm_shots:
        ff = s.get("form_feedback") or {}
        for x in (ff.get("strengths") or [])[:3]:
            x = str(x).strip()
            if x and x.lower() not in seen_s:
                seen_s.add(x.lower()); strengths.append(x)
        for x in (ff.get("weaknesses") or [])[:3]:
            x = str(x).strip()
            if x and x.lower() not in seen_w:
                seen_w.add(x.lower()); weaknesses.append(x)
        tip = str(ff.get("tip", "")).strip()
        if tip and tip.lower() not in seen_t:
            seen_t.add(tip.lower()); tips.append(tip)

    # Trim to actionable counts
    strengths = strengths[:5]
    weaknesses = weaknesses[:5]
    tips = tips[:3]

    # Convert weaknesses → top_issues schema the frontend already understands.
    top_issues = []
    for w in weaknesses[:3]:
        top_issues.append({
            "issue": w[:80],
            "coach_says": w,
            "fix": tips[len(top_issues) % len(tips)] if tips else "Slow it down and focus on form.",
            "drill": tips[len(top_issues) % len(tips)] if tips else "Slow it down and focus on form.",
            "severity": "high" if len(top_issues) == 0 else "medium",
        })

    # Encouragement = the single best tip + score context
    if tips:
        encouragement = tips[0]
    else:
        encouragement = f"You're at {skill} level — keep playing the shots that worked."

    return {
        "raw": {"skill_level": skill},
        "top_issues": top_issues,
        "strengths": strengths,
        "encouragement": encouragement,
        "shot_tip": tips[0] if tips else "",
        "posture_tip": "",  # VLM tips already cover form; skip the canned posture line
    }


# ─────────────────────────── main entrypoint (multi-shot) ───────────────────────────

def analyze_video(
    video_path: str,
    sport: str = "badminton",
    target_player: str = "auto",
    predictor: str = "tcn",       # "tcn" | "vlm" | "auto"
    vlm_backend: str = "auto",    # "auto" | "gemini" | "anthropic" | "openai" | "local"
) -> dict[str, Any]:
    """Multi-shot analysis. Detects shot moments → analyzes each → aggregates.

    Args:
      predictor: which model classifies each shot.
        - "tcn"  : pose-based TCN (offline, ~30% acc on badminton today)
        - "vlm"  : vision LLM via configured backend (Gemini/Claude/OpenAI/local)
        - "auto" : VLM if any backend is configured, else TCN

    Returns dict with:
      - shots: list of per-shot analysis dicts (each has 'predictor' field)
      - summary: aggregated stats across shots
      - shot_analysis / coaching / analysis / pro_comparison / speed_analysis:
        legacy single-shot fields populated from the PRIMARY shot,
        for backward compatibility with the playsmart frontend.
    """
    from .shot_segmentation import detect_shot_moments, is_short_video

    t0 = time.time()
    p = Path(video_path)
    if not p.exists():
        return {"success": False, "error": f"video not found: {video_path}"}

    # Sport check — VLM mode supports any sport defined in vlm/prompts.py;
    # TCN mode only supports badminton (no per-sport models trained yet).
    if predictor == "tcn" and sport not in ("badminton",):
        return {"success": False,
                "error": f"sport '{sport}' not supported by TCN mode (try predictor='vlm')"}

    # Resolve "auto": pick VLM if any backend is configured, else TCN.
    if predictor == "auto":
        try:
            from .vlm.backends import available_backends
            if any(b["available"] for b in available_backends()):
                predictor = "vlm"
            else:
                predictor = "tcn"
        except Exception:
            predictor = "tcn"

    info = _video_info(p)
    duration = info.get("duration_seconds", 0.0)
    fps = info.get("fps") or 30.0

    # ── Decide single-shot vs multi-shot mode
    if is_short_video(duration):
        # Short clip — assume one shot, scan whole video.
        moments = [{"index": 0, "start_sec": 0.0, "peak_sec": duration / 2,
                    "end_sec": duration, "motion_score": 1.0}]
        mode = "single"
    else:
        moments = detect_shot_moments(p)
        mode = "multi"
        if not moments:
            # Fallback: no shot moments detected → analyze whole video.
            moments = [{"index": 0, "start_sec": 0.0, "peak_sec": duration / 2,
                        "end_sec": min(duration, 6.0), "motion_score": 0.0}]
            mode = "fallback"

    # ── Per-shot analysis loop
    src_w = int(info.get("resolution", "0x0").split("x")[0]) if info.get("resolution") else 0
    src_h = int(info.get("resolution", "0x0").split("x")[1]) if info.get("resolution") else 0

    # Batch-classify all shot moments in ONE VLM call when there are multiple
    # moments (saves quota: N calls → 1 call). Falls back to per-shot if batch fails.
    batch_vlm: list[dict | None] = [None] * len(moments)
    if predictor == "vlm" and len(moments) > 1:
        try:
            from .vlm import VLMShotClassifier
            clf = VLMShotClassifier(backend=vlm_backend, sport=sport)
            windows = [(m["start_sec"], m["end_sec"]) for m in moments]
            batch_vlm = clf.predict_batch(p, windows, target_player=target_player)
        except Exception as exc:
            print(f"[vlm-batch] {exc.__class__.__name__}: {exc}", file=__import__('sys').stderr)
            batch_vlm = [None] * len(moments)

    shots: list[dict] = []
    for i, m in enumerate(moments):
        shot = _analyze_one_shot(
            p, target_player, sport, fps, src_w, src_h,
            start_sec=m["start_sec"], end_sec=m["end_sec"], shot_index=m["index"],
            predictor=predictor, vlm_backend=vlm_backend,
            precomputed_vlm=batch_vlm[i],
        )
        if shot is not None:
            shot["motion_score"] = m.get("motion_score", 0.0)
            shot["peak_sec"] = m.get("peak_sec")
            shots.append(shot)

    if not shots:
        return {
            "success": False,
            "error": "Could not detect a clear player in any shot moment.",
            "video_info": info,
            "_internal": {"elapsed_sec": round(time.time() - t0, 3), "mode": mode},
        }

    # ── Aggregate
    summary = _aggregate_shots(shots, sport)
    coaching = _aggregate_coaching(shots, summary, sport)
    pro = build_pro_comparison(summary["skill_level"], summary["avg_overall_score"], summary["primary_shot"])

    # Pick the most confident shot for the legacy single-shot fields.
    primary_shot = max(shots, key=lambda s: s["confidence"])
    legacy_metrics = primary_shot["metrics_full"]

    weaknesses_raw = []
    for w in coaching.get("top_issues", [])[:3]:
        weaknesses_raw.append({
            "issue": w["issue"], "severity": w["severity"], "fix": w["fix"],
        })

    result = {
        "success": True,
        "skill_level": summary["skill_level"],
        "sport": sport,
        "target_player": target_player,

        # ── NEW multi-shot fields
        "shots": [
            {k: v for k, v in s.items() if k not in ("metrics_full", "_pose_info")}
            for s in shots
        ],
        "summary": summary,

        # ── Legacy single-shot contract (backward compat for playsmart frontend)
        "shot_analysis": {
            "shot_type": primary_shot["shot_type"],
            "shot_name": primary_shot["shot_name"],
            "confidence": primary_shot["confidence"],
            "is_confident": primary_shot["is_confident"],
            "top3": primary_shot["top3"],
            "assessment": {
                "grade": grade_from_score(summary["avg_overall_score"]),
                "overall_score": summary["avg_overall_score"],
            },
            "weaknesses": weaknesses_raw,
            "improvement_plan": coaching.get("encouragement", ""),
        },
        "coaching": coaching,
        "analysis": {"metrics": summary.get("avg_metrics", {})},
        "pro_comparison": pro,
        "speed_analysis": {
            "estimated_speed_kmh": summary.get("peak_speed_kmh", 0.0),
            "source": summary.get("speed_source", "wrist_proxy"),
        },
        "metrics": legacy_metrics,
        "performance_scores": summary.get("avg_metrics", {}),
        "video_info": info,
        "frames_analyzed": sum(s["_pose_info"].get("n_sampled", 0) for s in shots if "_pose_info" in s)
                            if shots and "_pose_info" in shots[0] else 0,
        "analyzed_player_preview": _player_preview_b64(p, target_player),
        "highlights": {
            "clip_count": len(shots),
            "total_duration": round(sum((s.get("end_sec", 0) or 0) - (s.get("start_sec", 0) or 0) for s in shots), 1),
            "reel_available": False,
            "clips": [],
        },
        "segments": {
            "total": len(moments),
            "active": len(shots),
            "power_moments": sum(1 for s in shots if s["confidence"] >= 0.4),
        },
        "predictor_used": predictor,
        "vlm_backend_used": (shots[0].get("vlm_meta", {}).get("backend")
                              if shots and shots[0].get("predictor") == "vlm" else None),
        "_internal": {
            "elapsed_sec": round(time.time() - t0, 3),
            "mode": mode,
            "predictor": predictor,
            "n_shot_moments": len(moments),
            "n_shots_analyzed": len(shots),
        },
    }
    return result
