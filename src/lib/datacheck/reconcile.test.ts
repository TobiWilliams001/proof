import { describe, expect, it } from 'vitest';
import { dealsToTrades, type MtDeal } from '../sync/mt-map';
import { mismatchText, platformPositions, reconcile } from './reconcile';

let n = 0;
const deal = (over: Partial<MtDeal>): MtDeal => ({
  id: `d${++n}`, type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_IN', symbol: 'EURUSD', positionId: 'p1', volume: 1, price: 1.1, profit: 0, commission: -3.5, swap: 0, time: '2026-10-06T08:00:00Z', platform: 'mt5', ...over,
});
const from = '2026-09-10T00:00:00Z';
const to = '2026-10-10T00:00:00Z';

// A month of activity: a plain trade, a partial close, a reversal, a swap held overnight,
// and one closed before the window (which neither side should count).
const deals: MtDeal[] = [
  deal({ positionId: 'a', time: '2026-10-01T08:00:00Z' }),
  deal({ positionId: 'a', entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_SELL', profit: 42.1, time: '2026-10-01T09:00:00Z' }),
  deal({ positionId: 'b', volume: 2, time: '2026-10-02T08:00:00Z' }),
  deal({ positionId: 'b', entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_SELL', volume: 1, profit: 10, time: '2026-10-02T09:00:00Z' }),
  deal({ positionId: 'b', entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_SELL', volume: 1, profit: -4, time: '2026-10-02T11:00:00Z' }),
  deal({ positionId: 'c', time: '2026-10-03T08:00:00Z' }),
  deal({ positionId: 'c', entryType: 'DEAL_ENTRY_INOUT', type: 'DEAL_TYPE_SELL', volume: 2, profit: 15, time: '2026-10-03T10:00:00Z' }),
  deal({ positionId: 'c', entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_BUY', volume: 1, profit: -6, time: '2026-10-03T12:00:00Z' }),
  // Opened late on the 5th UTC, which is already the 6th on a GMT+3 broker clock; held overnight.
  deal({ positionId: 'd', time: '2026-10-05T22:30:00Z' }),
  deal({ positionId: 'd', entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_SELL', profit: 20, swap: -1.27, time: '2026-10-06T07:00:00Z' }),
  deal({ positionId: 'old', time: '2026-09-01T08:00:00Z' }),
  deal({ positionId: 'old', entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_SELL', profit: 99, time: '2026-09-01T09:00:00Z' }),
];
const trades = dealsToTrades(deals, { accountId: 'acc' }).trades;
const check = { at: to, from, to, positions: platformPositions(deals, from, to) };

describe('reconciling with MetaTrader', () => {
  it('sums the platform side from raw deals, fees and swap included', () => {
    const byId = Object.fromEntries(check.positions.map((p) => [p.id, p.net]));
    expect(byId).toEqual({ a: 35.1, b: -4.5, c: -1.5, d: 11.73 });
  });

  it('matches when Proof imported everything, partial closes and reversals included', () => {
    const r = reconcile(trades, 'acc', check);
    expect(r).toMatchObject({ match: true, missing: [], extra: [], different: [], netDiff: 0, platformCount: 4, proofCount: 4 });
  });

  it('finds a missing trade and says how much it’s worth', () => {
    const r = reconcile(trades.filter((t) => t.platform?.positionId !== 'a'), 'acc', check);
    expect(r.match).toBe(false);
    expect(r.missing.map((p) => p.id)).toEqual(['a']);
    expect(r.netDiff).toBe(-35.1);
  });

  it('flags a doubled trade through the difference in result', () => {
    const doubled = [...trades, { ...trades.find((t) => t.platform?.positionId === 'd')! }];
    const r = reconcile(doubled, 'acc', check);
    expect(r.different).toEqual([{ id: 'd', proof: 23.46, platform: 11.73 }]);
    expect(r.netDiff).toBe(11.73);
  });

  it('flags a difference over one cent, and only over one cent', () => {
    const nudge = (by: number) => trades.map((t) => (t.platform?.positionId === 'a' ? { ...t, pnl: t.pnl + by } : t));
    expect(reconcile(nudge(0.02), 'acc', check)).toMatchObject({ match: false, netDiff: 0.02 });
    expect(reconcile(nudge(0.004), 'acc', check).match).toBe(true);
  });

  it('finds a trade in Proof that MetaTrader doesn’t have', () => {
    const ghost = { ...trades[0], id: 'mt_acc_zzz', platform: { positionId: 'zzz' }, closedAt: '2026-10-04T10:00:00Z' };
    expect(reconcile([...trades, ghost], 'acc', check).extra).toEqual(['zzz']);
  });

  it('ignores other accounts and trades outside the window', () => {
    const other = trades.map((t) => ({ ...t, id: `${t.id}_b`, accountId: 'other' }));
    expect(reconcile([...trades, ...other], 'acc', check).match).toBe(true);
  });
});

describe('what the banner says', () => {
  it('names what’s off and by how much', () => {
    const missing = reconcile(trades.filter((t) => t.platform?.positionId !== 'a'), 'acc', check);
    expect(mismatchText(missing, 'FTMO')).toBe('1 trade is missing from FTMO in the last 30 days.');
    const nudged = reconcile(trades.map((t) => (t.platform?.positionId === 'a' ? { ...t, pnl: t.pnl - 12.4 } : t)), 'acc', check);
    expect(mismatchText(nudged, 'FTMO')).toBe('Proof’s total for FTMO over the last 30 days is $12.40 lower than MetaTrader’s.');
  });
});
