"""
Compare the end-to-end pipeline for GROQ-labeled vs GITHUB-LSTM-labeled
datasets. Assumes label files already exist in pipeline_out/.

For each backend:
  1. Extract MoveNet features from all labeled (non-test) videos
     for clips with confidence >= MIN_CONF
  2. Train RandomForest, report train/test acc + per-class
  3. Predict on test_video.mp4, report distribution

Final output is a side-by-side report.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

from extract_poses import extract_clip_features, load_movenet
from full_pipeline import detect_shot_moments, video_hash

MIN_CONF = 0.5
VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm"}


def build_dataset(label_prefix: str, videos_dir: Path, out_dir: Path, movenet, test_hash: str):
    """Returns (X, y, classes, label_counts)."""
    videos = {video_hash(p): p for p in videos_dir.iterdir() if p.suffix.lower() in VIDEO_EXTS}
    X, y, missing = [], [], []
    for f in sorted(out_dir.glob(f"{label_prefix}_labels_*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        h = data.get("video_hash", "")
        if h == test_hash:
            continue  # never train on test video
        vid = videos.get(h)
        if not vid:
            missing.append(f.name)
            continue
        kept = [s for s in data.get("shots", []) if s.get("label") and s.get("confidence", 0) >= MIN_CONF]
        print(f"  [{label_prefix}] {vid.name[:50]}... {len(kept)} clips to extract")
        for s in kept:
            feats = extract_clip_features(movenet, vid, s["start"], s["end"], player_position="auto")
            if feats is None:
                continue
            X.append(feats)
            y.append(s["label"])
    if missing:
        print(f"  [warn] skipped missing videos: {missing}")
    return np.stack(X) if X else np.empty((0,)), np.array(y), None


def train_and_eval(X, y, label: str):
    classes = sorted(set(y))
    cls_to_idx = {c: i for i, c in enumerate(classes)}
    y_idx = np.array([cls_to_idx[c] for c in y], dtype=np.int32)
    counts = {c: int((y_idx == cls_to_idx[c]).sum()) for c in classes}

    if len(X) < len(classes) * 2:
        return {"error": f"too few samples: {len(X)}", "counts": counts}

    stratify = y_idx if min(counts.values()) >= 2 else None
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y_idx, test_size=0.2, random_state=42, stratify=stratify,
    )
    model = RandomForestClassifier(
        n_estimators=300, n_jobs=-1, random_state=42, class_weight="balanced",
    )
    model.fit(X_tr, y_tr)
    train_acc = float(model.score(X_tr, y_tr))
    test_acc = float(model.score(X_te, y_te))
    report = classification_report(
        y_te, model.predict(X_te),
        labels=list(range(len(classes))),
        target_names=classes, zero_division=0,
    )

    out_path = Path(__file__).parent / "pipeline_out" / f"shot_classifier_{label}.joblib"
    joblib.dump({"model": model, "labels": classes}, out_path)
    return {
        "samples": int(len(X)),
        "classes": classes,
        "counts": counts,
        "train_acc": train_acc,
        "test_acc": test_acc,
        "report": report,
        "model_path": str(out_path),
    }


def predict_on_test(model_path: Path, test_video: Path, movenet):
    bundle = joblib.load(model_path)
    model = bundle["model"]
    labels = list(bundle["labels"])
    moments = detect_shot_moments(test_video)
    preds = []
    for m in moments:
        feats = extract_clip_features(movenet, test_video, m["start"], m["end"], player_position="auto")
        if feats is None:
            continue
        p = model.predict(feats.reshape(1, -1))[0]
        proba = model.predict_proba(feats.reshape(1, -1))[0] if hasattr(model, "predict_proba") else None
        pred_label = labels[int(p)]
        conf = float(proba[int(p)]) if proba is not None else 0.0
        preds.append({"label": pred_label, "conf": conf, "start": m["start"], "end": m["end"]})
    return preds


def main():
    here = Path(__file__).parent
    videos_dir = here
    out_dir = here / "pipeline_out"

    test_videos = [p for p in videos_dir.iterdir() if p.suffix.lower() in VIDEO_EXTS and "test" in p.stem.lower()]
    if not test_videos:
        sys.exit("[error] no test video")
    test_video = test_videos[0]
    test_hash = video_hash(test_video)

    movenet = load_movenet()

    print("\n════════════════════════════════════════════════════════════════")
    print("  BUILDING DATASETS")
    print("════════════════════════════════════════════════════════════════")
    print("\n── GROQ dataset ──")
    X_g, y_g, _ = build_dataset("groq", videos_dir, out_dir, movenet, test_hash)
    print("\n── GITHUB dataset ──")
    X_h, y_h, _ = build_dataset("github", videos_dir, out_dir, movenet, test_hash)

    print("\n════════════════════════════════════════════════════════════════")
    print("  TRAINING")
    print("════════════════════════════════════════════════════════════════")
    print("\n── GROQ model ──")
    groq_stats = train_and_eval(X_g, y_g, "groq") if len(X_g) else {"error": "no data"}
    print(json.dumps({k: v for k, v in groq_stats.items() if k != "report"}, indent=2, default=str))
    if "report" in groq_stats:
        print("\n[groq report]\n" + groq_stats["report"])

    print("\n── GITHUB model ──")
    github_stats = train_and_eval(X_h, y_h, "github") if len(X_h) else {"error": "no data"}
    print(json.dumps({k: v for k, v in github_stats.items() if k != "report"}, indent=2, default=str))
    if "report" in github_stats:
        print("\n[github report]\n" + github_stats["report"])

    print("\n════════════════════════════════════════════════════════════════")
    print("  PREDICTIONS ON test_video.mp4")
    print("════════════════════════════════════════════════════════════════")

    groq_preds = github_preds = None
    if "model_path" in groq_stats:
        groq_preds = predict_on_test(Path(groq_stats["model_path"]), test_video, movenet)
        dist = Counter(p["label"] for p in groq_preds)
        avg_conf = np.mean([p["conf"] for p in groq_preds]) if groq_preds else 0
        print(f"\n[groq predictions] {len(groq_preds)} clips")
        print(f"  distribution: {dict(dist)}")
        print(f"  avg confidence: {avg_conf:.0%}")
    if "model_path" in github_stats:
        github_preds = predict_on_test(Path(github_stats["model_path"]), test_video, movenet)
        dist = Counter(p["label"] for p in github_preds)
        avg_conf = np.mean([p["conf"] for p in github_preds]) if github_preds else 0
        print(f"\n[github predictions] {len(github_preds)} clips")
        print(f"  distribution: {dict(dist)}")
        print(f"  avg confidence: {avg_conf:.0%}")

    print("\n════════════════════════════════════════════════════════════════")
    print("  FINAL SIDE-BY-SIDE REPORT")
    print("════════════════════════════════════════════════════════════════\n")
    print(f"{'Metric':<32}{'GROQ':>18}{'GITHUB LSTM':>18}")
    print("-" * 68)
    print(f"{'train samples':<32}{groq_stats.get('samples', '–'):>18}{github_stats.get('samples', '–'):>18}")
    print(f"{'classes':<32}{len(groq_stats.get('classes', [])):>18}{len(github_stats.get('classes', [])):>18}")
    tr_g = groq_stats.get('train_acc')
    tr_h = github_stats.get('train_acc')
    te_g = groq_stats.get('test_acc')
    te_h = github_stats.get('test_acc')
    print(f"{'train acc':<32}{(f'{tr_g:.0%}' if tr_g is not None else '–'):>18}{(f'{tr_h:.0%}' if tr_h is not None else '–'):>18}")
    print(f"{'held-out test acc':<32}{(f'{te_g:.0%}' if te_g is not None else '–'):>18}{(f'{te_h:.0%}' if te_h is not None else '–'):>18}")
    if groq_preds is not None and github_preds is not None:
        g_dist = Counter(p["label"] for p in groq_preds)
        h_dist = Counter(p["label"] for p in github_preds)
        print(f"\ntest_video prediction distribution:")
        print(f"  groq   : {dict(g_dist)}")
        print(f"  github : {dict(h_dist)}")


if __name__ == "__main__":
    main()
