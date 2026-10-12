import { describe, expect, it } from 'vitest';
import { emptyJournal } from '../storage';
import { dealsToTrades, type MtDeal } from '../sync/mt-map';
import type { Entry, JournalData, Trade } from '../types';
import { applyMerge, checkJournal, findDuplicates, findGaps, findHealth, findMissingStops } from './checks';

let n = 0;
const trade = (closedAt: string, extra: Partial<Trade> = {}): Trade => ({
  id: `t${++n}`, symbol: 'EURUSD', side: 'long', openedAt: closedAt, closedAt, entry: 1, exit: 1, size: 1, pnl: 25, r: null, session: 'London', source: 'sync', ...extra,
});
const journal = (p: Partial<JournalData>): JournalData => ({ ...emptyJournal(), ...p });
const deal = (over: Partial<MtDeal>): MtDeal => ({
  id: `d${++n}`, type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_IN', symbol: 'EURUSD', positionId: 'p1', volume: 1, price: 1.1, profit: 0, commission: 0, swap: 0, time: '2026-10-06T08:00:00.000Z', platform: 'mt5', ...over,
});

describe('duplicates', () => {
  it('finds a deliberately duplicated position and offers a merge, keeping the copy with notes', () => {
    const a = trade('2026-10-06T10:00:00Z', { platform: { positionId: '777' }, accountId: 'acc' });
    const b = { ...a, id: 'copy' };
    const entries: Entry[] = [{ id: 'n', kind: 'trade_note', text: 'clean', tradeId: 'copy', createdAt: a.closedAt }];
    const [issue] = findDuplicates({ trades: [a, b], entries });
    expect(issue).toMatchObject({ severity: 'fix', action: { kind: 'merge', keep: 'copy', remove: [a.id] } });
    expect(issue.title).toMatch(/twice$/);
  });

  it('catches a file imported twice, and says it could be two real trades', () => {
    const a = trade('2026-10-06T10:00:00Z', { source: 'csv' });
    const b = { ...a, id: 'again' };
    const [issue] = findDuplicates({ trades: [a, b], entries: [] });
    expect(issue.detail).toMatch(/leave it if you really took two/);
  });

  it('does not flag the same position on two different accounts', () => {
    const a = trade('2026-10-06T10:00:00Z', { platform: { positionId: '1' }, accountId: 'a' });
    const b = trade('2026-10-06T10:00:00Z', { platform: { positionId: '1' }, accountId: 'b' });
    expect(findDuplicates({ trades: [a, b], entries: [] })).toEqual([]);
  });

  it('does not flag partial closes or a reversal from MetaTrader as duplicates', () => {
    const { trades } = dealsToTrades(
      [
        deal({ entryType: 'DEAL_ENTRY_IN', volume: 2, time: '2026-10-06T08:00:00Z' }),
        deal({ entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_SELL', volume: 1, profit: 10, time: '2026-10-06T09:00:00Z' }),
        deal({ entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_SELL', volume: 1, profit: 12, time: '2026-10-06T10:00:00Z' }),
        // A reversal on a netting account: closes the long and opens a short on the same position.
        deal({ positionId: 'p2', entryType: 'DEAL_ENTRY_IN', volume: 1, time: '2026-10-06T11:00:00Z' }),
        deal({ positionId: 'p2', entryType: 'DEAL_ENTRY_INOUT', type: 'DEAL_TYPE_SELL', volume: 2, profit: 5, time: '2026-10-06T12:00:00Z' }),
        deal({ positionId: 'p2', entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_BUY', volume: 1, profit: -3, time: '2026-10-06T13:00:00Z' }),
      ],
      { accountId: 'acc' },
    );
    expect(trades).toHaveLength(3);
    expect(findDuplicates({ trades, entries: [] })).toEqual([]);
  });

  it('does not treat a trade closing after the broker’s midnight as a second trade', () => {
    // Broker time is GMT+3; MetaTrader's UTC time is what Proof keys on, so one position stays one trade.
    const { trades } = dealsToTrades(
      [deal({ positionId: 'p9', time: '2026-10-06T20:30:00Z' }), deal({ positionId: 'p9', entryType: 'DEAL_ENTRY_OUT', type: 'DEAL_TYPE_SELL', profit: 8, time: '2026-10-06T21:30:00Z' })],
      { accountId: 'acc' },
    );
    expect(trades).toHaveLength(1);
    expect(Date.parse(trades[0].closedAt)).toBe(Date.parse('2026-10-06T21:30:00Z'));
    expect(findDuplicates({ trades: [...trades, ...trades.map((t) => ({ ...t }))], entries: [] })).toHaveLength(1);
  });
});

describe('missing stops', () => {
  it('counts synced trades with no stop and no R, and says the money is still right', () => {
    const ts = [trade('2026-10-06T10:00:00Z'), trade('2026-10-06T11:00:00Z', { stop: 1.09 }), trade('2026-10-06T12:00:00Z', { source: 'manual' })];
    const [issue] = findMissingStops(ts);
    expect(issue.tradeIds).toEqual([ts[0].id]);
    expect(issue.detail).toMatch(/Nothing is wrong with the money/);
  });
});

describe('gaps', () => {
  const daily = (from: number, count: number) => Array.from({ length: count }, (_, i) => trade(new Date(Date.UTC(2026, 8, from + i, 10)).toISOString(), { accountId: 'acc' }));

  it('finds a stretch much longer than the trader’s usual gap and offers to re-import it', () => {
    const ts = [...daily(1, 6), ...daily(20, 6)];
    const [gap] = findGaps(ts, 'acc');
    expect(gap.title).toBe('No trades from Sep 7 to Sep 19');
    expect(gap.action).toEqual({ kind: 'reimport', accountId: 'acc', since: '2026-09-07T00:00:00.000Z' });
  });

  it('stays quiet for an ordinary week off and for a short history', () => {
    expect(findGaps([...daily(1, 6), ...daily(14, 6)], 'acc')).toEqual([]);
    expect(findGaps(daily(1, 5), 'acc')).toEqual([]);
  });
});

describe('journal health', () => {
  const now = new Date('2026-10-08T12:00:00Z');

  it('asks for a plan on open trades, with an example', () => {
    const open = trade('2026-10-08T09:00:00Z', { status: 'open' });
    const [issue] = findHealth(journal({ trades: [open], playbook: { setups: [{ id: 's', name: '3-touch' }], tags: [], fields: [] } }), now);
    expect(issue).toMatchObject({ id: 'noplan', action: { kind: 'go', href: '/journal' } });
    expect(issue.detail).toMatch(/For example: “Short below 1.2650/);
  });

  it('counts this week’s trades with no note, not older ones', () => {
    const recent = trade('2026-10-07T10:00:00Z');
    const old = trade('2026-09-01T10:00:00Z');
    const noted = trade('2026-10-06T10:00:00Z');
    const entries: Entry[] = [{ id: 'e', kind: 'trade_note', text: 'ok', tradeId: noted.id, createdAt: noted.closedAt }];
    const issue = findHealth(journal({ trades: [recent, old, noted], entries, playbook: { setups: [{ id: 's', name: 'x' }], tags: [], fields: [] } }), now).find((i) => i.id === 'nonote');
    expect(issue?.tradeIds).toEqual([recent.id]);
  });

  it('suggests describing the playbook when there are trades but no setups', () => {
    expect(findHealth(journal({ trades: [trade('2026-09-01T10:00:00Z')] }), now).map((i) => i.id)).toContain('noplaybook');
  });

  it('only mentions missing setups when it’s most trades this week', () => {
    const pb = { setups: [{ id: 's', name: '3-touch' }], tags: [], fields: [] };
    const tagged = (d: string) => trade(d, { setup: '3-touch' });
    const few = [tagged('2026-10-05T10:00:00Z'), tagged('2026-10-06T10:00:00Z'), tagged('2026-10-07T10:00:00Z'), trade('2026-10-07T11:00:00Z')];
    expect(findHealth(journal({ trades: few, playbook: pb }), now).map((i) => i.id)).not.toContain('nosetup');
    const most = [trade('2026-10-05T10:00:00Z'), trade('2026-10-06T10:00:00Z'), trade('2026-10-07T10:00:00Z'), tagged('2026-10-07T11:00:00Z')];
    expect(findHealth(journal({ trades: most, playbook: pb }), now).map((i) => i.id)).toContain('nosetup');
  });

  it('a well-kept journal has nothing to say', () => {
    const t = trade('2026-10-07T10:00:00Z', { setup: '3-touch', stop: 1.09 });
    const entries: Entry[] = [{ id: 'e', kind: 'trade_note', text: 'ok', tradeId: t.id, createdAt: t.closedAt }];
    expect(checkJournal(journal({ trades: [t], entries, playbook: { setups: [{ id: 's', name: '3-touch' }], tags: [], fields: [] } }), now)).toEqual([]);
  });
});

it('puts number problems before journal tidying', () => {
  const a = trade('2026-10-07T10:00:00Z', { platform: { positionId: '5' } });
  const issues = checkJournal(journal({ trades: [a, { ...a, id: 'b' }, trade('2026-10-08T09:00:00Z', { status: 'open' })] }), new Date('2026-10-08T12:00:00Z'));
  expect(issues[0].severity).toBe('fix');
  expect(issues.at(-1)!.severity).toBe('tidy');
});

describe('merging duplicates', () => {
  it('keeps one copy and moves notes from the others onto it', () => {
    const a = trade('2026-10-06T10:00:00Z');
    const b = { ...a, id: 'copy' };
    const other = trade('2026-10-07T10:00:00Z');
    const entries: Entry[] = [{ id: 'n', kind: 'trade_note', text: 'x', tradeId: 'copy', createdAt: a.closedAt }];
    const r = applyMerge({ trades: [a, b, other], entries }, a.id, ['copy']);
    expect(r.trades.map((t) => t.id)).toEqual([a.id, other.id]);
    expect(r.entries[0].tradeId).toBe(a.id);
  });

  it('handles copies that share the same id', () => {
    const a = trade('2026-10-06T10:00:00Z');
    expect(applyMerge({ trades: [a, { ...a }], entries: [] }, a.id, [a.id]).trades).toHaveLength(1);
  });
});
