import { addDays, startOfWeek } from './dates';
import { fmt } from './format';
import { matchTags } from './structure';
import { computeStats, groupStats, outcomeOf } from './stats';
import { congruence } from './tools';
import { closedOnly, isOpen, type Entry, type Playbook, type Trade } from './types';

/**
 * "The AI speaks first" (brief §4, weekly review). Every sentence is assembled
 * from computed facts and carries the trades and notes behind it, so nothing
 * is said that the data can't show.
 */

export interface CoachLine {
  text: string;
  tradeIds: string[];
  entryIds: string[];
  kind: 'summary' | 'pattern' | 'compare' | 'discipline' | 'missed' | 'suggestion';
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const spell = (n: number) => (n === 2 ? 'Both' : `All ${n}`);

export function buildCoachNote(
  allTrades: Trade[],
  entries: Entry[],
  playbook: Playbook,
  anyDayInWeek: Date,
): CoachLine[] {
  const start = startOfWeek(anyDayInWeek);
  const end = addDays(start, 7);
  const inWeek = (iso: string) => iso >= start.toISOString() && iso < end.toISOString();
  const trades = closedOnly(allTrades).filter((t) => inWeek(t.closedAt));
  const stillOpen = allTrades.filter((t) => isOpen(t) && inWeek(t.openedAt));
  const weekEntries = entries.filter((e) => inWeek(e.createdAt));
  const lines: CoachLine[] = [];
  let suggestion: CoachLine | null = null;

  // 1 — What happened.
  const st = computeStats(trades);
  if (st.count) {
    const parts = [st.wins && `${st.wins} won`, st.losses && `${st.losses} lost`, st.breakeven && `${st.breakeven} broke even`].filter(Boolean);
    const open = stillOpen.length ? `, and ${count(stillOpen.length, 'position')} still open` : '';
    const flat = st.rCount ? Math.abs(st.totalR) < 0.05 : Math.abs(st.pnl) < 0.01;
    const net = flat
      ? 'flat'
      : st.rCount
        ? `${st.totalR > 0 ? 'up' : 'down'} ${fmt.r(st.totalR).replace(/^[+−]/, '')}`
        : `${st.pnl > 0 ? 'up' : 'down'} ${fmt.money(Math.abs(st.pnl))}`;
    lines.push({
      kind: 'summary',
      text: `This week you took ${count(st.count, 'trade')} — ${parts.join(', ')}${open}. You finished ${net}.`,
      tradeIds: trades.map((t) => t.id),
      entryIds: [],
    });
  } else if (stillOpen.length) {
    lines.push({ kind: 'summary', text: `No closed trades yet this week; ${count(stillOpen.length, 'position')} still open.`, tradeIds: [], entryIds: [] });
  } else {
    lines.push({ kind: 'summary', text: 'No trades this week.', tradeIds: [], entryIds: [] });
  }

  // 2 — A pattern in the trader's own words after losses.
  const losses = trades.filter((t) => outcomeOf(t) === 'loss');
  const lossNotes = weekEntries.filter((e) => e.tradeId && losses.some((t) => t.id === e.tradeId) && e.kind !== 'plan');
  const notedLosses = new Set(lossNotes.map((e) => e.tradeId));
  // Patterns come only from the trader's own vocabulary — their playbook tags, set on
  // the confirm card or written in a note kept as written. A tag only counts if it
  // separates losses from wins (judged against four weeks of wins, not one).
  const tagsIn = (e: Entry) =>
    new Set([...(e.structured?.tags ?? []), ...matchTags(e.text, playbook)].map((t) => t.toLowerCase()));
  const since = addDays(start, -21).toISOString();
  const winIds = new Set(closedOnly(allTrades).filter((t) => t.closedAt >= since && t.closedAt < end.toISOString() && outcomeOf(t) === 'win').map((t) => t.id));
  const winNotes = entries.filter((e) => e.tradeId && winIds.has(e.tradeId) && e.kind !== 'plan');
  const winShare = (tag: string) => (winNotes.length ? winNotes.filter((e) => tagsIn(e).has(tag)).length / winNotes.length : 0);
  const theme = playbook.tags
    .map((tag) => tag.toLowerCase())
    .map((tag) => {
      const hits = lossNotes.filter((e) => tagsIn(e).has(tag));
      return { word: tag, count: new Set(hits.map((e) => e.tradeId)).size, entryIds: hits.map((e) => e.id) };
    })
    .filter((t) => t.count >= 2 && t.count / notedLosses.size >= 0.5 && t.count / notedLosses.size - winShare(t.word) >= 0.35)
    .sort((x, y) => y.count - x.count)[0];
  if (theme) {
    const ids = theme.entryIds;
    const tradeIds = [...new Set(lossNotes.filter((e) => ids.includes(e.id)).map((e) => e.tradeId!))];
    const all = tradeIds.length === losses.length;
    lines.push({
      kind: 'pattern',
      text: all
        ? `${spell(tradeIds.length)} losses were tagged “${theme.word}” — you noted it yourself after each one.`
        : `${tradeIds.length} of your ${losses.length} losses were tagged “${theme.word}” in your own notes.`,
      tradeIds,
      entryIds: ids,
    });
    suggestion = { kind: 'suggestion', text: `Next week, check for “${theme.word}” before you enter.`, tradeIds, entryIds: ids };
  }

  // 3 — Setups compared over a longer window, so one week's noise doesn't decide it.
  const window = closedOnly(allTrades).filter((t) => t.closedAt >= addDays(start, -21).toISOString() && t.closedAt < end.toISOString());
  const setups = groupStats(window, 'setup').filter((g) => g.name !== 'Untagged' && g.stats.rCount >= 3 && g.stats.avgR != null);
  if (setups.length >= 2) {
    const ranked = [...setups].sort((a, b) => b.stats.avgR! - a.stats.avgR!);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    const gap = best.stats.avgR! - worst.stats.avgR!;
    if (gap >= 0.5) {
      lines.push({
        kind: 'compare',
        text: `Over the last four weeks, ${worst.name} has trailed ${best.name} by ${gap.toFixed(1)}R a trade on average (${fmt.r(worst.stats.avgR)} vs ${fmt.r(best.stats.avgR)}).`,
        tradeIds: [...best.trades, ...worst.trades].map((t) => t.id),
        entryIds: [],
      });
      suggestion ??= {
        kind: 'suggestion',
        text: `Consider favouring ${best.name} until the pattern shifts.`,
        tradeIds: best.trades.map((t) => t.id),
        entryIds: [],
      };
    }
  }

  // 4 — Discipline: the one-tap "did you follow your plan?" answers.
  const plan = congruence({ trades, entries });
  const answered = trades.filter((t) => plan.has(t.id));
  if (answered.length >= 2) {
    const kept = answered.filter((t) => plan.get(t.id));
    const broke = answered.filter((t) => !plan.get(t.id));
    let text = `You followed your plan on ${kept.length} of ${answered.length} trades.`;
    const keptR = computeStats(kept);
    const brokeR = computeStats(broke);
    if (broke.length && brokeR.rCount && keptR.rCount) {
      // Average against average, so the comparison is fair.
      text += ` When you didn’t, you averaged ${fmt.r(brokeR.avgR)} a trade; when you did, ${fmt.r(keptR.avgR)}.`;
      if (keptR.avgR != null && brokeR.avgR != null && keptR.avgR > brokeR.avgR) {
        suggestion ??= { kind: 'suggestion', text: 'Your plan is paying you — that’s the habit to protect next week.', tradeIds: kept.map((t) => t.id), entryIds: [] };
      }
    }
    lines.push({ kind: 'discipline', text, tradeIds: answered.map((t) => t.id), entryIds: [] });
  }

  // 5 — Trades not taken.
  const missed = weekEntries.filter((e) => e.kind === 'missed');
  if (missed.length) {
    const r = missed.reduce((s, e) => s + (e.structured?.r ?? 0), 0);
    lines.push({
      kind: 'missed',
      text: `You passed on ${count(missed.length, 'setup')}${r ? ` you said would’ve made ${fmt.r(r)}` : ''}.`,
      tradeIds: [],
      entryIds: missed.map((e) => e.id),
    });
  }

  if (suggestion) lines.push(suggestion);
  return lines;
}
