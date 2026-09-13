/**
 * EarnTokensSection — accurate, at-a-glance breakdown of every way to earn
 * free analyses. Values MUST match backend/server.py TOKEN_RULES exactly
 * (÷100 — the UI shows analyses, the ledger stores tokens) — do not tweak
 * numbers here without checking the backend first.
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles, UserPlus, Users, LogIn, Dumbbell, Camera, ArrowRight, Infinity as InfinityIcon,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.07 } }),
};

// Amounts are in analyses (the backend stores 100 tokens per analysis).
const EARN_WAYS = [
  {
    icon: Sparkles,
    title: "Sign up",
    amount: "+2",
    desc: "2 free analyses: film a clip, get coached, then film again and compare.",
  },
  {
    icon: UserPlus,
    title: "Invite a friend",
    amount: "+2",
    desc: "You both get 2 free analyses once they finish their first. No limit on friends.",
    link: { to: "/referral", label: "Get your invite link" },
  },
  {
    icon: Users,
    title: "Host a community game",
    amount: "+½",
    desc: "Half an analysis per game you host, up to 5 games a day.",
    link: { to: "/community?host=1", label: "Host a game" },
  },
  {
    icon: LogIn,
    title: "Daily login bonus",
    amount: "+¼",
    desc: "Once a day, up to 1 free analysis in total.",
  },
  {
    icon: Dumbbell,
    title: "Complete a training day",
    amount: "+⅕",
    desc: "Once a day, up to 1 free analysis in total.",
  },
];

export default function EarnTokensSection() {
  return (
    <section className="py-14 sm:py-24 px-4 bg-zinc-900/50 border-y border-zinc-800/50" data-testid="earn-tokens-section">
      <div className="max-w-6xl mx-auto">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
          className="text-center mb-8 sm:mb-12">
          <span className="text-lime-400 text-sm font-semibold uppercase tracking-widest mb-3 block">Free analyses</span>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl md:text-5xl tracking-tight uppercase text-white mb-4">
            How to Get Free Analyses
          </h2>
          <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto">
            Each video you upload uses 1 analysis. Earn more for free, or buy a pack.
            <span className="block text-lime-400/80 text-sm mt-1">They never expire.</span>
          </p>
        </motion.div>

        {/* Phones: one compact list (five full cards stacked was a wall);
            sm and up: the card grid as before. */}
        <div className="sm:hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 divide-y divide-zinc-800/80 mb-4">
          {EARN_WAYS.map((w) => {
            const Row = w.link ? Link : "div";
            return (
              <Row key={w.title} {...(w.link ? { to: w.link.to } : {})} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-lime-400/10 flex items-center justify-center shrink-0">
                  <w.icon className="w-4 h-4 text-lime-400" strokeWidth={1.6} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white leading-tight">{w.title}</p>
                  <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">{w.desc}</p>
                </div>
                <span className="font-mono font-bold text-lime-400 text-sm shrink-0">{w.amount}</span>
              </Row>
            );
          })}
        </div>

        <div className="hidden sm:grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {EARN_WAYS.map((w, i) => (
            <motion.div key={w.title} initial="hidden" whileInView="visible" custom={i}
              viewport={{ once: true }} variants={fadeUp}
              className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 flex flex-col hover:border-lime-400/30 transition-all">
              <div className="w-10 h-10 rounded-lg bg-lime-400/10 flex items-center justify-center mb-3">
                <w.icon className="w-5 h-5 text-lime-400" strokeWidth={1.5} />
              </div>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h3 className="font-heading font-semibold text-white text-sm leading-tight">{w.title}</h3>
                <span className="font-mono font-bold text-lime-400 text-sm whitespace-nowrap">{w.amount}</span>
              </div>
              <p className="text-zinc-500 text-xs leading-relaxed flex-1">{w.desc}</p>
              {w.link && (
                <Link to={w.link.to} className="mt-3 inline-flex items-center gap-1 text-lime-400 hover:text-lime-300 text-xs font-medium">
                  {w.link.label} <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </motion.div>
          ))}
        </div>

        {/* Spend + never-expire note */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
          className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-purple-400/10 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5 text-purple-300" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Each video analysis uses 1 from your balance</p>
              <p className="text-xs text-zinc-500">Training plans, equipment recommendations, and community games are always free.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 shrink-0">
            <InfinityIcon className="w-4 h-4 text-lime-400" />
            Analyses never expire
          </div>
        </motion.div>
      </div>
    </section>
  );
}
