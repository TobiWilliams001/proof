import { describe, expect, it } from 'vitest';
import { DEMO_PLAYBOOK } from '../demo';
import type { Trade } from '../types';
import { classify } from './intent';

const open: Trade = { id: 'o1', symbol: 'GBPUSD', side: 'short', openedAt: '2026-10-13T08:00:00Z', closedAt: '2026-10-13T08:00:00Z', status: 'open', entry: 1.27, exit: 0, size: 1, pnl: 0, r: null, session: 'London', source: 'sync' };
const ctx = { trades: [open], playbook: DEMO_PLAYBOOK };

describe('voice commands: the six things a trader asks for', () => {
  it('journal: sorts what happened into a note', () => {
    expect(classify('Journal: took the 3-touch on gold, entered early, plus 2R', ctx)).toEqual({ type: 'journal', text: 'took the 3-touch on gold, entered early, plus 2R' });
    expect(classify('Hey Proof, took the 3-touch on gold and it paid', ctx).type).toBe('journal');
  });

  it('ask: answers a question', () => {
    expect(classify('Which setup makes me the most?', ctx)).toEqual({ type: 'ask', question: 'Which setup makes me the most?' });
    expect(classify('ask how I do after a loss', ctx)).toEqual({ type: 'ask', question: 'how I do after a loss' });
  });

  it('rule: reads the rule for a yes', () => {
    expect(classify('Add a rule, max two trades a day', ctx)).toEqual({ type: 'rule', body: { kind: 'maxTrades', params: { max: 2 } }, text: 'max two trades a day' });
    expect(classify('new rule stop after 2 losses in a row', ctx)).toMatchObject({ type: 'rule', body: { kind: 'lossStreak', params: { max: 2 } } });
  });

  it('navigate: goes to the screen', () => {
    expect(classify('Show me my week', ctx)).toEqual({ type: 'navigate', to: '/review', label: 'your week' });
    expect(classify('Open my trades', ctx)).toEqual({ type: 'navigate', to: '/trades', label: 'your trades' });
    expect(classify('go to settings', ctx)).toMatchObject({ to: '/settings' });
  });

  it('experiment: opens it ready to start', () => {
    const c = classify('Start an experiment, skip Footprint for ten trades', ctx);
    expect(c).toMatchObject({ type: 'experiment', plan: { change: { kind: 'skipSetup', setup: 'Footprint' }, length: { kind: 'trades', value: 10 } } });
    expect(classify('try an experiment: no New York session for two weeks', ctx)).toMatchObject({ plan: { change: { kind: 'skipSession', session: 'New York' }, length: { kind: 'days', value: 14 } } });
    expect(classify('run an experiment only taking planned trades', ctx)).toMatchObject({ plan: { change: { kind: 'followPlan' } } });
  });

  it('plan: saves it as the plan for the open trade', () => {
    expect(classify('GBPUSD short, the plan is to hold below 1.2650', ctx)).toMatchObject({ type: 'plan', tradeId: 'o1', trade: 'GBPUSD short' });
    // With one trade open, the symbol isn't needed.
    expect(classify('my plan is to take profit at the prior low', ctx)).toMatchObject({ type: 'plan', tradeId: 'o1' });
  });
});

describe('careful with the edges', () => {
  it('a plan with no matching open trade is just a note', () => {
    expect(classify('EURUSD long, plan is to wait for the retest', ctx).type).toBe('journal');
    expect(classify('plan is to wait for the retest', { ...ctx, trades: [] }).type).toBe('journal');
  });
  it('a rule it can’t hold comes back empty, for the trader to set by hand', () => {
    expect(classify('add a rule always use a stop loss', ctx)).toMatchObject({ type: 'rule', body: null });
  });
  it('an experiment it can’t read comes back empty, to pick from templates', () => {
    expect(classify('start an experiment', ctx)).toMatchObject({ type: 'experiment', plan: null });
  });
  it('"show" with no known screen is not a navigation', () => {
    expect(classify('show some patience next time, entered early', ctx).type).toBe('journal');
  });
});
