import { describe, expect, it } from 'vitest';
import { cleanBrokerSymbol, dealsToTrades, positionsToOpenTrades, type MtDeal } from './mt-map';

const deal = (over: Partial<MtDeal>): MtDeal => ({
  id: Math.random().toString(36).slice(2),
  type: 'DEAL_TYPE_BUY',
  entryType: 'DEAL_ENTRY_IN',
  symbol: 'EURUSD',
  positionId: 'p1',
  volume: 1,
  price: 1.1,
  profit: 0,
  commission: 0,
  swap: 0,
  time: '2026-10-06T08:00:00.000Z',
  platform: 'mt5',
  ...over,
});
const opts = { accountId: 'acc' };

describe('MT deals → trades', () => {
  it('rolls partial closes into one trade with net P&L including commission and swap', () => {
    const { trades } = dealsToTrades(
      [
        deal({ id: 'd1', volume: 1, price: 1.1, commission: -3.5, stopLoss: 1.095 }),
        deal({ id: 'd2', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', volume: 0.4, price: 1.105, profit: 20, commission: -1.4, time: '2026-10-06T09:00:00.000Z' }),
        deal({ id: 'd3', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', volume: 0.6, price: 1.11, profit: 60, commission: -2.1, swap: -0.8, time: '2026-10-06T11:00:00.000Z' }),
      ],
      opts,
    );
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.id).toBe('mt_acc_p1');
    expect(t.side).toBe('long');
    expect(t.pnl).toBe(72.2); // 20 + 60 − 3.5 − 1.4 − 2.1 − 0.8
    expect(t.exit).toBeCloseTo(1.108, 6); // volume-weighted
    expect(t.r).toBeCloseTo(1.6, 2); // (1.108 − 1.1) / (1.1 − 1.095)
    expect(t.closedAt).toBe('2026-10-06T11:00:00.000Z');
    expect(t.platform?.dealIds).toEqual(['d1', 'd2', 'd3']);
  });

  it('leaves a partly closed position open', () => {
    const { trades } = dealsToTrades(
      [deal({ volume: 1 }), deal({ type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', volume: 0.5, profit: 10, time: '2026-10-06T09:00:00.000Z' })],
      opts,
    );
    expect(trades).toHaveLength(0);
  });

  it('asks for the opening deal when only the close was in range', () => {
    const r = dealsToTrades([deal({ entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_SELL', profit: 5 })], opts);
    expect(r.missingEntry).toEqual(['p1']);
  });

  it('ignores balance, credit and commission rows', () => {
    const { trades } = dealsToTrades([deal({ type: 'DEAL_TYPE_BALANCE', positionId: undefined, profit: 10000 })], opts);
    expect(trades).toHaveLength(0);
  });

  it('splits a reversal into the trade it closed and a new opposite trade', () => {
    const ds = [
      deal({ id: 'a', volume: 1, price: 1.1, commission: -3, stopLoss: 1.095 }),
      deal({ id: 'b', type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_INOUT', volume: 1.5, price: 1.11, profit: 100, commission: -4.5, time: '2026-10-06T09:00:00.000Z' }),
      deal({ id: 'c', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_OUT', volume: 0.5, price: 1.105, profit: 25, commission: -1.5, time: '2026-10-06T10:00:00.000Z' }),
    ];
    const { trades } = dealsToTrades(ds, opts);
    expect(trades).toHaveLength(2);
    const [long, short] = trades;
    expect(long).toMatchObject({ id: 'mt_acc_p1', side: 'long', pnl: 94, size: 1 }); // 100 − 3 − 4.5×(1/1.5)
    expect(short).toMatchObject({ id: 'mt_acc_p1#b', side: 'short', pnl: 22, size: 0.5 }); // 25 − 1.5 − 4.5×(0.5/1.5)
    expect(short.r).toBeNull(); // no stop was set for the new side
  });

  it('handles shorts, and a reversal closes the position', () => {
    const { trades } = dealsToTrades(
      [
        deal({ type: 'DEAL_TYPE_SELL', price: 2340, symbol: 'XAUUSD.r', stopLoss: 2345 }),
        deal({ type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_INOUT', price: 2330, volume: 2, profit: 100, time: '2026-10-06T09:00:00.000Z' }),
      ],
      opts,
    );
    expect(trades[0]).toMatchObject({ side: 'short', symbol: 'XAUUSD', pnl: 100, r: 2 });
  });

  it('never uses MT4’s latest stop for R — only a stop seen when the trade opened', () => {
    const mt4 = (o: Partial<MtDeal>) => deal({ platform: 'mt4', ...o });
    const ds = [mt4({ stopLoss: 1.1 }), mt4({ type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', price: 1.11, profit: 100, time: '2026-10-06T09:00:00.000Z' })];
    expect(dealsToTrades(ds, opts).trades[0].r).toBeNull(); // stop was trailed to breakeven
    expect(dealsToTrades(ds, { ...opts, sightedStops: { p1: 1.095 } }).trades[0].r).toBe(2);
  });
});

describe('MT open positions', () => {
  it('keeps the first stop seen, even after it is trailed', () => {
    const [t] = positionsToOpenTrades(
      [{ id: 'p9', type: 'POSITION_TYPE_SELL', symbol: 'GBPUSDm', time: '2026-10-06T08:00:00.000Z', openPrice: 1.265, stopLoss: 1.265, volume: 0.8 }],
      { accountId: 'acc', sightedStops: { p9: 1.268 } },
    );
    expect(t).toMatchObject({ id: 'mt_acc_p9', status: 'open', side: 'short', symbol: 'GBPUSD', stop: 1.268 });
  });
});

describe('broker symbol clean-up', () => {
  it.each([
    ['EURUSD.r', 'EURUSD'],
    ['EURUSDm', 'EURUSD'],
    ['XAUUSD+', 'XAUUSD'],
    ['GBPJPY_i', 'GBPJPY'],
    ['US30.cash', 'US30CASH'],
    ['NAS100', 'NAS100'],
  ])('%s → %s', (raw, clean) => expect(cleanBrokerSymbol(raw)).toBe(clean));
});
