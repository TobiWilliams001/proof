import type { Entry, Trade } from '../src/lib/types';

/**
 * Hand-written dataset for the Q&A eval. Expected answers in qa.eval.ts were
 * worked out by hand from these rows, not by running the code, so the eval
 * actually checks the maths instead of restating it.
 *
 * "Now" is Sat 10 Oct 2026, so "this week" = Mon 5 – Sun 11 Oct.
 */
export const NOW = new Date(2026, 9, 10, 12, 0);

const at = (m: number, d: number, h = 10) => new Date(2026, m - 1, d, h).toISOString();
const T = (id: string, m: number, d: number, symbol: string, side: 'long' | 'short', setup: string, r: number, pnl: number): Trade => ({
  id, symbol, side, setup, r, pnl,
  openedAt: at(m, d, 9), closedAt: at(m, d), entry: 1, exit: 1, size: 1, session: 'London', source: 'manual',
});

export const TRADES: Trade[] = [
  T('t1', 10, 6, 'EURUSD', 'long', '3-touch', 2.5, 250),
  T('t2', 10, 6, 'GBPJPY', 'short', '2-touch', -1, -100),
  T('t3', 10, 7, 'XAUUSD', 'long', 'Footprint', 1.5, 150),
  T('t4', 10, 8, 'GBPJPY', 'long', '3-touch', 3, 300),
  T('t5', 10, 9, 'EURUSD', 'short', 'Breakout retest', -1, -100),
  T('t6', 10, 9, 'GBPJPY', 'short', '2-touch', -0.5, -50),
  T('t7', 9, 15, 'EURUSD', 'long', '3-touch', -1, -100),
  T('t8', 9, 16, 'NAS100', 'long', 'Footprint', 2, 200),
  T('t9', 9, 22, 'GBPJPY', 'long', 'Breakout retest', -1.5, -150),
  T('t10', 9, 23, 'XAUUSD', 'short', '3-touch', 0, 0),
];

const E = (id: string, tradeId: string | undefined, text: string, tags: string[], kind: Entry['kind'] = 'trade_note'): Entry => ({
  id, kind, text, tradeId, createdAt: tradeId ? TRADES.find((t) => t.id === tradeId)!.closedAt : at(10, 8, 18),
  structured: { tags, fields: {} },
});

export const ENTRIES: Entry[] = [
  E('e1', 't2', 'Felt tired, forced it.', ['tired']),
  E('e2', 't6', 'Tired again and an early entry.', ['tired', 'early entry']),
  E('e3', 't9', 'Tired. Should have stayed flat.', ['tired']),
  E('e4', 't1', 'Patient, waited for the touch.', ['patient']),
  E('e5', 't5', 'Entered early before confirmation.', []),
  E('e6', undefined, 'Slept well, calm session.', [], 'reflection'),
];
