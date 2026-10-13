import { describe, expect, it } from 'vitest';
import { introState } from './intro';

describe('welcome and tour, per account', () => {
  it('a new account gets the welcome first, then the tour', () => {
    expect(introState({})).toEqual({ needsWelcome: true, needsTour: false });
    expect(introState({ intro: { welcomedAt: '2026-10-13T10:00:00Z' } })).toEqual({ needsWelcome: false, needsTour: true });
    expect(introState({ intro: { welcomedAt: 'x', touredAt: 'y' } })).toEqual({ needsWelcome: false, needsTour: false });
  });

  it('skipping the welcome still counts as welcomed, so the tour follows', () => {
    expect(introState({ intro: { welcomedAt: 'x' } }).needsTour).toBe(true);
  });

  it('traders from before, who already answered, see neither again', () => {
    expect(introState({ profile: { markets: ['Forex'], answeredAt: '2026-10-01T00:00:00Z' } })).toEqual({ needsWelcome: false, needsTour: false });
  });
});
