import { afterAll, describe, expect, it } from 'vitest';
import { getProvider } from '../src/lib/ai/provider';
import { rulePrompt } from '../src/lib/rules/prompt';
import { toRuleBody } from '../src/lib/rules/validate';
import type { RuleBody } from '../src/lib/rules/types';

/**
 * Rule parsing with the AI, for phrasings the device doesn't handle. Runs only
 * when ANTHROPIC_API_KEY is set, so the default eval run stays offline and free.
 */
const CASES: [string, RuleBody | null][] = [
  ['Once I have taken two trades I am finished for the day', { kind: 'maxTrades', params: { max: 2 } }],
  ['If the day goes red by more than a hundred and fifty bucks I close the platform', { kind: 'dailyLoss', params: { amount: 150, unit: 'money' } }],
  ['After back-to-back stop outs, shut it down', { kind: 'lossStreak', params: { max: 2 } }],
  ['Fridays are off limits for me', { kind: 'noTrading', params: { sessions: [], days: [5] } }],
  ['Stop if I lose 2% of my account', null],
  ['Always wait for confirmation', null],
];

const live = !!process.env.ANTHROPIC_API_KEY;
let ok = 0;
describe.skipIf(!live)('eval: rule parsing with AI', () => {
  for (const [text, want] of CASES) {
    it(text, async () => {
      const raw = await getProvider().json<{ kind?: unknown; params?: unknown }>(rulePrompt(text), { temperature: 0, maxTokens: 200 });
      const got = toRuleBody(raw.kind, raw.params);
      if (JSON.stringify(got) === JSON.stringify(want)) ok++;
      expect(got).toEqual(want);
    }, 20000);
  }
  afterAll(() => process.stdout.write(`\n  Rule parsing with AI, ${Math.round((ok / CASES.length) * 100)}% (${CASES.length} phrasings)\n`));
});
