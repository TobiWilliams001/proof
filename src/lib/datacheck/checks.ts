import { fmt } from '../format';
import { closedOnly, isOpen, type JournalData, type Trade } from '../types';

/**
 * Keeps the journal trustworthy: finds doubled trades, missing stops, gaps in
 * history, and the things that make a journal useful (a plan on open trades,
 * a note on closed ones). Pure; it only ever suggests, and every fix waits
 * for the trader to confirm.
 */

export type IssueAction =
  | { kind: 'merge'; keep: string; remove: string[] }
  | { kind: 'reimport'; accountId: string; since: string }
  | { kind: 'go'; href: string; label: string };

export interface Issue {
  id: string;
  /** "fix" means the numbers may be wrong; "tidy" means the journal could be more useful. */
  severity: 'fix' | 'tidy';
  title: string;
  /** Why it matters, with an example where it helps. */
  detail: string;
  tradeIds: string[];
  action?: IssueAction;
}

const DAY = 864e5;
/** Recent enough that a missing note is still worth writing. */
const NOTE_WINDOW_DAYS = 7;
/** A quiet stretch must be this long, and this many times the usual gap, to count as a gap. */
const GAP_MIN_DAYS = 10;
const GAP_FACTOR = 4;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Which copy to keep: the one with more the trader would lose (notes, a stop, a setup, more deals). */
function richness(t: Trade, noteCount: number) {
  return noteCount * 10 + (t.stop != null ? 3 : 0) + (t.setup ? 2 : 0) + (t.platform?.dealIds?.length ?? 0);
}

export function findDuplicates(data: Pick<JournalData, 'trades' | 'entries'>): Issue[] {
  const notes = new Map<string, number>();
  for (const e of data.entries) if (e.tradeId) notes.set(e.tradeId, (notes.get(e.tradeId) ?? 0) + 1);
  const issues: Issue[] = [];
  const groups = new Map<string, Trade[]>();

  for (const t of data.trades) {
    // The platform's position number is the true identity. Without one, the
    // same symbol, side, times and result is almost certainly a double import.
    const key = t.platform
      ? `p|${t.accountId ?? ''}|${t.platform.positionId}`
      : `m|${t.symbol}|${t.side}|${t.openedAt.slice(0, 16)}|${t.closedAt.slice(0, 16)}|${t.pnl}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  for (const [key, ts] of groups) {
    if (ts.length < 2) continue;
    const [keep, ...rest] = [...ts].sort((a, b) => richness(b, notes.get(b.id) ?? 0) - richness(a, notes.get(a.id) ?? 0));
    const sure = key.startsWith('p|');
    issues.push({
      id: `dup:${key}`,
      severity: 'fix',
      title: `${keep.symbol} ${keep.side} on ${fmt.date(keep.closedAt)} is in your journal ${ts.length === 2 ? 'twice' : `${ts.length} times`}`,
      detail: sure
        ? 'Same position number from your platform, so your totals count it more than once. Merging keeps one copy and moves any notes onto it.'
        : 'Same pair, side, times and result, which usually means a file was imported twice. Merge if it’s one trade; leave it if you really took two.',
      tradeIds: ts.map((t) => t.id),
      action: { kind: 'merge', keep: keep.id, remove: rest.map((t) => t.id) },
    });
  }
  return issues;
}

export function findMissingStops(trades: Trade[]): Issue[] {
  const missing = closedOnly(trades).filter((t) => t.source === 'sync' && t.stop == null && t.r == null);
  if (!missing.length) return [];
  return [
    {
      id: 'nostop',
      severity: 'tidy',
      title: `${plural(missing.length, 'trade')} had no stop loss when ${missing.length === 1 ? 'it' : 'they'} opened`,
      detail: 'Without a stop, Proof can’t tell what you risked, so those trades show money but no R. Nothing is wrong with the money figures.',
      tradeIds: missing.map((t) => t.id),
    },
  ];
}

/**
 * A stretch with no trades that's much longer than the trader's usual gap.
 * It may be a holiday; it may be a sync that missed a period. The trader decides.
 */
export function findGaps(trades: Trade[], accountId?: string): Issue[] {
  const days = [...new Set(closedOnly(trades).filter((t) => !accountId || t.accountId === accountId).map((t) => t.closedAt.slice(0, 10)))].sort();
  if (days.length < 8) return [];
  const gaps = days.slice(1).map((d, i) => ({ from: days[i], to: d, len: (Date.parse(d) - Date.parse(days[i])) / DAY }));
  const usual = [...gaps].sort((a, b) => a.len - b.len)[Math.floor(gaps.length / 2)].len;
  return gaps
    .filter((g) => g.len >= GAP_MIN_DAYS && g.len >= usual * GAP_FACTOR)
    .map((g) => {
      const since = new Date(Date.parse(g.from) + DAY).toISOString();
      return {
        id: `gap:${accountId ?? 'all'}:${g.from}`,
        severity: 'fix' as const,
        title: `No trades from ${fmt.date(since)} to ${fmt.date(new Date(Date.parse(g.to) - DAY).toISOString())}`,
        detail: 'If you were away, that’s fine. If you traded then, those trades are missing and your totals are off.',
        tradeIds: [],
        action: accountId ? ({ kind: 'reimport', accountId, since } as const) : undefined,
      };
    });
}

/** The things that make a journal worth having: a plan before, a note after, a setup on each trade. */
export function findHealth(data: Pick<JournalData, 'trades' | 'entries' | 'playbook'>, now: Date): Issue[] {
  const issues: Issue[] = [];
  const planned = new Set(data.entries.filter((e) => e.kind === 'plan' && e.tradeId).map((e) => e.tradeId));
  const noted = new Set(data.entries.filter((e) => e.kind !== 'plan' && e.tradeId).map((e) => e.tradeId));

  const openNoPlan = data.trades.filter((t) => isOpen(t) && !planned.has(t.id));
  if (openNoPlan.length) {
    issues.push({
      id: 'noplan',
      severity: 'tidy',
      title: `${plural(openNoPlan.length, 'open trade')} ${openNoPlan.length === 1 ? 'has' : 'have'} no plan yet`,
      detail: 'Writing the plan before the result is known is what lets Proof show you later whether you followed it. For example: “Short below 1.2650, out if it closes back above.”',
      tradeIds: openNoPlan.map((t) => t.id),
      action: { kind: 'go', href: '/journal', label: 'Add a plan' },
    });
  }

  const cutoff = new Date(now.getTime() - NOTE_WINDOW_DAYS * DAY).toISOString();
  const noNote = closedOnly(data.trades).filter((t) => t.closedAt >= cutoff && !noted.has(t.id));
  if (noNote.length) {
    issues.push({
      id: 'nonote',
      severity: 'tidy',
      title: `${plural(noNote.length, 'trade')} this week ${noNote.length === 1 ? 'has' : 'have'} no note`,
      detail: 'One line is enough, like “Entered early, held to target.” Notes are what let Proof spot your patterns.',
      tradeIds: noNote.map((t) => t.id),
      action: { kind: 'go', href: '/journal', label: 'Write notes' },
    });
  }

  if (!data.playbook.setups.length) {
    if (data.trades.length) {
      issues.push({
        id: 'noplaybook',
        severity: 'tidy',
        title: 'Your playbook is empty',
        detail: 'Describe how you trade in a sentence or two, like “2-touch and 3-touch at value areas on the 1H”, and Proof sorts every note into your own setups.',
        tradeIds: [],
        action: { kind: 'go', href: '/playbook', label: 'Describe your trading' },
      });
    }
  } else {
    const withSetup = new Set(data.entries.filter((e) => e.tradeId && e.structured?.setup).map((e) => e.tradeId));
    const recent = closedOnly(data.trades).filter((t) => t.closedAt >= cutoff);
    const noSetup = recent.filter((t) => !t.setup && !withSetup.has(t.id));
    // Only worth saying when it's most of them; a few untagged trades are normal.
    if (noSetup.length >= 3 && noSetup.length >= recent.length / 2) {
      issues.push({
        id: 'nosetup',
        severity: 'tidy',
        title: `${plural(noSetup.length, 'trade')} this week ${noSetup.length === 1 ? 'has' : 'have'} no setup`,
        detail: 'Naming the setup in your note, like “clean 3-touch”, is how Proof tells you which setups make you money.',
        tradeIds: noSetup.map((t) => t.id),
        action: { kind: 'go', href: '/journal', label: 'Write notes' },
      });
    }
  }
  return issues;
}

/** Everything, numbers first: a wrong total matters more than a missing note. */
export function checkJournal(data: Pick<JournalData, 'trades' | 'entries' | 'playbook' | 'accounts'>, now: Date): Issue[] {
  const accounts = data.accounts ?? [];
  const gaps = accounts.length ? accounts.flatMap((a) => findGaps(data.trades, a.localId)) : findGaps(data.trades);
  return [...findDuplicates(data), ...gaps, ...findMissingStops(data.trades), ...findHealth(data, now)];
}

/**
 * Merges copies of one trade into the kept copy; notes on the others move
 * onto it. Copies can share an id (the same position imported twice), so
 * extra copies are dropped by position in the list, not only by id.
 */
export function applyMerge(data: Pick<JournalData, 'trades' | 'entries'>, keep: string, remove: string[]) {
  const gone = new Set(remove.filter((id) => id !== keep));
  let kept = false;
  const trades = data.trades.filter((t) => {
    if (t.id === keep) {
      if (kept) return false;
      kept = true;
      return true;
    }
    return !gone.has(t.id);
  });
  const entries = data.entries.map((e) => (e.tradeId && gone.has(e.tradeId) ? { ...e, tradeId: keep } : e));
  return { trades, entries };
}
