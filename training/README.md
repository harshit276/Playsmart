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

### One-shot end-to-end pipeline (recommended)
The simplest workflow: drop your videos in a folder (one named `*test*` for evaluation), run one command, get a trained model + accuracy report.

```bash
# Set your free Groq API key (https://console.groq.com/keys)
set GROQ_API_KEY=gsk_xxx

cd training
python full_pipeline.py --videos-dir "C:/path/to/videos"
```

This:
1. Auto-labels every non-test video using **two backends** in parallel:
   - **Groq Vision LLM** (cloud, no install — fast)
   - **GitHub LSTM** (RichardPinter/badminton_shot_type — clones + tries to install ~10 GB of deps)
2. Filters labels with confidence ≥ 0.5
3. Extracts MoveNet pose features
4. Trains a RandomForest classifier per backend
5. Runs each trained model on `test_video` and prints accuracy comparison

Use `--skip-github` if you don't want the heavy install (~5 minutes vs hours).
Use `--skip-groq` if you don't have a key.

### 4. Auto-label new videos (skip manual labeling)
After you have a working classifier, use it to PRE-LABEL new videos in bulk:

```bash
python auto_label.py --videos-dir "C:/path/to/new_videos"
```

For each video the script:
- Detects shot moments (same algo as the browser tool)
- Runs the trained classifier on each moment
- Writes `labels_<hash>.json` next to the video with predictions
  pre-filled (high-confidence) or blank (low-confidence — needs review)

Then on the website at `/label`:
1. Upload the same video
2. Click **Load auto-labeled JSON** and pick the matching `labels_*.json`
3. You see the predictions — just **correct the wrong ones** instead of labeling all from scratch

This typically cuts manual labeling time **3-5×** once the model is decent (~50+ samples per class).

**Bootstrap (when our model is too weak to auto-label):**
For the first batch, you can use someone else's pre-trained model. The
[RichardPinter/badminton_shot_type](https://github.com/RichardPinter/badminton_shot_type)
repo ships LSTM weights trained on 15 pro matches with 6 shot classes.
- Clone it, run their `app.py` against your videos, convert their CSV
  output to our `labels_*.json` format (a 30-line script).
- ⚠️ Their repo has no LICENSE — fine for local use to seed our own
  labels, but do **not** redistribute their weights with our app.
- Once we have ~500 corrected labels, retrain ours and stop using theirs.

### 5. Try predictions locally (sanity check)
```bash
# predict the labelled clips back — eyeball whether the model gets them right
python test_predict.py --labels "labels_abc.json" --videos-dir .

# predict a single clip from a video
python test_predict.py --video match.mp4 --start 12.3 --end 14.5

# scan a whole video, predict at every 3-second window
python test_predict.py --auto-extract match.mp4 --min-conf 0.4
```

### 5. Use the trained model
```python
import joblib
bundle = joblib.load("shot_classifier.joblib")
model, labels = bundle["model"], bundle["labels"]
# X has shape [N, 612]  -> 12 frames × 17 keypoints × 3 (y, x, confidence)
# Same MoveNet keypoints the browser produces, so this model can be
# deployed in-browser later (via TF.js or backend inference).
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
