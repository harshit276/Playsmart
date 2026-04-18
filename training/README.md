# Shot Classifier Training

End-to-end pipeline: labeled clips on the website → trained shot classifier on your laptop.

## Prerequisites
- Python 3.10+
- The original videos you uploaded to `/label`, kept on your local disk

## One-time setup
```bash
cd training
pip install -r requirements.txt
```

## Workflow

### 1. Label clips on the website
Go to `https://athlyticai.com/label`, upload videos, label shots, click **Upload**. Repeat for 5-10 videos.

### 2. Pull labels and extract pose features
Point `--videos-dir` at the folder where you keep the source videos. Filenames must match what you uploaded (the tool stores the filename with each label session).

```bash
python extract_poses.py \
  --videos-dir "C:/Users/mundr/Videos/badminton_clips" \
  --sport badminton \
  --out features.npz
```

This pulls every labeled session via the public `/api/labels/export` endpoint, finds the matching local video, runs MediaPipe Pose on each labeled clip, and writes a feature matrix to `features.npz`.

### 3. Train the classifier
```bash
python train_classifier.py --features features.npz --out shot_classifier.joblib
```

You'll see train/test accuracy, a per-class report, and a confusion matrix.

### 4. Use the trained model
```python
import joblib, numpy as np
bundle = joblib.load("shot_classifier.joblib")
model, labels = bundle["model"], bundle["labels"]
# X has shape [N, 1584]  -> 12 frames × 33 keypoints × 4 (x, y, z, vis)
preds = model.predict(X)
print([labels[i] for i in preds])
```

## What to expect with small datasets
- **<50 clips**: random-forest still trains, but accuracy is noisy and the confusion matrix dominates the signal. Useful as a sanity check.
- **100-300 clips/class**: meaningful accuracy starts to emerge. Try `--model mlp` for non-linear boundaries.
- **1000+ clips/class**: time to swap to a temporal model (1D CNN over frame sequences). The current pipeline flattens time — fine for proof of concept, suboptimal for fast shots.

## Tips
- Label diverse camera angles and player skill levels — the metadata fields (player_level, player_rating, speed_kmh) you tagged in the labeling tool are saved in `meta` inside `features.npz` for downstream filtering.
- If a clip doesn't extract features (no person detected), it's silently skipped. Use clips with clear body visibility.
- Keep the original filenames you uploaded — that's how the script matches local files to label sessions.
