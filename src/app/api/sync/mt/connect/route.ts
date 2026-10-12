import { randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { countAccounts, createAccount, deploy, SyncError } from '@/lib/sync/metaapi';
import { seal, syncConfigured } from '@/lib/sync/seal';

export const maxDuration = 60;

// Each connected account costs money at the sync provider, and this route is
// public until sign-in exists, so the total is capped.
const MAX_ACCOUNTS = Number(process.env.SYNC_MAX_ACCOUNTS ?? 3);

interface Body {
  platform: 'mt4' | 'mt5';
  login: string;
  password: string;
  server: string;
  name?: string;
  transactionId?: string;
}

export async function POST(req: NextRequest) {
  const who = await requireUser(req);
  if ('response' in who) return who.response;
  if (!syncConfigured()) return NextResponse.json({ problem: 'not_configured' }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Body | null;
  if (
    !b ||
    (b.platform !== 'mt4' && b.platform !== 'mt5') ||
    !/^\d{3,12}$/.test(String(b.login ?? '').trim()) ||
    !b.password ||
    String(b.password).length > 64 ||
    !b.server ||
    String(b.server).length > 100
  ) {
    return NextResponse.json({ problem: 'invalid' }, { status: 400 });
  }

  try {
    // Only a brand-new connection counts against the cap, not a retry of one in progress.
    if (!b.transactionId && (await countAccounts()) >= MAX_ACCOUNTS) {
      return NextResponse.json({ problem: 'limit_reached' }, { status: 409 });
    }
    const transactionId = b.transactionId && /^[a-f0-9]{32}$/.test(b.transactionId) ? b.transactionId : randomBytes(16).toString('hex');
    const login = String(b.login).trim();
    const server = String(b.server).trim();
    const name = (b.name?.trim() || `${b.platform.toUpperCase()} ${login}`).slice(0, 60);

    // Broker detection can take a minute; keep asking within this request when we can.
    const deadline = Date.now() + 45_000;
    for (;;) {
      const r = await createAccount({ login, password: String(b.password), server, platform: b.platform, name, transactionId });
      if (r.account) {
        if (r.account.state !== 'DEPLOYED') await deploy(r.account.id);
        const localId = randomUUID().slice(0, 8);
        return NextResponse.json({
          status: 'connected',
          sealed: seal({ v: 1, provider: 'metaapi', id: r.account.id, localId, platform: b.platform }),
          account: { localId, platform: b.platform, login, server, name },
        });
      }
      const wait = (r.pending?.retryAfterSeconds ?? 30) * 1000;
      if (Date.now() + wait > deadline) {
        return NextResponse.json({ status: 'pending', transactionId, retryAfterSeconds: r.pending?.retryAfterSeconds ?? 30 });
      }
      await new Promise((res) => setTimeout(res, wait));
    }
  } catch (err) {
    if (err instanceof SyncError) {
      const detail = err.detail as { serversByBrokers?: Record<string, string[]> } | undefined;
      const suggestions = detail?.serversByBrokers ? Object.values(detail.serversByBrokers).flat().slice(0, 6) : undefined;
      return NextResponse.json({ problem: err.problem, suggestions }, { status: 400 });
    }
    console.error('[sync/connect]', (err as Error).message);
    return NextResponse.json({ problem: 'unavailable' }, { status: 502 });
  }
}
