# Per-sport shot classifier training

One folder per sport. Drop your videos into `<sport>/videos/`, name one of them with `test` in the filename, run one command, get a deployed model.

```
sports/
├── badminton/
│   ├── config.json          ← shot types + LSTM weights ref + Groq prompt
│   ├── videos/              ← drop your videos here (one named *test*.mp4)
│   ├── labels/              ← auto-generated cache
│   └── README.md
├── tennis/
├── table_tennis/
├── pickleball/
└── cricket/
```

## One-time setup
```bash
cd training
pip install -r requirements.txt
# optional: for cleaner LSTM-driven labels (badminton mainly), add YOLO11x:
pip install ultralytics
# optional: for sports without a pretrained labeler, you'll need Groq:
set GROQ_API_KEY=gsk_xxx
```

## Train a sport (powerful PC)
```bash
cd training/sports
# default: MoveNet-only feature extraction, sport-appropriate labeler
python train_for_sport.py --sport badminton

# even cleaner labels for badminton (LSTM was trained on YOLO11x-pose):
python train_for_sport.py --sport badminton --use-yolo

# a sport without LSTM (uses Groq):
python train_for_sport.py --sport tennis
```

The script:
1. Loads `<sport>/config.json` for shot types + labeler config
2. Walks `<sport>/videos/` — file with `test` in the name is held out
3. Auto-labels every shot moment in every training video
4. Filters labels to confidence ≥ 0.5
5. Extracts MoveNet pose features for the kept clips
6. Trains a RandomForest on the features
7. **Saves to `backend/models/shot_classifier_<sport>.joblib`** — commit + push to deploy
8. Reports test accuracy + sample predictions on the held-out video

## What labeler does each sport use?
| Sport | Labeler | Why |
|---|---|---|
| **badminton** | LSTM (RichardPinter, 504 KB) | Pretrained on 15 pro matches — high quality for free |
| **tennis** | Groq Vision LLM | No good public pretrained classifier — LLM is the best bootstrap option |
| **table_tennis** | Groq Vision LLM | Same |
| **pickleball** | Groq Vision LLM | Same |
| **cricket** | Groq Vision LLM | Same |

If you find a pretrained model for one of the Groq-only sports, drop the weights file in the sport folder and add `lstm_weights` to its `config.json`.

## Notes
- **No need to pre-downscale videos** — the script handles native resolution. If you hit OOM on a small machine, pass `--max-clips-per-video 30`.
- **Labels are cached** in `<sport>/labels/<hash>.json`. Deleting the cache forces re-labeling.
- **`--use-yolo`** flag: uses YOLO11x-pose for the labeling step's pose extraction (the LSTM was trained on it). Adds ~250MB ultralytics dep. Estimated +5-10% label accuracy on badminton. Only matters during the bootstrap labeling phase — production inference always uses MoveNet.
- **Multiple sports** — each commit replaces only `backend/models/shot_classifier_<sport>.joblib`. Different sports' models coexist.

## After training
The frontend's `/test-model` page and the new "Match Insights" card on `/analyze` will pick up the deployed model on next deploy. The `/api/predict-shot` endpoint accepts a `?sport=` query param (or defaults to badminton) to pick the right model.
