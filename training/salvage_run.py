"""
Salvage what we have when the auto-label step exhausted Groq quota.

Reads existing pipeline_out/groq_labels_*.json, runs MoveNet feature
extraction + training on those labels (no API needed), then runs the
trained classifier on a test video and prints predictions.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
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

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}
MIN_CONF = 0.5


def main():
    here = Path(__file__).parent
    videos_dir = here
    out_dir = here / "pipeline_out"
    label_files = sorted(out_dir.glob("groq_labels_*.json"))
    if not label_files:
        sys.exit("[error] no groq_labels_*.json in pipeline_out/")

    print(f"[salvage] found {len(label_files)} label files:")
    for p in label_files:
        print(f"   - {p.name}")

    videos = {video_hash(p): p for p in videos_dir.iterdir() if p.suffix.lower() in VIDEO_EXTS}

    movenet = load_movenet()
    X, y = [], []
    for lf in label_files:
        data = json.loads(lf.read_text(encoding="utf-8"))
        h = data.get("video_hash", "")
        vid = videos.get(h)
        if not vid:
            print(f"[skip] no matching local video for {lf.name} (hash {h[:8]})")
            continue
        kept = [s for s in data.get("shots", []) if s.get("label") and s.get("confidence", 0) >= MIN_CONF]
        print(f"[features] {vid.name}: extracting {len(kept)} clips above conf {MIN_CONF}")
        for s in kept:
            feats = extract_clip_features(movenet, vid, s["start"], s["end"], player_position="auto")
            if feats is None:
                continue
            X.append(feats)
            y.append(s["label"])

    if len(X) < 6:
        sys.exit(f"[error] only {len(X)} samples — too few to train")

    classes = sorted(set(y))
    cls_to_idx = {c: i for i, c in enumerate(classes)}
    X_arr = np.stack(X)
    y_arr = np.array([cls_to_idx[c] for c in y], dtype=np.int32)
    counts = {c: int((y_arr == cls_to_idx[c]).sum()) for c in classes}
    print(f"\n[dataset] {len(X)} samples, classes={classes}, counts={counts}")

    stratify = y_arr if min(counts.values()) >= 2 else None
    X_tr, X_te, y_tr, y_te = train_test_split(X_arr, y_arr, test_size=0.2, random_state=42, stratify=stratify)
    model = RandomForestClassifier(n_estimators=300, n_jobs=-1, random_state=42, class_weight="balanced")
    model.fit(X_tr, y_tr)
    train_acc = model.score(X_tr, y_tr)
    test_acc = model.score(X_te, y_te)
    print(f"\n[train] train_acc={train_acc:.1%}  test_acc={test_acc:.1%}  (held-out 20%)")
    print("\n[report]")
    print(classification_report(
        y_te, model.predict(X_te),
        labels=list(range(len(classes))),
        target_names=classes, zero_division=0,
    ))

    bundle_path = out_dir / "shot_classifier_salvage.joblib"
    joblib.dump({"model": model, "labels": classes}, bundle_path)
    print(f"[ok] saved {bundle_path}")

    # ── Predict on test_video ──
    test_videos = [p for p in videos_dir.iterdir() if p.suffix.lower() in VIDEO_EXTS and "test" in p.stem.lower()]
    if not test_videos:
        print("\n[warn] no test_video found — skipping test prediction")
        return
    test_vid = test_videos[0]
    print(f"\n[test] running classifier on {test_vid.name}")
    moments = detect_shot_moments(test_vid)
    print(f"   detected {len(moments)} shot moments")

    correct_per_class = {c: 0 for c in classes}
    pred_counts = {c: 0 for c in classes}
    confs = []
    for m in moments[:30]:  # cap output
        feats = extract_clip_features(movenet, test_vid, m["start"], m["end"], player_position="auto")
        if feats is None:
            continue
        X1 = feats.reshape(1, -1)
        pred_idx = int(model.predict(X1)[0])
        pred = classes[pred_idx]
        proba = model.predict_proba(X1)[0]
        conf = float(proba[pred_idx])
        confs.append(conf)
        pred_counts[pred] = pred_counts.get(pred, 0) + 1
        bar = "█" * int(conf * 20)
        print(f"   t={m['start']:5.1f}-{m['end']:5.1f}s  {pred:<8}  {conf:.0%}  {bar}")

    print(f"\n[stats] avg confidence: {np.mean(confs):.0%}  high-conf (>=70%): {sum(1 for c in confs if c >= 0.7)}/{len(confs)}")
    print(f"[stats] class distribution in predictions: {pred_counts}")


if __name__ == "__main__":
    main()
