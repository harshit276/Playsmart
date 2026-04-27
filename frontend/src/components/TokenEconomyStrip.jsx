/**
 * TokenEconomyStrip — at-a-glance Earn vs Spend visualization. Lives on
 * the landing page below the demo, also embeddable on /wallet.
 */
import { Link } from "react-router-dom";
import { Sparkles, UserPlus, Users, Camera, ArrowRight } from "lucide-react";

const EARN = [
  { label: "Sign up", amount: "+300", icon: Sparkles },
  { label: "Refer a friend", amount: "+200", icon: UserPlus, sub: "you both get it" },
  { label: "Host a game", amount: "+50", icon: Users, sub: "up to 5/day" },
];

export default function TokenEconomyStrip() {
  return (
    <section className="py-12 sm:py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-[11px] uppercase tracking-wider text-purple-300 font-bold mb-2">🪙 AthlyticAI tokens</p>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl uppercase tracking-tight text-white">
            Earn free, or top up.
          </h2>
          <p className="text-zinc-400 text-sm mt-2 max-w-xl mx-auto">
            Tokens unlock AI video analysis. Get 300 free on signup, earn more for inviting friends and using the app.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 items-stretch">
          {/* Earn */}
          <div className="bg-gradient-to-br from-lime-500/10 to-zinc-900 border border-lime-400/20 rounded-2xl p-6">
            <p className="text-[10px] uppercase tracking-wider text-lime-400 font-bold mb-4">EARN</p>
            <div className="space-y-3">
              {EARN.map((e) => (
                <div key={e.label} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-lime-400/15 flex items-center justify-center shrink-0">
                    <e.icon className="w-4 h-4 text-lime-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{e.label}</p>
                    {e.sub && <p className="text-[10px] text-zinc-500">{e.sub}</p>}
                  </div>
                  <p className="font-mono text-sm font-bold text-lime-400">{e.amount}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Spend */}
          <div className="bg-gradient-to-br from-purple-500/10 to-zinc-900 border border-purple-400/20 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-purple-300 font-bold mb-4">SPEND</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-400/15 flex items-center justify-center shrink-0">
                  <Camera className="w-4 h-4 text-purple-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">AI video analysis</p>
                  <p className="text-[10px] text-zinc-500">Shot detection · technique consistency · coaching narrative</p>
                </div>
                <p className="font-mono text-sm font-bold text-purple-300">−100</p>
              </div>
              <p className="text-[11px] text-zinc-500 mt-4 pl-12">
                Training plan, equipment recs, and community games are <span className="text-white">always free</span>.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/auth" className="inline-flex items-center gap-1 bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-xs px-4 py-2">
                Start free <ArrowRight className="w-3 h-3" />
              </Link>
              <Link to="/wallet" className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 font-medium px-3 py-2">
                Token packs from ₹99
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
