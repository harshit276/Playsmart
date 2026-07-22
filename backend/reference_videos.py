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

# Per-process cache of YouTube embeddability checks. {youtube_id: (ok, expires_at)}.
# We hit YouTube's oEmbed endpoint to confirm the video exists, isn't
# region-blocked at the host's location, and the owner hasn't disabled
# embedding. Cached 6 hours to avoid rate-limiting on busy days.
import time
_YT_CHECK_CACHE: dict[str, tuple[bool, float]] = {}
_YT_CHECK_TTL_SEC = 6 * 60 * 60


def _is_youtube_embeddable(youtube_id: str) -> bool:
    """Best-effort check: True if YouTube's oEmbed endpoint returns a
    valid record for this ID. False otherwise (404, embed-disabled, etc.)
    Cached to avoid hammering YouTube on every analysis."""
    if not youtube_id or len(youtube_id) < 6:
        return False
    cached = _YT_CHECK_CACHE.get(youtube_id)
    now = time.time()
    if cached and cached[1] > now:
        return cached[0]
    ok = False
    try:
        import urllib.request as _u
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={youtube_id}&format=json"
        req = _u.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; PlaysmartBot/1.0)"})
        with _u.urlopen(req, timeout=4.0) as resp:
            ok = resp.status == 200
    except Exception:
        # Treat any failure (404, timeout, network) as "not available"
        # so we surface the fallback UI instead of a broken embed.
        ok = False
    _YT_CHECK_CACHE[youtube_id] = (ok, now + _YT_CHECK_TTL_SEC)
    return ok

# ---------------------------------------------------------------------------
# _CURATION_STATUS  (last refreshed: 2026-05-27 via Gemini sweep)
# ---------------------------------------------------------------------------
# Total entries: 61 across 8 sports.
#   badminton          : 9 entries
#   tennis             : 9 entries
#   table_tennis       : 6 entries
#   cricket            : 9 entries
#   pickleball         : 6 entries
#   football           : 8 entries  (sports_config.video_analysis=False; forward-curated)
#   swimming           : 6 entries  (sports_config.video_analysis=False; forward-curated)
#   strength_training  : 8 entries  (no sports_config entry yet; new sport key)
#
# Timestamps were refined by `backend/scripts/timestamp_pro_clips.py`
# (Gemini 2.5 Flash). Confidence ≥0.5 entries were applied in-place; the
# rest are flagged below for hand re-curation.
#
# NEEDS HAND RE-CURATION (Gemini says the linked video doesn't contain
# the labeled skill OR the YouTube ID is dead. Replace the youtube_id
# with a verified clip then re-run the script to lock the timestamp):
#     - badminton: clear, drop, net_shot
#     - tennis: volley, slice, smash_overhead
#     - pickleball: drive, lob
#     - football: shot, header, dribble, pass, save
#     - swimming: backstroke, breaststroke, start_dive, flip_turn
#     - strength_training: deadlift, snatch
#
# get_reference() returns None for entries whose youtube_id is dead, so
# the frontend hides the Compare-to-Pro button gracefully until those
# entries are re-curated. No user-facing breakage.
# ---------------------------------------------------------------------------

# Format: {sport: {shot_type: {fields...}}}
REFERENCE_VIDEOS: dict[str, dict[str, dict]] = {
    "badminton": {
        "smash": {
            # "Viktor AXELSEN Badminton Technique in Super Slow Motion Camera"
            # (Shuttle Flash Badminton).  Multiple smashes shown; jump
            # smash is ~2 minutes in.
            "youtube_id": "ADGtoJJqJrM",
            "start_sec": 120, "end_sec": 125,
            "player": "Viktor Axelsen",
            "description": (
                "Jump smash in 240fps slow motion — watch the hip rotation "
                "lead the shoulder, racket arm whips through contact, and "
                "the body crosses across as the racket finishes by the "
                "opposite hip."
            ),
        },
        "clear": {
            # "Lee Chong Wei Technique Slow Motion (1)" — Yonex Open Japan 2013.
            # Overhead clears feature in the first 30s of the compilation.
            "youtube_id": "yMJrsSY5M0c",
            "start_sec": 6, "end_sec": 14,
            "player": "Lee Chong Wei",
            "description": (
                "Full-court overhead clear — note the throwing motion: "
                "non-racket arm points to the shuttle, full shoulder turn, "
                "racket arm extends straight up at contact for maximum "
                "height on the arc."
            ),
        },
        "drop": {
            # "KENTO MOMOTA SLOW MOTION" — multi-shot compilation of Momota's
            # signature deceptive shots; reverse slice drop appears early.
            "youtube_id": "eLgHt5pbMtY",
            "start_sec": 5, "end_sec": 13,
            "player": "Kento Momota",
            "description": (
                "Slice / reverse-slice drop — the swing looks identical to "
                "a smash until the very end, when the racket face brushes "
                "across the shuttle instead of driving through it. Watch "
                "the wrist position at contact."
            ),
        },
        "net_shot": {
            # "TAI TZU YING badminton deceptive drop shot" — features her
            # tight net-shot / hold-and-flick from forecourt.
            "youtube_id": "bOsnjRaNGA0",
            "start_sec": 4, "end_sec": 12,
            "player": "Tai Tzu Ying",
            "description": (
                "Tight net-shot played with a relaxed wrist — racket head "
                "comes UP to the shuttle (never down), fingers do the work, "
                "shuttle tumbles down the tape rather than being pushed "
                "over flat."
            ),
        },
        "drive": {
            # "Viktor AXELSEN Badminton Technique in Super Slow Motion" — the
            # mid-court drive sequences appear later in the same Shuttle
            # Flash video, ~5-6 minutes in.
            "youtube_id": "ADGtoJJqJrM",
            "start_sec": 350, "end_sec": 355,
            "player": "Viktor Axelsen",
            "description": (
                "Flat drive — contact point in front of the body, racket "
                "almost parallel to the floor, short compact swing driven "
                "by forearm rotation rather than a big shoulder turn."
            ),
        },
        "serve": {
            # "Clever Flick Serve play by Mohammad Ahsan & Hendra Setiawan"
            # — multiple low + flick serves from the legendary doubles pair.
            "youtube_id": "QfvugJcyIo0",
            "start_sec": 58, "end_sec": 61,
            "player": "Hendra Setiawan (doubles)",
            "description": (
                "Doubles backhand low serve — racket held in front of the "
                "body, push from the thumb, shuttle skims just over the "
                "tape. Note how the elbow stays high and the swing is "
                "almost imperceptibly short."
            ),
        },
        "lift": {
            # "Badminton Late Forehand Shot Technique | underarm stroke" —
            # contains PV Sindhu vs Wang Rio Olympics underarm/lift footage.
            "youtube_id": "mp6P6jIf0rE",
            "start_sec": 127, "end_sec": 132,
            "player": "Pusarla V. Sindhu",
            "description": (
                "Underarm forehand lift from the front-court — lunge with "
                "racket leg, shuttle taken at full extension, wrist "
                "snaps up at contact to send the shuttle high and deep."
            ),
        },
        "half_smash": {
            # "Badminton smash slow motion - super slow motion" — compilation
            # of world-class players. Half-smashes (steeper, less power)
            # appear among the variations.
            "youtube_id": "2csBzZywVv8",
            "start_sec": 240, "end_sec": 244,
            "player": "Chen Long",
            "description": (
                "Half-smash — about 70% power, steeper trajectory than a "
                "full smash. Same swing path as the full smash but the arm "
                "decelerates slightly at contact for control over power."
            ),
        },
        "block": {
            # "Badminton Smash Defence-How To Do Backhand Block Return"
            "youtube_id": "xwvZAb6Xyak",
            "start_sec": 208, "end_sec": 212,
            "player": "Coaching demo (BadmintonHQ)",
            "description": (
                "Backhand block return of smash — racket extended forward, "
                "very short stroke, contact absorbs the shuttle with a "
                "soft grip. Body stays low, returns shuttle just over the "
                "net into the front court."
            ),
        },
    },
    "tennis": {
        "forehand": {
            # "Rafael Nadal Forehand Slow Motion - Modern ATP Forehand
            # Technique" (Top Tennis Training). Heavy topspin buggy-whip.
            "youtube_id": "BlBgArGeC0Q",
            "start_sec": 52, "end_sec": 57,
            "player": "Rafael Nadal",
            "description": (
                "Heavy topspin forehand — open stance, big hip rotation "
                "leads the upper body, racket comes from below the ball "
                "and finishes over the opposite shoulder (buggy-whip lasso "
                "finish)."
            ),
        },
        "backhand": {
            # "Novak Djokovic Backhand Slow Motion - ATP Tennis Two Handed
            # Backhand Technique" (Top Tennis Training).
            "youtube_id": "AFyPREOG0BM",
            "start_sec": 105, "end_sec": 112,
            "player": "Novak Djokovic",
            "description": (
                "Two-handed backhand — compact unit turn, contact slightly "
                "in front of front foot, both arms extend through the ball, "
                "follow-through wraps around the front shoulder."
            ),
        },
        "serve": {
            # "Roger Federer Serve Slow Motion - ATP Tennis Serve Technique"
            # (Top Tennis Training).
            "youtube_id": "1YuShuvbZnM",
            "start_sec": 15, "end_sec": 20,
            "player": "Roger Federer",
            "description": (
                "Flat / slice serve — note the trophy position with bent "
                "knees, then the explosive leg drive 0.1s before contact. "
                "Racket head accelerates from the drop position to fully "
                "extended at contact."
            ),
        },
        "volley": {
            # "Novak Djokovic Volley Slow Motion - ATP Tennis Volley + Smash"
            # (Top Tennis Training).
            "youtube_id": "tdSNnrjsDAQ",
            "start_sec": 6, "end_sec": 14,
            "player": "Novak Djokovic",
            "description": (
                "Forehand volley — minimal backswing, racket face slightly "
                "open, contact out in front with the wrist firm. Step in "
                "with the opposite foot as the racket punches forward."
            ),
        },
        "slice": {
            # "Roger Federer Slice Backhand Slow Motion Court Level View"
            # (Top Tennis Training).
            "youtube_id": "VvzqAPV2ga8",
            "start_sec": 5, "end_sec": 13,
            "player": "Roger Federer",
            "description": (
                "One-handed backhand slice — racket high on the back-swing "
                "with open face, comes down through the ball at a slight "
                "high-to-low angle. The ball stays low and skids after "
                "the bounce."
            ),
        },
        "smash_overhead": {
            # "Roger Federer Overhead Smash in Slow Motion" — 210fps.
            "youtube_id": "LV9Yp4fpWa8",
            "start_sec": 5, "end_sec": 13,
            "player": "Roger Federer",
            "description": (
                "Overhead smash — non-racket arm points to the ball for "
                "tracking, racket goes directly into trophy (no full "
                "service loop), explosive leg drive into contact at full "
                "extension above the head."
            ),
        },
        "drop_shot": {
            # "Roger Federer. Drop Shot Technique" — focused drop-shot clip.
            "youtube_id": "VbXUG3GvsSo",
            "start_sec": 3, "end_sec": 7,
            "player": "Roger Federer",
            "description": (
                "Forehand drop shot — disguised as a regular forehand "
                "until the very end. At contact the racket face opens "
                "and decelerates, brushing under the ball to add backspin. "
                "Ball lands short and stops."
            ),
        },
        "return_of_serve": {
            # "Novak Djokovic Return of Serve Slow Motion - ATP Greatest
            # Tennis Serve Return EVER!" (Top Tennis Training).
            "youtube_id": "4wXKFZJ0WAM",
            "start_sec": 24, "end_sec": 29,
            "player": "Novak Djokovic",
            "description": (
                "Return of serve — small split-step at server's contact, "
                "then a compact unit turn. Backswing is shorter than a "
                "rally groundstroke; the body uncoils to redirect the "
                "server's pace back deep."
            ),
        },
        "lob": {
            # "Master the Tennis Topspin Lob - Advanced Lesson" (Feel Tennis
            # / Tomaz Mencinger).  Coaching demo with pro execution.
            "youtube_id": "axv8yZF_8j4",
            "start_sec": 238, "end_sec": 243,
            "player": "Coaching demo (Feel Tennis)",
            "description": (
                "Topspin lob — preparation looks like a passing shot "
                "(disguise), but the racket path is steeply low-to-high "
                "with extra wrist roll over the ball. Finishes high above "
                "the head to keep the trajectory rising."
            ),
        },
    },
    "table_tennis": {
        "forehand_drive": {
            # "Ma Long Forehand Loop Technique | TABLE TENNIS"
            "youtube_id": "j8FPpZ2_cxE",
            "start_sec": 8, "end_sec": 13,
            "player": "Ma Long",
            "description": (
                "Forehand topspin drive — body weight transfers from right "
                "leg to left through the stroke, contact slightly above "
                "the bounce, racket finishes high near the forehead."
            ),
        },
        "backhand_drive": {
            # "Timo Boll backhand topspin - Then vs Now"
            "youtube_id": "0Nwoxjd4aMM",
            "start_sec": 104, "end_sec": 108,
            "player": "Timo Boll",
            "description": (
                "Backhand topspin drive — compact stroke driven by the "
                "wrist + forearm, elbow stays as the pivot point, racket "
                "closes over the ball on contact for topspin."
            ),
        },
        "forehand_loop": {
            # "15 minutes of Ma Long's forehand technique (slow motion)"
            "youtube_id": "jig_5SLN2Eo",
            "start_sec": 37, "end_sec": 40,
            "player": "Ma Long",
            "description": (
                "Forehand loop against backspin — drop the racket below "
                "the table, brush UP the back of the ball with a fast "
                "forearm snap. Note how the legs load deeply before the "
                "stroke."
            ),
        },
        "smash": {
            # "Table tennis in slow motion (240fps). Fan Zhendong, forehand"
            "youtube_id": "gdU4l98m_hQ",
            "start_sec": 10, "end_sec": 15,
            "player": "Fan Zhendong",
            "description": (
                "Forehand smash / power loop — full body uncoil, contact "
                "at peak of the bounce, racket arm fully extends through "
                "the ball before recovery."
            ),
        },
        "push": {
            # "Table Tennis Slowmotion Analysis - Fan Zhendong VS Koki Niwa
            # - Push Long" (ITTF Education).
            "youtube_id": "DQXigcbCx34",
            "start_sec": 26, "end_sec": 31,
            "player": "Fan Zhendong",
            "description": (
                "Long backhand push — open racket face, contact under the "
                "ball with a forward + slightly down motion to impart "
                "heavy backspin. Stroke length stays short."
            ),
        },
        "serve": {
            # "The amazing serve of Fan Zhendong [Slow Motion]"
            "youtube_id": "880kiy4z-W4",
            "start_sec": 8, "end_sec": 13,
            "player": "Fan Zhendong",
            "description": (
                "Pendulum serve — contact close to the table with a "
                "violent wrist snap to maximize spin. Watch the ball "
                "carefully — you can see how the spin axis tilts based on "
                "where the racket brushes."
            ),
        },
    },
    "cricket": {
        "cover_drive": {
            # "Virat Kohli Cover Drive in Slow Motion | Treat to Watch"
            "youtube_id": "In8_N4CTfSk",
            "start_sec": 0, "end_sec": 3,
            "player": "Virat Kohli",
            "description": (
                "Front-foot cover drive — full stride towards the pitch "
                "of the ball, head directly over the bat at contact, "
                "elbow leads through to a full follow-through pointing "
                "down the cover region."
            ),
        },
        "pull_shot": {
            # "Rohit Sharma Pull Shot Masterclass: ... in Slow Motion"
            "youtube_id": "hpZ4z8I_aQM",
            "start_sec": 1, "end_sec": 6,
            "player": "Rohit Sharma",
            "description": (
                "Pull shot off the back foot — back foot pivots towards "
                "leg-side, horizontal bat swing across the body, head "
                "stays absolutely still through the line of the ball."
            ),
        },
        "hook": {
            # "Cricket Coaching - When to Pull & Hook - choosing"
            "youtube_id": "shqYapuko9U",
            "start_sec": 1, "end_sec": 5,
            "player": "Coaching demo (Mark Garaway)",
            "description": (
                "Hook shot vs short delivery at head height — pivot on "
                "back foot inside the line, roll wrists over the ball at "
                "contact to keep the shot down. Ball sent fine of square "
                "leg."
            ),
        },
        "sweep": {
            # "How to play the REVERSE SWEEP | Reverse Sweep Training" —
            # tutorial; intro section shows the conventional sweep first.
            # Best-guess; needs human review for exact contact frame.
            "youtube_id": "I_Xe3i8ZsyI",
            "start_sec": 429, "end_sec": 434,
            "player": "Coaching demo (cricket academy)",
            "description": (
                "Conventional sweep — front knee drops to the ground, bat "
                "swings horizontally just above turf, contact made "
                "slightly in front of the front pad. Used vs full-length "
                "spin."
            ),
        },
        "square_cut": {
            # "How To Play The Square Cut Cricket Shot" - Toby Radford
            # (former West Indies batting coach).
            "youtube_id": "p4WPqPirEes",
            "start_sec": 2, "end_sec": 7,
            "player": "Coaching demo (Toby Radford)",
            "description": (
                "Square cut — back and across with the back foot, "
                "horizontal bat at contact, wrists roll over to keep the "
                "ball down past point. Played to short-and-wide deliveries."
            ),
        },
        "straight_drive": {
            # "Ultra Slow motion of Sachin Tendulkar STRAIGHT DRIVE | MASTERCLASS"
            "youtube_id": "nFXrwGKISTQ",
            "start_sec": 4, "end_sec": 10,
            "player": "Sachin Tendulkar",
            "description": (
                "Straight drive — front foot strides directly down the "
                "pitch, full face of the bat at contact, head perfectly "
                "still. Note how the top hand controls the stroke."
            ),
        },
        "defensive_block": {
            # "Shubman Gill Batting Technique Slow-Motion" — contains both
            # attacking and forward-defensive shots.
            "youtube_id": "MIeRSR9fS8M",
            "start_sec": 401, "end_sec": 406,
            "player": "Shubman Gill",
            "description": (
                "Forward defensive block — front foot strides forward, "
                "bat angled down with soft hands so the ball drops "
                "harmlessly. Front knee bent, head over the bat."
            ),
        },
        "bowling_action_fast": {
            # "Jasprit Bumrah Fast Bowling Action in Slow Motion | India
            # Unique Fast Bowler | Ground View"
            "youtube_id": "6PcsfehCw-k",
            "start_sec": 350, "end_sec": 355,
            "player": "Jasprit Bumrah",
            "description": (
                "Fast bowling action — short run-up, hyperextension of "
                "the bowling arm at release (Bumrah's signature), front "
                "foot lands braced, full follow-through across the body."
            ),
        },
        "bowling_action_spin": {
            # "warne slowmo 2001" — Shane Warne leg-spin in 500fps.
            "youtube_id": "sFwhAsoax7w",
            "start_sec": 116, "end_sec": 122,
            "player": "Shane Warne",
            "description": (
                "Leg-spin bowling action — side-on at the crease, fully "
                "loaded shoulder, big rip of the fingers across the seam "
                "at release. Watch the wrist position rotate clockwise "
                "through release."
            ),
        },
    },
    "pickleball": {
        "dink": {
            # "How to Perform a Dink Attack in Pickleball with Ben Johns"
            # (Life Time).
            "youtube_id": "KJvHGGJ7TcE",
            "start_sec": 26, "end_sec": 31,
            "player": "Ben Johns",
            "description": (
                "Soft cross-court dink — paddle face open, contact in "
                "front of the body, ball pushed (not swung) so it arcs "
                "just over the net and lands in the opponent's kitchen."
            ),
        },
        "drive": {
            # ALW lob serve / drive tutorial — best-guess; this is a "drive
            # serve" tutorial featuring Anna Leigh Waters.
            "youtube_id": "cQNggvj_A70",
            "start_sec": 35, "end_sec": 45,
            "player": "Anna Leigh Waters",
            "description": (
                "Drive — low compact swing with the paddle face slightly "
                "closed, contact out in front, body weight transfers "
                "forward. Aim is flat and at opponent's feet."
            ),
        },
        "third_shot_drop": {
            # "How To Hit A 3rd Shot Drop In Pickleball (Technique Explained
            # & More)"
            "youtube_id": "T5anZZ4-Iwo",
            "start_sec": 32, "end_sec": 35,
            "player": "Coaching demo (pro tutorial)",
            "description": (
                "Third-shot drop — small swing from low to high, paddle "
                "face open at contact, ball arcs softly to land in the "
                "opponent's kitchen. Watch how shoulder stays relaxed."
            ),
        },
        "volley": {
            # "The Volley - Pickleball Tips with Tyson McGuffin"
            "youtube_id": "lhFe1qRMkMg",
            "start_sec": 255, "end_sec": 300,
            "player": "Tyson McGuffin",
            "description": (
                "Forehand punch volley at the kitchen line — minimal "
                "back-swing, firm wrist, contact out in front of the body. "
                "Block-style for hard incoming shots."
            ),
        },
        "serve": {
            # "Federico Staksrud Teaches How to Serve in Pickleball!"
            "youtube_id": "_ew47Dqi-3w",
            "start_sec": 924, "end_sec": 928,
            "player": "Federico Staksrud",
            "description": (
                "Drive serve — low-to-high paddle path (rule-required "
                "below-waist contact), full shoulder turn, weight "
                "transfer from back to front foot for depth."
            ),
        },
        "lob": {
            # "This Serve is Taking Over Pickleball! The ALW Lob Serve
            # Tutorial" — Anna Leigh Waters' lob-style serve, demonstrating
            # the high-arc execution.
            "youtube_id": "cQNggvj_A70",
            "start_sec": 5, "end_sec": 14,
            "player": "Anna Leigh Waters",
            "description": (
                "Lob — open paddle face, smooth low-to-high swing with "
                "the body uncoiling underneath. Ball arcs high enough to "
                "clear an opponent at the kitchen line and lands deep "
                "near the baseline."
            ),
        },
    },
    # ─── Football (Soccer) ─────────────────────────────────────────
    # video_analysis is currently False for football in sports_config —
    # these entries serve the /reference endpoint for any consumer that
    # wants pro footage by skill, and are forward-curated for when the
    # football analyzer ships. YouTube IDs below are best-effort picks;
    # _is_youtube_embeddable() silently drops dead ones at lookup time.
    "football": {
        "shot": {
            "youtube_id": "Ywx29hxIyOI",
            "start_sec": 10, "end_sec": 18,
            "player": "Cristiano Ronaldo",
            "description": (
                "Power shot — plant foot beside the ball, head down over "
                "it, strike with the laces, follow-through points at the "
                "target. Hips drive through the contact, not the arms."
            ),
        },
        "free_kick": {
            "youtube_id": "TZRD2-h8DG4",
            "start_sec": 8, "end_sec": 13,
            "player": "David Beckham",
            "description": (
                "Curling free kick — strike with the inside of the foot, "
                "brush across-and-up on the ball, shoulders open at "
                "contact. The follow-through wraps around the body to "
                "generate the curl."
            ),
        },
        "header": {
            "youtube_id": "WX3vUmZ8ZX8",
            "start_sec": 6, "end_sec": 12,
            "player": "Cristiano Ronaldo",
            "description": (
                "Attacking header — jump from the back foot, arch the "
                "spine in the air, attack the ball with the forehead "
                "(not the top of the head). Eyes open through contact."
            ),
        },
        "dribble": {
            "youtube_id": "AwQ_GZK3-2g",
            "start_sec": 8, "end_sec": 18,
            "player": "Lionel Messi",
            "description": (
                "Close control — small touches with both feet, knee bent "
                "low, head up. Defender's hips and weight read off the "
                "ball's direction; change of pace is the key."
            ),
        },
        "pass": {
            "youtube_id": "BU5IbtPzbVI",
            "start_sec": 15, "end_sec": 22,
            "player": "Kevin De Bruyne",
            "description": (
                "Driven pass — inside-of-the-foot strike, body opens to "
                "the target, plant foot points where you want the ball "
                "to travel. Ball is hit through its center for a flat "
                "weighted delivery."
            ),
        },
        "tackle": {
            "youtube_id": "kp8YlMQqUkw",
            "start_sec": 12, "end_sec": 18,
            "player": "Virgil van Dijk",
            "description": (
                "Front-foot tackle — read the attacker's hip drop, step "
                "in with the leading foot, wedge the ball with the side "
                "of the foot. Body stays balanced over the ball, never "
                "the lunge."
            ),
        },
        "save": {
            "youtube_id": "TGGZpvFm6PA",
            "start_sec": 12, "end_sec": 20,
            "player": "Alisson Becker",
            "description": (
                "Diving save — set position low, hands lead the body, "
                "fingers behind the ball (not on top), parry wide of the "
                "goal — never back into the danger zone in front."
            ),
        },
        "throw_in": {
            "youtube_id": "9Y43JCFmQGA",
            "start_sec": 5, "end_sec": 12,
            "player": "Coaching demo (instructional)",
            "description": (
                "Long throw-in — both hands on the ball, both feet on "
                "the ground at release, deliver from behind the head in "
                "one smooth motion. Body weight transfers from back to "
                "front foot for distance."
            ),
        },
    },
    # ─── Swimming ──────────────────────────────────────────────────
    # video_analysis is False for swimming today; entries are forward
    # curation. Side / underwater angles are preferred for technique
    # reads, so we pick instructional / Olympic-channel clips where
    # available.
    "swimming": {
        "freestyle": {
            "youtube_id": "rJpFVvho0o4",
            "start_sec": 52, "end_sec": 56,
            "player": "Caeleb Dressel",
            "description": (
                "Freestyle (front crawl) — high elbow catch, hand enters "
                "fingertip-first past the head, body rotates from hips "
                "to drive the pull. Two-beat kick keeps the legs efficient."
            ),
        },
        "backstroke": {
            "youtube_id": "tt6tJ5VYz6k",
            "start_sec": 8, "end_sec": 16,
            "player": "Ryan Murphy",
            "description": (
                "Backstroke — pinky-finger entry over the shoulder, "
                "catch with the elbow bending early, push past the hip. "
                "Constant hip rotation, head still and facing the ceiling."
            ),
        },
        "breaststroke": {
            "youtube_id": "3Sx1pE7Hk5w",
            "start_sec": 6, "end_sec": 14,
            "player": "Adam Peaty",
            "description": (
                "Breaststroke — early-vertical pull-out into a narrow "
                "sweep, head lifts only with the elbows squeezing in, "
                "kick is whippy not wide. Body undulates forward, not "
                "up and down."
            ),
        },
        "butterfly": {
            "youtube_id": "9hYJYf9KIBQ",
            "start_sec": 12, "end_sec": 17,
            "player": "Michael Phelps",
            "description": (
                "Butterfly — two kicks per arm cycle: one as the hands "
                "enter, one as they exit. Body line stays long, hips "
                "drive the wave, hands recover wide of the shoulders."
            ),
        },
        "start_dive": {
            "youtube_id": "z5cgJ-jjjxc",
            "start_sec": 5, "end_sec": 12,
            "player": "Olympic-level demonstration",
            "description": (
                "Track-start dive — front foot grips the block edge, "
                "back foot pre-loaded, weight back on the hands. On the "
                "gun, hips pop up first, then the hands punch toward "
                "the entry point with a flat streamlined torso."
            ),
        },
        "flip_turn": {
            "youtube_id": "qDw2-_8Wt0E",
            "start_sec": 8, "end_sec": 14,
            "player": "Coaching demo (technique)",
            "description": (
                "Freestyle flip-turn — read the T on the bottom early, "
                "tuck tight, push off in a streamline (no breath off the "
                "wall), 4-6 underwater dolphin kicks before the breakout."
            ),
        },
    },
    # ─── Strength training / Gym ───────────────────────────────────
    # Brand-new sport key — sports_config.py doesn't know it yet so the
    # analyze flow won't surface these, but the /reference endpoint will
    # serve them for any consumer (and our analyzer can be wired to this
    # taxonomy later). Renamed from the user's "gyming" to the
    # well-established snake_case `strength_training`.
    "strength_training": {
        "deadlift": {
            "youtube_id": "wYREQkVtvEc",
            "start_sec": 30, "end_sec": 40,
            "player": "Eddie Hall (500 kg world record)",
            "description": (
                "Conventional deadlift — feet under the hips, hands just "
                "outside the knees, spine neutral. Bar tracks the shins "
                "vertically; lockout is hips and shoulders together, no "
                "hyperextension."
            ),
        },
        "back_squat": {
            "youtube_id": "ultWZbUMPL8",
            "start_sec": 25, "end_sec": 30,
            "player": "Coaching demo (Squat University)",
            "description": (
                "Back squat — bar high on the traps, brace the core "
                "BEFORE the unrack, sit down between the heels with the "
                "knees tracking out. Maintain a vertical torso angle "
                "for high-bar, more inclined for low-bar."
            ),
        },
        "bench_press": {
            "youtube_id": "vcBig73ojpE",
            "start_sec": 153, "end_sec": 159,
            "player": "Coaching demo (technique)",
            "description": (
                "Bench press — shoulder blades retracted and depressed, "
                "arched upper back, feet driving the floor. Bar touches "
                "mid-sternum; press in a slight backward arc toward the "
                "shoulders, not straight up."
            ),
        },
        "overhead_press": {
            "youtube_id": "QAQ64hK4Xxs",
            "start_sec": 3, "end_sec": 7,
            "player": "Coaching demo (technique)",
            "description": (
                "Standing overhead press — bar on the front delts, "
                "elbows slightly in front of the bar, glutes squeezed, "
                "head pulls back at the start so the bar can travel in "
                "a straight line up over the mid-foot."
            ),
        },
        "clean_and_jerk": {
            "youtube_id": "ka1aIm7-rL4",
            "start_sec": 5, "end_sec": 12,
            "player": "Lasha Talakhadze (Olympic record)",
            "description": (
                "Clean & jerk — first pull is slow and patient off the "
                "floor, full extension at the top of the second pull, "
                "elbows whip through fast on the catch. Jerk uses a dip "
                "in the heels, hard drive, then split-step underneath."
            ),
        },
        "snatch": {
            "youtube_id": "tCnYkjQ7Mb4",
            "start_sec": 5, "end_sec": 14,
            "player": "Lu Xiaojun",
            "description": (
                "Snatch — wide grip, bar travels close to the body the "
                "entire pull, hips and knees extend together at the top, "
                "then aggressive turnover with locked elbows in the "
                "overhead squat receiving position."
            ),
        },
        "pull_up": {
            "youtube_id": "eGo4IYlbE5g",
            "start_sec": 239, "end_sec": 245,
            "player": "Coaching demo (technique)",
            "description": (
                "Strict pull-up — dead-hang start, scapula sets first "
                "(retract + depress), drive the elbows down to the floor "
                "with the chest meeting the bar. No kipping, no swing — "
                "lower under control."
            ),
        },
        "push_up": {
            "youtube_id": "IODxDxX7oi4",
            "start_sec": 20, "end_sec": 25,
            "player": "Coaching demo (technique)",
            "description": (
                "Strict push-up — body in a straight plank line, hands "
                "under the shoulders, elbows at ~45° (not flared), chest "
                "touches the floor before pressing back. Squeeze glutes "
                "and brace abs the entire rep."
            ),
        },
    },
}


_SPORT_ALIASES = {
    "table tennis": "table_tennis",
    "table-tennis": "table_tennis",
    "tt": "table_tennis",
    "ping pong": "table_tennis",
    "lawn tennis": "tennis",
    "badminton (doubles)": "badminton",
    "badminton (singles)": "badminton",
    "badminton singles": "badminton",
    "badminton doubles": "badminton",
}


def _normalize_sport(s: str) -> str:
    """Strip parens/brackets, collapse spaces, lowercase, apply aliases.
    Handles Gemini-style output like 'Badminton (Doubles)' → 'badminton'."""
    import re
    if not s:
        return ""
    base = re.sub(r"[\(\[].*?[\)\]]", "", s).strip().lower()
    base = re.sub(r"\s+", " ", base)
    if base in _SPORT_ALIASES:
        return _SPORT_ALIASES[base]
    # Fall back to dasherized form
    return base.replace(" ", "_")


def _wrap(entry: dict, sport_l: str, shot_l: str) -> dict | None:
    """Attach sport + shot_type metadata to an entry, after confirming
    the YouTube ID is still embeddable. Returns None when the video is
    gone / region-blocked / embed-disabled so callers can try a
    fallback or hide the UI gracefully."""
    if not entry:
        return None
    yid = entry.get("youtube_id", "")
    if not _is_youtube_embeddable(yid):
        return None
    return {**entry, "sport": sport_l, "shot_type": shot_l}


def get_reference(sport: str, shot_type: str) -> dict | None:
    """Look up the pro reference for a shot. Returns None when there's
    no curated entry yet (frontend hides the Compare-to-Pro button).

    Now also returns None when the curated YouTube clip has been
    removed / region-blocked / had embedding disabled — so users never
    see a broken "This video is unavailable" iframe. Falls back to any
    other curated shot in the same sport when the direct match is dead."""
    sport_l = _normalize_sport(sport)
    shot_l = (shot_type or "").lower().strip().replace(" ", "_")
    s = REFERENCE_VIDEOS.get(sport_l)
    if not s:
        return None
    # Order of attempts: direct hit → substring fallback → token-overlap
    # fallback → ANY OTHER entry in the sport (last-resort). Each is
    # filtered through _wrap() which drops dead YouTube IDs, so we
    # advance to the next attempt instead of returning a broken embed.
    GENERIC_TOKENS = {
        "shot", "shots", "play", "hit", "stroke", "action",
        "ball", "court", "side", "front", "back", "type",
    }

    # 1) Direct hit — the ONLY match we accept.
    if shot_l in s:
        out = _wrap(s[shot_l], sport_l, shot_l)
        if out:
            return out

    # 2) Token-overlap, but ONLY when it can't invent detail.
    #
    # There used to be a substring fallback here, and it was actively harmful:
    # a generic label is a substring of every more-specific curated key, so
    # "bowling_action" matched "bowling_action_fast" — the first one declared —
    # and a SPIN bowler was shown Bumrah with the caption "Fast bowling action".
    # That produced a real 1-star. The same trap exists in every sport where a
    # family name prefixes its variants.
    #
    # So a candidate must not be strictly MORE specific than what we were
    # given: every distinguishing token of the curated key has to be present in
    # the requested label. Narrowing is fine ("cross_court_cover_drive" →
    # "cover_drive"); inventing is not ("bowling_action" → "..._fast").
    shot_tokens = {t for t in shot_l.split("_")
                   if len(t) >= 4 and t not in GENERIC_TOKENS}
    if shot_tokens:
        ranked = []
        for known, entry in s.items():
            known_tokens = {t for t in known.split("_")
                            if len(t) >= 4 and t not in GENERIC_TOKENS}
            if not known_tokens or not known_tokens.issubset(shot_tokens):
                continue  # would add detail the label never claimed
            ranked.append((len(known_tokens), known, entry))
        ranked.sort(reverse=True)
        for _, known, entry in ranked:
            out = _wrap(entry, sport_l, known)
            if out:
                return out

    # No confident match → no reference. Showing the wrong pro is worse than
    # showing none: it tells the player their technique should look like
    # something it shouldn't.
    return None


def available_references(sport: str) -> list[str]:
    """List shot types we have a curated reference for in this sport."""
    return list(REFERENCE_VIDEOS.get((sport or "").lower(), {}).keys())
