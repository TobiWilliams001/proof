import { fmt } from './format';

/**
 * How results are shown. Money is the default: most traders think in their
 * account currency. R stays available for traders who size by risk.
 */
export type Units = 'money' | 'r' | 'both';

/** One result, in the trader's chosen units, falling back to whichever is known. */
export function showResult(units: Units, r: number | null | undefined, money: number | null | undefined): string {
  const hasR = r != null && !Number.isNaN(r);
  const hasM = money != null && !Number.isNaN(money);
  if (units === 'r') return hasR ? fmt.r(r) : hasM ? fmt.pnl(money) : 'None';
  if (units === 'both' && hasM && hasR) return `${fmt.pnl(money)} · ${fmt.r(r)}`;
  return hasM ? fmt.pnl(money) : hasR ? fmt.r(r) : 'None';
}

/** The number whose sign colours a result (win green, loss red). */
export function resultValue(units: Units, r: number | null | undefined, money: number | null | undefined): number {
  return units === 'r' ? r ?? money ?? 0 : money ?? r ?? 0;
}

/** Plain explanations for the few trader words Proof keeps. */
export const TERMS: Record<string, string> = {
  R: 'R compares what you made with what you risked. +2R means you made twice what you risked; −1R means you lost what you risked.',
  'Win rate': 'The share of your trades that made money.',
  'Average per trade': 'What a trade makes you on average, wins and losses together. Above zero means your trading pays over time.',
  'Biggest dip': 'The furthest your account fell from a high before climbing back.',
  Recovery: 'How many trades it took to get back to your high after the biggest dip.',
  Flat: 'A trade that ended at about zero, neither a win nor a loss.',
  Setup: 'A kind of trade you take again and again, like a breakout or a pullback.',
  Playbook: 'Your list of setups and the words you use for them. Proof sorts your notes into these.',
  Session: 'The part of the trading day: Asian, London, the overlap, or New York.',
  'Position value': 'The total size of the position in your account currency.',
};
