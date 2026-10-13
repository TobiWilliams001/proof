import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_PLAYBOOK } from '../src/lib/demo';
import type { Trade } from '../src/lib/types';
import { classify, type Command } from '../src/lib/voice/intent';

/** Voice command eval: what people say out loud → what Proof does. Scored on the type, and where it matters, the target. */
const open: Trade = { id: 'o1', symbol: 'XAUUSD', side: 'long', openedAt: '2026-10-13T08:00:00Z', closedAt: '2026-10-13T08:00:00Z', status: 'open', entry: 2340, exit: 0, size: 1, pnl: 0, r: null, session: 'London', source: 'sync' };
const ctx = { trades: [open], playbook: DEMO_PLAYBOOK };

const CASES: [string, Command['type'], string?][] = [
  ['journal took a clean three touch on euro, held to target', 'journal'],
  ['note: tired today, cutting size', 'journal'],
  ['revenge traded after the stop out, not proud of it', 'journal'],
  ['missed the footprint on gold, would have been four R', 'journal'],
  ['hey proof, which pair costs me the most?', 'ask'],
  ['what is my win rate this week', 'ask'],
  ['how do I do when I follow my plan', 'ask'],
  ['do I make money on shorts', 'ask'],
  ['how much did I make this month', 'ask'],
  ['add a rule no trading on Fridays', 'rule'],
  ['set a rule to stop after three losses', 'rule'],
  ['create a rule: daily loss limit 200 dollars', 'rule'],
  ['show me my week', 'navigate', '/review'],
  ['open the calculator', 'navigate', '/calculator'],
  ['take me to my playbook', 'navigate', '/playbook'],
  ['go to my journal', 'navigate', '/journal'],
  ['bring up my trades', 'navigate', '/trades'],
  ['start an experiment skip breakout retest for twenty trades', 'experiment'],
  ['begin an experiment checking for early entry before I enter', 'experiment'],
  ['gold long, the plan is to hold above 2,330', 'plan'],
  ['the plan for this one is to trail under the last swing', 'plan'],
];

let ok = 0;
describe('eval: voice commands', () => {
  for (const [said, type, to] of CASES) {
    it(said, () => {
      const c = classify(said, ctx);
      const right = c.type === type && (!to || (c.type === 'navigate' && c.to === to));
      if (right) ok++;
      expect({ type: c.type, to: c.type === 'navigate' ? c.to : undefined }).toEqual({ type, to });
    });
  }
  afterAll(() => process.stdout.write(`\n  Voice command eval, ${Math.round((ok / CASES.length) * 100)}% (${CASES.length} requests)\n`));
});
