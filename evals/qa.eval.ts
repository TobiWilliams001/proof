import { afterAll, describe, expect, it } from 'vitest';
import { answerQuestion } from '../src/lib/ask';
import { DEMO_PLAYBOOK } from '../src/lib/demo';
import { ENTRIES, NOW, TRADES } from './fixture';

/**
 * Ask-your-journal eval: answer accuracy + citation correctness.
 * `contains` = strings the answer text must include (the computed figure).
 * `trades` / `entries` = the exact set of cited ids.
 */
interface Case {
  q: string;
  contains: string[];
  trades?: string[];
  entries?: string[];
  unsure?: boolean;
}

const CASES: Case[] = [
  // Best setup by total R is 3-touch (+4.5R: 2.5 + 3 − 1 + 0); 2 of its 4 trades won.
  { q: "What's my win rate on my best setup?", contains: ['3-touch', '50%', '2 wins out of 4'], trades: ['t1', 't4', 't7', 't10'] },
  { q: 'Which setup makes me the most R?', contains: ['3-touch', '+4.5R', 'Footprint'], trades: ['t1', 't4', 't7', 't10'] },
  // October GBPJPY: −1, +3, −0.5 → 1 win of 3.
  { q: "What's my win rate on GBPJPY this month?", contains: ['33%', '1 wins out of 3'], trades: ['t2', 't4', 't6'] },
  // Tired trades: −1, −0.5, −1.5 → 0% and −1.0R avg. Others: 7 trades.
  { q: "How do I perform when I log 'tired'?", contains: ['0%', '−1.0R', 'other 7'], trades: ['t2', 't6', 't9'] },
  { q: 'How do I do when I’m tired?', contains: ['−1.0R'], trades: ['t2', 't6', 't9'] },
  // October P&L: 250 − 100 + 150 + 300 − 100 − 50 = 450.
  { q: "What's my P&L this month?", contains: ['+$450'], trades: ['t1', 't2', 't3', 't4', 't5', 't6'] },
  // By pair: EURUSD +0.5, GBPJPY 0, XAUUSD +1.5, NAS100 +2 → worst is GBPJPY.
  { q: 'Which pair costs me the most?', contains: ['GBPJPY'], trades: ['t2', 't4', 't6', 't9'] },
  { q: 'Which pair makes me the most?', contains: ['NAS100', '+2.0R'], trades: ['t8'] },
  { q: 'How many trades did I take this week?', contains: ['6'], trades: ['t1', 't2', 't3', 't4', 't5', 't6'] },
  // Longs: 2.5 + 1.5 + 3 − 1 + 2 − 1.5 = 6.5 over 6 → 1.08 → +1.1R.
  { q: "What's my average R on longs?", contains: ['+1.1R'], trades: ['t1', 't3', 't4', 't7', 't8', 't9'] },
  { q: "What's my win rate on Footprint?", contains: ['100%'], trades: ['t3', 't8'] },
  { q: 'Win rate on shorts last month', contains: ['0%', '0 wins out of 1'], trades: ['t10'] },
  { q: 'What do I keep saying about early entries?', contains: ['2 time'], entries: ['e2', 'e5'], trades: ['t6', 't5'] },
  { q: 'What did I write about patience?', contains: ['patience'], unsure: true },
  { q: "What's my win rate on USDCAD?", contains: ['No trades match'], trades: [], unsure: true },
  // Regressions: straight apostrophes are not quotes; "when I log X" captures X; periods filter notes.
  { q: "What's my win rate when I'm tired? It's been rough", contains: ['−1.0R'], trades: ['t2', 't6', 't9'] },
  { q: 'How do I do when I log tired', contains: ['−1.0R'], trades: ['t2', 't6', 't9'] },
  // Both early-entry notes are from this week, so "last week" must find none, and must not search for "last week".
  { q: 'What did I write about early entries last week?', contains: ["haven't written about “early entries”"], entries: [], unsure: true },
  // Quant basics, worked by hand from the fixture (oldest first):
  // P&L −100, +200, −150, 0, +250, −100, +150, +300, −100, −50 → net +400 over 10.
  { q: "What's my expectancy?", contains: ['+0.4R', '+$40', '10 trades'], trades: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'] },
  // Equity peaks at +100 after t8, falls to −50 after t9: $150 (R: +1 → −0.5 = 1.5R). Back above +100 two trades later.
  { q: "What's my biggest drawdown?", contains: ['$150', '(1.5R)', 'back at your high 2 trades later'], trades: ['t9'] },
  { q: "What's my longest losing streak?", contains: ['2 trades in a row'], trades: ['t5', 't6'] },
  // Every pair is flat or up, so the "worst" answer must not claim it costs money.
  { q: 'Which pair costs me the most?', contains: ['makes you the least R'] },
];

const results: { q: string; answer: boolean; citations: boolean }[] = [];

describe('eval: ask your journal', () => {
  for (const c of CASES) {
    it(c.q, () => {
      const a = answerQuestion(c.q, { trades: TRADES, entries: ENTRIES }, DEMO_PLAYBOOK, NOW);
      const answerOk = c.contains.every((s) => a.text.includes(s)) && (c.unsure === undefined || !!a.unsure === c.unsure);
      const citeOk =
        (c.trades === undefined || [...a.tradeIds].sort().join() === [...c.trades].sort().join()) &&
        (c.entries === undefined || [...a.entryIds].sort().join() === [...c.entries].sort().join());
      results.push({ q: c.q, answer: answerOk, citations: citeOk });
      expect({ text: a.text, ok: answerOk }).toMatchObject({ ok: true });
      expect({ trades: a.tradeIds, entries: a.entryIds, ok: citeOk }).toMatchObject({ ok: true });
    });
  }

  afterAll(() => {
    const pct = (k: 'answer' | 'citations') => Math.round((results.filter((r) => r[k]).length / results.length) * 100);
    process.stdout.write(`\n  Q&A eval, answer accuracy ${pct('answer')}% · citation correctness ${pct('citations')}% (${results.length} questions)\n`);
  });
});
