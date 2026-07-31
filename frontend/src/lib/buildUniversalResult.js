// buildUniversalResult — builds the universal-mode result object the UI
// renders, from the raw backend `data` (events + narrative + sport).
//
// Extracted to a shared module so BOTH the live analyze flow
// (AnalyzePage) AND the no-signup demo page produce a byte-identical
// result shape. Do NOT change this logic without checking AnalyzePage —
// the live analyze flow depends on it verbatim.
export function buildUniversalResult(data, targetDesc, pickedPlayer) {
  const events = data?.events || [];
  return {
    success: true,
    _universal: true,
    _target_player_description: targetDesc,
    _target_player_thumbnail: pickedPlayer?.thumbnail || null,
    _target_player: pickedPlayer || null,
    _meta: data?._meta || null,
    _debug: data?._debug || data?._meta || null,
    coach_narrative: data?.coach_narrative || null,
    target_mismatch_warning: data?.target_mismatch_warning || null,
    // Elite spatial layer (Gemini-tracked): visible court geometry +
    // whole-clip footwork stats. Null when the model couldn't see a court.
    court_map: data?.court_map || null,
    movement: data?.movement || null,
    // Doubles: who Gemini treated as "you" vs "partner".
    player_legend: data?.player_legend || null,
    sport: data?.sport_detected || "unknown",
    skill_level: data?.overall_skill_level || "Intermediate",
    quick_summary: data?.summary || "",
    coach_feedback: { summary: data?.summary || "", encouragement: "" },
    shots: events.map((e) => ({
      type: (e.event_type || "event").toLowerCase().replace(/\s+/g, "_"),
      name: e.shot_label || e.event_type || "Event",
      shot_label: e.shot_label || e.event_type || null,
      shot_category: e.shot_category || e.event_type || null,
      intent: e.intent || null,
      outcome: e.outcome || null,
      quality_observation: e.quality_observation || null,
      confidence: e.confidence ?? 0.7,
      timestamp: Math.round((e.timestamp_sec || 0) * 10) / 10,
      grade: (e.confidence ?? 0.7) >= 0.7 ? "A" : (e.confidence ?? 0) >= 0.5 ? "B" : "C",
      score: Math.round((e.confidence ?? 0.7) * 100),
      reasoning: e.description || "",
      formFeedback: { strengths: e.strengths || [], weaknesses: e.weaknesses || [], tip: e.tip || "" },
      vlmSkill: e.skill_level || "Intermediate",
      powerLevel: null,
      speed: (typeof e.speed_estimate_kmh === "number" && e.speed_estimate_kmh > 0)
        ? { estimated_speed_kmh: e.speed_estimate_kmh }
        : null,
      // Spatial tracking (coords normalized 0-1000 to the video frame)
      ball_trajectory: e.ball_trajectory || null,
      contact_box: e.contact_box || null,
      player_position: e.player_position || null,
      thumbnail: null,
    })),
    total_shots_detected: events.length,
    multi_shot: events.length > 1,
    shot_distribution: events.reduce((d, e) => {
      const k = (e.event_type || "event").toLowerCase().replace(/\s+/g, "_");
      d[k] = (d[k] || 0) + 1;
      return d;
    }, {}),
    _accuracy_mode: "universal",
  };
}
