import { addDays, startOfWeek } from './dates';
import { fmt } from './format';
import { matchTags } from './structure';
import { computeStats, confidenceFor, groupStats, outcomeOf, type Confidence } from './stats';
import { congruence } from './tools';
import { showResult, type Units } from './units';
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
  /** How much the finding can be trusted, from how many trades it rests on. */
  confidence?: Confidence;
}

const avgR = (ts: Trade[]) => ts.reduce((s, t) => s + (t.r ?? 0), 0);
/** Proof suggests experiments, never orders, and only on findings worth testing. */
const worthTesting = (c?: Confidence) => !!c && c !== 'not enough data';

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const spell = (n: number) => (n === 2 ? 'Both' : `All ${n}`);

export function buildCoachNote(
  allTrades: Trade[],
  entries: Entry[],
  playbook: Playbook,
  anyDayInWeek: Date,
  units: Units = 'r',
): CoachLine[] {
  // Results in the trader's units: money by default in the app, R for risk-sizers.
  const res = (r: number | null | undefined, money: number | null | undefined) => showResult(units, r, money);
  const avgMoney = (st: { pnl: number; count: number }) => (st.count ? st.pnl / st.count : null);
  const useR = units === 'r';
  const start = startOfWeek(anyDayInWeek);
  const end = addDays(start, 7);
  const inWeek = (iso: string) => iso >= start.toISOString() && iso < end.toISOString();
  const trades = closedOnly(allTrades).filter((t) => inWeek(t.closedAt));
  const stillOpen = allTrades.filter((t) => isOpen(t) && inWeek(t.openedAt));
  const weekEntries = entries.filter((e) => inWeek(e.createdAt));
  const lines: CoachLine[] = [];
  let suggestion: CoachLine | null = null;

  // 1, What happened.
  const st = computeStats(trades);
  if (st.count) {
    const parts = [st.wins && `${st.wins} won`, st.losses && `${st.losses} lost`, st.breakeven && `${st.breakeven} ended flat`].filter(Boolean);
    const open = stillOpen.length ? `, and ${count(stillOpen.length, 'position')} still open` : '';
    const inR = useR && st.rCount > 0;
    const flat = inR ? Math.abs(st.totalR) < 0.05 : Math.abs(st.pnl) < 0.01;
    const net = flat
      ? 'flat'
      : inR
        ? `${st.totalR > 0 ? 'up' : 'down'} ${fmt.r(st.totalR).replace(/^[+−]/, '')}`
        : `${st.pnl > 0 ? 'up' : 'down'} ${fmt.money(Math.abs(st.pnl))}${units === 'both' && st.rCount ? ` (${fmt.r(st.totalR)})` : ''}`;
    lines.push({
      kind: 'summary',
      text: `This week you took ${count(st.count, 'trade')}: ${parts.join(', ')}${open}. You finished ${net}.`,
      tradeIds: trades.map((t) => t.id),
      entryIds: [],
    });
  } else if (stillOpen.length) {
    lines.push({ kind: 'summary', text: `No closed trades yet this week; ${count(stillOpen.length, 'position')} still open.`, tradeIds: [], entryIds: [] });
  } else {
    lines.push({ kind: 'summary', text: 'No trades this week.', tradeIds: [], entryIds: [] });
  }

  // 2, A pattern in the trader's own words after losses.
  const losses = trades.filter((t) => outcomeOf(t) === 'loss');
  const lossNotes = weekEntries.filter((e) => e.tradeId && losses.some((t) => t.id === e.tradeId) && e.kind !== 'plan');
  const notedLosses = new Set(lossNotes.map((e) => e.tradeId));
  // Patterns come only from the trader's own vocabulary, their playbook tags, set on
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
    const confidence = confidenceFor(trades.filter((t) => tradeIds.includes(t.id)));
    lines.push({
      confidence,
      kind: 'pattern',
      text: all
        ? `${spell(tradeIds.length)} losses were tagged “${theme.word}”. You noted it yourself after each one.`
        : `${tradeIds.length} of your ${losses.length} losses were tagged “${theme.word}” in your own notes.`,
      tradeIds,
      entryIds: ids,
    });
    if (worthTesting(confidence)) {
      suggestion = {
        kind: 'suggestion',
        text: `Try your next 10 trades checking for “${theme.word}” before you enter, and compare.`,
        tradeIds,
        entryIds: ids,
      };
    }
  }

  // 3, Setups compared over a longer window, so one week's noise doesn't decide it.
  const window = closedOnly(allTrades).filter((t) => t.closedAt >= addDays(start, -21).toISOString() && t.closedAt < end.toISOString());
  // Compared per trade, in R for risk-sizers or money otherwise.
  const perTrade = (g: { stats: { avgR: number | null; pnl: number; count: number } }) => (useR ? g.stats.avgR : avgMoney(g.stats));
  const setups = groupStats(window, 'setup').filter((g) => g.name !== 'Untagged' && (useR ? g.stats.rCount : g.stats.count) >= 3 && perTrade(g) != null);
  if (setups.length >= 2) {
    const ranked = [...setups].sort((a, b) => perTrade(b)! - perTrade(a)!);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    const gap = perTrade(best)! - perTrade(worst)!;
    // A meaningful gap: half a unit of risk, or (in money) a fifth of the bigger average.
    const meaningful = useR ? gap >= 0.5 : gap > 0 && gap >= 0.2 * Math.max(Math.abs(perTrade(best)!), Math.abs(perTrade(worst)!));
    if (meaningful) {
      // As sure as the smaller of the two samples, and only if the gap holds over time.
      const confidence = confidenceFor(worst.trades.length < best.trades.length ? worst.trades : best.trades, avgR);
      lines.push({
        confidence,
        kind: 'compare',
        text: `Over the last four weeks, ${worst.name} has trailed ${best.name} by ${useR ? `${gap.toFixed(1)}R` : fmt.money(gap)} a trade on average (${res(worst.stats.avgR, avgMoney(worst.stats))} vs ${res(best.stats.avgR, avgMoney(best.stats))}).`,
        tradeIds: [...best.trades, ...worst.trades].map((t) => t.id),
        entryIds: [],
      });
      if (worthTesting(confidence)) {
        suggestion ??= {
          kind: 'suggestion',
          text: `${worst.name}: ${worst.stats.wins} of ${worst.stats.count} won, ${res(worst.stats.rCount ? worst.stats.totalR : null, worst.stats.pnl)}. Try your next 10 trades without it and compare.`,
          tradeIds: worst.trades.map((t) => t.id),
          entryIds: [],
        };
      }
    }
  }

  // 4, Discipline: the one-tap "did you follow your plan?" answers.
  const plan = congruence({ trades, entries });
  const answered = trades.filter((t) => plan.has(t.id));
  if (answered.length >= 2) {
    const kept = answered.filter((t) => plan.get(t.id));
    const broke = answered.filter((t) => !plan.get(t.id));
    let text = `You followed your plan on ${kept.length} of ${answered.length} trades.`;
    const keptR = computeStats(kept);
    const brokeR = computeStats(broke);
    if (broke.length && (useR ? brokeR.rCount && keptR.rCount : true)) {
      // Average against average, so the comparison is fair.
      text += ` When you didn’t, you averaged ${res(brokeR.avgR, avgMoney(brokeR))} a trade; when you did, ${res(keptR.avgR, avgMoney(keptR))}.`;
    }
    const confidence = confidenceFor(answered);
    const keptBetter = useR ? keptR.avgR != null && brokeR.avgR != null && keptR.avgR > brokeR.avgR : (avgMoney(keptR) ?? 0) > (avgMoney(brokeR) ?? 0);
    if (keptBetter && broke.length && worthTesting(confidence)) {
      suggestion ??= {
        kind: 'suggestion',
        text: 'Try your next 10 trades taking only the ones that fit your plan, and compare.',
        tradeIds: answered.map((t) => t.id),
        entryIds: [],
      };
    }
    lines.push({ kind: 'discipline', text, tradeIds: answered.map((t) => t.id), entryIds: [], confidence });
  }

  // 5, Trades not taken.
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
