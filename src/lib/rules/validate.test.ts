import { describe, expect, it } from 'vitest';
import { fromRow, toRuleBody } from './validate';

describe('toRuleBody', () => {
  it('accepts well-formed rules', () => {
    expect(toRuleBody('maxTrades', { max: 2 })).toEqual({ kind: 'maxTrades', params: { max: 2 } });
    expect(toRuleBody('dailyLoss', { amount: 150.456, unit: 'money' })).toEqual({ kind: 'dailyLoss', params: { amount: 150.46, unit: 'money' } });
    expect(toRuleBody('noTrading', { sessions: ['New York', 'Moon'], days: [5, 5, 9] })).toEqual({
      kind: 'noTrading', params: { sessions: ['New York'], days: [5] },
    });
  });

  it('rejects anything the engine could misread', () => {
    expect(toRuleBody('maxTrades', { max: 0 })).toBeNull();
    expect(toRuleBody('maxTrades', { max: 2.5 })).toBeNull();
    expect(toRuleBody('lossStreak', { max: '2' })).toBeNull();
    expect(toRuleBody('dailyLoss', { amount: -50, unit: 'money' })).toBeNull();
    expect(toRuleBody('dailyLoss', { amount: 50, unit: 'pips' })).toBeNull();
    expect(toRuleBody('noTrading', { sessions: [], days: [] })).toBeNull();
    expect(toRuleBody('blockTrades', {})).toBeNull();
  });

  it('maps a database row', () => {
    expect(fromRow({ id: 'a', kind: 'lossStreak', params: { max: 3 }, active: false, created_at: '2026-10-01T00:00:00Z' })).toEqual({
      id: 'a', kind: 'lossStreak', params: { max: 3 }, active: false, createdAt: '2026-10-01T00:00:00Z',
    });
  });
});
