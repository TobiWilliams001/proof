import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_PLAYBOOK } from '../src/lib/demo';
import { structureNote } from '../src/lib/structure';
import type { EntryKind } from '../src/lib/types';

/**
 * Field-extraction eval for the local structurer, against the demo playbook
 * (setups: 2-touch/RE, 3-touch/RRE, Footprint, Breakout retest).
 * Only the fields listed per case are scored. `clarify: true` means the one
 * clarifying question should fire; `false` means it must not.
 */
interface Case {
  note: string;
  kind: EntryKind;
  setup?: string | null;
  symbol?: string;
  r?: number;
  tags?: string[];
  clarify?: boolean;
}

const CASES: Case[] = [
  { note: 'Clean 3-touch at the value area on EURUSD, entered a bit early, held to target. +2.4R', kind: 'trade_note', setup: '3-touch', symbol: 'EURUSD', r: 2.4, clarify: false },
  { note: 'Saw a 3-touch on GBPUSD at 1.2650, didn’t take it, would’ve been +4R.', kind: 'missed', setup: '3-touch', symbol: 'GBPUSD', r: 4 },
  { note: 'Took a trade outside my rules, revenge after a loss.', kind: 'rule_break', tags: ['revenge'] },
  { note: 'Watching XAUUSD at 2,340 for a footprint entry today.', kind: 'plan', setup: 'Footprint', symbol: 'XAUUSD' },
  { note: 'Tired, slept badly, cut size.', kind: 'reflection', tags: ['tired'], clarify: false },
  { note: 'Two touch on GBPJPY, early entry, stopped for -1R', kind: 'trade_note', setup: '2-touch', symbol: 'GBPJPY', r: -1, tags: ['early entry'] },
  { note: 'RRE on gold, patient, let it run to 3R', kind: 'trade_note', setup: '3-touch', symbol: 'XAUUSD', r: 3, tags: ['patient'] },
  { note: 'Not sure if it was the RE or RRE but EURUSD paid +1.5R', kind: 'trade_note', setup: null, symbol: 'EURUSD', r: 1.5, clarify: true },
  { note: 'Breakout retest on NAS100 failed, moved stop and lost more. -1.6R', kind: 'trade_note', setup: 'Breakout retest', symbol: 'NAS100', r: -1.6, tags: ['moved stop'] },
  { note: 'Missed the footprint long on BTC, was away from the desk', kind: 'missed', setup: 'Footprint', symbol: 'BTCUSD' },
  { note: 'FOMO’d into GBPUSD with no setup. Shouldn’t have.', kind: 'rule_break', symbol: 'GBPUSD', tags: ['fomo'] },
  { note: 'Plan is to wait for a retest of 1.0850 on EURUSD in London.', kind: 'plan', setup: 'Breakout retest', symbol: 'EURUSD' },
  { note: 'Great focus all session, felt calm and patient.', kind: 'reflection', tags: ['patient'] },
  { note: 'Shorted eur/usd on the 3 touch, news spike took me out -1R', kind: 'trade_note', setup: '3-touch', symbol: 'EURUSD', r: -1, tags: ['news'] },
  { note: 'GBPJPY long +2R, just followed the plan', kind: 'trade_note', symbol: 'GBPJPY', r: 2, clarify: true },
  { note: 'Passed on the 2-touch on USDJPY, would have been +1.8R', kind: 'missed', setup: '2-touch', symbol: 'USDJPY', r: 1.8 },
  { note: 'Overtraded after lunch, 4 trades none in my plan', kind: 'rule_break' },
  { note: 'Looking for a 3-touch on AUDUSD at the range low tomorrow', kind: 'plan', setup: '3-touch', symbol: 'AUDUSD' },
  { note: 'Distracted by phone, energy low. Stopping for the day.', kind: 'reflection' },
  { note: 'A+ 3-touch on gold, +3.2R', kind: 'trade_note', setup: '3-touch', symbol: 'XAUUSD', r: 3.2, tags: ['A+'] },
  { note: 'Late entry on the footprint at US30, scratched it for 0R', kind: 'trade_note', setup: 'Footprint', symbol: 'US30', r: 0, tags: ['late entry'] },
  { note: 'Skipped the breakout retest on GBPUSD, didn’t trust it', kind: 'missed', setup: 'Breakout retest', symbol: 'GBPUSD' },
  { note: 'Revenge trade on NAS100 after the stop-out. -1R', kind: 'rule_break', symbol: 'NAS100', r: -1, tags: ['revenge'] },
  { note: 'Waiting for a footprint confirmation at 2,320 if price gets there', kind: 'plan', setup: 'Footprint' },
  { note: 'Jumped into cable short with no setup, stopped out', kind: 'rule_break', symbol: 'GBPUSD' },
  { note: 'Fiber long off the 2 touch, paid 1.2R', kind: 'trade_note', setup: '2-touch', symbol: 'EURUSD', r: 1.2 },
];

type Field = 'kind' | 'setup' | 'symbol' | 'r' | 'tags' | 'clarify';
const tally: Record<Field, [number, number]> = { kind: [0, 0], setup: [0, 0], symbol: [0, 0], r: [0, 0], tags: [0, 0], clarify: [0, 0] };

describe('eval: note structuring', () => {
  for (const c of CASES) {
    it(c.note, () => {
      const out = structureNote(c.note, DEMO_PLAYBOOK);
      const got: Record<Field, unknown> = {
        kind: out.kind,
        setup: out.structured.setup ?? null,
        symbol: out.structured.symbol,
        r: out.structured.r,
        tags: [...out.structured.tags].sort(),
        clarify: !!out.clarify,
      };
      const want: Partial<Record<Field, unknown>> = { kind: c.kind };
      if (c.setup !== undefined) want.setup = c.setup;
      if (c.symbol) want.symbol = c.symbol;
      if (c.r !== undefined) want.r = c.r;
      if (c.tags) want.tags = [...c.tags].sort();
      if (c.clarify !== undefined) want.clarify = c.clarify;

      for (const k of Object.keys(want) as Field[]) {
        tally[k][1]++;
        if (JSON.stringify(got[k]) === JSON.stringify(want[k])) tally[k][0]++;
      }
      expect(Object.fromEntries(Object.keys(want).map((k) => [k, got[k as Field]]))).toEqual(want);
    });
  }

  afterAll(() => {
    const parts = (Object.keys(tally) as Field[]).map((k) => `${k} ${Math.round((tally[k][0] / Math.max(1, tally[k][1])) * 100)}%`);
    const [ok, n] = Object.values(tally).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
    process.stdout.write(`\n  Extraction eval, overall ${Math.round((ok / n) * 100)}% · ${parts.join(' · ')} (${CASES.length} notes)\n`);
  });
});
