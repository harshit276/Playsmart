"""
Curated pro-reference clips per sport + shot type.

Each entry points to a SPECIFIC moment in a publicly available YouTube
video showing the IDEAL execution of that shot. The frontend embeds
the YouTube iframe with start/end params so only the relevant 3-6
seconds of the reference play.

Curation status: SEED DATA. The YouTube IDs below are placeholders /
best-effort initial picks. They should be reviewed and replaced by a
domain expert before production. Each entry needs:
    1. The exact contact moment falls inside [start_sec, end_sec]
    2. The clip is clear, side-angle preferred
    3. The player is recognizable (named in `player`)
    4. The shot type matches our internal vocabulary (not a flick when
       we said smash)

To add a new entry:
    REFERENCE_VIDEOS["badminton"]["smash"] = {
        "youtube_id": "abc123XYZ",
        "start_sec": 12,
        "end_sec": 16,
        "player": "Viktor Axelsen",
        "description": "Full-court jump smash with explosive contact",
    }
"""
from __future__ import annotations

# yt-dlp / yt-search anchor: any of these IDs replaced as we curate.
# Format: {sport: {shot_type: {fields...}}}
REFERENCE_VIDEOS: dict[str, dict[str, dict]] = {
    "badminton": {
        "smash": {
            "youtube_id": "ZdpvKvN9Wo4",
            "start_sec": 18, "end_sec": 24,
            "player": "Viktor Axelsen",
            "description": "Full-court jump smash — explosive contact, follow-through across body.",
        },
        "clear": {
            "youtube_id": "f5Y2THxK0Wg",
            "start_sec": 30, "end_sec": 36,
            "player": "Lee Chong Wei",
            "description": "Defensive overhead clear — high deep arc to opponent's back court.",
        },
        "drop": {
            "youtube_id": "tFwxxMnRfsg",
            "start_sec": 12, "end_sec": 18,
            "player": "Kento Momota",
            "description": "Slice drop — disguised, just clears the net, dies in front court.",
        },
        "net_shot": {
            "youtube_id": "p0p5K9Y8AaI",
            "start_sec": 5, "end_sec": 11,
            "player": "Tai Tzu Ying",
            "description": "Tight net shot — wrist roll, shuttle tumbles down the tape.",
        },
        "drive": {
            "youtube_id": "0KGtwDvfeJI",
            "start_sec": 22, "end_sec": 27,
            "player": "Chen Long",
            "description": "Flat drive — shoulder rotation, contact in front of body.",
        },
        "serve": {
            "youtube_id": "Bb_4d9_VxqI",
            "start_sec": 8, "end_sec": 13,
            "player": "Hendra Setiawan (doubles)",
            "description": "Short low serve — wrist flick, shuttle skims the net.",
        },
        "lift": {
            "youtube_id": "wXqo3xKgrXk",
            "start_sec": 14, "end_sec": 19,
            "player": "Pusarla V. Sindhu",
            "description": "Underarm lift — full extension, high arc to opponent's back court.",
        },
    },
    "tennis": {
        "forehand": {
            "youtube_id": "8sxr0WRMzaY",
            "start_sec": 16, "end_sec": 22,
            "player": "Rafael Nadal",
            "description": "Heavy topspin forehand — open stance, hip drive, follow-through over shoulder.",
        },
        "backhand": {
            "youtube_id": "vUDg8K3WUv8",
            "start_sec": 20, "end_sec": 26,
            "player": "Novak Djokovic",
            "description": "Two-handed backhand — compact backswing, full body uncoil at contact.",
        },
        "serve": {
            "youtube_id": "yJfeWELE0bk",
            "start_sec": 12, "end_sec": 18,
            "player": "Roger Federer",
            "description": "Flat serve — high toss, full extension, racket head speed at contact.",
        },
        "volley": {
            "youtube_id": "DfMyB0NUdNs",
            "start_sec": 10, "end_sec": 16,
            "player": "Stefan Edberg",
            "description": "Forehand volley — short punch, knees bent, racket face open.",
        },
        "slice": {
            "youtube_id": "9XK4N0xqQbU",
            "start_sec": 25, "end_sec": 31,
            "player": "Roger Federer",
            "description": "Backhand slice — high-to-low racket path, ball stays low after bounce.",
        },
    },
    "table_tennis": {
        "forehand_drive": {
            "youtube_id": "rkfBQfgGiPo",
            "start_sec": 9, "end_sec": 13,
            "player": "Ma Long",
            "description": "Forehand topspin drive — body rotation, contact at peak of bounce.",
        },
        "backhand_drive": {
            "youtube_id": "ZjLM3WtY5gE",
            "start_sec": 14, "end_sec": 18,
            "player": "Timo Boll",
            "description": "Backhand drive — wrist snap, racket angle closed over the ball.",
        },
        "smash": {
            "youtube_id": "9YEofMx00CE",
            "start_sec": 18, "end_sec": 22,
            "player": "Fan Zhendong",
            "description": "Forehand smash — full swing, ball lifted above table height before contact.",
        },
    },
    "cricket": {
        # Cricket uses different vocab — these match our internal shot types.
        "cover_drive": {
            "youtube_id": "1Q8fG0TtVAY",
            "start_sec": 22, "end_sec": 28,
            "player": "Virat Kohli",
            "description": "Front-foot cover drive — full stride, head over the ball, full follow-through.",
        },
        "pull_shot": {
            "youtube_id": "p0K_qP6Zfqs",
            "start_sec": 15, "end_sec": 21,
            "player": "Rohit Sharma",
            "description": "Pull shot — back-foot pivot, horizontal bat, eyes on ball through contact.",
        },
        "bowling_action": {
            "youtube_id": "GUkb_5VEbeI",
            "start_sec": 10, "end_sec": 16,
            "player": "Jasprit Bumrah",
            "description": "Fast-bowling action — coiled run-up, high-arm release, full follow-through.",
        },
    },
    "pickleball": {
        "dink": {
            "youtube_id": "VBl5KhwsW1U",
            "start_sec": 18, "end_sec": 24,
            "player": "Ben Johns",
            "description": "Soft dink — paddle face open, contact in front, ball lands in kitchen.",
        },
        "drive": {
            "youtube_id": "WnzzL56FqdM",
            "start_sec": 14, "end_sec": 19,
            "player": "Anna Leigh Waters",
            "description": "Drive return — low flat shot at opponent's feet, pace + placement.",
        },
        "third_shot_drop": {
            "youtube_id": "qFCNuKgWvQU",
            "start_sec": 9, "end_sec": 15,
            "player": "Tyson McGuffin",
            "description": "Third-shot drop — arc just over the net, lands soft in the kitchen.",
        },
    },
}


def get_reference(sport: str, shot_type: str) -> dict | None:
    """Look up the pro reference for a shot. Returns None when there's
    no curated entry yet (frontend hides the Compare-to-Pro button)."""
    sport_l = (sport or "").lower().strip()
    shot_l = (shot_type or "").lower().strip().replace(" ", "_")
    s = REFERENCE_VIDEOS.get(sport_l)
    if not s:
        return None
    # Direct hit
    entry = s.get(shot_l)
    if entry:
        return {**entry, "sport": sport_l, "shot_type": shot_l}
    # Fuzzy fallback: try removing common suffixes / prefixes
    for known in s:
        if known in shot_l or shot_l in known:
            return {**s[known], "sport": sport_l, "shot_type": known}
    return None


def available_references(sport: str) -> list[str]:
    """List shot types we have a curated reference for in this sport."""
    return list(REFERENCE_VIDEOS.get((sport or "").lower(), {}).keys())
