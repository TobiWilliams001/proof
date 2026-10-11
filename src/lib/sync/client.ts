'use client';

import type { SyncAccount, Trade } from '../types';

/** Browser side of MetaTrader sync. The password is sent once, to connect, and never kept. */

export type ConnectResult =
  | { status: 'connected'; sealed: string; account: Pick<SyncAccount, 'localId' | 'platform' | 'login' | 'server' | 'name'> }
  | { status: 'pending'; transactionId: string; retryAfterSeconds: number }
  | { status: 'error'; problem: string; suggestions?: string[] };

async function post<T>(path: string, body: unknown, timeoutMs = 65_000): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res.json();
}

export async function connectMt(input: {
  platform: 'mt4' | 'mt5';
  login: string;
  password: string;
  server: string;
  name?: string;
  transactionId?: string;
}): Promise<ConnectResult> {
  try {
    const r = await post<{ status?: string; problem?: string } & Record<string, unknown>>('/api/sync/mt/connect', input);
    if (r.status === 'connected' || r.status === 'pending') return r as ConnectResult;
    return { status: 'error', problem: r.problem ?? 'unavailable', suggestions: r.suggestions as string[] | undefined };
  } catch {
    return { status: 'error', problem: 'offline' };
  }
}

export type PullResult =
  | { state: 'ok'; syncedAt: string; closed: Trade[]; open: Trade[] }
  | { state: 'connecting' }
  | { state: 'error'; problem: string };

export async function pullMt(a: SyncAccount): Promise<PullResult> {
  try {
    return await post<PullResult>('/api/sync/mt/pull', { sealed: a.sealed, since: a.lastSyncedAt, sightedStops: a.stops });
  } catch {
    return { state: 'error', problem: 'offline' };
  }
}

export async function disconnectMt(a: SyncAccount): Promise<boolean> {
  try {
    return (await post<{ ok: boolean }>('/api/sync/mt/disconnect', { sealed: a.sealed }, 20_000)).ok;
  } catch {
    return false;
  }
}

/** Problems the trader can't fix by waiting, these stop automatic retries until they act. */
export const NEEDS_ACTION = new Set(['login_failed', 'server_not_found', 'otp_enabled', 'password_change', 'account_disabled', 'invalid', 'not_configured', 'limit_reached']);

/** Every sync message in plain words. */
export const SYNC_PROBLEM: Record<string, string> = {
  login_failed: 'That account number or password didn’t work. Use your investor password, and check both.',
  server_not_found: 'We couldn’t find that server. Type it exactly as MetaTrader shows it.',
  otp_enabled: 'Your account asks for a one-time code at login. Turn that off in your broker’s app, then try again.',
  password_change: 'Your broker wants you to change your password first. Do that in MetaTrader, then try again.',
  account_disabled: 'Your broker says this account is closed or switched off.',
  busy: 'Importing is busy right now. We’ll try again in a moment.',
  limit_reached: 'Proof can’t connect more accounts right now.',
  not_configured: 'Automatic import isn’t switched on yet.',
  unavailable: 'We couldn’t reach your broker just now. We’ll keep trying.',
  offline: 'You seem to be offline. We’ll try again when you’re back.',
  invalid: 'Check the details and try again.',
};
