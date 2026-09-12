/**
 * @module analyses
 * Present the balance as analyses, never as tokens.
 *
 * WHY: "100 tokens = 1 analysis = ₹30" made users do arithmetic before they
 * understood the product — outside reviewers flagged the token jargon as a
 * reason the offer felt like a nudge toward bundles they didn't understand.
 * An analysis is the thing people actually buy, so that is the only unit the
 * UI shows.
 *
 * WHY TOKENS SURVIVE UNDERNEATH: several things cost or earn a fraction of an
 * analysis (a coach reply is 5, hosting a game earns 50, a training day 20),
 * and balances, payments and every transaction are recorded in tokens. Moving
 * the ledger to whole analyses would force each of those to round to 0 or 1,
 * and rewrite financial records for no user benefit. So this is presentation
 * only: store tokens, show analyses.
 */

export const TOKENS_PER_ANALYSIS = 100;

/** Whole analyses a token balance buys. Leftover tokens fund coach replies. */
export function analysesFrom(tokens) {
  return Math.max(0, Math.floor((Number(tokens) || 0) / TOKENS_PER_ANALYSIS));
}

export function analysisWord(n) {
  return n === 1 ? "analysis" : "analyses";
}

/** 300 → "3 analyses", 100 → "1 analysis", 450 → "4 analyses". */
export function formatAnalyses(tokens) {
  const n = analysesFrom(tokens);
  return `${n.toLocaleString("en-IN")} ${analysisWord(n)}`;
}

/**
 * For quoting a reward or grant that may be a fraction of an analysis:
 * 200 → "2 analyses", 50 → "half an analysis", 25 → "a quarter of an analysis".
 * Rewards are earned in small pieces on purpose; saying "0 analyses" for them
 * would be both wrong and discouraging.
 */
export function describeAnalysisAmount(tokens) {
  const t = Number(tokens) || 0;
  if (t > 0 && t % TOKENS_PER_ANALYSIS === 0) {
    const n = t / TOKENS_PER_ANALYSIS;
    return `${n} ${analysisWord(n)}`;
  }
  const FRACTIONS = { 50: "half an analysis", 25: "a quarter of an analysis", 75: "three-quarters of an analysis", 20: "a fifth of an analysis" };
  if (FRACTIONS[t]) return FRACTIONS[t];
  const n = t / TOKENS_PER_ANALYSIS;
  return `${n.toFixed(n < 1 ? 2 : 1).replace(/\.?0+$/, "")} ${n === 1 ? "analysis" : "analyses"}`;
}

/** How many coach replies the leftover (sub-analysis) tokens pay for. */
export const TOKENS_PER_COACH_REPLY = 5;
export function coachRepliesFromLeftover(tokens) {
  const leftover = (Number(tokens) || 0) % TOKENS_PER_ANALYSIS;
  return Math.floor(leftover / TOKENS_PER_COACH_REPLY);
}
