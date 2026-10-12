import { sessionsAt } from '../rules/engine';
import { confidenceFor } from '../stats';
import { congruence, tradesMentioning, type JournalContext } from '../tools';
import { closedOnly, type Trade } from '../types';
import { snapshot } from './plan';
import type { Change, Experiment, ExperimentConfidence, Result } from './types';

/**
 * Matching an experiment to the trader's trades. Pure: the same trades and
 * notes always give the same progress and the same result.
 */

export interface Progress {
  /** Closed trades taken during the experiment, in order. */
  matched: Trade[];
  /** Of those, the ones that went against the change. */
  breaks: string[];
  /** The ones that kept to it: what the result is measured on. */
  kept: Trade[];
  done: boolean;
  /** "6 of 10 trades" or "Day 4 of 14". */
  label: string;
}

/** Does this trade go against the change? Decided from the data alone. */
export function goesAgainst(change: Change, t: Trade, ctx: JournalContext): boolean {
  switch (change.kind) {
    case 'skipSetup': {
      const name = change.setup.toLowerCase();
      if (t.setup?.toLowerCase() === name) return true;
      // The setup can also come from the trader's note about the trade.
      return ctx.entries.some((e) => e.tradeId === t.id && e.structured?.setup?.toLowerCase() === name);
    }
    case 'checkFor':
      return tradesMentioning(ctx, change.word).has(t.id);
    case 'followPlan':
      return congruence(ctx).get(t.id) === false;
    case 'skipSession':
      return sessionsAt(t.openedAt).includes(change.session);
  }
}

export function progressOf(e: Experiment, ctx: JournalContext, now: Date): Progress {
  const start = e.startAt;
  const end = e.length.kind === 'days' ? new Date(new Date(start).getTime() + e.length.value * 864e5).toISOString() : null;
  // Open positions join once they close, so a result never counts half a trade.
  let matched = closedOnly(ctx.trades)
    .filter((t) => t.openedAt >= start && (!end || t.openedAt < end))
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  if (e.length.kind === 'trades') matched = matched.slice(0, e.length.value);

  const against = new Set(matched.filter((t) => goesAgainst(e.change, t, ctx)).map((t) => t.id));
  const kept = matched.filter((t) => !against.has(t.id));

  if (e.length.kind === 'trades') {
    return { matched, breaks: [...against], kept, done: matched.length >= e.length.value, label: `${matched.length} of ${e.length.value} trades` };
  }
  const day = Math.min(e.length.value, Math.floor((now.getTime() - new Date(start).getTime()) / 864e5) + 1);
  return { matched, breaks: [...against], kept, done: !!end && now.toISOString() >= end, label: `Day ${day} of ${e.length.value}` };
}

/** Under 5 kept trades there's no evidence either way, and Proof says so. */
export function experimentConfidence(kept: Trade[]): ExperimentConfidence {
  const c = confidenceFor(kept);
  return c === 'not enough data' ? 'not enough evidence yet' : c;
}

export function resultOf(p: Progress): Result {
  return {
    after: snapshot(p.kept),
    breaks: p.breaks,
    adherence: p.matched.length ? p.kept.length / p.matched.length : 0,
    confidence: experimentConfidence(p.kept),
  };
}

/** Experiments that were running at some point between `from` and `to`, newest first. */
export function experimentsDuring(experiments: Experiment[], from: Date, to: Date, now: Date): Experiment[] {
  return experiments
    .filter((e) => Date.parse(e.startAt) < to.getTime() && Date.parse(e.status === 'running' ? now.toISOString() : (e.endAt ?? e.startAt)) >= from.getTime())
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
}
