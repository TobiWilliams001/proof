import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { rulesWeek } from './week';
import type { Rule } from './types';

let n = 0;
const trade = (openedAt: string, pnl = 10): Trade => ({
  id: `t${++n}`, symbol: 'EURUSD', side: 'long', openedAt, closedAt: new Date(Date.parse(openedAt) + 20 * 60_000).toISOString(), entry: 1, exit: 1, size: 1, pnl, r: null, session: 'London', source: 'sync',
});
const max2: Rule = { id: 'm', active: true, createdAt: '2026-09-01T00:00:00Z', kind: 'maxTrades', params: { max: 2 } };
const from = new Date('2026-10-05T00:00:00+01:00');
const to = new Date('2026-10-12T00:00:00+01:00');

describe('rules over a week', () => {
  it('counts kept and broken trading days, with the trades behind each break', () => {
    const mon = [trade('2026-10-05T08:00:00Z'), trade('2026-10-05T09:00:00Z')];
    const tue = [trade('2026-10-06T08:00:00Z'), trade('2026-10-06T09:00:00Z'), trade('2026-10-06T10:00:00Z')];
    const thu = [trade('2026-10-08T08:00:00Z')];
    const [w] = rulesWeek([max2], [...mon, ...tue, ...thu], from, to, 'Europe/London');
    expect(w.kept).toEqual(['2026-10-05', '2026-10-08']);
    expect(w.broken).toEqual([{ day: '2026-10-06', tradeIds: [tue[2].id] }]);
  });

  it('does not count quiet days, or days before the rule existed', () => {
    const newer: Rule = { ...max2, createdAt: '2026-10-07T12:00:00Z' };
    const ts = [trade('2026-10-05T08:00:00Z'), trade('2026-10-05T09:00:00Z'), trade('2026-10-05T10:00:00Z'), trade('2026-10-09T08:00:00Z')];
    const [w] = rulesWeek([newer], ts, from, to, 'Europe/London');
    expect(w).toEqual({ ruleId: 'm', kept: ['2026-10-09'], broken: [] });
  });

  it('groups by the trader’s own days', () => {
    // 23:30 UTC on the 5th and 00:30 UTC on the 6th are both the 6th in Tokyo.
    const ts = [trade('2026-10-05T15:30:00Z'), trade('2026-10-05T16:30:00Z'), trade('2026-10-05T23:30:00Z')];
    const [tokyo] = rulesWeek([max2], ts, new Date('2026-10-05T00:00:00Z'), new Date('2026-10-12T00:00:00Z'), 'Asia/Tokyo');
    expect(tokyo.broken.map((b) => b.day)).toEqual(['2026-10-06']);
    // In New York all three are on the 5th: a third trade that day breaks the rule.
    const [ny] = rulesWeek([max2], ts, new Date('2026-10-05T00:00:00Z'), new Date('2026-10-12T00:00:00Z'), 'America/New_York');
    expect(ny.broken.map((b) => b.day)).toEqual(['2026-10-05']);
  });

  it('leaves out paused rules and rules with no trading days', () => {
    expect(rulesWeek([{ ...max2, active: false }], [trade('2026-10-05T08:00:00Z')], from, to, 'Europe/London')).toEqual([]);
    expect(rulesWeek([max2], [], from, to, 'Europe/London')).toEqual([]);
  });
});

it('feeds detected breaks into the week’s plan adherence, so the review never contradicts itself', async () => {
  const { buildWeeklyReview } = await import('../review');
  const ts = [trade('2026-10-06T08:00:00Z'), trade('2026-10-06T09:00:00Z'), trade('2026-10-06T10:00:00Z'), trade('2026-10-07T10:00:00Z')];
  const broken = rulesWeek([max2], ts, from, to, 'Europe/London').flatMap((w) => w.broken.flatMap((b) => b.tradeIds));
  const r = buildWeeklyReview(ts, [], new Date('2026-10-07T12:00:00Z'), false, broken);
  expect(r).toMatchObject({ brokenCount: 1, adherence: 0.75, adherenceSource: 'rule_breaks' });
});
