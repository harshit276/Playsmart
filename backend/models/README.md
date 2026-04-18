# Shot Classifier Model

Drop your trained `shot_classifier.joblib` here, then `git push` —
Vercel auto-deploys and `/api/predict-shot` becomes live.

```bash
# After running training/train_classifier.py:
copy training\shot_classifier.joblib backend\models\shot_classifier.joblib
git add backend/models/shot_classifier.joblib
git commit -m "Update shot classifier"
git push
```

The endpoint loads it lazily on first request, so a fresh deploy
with a new model file picks it up automatically.
