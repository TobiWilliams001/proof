import { describe, expect, it } from 'vitest';
import { introState } from './intro';

const none = { onboarded: false, toured: false };

describe('welcome and tour, checked on the account', () => {
  it('a new account gets the welcome first, then the tour', () => {
    expect(introState({}, none)).toEqual({ needsWelcome: true, needsTour: false });
    expect(introState({}, { onboarded: true, toured: false })).toEqual({ needsWelcome: false, needsTour: true });
    expect(introState({}, { onboarded: true, toured: true })).toEqual({ needsWelcome: false, needsTour: false });
  });

  it('the account flags win after “delete everything” clears the journal', () => {
    expect(introState({}, { onboarded: true, toured: true })).toEqual({ needsWelcome: false, needsTour: false });
  });

  it('the journal’s own copy covers offline, when the account can’t be reached', () => {
    expect(introState({ intro: { welcomedAt: 'x' } }, null)).toEqual({ needsWelcome: false, needsTour: true });
    expect(introState({ intro: { welcomedAt: 'x', touredAt: 'y' } }, null)).toEqual({ needsWelcome: false, needsTour: false });
  });

  it('traders who answered before the flags existed see neither again', () => {
    const profile = { markets: ['Forex'], answeredAt: '2026-10-01T00:00:00Z' };
    expect(introState({ profile }, null)).toEqual({ needsWelcome: false, needsTour: false });
    expect(introState({ profile }, none)).toEqual({ needsWelcome: false, needsTour: false });
  });
});
