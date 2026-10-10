import type { Entry, Trade } from './types';

const HOUR = 3600_000;

/**
 * Sync is periodic, so a trader often writes about a trade before it arrives.
 * When trades land, attach unlinked notes that name the same symbol and were
 * written while the trade was live (or shortly after it closed). A note is only
 * linked when exactly one new trade fits — ambiguity stays unlinked, never guessed.
 */
export function linkEarlyNotes(entries: Entry[], arrived: Trade[]): Entry[] {
  return entries.map((e) => {
    if (e.tradeId || !e.structured?.symbol || (e.kind !== 'trade_note' && e.kind !== 'rule_break' && e.kind !== 'plan')) return e;
    const at = new Date(e.createdAt).getTime();
    const fits = arrived.filter((t) => {
      if (t.symbol !== e.structured!.symbol) return false;
      const opened = new Date(t.openedAt).getTime();
      const closed = new Date(t.closedAt).getTime();
      // Plans belong before or at the open; notes during the trade or within six hours after.
      return e.kind === 'plan' ? at >= opened - 2 * HOUR && at <= closed : at >= opened - HOUR && at <= closed + 6 * HOUR;
    });
    return fits.length === 1 ? { ...e, tradeId: fits[0].id } : e;
  });
}
