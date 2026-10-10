import { parsePeriod } from './dates';
import { fmt } from './format';
import type { GroupKey, Stats } from './stats';
import { detectSymbol, matchSetups } from './structure';
import {
  getGroupStats,
  getStats,
  searchNotes,
  type JournalContext,
  type ToolName,
  type TradeFilter,
} from './tools';
import type { Playbook, Session } from './types';

/**
 * Ask your journal: question → typed tool calls → computed answer.
 * The planner is deterministic today; the answer text is assembled only from
 * tool outputs, so every number shown can be traced to the cited trades.
 */

export type Metric = 'winRate' | 'pnl' | 'avgR' | 'totalR' | 'count';

export type Intent =
  | { type: 'stat'; metric: Metric; filter: TradeFilter; ofBest?: GroupKey }
  | { type: 'rank'; by: GroupKey; order: 'best' | 'worst'; filter: TradeFilter }
  | { type: 'noteCompare'; term: string; filter: TradeFilter }
  | { type: 'notes'; query: string; filter: TradeFilter }
  | { type: 'overview'; filter: TradeFilter };

export interface Answer {
  text: string;
  highlights: { label: string; value: string; tone?: 'pos' | 'neg' }[];
  tradeIds: string[];
  entryIds: string[];
  toolCalls: { tool: ToolName; args: unknown }[];
  scope: string;
  unsure?: boolean;
}

const METRICS: [Metric, RegExp][] = [
  ['winRate', /\b(win ?rate|hit rate|strike rate|win %|win percentage|how often do i win)\b/],
  ['avgR', /\b(average r|avg r|expectancy|r per trade|average return)\b/],
  ['totalR', /\b(total r|how much r|most r|r made|net r)\b/],
  ['pnl', /\b(p&l|p ?n ?l|profit|made|lost|money|dollars?|net)\b/],
  ['count', /\b(how many|number of|count)\b/],
];

const SESSIONS: [Session, RegExp][] = [
  ['London', /\blondon\b/],
  ['New York', /\b(new york|ny session|ny open|\bny\b)\b/],
  ['Asian', /\b(asia|asian|tokyo)\b/],
  ['Overlap', /\boverlap\b/],
];

/**
 * A quoted term — but an apostrophe inside "what's" or "I'm" is not a quote, so the
 * opening mark must start a word and the closing mark must end one.
 */
function quoted(q: string): string | undefined {
  return q.match(/(?:^|\s)['"“‘]([^'"”’]{2,40})['"”’](?=\s|[?.!,]|$)/)?.[1]?.trim();
}

export function parseQuestion(
  question: string,
  ctx: JournalContext,
  playbook: Playbook,
  now: Date,
): { intent: Intent; scope: string } {
  const q = question.toLowerCase().replace(/[‘’]/g, "'").replace(/[?!.]+$/, '');
  const filter: TradeFilter = {};
  const scopeParts: string[] = [];

  const period = parsePeriod(q, now);
  if (period) {
    filter.from = period.from;
    filter.to = period.to;
    scopeParts.push(period.label);
  }

  const symbol = detectSymbol(question);
  if (symbol) {
    filter.symbol = symbol;
    scopeParts.unshift(symbol);
  }

  // Match against both the playbook and setups seen on trades (e.g. imported).
  const knownSetups: Playbook = {
    ...playbook,
    setups: [
      ...playbook.setups,
      ...[...new Set(ctx.trades.map((t) => t.setup).filter(Boolean) as string[])]
        .filter((n) => !playbook.setups.some((s) => s.name.toLowerCase() === n.toLowerCase()))
        .map((name) => ({ id: name, name })),
    ],
  };
  const setups = matchSetups(question, knownSetups);
  if (setups.length === 1) {
    filter.setup = setups[0];
    scopeParts.unshift(setups[0]);
  }

  if (/\b(longs|long trades|long side|buys)\b/.test(q)) {
    filter.side = 'long';
    scopeParts.push('longs');
  } else if (/\b(shorts|short trades|short side|sells)\b/.test(q)) {
    filter.side = 'short';
    scopeParts.push('shorts');
  }

  for (const [s, re] of SESSIONS) {
    if (re.test(q)) {
      filter.session = s;
      scopeParts.push(`${s} session`);
      break;
    }
  }

  const scope = scopeParts.join(' · ') || 'all trades';

  // "What do I keep saying about early entries?"
  const aboutMatch = q.match(
    /\b(?:keep saying|say|said|write|wrote|written|notes?|mention(?:ed)?)\s+(?:about|on|regarding)\s+(.+)$/,
  );
  if (aboutMatch) {
    // The period ("last week") is a filter, not part of what was written.
    let query = aboutMatch[1].replace(/^(my|the)\s+/, '');
    if (period) query = query.replace(new RegExp(`\\b(in |during |over )?${period.label}\\b`), '');
    query = query.replace(/\b(today|yesterday|this week|last week|this month|last month|this year|(?:last|past) \d+ days?)\b/g, '').trim();
    return { intent: { type: 'notes', query: query || aboutMatch[1], filter }, scope };
  }

  // "How do I perform when I log 'tired'?"
  const term =
    quoted(question) ??
    // Longer alternatives first, or the bare "i" swallows "i log" / "i feel".
    q.match(/\bwhen (?:i log|i feel|i'm feeling|i tag(?:ged)?|tagged|i'm|i am|i)\s+(?:as\s+)?([a-z][a-z \-]{0,29}[a-z])(?=\s*[?.!,;]|$)/)?.[1]?.trim();
  if (term && /\b(perform|do i do|results?|win|when)\b/.test(q)) {
    return { intent: { type: 'noteCompare', term, filter }, scope };
  }

  const metric = METRICS.find(([, re]) => re.test(q))?.[0];
  const rankBy: GroupKey | undefined = /\bsetups?\b/.test(q)
    ? 'setup'
    : /\b(pairs?|symbols?|instruments?|markets?)\b/.test(q)
      ? 'symbol'
      : /\bsessions?\b/.test(q)
        ? 'session'
        : undefined;
  const order = /\b(worst|least|lowest|bleed|bleeds|cost|costs|losing the most|lose the most)\b/.test(q) ? 'worst' : 'best';

  // "What's my win rate on my best setup?" — resolve the best group, then stat it.
  if (metric && rankBy && /\b(best|worst|top)\b/.test(q) && !/\bwhich\b/.test(q)) {
    return { intent: { type: 'stat', metric, filter, ofBest: rankBy }, scope };
  }

  if (rankBy && !filter[rankBy as 'symbol' | 'setup' | 'session'] && /\b(which|best|worst|most|top|least)\b/.test(q)) {
    return { intent: { type: 'rank', by: rankBy, order, filter }, scope };
  }

  if (metric) return { intent: { type: 'stat', metric, filter }, scope };

  if (term) return { intent: { type: 'notes', query: term, filter }, scope };

  return { intent: { type: 'overview', filter }, scope };
}

function metricValue(m: Metric, s: Stats): string {
  switch (m) {
    case 'winRate': return fmt.pct(s.winRate);
    case 'pnl': return fmt.pnl(s.pnl);
    case 'avgR': return fmt.r(s.avgR);
    case 'totalR': return fmt.r(s.totalR);
    case 'count': return String(s.count);
  }
}

const METRIC_LABEL: Record<Metric, string> = {
  winRate: 'win rate',
  pnl: 'P&L',
  avgR: 'average R',
  totalR: 'total R',
  count: 'trade count',
};

function statHighlights(s: Stats): Answer['highlights'] {
  return [
    { label: 'Trades', value: String(s.count) },
    { label: 'Win rate', value: fmt.pct(s.winRate) },
    { label: 'Avg R', value: fmt.r(s.avgR), tone: (s.avgR ?? 0) >= 0 ? 'pos' : 'neg' },
    { label: 'P&L', value: fmt.pnl(s.pnl), tone: s.pnl >= 0 ? 'pos' : 'neg' },
  ];
}

function rankKey(order: 'best' | 'worst') {
  return (a: { stats: Stats }, b: { stats: Stats }) =>
    order === 'best'
      ? b.stats.totalR - a.stats.totalR || b.stats.pnl - a.stats.pnl
      : a.stats.totalR - b.stats.totalR || a.stats.pnl - b.stats.pnl;
}

export function answerQuestion(
  question: string,
  ctx: JournalContext,
  playbook: Playbook,
  now = new Date(),
): Answer {
  const { intent, scope } = parseQuestion(question, ctx, playbook, now);
  const toolCalls: Answer['toolCalls'] = [];

  if (ctx.trades.length === 0 && intent.type !== 'notes') {
    return {
      text: 'There are no trades in your journal yet. Connect an account or import a history file, and I can answer this from your own numbers.',
      highlights: [], tradeIds: [], entryIds: [], toolCalls, scope, unsure: true,
    };
  }

  switch (intent.type) {
    case 'stat': {
      let filter = intent.filter;
      let prefix = '';
      if (intent.ofBest) {
        toolCalls.push({ tool: 'group_stats', args: { by: intent.ofBest, filter } });
        const groups = getGroupStats(ctx, intent.ofBest, filter).filter((g) => g.name !== 'Untagged');
        const order = /\bworst\b/i.test(question) ? 'worst' : 'best';
        const top = [...groups].sort(rankKey(order))[0];
        if (!top) {
          return { text: `I couldn't find any trades with a ${intent.ofBest} recorded.`, highlights: [], tradeIds: [], entryIds: [], toolCalls, scope, unsure: true };
        }
        filter = { ...filter, [intent.ofBest]: top.name };
        prefix = `Your ${order} ${intent.ofBest} by total R is ${top.name} (${fmt.r(top.stats.totalR)}). `;
      }
      toolCalls.push({ tool: 'get_stats', args: filter });
      const { stats, tradeIds } = getStats(ctx, filter);
      if (!stats.count) {
        return { text: `No trades match ${scope}.`, highlights: [], tradeIds: [], entryIds: [], toolCalls, scope, unsure: true };
      }
      const detail =
        intent.metric === 'winRate'
          ? ` — ${stats.wins} wins out of ${stats.count} trade${stats.count === 1 ? '' : 's'}${stats.breakeven ? ` (${stats.breakeven} breakeven)` : ''}`
          : intent.metric === 'avgR' || intent.metric === 'totalR'
            ? ` across ${stats.rCount} trade${stats.rCount === 1 ? '' : 's'} with a known R`
            : intent.metric === 'pnl'
              ? ` across ${stats.count} trade${stats.count === 1 ? '' : 's'}`
              : '';
      const scopeText = intent.ofBest ? `on ${filter[intent.ofBest as 'setup']}` : scope === 'all trades' ? 'overall' : `for ${scope}`;
      return {
        text: `${prefix}Your ${METRIC_LABEL[intent.metric]} ${scopeText} is ${metricValue(intent.metric, stats)}${detail}.`,
        highlights: statHighlights(stats),
        tradeIds, entryIds: [], toolCalls, scope,
      };
    }

    case 'rank': {
      toolCalls.push({ tool: 'group_stats', args: { by: intent.by, filter: intent.filter } });
      const groups = getGroupStats(ctx, intent.by, intent.filter).filter((g) => g.name !== 'Untagged');
      if (!groups.length) {
        return { text: `I couldn't find trades with a ${intent.by} recorded${scope !== 'all trades' ? ` for ${scope}` : ''}.`, highlights: [], tradeIds: [], entryIds: [], toolCalls, scope, unsure: true };
      }
      const sorted = [...groups].sort(rankKey(intent.order));
      const top = sorted[0];
      const runnerUp = sorted[1];
      // Imports without an R column rank on P&L, so the answer must speak in dollars.
      const useR = groups.some((g) => g.stats.rCount > 0);
      const val = (st: Stats) => (useR ? fmt.r(st.totalR) : fmt.pnl(st.pnl));
      const net = useR ? top.stats.totalR : top.stats.pnl;
      const unit = useR ? 'R' : 'money';
      const word =
        intent.order === 'best'
          ? net > 0 ? `makes you the most ${unit}` : `loses you the least`
          : net < 0 ? `costs you the most ${unit}` : `makes you the least ${unit}`;
      return {
        text:
          `${top.name} ${word}: ${val(top.stats)} over ${top.stats.count} trade${top.stats.count === 1 ? '' : 's'} ` +
          `(${fmt.pct(top.stats.winRate)} win rate${useR ? `, ${fmt.r(top.stats.avgR)} avg` : ''}).` +
          (runnerUp ? ` Next is ${runnerUp.name} at ${val(runnerUp.stats)}.` : ''),
        highlights: sorted.slice(0, 4).map((g) => ({
          label: g.name,
          value: val(g.stats),
          tone: (useR ? g.stats.totalR : g.stats.pnl) >= 0 ? 'pos' : 'neg',
        })),
        tradeIds: top.tradeIds, entryIds: [], toolCalls, scope,
      };
    }

    case 'noteCompare': {
      const withF = { ...intent.filter, noteTerm: intent.term };
      const withoutF = { ...intent.filter, excludeNoteTerm: intent.term };
      toolCalls.push({ tool: 'get_stats', args: withF }, { tool: 'get_stats', args: withoutF });
      const a = getStats(ctx, withF);
      const b = getStats(ctx, withoutF);
      toolCalls.push({ tool: 'search_notes', args: { query: intent.term } });
      const notes = searchNotes(ctx, { query: intent.term });
      if (!a.stats.count) {
        return {
          text: notes.length
            ? `You've mentioned “${intent.term}” in ${notes.length} note${notes.length === 1 ? '' : 's'}, but none are linked to a closed trade yet, so there's no result to compare.`
            : `I couldn't find “${intent.term}” in any of your notes.`,
          highlights: [], tradeIds: [], entryIds: notes.slice(0, 8).map((e) => e.id), toolCalls, scope, unsure: true,
        };
      }
      return {
        text:
          `On the ${a.stats.count} trade${a.stats.count === 1 ? '' : 's'} where you logged “${intent.term}”, you won ${fmt.pct(a.stats.winRate)} with ${fmt.r(a.stats.avgR)} average. ` +
          `On the other ${b.stats.count}, it's ${fmt.pct(b.stats.winRate)} and ${fmt.r(b.stats.avgR)}.`,
        highlights: [
          { label: `With “${intent.term}”`, value: fmt.r(a.stats.avgR), tone: (a.stats.avgR ?? 0) >= 0 ? 'pos' : 'neg' },
          { label: 'Win rate', value: fmt.pct(a.stats.winRate) },
          { label: 'Without', value: fmt.r(b.stats.avgR), tone: (b.stats.avgR ?? 0) >= 0 ? 'pos' : 'neg' },
          { label: 'Win rate', value: fmt.pct(b.stats.winRate) },
        ],
        tradeIds: a.tradeIds, entryIds: notes.slice(0, 8).map((e) => e.id), toolCalls, scope,
      };
    }

    case 'notes': {
      const args = { query: intent.query, from: intent.filter.from, to: intent.filter.to };
      toolCalls.push({ tool: 'search_notes', args });
      let notes = searchNotes(ctx, args);
      // Fall back to any-word matching so "early entries" finds "entered early".
      if (!notes.length) {
        const words = intent.query.split(/\s+/).filter((w) => w.length > 3).map((w) => w.replace(/(ies|es|s)$/, ''));
        notes = ctx.entries.filter(
          (e) =>
            (!args.from || e.createdAt >= args.from) &&
            (!args.to || e.createdAt < args.to) &&
            words.some((w) => e.text.toLowerCase().includes(w.toLowerCase())),
        );
      }
      if (!notes.length) {
        return { text: `You haven't written about “${intent.query}” yet.`, highlights: [], tradeIds: [], entryIds: [], toolCalls, scope, unsure: true };
      }
      const linked = notes.map((n) => n.tradeId).filter(Boolean) as string[];
      const linkedStats = linked.length
        ? getStats({ ...ctx, trades: ctx.trades.filter((t) => linked.includes(t.id)) })
        : null;
      return {
        text:
          `You've written about “${intent.query}” ${notes.length} time${notes.length === 1 ? '' : 's'}` +
          (linkedStats && linkedStats.stats.count
            ? `. The ${linkedStats.stats.count} linked trade${linkedStats.stats.count === 1 ? '' : 's'} returned ${fmt.r(linkedStats.stats.totalR)} in total.`
            : '.') +
          ' Here they are, most recent first.',
        highlights: linkedStats ? statHighlights(linkedStats.stats).slice(0, 2) : [],
        tradeIds: linked, entryIds: notes.slice(0, 10).map((n) => n.id), toolCalls, scope,
      };
    }

    case 'overview': {
      toolCalls.push({ tool: 'get_stats', args: intent.filter });
      const { stats, tradeIds } = getStats(ctx, intent.filter);
      return {
        text:
          `I'm not sure exactly what you're asking, so here's the summary for ${scope}: ${stats.count} trades, ${fmt.pct(stats.winRate)} win rate, ${fmt.r(stats.totalR)} total. ` +
          'Try asking about a win rate, a setup, a pair, a period, or something you wrote.',
        highlights: statHighlights(stats),
        tradeIds: tradeIds.slice(0, 10), entryIds: [], toolCalls, scope, unsure: true,
      };
    }
  }
}
