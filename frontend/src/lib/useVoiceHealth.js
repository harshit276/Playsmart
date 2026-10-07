import { useEffect, useState } from "react";
import { voiceHealth, subscribeVoice } from "@/lib/speakCue";

/** The speech engine's state, kept current, so a screen can say when it can't be heard. */
export function useVoiceHealth() {
  const [h, setH] = useState(voiceHealth);
  useEffect(() => { setH(voiceHealth()); return subscribeVoice(setH); }, []);
  return h;
}

/** The one-line note for the player when speech isn't working, or null when it is. */
export function voiceNote(h) {
  if (!h.supported) return "This browser can't speak. You'll get a tone and the coaching line on screen instead.";
  if (h.locked) return "Your browser blocked the voice. Tap the speaker button once to turn it on.";
  if (h.silent) return "Can't hear us? Turn the media volume up and switch off silent mode. You'll still get tones and the coaching line.";
  return null;
}
