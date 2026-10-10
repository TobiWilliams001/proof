import { computeStats, groupStats, type GroupKey, type Stats } from './stats';
import type { Entry, EntryKind, Session, Side, Trade } from './types';

/**
 * The only operations "Ask your journal" may perform (brief §8). They are
 * typed, parameterised and pure, so an LLM planner can be dropped in later
 * without ever letting a model compute or recall a number itself.
 */

export interface JournalContext {
  trades: Trade[];
  entries: Entry[];
}

export interface TradeFilter {
  symbol?: string;
  setup?: string;
  side?: Side;
  session?: Session;
  from?: string; // ISO, inclusive
  to?: string; // ISO, exclusive
  /** Only trades whose linked notes mention this term (text or tag). */
  noteTerm?: string;
  /** Only trades whose linked notes do NOT mention this term. */
  excludeNoteTerm?: string;
}

export interface NoteFilter {
  query?: string;
  kind?: EntryKind;
  from?: string;
  to?: string;
}

function mentions(e: Entry, term: string): boolean {
  const t = term.toLowerCase();
  return (
    e.text.toLowerCase().includes(t) ||
    (e.structured?.tags ?? []).some((tag) => tag.toLowerCase() === t)
  );
}

function tradesMentioning(ctx: JournalContext, term: string): Set<string> {
  return new Set(
    ctx.entries.filter((e) => e.tradeId && mentions(e, term)).map((e) => e.tradeId!),
  );
}

export function listTrades(ctx: JournalContext, f: TradeFilter = {}): Trade[] {
  const withTerm = f.noteTerm ? tradesMentioning(ctx, f.noteTerm) : null;
  const withoutTerm = f.excludeNoteTerm ? tradesMentioning(ctx, f.excludeNoteTerm) : null;
  return ctx.trades
    .filter((t) => {
      if (f.symbol && t.symbol !== f.symbol) return false;
      if (f.setup && (t.setup ?? '').toLowerCase() !== f.setup.toLowerCase()) return false;
      if (f.side && t.side !== f.side) return false;
      if (f.session && t.session !== f.session) return false;
      if (f.from && t.closedAt < f.from) return false;
      if (f.to && t.closedAt >= f.to) return false;
      if (withTerm && !withTerm.has(t.id)) return false;
      if (withoutTerm && withoutTerm.has(t.id)) return false;
      return true;
    })
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt));
}

export function getStats(ctx: JournalContext, f: TradeFilter = {}): { stats: Stats; tradeIds: string[] } {
  const trades = listTrades(ctx, f);
  return { stats: computeStats(trades), tradeIds: trades.map((t) => t.id) };
}

export function getGroupStats(ctx: JournalContext, by: GroupKey, f: TradeFilter = {}) {
  return groupStats(listTrades(ctx, f), by).map((g) => ({
    name: g.name,
    stats: g.stats,
    tradeIds: g.trades.map((t) => t.id),
  }));
}

export function searchNotes(ctx: JournalContext, f: NoteFilter = {}): Entry[] {
  const words = (f.query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return ctx.entries
    .filter((e) => {
      if (f.kind && e.kind !== f.kind) return false;
      if (f.from && e.createdAt < f.from) return false;
      if (f.to && e.createdAt >= f.to) return false;
      if (!words.length) return true;
      const hay = `${e.text} ${(e.structured?.tags ?? []).join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const TOOL_NAMES = ['get_stats', 'list_trades', 'group_stats', 'search_notes'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
