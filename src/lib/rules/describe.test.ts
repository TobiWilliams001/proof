import { describe, expect, it } from 'vitest';
import { describeRule, TEMPLATES, todayLine } from './describe';

describe('describeRule', () => {
  it('reads each rule back in plain words', () => {
    expect(describeRule({ kind: 'maxTrades', params: { max: 1 } })).toBe('Max 1 trade a day');
    expect(describeRule({ kind: 'lossStreak', params: { max: 2 } })).toBe('Stop after 2 losses in a row');
    expect(describeRule({ kind: 'lossStreak', params: { max: 1 } })).toBe('Stop for the day after a loss');
    expect(describeRule({ kind: 'dailyLoss', params: { amount: 200, unit: 'money' } })).toBe('Stop for the day after losing $200');
    expect(describeRule({ kind: 'dailyLoss', params: { amount: 2, unit: 'r' } })).toBe('Stop for the day after losing 2R');
    expect(describeRule({ kind: 'noTrading', params: { sessions: [], days: [0, 6] } })).toBe('No trading at weekends');
    expect(describeRule({ kind: 'noTrading', params: { sessions: ['New York'], days: [1, 5] } })).toBe(
      'No trading on Mondays or Fridays or in the New York session',
    );
  });

  it('templates read the same as their examples', () => {
    for (const t of TEMPLATES) expect(describeRule(t.body)).toBe(t.example);
  });
});

describe('todayLine', () => {
  it('says where the rule stands today', () => {
    expect(todayLine({ kind: 'maxTrades', params: { max: 2 } }, { state: 'clear', used: 1, limit: 2 })).toBe('1 of 2 today');
    expect(todayLine({ kind: 'maxTrades', params: { max: 2 } }, { state: 'hit', used: 2, limit: 2 })).toBe('At your limit today');
    expect(todayLine({ kind: 'dailyLoss', params: { amount: 200, unit: 'money' } }, { state: 'near', used: 170, limit: 200 })).toBe('$170 of $200 today');
    expect(todayLine({ kind: 'noTrading', params: { sessions: [], days: [5] } }, { state: 'broken', used: 1, limit: 0 })).toBe('Broken today');
    expect(todayLine({ kind: 'maxTrades', params: { max: 2 } }, undefined)).toBe('Paused');
  });
});
