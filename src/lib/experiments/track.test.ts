import { describe, expect, it } from 'vitest';
import { buildCoachNote } from '../coach';
import { DEMO_PLAYBOOK } from '../demo';
import type { Entry, Trade } from '../types';
import { baselineFor, makePlan } from './plan';
import { buildReport } from './report';
import { experimentsDuring, progressOf, resultOf } from './track';
import type { Change, Experiment, Length } from './types';

let n = 0;
const at = (day: number, h = 10) => new Date(Date.UTC(2026, 9, day, h)).toISOString();
const trade = (when: string | number, pnl: number, extra: Partial<Trade> = {}): Trade => {
  const openedAt = typeof when === 'number' ? at(when) : when;
  return {
  id: `t${++n}`, symbol: 'EURUSD', side: 'long', openedAt, closedAt: openedAt, entry: 1, exit: 1, size: 1, pnl, r: pnl / 50, session: 'London', source: 'sync', ...extra,
  };
};
const note = (t: Trade, text: string, extra: Partial<Entry> = {}): Entry => ({ id: `n${++n}`, kind: 'trade_note', text, tradeId: t.id, createdAt: t.closedAt, ...extra });

function experiment(change: Change, length: Length = { kind: 'trades', value: 4 }, history: Trade[] = []): Experiment {
  const plan = makePlan(change, 'perTrade', length);
  const startAt = at(10, 0);
  return { id: 'e1', ...plan, baseline: baselineFor(plan, history, new Date(startAt)), startAt, status: 'running' };
}

describe('matching trades to an experiment', () => {
  it('counts closed trades opened after the start, up to the length, and never open positions', () => {
    const before = trade(9, 10);
    const ts = [trade(10, 10), trade(11, -10), trade(11, 20, { status: 'open' }), trade(12, 5), trade(13, 5), trade(14, 99)];
    const p = progressOf(experiment({ kind: 'followPlan' }), { trades: [before, ...ts], entries: [] }, new Date(at(15)));
    expect(p.matched.map((t) => t.id)).toEqual([ts[0], ts[1], ts[3], ts[4]].map((t) => t.id));
    expect(p).toMatchObject({ done: true, label: '4 of 4 trades' });
  });

  it('shows progress before it’s done', () => {
    const p = progressOf(experiment({ kind: 'followPlan' }), { trades: [trade(10, 1), trade(11, 1)], entries: [] }, new Date(at(12)));
    expect(p).toMatchObject({ done: false, label: '2 of 4 trades' });
  });

  it('runs a days-long experiment by the calendar', () => {
    const e = experiment({ kind: 'followPlan' }, { kind: 'days', value: 14 });
    const mid = progressOf(e, { trades: [], entries: [] }, new Date(at(13, 12)));
    expect(mid.label).toBe('Day 4 of 14');
    expect(mid.fraction).toBeCloseTo(3.5 / 14);
    expect(progressOf(e, { trades: [], entries: [] }, new Date(at(24, 1))).done).toBe(true);
  });
});

describe('breaks', () => {
  it('a skipped setup taken anyway, from the trade or from the note', () => {
    const a = trade(10, 10, { setup: 'Breakout retest' });
    const b = trade(11, 10);
    const c = trade(12, 10);
    const entries = [note(b, 'retest again', { structured: { setup: 'Breakout retest', tags: [], fields: {} } })];
    const p = progressOf(experiment({ kind: 'skipSetup', setup: 'breakout retest' }), { trades: [a, b, c], entries }, new Date(at(13)));
    expect(p.breaks.sort()).toEqual([a.id, b.id].sort());
    expect(p.kept.map((t) => t.id)).toEqual([c.id]);
  });

  it('a habit the trader mentions in their note', () => {
    const a = trade(10, -10);
    const b = trade(11, 10);
    const p = progressOf(experiment({ kind: 'checkFor', word: 'early entry' }), { trades: [a, b], entries: [note(a, 'Early entry again, my fault')] }, new Date(at(12)));
    expect(p.breaks).toEqual([a.id]);
  });

  it('a trade answered “didn’t follow my plan”', () => {
    const a = trade(10, -10);
    const b = trade(11, 10);
    const entries = [note(a, '', { followedPlan: false }), note(b, '', { followedPlan: true })];
    expect(progressOf(experiment({ kind: 'followPlan' }), { trades: [a, b], entries }, new Date(at(12))).breaks).toEqual([a.id]);
  });

  it('a trade opened in a skipped session', () => {
    const ny = trade(10, 10, { openedAt: at(10, 18) });
    const ldn = trade(11, 10, { openedAt: at(11, 9) });
    expect(progressOf(experiment({ kind: 'skipSession', session: 'New York' }), { trades: [ny, ldn], entries: [] }, new Date(at(12))).breaks).toEqual([ny.id]);
  });
});

describe('result and report', () => {
  it('measures only the trades that kept to the change, with adherence', () => {
    const ts = [trade(10, 50), trade(11, -50, { setup: 'Footprint' }), trade(12, 100), trade(13, 0)];
    const p = progressOf(experiment({ kind: 'skipSetup', setup: 'Footprint' }), { trades: ts, entries: [] }, new Date(at(14)));
    const r = resultOf(p);
    expect(r.after.count).toBe(3);
    expect(r.after.perTradeMoney).toBe(50);
    expect(r.adherence).toBe(0.75);
    expect(r.confidence).toBe('not enough evidence yet');
  });

  it('reports small samples as small and never claims cause', () => {
    const history = Array.from({ length: 10 }, (_, i) => trade(1 + (i % 8), i % 2 ? 40 : -40));
    const e = experiment({ kind: 'followPlan' }, { kind: 'trades', value: 4 }, history);
    const ts = [trade(10, 60), trade(11, 60), trade(12, -20), trade(13, 60)];
    const report = buildReport(e, resultOf(progressOf(e, { trades: [...history, ...ts], entries: [] }, new Date(at(14)))), 'money');
    expect(report.headline).toBe('Your average per trade was higher than before: +$40 a trade, against $0 a trade.');
    expect(report.lines[0]).toBe('Before: $0 a trade over 10 trades. During: +$40 a trade over the 4 trades that kept to the change.');
    expect(report.confidence).toBe('Not enough evidence yet · 4 trades');
    expect(report.lines.join(' ')).toMatch(/not why/);
    expect(report.lines.join(' ')).not.toMatch(/\b(because|caused|proves?)\b/i);
  });

  it('says so when nothing kept to the change', () => {
    const e = experiment({ kind: 'skipSetup', setup: 'Footprint' });
    const ts = [trade(10, 10, { setup: 'Footprint' })];
    const r = resultOf(progressOf(e, { trades: ts, entries: [] }, new Date(at(11))));
    expect(buildReport(e, r, 'money').headline).toBe('No trades kept to “Skip Footprint”, so there’s nothing to compare yet.');
  });
});

it('end to end: a suggestion becomes an experiment, is tracked, and reports honestly', () => {
  // A week where every loss was noted as an early entry.
  const week = new Date(2026, 9, 7, 12);
  const day = (d: number, h: number) => new Date(2026, 9, d, h).toISOString();
  const history = [5, 5, 6, 6, 7, 7, 8, 8, 9, 9].map((d, i) => ({
    ...trade(day(d, 9 + i), i % 5 === 0 ? 120 : -50),
    closedAt: day(d, 10 + i),
  }));
  const entries: Entry[] = history.filter((t) => t.pnl < 0).map((t) => note(t, 'early entry, jumped in before the touch', { structured: { tags: ['early entry'], fields: {} } }));

  const suggestion = buildCoachNote(history, entries, DEMO_PLAYBOOK, week, 'money').find((l) => l.kind === 'suggestion');
  expect(suggestion?.experiment?.plan.change).toEqual({ kind: 'checkFor', word: 'early entry' });

  // Started the next Monday.
  const plan = suggestion!.experiment!.plan;
  const startAt = new Date(2026, 9, 12, 8).toISOString();
  const e: Experiment = { id: 'e', ...plan, insightId: suggestion!.experiment!.insightId, baseline: baselineFor(plan, history, new Date(startAt)), startAt, status: 'running' };
  expect(e.baseline.count).toBe(10);

  // Ten trades during it; one was an early entry again.
  const during = Array.from({ length: 10 }, (_, i) => ({ ...trade(1, i === 3 ? -50 : 40), openedAt: new Date(2026, 9, 12 + i, 10).toISOString(), closedAt: new Date(2026, 9, 12 + i, 11).toISOString() }));
  const slip = note(during[3], 'early entry again');
  const ctx = { trades: [...history, ...during], entries: [...entries, slip] };

  const midway = progressOf(e, { ...ctx, trades: [...history, ...during.slice(0, 6)] }, new Date(2026, 9, 18));
  expect(midway.label).toBe('6 of 10 trades');

  const done = progressOf(e, ctx, new Date(2026, 9, 23));
  expect(done.done).toBe(true);
  const result = resultOf(done);
  expect(result).toMatchObject({ breaks: [during[3].id], adherence: 0.9, confidence: 'observation' });
  const report = buildReport(e, result, 'money');
  expect(report.headline).toMatch(/^Your average per trade was higher than before: \+\$40 a trade/);
  expect(report.lines[1]).toBe('You kept to it on 9 of 10 trades. The one that didn’t is left out of the result.');
  expect(report.confidence).toBe('Observation · 9 trades');
});

describe('experiments during a week', () => {
  const base = { ...makePlan({ kind: 'followPlan' }), baseline: { count: 0, winRate: 0, perTradeR: null, perTradeMoney: null, tradeIds: [] } };
  const e = (id: string, startAt: string, status: Experiment['status'], endAt?: string): Experiment => ({ id, ...base, startAt, status, endAt });
  it('finds what ran in the week, including one still running', () => {
    const list = [
      e('before', '2026-09-01T00:00:00Z', 'complete', '2026-09-10T00:00:00Z'),
      e('overlap', '2026-10-01T00:00:00Z', 'complete', '2026-10-06T00:00:00Z'),
      e('running', '2026-10-08T00:00:00Z', 'running'),
      e('after', '2026-10-20T00:00:00Z', 'abandoned', '2026-10-21T00:00:00Z'),
    ];
    const ids = experimentsDuring(list, new Date('2026-10-05T00:00:00Z'), new Date('2026-10-12T00:00:00Z'), new Date('2026-10-15T00:00:00Z')).map((x) => x.id);
    expect(ids).toEqual(['running', 'overlap']);
  });
});
