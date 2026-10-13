import { describe, expect, it } from 'vitest';
import { accountsOf, platformsOf, preferredMt, usesMetaTrader } from './profile';
import { suggestRules } from './suggestRules';

describe('more than one account and platform', () => {
  it('reads lists, and old single answers as a list of one', () => {
    expect(accountsOf({ accounts: ['Personal', 'Prop challenge'] })).toEqual(['Personal', 'Prop challenge']);
    expect(accountsOf({ account: 'Personal' })).toEqual(['Personal']);
    expect(platformsOf({})).toEqual([]);
  });
  it('knows when MetaTrader is one of them', () => {
    expect(usesMetaTrader({ platforms: ['cTrader', 'MT5'] })).toBe(true);
    expect(usesMetaTrader({ platforms: ['TradingView'] })).toBe(false);
    expect(preferredMt({ platforms: ['MT4'] })).toBe('mt4');
    expect(preferredMt({ platforms: ['MT4', 'MT5'] })).toBe('mt5');
  });
  it('suggests a daily loss limit when any of their accounts is a prop account', () => {
    expect(suggestRules({ accounts: ['Personal', 'Funded prop account'] })[0].kind).toBe('dailyLoss');
  });
});
