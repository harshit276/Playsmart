import { Volume2, VolumeX, SwitchCamera, Hand, Eye } from "lucide-react";
import { cuesSupported } from "@/lib/speakCue";

/**
 * Everything you don't need while practising, one tap away: racket hand, which camera, sound,
 * and whether the chips show numbers. A bottom sheet over the camera.
 */
function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-white/5 last:border-0">
      <p className="flex items-center gap-2.5 text-[15px] font-semibold"><Icon className="w-5 h-5 text-zinc-400" />{label}</p>
      {children}
    </div>
  );
}

const Seg = ({ value, onChange, options }) => (
  <div className="flex rounded-lg overflow-hidden border border-zinc-700">
    {options.map(([v, l]) => (
      <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
        className={`px-3.5 py-1.5 text-[13px] font-bold ${value === v ? "bg-lime-400 text-black" : "bg-zinc-900 text-zinc-300"}`}>{l}</button>
    ))}
  </div>
);

export default function SettingsSheet({ open, onClose, hand, onHand, canFlip, onFlip, sound, onToggleSound, showValues, onShowValues, note }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md mx-auto rounded-t-3xl bg-zinc-900 border-t border-white/10 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto mb-2" />
        {onHand && (
          <Row icon={Hand} label="Racket hand"><Seg value={hand} onChange={onHand} options={[["right", "Right"], ["left", "Left"]]} /></Row>
        )}
        {cuesSupported() && (
          <Row icon={sound ? Volume2 : VolumeX} label="Voice coach"><Seg value={sound ? "on" : "off"} onChange={(v) => { if ((v === "on") !== sound) onToggleSound(); }} options={[["on", "On"], ["off", "Off"]]} /></Row>
        )}
        <Row icon={Eye} label="Show angles"><Seg value={showValues ? "on" : "off"} onChange={(v) => onShowValues(v === "on")} options={[["on", "On"], ["off", "Off"]]} /></Row>
        {canFlip && (
          <Row icon={SwitchCamera} label="Camera"><button type="button" onClick={() => { onFlip(); onClose(); }} className="px-3.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-[13px] font-bold">Switch</button></Row>
        )}
        {note && <p className="text-[12px] text-amber-200 mt-2 leading-snug">{note}</p>}
        <button type="button" onClick={onClose} className="w-full mt-4 py-3 rounded-xl bg-lime-400 text-black font-bold">Done</button>
      </div>
    </div>
  );
}
