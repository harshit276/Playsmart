"""
Train a shot classifier from extracted pose features.

Run:
  python train_classifier.py --features features.npz --out shot_classifier.joblib

The model is intentionally tiny (RandomForest / MLP) — appropriate for
the few-hundred-sample range. Once you have thousands of clips per
class, swap to a 1D CNN / temporal model.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


MODELS = {
    "rf": ("Random Forest", RandomForestClassifier(
        n_estimators=300, max_depth=None, n_jobs=-1, random_state=42, class_weight="balanced",
    )),
    "mlp": ("MLP (small)", Pipeline([
        ("scale", StandardScaler()),
        ("mlp", MLPClassifier(
            hidden_layer_sizes=(128, 64),
            max_iter=400,
            early_stopping=True,
            random_state=42,
        )),
    ])),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--features", default="features.npz", type=Path)
    ap.add_argument("--model", choices=list(MODELS), default="rf")
    ap.add_argument("--test-size", type=float, default=0.2)
    ap.add_argument("--out", default="shot_classifier.joblib", type=Path)
    args = ap.parse_args()

    if not args.features.exists():
        raise SystemExit(f"features file not found: {args.features} (run extract_poses.py first)")

    data = np.load(args.features, allow_pickle=True)
    X, y, labels = data["X"], data["y"], list(data["labels"])
    print(f"[load] {len(X)} samples, {X.shape[1]} features, {len(labels)} classes")
    print(f"       classes: {labels}")
    counts = {labels[i]: int((y == i).sum()) for i in range(len(labels))}
    print(f"       counts:  {counts}")

    if len(X) < 10:
        raise SystemExit(f"too few samples ({len(X)}) — label more clips before training")

    # Stratified split if every class has >=2 samples
    stratify = y if min(counts.values()) >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=42, stratify=stratify,
    )
    print(f"[split] train={len(X_train)}  test={len(X_test)}")

    name, model = MODELS[args.model]
    print(f"[fit] {name}")
    model.fit(X_train, y_train)

    train_acc = model.score(X_train, y_train)
    test_acc = model.score(X_test, y_test)
    print(f"\n[acc] train={train_acc:.3f}  test={test_acc:.3f}")

    y_pred = model.predict(X_test)
    print("\n[report]")
    print(classification_report(y_test, y_pred, target_names=labels, zero_division=0))

    cm = confusion_matrix(y_test, y_pred, labels=list(range(len(labels))))
    print("\n[confusion matrix]   (rows=true, cols=pred)")
    header = " " * 16 + "".join(f"{l[:8]:>10}" for l in labels)
    print(header)
    for i, row in enumerate(cm):
        print(f"{labels[i][:14]:>14}  " + "".join(f"{int(v):>10}" for v in row))

    joblib.dump({"model": model, "labels": labels}, args.out)
    print(f"\n[ok] saved model to {args.out}")
    print("     to predict:")
    print("     >>> import joblib")
    print(f"     >>> bundle = joblib.load('{args.out}')")
    print("     >>> bundle['model'].predict(X)  # X shape: [N, 612]  (12 frames x 17 kp x 3)")


if __name__ == "__main__":
    main()
