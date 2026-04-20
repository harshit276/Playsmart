"""
Train a per-sport shot classifier end-to-end.

  python train_for_sport.py --sport badminton              # auto-discover videos in sports/badminton/videos/
  python train_for_sport.py --sport tennis --use-yolo      # tennis with YOLO11x-pose for cleaner labels
  python train_for_sport.py --sport pickleball --skip-test # train on all videos (no held-out test)

What it does:
  1. Loads sports/<sport>/config.json (shot types, prompts, LSTM weights, etc).
  2. Walks sports/<sport>/videos/ — one named *test* becomes the held-out
     evaluation video, everything else is training data.
  3. For each training video, auto-labels every detected shot moment using
     the best available labeler for that sport:
       - sport-specific LSTM if config has lstm_weights (e.g. badminton)
       - else Groq Vision LLM (needs GROQ_API_KEY)
  4. Filters labels with confidence >= --min-conf (default 0.5).
  5. Extracts MoveNet keypoint features for the kept clips.
  6. Trains a RandomForest on features → per-class classifier.
  7. Saves: ../backend/models/shot_classifier_<sport>.joblib  (auto-deployed
     when you commit + push). Also writes a stats.json next to it.
  8. If a test video exists, predicts on it and prints a side-by-side
     report against the labeler's own predictions.

Native resolution — no need to pre-downscale. If you hit OOM, reduce
--max-clips-per-video.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import numpy as np
import requests
import cv2

# Make the parent training/ directory importable so we can reuse helpers
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from extract_poses import extract_clip_features, load_movenet, detect_pose
from full_pipeline import detect_shot_moments, video_hash, grab_strip_jpeg, label_with_groq, pick_groq_model

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}


# ────────────────────────────────────────────────────────────────────
# Per-sport labelers
# ────────────────────────────────────────────────────────────────────

def label_with_lstm(video_path: Path, moments: list, lstm, movenet, classes: list, max_input_frames: int = 41,
                    yolo_pose=None) -> list[dict]:
    """Use a sport-specific LSTM (e.g. badminton) to label each moment."""
    KP_MAP = [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]   # MoveNet 17 → 13
    INPUT_FEATURES = 26  # 13 × (x,y)
    out = []
    for i, m in enumerate(moments):
        kp_seq = _extract_keypoints(video_path, m["start"], m["end"], max_input_frames, movenet, yolo_pose)
        if not kp_seq:
            continue
        arr = np.zeros((max_input_frames, INPUT_FEATURES), dtype=np.float32)
        for fi, kp in enumerate(kp_seq[:max_input_frames]):
            for j, src in enumerate(KP_MAP):
                arr[fi, j * 2 + 0] = kp[src, 1]   # x
                arr[fi, j * 2 + 1] = kp[src, 0]   # y
        proba = lstm.predict(arr.reshape(1, max_input_frames, INPUT_FEATURES), verbose=0)[0]
        idx = int(np.argmax(proba))
        conf = float(proba[idx])
        label = classes[idx] if idx < len(classes) else "unknown"
        if label == "unknown":
            conf = min(conf, 0.1)
        out.append({"start": m["start"], "end": m["end"], "label": "" if label == "unknown" else label, "confidence": conf})
        if (i + 1) % 5 == 0:
            print(f"  [lstm] {i + 1}/{len(moments)} last={label} @ {conf:.0%}", flush=True)
    return out


def _extract_keypoints(video_path: Path, start: float, end: float, n: int, movenet, yolo_pose=None) -> list[np.ndarray]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    times = np.linspace(start, end, n)
    out = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, frame = cap.read()
        if not ok:
            continue
        try:
            if yolo_pose is not None:
                kp = _yolo_pose_to_movenet(yolo_pose, frame)
            else:
                kp = detect_pose(movenet, frame)
            out.append(kp.astype(np.float32))
        except Exception:
            out.append(np.zeros((17, 3), dtype=np.float32))
    cap.release()
    return out


def _yolo_pose_to_movenet(yolo_model, frame_bgr) -> np.ndarray:
    """YOLO11x-pose returns 17 COCO keypoints in pixel coords; we convert
    to MoveNet's normalized (y, x, confidence) format."""
    h, w = frame_bgr.shape[:2]
    res = yolo_model(frame_bgr, verbose=False)[0]
    if res.keypoints is None or len(res.keypoints.xy) == 0:
        return np.zeros((17, 3), dtype=np.float32)
    xy = res.keypoints.xy[0].cpu().numpy()        # [17, 2] pixel
    conf = res.keypoints.conf[0].cpu().numpy() if res.keypoints.conf is not None else np.ones(17)
    out = np.zeros((17, 3), dtype=np.float32)
    out[:, 0] = xy[:, 1] / h          # y normalized
    out[:, 1] = xy[:, 0] / w          # x normalized
    out[:, 2] = conf
    return out


def label_with_groq_backend(video_path: Path, moments: list, prompt: str, api_key: str, model: str, sleep_s: float = 2.0) -> list[dict]:
    """Use Groq vision (sport-customised prompt) for each moment."""
    import time as _t
    out = []
    for i, m in enumerate(moments):
        img = grab_strip_jpeg(video_path, m["start"], m["end"], n=3)
        if not img:
            continue
        # Inject custom prompt by monkey-patching GROQ_PROMPT in the module
        import full_pipeline
        old_prompt = full_pipeline.GROQ_PROMPT
        full_pipeline.GROQ_PROMPT = prompt
        try:
            res = label_with_groq(img, api_key, model)
        finally:
            full_pipeline.GROQ_PROMPT = old_prompt
        if not res:
            continue
        out.append({"start": m["start"], "end": m["end"], **res})
        if (i + 1) % 5 == 0:
            print(f"  [groq] {i + 1}/{len(moments)} last={res['label']} @ {res['confidence']:.0%}", flush=True)
        _t.sleep(sleep_s)
    return out


# ────────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sport", required=True, choices=["badminton", "tennis", "table_tennis", "pickleball", "cricket"])
    ap.add_argument("--videos-dir", default=None, help="Override default sports/<sport>/videos/")
    ap.add_argument("--max-clips-per-video", type=int, default=80)
    ap.add_argument("--min-conf", type=float, default=0.5)
    ap.add_argument("--use-yolo", action="store_true", help="Use YOLO11x-pose for labeling (cleaner LSTM input, ~250MB ultralytics dep)")
    ap.add_argument("--skip-test", action="store_true", help="Don't reserve a test video — train on ALL videos")
    ap.add_argument("--groq-key", default=os.environ.get("GROQ_API_KEY", "").strip())
    args = ap.parse_args()

    sport_dir = Path(__file__).parent / args.sport
    config_path = sport_dir / "config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    print(f"\n══ Training shot classifier for {args.sport} ══")
    print(f"   shot types: {config['shot_types']}")
    print(f"   labeler priority: {config['labeler_priority']}")

    videos_dir = Path(args.videos_dir) if args.videos_dir else sport_dir / "videos"
    if not videos_dir.exists():
        sys.exit(f"[error] videos dir not found: {videos_dir}")

    all_videos = sorted(p for p in videos_dir.iterdir() if p.suffix.lower() in VIDEO_EXTS)
    if not all_videos:
        sys.exit(f"[error] no videos in {videos_dir}")

    if args.skip_test:
        train_videos, test_video = all_videos, None
    else:
        test_videos = [v for v in all_videos if "test" in v.stem.lower()]
        if not test_videos:
            print("[warn] no video named *test* — using last video as test", flush=True)
            test_video = all_videos[-1]
            train_videos = all_videos[:-1]
        else:
            test_video = test_videos[0]
            train_videos = [v for v in all_videos if v != test_video]

    print(f"   train: {len(train_videos)} videos")
    for v in train_videos:
        print(f"      - {v.name}")
    print(f"   test : {test_video.name if test_video else '(none)'}")

    # ── Pick labeler ──
    movenet = load_movenet()
    yolo_pose = None
    if args.use_yolo:
        try:
            from ultralytics import YOLO
            print("[yolo] loading YOLO11x-pose…", flush=True)
            yolo_pose = YOLO("yolo11x-pose.pt")
            print("[yolo] ready", flush=True)
        except ImportError:
            print("[error] --use-yolo needs ultralytics: pip install ultralytics", file=sys.stderr)
            sys.exit(2)

    lstm = None
    if "lstm" in config["labeler_priority"] and config.get("lstm_weights"):
        weights_path = (sport_dir / config["lstm_weights"]).resolve()
        if weights_path.exists():
            print(f"[lstm] loading {weights_path.name}…", flush=True)
            import tensorflow as tf
            class CompatLSTM(tf.keras.layers.LSTM):
                @classmethod
                def from_config(cls, cfg):
                    cfg.pop("time_major", None)
                    return cls(**cfg)
            lstm = tf.keras.models.load_model(str(weights_path), compile=False, custom_objects={"LSTM": CompatLSTM})
            print(f"[lstm] ready (input {lstm.input_shape}, output {lstm.output_shape})", flush=True)
        else:
            print(f"[warn] lstm weights not found: {weights_path} — falling back to Groq", flush=True)

    groq_key = args.groq_key if "groq" in config["labeler_priority"] else None
    groq_model = None
    if groq_key and not lstm:
        groq_model = pick_groq_model(groq_key)
        if not groq_model:
            sys.exit("[error] no Groq vision model available — set GROQ_API_KEY")

    # ── Label every training video ──
    out_dir = sport_dir / "labels"
    out_dir.mkdir(exist_ok=True)
    all_labels = []
    for vid in train_videos:
        h = video_hash(vid)[:8]
        cached = out_dir / f"{h}.json"
        if cached.exists():
            data = json.loads(cached.read_text(encoding="utf-8"))
            print(f"\n[cached] {vid.name} → {len(data['shots'])} labels", flush=True)
            all_labels.append((vid, data["shots"]))
            continue

        print(f"\n[label] {vid.name}", flush=True)
        moments = detect_shot_moments(vid)[:args.max_clips_per_video]
        print(f"  detected {len(moments)} moments (cap {args.max_clips_per_video})", flush=True)
        if lstm is not None:
            shots = label_with_lstm(vid, moments, lstm, movenet, config["lstm_classes"],
                                     max_input_frames=config.get("lstm_input_frames", 41),
                                     yolo_pose=yolo_pose)
        elif groq_model:
            shots = label_with_groq_backend(vid, moments, config["groq_prompt"], groq_key, groq_model)
        else:
            sys.exit("[error] no labeler available")
        cached.write_text(json.dumps({"video": vid.name, "shots": shots}, indent=2))
        all_labels.append((vid, shots))

    # ── Extract MoveNet features for kept clips ──
    print(f"\n[features] extracting MoveNet features (kept = confidence >= {args.min_conf})", flush=True)
    X, y = [], []
    for vid, shots in all_labels:
        kept = [s for s in shots if s.get("label") and s.get("confidence", 0) >= args.min_conf]
        for s in kept:
            f = extract_clip_features(movenet, vid, s["start"], s["end"], player_position="auto")
            if f is not None:
                X.append(f)
                y.append(s["label"])
        print(f"  {vid.name[:50]} → {len(kept)} clips kept", flush=True)

    if len(X) < len(set(y)) * 2:
        sys.exit(f"[error] only {len(X)} samples — need at least {len(set(y)) * 2}")

    classes = sorted(set(y))
    cls_to_idx = {c: i for i, c in enumerate(classes)}
    X_arr = np.stack(X)
    y_arr = np.array([cls_to_idx[c] for c in y], dtype=np.int32)
    counts = {c: int((y_arr == cls_to_idx[c]).sum()) for c in classes}
    print(f"\n[dataset] {len(X)} samples, classes={classes}, counts={counts}", flush=True)

    # ── Train ──
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report
    import joblib

    stratify = y_arr if min(counts.values()) >= 2 else None
    X_tr, X_te, y_tr, y_te = train_test_split(X_arr, y_arr, test_size=0.2, random_state=42, stratify=stratify)
    model = RandomForestClassifier(n_estimators=300, n_jobs=-1, random_state=42, class_weight="balanced")
    model.fit(X_tr, y_tr)
    train_acc = float(model.score(X_tr, y_tr))
    test_acc = float(model.score(X_te, y_te))
    print(f"\n[train] train_acc={train_acc:.1%}  held-out test_acc={test_acc:.1%}", flush=True)
    print(classification_report(y_te, model.predict(X_te), labels=list(range(len(classes))),
                                 target_names=classes, zero_division=0))

    # ── Save to backend/models/ for deployment ──
    backend_models = ROOT.parent / "backend" / "models"
    backend_models.mkdir(parents=True, exist_ok=True)
    out_joblib = backend_models / f"shot_classifier_{args.sport}.joblib"
    joblib.dump({"model": model, "labels": classes}, out_joblib)
    stats = {
        "sport": args.sport,
        "samples": int(len(X)),
        "classes": classes,
        "counts": counts,
        "train_acc": train_acc,
        "test_acc": test_acc,
        "labeler": "lstm" if lstm else "groq",
        "yolo_pose_used": bool(yolo_pose),
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (backend_models / f"shot_classifier_{args.sport}_stats.json").write_text(json.dumps(stats, indent=2))
    print(f"\n[ok] saved {out_joblib}")
    print(f"     stats: shot_classifier_{args.sport}_stats.json")

    # ── Test on held-out video ──
    if test_video:
        print(f"\n[test] predicting on {test_video.name}", flush=True)
        moments = detect_shot_moments(test_video)
        from collections import Counter
        preds = []
        for m in moments:
            f = extract_clip_features(movenet, test_video, m["start"], m["end"], player_position="auto")
            if f is None:
                continue
            p = int(model.predict(f.reshape(1, -1))[0])
            conf = float(model.predict_proba(f.reshape(1, -1))[0][p])
            preds.append({"label": classes[p], "conf": conf, "start": m["start"]})
        dist = Counter(p["label"] for p in preds)
        avg = float(np.mean([p["conf"] for p in preds])) if preds else 0
        print(f"  {len(preds)} predictions  avg_conf={avg:.0%}  distribution={dict(dist)}")

    print(f"\n══ Done. Commit backend/models/shot_classifier_{args.sport}.joblib + push to deploy. ══\n")


if __name__ == "__main__":
    main()
