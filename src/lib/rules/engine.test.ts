import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { checkRules, localDay, sessionsAt } from './engine';
import type { Rule, RuleBody } from './types';

const rule = (body: RuleBody, active = true): Rule => ({ id: body.kind, active, createdAt: '2026-01-01T00:00:00Z', ...body }) as Rule;
let n = 0;
const trade = (openedAt: string, closedAt: string, pnl: number, extra: Partial<Trade> = {}): Trade => ({
  id: `t${++n}`, symbol: 'EURUSD', side: 'long', openedAt, closedAt, entry: 1, exit: 1, size: 1, pnl, r: null, session: 'London', source: 'sync', ...extra,
});
const London = { timeZone: 'Europe/London' };
const at = (iso: string, tz = London) => ({ now: new Date(iso), ...tz });
const only = (rules: Rule[], trades: Trade[], clock: ReturnType<typeof at>) => checkRules(rules, trades, clock)[0];

describe('localDay', () => {
  it('uses the trader’s midnight, not UTC', () => {
    // 23:30 UTC on 1 Oct is already 2 Oct in Tokyo and still 1 Oct in New York.
    expect(localDay('2026-10-01T23:30:00Z', 'Asia/Tokyo').day).toBe('2026-10-02');
    expect(localDay('2026-10-01T23:30:00Z', 'America/New_York').day).toBe('2026-10-01');
  });
  it('gives the local weekday', () => {
    expect(localDay('2026-10-04T12:00:00Z', 'Europe/London').weekday).toBe(0); // Sunday
  });
});

describe('max trades a day', () => {
  const max2 = rule({ kind: 'maxTrades', params: { max: 2 } });

  it('is clear, then at the limit on the 2nd trade, then broken on the 3rd', () => {
    const t1 = trade('2026-10-05T08:00:00Z', '2026-10-05T09:00:00Z', 20);
    const t2 = trade('2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z', -10);
    const t3 = trade('2026-10-05T13:00:00Z', '2026-10-05T14:00:00Z', 5);
    const now = at('2026-10-05T15:00:00Z');
    expect(only([max2], [t1], now).state).toBe('clear');
    expect(only([max2], [t1, t2], now)).toMatchObject({ state: 'hit', used: 2, limit: 2 });
    expect(only([max2], [t1, t2, t3], now)).toMatchObject({ state: 'broken', used: 3, tradeIds: [t3.id] });
  });

  it('counts an open position as a trade taken', () => {
    const open = trade('2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z', 0, { status: 'open' });
    const done = trade('2026-10-05T08:00:00Z', '2026-10-05T09:00:00Z', 20);
    expect(only([max2], [done, open], at('2026-10-05T11:00:00Z')).state).toBe('hit');
  });

  it('only says "one left" when the limit is big enough for that to be news', () => {
    const max3 = rule({ kind: 'maxTrades', params: { max: 3 } });
    const ts = [trade('2026-10-05T08:00:00Z', '2026-10-05T09:00:00Z', 1), trade('2026-10-05T09:30:00Z', '2026-10-05T10:00:00Z', 1)];
    expect(only([max3], ts, at('2026-10-05T11:00:00Z')).state).toBe('near');
    expect(only([max2], ts.slice(0, 1), at('2026-10-05T11:00:00Z')).state).toBe('clear');
  });

  it('counts a trade spanning midnight on the day it was opened', () => {
    const late = trade('2026-10-04T22:50:00Z', '2026-10-04T23:10:00Z', -10); // 23:50 → 00:10 London (BST)
    const morning = trade('2026-10-05T08:00:00Z', '2026-10-05T09:00:00Z', 10);
    expect(only([max2], [late, morning], at('2026-10-05T12:00:00Z')).used).toBe(1);
  });

  it('starts fresh at the trader’s midnight, not UTC midnight', () => {
    // 01:00 in Tokyo on 6 Oct is 16:00 UTC on 5 Oct: a new day in Tokyo.
    const ts = [trade('2026-10-05T01:00:00Z', '2026-10-05T02:00:00Z', 1), trade('2026-10-05T03:00:00Z', '2026-10-05T04:00:00Z', 1)];
    expect(only([max2], ts, at('2026-10-05T16:00:00Z', { timeZone: 'Asia/Tokyo' })).used).toBe(0);
    expect(only([max2], ts, at('2026-10-05T16:00:00Z', { timeZone: 'UTC' })).used).toBe(2);
  });
});

describe('stop after losses in a row', () => {
  const two = rule({ kind: 'lossStreak', params: { max: 2 } });

  it('says nothing after one loss, then hits on the second', () => {
    const l1 = trade('2026-10-05T08:00:00Z', '2026-10-05T08:30:00Z', -10);
    const l2 = trade('2026-10-05T09:00:00Z', '2026-10-05T09:30:00Z', -10);
    expect(only([two], [l1], at('2026-10-05T10:00:00Z')).state).toBe('clear');
    expect(only([two], [l1, l2], at('2026-10-05T10:00:00Z'))).toMatchObject({ state: 'hit', used: 2 });
  });

  it('resets the run on a win', () => {
    const ts = [
      trade('2026-10-05T08:00:00Z', '2026-10-05T08:30:00Z', -10),
      trade('2026-10-05T09:00:00Z', '2026-10-05T09:30:00Z', 15),
      trade('2026-10-05T10:00:00Z', '2026-10-05T10:30:00Z', -10),
    ];
    expect(only([two], ts, at('2026-10-05T11:00:00Z')).state).toBe('clear');
  });

  it('is broken by any trade opened after the limit, even a winner', () => {
    const l1 = trade('2026-10-05T08:00:00Z', '2026-10-05T08:30:00Z', -10);
    const l2 = trade('2026-10-05T09:00:00Z', '2026-10-05T09:30:00Z', -10);
    const again = trade('2026-10-05T09:45:00Z', '2026-10-05T10:30:00Z', 40);
    expect(only([two], [l1, l2, again], at('2026-10-05T11:00:00Z'))).toMatchObject({ state: 'broken', tradeIds: [again.id] });
  });

  it('counts yesterday’s late loss toward today when it closed after midnight', () => {
    const overnight = trade('2026-10-04T22:40:00Z', '2026-10-04T23:20:00Z', -10); // closes 00:20 London
    const l2 = trade('2026-10-05T08:00:00Z', '2026-10-05T08:30:00Z', -10);
    expect(only([two], [overnight, l2], at('2026-10-05T09:00:00Z')).state).toBe('hit');
  });

  it('ignores yesterday’s losses', () => {
    const y = trade('2026-10-04T10:00:00Z', '2026-10-04T11:00:00Z', -10);
    const t = trade('2026-10-05T08:00:00Z', '2026-10-05T08:30:00Z', -10);
    expect(only([two], [y, t], at('2026-10-05T09:00:00Z')).state).toBe('clear');
  });
});

describe('daily loss limit', () => {
  const money = rule({ kind: 'dailyLoss', params: { amount: 100, unit: 'money' } });

  it('is near at 80%, hit at the limit, broken by trading on', () => {
    const a = trade('2026-10-05T08:00:00Z', '2026-10-05T08:30:00Z', -85);
    const b = trade('2026-10-05T09:00:00Z', '2026-10-05T09:30:00Z', -20);
    const c = trade('2026-10-05T10:00:00Z', '2026-10-05T10:30:00Z', 30);
    const now = at('2026-10-05T11:00:00Z');
    expect(only([money], [a], now)).toMatchObject({ state: 'near', used: 85 });
    expect(only([money], [a, b], now)).toMatchObject({ state: 'hit', used: 105 });
    expect(only([money], [a, b, c], now)).toMatchObject({ state: 'broken', tradeIds: [c.id] });
  });

  it('nets wins against losses', () => {
    const ts = [trade('2026-10-05T08:00:00Z', '2026-10-05T08:30:00Z', -90), trade('2026-10-05T09:00:00Z', '2026-10-05T09:30:00Z', 50)];
    expect(only([money], ts, at('2026-10-05T10:00:00Z'))).toMatchObject({ state: 'clear', used: 40 });
  });

  it('works in R, skipping trades with no known R', () => {
    const r = rule({ kind: 'dailyLoss', params: { amount: 2, unit: 'r' } });
    const ts = [
      trade('2026-10-05T08:00:00Z', '2026-10-05T08:30:00Z', -50, { r: -1 }),
      trade('2026-10-05T09:00:00Z', '2026-10-05T09:30:00Z', -50, { r: null }),
      trade('2026-10-05T10:00:00Z', '2026-10-05T10:30:00Z', -50, { r: -1 }),
    ];
    expect(only([r], ts, at('2026-10-05T11:00:00Z'))).toMatchObject({ state: 'hit', used: 2 });
  });

  it('ignores open positions until they close', () => {
    const open = trade('2026-10-05T08:00:00Z', '2026-10-05T08:00:00Z', -500, { status: 'open' });
    expect(only([money], [open], at('2026-10-05T09:00:00Z')).state).toBe('clear');
  });
});

describe('no trading in chosen sessions or days', () => {
  it('is broken by a trade opened in a blocked session', () => {
    const noNY = rule({ kind: 'noTrading', params: { sessions: ['New York'], days: [] } });
    const london = trade('2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z', 10);
    const ny = trade('2026-10-05T18:00:00Z', '2026-10-05T19:00:00Z', 10);
    expect(only([noNY], [london], at('2026-10-05T20:00:00Z')).state).toBe('clear');
    expect(only([noNY], [london, ny], at('2026-10-05T20:00:00Z'))).toMatchObject({ state: 'broken', tradeIds: [ny.id] });
  });

  it('treats the overlap as part of London and New York', () => {
    expect(sessionsAt('2026-10-05T13:00:00Z')).toEqual(expect.arrayContaining(['London', 'New York']));
    const noLondon = rule({ kind: 'noTrading', params: { sessions: ['London'], days: [] } });
    const overlap = trade('2026-10-05T13:00:00Z', '2026-10-05T14:00:00Z', 10);
    expect(only([noLondon], [overlap], at('2026-10-05T15:00:00Z')).state).toBe('broken');
  });

  it('is broken by a trade on a blocked weekday in the trader’s zone', () => {
    const noFriday = rule({ kind: 'noTrading', params: { sessions: [], days: [5] } });
    // 23:30 UTC Thursday is already Friday in Tokyo.
    const t = trade('2026-10-08T23:30:00Z', '2026-10-09T00:30:00Z', 10);
    expect(only([noFriday], [t], at('2026-10-09T02:00:00Z', { timeZone: 'Asia/Tokyo' })).state).toBe('broken');
    // Still Thursday evening in New York.
    expect(only([noFriday], [t], at('2026-10-08T23:45:00Z', { timeZone: 'America/New_York' })).state).toBe('clear');
  });
});

it('skips paused rules', () => {
  const paused = rule({ kind: 'maxTrades', params: { max: 1 } }, false);
  expect(checkRules([paused], [trade('2026-10-05T08:00:00Z', '2026-10-05T09:00:00Z', 1)], at('2026-10-05T10:00:00Z'))).toEqual([]);
});
