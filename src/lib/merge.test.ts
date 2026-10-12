import { describe, expect, it } from 'vitest';
import { mergeJournals } from './merge';
import { emptyJournal } from './storage';
import type { Entry, JournalData, Trade } from './types';

const trade = (id: string, closedAt: string, pnl = 10): Trade => ({
  id, symbol: 'EURUSD', side: 'long', openedAt: closedAt, closedAt, entry: 1, exit: 1, size: 1, pnl, r: null, session: 'London', source: 'manual',
});
const entry = (id: string, createdAt: string, text = id): Entry => ({ id, kind: 'reflection', text, createdAt });
const journal = (p: Partial<JournalData>): JournalData => ({ ...emptyJournal(), ...p });

describe('mergeJournals', () => {
  it('keeps what each device added', () => {
    const phone = journal({ entries: [entry('e1', '2026-10-01T10:00:00Z')], trades: [trade('t1', '2026-10-01T09:00:00Z')] });
    const laptop = journal({ entries: [entry('e2', '2026-10-02T10:00:00Z')], trades: [trade('t2', '2026-10-02T09:00:00Z')] });
    const m = mergeJournals(phone, laptop);
    expect(m.entries.map((e) => e.id)).toEqual(['e2', 'e1']);
    expect(m.trades.map((t) => t.id)).toEqual(['t2', 't1']);
  });

  it('prefers this device when both changed the same item', () => {
    const mine = journal({ entries: [entry('e1', '2026-10-01T10:00:00Z', 'edited here')] });
    const theirs = journal({ entries: [entry('e1', '2026-10-01T10:00:00Z', 'old')] });
    expect(mergeJournals(mine, theirs).entries[0].text).toBe('edited here');
  });

  it('keeps settings from this device', () => {
    const m = mergeJournals(journal({ units: 'r' }), journal({ units: 'money' }));
    expect(m.units).toBe('r');
  });
});
