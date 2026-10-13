import { describe, expect, it } from 'vitest';
import { suggestRules } from './suggestRules';

describe('rules suggested in the welcome', () => {
  it('leads with a daily loss limit for prop traders', () => {
    expect(suggestRules({ account: 'Prop challenge' })[0].kind).toBe('dailyLoss');
    expect(suggestRules({ goal: 'Pass a challenge' })[0].kind).toBe('dailyLoss');
  });
  it('offers a stop and a cap to everyone else', () => {
    expect(suggestRules({ account: 'Personal', goal: 'Find my edge' }).map((r) => r.kind)).toEqual(['lossStreak', 'maxTrades']);
  });
});
