import { X, Volume2, VolumeX, SlidersHorizontal } from "lucide-react";
import { cuesSupported } from "@/lib/speakCue";

/**
 * The slim top bar: close, what you're practising, the sound button and a settings button.
 * Everything rarely used (racket hand, switching camera, showing angles) lives in the settings
 * sheet, so the bar stays quiet. A small amber dot says the phone is struggling to keep up.
 */
export default function PracticeTopBar({ title, subtitle, onClose, sound, onToggleSound, onSettings, slow = false }) {
  const btn = "w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20";
  return (
    <div className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
      <button type="button" onClick={onClose} className={btn} aria-label="Finish"><X className="w-5 h-5" /></button>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold leading-tight truncate">{title}</p>
        {subtitle && <p className="text-[11px] text-zinc-400 leading-tight truncate">{subtitle}</p>}
      </div>
      {slow && <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" title="Running slowly on this phone" aria-label="Running slowly on this phone" />}
      {cuesSupported() && (
        <button type="button" onClick={onToggleSound} className={btn} aria-label={sound ? "Mute the coach" : "Unmute the coach"}>
          {sound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-zinc-400" />}
        </button>
      )}
      <button type="button" onClick={onSettings} className={btn} aria-label="Settings"><SlidersHorizontal className="w-5 h-5" /></button>
    </div>
  );
}
