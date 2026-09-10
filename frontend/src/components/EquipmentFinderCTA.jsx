import { Link } from "react-router-dom";
import { ArrowRight, IndianRupee, Target, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * EquipmentFinderCTA — the gear entry point on a sport page.
 *
 * WHY IT EXISTS: the gear sections used to end in a vague "See all
 * recommendations" pointing at /marketplace, which drops the visitor into every
 * sport at once and says nothing about what they'd get. Gear is a real
 * secondary intent on these pages — someone not ready to film themselves will
 * still happily read about what racket or shoes to buy — so the link needs to
 * state the actual promise (matched to YOUR level and YOUR budget) and land on
 * that sport's own catalogue.
 *
 * @param {string} sport      display name, e.g. "Gym" — used in the copy.
 * @param {string} href       that sport's equipment page.
 * @param {string} [noun]     what they're shopping for, e.g. "rackets", "gear".
 * @param {string} [count]    optional honest scale hint, e.g. "60+ products".
 */
export default function EquipmentFinderCTA({ sport, href, noun = "gear", count }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-lime-400/25 bg-gradient-to-br from-lime-500/[0.07] via-zinc-900/60 to-zinc-900/60 p-6 sm:p-8">
      {/* soft brand glow, purely decorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-lime-400/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-lime-400">
            <ShoppingBag className="h-3.5 w-3.5" /> Equipment finder
          </span>
          <h3 className="mt-2 font-heading text-2xl font-bold leading-tight text-white sm:text-3xl">
            Find the right {noun} for your level and budget
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Every {sport.toLowerCase()} pick compared on specs, real pros and cons, and current
            prices — grouped by skill level so you are not paying for something built for a
            player two levels above you.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-lime-400/80" /> Matched to your level
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IndianRupee className="h-3.5 w-3.5 text-lime-400/80" /> Every budget
            </span>
            {count && <span className="inline-flex items-center gap-1.5">{count}</span>}
          </div>
        </div>

        <Button
          asChild
          size="lg"
          className="w-full shrink-0 bg-lime-400 font-bold text-black hover:bg-lime-500 sm:w-auto"
        >
          <Link to={href}>
            Browse {sport} {noun} <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
