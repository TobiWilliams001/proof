import { describe, expect, it } from 'vitest';
import { answerQuestion } from './ask';
import { guessMapping, parseCSV, parseDate, rowsToTrades } from './csv';
import { parsePeriod, startOfWeek, ymd } from './dates';
import { buildDemo, DEMO_PLAYBOOK } from './demo';
import { buildWeeklyReview } from './review';
import { computeStats, outcomeOf, rDistribution } from './stats';
import { migrateLegacy } from './storage';
import { constrainToPlaybook, detectKind, detectR, detectSymbol, structureNote } from './structure';
import { sizeCrypto } from './calculator';
import { buildCoachNote } from './coach';
import { rFromPrices } from './stats';
import { linkEarlyNotes } from './link';
import { listTrades } from './tools';
import type { Trade } from './types';

const t = (over: Partial<Trade>): Trade => ({
  id: Math.random().toString(36),
  symbol: 'EURUSD',
  side: 'long',
  openedAt: '2026-10-06T09:00:00.000Z',
  closedAt: '2026-10-06T10:00:00.000Z',
  entry: 1,
  exit: 1,
  size: 1,
  pnl: 0,
  r: 0,
  session: 'London',
  source: 'manual',
  ...over,
});

describe('stats', () => {
  it('counts outcomes from R, falling back to P&L when R is unknown', () => {
    expect(outcomeOf(t({ r: 1.2 }))).toBe('win');
    expect(outcomeOf(t({ r: 0.01 }))).toBe('be');
    expect(outcomeOf(t({ r: null, pnl: -40 }))).toBe('loss');
  });

  it('averages R only over trades where R is known', () => {
    const s = computeStats([t({ r: 2, pnl: 200 }), t({ r: -1, pnl: -100 }), t({ r: null, pnl: 50 })]);
    expect(s.count).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.avgR).toBe(0.5);
    expect(s.rCount).toBe(2);
    expect(s.pnl).toBe(150);
  });

  it('clamps outliers into the outer distribution bins', () => {
    const d = rDistribution([t({ r: 9 }), t({ r: -7 }), t({ r: 0.4 })]);
    expect(d.find((b) => b.bin === 3)!.count).toBe(1);
    expect(d.find((b) => b.bin === -3)!.count).toBe(1);
    expect(d.find((b) => b.bin === 0)!.count).toBe(1);
  });
});

describe('structuring', () => {
  it('detects symbols in common spellings', () => {
    expect(detectSymbol('long eur/usd here')).toBe('EURUSD');
    expect(detectSymbol('gold looked heavy')).toBe('XAUUSD');
    expect(detectSymbol('NAS100 short')).toBe('NAS100');
    expect(detectSymbol('felt tired')).toBeUndefined();
  });

  it('classifies the brief’s example notes', () => {
    expect(detectKind('Saw a 3-touch on GBPUSD at 1.2650, didn’t take it, would’ve been +4R.')).toBe('missed');
    expect(detectKind('Took a trade outside my rules, revenge after a loss.')).toBe('rule_break');
    expect(detectKind('Watching XAUUSD at 2,340 for a footprint entry today.')).toBe('plan');
    expect(detectKind('Tired, slept badly, cut size.')).toBe('reflection');
  });

  it('maps only to the trader’s own playbook and asks one question when ambiguous', () => {
    const r = structureNote('Was it the RE or the RRE on EURUSD? +2R, patient', DEMO_PLAYBOOK);
    expect(r.structured.setup).toBeUndefined();
    expect(r.clarify?.options).toEqual(['2-touch', '3-touch']);
    expect(r.structured.tags).toContain('patient');

    const clear = structureNote('two touch on gbpjpy, early entry, -1R', DEMO_PLAYBOOK);
    expect(clear.structured.setup).toBe('2-touch');
    expect(clear.structured.r).toBe(-1);
    expect(clear.structured.tags).toEqual(['early entry']);
    expect(clear.clarify).toBeUndefined();
  });

  it('never asks about setup on reflections', () => {
    expect(structureNote('Tired, slept badly, cut size.', DEMO_PLAYBOOK).clarify).toBeUndefined();
  });

  it('drops LLM output that is not in the playbook', () => {
    const s = constrainToPlaybook({ setup: 'Wyckoff spring', tags: ['patient', 'made-up'], fields: { Timeframe: '2D' } }, DEMO_PLAYBOOK);
    expect(s.setup).toBeUndefined();
    expect(s.tags).toEqual(['patient']);
    expect(s.fields).toEqual({});
  });
});

describe('dates', () => {
  const now = new Date(2026, 9, 10, 12); // Sat 10 Oct 2026
  it('starts weeks on Monday', () => expect(ymd(startOfWeek(now))).toBe('2026-10-05'));
  it('parses relative periods', () => {
    expect(parsePeriod('win rate this month', now)?.label).toBe('this month');
    expect(parsePeriod('last 14 days', now)?.label).toBe('the last 14 days');
    expect(parsePeriod('all time', now)).toBeUndefined();
  });
});

describe('tools', () => {
  it('filters trades by linked-note terms', () => {
    const a = t({ id: 'a' });
    const b = t({ id: 'b' });
    const ctx = {
      trades: [a, b],
      entries: [{ id: 'e', kind: 'trade_note' as const, text: 'Felt tired', tradeId: 'a', createdAt: a.closedAt }],
    };
    expect(listTrades(ctx, { noteTerm: 'tired' }).map((x) => x.id)).toEqual(['a']);
    expect(listTrades(ctx, { excludeNoteTerm: 'tired' }).map((x) => x.id)).toEqual(['b']);
  });
});

describe('ask your journal', () => {
  const now = new Date(2026, 9, 10, 12);
  const demo = buildDemo(now);
  const ctx = { trades: demo.trades, entries: demo.entries };

  it('answers the definition-of-done question with cited trades', () => {
    const a = answerQuestion("What's my win rate on my best setup?", ctx, demo.playbook, now);
    expect(a.toolCalls.map((c) => c.tool)).toEqual(['group_stats', 'get_stats']);
    const cited = demo.trades.filter((x) => a.tradeIds.includes(x.id));
    expect(cited.length).toBeGreaterThan(0);
    expect(new Set(cited.map((x) => x.setup)).size).toBe(1);
    const s = computeStats(cited);
    expect(a.text).toContain(`${Math.round(s.winRate * 100)}%`);
  });

  it('is honest when there is no data', () => {
    const a = answerQuestion('win rate?', { trades: [], entries: [] }, demo.playbook, now);
    expect(a.unsure).toBe(true);
    expect(a.tradeIds).toEqual([]);
  });
});

describe('weekly review', () => {
  it('summarises only the given week', () => {
    const now = new Date(2026, 9, 10, 12);
    const demo = buildDemo(now);
    const r = buildWeeklyReview(demo.trades, demo.entries, now);
    expect(r.weekStart).toBe('2026-10-05');
    expect(r.trades.every((x) => x.closedAt >= new Date(2026, 9, 5).toISOString())).toBe(true);
    expect(r.stats.count).toBe(r.trades.length);
  });
});

describe('csv import', () => {
  it('parses quoted fields and MT5-style headers', () => {
    const rows = parseCSV('Time,Symbol,Type,Volume,Price,Profit,Comment\n2026.10.06 10:15,EURUSD,sell,1.00,1.0842,"1,250.50","note, with comma"\n,,,,,,\n');
    const map = guessMapping(rows[0]);
    expect(map).toMatchObject({ closedAt: 0, symbol: 1, side: 2, size: 3, entry: 4, pnl: 5 });
    const { trades, skipped } = rowsToTrades(rows.slice(1), map);
    expect(skipped).toBe(0);
    expect(trades[0]).toMatchObject({ symbol: 'EURUSD', side: 'short', pnl: 1250.5 });
  });
});

describe('csv edge cases', () => {
  it('keeps semicolons inside fields when the file is comma-delimited', () => {
    const rows = parseCSV('symbol,pnl,setup\nEURUSD,10,"a;b"\nGBPUSD,5,c;d\n');
    expect(rows[1]).toEqual(['EURUSD', '10', 'a;b']);
    expect(rows[2]).toEqual(['GBPUSD', '5', 'c;d']);
  });

  it('reads semicolon-delimited exports (European spreadsheets)', () => {
    expect(parseCSV('Symbol;Profit\r\nEURUSD;12.5\r\n')).toEqual([['Symbol', 'Profit'], ['EURUSD', '12.5']]);
  });

  it('parses MT4/5 and ISO-ish dates as local time', () => {
    const d = parseDate('2026.10.06 10:15')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 6, 10, 15]);
    expect(parseDate('2026-10-06')!.getDate()).toBe(6);
    expect(parseDate('nonsense')).toBeNull();
  });
});

describe('review regressions', () => {
  it('reads the sign of "lost 1R" from the words around it', () => {
    expect(detectR('lost 1R on that one')).toBe(-1);
    expect(detectR('stopped out for 1.5R')).toBe(-1.5);
    expect(detectR('banked 2R')).toBe(2);
    expect(detectR('+3R after losing earlier')).toBe(3);
  });

  it('imports accounting negatives, decimal commas and zoned timestamps correctly', () => {
    const rows = [['2024-01-15T10:30:00.000Z', 'EURUSD', '(45.20)'], ['15.01.2024 10:30', 'GBPUSD', '1.234,50']];
    const { trades, skipped } = rowsToTrades(rows, { closedAt: 0, symbol: 1, pnl: 2 });
    expect(skipped).toBe(0);
    expect(trades[0].pnl).toBe(-45.2);
    expect(trades[0].closedAt).toBe('2024-01-15T10:30:00.000Z');
    expect(trades[1].pnl).toBe(1234.5);
    expect(guessMapping(['closed_at', 'symbol', 'pnl'])).toMatchObject({ closedAt: 0 });
  });

  it('gives no reward for a target on the wrong side of entry', () => {
    const r = sizeCrypto({ balance: 1000, riskPct: 1, entry: 100, stop: 95, target: 90, leverage: 1, side: 'long', futures: false })!;
    expect(r.profit).toBe(0);
    expect(r.targetWrongSide).toBe(true);
  });

  it("doesn't let a rule break on last week's trade lower this week's adherence", () => {
    const now = new Date(2026, 9, 10, 12);
    const thisWeek = t({ id: 'tw', closedAt: new Date(2026, 9, 6, 10).toISOString(), r: 1, pnl: 100 });
    const lastWeek = t({ id: 'lw', closedAt: new Date(2026, 8, 30, 10).toISOString(), r: -1, pnl: -100 });
    const brk = { id: 'b', kind: 'rule_break' as const, text: 'revenge', tradeId: 'lw', createdAt: new Date(2026, 9, 6, 18).toISOString() };
    expect(buildWeeklyReview([thisWeek, lastWeek], [brk], now).adherence).toBe(1);
  });
});

describe('plan at open, congruence, and the review speaking first', () => {
  const now = new Date(2026, 9, 10, 12);
  const at = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();
  const open = t({ id: 'o', status: 'open', openedAt: at(9), closedAt: at(9), entry: 1.265, stop: 1.268, pnl: 0, r: null });
  const w1 = t({ id: 'w1', closedAt: at(6), r: 2, pnl: 200, setup: '3-touch' });
  const l1 = t({ id: 'l1', closedAt: at(7), r: -1, pnl: -100, setup: '2-touch' });
  const l2 = t({ id: 'l2', closedAt: at(8), r: -1, pnl: -100, setup: '2-touch' });
  const note = (id: string, tradeId: string, text: string, followedPlan?: boolean) => ({
    id, kind: 'trade_note' as const, text, tradeId, followedPlan, createdAt: at(Number(tradeId === 'w1' ? 6 : tradeId === 'l1' ? 7 : 8), 18),
  });
  const entries = [
    note('n1', 'w1', 'Patient, waited for the touch.', true),
    { ...note('n2', 'l1', 'Entered early before the structure formed.', false), structured: { tags: ['early entry'], fields: {} } },
    { ...note('n3', 'l2', 'Early entry again, structure not formed yet.', false) },
  ];

  it('never counts an open position in stats, answers or reviews', () => {
    expect(computeStats([open, w1]).count).toBe(1);
    expect(listTrades({ trades: [open, w1], entries: [] }).map((x) => x.id)).toEqual(['w1']);
    expect(buildWeeklyReview([open, w1], [], now).stats.count).toBe(1);
  });

  it('treats a note on an open position as its plan', () => {
    expect(structureNote('3-touch at value, stop above the high', DEMO_PLAYBOOK, open).kind).toBe('plan');
  });

  it('works out R from the stop, and refuses to guess without one', () => {
    expect(rFromPrices('short', 1.265, 1.268, 1.259)).toBe(2);
    expect(rFromPrices('long', 100, 95, 97.5)).toBe(-0.5);
    expect(rFromPrices('long', 100, undefined, 110)).toBeNull();
    expect(rFromPrices('long', 100, 105, 110)).toBeNull();
  });

  it('asks the clarifying question in the trader’s own words', () => {
    expect(structureNote('RE or RRE on EURUSD, +2R', DEMO_PLAYBOOK).clarify?.question).toBe('Was this your RE or RRE?');
  });

  it('measures weekly adherence from the one-tap answers', () => {
    const r = buildWeeklyReview([w1, l1, l2], entries, now);
    expect(r.adherenceSource).toBe('answers');
    expect(r.adherence).toBeCloseTo(1 / 3);
  });

  it('answers "how do I do when I follow my plan?" from the answers', () => {
    const a = answerQuestion('How do I do when I follow my plan?', { trades: [w1, l1, l2], entries }, DEMO_PLAYBOOK, now);
    expect(a.text).toContain('followed your plan (1 trade)');
    expect(a.text).toContain('(2 trades)');
    expect(a.tradeIds.sort()).toEqual(['l1', 'l2', 'w1']);
  });

  it('does not call a word a loss pattern when wins say it too', () => {
    const w2 = t({ id: 'w2', closedAt: at(6, 11), r: 1.5, pnl: 150 });
    const clean = [
      { id: 'c1', kind: 'trade_note' as const, text: 'Clean setup, worked well.', tradeId: 'w1', createdAt: at(6, 18) },
      { id: 'c2', kind: 'trade_note' as const, text: 'Clean entry again.', tradeId: 'w2', createdAt: at(6, 19) },
      { id: 'c3', kind: 'trade_note' as const, text: 'Clean, by the rules, just lost.', tradeId: 'l1', createdAt: at(7, 18) },
      { id: 'c4', kind: 'trade_note' as const, text: 'Clean setup but stopped.', tradeId: 'l2', createdAt: at(8, 18) },
    ];
    const lines = buildCoachNote([w1, w2, l1, l2], clean, DEMO_PLAYBOOK, now);
    expect(lines.find((l) => l.kind === 'pattern')).toBeUndefined();
  });

  it('opens the review with facts that each carry their sources, and one suggestion at most', () => {
    const lines = buildCoachNote([open, w1, l1, l2], entries, DEMO_PLAYBOOK, now);
    expect(lines[0].text).toBe('This week you took 3 trades: 1 won, 2 lost, and 1 position still open. You finished flat.');
    const pattern = lines.find((l) => l.kind === 'pattern')!;
    expect(pattern.text).toBe('Both losses were tagged “early entry”. You noted it yourself after each one.');
    expect(pattern.tradeIds.sort()).toEqual(['l1', 'l2']);
    expect(pattern.entryIds.sort()).toEqual(['n2', 'n3']);
    const discipline = lines.find((l) => l.kind === 'discipline')!;
    expect(discipline.text).toContain('You followed your plan on 1 of 3 trades.');
    expect(lines.filter((l) => l.kind === 'suggestion').length).toBeLessThanOrEqual(1);
    for (const l of lines.filter((x) => x.kind !== 'summary' && x.kind !== 'suggestion')) {
      expect(l.tradeIds.length + l.entryIds.length).toBeGreaterThan(0);
    }
  });
});

describe('notes written before the trade arrives', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).toISOString();
  const trade = t({ id: 'eu', symbol: 'EURUSD', openedAt: at(9), closedAt: at(10) });
  const note = (id: string, createdAt: string, symbol = 'EURUSD', kind: 'trade_note' | 'plan' = 'trade_note') => ({
    id, kind, text: 'x', createdAt, structured: { symbol, tags: [], fields: {} },
  });

  it('links a note to the one trade it fits once that trade syncs', () => {
    const [n] = linkEarlyNotes([note('n', at(10, 20))], [trade]);
    expect(n.tradeId).toBe('eu');
  });

  it('links a plan written just before the open', () => {
    const [p] = linkEarlyNotes([note('p', at(8, 30), 'EURUSD', 'plan')], [trade]);
    expect(p.tradeId).toBe('eu');
  });

  it('never guesses: a different symbol, a far-off time, or two candidates stay unlinked', () => {
    const twin = t({ id: 'eu2', symbol: 'EURUSD', openedAt: at(9, 30), closedAt: at(10, 30) });
    const out = linkEarlyNotes([note('a', at(10, 5), 'GBPUSD'), note('b', at(23)), note('c', at(10, 10))], [trade, twin]);
    expect(out.map((e) => e.tradeId)).toEqual([undefined, undefined, undefined]);
  });
});

describe('legacy migration', () => {
  it('turns Edgelog notes into journal entries linked to their trade', () => {
    const { trades, entries } = migrateLegacy([
      { id: 1, date: '2026-04-30', pair: 'BTC/USDT', side: 'long', entry: 1, exit: 2, size: 1, pnl: 10, r: 2, notes: 'clean break' },
    ]);
    expect(trades[0].symbol).toBe('BTCUSDT');
    expect(entries[0]).toMatchObject({ tradeId: trades[0].id, text: 'clean break' });
  });
});
