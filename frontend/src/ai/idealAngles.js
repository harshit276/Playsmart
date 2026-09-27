/**
 * @module idealAngles
 * Curated ideal joint-angle ranges per (sport, shot) at contact, and the
 * lookup that maps Gemini's freeform shot names onto them.
 *
 * Split out of poseOverlay so it stays free of TensorFlow: poseOverlay imports
 * the MoveNet stack at module scope, and the 3D ghost (ghostPose) needs the
 * same ranges without downloading a second pose model's worth of code.
 */
import { POSTURE_SUPPORTED_SPORTS } from "./posturePolicy.js";

/**
 * Hand-curated ideal joint-angle ranges PER (sport, shot_type) at the
 * CONTACT moment. Based on coaching literature + slow-motion analysis
 * of pro players. Numbers are degrees. `null` ranges mean "not part of
 * the signature for this shot â€” don't grade it."
 *
 * Joint angles measured:
 *   shoulder = shoulderâ†’elbow vs shoulderâ†’hip axis
 *   elbow    = shoulderâ†’elbowâ†’wrist (interior angle)
 *   knee     = hipâ†’kneeâ†’ankle (interior angle)
 *
 * "side": which side to grade (the racket arm). MoveNet doesn't
 * automatically know left vs right dominant hand, so we measure
 * BOTH sides and pick the one with the higher arm position
 * (typically the racket arm at contact).
 */
export const IDEAL_ANGLES = {
  badminton: {
    smash: {
      label: "Smash â€” overhead contact",
      elbow: { min: 150, max: 175, ideal: 165, why: "Near-straight arm at contact transfers max power" },
      shoulder: { min: 150, max: 180, ideal: 170, why: "Racket arm high overhead, body coiled and uncoiling" },
      knee: { min: 130, max: 175, ideal: 160, why: "Slight bend = athletic stance, fully extended = post-jump landing" },
    },
    clear: {
      label: "Clear â€” high deep arc",
      elbow: { min: 160, max: 180, ideal: 175, why: "Fully extended at contact for maximum height" },
      shoulder: { min: 155, max: 180, ideal: 170, why: "Throwing-motion: shoulder peaks above ear" },
      knee: { min: 130, max: 170, ideal: 155, why: "Stable base, weight transfer front-to-back" },
    },
    drop: {
      label: "Drop â€” soft just-over-net",
      elbow: { min: 140, max: 175, ideal: 160, why: "Same as smash setup; deception comes from slice" },
      shoulder: { min: 145, max: 180, ideal: 165, why: "Identical to smash from address â€” the disguise is critical" },
    },
    drive: {
      label: "Drive â€” flat fast",
      elbow: { min: 100, max: 145, ideal: 125, why: "Bent arm, racket head leads through contact zone" },
      shoulder: { min: 70, max: 120, ideal: 95, why: "Shoulder-height contact, body rotated to side" },
    },
    net_shot: {
      label: "Net shot â€” soft touch",
      elbow: { min: 130, max: 170, ideal: 150, why: "Relaxed grip, racket lifted up to shuttle" },
      shoulder: { min: 30, max: 90, ideal: 55, why: "Low, in front of body â€” wrist does the work" },
    },
    serve: {
      label: "Serve â€” backhand low",
      elbow: { min: 60, max: 110, ideal: 85, why: "Compact L-shape, fingers push the shuttle" },
      shoulder: { min: 10, max: 60, ideal: 30, why: "Low to waist height, no big swing" },
    },
    lift: {
      label: "Lift â€” underarm deep",
      elbow: { min: 130, max: 175, ideal: 155, why: "Lower-body drives, arm extends through contact" },
      shoulder: { min: 30, max: 100, ideal: 65, why: "Below waist at contact, follows through up" },
    },
    block: {
      label: "Block â€” short defense from smash",
      elbow: { min: 90, max: 140, ideal: 115, why: "Compact, no backswing â€” racket absorbs pace" },
      shoulder: { min: 30, max: 90, ideal: 60, why: "Hip-height, paddle out front" },
    },
  },
  tennis: {
    forehand: {
      label: "Forehand â€” topspin drive",
      elbow: { min: 120, max: 170, ideal: 150, why: "Slight bend at contact, full extension on follow-through" },
      shoulder: { min: 60, max: 110, ideal: 90, why: "Contact in front of body at hip-to-shoulder height" },
    },
    backhand: {
      label: "Backhand â€” two-handed drive",
      elbow: { min: 110, max: 165, ideal: 140, why: "Both arms bent at setup, extending through contact" },
      shoulder: { min: 50, max: 100, ideal: 80, why: "Compact, rotation drives the racket" },
    },
    serve: {
      label: "Serve â€” flat / kick",
      elbow: { min: 155, max: 180, ideal: 175, why: "Full extension at contact, ball at peak racket reach" },
      shoulder: { min: 160, max: 180, ideal: 175, why: "Arm above ear, body fully stretched" },
    },
    volley: {
      label: "Volley â€” punch",
      elbow: { min: 90, max: 140, ideal: 115, why: "Short stab, no swing â€” racket head LEADS contact" },
      shoulder: { min: 40, max: 90, ideal: 65, why: "In front of body at shoulder height, knees bent" },
    },
    overhead: {
      label: "Overhead smash",
      elbow: { min: 150, max: 180, ideal: 170, why: "Near-straight arm at contact for power" },
      shoulder: { min: 155, max: 180, ideal: 170, why: "Reaching high, body extended" },
    },
    slice: {
      label: "Slice backhand",
      elbow: { min: 130, max: 175, ideal: 155, why: "Carve under ball, follow-through stays high" },
      shoulder: { min: 60, max: 110, ideal: 85, why: "Compact prep, knife-through-butter feel" },
    },
    lob: {
      label: "Lob â€” defensive high",
      elbow: { min: 130, max: 175, ideal: 160, why: "Open face lifts ball deep, racket finishes high" },
      shoulder: { min: 40, max: 100, ideal: 70, why: "Low to high swing path" },
    },
    drop_shot: {
      label: "Drop shot â€” soft just-over",
      elbow: { min: 120, max: 165, ideal: 145, why: "Soft hands, racket head under ball" },
      shoulder: { min: 40, max: 100, ideal: 70, why: "Disguise as a drive, then check the swing" },
    },
  },
  table_tennis: {
    forehand_drive: {
      label: "Forehand drive â€” topspin",
      elbow: { min: 100, max: 150, ideal: 125, why: "Bent at setup, opens through contact" },
      shoulder: { min: 30, max: 80, ideal: 55, why: "Below shoulder, hip drives the rotation" },
    },
    backhand_drive: {
      label: "Backhand drive",
      elbow: { min: 80, max: 130, ideal: 105, why: "Compact L, wrist snaps over the ball" },
      shoulder: { min: 30, max: 70, ideal: 50, why: "Close to the body, low setup" },
    },
    smash: {
      label: "Smash â€” high-ball kill",
      elbow: { min: 130, max: 170, ideal: 150, why: "Near-straight at contact, ball is well above table" },
      shoulder: { min: 80, max: 150, ideal: 120, why: "Reaches up to high ball, body weight forward" },
    },
    forehand_loop: {
      label: "Forehand loop â€” heavy topspin",
      elbow: { min: 100, max: 155, ideal: 130, why: "Closed bat brushes up the back of the ball" },
      shoulder: { min: 30, max: 90, ideal: 60, why: "Legs and hip push the loop, not arm" },
    },
    backhand_flick: {
      label: "Backhand flick â€” over the table",
      elbow: { min: 70, max: 120, ideal: 95, why: "Wrist snap from above the ball" },
      shoulder: { min: 20, max: 70, ideal: 45, why: "Low body, racket comes up and forward" },
    },
    push: {
      label: "Push â€” short backspin",
      elbow: { min: 110, max: 160, ideal: 135, why: "Open face slides under ball, soft hands" },
      shoulder: { min: 20, max: 70, ideal: 45, why: "Low arc just over net, compact" },
    },
    chop: {
      label: "Chop â€” defensive backspin",
      elbow: { min: 130, max: 175, ideal: 155, why: "Long carving stroke, racket finishes low" },
      shoulder: { min: 30, max: 90, ideal: 60, why: "Wait for ball to drop, slice under" },
    },
    serve: {
      label: "Serve",
      elbow: { min: 60, max: 130, ideal: 95, why: "Contact below waist, free hand tosses 16cm+" },
      shoulder: { min: 10, max: 60, ideal: 30, why: "Low to the table, hidden spin" },
    },
  },
  cricket: {
    cover_drive: {
      label: "Cover drive â€” front foot",
      elbow: { min: 120, max: 170, ideal: 150, why: "Top hand controls; bat face stays under ball" },
      shoulder: { min: 30, max: 90, ideal: 60, why: "Front shoulder points to where ball is going" },
      knee: { min: 90, max: 145, ideal: 120, why: "Front knee bent, weight on it" },
    },
    pull_shot: {
      label: "Pull shot â€” back foot",
      elbow: { min: 90, max: 160, ideal: 130, why: "Bottom hand drives the horizontal bat" },
      shoulder: { min: 60, max: 120, ideal: 90, why: "Body opens up to leg side" },
    },
    straight_drive: {
      label: "Straight drive",
      elbow: { min: 130, max: 175, ideal: 160, why: "Bat presented full-face, top elbow high" },
      shoulder: { min: 40, max: 100, ideal: 70, why: "Front shoulder leads, head over the ball" },
      knee: { min: 90, max: 150, ideal: 125, why: "Front knee bent over front foot" },
    },
    fast_bowling: {
      label: "Fast bowling â€” release",
      elbow: { min: 155, max: 180, ideal: 175, why: "High-arm release at the very top of the action (laws allow â‰¤15Â° flexion)" },
      shoulder: { min: 155, max: 180, ideal: 175, why: "Front arm pulls down as bowling arm comes over" },
      knee: { min: 150, max: 180, ideal: 170, why: "Braced front leg at release transfers momentum" },
    },
    spin_bowling: {
      label: "Spin bowling â€” release",
      elbow: { min: 120, max: 170, ideal: 150, why: "Wrist & finger work, arm comes over at controlled height" },
      shoulder: { min: 130, max: 175, ideal: 160, why: "Side-on action, arm comes over close to head" },
      knee: { min: 130, max: 175, ideal: 160, why: "Stable braced front leg" },
    },
    hook_shot: {
      label: "Hook shot â€” short ball off back foot",
      elbow: { min: 80, max: 150, ideal: 120, why: "Cross-bat swing across the body to leg side" },
      shoulder: { min: 80, max: 140, ideal: 110, why: "Body rotates away from line of ball" },
    },
    cut_shot: {
      label: "Cut shot â€” short wide ball",
      elbow: { min: 100, max: 165, ideal: 135, why: "Horizontal bat, ball under the eyes" },
      shoulder: { min: 40, max: 100, ideal: 70, why: "Open shoulders to off side" },
    },
    sweep_shot: {
      label: "Sweep â€” front knee down",
      elbow: { min: 90, max: 150, ideal: 125, why: "Horizontal bat across the line of ball" },
      shoulder: { min: 30, max: 90, ideal: 60, why: "Low body, front shoulder dips" },
      knee: { min: 30, max: 90, ideal: 60, why: "Front knee bent + grounded behind front pad" },
    },
    defensive_block: {
      label: "Defensive block",
      elbow: { min: 90, max: 145, ideal: 115, why: "Soft hands, top hand controlling face" },
      shoulder: { min: 20, max: 70, ideal: 45, why: "Compact, head over ball" },
    },
    wicket_keeping: {
      label: "Wicket keeping â€” gather",
      elbow: { min: 60, max: 130, ideal: 95, why: "Soft give of the hands as ball arrives" },
      shoulder: { min: 20, max: 80, ideal: 50, why: "Low body, head still" },
      knee: { min: 40, max: 100, ideal: 70, why: "Deep squat position" },
    },
  },
  pickleball: {
    dink: {
      label: "Dink â€” soft kitchen drop",
      elbow: { min: 130, max: 170, ideal: 150, why: "Paddle face open, lift from the shoulder" },
      shoulder: { min: 30, max: 80, ideal: 55, why: "Below the chest, paddle in front of body" },
    },
    drive: {
      label: "Drive â€” flat groundstroke",
      elbow: { min: 110, max: 155, ideal: 130, why: "Compact swing, paddle head LEADS contact" },
      shoulder: { min: 50, max: 100, ideal: 75, why: "Hip-to-shoulder level, body rotates" },
    },
    volley: {
      label: "Volley â€” kitchen punch",
      elbow: { min: 90, max: 140, ideal: 115, why: "Stab not swing, paddle head in front" },
      shoulder: { min: 40, max: 100, ideal: 70, why: "Knees bent, paddle out in front" },
    },
    serve: {
      label: "Serve â€” underhand",
      elbow: { min: 130, max: 175, ideal: 155, why: "Below the waist contact, smooth swing" },
      shoulder: { min: 20, max: 70, ideal: 45, why: "Low-to-high pendulum motion" },
    },
    third_shot_drop: {
      label: "Third shot drop",
      elbow: { min: 120, max: 165, ideal: 145, why: "Open face, lift the ball softly" },
      shoulder: { min: 30, max: 90, ideal: 60, why: "Knees bent, low body, smooth follow-through" },
    },
  },
  squash: {
    forehand_drive: {
      label: "Forehand drive â€” straight rail",
      elbow: { min: 130, max: 175, ideal: 155, why: "Extended arm, racket head leads at contact" },
      shoulder: { min: 50, max: 120, ideal: 85, why: "Side-on stance, big shoulder turn" },
    },
    backhand_drive: {
      label: "Backhand drive",
      elbow: { min: 130, max: 175, ideal: 155, why: "Long lever, extended at contact" },
      shoulder: { min: 60, max: 120, ideal: 90, why: "Side-on, shoulders point to back wall" },
    },
    drop_shot: {
      label: "Drop shot",
      elbow: { min: 110, max: 160, ideal: 135, why: "Soft hands, open face" },
      shoulder: { min: 30, max: 90, ideal: 60, why: "Knees deep, low body position" },
    },
    volley: {
      label: "Volley",
      elbow: { min: 100, max: 150, ideal: 125, why: "Take ball early, compact stroke" },
      shoulder: { min: 60, max: 120, ideal: 90, why: "Punch motion, no backswing" },
    },
    boast: {
      label: "Boast â€” angle off side wall",
      elbow: { min: 130, max: 175, ideal: 155, why: "Open face cuts across the ball" },
      shoulder: { min: 50, max: 110, ideal: 80, why: "Square hips to side wall, slice angle" },
    },
  },
  golf: {
    full_swing: {
      label: "Full swing â€” driver / long iron at impact",
      elbow: { min: 160, max: 180, ideal: 175, why: "Lead arm straight at impact, trail elbow tucked" },
      shoulder: { min: 80, max: 130, ideal: 105, why: "Shoulders rotated through, trail shoulder lower" },
      knee: { min: 140, max: 175, ideal: 160, why: "Lead knee extending into the lead heel" },
    },
    iron_shot: {
      label: "Iron shot â€” mid iron at impact",
      elbow: { min: 155, max: 180, ideal: 170, why: "Lead arm extended, hands ahead of ball" },
      shoulder: { min: 70, max: 120, ideal: 95, why: "Body covers the ball, shaft leans forward" },
      knee: { min: 130, max: 170, ideal: 155, why: "Athletic flex, weight shifted to lead side" },
    },
    pitch: {
      label: "Pitch shot",
      elbow: { min: 140, max: 175, ideal: 160, why: "Arms stay connected, body rotates through" },
      shoulder: { min: 40, max: 100, ideal: 70, why: "Smaller turn, controlled tempo" },
    },
    chip: {
      label: "Chip",
      elbow: { min: 130, max: 170, ideal: 150, why: "Putting-style hands, no wrist break" },
      shoulder: { min: 20, max: 70, ideal: 45, why: "Shoulders rock, body quiet" },
    },
    putt: {
      label: "Putt",
      elbow: { min: 120, max: 165, ideal: 145, why: "Triangle of arms+shoulders stays connected" },
      shoulder: { min: 20, max: 60, ideal: 40, why: "Pendulum from sternum, no wrist action" },
    },
  },
  basketball: {
    jump_shot: {
      label: "Jump shot â€” release",
      elbow: { min: 75, max: 110, ideal: 90, why: "Shooting elbow under ball, L-shape at release" },
      shoulder: { min: 130, max: 175, ideal: 155, why: "Arm extends fully, hand finishes in the cookie jar" },
      knee: { min: 150, max: 180, ideal: 170, why: "Fully extended jump powers the shot" },
    },
    free_throw: {
      label: "Free throw â€” release",
      elbow: { min: 75, max: 105, ideal: 90, why: "Same L-shape mechanics, no jump" },
      shoulder: { min: 130, max: 175, ideal: 155, why: "Smooth extension to follow-through" },
      knee: { min: 150, max: 180, ideal: 170, why: "Slight rise from the legs into release" },
    },
    layup: {
      label: "Layup",
      elbow: { min: 130, max: 180, ideal: 165, why: "Extended arm reaching up to the rim" },
      shoulder: { min: 150, max: 180, ideal: 170, why: "Shoulder fully elevated at release" },
    },
    three_point: {
      label: "Three-point shot",
      elbow: { min: 70, max: 105, ideal: 88, why: "L-shape with more leg drive than mid-range" },
      shoulder: { min: 130, max: 175, ideal: 155, why: "Full extension, follow-through held" },
    },
  },
  volleyball: {
    spike: {
      label: "Spike â€” attack hit",
      elbow: { min: 155, max: 180, ideal: 175, why: "Arm fully extended at contact above net" },
      shoulder: { min: 160, max: 180, ideal: 175, why: "High-elbow draw and swing" },
    },
    serve: {
      label: "Serve â€” float/jump",
      elbow: { min: 150, max: 180, ideal: 170, why: "Straight arm contact behind the ball" },
      shoulder: { min: 155, max: 180, ideal: 175, why: "Reaching high, full body extension" },
    },
    set: {
      label: "Set",
      elbow: { min: 90, max: 135, ideal: 110, why: "Bent at setup, extends through ball" },
      shoulder: { min: 80, max: 145, ideal: 115, why: "Push up and forward" },
    },
    dig: {
      label: "Dig â€” defensive platform",
      elbow: { min: 150, max: 180, ideal: 170, why: "Locked-out arms create flat platform" },
      shoulder: { min: 10, max: 60, ideal: 30, why: "Low body, platform in front" },
    },
  },
  baseball: {
    pitching: {
      label: "Pitching â€” release",
      elbow: { min: 140, max: 175, ideal: 160, why: "Pronation at release, ~90Â° at front-foot strike then extends" },
      shoulder: { min: 160, max: 180, ideal: 175, why: "Lay-back into release, full extension" },
      knee: { min: 140, max: 180, ideal: 170, why: "Front leg braces, drives chest down over plant" },
    },
    batting_swing: {
      label: "Batting swing â€” contact",
      elbow: { min: 130, max: 175, ideal: 155, why: "Lead arm extending, top arm in palm-up position" },
      shoulder: { min: 60, max: 110, ideal: 85, why: "Shoulders rotate through contact" },
    },
  },
};

// Aliases â€” Gemini's freeform shot names mapped onto the canonical
// keys above. Matched LAST so direct hits + word-boundary matches win
// first. Extend liberally as we observe new VLM outputs.
const SHOT_ALIASES = {
  cricket: {
    fast_bowling_delivery: "fast_bowling",
    fast_bowling_action: "fast_bowling",
    bowling_action_fast: "fast_bowling",
    bowling_action_spin: "spin_bowling",
    seam_bowling: "fast_bowling",
    pace_bowling: "fast_bowling",
    spin_delivery: "spin_bowling",
    drive: "cover_drive",          // generic drive â†’ cover drive default
    off_drive: "cover_drive",
    on_drive: "straight_drive",
    forward_defense: "defensive_block",
    backward_defense: "defensive_block",
    pull: "pull_shot",
    hook: "hook_shot",
    cut: "cut_shot",
    sweep: "sweep_shot",
    reverse_sweep: "sweep_shot",
  },
  badminton: {
    forehand_smash: "smash",
    backhand_smash: "smash",
    overhead_clear: "clear",
    forehand_clear: "clear",
    backhand_clear: "clear",
    forehand_drop: "drop",
    backhand_drop: "drop",
    forehand_drive: "drive",
    backhand_drive: "drive",
    forehand_net: "net_shot",
    backhand_net: "net_shot",
    underarm_clear: "lift",
    underarm_lift: "lift",
    backhand_serve: "serve",
    forehand_serve: "serve",
    block_return: "block",
  },
  tennis: {
    forehand_topspin: "forehand",
    forehand_drive: "forehand",
    forehand_flat: "forehand",
    backhand_topspin: "backhand",
    backhand_drive: "backhand",
    backhand_slice: "slice",
    one_handed_backhand: "backhand",
    two_handed_backhand: "backhand",
    serve_flat: "serve",
    serve_kick: "serve",
    serve_slice: "serve",
    overhead_smash: "overhead",
    smash: "overhead",
    drop: "drop_shot",
  },
  table_tennis: {
    // `forehand`/`backhand`/`loop`/`topspin`/`flick` deliberately absent:
    // they name a family, and resolving them to one variant meant grading a
    // backhand loop against forehand-loop ideals. `block → push` was worse —
    // those are different shots (block is passive off topspin; push is
    // backspin). See AMBIGUOUS_TERMS.
    serve_short: "serve",
    serve_long: "serve",
  },
  pickleball: {
    serve_underhand: "serve",
    drop_shot: "third_shot_drop",
    third_shot: "third_shot_drop",
    forehand_volley: "volley",
    backhand_volley: "volley",
    forehand_dink: "dink",
    backhand_dink: "dink",
  },
  squash: {
    // `forehand`/`backhand`/`rail`/`straight_drive` omitted — a rail or a
    // straight drive can be played off either side, so picking forehand was
    // a coin flip presented as fact.
    drop: "drop_shot",
    forehand_volley: "volley",
    backhand_volley: "volley",
  },
  golf: {
    drive: "full_swing",
    driver: "full_swing",
    tee_shot: "full_swing",
    iron: "iron_shot",
    long_iron: "iron_shot",
    mid_iron: "iron_shot",
    short_iron: "iron_shot",
    wedge: "pitch",
    // bunker_shot omitted — a splash out of sand is its own technique, not a pitch.
  },
  basketball: {
    // `shot` omitted — could be a layup, hook, floater or free throw.
    mid_range: "jump_shot",
    three: "three_point",
    three_pointer: "three_point",
    threes: "three_point",
    free_throw_shot: "free_throw",
    foul_shot: "free_throw",
  },
  volleyball: {
    attack: "spike",
    kill: "spike",
    overhand_serve: "serve",
    underhand_serve: "serve",
    jump_serve: "serve",
    float_serve: "serve",
    bump: "dig",
    pass: "dig",
  },
  baseball: {
    pitch: "pitching",
    fastball: "pitching",
    swing: "batting_swing",
    hitting: "batting_swing",
  },
};

/**
 * Terms that name a FAMILY of shots rather than one shot.
 *
 * THE RULE: an alias may only ever REMOVE detail, never ADD it.
 *
 * We used to break that rule in six sports — `bowling_action` resolved to
 * `fast_bowling`, `loop` to `forehand_loop`, `shot` to `jump_shot`. The model
 * had said something honest and vague; we turned it into a confident specific
 * claim, then graded the player's joints against that invented shot's ideal
 * ranges. A spin bowler was told "fast bowling"; a backhand loop was measured
 * against forehand-loop ideals.
 *
 * When one of these arrives we return no ideal range at all. The skeleton
 * still renders, the angles just aren't graded — "we measured you but won't
 * pretend to know which shot this was" beats a confident wrong answer, which
 * is the failure that makes someone stop trusting the product.
 *
 * A term listed here is still honoured as a DIRECT key hit: `drive` is a real,
 * specific badminton shot even though it's ambiguous in squash.
 */
const AMBIGUOUS_TERMS = {
  cricket:      ["bowling_action", "bowling", "delivery", "batting", "shot"],
  table_tennis: ["forehand", "backhand", "loop", "topspin", "flick", "block", "drive"],
  pickleball:   ["forehand", "backhand", "shot"],
  squash:       ["forehand", "backhand", "rail", "straight_drive", "shot"],
  basketball:   ["shot", "shooting", "attempt"],
  badminton:    ["forehand", "backhand", "shot", "stroke"],
  tennis:       ["shot", "stroke", "groundstroke"],
  volleyball:   ["hit", "contact"],
  baseball:     ["shot"],
  golf:         ["shot", "swing"],
};


const SPORT_ALIASES = {
  ttennis: "table_tennis",
  pingpong: "table_tennis",
  "ping_pong": "table_tennis",
  "ping-pong": "table_tennis",
  bball: "basketball",
  baseball_softball: "baseball",
  fielding: "cricket",
  batting: "cricket",
  bowling: "cricket",
};


function _normalize(s) {
  return (s || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
}


// The canonical support list lives in posturePolicy (TF-free, so callers can
// check before pulling this module's multi-MB import chain). Warn loudly in
// dev if a sport gains curated ranges here but never gets added there — the
// symptom would be silent: the tracker simply never runs for it.
if (process.env.NODE_ENV !== "production") {
  const drift = Object.keys(IDEAL_ANGLES).filter((s) => !POSTURE_SUPPORTED_SPORTS.has(s));
  if (drift.length) {
    console.warn(
      `[idealAngles] IDEAL_ANGLES has curated ranges for ${drift.join(", ")} but ` +
      `posturePolicy.POSTURE_SUPPORTED_SPORTS does not list them — the posture ` +
      `tracker will never run for those sports.`
    );
  }
}


export function getIdealAngles(sport, shotType) {
  let s = _normalize(sport);
  let t = _normalize(shotType);
  s = SPORT_ALIASES[s] || s;
  const sportMap = IDEAL_ANGLES[s];
  if (!sportMap) return null;

  // 1. Direct hit. Checked BEFORE the ambiguity guard so a term that is
  // genuinely a specific shot in this sport still resolves — `drive` is a real
  // badminton shot even though it names a family in squash.
  if (sportMap[t]) return sportMap[t];

  // 2. Ambiguity guard. A family name must not be resolved to one of its
  // variants by the alias table or the fuzzy matcher below — that's how a
  // generic bowling action became "fast bowling" and a backhand loop got
  // graded against forehand-loop ideals. No range means the skeleton still
  // draws, the angles just aren't graded against a shot we're guessing at.
  if ((AMBIGUOUS_TERMS[s] || []).includes(t)) return null;

  // 3. Alias hit
  const aliased = SHOT_ALIASES[s]?.[t];
  if (aliased && sportMap[aliased]) return sportMap[aliased];

  // 3. Word-boundary match. "drive" â†’ "cover_drive" only if "drive" is a
  // whole token in the key. Prevents "forehand_swing" matching "swing"
  // OR "drive" picking "cover_drive" arbitrarily across sports.
  const tTokens = new Set(t.split("_").filter(Boolean));
  let bestKey = null, bestOverlap = 0;
  for (const key of Object.keys(sportMap)) {
    const kTokens = new Set(key.split("_").filter(Boolean));
    let overlap = 0;
    for (const tok of tTokens) if (kTokens.has(tok)) overlap++;
    if (overlap > bestOverlap && overlap >= 1) {
      bestOverlap = overlap;
      bestKey = key;
    }
  }
  // Require â‰¥2 token overlap OR â‰¥1 if the candidate has only 1 token,
  // otherwise we're back to generic substring guessing.
  if (bestKey) {
    const kTokens = bestKey.split("_").filter(Boolean);
    if (bestOverlap >= 2 || kTokens.length === 1) {
      return sportMap[bestKey];
    }
  }
  return null;
}
