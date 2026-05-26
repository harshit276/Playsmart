"""
timestamp_pro_clips — one-shot curation tool that refines the
start_sec / end_sec windows in reference_videos.py using Gemini.

Why this exists
---------------
The reference clip catalog was hand-curated with rough timestamps. For
some entries the start/end window is too wide (10s of buildup before
the actual shot) and the user ends up watching the wrong moment of an
otherwise great reference video. We want every entry to land on a
3-5 second window that contains the EXACT contact moment.

Doing this by hand for 38 entries takes hours. Doing it via a single
Gemini call per entry takes ~30 seconds total. The model already
processes YouTube URLs natively via the File API, so we don't need to
download anything locally.

Output
------
Default: prints suggested (start_sec, end_sec) per entry. Human reviewer
copies the diffs into reference_videos.py manually — keeping the curated
file as the source of truth and avoiding accidentally rewriting tested
entries.

Optional `--write JSON_PATH`: dumps the suggestions to a JSON file for
batch review or pipeline integration.

Optional `--apply`: writes the suggestions back into reference_videos.py
in-place. Requires --confirm to avoid accidental edits.

Usage
-----
    # Dry-run, all sports / all shots:
    python -m backend.scripts.timestamp_pro_clips

    # Just badminton:
    python -m backend.scripts.timestamp_pro_clips --sport badminton

    # Just one shot:
    python -m backend.scripts.timestamp_pro_clips --sport badminton --shot smash

    # Save to a review file:
    python -m backend.scripts.timestamp_pro_clips --write tmp/curation.json

    # Write back to reference_videos.py (DANGEROUS — review the diff!):
    python -m backend.scripts.timestamp_pro_clips --apply --confirm

Cost
----
~1 Gemini call per entry. With Gemini 2.5 Flash on a 6-minute YouTube
video: ~10K tokens in, ~200 tokens out. About $0.001 per entry on
Flash, $0.01 on Pro. Full catalog: ~$0.04 on Flash. Cheap enough to
re-run when adding new entries.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

# Resolve the backend/ root so we can import reference_videos regardless
# of where this script is invoked from. Same pattern as scripts/tag_drills.py.
THIS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = THIS_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from reference_videos import REFERENCE_VIDEOS  # type: ignore  # noqa: E402


# ─── Prompt ─────────────────────────────────────────────────────────────
SYS_PROMPT = """You are a sports-coaching librarian indexing reference
clips. Each clip is a single YouTube video showing professional play.
Your job: find the BEST 3-5 second window inside the video that shows
a textbook execution of a specific shot type by a specific player.

CRITERIA for "best window":
  1. The player named below makes contact with the ball/shuttle inside
     the window. The contact instant should fall ~30-50% of the way
     through (so users see a brief setup, the contact, and the
     follow-through).
  2. The camera angle is clear — preferably side or 3/4. Avoid windows
     where the shot is shown only in a small inset, replay graphic, or
     score overlay.
  3. The shot type matches what was requested. If the only example of
     this shot in the video is mediocre, return it anyway and set
     confidence < 0.6 so the human reviewer knows to re-curate.
  4. If the player is shown hitting MULTIPLE good examples of this
     shot, pick the one with the clearest camera angle.

Return ONLY a JSON object:
{
  "start_sec": <int — seconds from video start where the window begins>,
  "end_sec":   <int — seconds from video start where the window ends>,
  "contact_sec": <int — seconds where racket-shuttle contact happens>,
  "confidence": <float 0-1 — how textbook the example is>,
  "rationale":  "<one sentence: why this window>"
}

The window must be 3-7 seconds long. If the entire video doesn't show
this player hitting this shot, return confidence=0 with start/end=0."""


def _build_user_msg(player: str, shot: str, current_start: int, current_end: int) -> str:
    return (
        f"Find the best window in this video showing {player} hitting a "
        f"textbook {shot.replace('_', ' ')}.\n\n"
        f"The catalog currently points at {current_start}-{current_end}s. "
        f"You may keep that window if it's already good, or propose a "
        f"better one anywhere in the video.\n\n"
        f"Return JSON only."
    )


# ─── Gemini call ────────────────────────────────────────────────────────
def _call_gemini(youtube_url: str, player: str, shot: str,
                 current_start: int, current_end: int, model_name: str) -> dict:
    """Send the YouTube URL to Gemini using the File API's URL-ingest
    path. Returns the parsed JSON dict or {"error": ...}."""
    try:
        import google.generativeai as genai  # type: ignore
    except ImportError as exc:
        return {"error": f"google-generativeai not installed: {exc}"}

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {"error": "GEMINI_API_KEY not set"}
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name, system_instruction=SYS_PROMPT)

    parts = [
        # YouTube URL → Gemini fetches and processes server-side.
        {"file_data": {"file_uri": youtube_url, "mime_type": "video/*"}},
        _build_user_msg(player, shot, current_start, current_end),
    ]
    try:
        resp = model.generate_content(
            parts,
            generation_config={
                "temperature": 0.0,
                "response_mime_type": "application/json",
            },
        )
        text = (resp.text or "").strip()
    except Exception as exc:
        return {"error": f"gemini call failed: {str(exc)[:300]}"}

    # Strip fences if any slipped through.
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        out = json.loads(text)
    except Exception as exc:
        return {"error": f"bad json: {exc}", "raw": text[:400]}

    # Sanitize.
    try:
        start = max(0, int(out.get("start_sec", 0)))
        end = max(start + 1, int(out.get("end_sec", start + 5)))
        contact = max(start, min(end, int(out.get("contact_sec", (start + end) // 2))))
        conf = max(0.0, min(1.0, float(out.get("confidence", 0.5))))
    except (TypeError, ValueError):
        return {"error": "non-numeric start/end/contact/confidence in response"}
    return {
        "start_sec": start,
        "end_sec": end,
        "contact_sec": contact,
        "confidence": conf,
        "rationale": str(out.get("rationale", ""))[:300],
    }


# ─── Catalog iteration ──────────────────────────────────────────────────
def _iter_entries(sport_filter: str | None, shot_filter: str | None):
    """Yield (sport, shot_type, entry_dict) tuples for the requested
    subset of the catalog."""
    for sport, shots in REFERENCE_VIDEOS.items():
        if sport_filter and sport != sport_filter:
            continue
        for shot, entry in shots.items():
            if shot_filter and shot != shot_filter:
                continue
            if not isinstance(entry, dict):
                continue
            if not entry.get("youtube_id"):
                continue
            yield sport, shot, entry


def _format_change_row(sport: str, shot: str, old: dict, new: dict) -> str:
    """One-line summary of the suggested change for the dry-run output."""
    o_s, o_e = old.get("start_sec", 0), old.get("end_sec", 0)
    n_s, n_e = new.get("start_sec", 0), new.get("end_sec", 0)
    moved = (o_s != n_s) or (o_e != n_e)
    arrow = "→" if moved else "="
    conf = new.get("confidence", 0)
    flag = "  " if conf >= 0.6 else "⚠ "
    return (
        f"  {flag}{sport:14s} {shot:18s} "
        f"{o_s:3d}-{o_e:3d}s {arrow} {n_s:3d}-{n_e:3d}s "
        f"(conf {conf:.2f})  {new.get('rationale', '')[:60]}"
    )


def _maybe_rewrite_inplace(suggestions: dict, ref_path: Path) -> None:
    """Naive in-place rewrite: find the existing youtube_id literal in
    reference_videos.py and update the immediately-adjacent start_sec /
    end_sec on that block. We deliberately don't parse the AST because
    the file mixes data and docs/comments — line-based replacement is
    simpler to review in a diff. Operator must --confirm to run."""
    text = ref_path.read_text(encoding="utf-8")
    n_changed = 0
    for sport, shot_data in suggestions.items():
        for shot, new in shot_data.items():
            if "error" in new:
                continue
            # The catalog's pattern is consistent:
            #   "youtube_id": "ID",
            #   "start_sec": OLD_S, "end_sec": OLD_E,
            yid = new["_youtube_id"]
            pat = re.compile(
                rf'("youtube_id"\s*:\s*"{re.escape(yid)}",\s*\n\s*"start_sec"\s*:\s*)\d+(,\s*"end_sec"\s*:\s*)\d+',
                re.MULTILINE,
            )
            replacement = rf'\g<1>{new["start_sec"]}\g<2>{new["end_sec"]}'
            new_text, n = pat.subn(replacement, text, count=1)
            if n > 0:
                text = new_text
                n_changed += 1
                print(f"  ↻ rewrote {sport}/{shot} → {new['start_sec']}-{new['end_sec']}s")
            else:
                print(f"  ✗ could not locate entry for {sport}/{shot} (id {yid})")
    if n_changed > 0:
        ref_path.write_text(text, encoding="utf-8")
        print(f"\nWrote {n_changed} updates to {ref_path}")
    else:
        print("\nNo changes written.")


# ─── Main ───────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sport", help="Limit to one sport (badminton, tennis, ...)")
    ap.add_argument("--shot", help="Limit to one shot type (smash, drive, ...)")
    ap.add_argument("--model", default="gemini-2.5-flash",
                    help="Gemini model name. Flash is plenty for this task.")
    ap.add_argument("--write", metavar="PATH", help="Write suggestions to this JSON file")
    ap.add_argument("--apply", action="store_true",
                    help="Rewrite reference_videos.py in-place (use with --confirm)")
    ap.add_argument("--confirm", action="store_true",
                    help="Required alongside --apply")
    ap.add_argument("--delay", type=float, default=1.0,
                    help="Seconds between calls to avoid rate limits (default 1.0)")
    args = ap.parse_args()

    if args.apply and not args.confirm:
        print("--apply requires --confirm. Aborting.", file=sys.stderr)
        return 2

    entries = list(_iter_entries(args.sport, args.shot))
    if not entries:
        print("No entries matched. Check --sport / --shot.", file=sys.stderr)
        return 1

    print(f"Reviewing {len(entries)} entries with {args.model}…")
    suggestions: dict[str, dict[str, dict]] = {}

    for i, (sport, shot, entry) in enumerate(entries, 1):
        youtube_id = entry["youtube_id"]
        url = f"https://www.youtube.com/watch?v={youtube_id}"
        print(f"\n[{i}/{len(entries)}] {sport}/{shot} — {entry.get('player', '?')} ({youtube_id})")
        result = _call_gemini(
            url, entry.get("player", "the player"), shot,
            entry.get("start_sec", 0), entry.get("end_sec", 6),
            args.model,
        )
        if "error" in result:
            print(f"  ✗ {result['error']}")
            suggestions.setdefault(sport, {})[shot] = {"error": result["error"], "_youtube_id": youtube_id}
            time.sleep(args.delay)
            continue
        suggestions.setdefault(sport, {})[shot] = {**result, "_youtube_id": youtube_id}
        print(_format_change_row(sport, shot, entry, result))
        time.sleep(args.delay)

    # Print summary.
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for sport, shot_data in suggestions.items():
        for shot, new in shot_data.items():
            if "error" in new:
                print(f"  ✗ {sport}/{shot}: {new['error']}")
                continue
            entry = REFERENCE_VIDEOS[sport][shot]
            print(_format_change_row(sport, shot, entry, new))

    if args.write:
        out_path = Path(args.write)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(suggestions, indent=2), encoding="utf-8")
        print(f"\nSaved suggestions to {out_path}")

    if args.apply:
        print("\nApplying changes to reference_videos.py…")
        ref_path = BACKEND_DIR / "reference_videos.py"
        _maybe_rewrite_inplace(suggestions, ref_path)
    else:
        print("\n(Dry run — pass --apply --confirm to write changes back.)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
