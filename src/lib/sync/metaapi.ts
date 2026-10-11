import 'server-only';
import type { MtDeal, MtPosition } from './mt-map';

/**
 * Thin REST client for MetaApi (cloud MetaTrader). REST rather than the socket
 * SDK, because Vercel functions are short-lived. Endpoints per metaapi.cloud docs.
 */

const PROVISIONING = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
const clientApi = (region: string) => `https://mt-client-api-v1.${region}.agiliumtrade.ai`;

/** Problems a trader can act on, in Proof's own words (see SYNC_PROBLEM in the UI). */
export type SyncProblem =
  | 'login_failed'
  | 'server_not_found'
  | 'otp_enabled'
  | 'password_change'
  | 'account_disabled'
  | 'busy'
  | 'limit_reached'
  | 'not_configured'
  | 'unavailable';

export class SyncError extends Error {
  constructor(public problem: SyncProblem, public detail?: unknown) {
    super(problem);
  }
}

function token(): string {
  const t = process.env.METAAPI_TOKEN;
  if (!t) throw new SyncError('not_configured');
  return t;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<{ status: number; body: T; headers: Headers }> {
  const res = await fetch(url, {
    ...init,
    headers: { 'auth-token': token(), Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(25_000),
    cache: 'no-store',
  });
  const text = await res.text();
  const body = (text ? JSON.parse(text) : null) as T;
  if (res.status === 429) throw new SyncError('busy');
  if (res.status >= 400) {
    const err = body as { details?: unknown; error?: string; message?: string } | null;
    const code = typeof err?.details === 'string' ? err.details : (err?.details as { code?: string })?.code;
    const map: Record<string, SyncProblem> = {
      E_AUTH: 'login_failed',
      E_SRV_NOT_FOUND: 'server_not_found',
      ERR_OTP_REQUIRED: 'otp_enabled',
      E_PASSWORD_CHANGE_REQUIRED: 'password_change',
      E_TRADING_ACCOUNT_DISABLED: 'account_disabled',
    };
    throw new SyncError(map[code ?? ''] ?? 'unavailable', err);
  }
  return { status: res.status, body, headers: res.headers };
}

export interface CreateResult {
  pending?: { transactionId: string; retryAfterSeconds: number };
  account?: { id: string; state: string };
}

/**
 * Creates the cloud account. MetaApi checks the login with the broker here, so a
 * wrong password or server fails immediately rather than silently later.
 * Broker detection can take a while: a 202 means "ask again with the same id".
 */
export async function createAccount(input: {
  login: string;
  password: string;
  server: string;
  platform: 'mt4' | 'mt5';
  name: string;
  transactionId: string;
}): Promise<CreateResult> {
  const { status, body, headers } = await call<{ id: string; state: string }>(`${PROVISIONING}/users/current/accounts`, {
    method: 'POST',
    headers: { 'transaction-id': input.transactionId },
    body: JSON.stringify({
      login: input.login,
      password: input.password,
      server: input.server,
      platform: input.platform,
      name: input.name,
      magic: 0,
      type: 'cloud-g2',
    }),
  });
  if (status === 202) {
    return { pending: { transactionId: input.transactionId, retryAfterSeconds: Number(headers.get('retry-after')) || 30 } };
  }
  return { account: body };
}

export async function countAccounts(): Promise<number> {
  const { body } = await call<unknown[]>(`${PROVISIONING}/users/current/accounts?limit=1000`);
  return Array.isArray(body) ? body.length : 0;
}

export async function readAccount(id: string) {
  const { body } = await call<{ state: string; connectionStatus: string; region: string }>(
    `${PROVISIONING}/users/current/accounts/${encodeURIComponent(id)}`,
  );
  return body;
}

export async function deploy(id: string) {
  await call(`${PROVISIONING}/users/current/accounts/${encodeURIComponent(id)}/deploy`, { method: 'POST' });
}

export async function removeAccount(id: string) {
  // Deleting also stops it running; credentials are gone from MetaApi after this.
  await call(`${PROVISIONING}/users/current/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function dealsByTime(region: string, id: string, from: string, to: string): Promise<MtDeal[]> {
  const out: MtDeal[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const { body } = await call<MtDeal[]>(
      `${clientApi(region)}/users/current/accounts/${encodeURIComponent(id)}/history-deals/time/${from}/${to}?offset=${offset}&limit=1000`,
    );
    out.push(...body);
    if (body.length < 1000) break;
  }
  return out;
}

export async function dealsByPosition(region: string, id: string, positionId: string): Promise<MtDeal[]> {
  const { body } = await call<MtDeal[]>(
    `${clientApi(region)}/users/current/accounts/${encodeURIComponent(id)}/history-deals/position/${encodeURIComponent(positionId)}`,
  );
  return body;
}

export async function positions(region: string, id: string): Promise<MtPosition[]> {
  const { body } = await call<MtPosition[]>(`${clientApi(region)}/users/current/accounts/${encodeURIComponent(id)}/positions`);
  return body;
}
