import type { Trade } from '../types';

/**
 * One contract for every trade source (brief §8). Real adapters run
 * server-side with encrypted, read-only credentials; the client only ever
 * sees account metadata and synced trades.
 */
export interface TradeSyncAdapter<Creds = unknown> {
  platform: Platform;
  /**
   * Must verify the credentials (read-only) before returning, never accept
   * credentials that will fail later, silently.
   */
  connect(creds: Creds): Promise<{ accountId: string; displayName: string }>;
  /**
   * Open positions as first seen. The stop must be captured here: platforms keep
   * only the current SL, and R needs the original one. This is also the moment
   * Proof asks "What's the plan?".
   */
  openPositions(accountId: string): Promise<Trade[]>;
  initialImport(accountId: string): Promise<Trade[]>;
  /**
   * Closed trades since a point in time. Rules every adapter follows:
   * - one position = one Trade; partial closes roll up, every deal id kept in `platform`
   * - timestamps converted to UTC using the server's detected offset (MT servers run
   *   on broker time and shift with DST), never a global user timezone setting
   * - commissions and swap included in pnl, so numbers reconcile with the platform
   */
  incrementalSync(accountId: string, since: string): Promise<Trade[]>;
  /** When sync last succeeded and whether it's healthy, shown to the trader, never hidden. */
  health(accountId: string): Promise<{ lastSyncedAt: string | null; ok: boolean; problem?: string }>;
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
