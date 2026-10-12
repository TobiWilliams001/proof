import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { dealsByPosition, dealsByTime, deploy, positions, readAccount, SyncError } from '@/lib/sync/metaapi';
import { dealsToTrades, positionsToOpenTrades } from '@/lib/sync/mt-map';
import { syncConfigured, unseal } from '@/lib/sync/seal';

export const maxDuration = 60;

interface Sealed {
  v: 1;
  provider: 'metaapi';
  id: string;
  localId: string;
  platform: 'mt4' | 'mt5';
}

const BACKFILL_DAYS = 90;
// Re-read a little history every time; ids make re-reads harmless and catch late deals.
const OVERLAP_MS = 7 * 24 * 3600_000;

export async function POST(req: NextRequest) {
  const who = await requireUser(req);
  if ('response' in who) return who.response;
  if (!syncConfigured()) return NextResponse.json({ state: 'error', problem: 'not_configured' }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { sealed?: string; since?: string; sightedStops?: Record<string, number> } | null;
  const acc = b?.sealed ? unseal<Sealed>(b.sealed) : null;
  if (!acc) return NextResponse.json({ state: 'error', problem: 'invalid' }, { status: 400 });

  try {
    const info = await readAccount(acc.id);
    if (info.state !== 'DEPLOYED') {
      if (info.state === 'UNDEPLOYED') await deploy(acc.id);
      return NextResponse.json({ state: 'connecting' });
    }
    if (info.connectionStatus !== 'CONNECTED') return NextResponse.json({ state: 'connecting' });

    const now = new Date();
    const since = b?.since && !Number.isNaN(Date.parse(b.since)) ? new Date(Date.parse(b.since) - OVERLAP_MS) : new Date(now.getTime() - BACKFILL_DAYS * 864e5);
    const opts = { accountId: acc.localId, sightedStops: b?.sightedStops ?? {} };

    const [deals, open] = await Promise.all([
      dealsByTime(info.region, acc.id, since.toISOString(), new Date(now.getTime() + 60_000).toISOString()),
      positions(info.region, acc.id),
    ]);
    let mapped = dealsToTrades(deals, opts);
    // A close inside the window whose open was before it: fetch that position's deals.
    if (mapped.missingEntry.length) {
      const extra = await Promise.all(mapped.missingEntry.slice(0, 50).map((p) => dealsByPosition(info.region, acc.id, p)));
      mapped = dealsToTrades([...deals, ...extra.flat()], opts);
    }
    return NextResponse.json({
      state: 'ok',
      syncedAt: now.toISOString(),
      closed: mapped.trades,
      open: positionsToOpenTrades(open, opts),
    });
  } catch (err) {
    if (err instanceof SyncError) return NextResponse.json({ state: 'error', problem: err.problem });
    console.error('[sync/pull]', (err as Error).message);
    return NextResponse.json({ state: 'error', problem: 'unavailable' });
  }
}
