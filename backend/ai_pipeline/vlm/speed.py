"""VLM-driven shot-speed estimation.

The VLM returns a categorical power_level (soft|medium|hard|max). We map that
to a km/h range by shot type — VLMs are unreliable at quoting raw numbers,
but they reliably distinguish "controlled tap" from "explosive whip". Numbers
calibrated against published pro data:
  - Smash: pro recreational ~250-300, club hard ~200, club medium ~150
  - Clear: ~120-180 km/h for committed pros
  - Drop: ~30-80 km/h, mostly slow
  - Drive: ~100-200 km/h, flat trajectory
  - Net shot / block: ~15-40 km/h, touch shots
  - Lift: ~50-100 km/h underarm
  - Serve: ~25-70 km/h (low/high serves)
  - Tennis serve: ~120-220 km/h, groundstrokes ~80-150
  - TT smash: ~80-120 km/h
"""
from __future__ import annotations


_TABLE: dict[str, dict[str, dict[str, float]]] = {
    "badminton": {
        "smash":    {"soft": 130, "medium": 180, "hard": 240, "max": 300},
        "clear":    {"soft":  80, "medium": 110, "hard": 150, "max": 180},
        "drive":    {"soft":  90, "medium": 130, "hard": 170, "max": 200},
        "drop":     {"soft":  25, "medium":  45, "hard":  65, "max":  85},
        "net_shot": {"soft":  10, "medium":  20, "hard":  30, "max":  40},
        "lift":     {"soft":  40, "medium":  60, "hard":  85, "max": 110},
        "serve":    {"soft":  20, "medium":  35, "hard":  55, "max":  75},
        "block":    {"soft":  20, "medium":  40, "hard":  60, "max":  80},
    },
    "tennis": {
        "serve":     {"soft": 100, "medium": 150, "hard": 190, "max": 230},
        "forehand":  {"soft":  70, "medium": 110, "hard": 145, "max": 180},
        "backhand":  {"soft":  60, "medium":  95, "hard": 130, "max": 160},
        "overhead":  {"soft":  90, "medium": 130, "hard": 170, "max": 210},
        "volley":    {"soft":  50, "medium":  80, "hard": 110, "max": 140},
        "drop_shot": {"soft":  20, "medium":  35, "hard":  50, "max":  65},
        "slice":     {"soft":  50, "medium":  75, "hard": 100, "max": 125},
        "lob":       {"soft":  30, "medium":  50, "hard":  75, "max": 100},
    },
    "table_tennis": {
        "smash":          {"soft":  60, "medium":  85, "hard": 110, "max": 130},
        "forehand_loop":  {"soft":  40, "medium":  60, "hard":  85, "max": 110},
        "backhand_loop":  {"soft":  35, "medium":  55, "hard":  75, "max":  95},
        "forehand_drive": {"soft":  35, "medium":  55, "hard":  75, "max":  95},
        "backhand_drive": {"soft":  30, "medium":  50, "hard":  70, "max":  90},
        "push":           {"soft":  15, "medium":  25, "hard":  35, "max":  45},
        "chop":           {"soft":  20, "medium":  35, "hard":  50, "max":  65},
        "serve":          {"soft":  20, "medium":  35, "hard":  55, "max":  75},
        "flick":          {"soft":  35, "medium":  55, "hard":  75, "max":  95},
        "block":          {"soft":  25, "medium":  40, "hard":  60, "max":  80},
    },
    "pickleball": {
        "drive":           {"soft":  35, "medium":  55, "hard":  75, "max":  95},
        "drop":            {"soft":  20, "medium":  30, "hard":  45, "max":  60},
        "dink":            {"soft":  10, "medium":  20, "hard":  30, "max":  40},
        "serve":           {"soft":  30, "medium":  50, "hard":  70, "max":  85},
        "volley":          {"soft":  30, "medium":  50, "hard":  70, "max":  90},
        "lob":             {"soft":  25, "medium":  40, "hard":  60, "max":  80},
        "overhead":        {"soft":  50, "medium":  80, "hard": 110, "max": 140},
        "third_shot_drop": {"soft":  20, "medium":  30, "hard":  45, "max":  60},
    },
}

# Generic fallback (unknown sport or unknown shot)
_FALLBACK = {"soft": 30, "medium": 60, "hard": 100, "max": 150}


def estimate_speed_from_power(
    sport: str, shot_type: str, power_level: str
) -> dict:
    """Map (sport, shot, power) → estimated speed in km/h.

    Returns {"estimated_speed_kmh": float, "source": "vlm_power_map",
             "power_level": str}.
    """
    sport = (sport or "badminton").lower()
    shot = (shot_type or "").lower().strip().replace(" ", "_")
    power = (power_level or "medium").lower().strip()
    if power not in ("soft", "medium", "hard", "max"):
        power = "medium"

    table = _TABLE.get(sport, {}).get(shot)
    if table is None:
        kmh = _FALLBACK[power]
    else:
        kmh = table[power]
    return {
        "estimated_speed_kmh": float(kmh),
        "source": "vlm_power_map",
        "power_level": power,
    }
