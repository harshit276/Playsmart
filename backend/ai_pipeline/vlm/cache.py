"""Disk cache for VLM responses keyed by (video_path, time_window, sport, backend).

Avoids re-running the VLM on the same shot moment when the user re-uploads
or we re-run analysis. Cheap insurance against API costs.
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parents[2] / "dataset" / "vlm_cache"


def _key(video_path: str | Path, start_sec: float | None,
         end_sec: float | None, sport: str, backend: str, model: str,
         target_player: str) -> str:
    """Stable hash including file size + mtime so cache invalidates if the
    underlying video changes."""
    p = Path(video_path)
    try:
        size = p.stat().st_size
        mtime = int(p.stat().st_mtime)
    except OSError:
        size, mtime = 0, 0
    payload = f"{p.name}|{size}|{mtime}|{start_sec}|{end_sec}|{sport}|{backend}|{model}|{target_player}"
    return hashlib.sha256(payload.encode()).hexdigest()[:24]


def get(*args, **kwargs) -> dict | None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    k = _key(*args, **kwargs)
    f = CACHE_DIR / f"{k}.json"
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def put(value: dict, *args, **kwargs) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    k = _key(*args, **kwargs)
    value = {**value, "_cached_at": int(time.time())}
    (CACHE_DIR / f"{k}.json").write_text(json.dumps(value, indent=2),
                                          encoding="utf-8")
