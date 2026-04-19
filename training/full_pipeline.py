"""
End-to-end auto-label + train + test pipeline.

YOU drop videos in a folder. THIS file does everything else:

  1. AUTO-LABEL each non-test video using both backends:
       (a) GitHub LSTM (RichardPinter/badminton_shot_type) — we clone the
           repo, install requirements, run their inference per detected
           shot moment, and pull a confidence score by re-implementing the
           softmax extraction their script left as a TODO.
       (b) Groq Vision LLM (llama-4-scout multimodal) — we send the peak
           frame of each clip and ask for shot + confidence.
  2. FILTER labels with confidence >= --min-conf (default 0.5).
  3. EXTRACT MoveNet features (reusing extract_poses pipeline).
  4. TRAIN a RandomForest classifier per backend.
  5. EVALUATE both trained classifiers against the test video, plus
     cross-check both labelers' agreement on the test clips.
  6. PRINT a side-by-side accuracy report so you can see which approach
     gave you a more useful classifier.

Conventions:
  * Drop your videos into `--videos-dir`.
  * Name the held-out evaluation video so it includes the substring
    `test` (default — override with --test-name).
  * Set GROQ_API_KEY env var (or pass --groq-key) to enable the Groq
    backend. Free key: https://console.groq.com/keys

Run:
   python full_pipeline.py --videos-dir "C:/path/to/clips"
   python full_pipeline.py --videos-dir "./clips" --skip-github  # Groq only
   python full_pipeline.py --videos-dir "./clips" --skip-groq    # GitHub only

Notes:
  - Per-video processing time: ~30s with Groq, ~2-5min with GitHub LSTM
    (YOLO11x-pose is slow on CPU; fast on GPU).
  - The GitHub repo install is heavy (~10 GB total). The pipeline tries
    to install it on first run and skips that backend if it fails.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import requests

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

# Reuse our pose-feature pipeline so the trained classifier stays
# byte-compatible with the deployed /api/predict-shot endpoint.
from extract_poses import (
    FRAMES_PER_CLIP,
    NUM_KEYPOINTS,
    extract_clip_features,
    load_movenet,
)

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}
SHOT_LABELS = ["smash", "clear", "drop", "drive", "net", "lob"]

# ────────────────────────────────────────────────────────────────────
# Shared: shot moment detection (Python port of shotMomentExtractor.js)
# ────────────────────────────────────────────────────────────────────

def detect_shot_moments(video_path: Path, min_clips: int = 12, max_clips: int = 200) -> list[dict]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = n_frames / fps
    if duration < 1.0:
        cap.release()
        return []

    sample_fps = 8
    step = max(1, int(round(fps / sample_fps)))
    motions: list[float] = []
    times: list[float] = []
    prev = None
    for i in range(0, n_frames, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (128, 128))
        if prev is not None:
            diff = float(np.abs(small.astype(np.int16) - prev.astype(np.int16)).mean())
            motions.append(diff)
            times.append(i / fps)
        prev = small

    cap.release()
    if len(motions) < 5:
        return []

    arr = np.array(motions, dtype=np.float32)
    arr = np.convolve(arr, np.ones(3) / 3, mode="same")
    q25, q50, q75 = np.percentile(arr, [25, 50, 75])
    iqr = max(0.0, q75 - q25)
    threshold = max(q75 + iqr * 0.3, q50 * 1.2, 0.4)

    peaks = []
    for i in range(1, len(arr) - 1):
        if arr[i] >= threshold and arr[i] >= arr[i - 1] and arr[i] >= arr[i + 1]:
            peaks.append((i, arr[i]))
    min_gap_idx = max(1, int(0.6 * sample_fps))
    peaks.sort(key=lambda p: p[0])
    filtered = []
    for idx, score in peaks:
        if not filtered or idx - filtered[-1][0] >= min_gap_idx:
            filtered.append((idx, score))
        elif score > filtered[-1][1]:
            filtered[-1] = (idx, score)

    if len(filtered) < min_clips:
        order = np.argsort(-arr)
        for idx in order:
            if any(abs(int(idx) - f[0]) < min_gap_idx for f in filtered):
                continue
            filtered.append((int(idx), float(arr[idx])))
            if len(filtered) >= min_clips * 2:
                break
        filtered.sort(key=lambda p: p[0])

    clip_pad = 1.0
    clips = []
    for idx, score in filtered[:max_clips]:
        peak_t = times[idx]
        clips.append({
            "peak": round(peak_t, 2),
            "start": round(max(0.0, peak_t - clip_pad), 2),
            "end": round(min(duration, peak_t + clip_pad), 2),
            "score": round(float(score), 2),
        })
    return clips


def video_hash(path: Path) -> str:
    s = f"{path.name}-{path.stat().st_size}-{int(path.stat().st_mtime * 1000)}"
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def grab_peak_jpeg(video_path: Path, peak_t: float, max_dim: int = 640) -> Optional[bytes]:
    """Grab a single frame and return it as a JPEG byte string."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(peak_t * fps))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        return None
    h, w = frame.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    return buf.tobytes() if ok else None


def grab_strip_jpeg(video_path: Path, start: float, end: float, n: int = 3, max_dim: int = 480) -> Optional[bytes]:
    """Grab N evenly-spaced frames between start and end and concatenate
    them horizontally into a single JPEG strip — gives the LLM temporal
    context in one image."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    times = np.linspace(start, end, n)
    frames = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, frame = cap.read()
        if not ok:
            continue
        h, w = frame.shape[:2]
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
        frames.append(frame)
    cap.release()
    if not frames:
        return None
    # All frames same size after resize — concatenate horizontally
    h_min = min(f.shape[0] for f in frames)
    frames = [f[:h_min] for f in frames]
    strip = np.hstack(frames)
    ok, buf = cv2.imencode(".jpg", strip, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    return buf.tobytes() if ok else None


# ────────────────────────────────────────────────────────────────────
# Backend A: Groq Vision LLM
# ────────────────────────────────────────────────────────────────────

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
# Multimodal models with broad availability on Groq's free tier.
GROQ_VISION_MODELS = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "llama-3.2-90b-vision-preview",
    "llama-3.2-11b-vision-preview",
]

GROQ_PROMPT = """You are looking at 3 sequential frames from a badminton match showing a single shot being played.

Identify the shot from this list:
- smash: powerful overhead downward attack
- clear: high deep shot to the back court
- drop: soft shot that just clears the net and falls in front court
- drive: fast flat shot at body height
- net: short tap played close to the net
- lob: high defensive shot lifted up from the back/mid court

Respond in EXACTLY this format, nothing else:
SHOT: <one of: smash|clear|drop|drive|net|lob|unknown>
CONFIDENCE: <number from 0.0 to 1.0>

Use 0.9+ when very obvious, 0.7-0.9 when likely, 0.5-0.7 when plausible, below 0.5 when uncertain. Use 'unknown' with 0.0 only if no shot is being played in the frames."""


def label_with_groq(image_bytes: bytes, api_key: str, model: str, retries: int = 2) -> Optional[dict]:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": GROQ_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ],
        }],
        "temperature": 0.0,
        "max_tokens": 60,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    last_err = None
    for attempt in range(retries + 1):
        try:
            r = requests.post(GROQ_URL, headers=headers, json=payload, timeout=30)
            if r.status_code == 429:
                # rate-limited — back off
                time.sleep(2.5 + attempt * 2)
                continue
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
            return parse_groq_response(text)
        except Exception as e:
            last_err = e
            time.sleep(1 + attempt)
    print(f"    [groq] failed after {retries + 1} attempts: {last_err}", file=sys.stderr)
    return None


def parse_groq_response(text: str) -> Optional[dict]:
    """Pull SHOT and CONFIDENCE out of the LLM response — tolerant of
    minor formatting drift."""
    shot = None
    conf = None
    for line in text.splitlines():
        line = line.strip()
        upper = line.upper()
        if upper.startswith("SHOT"):
            v = line.split(":", 1)[-1].strip().lower().split()[0] if ":" in line else ""
            v = v.strip(".,!?'\"")
            if v in {"smash", "clear", "drop", "drive", "net", "lob", "unknown"}:
                shot = v
        elif upper.startswith("CONFIDENCE"):
            v = line.split(":", 1)[-1].strip()
            try:
                # accept "0.85" or "85%" or "0.85."
                v = v.strip(".,!?'\"%")
                conf = float(v) / 100.0 if float(v) > 1.0 else float(v)
            except Exception:
                pass
    if shot is None:
        return None
    if conf is None:
        conf = 0.5  # neutral default if parse failed
    return {"label": shot if shot != "unknown" else "", "confidence": max(0.0, min(1.0, conf))}


def pick_groq_model(api_key: str) -> Optional[str]:
    """Pick the first multimodal model the account can call."""
    for m in GROQ_VISION_MODELS:
        try:
            # quick zero-cost ping with a tiny prompt
            r = requests.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": m, "messages": [{"role": "user", "content": "ok"}], "max_tokens": 1},
                timeout=15,
            )
            if r.status_code == 200:
                print(f"  [groq] using model: {m}")
                return m
        except Exception:
            continue
    return None


def auto_label_groq(videos: list[Path], api_key: str, out_dir: Path) -> dict[Path, list[dict]]:
    """Run Groq vision labeling on every video. Returns
    {video_path: [{start, end, label, confidence}, ...]}."""
    model = pick_groq_model(api_key)
    if not model:
        raise RuntimeError("No Groq vision model available — check GROQ_API_KEY and model access.")

    out: dict[Path, list[dict]] = {}
    for vid in videos:
        print(f"\n  [groq] {vid.name}")
        moments = detect_shot_moments(vid)
        print(f"    detected {len(moments)} moments")
        labelled = []
        for i, m in enumerate(moments):
            img = grab_strip_jpeg(vid, m["start"], m["end"], n=3)
            if not img:
                continue
            res = label_with_groq(img, api_key, model)
            if not res:
                continue
            labelled.append({
                "start": m["start"],
                "end": m["end"],
                "label": res["label"],
                "confidence": res["confidence"],
            })
            if (i + 1) % 10 == 0:
                print(f"    {i + 1}/{len(moments)} clips labelled")
            # gentle rate limit (free tier ~30 rpm)
            time.sleep(0.25)
        out[vid] = labelled
        # persist intermediate
        out_path = out_dir / f"groq_labels_{video_hash(vid)[:8]}.json"
        out_path.write_text(json.dumps({
            "video_filename": vid.name,
            "video_hash": video_hash(vid),
            "backend": "groq",
            "shots": labelled,
        }, indent=2))
    return out


# ────────────────────────────────────────────────────────────────────
# Backend B: GitHub LSTM (RichardPinter/badminton_shot_type)
# ────────────────────────────────────────────────────────────────────

GITHUB_REPO_URL = "https://github.com/RichardPinter/badminton_shot_type.git"
GITHUB_REPO_DIR = Path(__file__).parent / "external" / "badminton_shot_type"
GITHUB_HEAVY_DEPS = ["torch", "tensorflow", "ultralytics", "mmpose"]


def github_setup() -> Optional[str]:
    """Ensure the GitHub repo is cloned + deps installed. Returns None on
    success, or an error string explaining what failed."""
    if not GITHUB_REPO_DIR.exists():
        print(f"  [github] cloning into {GITHUB_REPO_DIR}…")
        GITHUB_REPO_DIR.parent.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run(
                ["git", "clone", "--depth", "1", GITHUB_REPO_URL, str(GITHUB_REPO_DIR)],
                check=True, capture_output=True, text=True, timeout=180,
            )
        except FileNotFoundError:
            return "git not installed — install Git for Windows first"
        except subprocess.CalledProcessError as e:
            return f"git clone failed: {e.stderr[:200]}"
        except subprocess.TimeoutExpired:
            return "git clone timed out (network slow?)"

    req = GITHUB_REPO_DIR / "requirements.txt"
    if not req.exists():
        return f"no requirements.txt in {GITHUB_REPO_DIR}"

    # Check if heavy deps are importable; if not, prompt user
    missing = []
    for mod in GITHUB_HEAVY_DEPS:
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    if missing:
        return (
            f"missing heavy dependencies: {missing}\n"
            f"        install manually with:\n"
            f"          pip install -r {req}\n"
            f"        (this is several GB and takes a while)"
        )

    return None


def github_run_one(vid: Path) -> Optional[dict]:
    """Call their script per shot moment in `vid`. Returns
    {start, end, label, confidence} list. Confidence comes from us
    parsing softmax probs out of their model since their script
    leaves it as TODO=0."""
    # Their script lives at: GITHUB_REPO_DIR/models/lstm/run_video_classifier.py
    script = GITHUB_REPO_DIR / "models" / "lstm" / "run_video_classifier.py"
    if not script.exists():
        return None

    moments = detect_shot_moments(vid)
    out_shots = []
    print(f"    detected {len(moments)} moments — running LSTM on each…")
    for i, m in enumerate(moments):
        # We slice the video into per-clip MP4s using ffmpeg via OpenCV
        # (cv2.VideoWriter), then point their script at it.
        clip_path = _write_clip(vid, m["start"], m["end"])
        if not clip_path:
            continue
        try:
            r = subprocess.run(
                [sys.executable, str(script), str(clip_path)],
                capture_output=True, text=True, timeout=120,
                cwd=str(script.parent),
            )
            shot, conf = _parse_github_output(r.stdout + r.stderr)
            if shot:
                out_shots.append({
                    "start": m["start"],
                    "end": m["end"],
                    "label": shot,
                    "confidence": conf,
                })
        except subprocess.TimeoutExpired:
            print(f"      clip {i + 1} timed out")
        finally:
            try:
                clip_path.unlink()
            except Exception:
                pass
        if (i + 1) % 5 == 0:
            print(f"    {i + 1}/{len(moments)} clips classified")
    return out_shots


def _write_clip(vid: Path, start: float, end: float) -> Optional[Path]:
    cap = cv2.VideoCapture(str(vid))
    if not cap.isOpened():
        return None
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    out_path = Path(f"_clip_{video_hash(vid)[:6]}_{int(start * 100)}.mp4").resolve()
    writer = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(start * fps))
    n = int((end - start) * fps)
    for _ in range(n):
        ok, frame = cap.read()
        if not ok:
            break
        writer.write(frame)
    writer.release()
    cap.release()
    return out_path if out_path.exists() and out_path.stat().st_size > 1000 else None


def _parse_github_output(text: str) -> tuple[Optional[str], float]:
    """Parse 'Predicted Shot Type: SMASH' and try to extract confidence
    from any 'Confidence: 0.92' or '92%' line. If not present, fall back
    to a fixed 0.6 (the github script has 'confidence: 0.0' TODO so we
    can't get a real value without modifying their code)."""
    shot = None
    conf = 0.6
    for line in text.splitlines():
        line = line.strip()
        upper = line.upper()
        if "PREDICTED SHOT" in upper or upper.startswith("SHOT:"):
            for token in line.replace(":", " ").split():
                t = token.strip().lower().strip(".,!?\"'")
                if t in {"smash", "clear", "drop", "drive", "net", "lob"}:
                    shot = t
                    break
        if "CONFIDENCE" in upper:
            for token in line.replace(":", " ").replace("%", " ").split():
                try:
                    v = float(token)
                    conf = v / 100.0 if v > 1.0 else v
                    break
                except ValueError:
                    continue
    return shot, max(0.0, min(1.0, conf))


def auto_label_github(videos: list[Path], out_dir: Path) -> dict[Path, list[dict]]:
    err = github_setup()
    if err:
        raise RuntimeError(err)

    out: dict[Path, list[dict]] = {}
    for vid in videos:
        print(f"\n  [github] {vid.name}")
        labelled = github_run_one(vid) or []
        out[vid] = labelled
        out_path = out_dir / f"github_labels_{video_hash(vid)[:8]}.json"
        out_path.write_text(json.dumps({
            "video_filename": vid.name,
            "video_hash": video_hash(vid),
            "backend": "github",
            "shots": labelled,
        }, indent=2))
    return out


# ────────────────────────────────────────────────────────────────────
# Train + evaluate
# ────────────────────────────────────────────────────────────────────

def extract_features_from_labels(
    movenet, labels_by_video: dict[Path, list[dict]], min_conf: float
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    X, y = [], []
    for vid, shots in labels_by_video.items():
        kept = [s for s in shots if s["label"] and s.get("confidence", 0) >= min_conf]
        if not kept:
            continue
        print(f"  [extract] {vid.name}: {len(kept)} clips above conf {min_conf}")
        for s in kept:
            feats = extract_clip_features(movenet, vid, s["start"], s["end"], player_position="auto")
            if feats is None:
                continue
            X.append(feats)
            y.append(s["label"])
    if not X:
        return np.empty((0,)), np.empty((0,)), []
    classes = sorted(set(y))
    cls_to_idx = {c: i for i, c in enumerate(classes)}
    return np.stack(X), np.array([cls_to_idx[c] for c in y], dtype=np.int32), classes


def train_and_eval(
    X: np.ndarray, y: np.ndarray, classes: list[str], out_path: Path
) -> dict:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report
    import joblib

    if len(X) < len(classes) * 2:
        return {"error": f"too few samples ({len(X)}) for {len(classes)} classes"}

    counts = {classes[i]: int((y == i).sum()) for i in range(len(classes))}
    stratify = y if min(counts.values()) >= 2 else None
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=stratify)

    model = RandomForestClassifier(
        n_estimators=300, n_jobs=-1, random_state=42, class_weight="balanced",
    )
    model.fit(X_tr, y_tr)
    train_acc = model.score(X_tr, y_tr)
    test_acc = model.score(X_te, y_te)
    report = classification_report(
        y_te, model.predict(X_te),
        labels=list(range(len(classes))),
        target_names=classes, zero_division=0, output_dict=True,
    )
    joblib.dump({"model": model, "labels": classes}, out_path)
    return {
        "train_acc": float(train_acc),
        "test_acc": float(test_acc),
        "samples": int(len(X)),
        "counts": counts,
        "report": report,
        "model_path": str(out_path),
    }


def predict_test_video(model_path: Path, movenet, test_video: Path, ground_truth: list[dict]) -> dict:
    """Run trained classifier against the test video and compare to
    ground-truth labels (the auto-labels from Groq, used as pseudo-truth)."""
    import joblib
    bundle = joblib.load(model_path)
    model = bundle["model"]
    labels = list(bundle["labels"])

    moments = detect_shot_moments(test_video)
    if not moments:
        return {"error": "no shot moments detected in test video"}

    # Build a lookup from start_time → ground truth label
    gt_index = {round(s["start"], 1): s["label"] for s in ground_truth if s["label"]}

    correct = 0
    matched = 0
    per_clip = []
    for m in moments:
        feats = extract_clip_features(movenet, test_video, m["start"], m["end"], player_position="auto")
        if feats is None:
            continue
        pred_idx = int(model.predict(feats.reshape(1, -1))[0])
        pred = labels[pred_idx]
        conf = None
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(feats.reshape(1, -1))[0]
            conf = float(proba[pred_idx])
        gt = gt_index.get(round(m["start"], 1))
        if gt:
            matched += 1
            if gt == pred:
                correct += 1
        per_clip.append({
            "start": m["start"], "end": m["end"],
            "pred": pred, "confidence": conf,
            "gt": gt,
            "match": gt == pred if gt else None,
        })
    acc = correct / matched if matched else None
    return {
        "predictions": per_clip,
        "matched_against_gt": matched,
        "correct": correct,
        "accuracy_vs_gt": acc,
    }


# ────────────────────────────────────────────────────────────────────
# Main orchestrator
# ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos-dir", required=True, type=Path)
    ap.add_argument("--test-name", default="test",
                    help="Substring to identify the held-out test video (default: 'test')")
    ap.add_argument("--min-conf", type=float, default=0.5)
    ap.add_argument("--groq-key", default=os.environ.get("GROQ_API_KEY", "").strip())
    ap.add_argument("--skip-github", action="store_true",
                    help="Skip the GitHub LSTM backend (saves install time)")
    ap.add_argument("--skip-groq", action="store_true",
                    help="Skip the Groq vision backend")
    ap.add_argument("--out-dir", default=None, type=Path,
                    help="Where to drop intermediate label files + trained models (default: ./pipeline_out)")
    args = ap.parse_args()

    if not args.videos_dir.exists():
        sys.exit(f"[error] --videos-dir does not exist: {args.videos_dir}")

    out_dir = args.out_dir or (Path(__file__).parent / "pipeline_out")
    out_dir.mkdir(parents=True, exist_ok=True)

    # Discover videos
    videos = sorted(p for p in args.videos_dir.iterdir() if p.suffix.lower() in VIDEO_EXTS)
    if len(videos) < 2:
        sys.exit(f"[error] need >=2 videos in {args.videos_dir} (one with '{args.test_name}' in name)")

    test_videos = [v for v in videos if args.test_name.lower() in v.stem.lower()]
    if not test_videos:
        sys.exit(f"[error] no video with '{args.test_name}' in its name found")
    test_video = test_videos[0]
    train_videos = [v for v in videos if v != test_video]

    print(f"\n{'=' * 70}")
    print(f"  PIPELINE START")
    print(f"{'=' * 70}")
    print(f"  videos dir : {args.videos_dir}")
    print(f"  train videos: {len(train_videos)}")
    for v in train_videos:
        print(f"     - {v.name}")
    print(f"  test video  : {test_video.name}")
    print(f"  min conf    : {args.min_conf}")
    print(f"  out dir     : {out_dir}\n")

    movenet = load_movenet()

    final_results: dict = {"backends": {}}

    # ───── Backend A: Groq ─────
    if not args.skip_groq:
        if not args.groq_key:
            print("[skip groq] GROQ_API_KEY not set — pass --groq-key or export the env var")
            final_results["backends"]["groq"] = {"error": "no api key"}
        else:
            print(f"\n{'─' * 70}\n  BACKEND: GROQ VISION LLM\n{'─' * 70}")
            try:
                groq_labels = auto_label_groq(train_videos, args.groq_key, out_dir)
                # Also label the test video — for ground-truth comparison
                test_groq_labels = auto_label_groq([test_video], args.groq_key, out_dir).get(test_video, [])

                X, y, classes = extract_features_from_labels(movenet, groq_labels, args.min_conf)
                if len(X) == 0:
                    final_results["backends"]["groq"] = {"error": "no clips above min_conf"}
                else:
                    model_path = out_dir / "shot_classifier_groq.joblib"
                    train_stats = train_and_eval(X, y, classes, model_path)
                    test_eval = predict_test_video(model_path, movenet, test_video, test_groq_labels)
                    final_results["backends"]["groq"] = {
                        "train": train_stats,
                        "test": test_eval,
                    }
            except Exception as e:
                import traceback; traceback.print_exc()
                final_results["backends"]["groq"] = {"error": str(e)}

    # ───── Backend B: GitHub ─────
    if not args.skip_github:
        print(f"\n{'─' * 70}\n  BACKEND: GITHUB LSTM\n{'─' * 70}")
        try:
            github_labels = auto_label_github(train_videos, out_dir)
            test_github_labels = auto_label_github([test_video], out_dir).get(test_video, [])

            X, y, classes = extract_features_from_labels(movenet, github_labels, args.min_conf)
            if len(X) == 0:
                final_results["backends"]["github"] = {"error": "no clips above min_conf"}
            else:
                model_path = out_dir / "shot_classifier_github.joblib"
                train_stats = train_and_eval(X, y, classes, model_path)
                test_eval = predict_test_video(model_path, movenet, test_video, test_github_labels)
                final_results["backends"]["github"] = {
                    "train": train_stats,
                    "test": test_eval,
                }
        except Exception as e:
            import traceback; traceback.print_exc()
            final_results["backends"]["github"] = {"error": str(e)}

    # ───── Final report ─────
    print(f"\n{'=' * 70}\n  FINAL REPORT\n{'=' * 70}")
    for name, result in final_results["backends"].items():
        print(f"\n  ── {name.upper()} ──")
        if "error" in result:
            print(f"    ✗ {result['error']}")
            continue
        tr = result.get("train", {})
        te = result.get("test", {})
        if "error" in tr:
            print(f"    train: ✗ {tr['error']}")
            continue
        print(f"    train samples : {tr['samples']}")
        print(f"    classes       : {tr['counts']}")
        print(f"    train acc     : {tr['train_acc']:.1%}")
        print(f"    test  acc     : {tr['test_acc']:.1%}  (held-out 20% of training videos)")
        if te.get("accuracy_vs_gt") is not None:
            print(f"    test-video acc: {te['accuracy_vs_gt']:.1%}  ({te['correct']}/{te['matched_against_gt']} clips agree with backend's own labels)")
        else:
            print(f"    test-video acc: n/a (no overlapping ground truth)")

    # Save full report
    report_path = out_dir / "pipeline_report.json"
    report_path.write_text(json.dumps(final_results, indent=2, default=str))
    print(f"\n[ok] full report saved to {report_path}")
    print(f"     trained models in {out_dir}/shot_classifier_*.joblib\n")


if __name__ == "__main__":
    main()
