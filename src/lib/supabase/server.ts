import 'server-only';
import { NextResponse } from 'next/server';
import { verifyAuth } from '@supabase/server/core';

/**
 * Checks the caller is a signed-in trader. Returns their id, or a 401 response
 * to send back. Keeps paid services (AI, MetaTrader import) behind an account.
 */
export async function requireUser(req: Request): Promise<{ userId: string } | { response: NextResponse }> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return { response: NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 }) };
  const { data, error } = await verifyAuth(req, { auth: 'user', env: { url } });
  if (error || !data.userClaims) {
    return { response: NextResponse.json({ ok: false, reason: 'signed_out' }, { status: 401 }) };
  }
  return { userId: data.userClaims.id };
}
