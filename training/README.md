# Shot Classifier Training

Local-first pipeline: label clips on the website → download a JSON → train on your laptop.

No MongoDB upload required.

## Prerequisites
- Python 3.10+
- The original videos you uploaded to `/label`, kept on your local disk

## One-time setup
```bash
cd training
pip install -r requirements.txt
```

If you already have an environment with `numpy>=2`, force-downgrade
first or you'll see `numpy.core.multiarray failed to import` when
mediapipe loads:
```bash
pip install "numpy<2" --force-reinstall
```

## Workflow

### 1. Label clips on the website
1. Go to `https://athlyticai.com/label`
2. Upload a video, label each shot (or click **Discard** for ambiguous / multi-shot clips)
3. Click the green **Download labels.json** button
4. Save the file **next to the source video** (same folder)
5. Repeat for 5-10 videos. Each downloads `labels_<hash>.json`.

You'll end up with:
```
my_clips/
  match1.mp4
  labels_a3f1b2c4.json
  match2.mp4
  labels_e8d9f0a1.json
  ...
```

### 2. Extract pose features
Point `--videos-dir` at that folder. The script auto-discovers all `labels_*.json` files there.
```bash
python extract_poses.py --videos-dir "C:/Users/mundr/Videos/badminton_clips"
```

Or pass a single labels file explicitly:
```bash
python extract_poses.py \
  --videos-dir "C:/Users/mundr/Videos/badminton_clips" \
  --labels "C:/Users/mundr/Videos/badminton_clips/labels_a3f1b2c4.json"
```

(Optional: `--api https://athlyticai.com` to pull from the server if you also clicked "Upload to server".)

### 3. Train the classifier
```bash
python train_classifier.py --features features.npz --out shot_classifier.joblib
```

You'll see train/test accuracy, a per-class report, and a confusion matrix.

### 4. Use the trained model
```python
import joblib
bundle = joblib.load("shot_classifier.joblib")
model, labels = bundle["model"], bundle["labels"]
# X has shape [N, 1584]  -> 12 frames × 33 keypoints × 4 (x, y, z, vis)
preds = model.predict(X)
print([labels[i] for i in preds])
```

## What to expect with small datasets
- **<50 clips**: random-forest still trains, but accuracy is noisy. Useful as a sanity check.
- **100-300 clips/class**: meaningful accuracy starts to emerge. Try `--model mlp`.
- **1000+ clips/class**: time to swap to a temporal model (1D CNN). The current pipeline flattens time.

## Tips
- **Discard liberally.** If a clip has two shots, bad framing, or you're unsure, click **Discard**. Quality > quantity.
- **Keep filenames intact** — that's how the script matches local files to label sessions.
- Metadata you tagged (player_level, player_rating, speed_kmh) lives in the `meta` array inside `features.npz` for downstream filtering.
