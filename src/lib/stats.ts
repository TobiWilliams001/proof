import { closedOnly, type Outcome, type Side, type Trade } from './types';

// Below this, a P&L is noise from fees/spread rather than a real result.
const BE_EPSILON = 0.005;

export function outcomeOf(t: Trade): Outcome {
  if (t.r != null) {
    if (Math.abs(t.r) < 0.05) return 'be';
    return t.r > 0 ? 'win' : 'loss';
  }
  if (Math.abs(t.pnl) < BE_EPSILON) return 'be';
  return t.pnl > 0 ? 'win' : 'loss';
}

export interface Stats {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** wins / all trades; breakeven counts as not-a-win */
  winRate: number;
  pnl: number;
  /** only trades with a known R contribute */
  totalR: number;
  avgR: number | null;
  rCount: number;
  bestR: number | null;
  worstR: number | null;
}

export function computeStats(all: Trade[]): Stats {
  const trades = closedOnly(all);
  let wins = 0, losses = 0, breakeven = 0, pnl = 0, totalR = 0, rCount = 0;
  let bestR: number | null = null;
  let worstR: number | null = null;
  for (const t of trades) {
    const o = outcomeOf(t);
    if (o === 'win') wins++;
    else if (o === 'loss') losses++;
    else breakeven++;
    pnl += t.pnl;
    if (t.r != null) {
      totalR += t.r;
      rCount++;
      bestR = bestR == null ? t.r : Math.max(bestR, t.r);
      worstR = worstR == null ? t.r : Math.min(worstR, t.r);
    }
  }
  const count = trades.length;
  return {
    count,
    wins,
    losses,
    breakeven,
    winRate: count ? wins / count : 0,
    pnl: round(pnl, 2),
    totalR: round(totalR, 2),
    avgR: rCount ? round(totalR / rCount, 2) : null,
    rCount,
    bestR,
    worstR,
  };
}

export type GroupKey = 'setup' | 'symbol' | 'session' | 'side';

export function groupStats(trades: Trade[], key: GroupKey) {
  const groups = new Map<string, Trade[]>();
  for (const t of closedOnly(trades)) {
    const k = (key === 'setup' ? t.setup : t[key]) || 'Untagged';
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.entries()]
    .map(([name, ts]) => ({ name, trades: ts, stats: computeStats(ts) }))
    .sort((a, b) => b.stats.totalR - a.stats.totalR || b.stats.pnl - a.stats.pnl);
}

export function equitySeries(trades: Trade[]) {
  const sorted = closedOnly(trades).sort((a, b) => a.closedAt.localeCompare(b.closedAt));
  let cum = 0;
  let cumR = 0;
  return sorted.map((t, i) => {
    cum += t.pnl;
    cumR += t.r ?? 0;
    return { i: i + 1, date: t.closedAt, pnl: round(cum, 2), r: round(cumR, 2), id: t.id };
  });
}

/**
 * Buckets R into whole-R bins [b, b+1). The outer bins absorb outliers so a
 * single +9R trade doesn't stretch the chart into uselessness.
 */
export function rDistribution(trades: Trade[]) {
  const bins = new Map<number, number>();
  for (let b = -3; b <= 3; b++) bins.set(b, 0);
  for (const t of closedOnly(trades)) {
    if (t.r == null) continue;
    const b = Math.max(-3, Math.min(3, Math.floor(t.r)));
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  return [...bins.entries()].map(([bin, count]) => ({ bin, count }));
}

export function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * R from prices: how far price moved in the trader's favour, in units of the
 * risk they took (entry→stop). Null when there's no valid stop, never guessed.
 */
export function rFromPrices(side: Side, entry: number, stop: number | undefined, exit: number): number | null {
  if (stop == null || !entry || !exit) return null;
  const risk = side === 'long' ? entry - stop : stop - entry;
  if (!(risk > 0)) return null;
  const move = side === 'long' ? exit - entry : entry - exit;
  return round(move / risk, 2);
}
