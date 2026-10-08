import { Check, X, Minus } from "lucide-react";

/**
 * What's right and what's off, at a glance: short tick-or-cross chips in labelled rows, instead
 * of gauges and numbers. Tapping "Show angles" in the settings sheet adds the numbers.
 *
 * @param {{label:string, items:{key:string, label:string, state:"ok"|"off"|"na", detail?:string}[]}[]} groups
 */
const CHIP = {
  ok: "bg-lime-400/15 border-lime-400/40 text-lime-300",
  off: "bg-rose-500/15 border-rose-400/50 text-rose-300",
  na: "bg-zinc-900 border-zinc-800 text-zinc-500",
};

export default function FormChips({ groups, showValues = false }) {
  return (
    <div className="space-y-1.5">
      {groups.map((g) => (
        <div key={g.label} className="flex items-center gap-2">
          <p className="w-[74px] shrink-0 text-[11px] font-semibold text-zinc-500 leading-tight">{g.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((it) => {
              const Icon = it.state === "ok" ? Check : it.state === "off" ? X : Minus;
              return (
                <span key={it.key} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-bold ${CHIP[it.state]}`}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={3} />
                  {it.label}
                  {showValues && it.detail ? <span className="font-mono font-semibold opacity-80">{it.detail}</span> : null}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
