import { computeStats } from '../stats';
import { closedOnly, type Trade } from '../types';
import type { Change, Length, Measure, Plan, Snapshot } from './types';

/** The change in a few plain words: "Skip Breakout retest". */
export function describeChange(c: Change): string {
  switch (c.kind) {
    case 'skipSetup':
      return `Skip ${c.setup}`;
    case 'checkFor':
      return `Check for “${c.word}” before you enter`;
    case 'followPlan':
      return 'Only take trades that fit your plan';
    case 'skipSession':
      return `Skip the ${c.session} session`;
  }
}

export function describeLength(l: Length): string {
  return l.kind === 'trades' ? `${l.value} trades` : `${l.value} days`;
}

export function describeMeasure(m: Measure): string {
  return m === 'perTrade' ? 'average per trade' : 'win rate';
}

/** A first hypothesis the trader can keep or reword. */
export function hypothesisFor(c: Change, m: Measure): string {
  const better = m === 'perTrade' ? 'my average per trade goes up' : 'I win more often';
  switch (c.kind) {
    case 'skipSetup':
      return `Without ${c.setup}, ${better}.`;
    case 'checkFor':
      return `Checking for “${c.word}” before I enter, ${better}.`;
    case 'followPlan':
      return `Taking only trades that fit my plan, ${better}.`;
    case 'skipSession':
      return `Skipping the ${c.session} session, ${better}.`;
  }
}

export function makePlan(change: Change, measure: Measure = 'perTrade', length: Length = { kind: 'trades', value: 10 }): Plan {
  return { hypothesis: hypothesisFor(change, measure), change, measure, length };
}

/** The numbers for a set of trades, from the same stats as everywhere else in Proof. */
export function snapshot(trades: Trade[]): Snapshot {
  const st = computeStats(trades);
  return {
    count: st.count,
    winRate: st.winRate,
    perTradeR: st.avgR,
    perTradeMoney: st.count ? Math.round((st.pnl / st.count) * 100) / 100 : null,
    tradeIds: trades.map((t) => t.id),
  };
}

/**
 * "Before": the trader's most recent comparable trades before the start. As
 * many trades as the experiment will run for (at least 10), or the same number
 * of days, so the two sides are a fair size.
 */
export function baselineFor(plan: Plan, trades: Trade[], startAt: Date): Snapshot {
  const before = closedOnly(trades)
    .filter((t) => new Date(t.openedAt) < startAt)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  if (plan.length.kind === 'trades') return snapshot(before.slice(0, Math.max(10, plan.length.value)));
  const from = startAt.getTime() - Math.max(7, plan.length.value) * 864e5;
  return snapshot(before.filter((t) => new Date(t.openedAt).getTime() >= from));
}
