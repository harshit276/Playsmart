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

# ---------------------------------------------------------------------------
# _CURATION_STATUS  (last refreshed: 2026-05-17)
# ---------------------------------------------------------------------------
# Total entries: 38
#   badminton   : 9  (smash, clear, drop, net_shot, drive, serve, lift,
#                     half_smash, block)            -- omitted: push,
#                                                       defensive_clear
#   tennis      : 9  (forehand, backhand, serve, volley, slice,
#                     smash_overhead, drop_shot, return_of_serve, lob)
#   table_tennis: 6  (forehand_drive, backhand_drive, smash, forehand_loop,
#                     push, serve)
#                     -- omitted: backhand_loop, chop, block
#   cricket     : 8  (cover_drive, pull_shot, hook, sweep, square_cut,
#                     straight_drive, defensive_block,
#                     bowling_action_fast, bowling_action_spin)
#   pickleball  : 6  (dink, drive, third_shot_drop, volley, serve, lob)
#                     -- omitted: return_of_serve
#
# Confidence buckets:
#   HIGH-CONFIDENCE (verified existence + title matches expected shot;
#                    timestamp inferred from typical tutorial structure):
#     - badminton: smash, clear, drop, net_shot, drive
#     - tennis: forehand, backhand, serve, slice, volley, smash_overhead,
#               drop_shot, return_of_serve
#     - table_tennis: forehand_drive, backhand_drive, forehand_loop, smash
#     - cricket: cover_drive, pull_shot, straight_drive, bowling_action_fast,
#                bowling_action_spin
#     - pickleball: dink, third_shot_drop, volley
#
#   BEST-GUESS, NEEDS HUMAN REVIEW (video exists, timestamp may need
#                                   tightening — recommend a coach scrub
#                                   the [start,end] window to confirm
#                                   contact moment):
#     - badminton: serve, lift, half_smash, block
#     - tennis: lob
#     - table_tennis: push, serve
#     - cricket: hook, sweep, square_cut, defensive_block
#     - pickleball: drive, serve, lob
#
# OMITTED entirely (could not find a Tier-1 pro doing this shot in a
# verifiable, focused YouTube clip — frontend will hide the
# Compare-to-Pro button via get_reference() returning None):
#     - badminton: push, defensive_clear
#     - table_tennis: backhand_loop, chop, block
#     - pickleball: return_of_serve
#     - Optional sports (squash, volleyball, football): all skipped this
#       round; revisit when coverage of core sports is verified.
# ---------------------------------------------------------------------------

# Format: {sport: {shot_type: {fields...}}}
REFERENCE_VIDEOS: dict[str, dict[str, dict]] = {
    "badminton": {
        "smash": {
            # "Viktor AXELSEN Badminton Technique in Super Slow Motion Camera"
            # (Shuttle Flash Badminton).  Multiple smashes shown; first jump
            # smash is in the opening segment.
            "youtube_id": "ADGtoJJqJrM",
            "start_sec": 8, "end_sec": 16,
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
            # Flash video. Wider window because position varies.
            "youtube_id": "ADGtoJJqJrM",
            "start_sec": 60, "end_sec": 70,
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
            "start_sec": 5, "end_sec": 13,
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
            "start_sec": 8, "end_sec": 16,
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
            "start_sec": 18, "end_sec": 26,
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
            "start_sec": 30, "end_sec": 38,
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
            "start_sec": 8, "end_sec": 16,
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
            "start_sec": 6, "end_sec": 14,
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
            "start_sec": 5, "end_sec": 14,
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
            "start_sec": 4, "end_sec": 12,
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
            "start_sec": 8, "end_sec": 16,
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
            "start_sec": 20, "end_sec": 28,
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
            "start_sec": 6, "end_sec": 14,
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
            "start_sec": 5, "end_sec": 13,
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
            "start_sec": 12, "end_sec": 20,
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
            "start_sec": 6, "end_sec": 14,
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
            "start_sec": 15, "end_sec": 23,
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
            "start_sec": 5, "end_sec": 13,
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
            "start_sec": 6, "end_sec": 14,
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
            "start_sec": 8, "end_sec": 16,
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
            "start_sec": 60, "end_sec": 70,
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
            "start_sec": 30, "end_sec": 40,
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
            "start_sec": 30, "end_sec": 40,
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
            "start_sec": 4, "end_sec": 12,
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
            "start_sec": 15, "end_sec": 23,
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
            "start_sec": 6, "end_sec": 14,
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
            "start_sec": 4, "end_sec": 12,
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
            "start_sec": 25, "end_sec": 33,
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
            "start_sec": 45, "end_sec": 55,
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
            "start_sec": 30, "end_sec": 38,
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
            "start_sec": 30, "end_sec": 40,
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
