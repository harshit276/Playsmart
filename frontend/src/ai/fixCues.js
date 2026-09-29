/**
 * @module fixCues
 * Turns a measured joint angle and its target into what a player can act on:
 * one instruction, what it should feel like, and a practice cue. "Shoulder
 * 29° → 95°" is a measurement; "Lift your hitting elbow up level with your
 * shoulder" is coaching.
 *
 * Angle conventions (same as idealAngles / ghostPose):
 *   shoulder = arm elevation: the angle between the upper arm and the side of
 *              the body (0° arm down by the hip, 90° level, 180° straight up)
 *   elbow    = the angle inside the elbow (180° is a straight arm)
 */

function amount(delta) {
  const d = Math.abs(delta);
  return d >= 35 ? "a lot " : d >= 15 ? "" : "slightly ";
}

function heightWords(target) {
  if (target >= 150) return "high above your head, arm close to straight up";
  if (target >= 115) return "above shoulder height";
  if (target >= 70) return "about level with your shoulder";
  return "below your shoulder, close to your body";
}

/**
 * @param {"shoulder"|"elbow"|"knee"} joint
 * @param {number} measured  angle at contact (degrees)
 * @param {number} target    the ideal angle (degrees)
 * @returns {{ headline: string, feel: string, drill: string } | null}
 */
export function fixCue(joint, measured, target) {
  if (!Number.isFinite(measured) || !Number.isFinite(target)) return null;
  const delta = target - measured;
  const more = amount(delta);
  if (joint === "shoulder") {
    return delta > 0
      ? {
          headline: `Lift your hitting arm ${more}higher at contact`,
          feel: `Your elbow should be ${heightWords(target)} as you hit. Reach up and out to meet it instead of letting it drop into your body.`,
          drill: "Shadow 10 swings in slow motion and freeze at contact: check where your elbow is before you speed up.",
        }
      : {
          headline: `Keep your hitting arm ${more}lower at contact`,
          feel: `Meet it with your elbow ${heightWords(target)}, not reaching up past it.`,
          drill: "Shadow 10 swings in slow motion and freeze at contact: check where your elbow is before you speed up.",
        };
  }
  if (joint === "elbow") {
    return delta > 0
      ? {
          headline: `Straighten your arm ${more}more through contact`,
          feel: "Meet it in front of you with a long arm, not a cramped, bent one. Keep only a slight bend.",
          drill: "Slow shadow swings, pausing at contact: your arm should be almost straight with a soft bend.",
        }
      : {
          headline: `Keep ${more}more bend in your elbow at contact`,
          feel: "Don't lock the arm out. A little bend lets your forearm and wrist snap through the shot.",
          drill: "Slow shadow swings, pausing at contact: keep a soft bend and finish with a wrist snap.",
        };
  }
  if (joint === "knee") {
    return delta > 0
      ? {
          headline: `Stand ${more}taller on your hitting-side leg at contact`,
          feel: "Push up out of that leg into the shot instead of staying crouched, and let your hips rise with the swing.",
          drill: "Split-step, lunge, then drive up through your front leg as you swing.",
        }
      : {
          headline: `Bend your hitting-side knee ${more}more at contact`,
          feel: "Sink your hips so your weight drops over your front foot: get lower so you can push off quickly.",
          drill: "Hold a low ready position for 20 seconds between rallies, then shadow a lunge and freeze on the front knee.",
        };
  }
  return null;
}
