import { fmt } from '../format';
import { showResult, type Units } from '../units';
import { describeChange } from './plan';
import type { Experiment, Result, Snapshot } from './types';

/**
 * The finish report: before and during, how many trades each side rests on,
 * how closely the change was kept, and how sure that is. It describes what
 * happened; it never says the change caused it.
 */
export interface Report {
  headline: string;
  lines: string[];
  confidence: string;
}

function value(e: Experiment, s: Snapshot, units: Units) {
  return e.measure === 'winRate' ? `${fmt.pct(s.winRate)} won` : `${showResult(units, s.perTradeR, s.perTradeMoney)} a trade`;
}

/** The measure as one number, for comparing before and during. */
function measureOf(e: Experiment, s: Snapshot, units: Units): number | null {
  if (e.measure === 'winRate') return s.count ? s.winRate : null;
  return units === 'r' && s.perTradeR != null ? s.perTradeR : s.perTradeMoney;
}

export function buildReport(e: Experiment, r: Result, units: Units): Report {
  const before = e.baseline;
  const after = r.after;
  const trades = (n: number) => `${n} trade${n === 1 ? '' : 's'}`;
  const b = measureOf(e, before, units);
  const a = measureOf(e, after, units);

  let headline: string;
  if (!after.count) headline = `No trades kept to “${describeChange(e.change)}”, so there’s nothing to compare yet.`;
  else if (b == null || !before.count) headline = `During the experiment: ${value(e, after, units)}. There were no earlier trades to compare with.`;
  else {
    // Within a twentieth of the larger number counts as about the same.
    const close = Math.abs(a! - b) <= 0.05 * Math.max(Math.abs(a!), Math.abs(b), e.measure === 'winRate' ? 1 : 1e-9);
    const dir = close ? 'about the same as' : a! > b ? 'higher than' : 'lower than';
    headline = `Your ${e.measure === 'winRate' ? 'win rate' : 'average per trade'} was ${dir} before: ${value(e, after, units)}, against ${value(e, before, units)}.`;
  }

  const kept = after.count;
  const all = kept + r.breaks.length;
  const lines = [
    `Before: ${value(e, before, units)} over ${trades(before.count)}. During: ${value(e, after, units)} over the ${trades(kept)} that kept to the change.`,
    all ? `You kept to it on ${kept} of ${trades(all)}.${r.breaks.length ? ` ${r.breaks.length === 1 ? 'The one that didn’t is' : `The ${r.breaks.length} that didn’t are`} left out of the result.` : ''}` : 'No trades were taken during the experiment.',
    'This shows what happened, not why. Markets and other habits change too.',
  ];
  const sure = r.confidence === 'not enough evidence yet' ? `Not enough evidence yet · ${trades(kept)}` : `${r.confidence[0].toUpperCase()}${r.confidence.slice(1)} · ${trades(kept)}`;
  return { headline, lines, confidence: sure };
}
