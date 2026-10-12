import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { removeAccount, SyncError } from '@/lib/sync/metaapi';
import { syncConfigured, unseal } from '@/lib/sync/seal';

export async function POST(req: NextRequest) {
  const who = await requireUser(req);
  if ('response' in who) return who.response;
  if (!syncConfigured()) return NextResponse.json({ ok: false, problem: 'not_configured' }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { sealed?: string } | null;
  const acc = b?.sealed ? unseal<{ id: string }>(b.sealed) : null;
  if (!acc) return NextResponse.json({ ok: false, problem: 'invalid' }, { status: 400 });
  try {
    await removeAccount(acc.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Already gone counts as done.
    if (err instanceof SyncError && err.problem === 'unavailable') return NextResponse.json({ ok: true });
    return NextResponse.json({ ok: false, problem: err instanceof SyncError ? err.problem : 'unavailable' }, { status: 502 });
  }
}
