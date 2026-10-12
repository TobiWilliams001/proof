import { describe, expect, it } from 'vitest';
import { computeStats } from '../stats';
import type { Trade } from '../types';
import { baselineFor, describeChange, hypothesisFor, makePlan, snapshot } from './plan';

let n = 0;
const trade = (day: number, pnl: number, r: number | null = null, extra: Partial<Trade> = {}): Trade => {
  const at = new Date(Date.UTC(2026, 9, day, 10)).toISOString();
  return { id: `t${++n}`, symbol: 'EURUSD', side: 'long', openedAt: at, closedAt: at, entry: 1, exit: 1, size: 1, pnl, r, session: 'London', source: 'sync', ...extra };
};

describe('experiment plans', () => {
  it('describe the change and a first hypothesis in plain words', () => {
    expect(describeChange({ kind: 'skipSetup', setup: 'Breakout retest' })).toBe('Skip Breakout retest');
    expect(hypothesisFor({ kind: 'checkFor', word: 'early entry' }, 'perTrade')).toBe('Checking for “early entry” before I enter, my average per trade goes up.');
    expect(makePlan({ kind: 'followPlan' })).toMatchObject({ measure: 'perTrade', length: { kind: 'trades', value: 10 } });
  });
});

describe('baseline', () => {
  const history = Array.from({ length: 15 }, (_, i) => trade(i + 1, i % 3 === 0 ? -50 : 30, i % 3 === 0 ? -1 : 0.6));
  const start = new Date(Date.UTC(2026, 9, 20));

  it('uses the most recent trades before the start, as many as the experiment runs for (at least 10)', () => {
    const b = baselineFor(makePlan({ kind: 'followPlan' }), history, start);
    expect(b.count).toBe(10);
    expect(b.tradeIds).toEqual(history.slice(5).reverse().map((t) => t.id));
  });

  it('matches the rest of Proof’s numbers exactly', () => {
    const b = baselineFor(makePlan({ kind: 'followPlan' }), history, start);
    const st = computeStats(history.slice(5));
    expect(b.winRate).toBe(st.winRate);
    expect(b.perTradeR).toBe(st.avgR);
    expect(b.perTradeMoney).toBe(Math.round((st.pnl / st.count) * 100) / 100);
  });

  it('ignores trades after the start and open positions', () => {
    const later = trade(25, 999);
    const open = trade(19, 0, null, { status: 'open' });
    const b = baselineFor(makePlan({ kind: 'followPlan' }), [...history, later, open], start);
    expect(b.tradeIds).not.toContain(later.id);
    expect(b.tradeIds).not.toContain(open.id);
  });

  it('for a days-long experiment, uses the same number of days before (at least a week)', () => {
    const b = baselineFor(makePlan({ kind: 'followPlan' }, 'perTrade', { kind: 'days', value: 5 }), history, start);
    // 7 days before 20 Oct: 13th to 19th, but history ends on the 15th.
    expect(b.count).toBe(3);
  });

  it('reports an empty history honestly', () => {
    expect(snapshot([])).toEqual({ count: 0, winRate: 0, perTradeR: null, perTradeMoney: null, tradeIds: [] });
  });
});
