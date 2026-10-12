import { afterAll, describe, expect, it } from 'vitest';
import { describeRule } from '../src/lib/rules/describe';
import { parseRuleText } from '../src/lib/rules/parse';
import type { RuleBody } from '../src/lib/rules/types';

/**
 * Rule parsing eval: plain words → the trader's rule, on the device.
 * `null` means Proof must not guess; it hands the words to the AI instead,
 * and the trader confirms either way.
 */
const CASES: [string, RuleBody | null][] = [
  ['Max 2 trades a day', { kind: 'maxTrades', params: { max: 2 } }],
  ['no more than 3 trades per day', { kind: 'maxTrades', params: { max: 3 } }],
  ['Only one trade a day', { kind: 'maxTrades', params: { max: 1 } }],
  ['I want to take at most two trades each day', { kind: 'maxTrades', params: { max: 2 } }],
  ['maximum of 4 trades', { kind: 'maxTrades', params: { max: 4 } }],
  ['Limit to 5 trades per session', { kind: 'maxTrades', params: { max: 5 } }],
  ['Stop after 2 losses in a row', { kind: 'lossStreak', params: { max: 2 } }],
  ['stop trading after three consecutive losses', { kind: 'lossStreak', params: { max: 3 } }],
  ['Walk away after 2 losing trades', { kind: 'lossStreak', params: { max: 2 } }],
  ['3 losers and I’m done', { kind: 'lossStreak', params: { max: 3 } }],
  ['done for the day after a loss', { kind: 'lossStreak', params: { max: 1 } }],
  ['Stop for the day after losing $200', { kind: 'dailyLoss', params: { amount: 200, unit: 'money' } }],
  ['daily loss limit of 2R', { kind: 'dailyLoss', params: { amount: 2, unit: 'r' } }],
  ['If I’m down $150 I stop', { kind: 'dailyLoss', params: { amount: 150, unit: 'money' } }],
  ['never lose more than 300 dollars in a day', { kind: 'dailyLoss', params: { amount: 300, unit: 'money' } }],
  ['stop if I lose 1.5R today', { kind: 'dailyLoss', params: { amount: 1.5, unit: 'r' } }],
  ['max daily loss $1k', { kind: 'dailyLoss', params: { amount: 1000, unit: 'money' } }],
  ['No trading on Fridays', { kind: 'noTrading', params: { sessions: [], days: [5] } }],
  ['don’t trade the New York session', { kind: 'noTrading', params: { sessions: ['New York'], days: [] } }],
  ['Never trade at weekends', { kind: 'noTrading', params: { sessions: [], days: [0, 6] } }],
  ['no trading Monday or Friday', { kind: 'noTrading', params: { sessions: [], days: [1, 5] } }],
  ['Stay out of the Asian session', { kind: 'noTrading', params: { sessions: ['Asian'], days: [] } }],
  ['I don’t trade London on Mondays', { kind: 'noTrading', params: { sessions: ['London'], days: [1] } }],
  // Things Proof can't hold on the device: don't guess.
  ['Stop if I lose 2% of my account', null],
  ['No trading during news', null],
  ['Always use a stop loss', null],
  ['Be patient and wait for my setup', null],
];

let ok = 0;
describe('eval: rule parsing', () => {
  for (const [text, want] of CASES) {
    it(text, () => {
      const got = parseRuleText(text);
      if (JSON.stringify(got) === JSON.stringify(want)) ok++;
      expect(got).toEqual(want);
      // Whatever is understood can be read back to the trader in plain words.
      if (got) expect(describeRule(got)).toMatch(/^(Max|Stop|No trading)/);
    });
  }
  afterAll(() => process.stdout.write(`\n  Rule parsing eval, ${Math.round((ok / CASES.length) * 100)}% (${CASES.length} phrasings)\n`));
});
