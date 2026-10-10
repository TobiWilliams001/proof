import type { Trade } from '../types';

/**
 * One contract for every trade source (brief §8). Real adapters run
 * server-side with encrypted, read-only credentials; the client only ever
 * sees account metadata and synced trades.
 */
export interface TradeSyncAdapter<Creds = unknown> {
  platform: Platform;
  connect(creds: Creds): Promise<{ accountId: string; displayName: string }>;
  initialImport(accountId: string): Promise<Trade[]>;
  incrementalSync(accountId: string, since: string): Promise<Trade[]>;
  /** Must delete stored credentials, not just stop syncing. */
  disconnect(accountId: string): Promise<void>;
}

export type Platform = 'ctrader' | 'mt5' | 'bybit' | 'binance';

export interface PlatformInfo {
  id: Platform;
  name: string;
  via: string;
  credential: string;
  status: 'planned' | 'available';
}

export const PLATFORMS: PlatformInfo[] = [
  { id: 'ctrader', name: 'cTrader', via: 'Sign in with cTrader', credential: 'Read-only', status: 'planned' },
  { id: 'mt5', name: 'MetaTrader 4 / 5', via: 'Your investor password', credential: 'Read-only', status: 'planned' },
  { id: 'bybit', name: 'Bybit', via: 'A read-only API key from Bybit', credential: 'Read-only', status: 'planned' },
  { id: 'binance', name: 'Binance', via: 'A read-only API key from Binance', credential: 'Read-only', status: 'planned' },
];
