import type { TraderProfile } from '../types';

/**
 * Traders often run more than one kind of account (a prop challenge beside a
 * personal account) and more than one platform. Answers saved before these
 * were lists are read as a list of one.
 */
export const accountsOf = (p?: Partial<TraderProfile>) => p?.accounts ?? (p?.account ? [p.account] : []);
export const platformsOf = (p?: Partial<TraderProfile>) => p?.platforms ?? (p?.platform ? [p.platform] : []);
export const usesMetaTrader = (p?: Partial<TraderProfile>) => platformsOf(p).some((x) => x === 'MT4' || x === 'MT5');
/** For the connect form: MT4 only when that's the only MetaTrader they named. */
export const preferredMt = (p?: Partial<TraderProfile>): 'mt4' | 'mt5' => {
  const ps = platformsOf(p);
  return ps.includes('MT4') && !ps.includes('MT5') ? 'mt4' : 'mt5';
};
