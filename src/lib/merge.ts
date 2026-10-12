import type { JournalData } from './types';

function unionBy<T>(mine: T[] = [], theirs: T[] = [], key: (x: T) => string): T[] {
  const seen = new Set(mine.map(key));
  return [...mine, ...theirs.filter((x) => !seen.has(key(x)))];
}

/**
 * Two devices wrote to the same journal. Nothing either one added is lost:
 * lists are joined by id, and where both have the same item, this device wins.
 * Settings (playbook, units, profile) come from this device.
 */
export function mergeJournals(mine: JournalData, theirs: JournalData): JournalData {
  return {
    ...theirs,
    ...mine,
    trades: unionBy(mine.trades, theirs.trades, (t) => t.id).sort((a, b) => b.closedAt.localeCompare(a.closedAt)),
    entries: unionBy(mine.entries, theirs.entries, (e) => e.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    questions: unionBy(mine.questions, theirs.questions, (q) => q.id),
    reviews: unionBy(mine.reviews, theirs.reviews, (r) => r.weekStart),
    accounts: unionBy(mine.accounts, theirs.accounts, (a) => a.localId),
  };
}
