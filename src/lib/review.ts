import { addDays, startOfWeek, ymd } from './dates';
import { computeStats, groupStats, rDistribution, type Stats } from './stats';
import type { Entry, Trade } from './types';

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  stats: Stats;
  trades: Trade[];
  distribution: { bin: number; count: number }[];
  bestSetup?: { name: string; totalR: number; count: number };
  worstSetup?: { name: string; totalR: number; count: number };
  /** Share of trades that did NOT come with a rule-break note. */
  adherence: number | null;
  ruleBreaks: Entry[];
  missed: Entry[];
  missedR: number;
  plans: Entry[];
  reflections: Entry[];
  themes: { word: string; count: number; entryIds: string[] }[];
  journaled: number;
}

// Words that carry no signal about how the trader traded.
const STOP = new Set(
  `the a an and or but if then so to of in on at for with from by as is was were be been am are it its this that these those i me my we our you your he she they them their just very really too also not no yes did didnt dont do does done got get have had has would could should will can im ive id ill wasnt isnt into out up down over after before about than more less much some any one two three time trade trades took take taking entry entries setup today week day price went still again like kind bit lot came held made gave give left looked felt feel there which while because though little around back`.split(
    ' ',
  ),
);

export function themesFrom(entries: Entry[], limit = 6) {
  const counts = new Map<string, Set<string>>();
  for (const e of entries) {
    const tags = (e.structured?.tags ?? []).map((t) => t.toLowerCase());
    const words = new Set(
      e.text
        .toLowerCase()
        .replace(/[‘’']/g, '')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((w) => w.replace(/^-+|-+$/g, ''))
        // Keep "3-touch" whole; drop fragments, filler, and words a tag already covers.
        .filter((w) => w.length > 3 && /[a-z]/.test(w) && !STOP.has(w) && !tags.some((t) => t.includes(' ') && t.split(' ').includes(w))),
    );
    for (const tag of tags) words.add(tag);
    for (const w of words) counts.set(w, (counts.get(w) ?? new Set()).add(e.id));
  }
  return [...counts.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .map(([word, ids]) => ({ word, count: ids.size, entryIds: [...ids] }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

export function buildWeeklyReview(trades: Trade[], entries: Entry[], anyDayInWeek: Date): WeeklyReview {
  const start = startOfWeek(anyDayInWeek);
  const end = addDays(start, 7);
  const inWeek = (iso: string) => iso >= start.toISOString() && iso < end.toISOString();

  const weekTrades = trades.filter((t) => inWeek(t.closedAt));
  const weekEntries = entries.filter((e) => inWeek(e.createdAt));
  const ruleBreaks = weekEntries.filter((e) => e.kind === 'rule_break');
  const missed = weekEntries.filter((e) => e.kind === 'missed');

  // Only breaks tied to this week's trades (or unlinked ones written this week) count.
  const weekTradeIds = new Set(weekTrades.map((t) => t.id));
  const brokenTradeIds = new Set(ruleBreaks.map((e) => e.tradeId).filter((id) => id && weekTradeIds.has(id)));
  const unlinkedBreaks = ruleBreaks.filter((e) => !e.tradeId).length;
  const broken = Math.min(weekTrades.length, brokenTradeIds.size + unlinkedBreaks);

  const setups = groupStats(weekTrades, 'setup').filter((g) => g.name !== 'Untagged');
  const toSummary = (g: (typeof setups)[number] | undefined) =>
    g && { name: g.name, totalR: g.stats.totalR, count: g.stats.count };

  const notedTradeIds = new Set(weekEntries.map((e) => e.tradeId).filter(Boolean));

  return {
    weekStart: ymd(start),
    weekEnd: ymd(addDays(end, -1)),
    stats: computeStats(weekTrades),
    trades: weekTrades.sort((a, b) => a.closedAt.localeCompare(b.closedAt)),
    distribution: rDistribution(weekTrades),
    bestSetup: toSummary(setups[0]),
    worstSetup: setups.length > 1 ? toSummary(setups.at(-1)) : undefined,
    adherence: weekTrades.length ? (weekTrades.length - broken) / weekTrades.length : null,
    ruleBreaks,
    missed,
    missedR: missed.reduce((sum, e) => sum + (e.structured?.r ?? 0), 0),
    plans: weekEntries.filter((e) => e.kind === 'plan'),
    reflections: weekEntries.filter((e) => e.kind === 'reflection'),
    themes: themesFrom(weekEntries),
    journaled: weekTrades.filter((t) => notedTradeIds.has(t.id)).length,
  };
}
