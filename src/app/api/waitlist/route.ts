import { NextRequest, NextResponse } from 'next/server';

/**
 * Waitlist sign-up. Forwards to WAITLIST_WEBHOOK_URL (e.g. a Supabase edge
 * function or form service) so no email is stored in this app before there's
 * a database with RLS behind it.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({ email: '' }));
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  const hook = process.env.WAITLIST_WEBHOOK_URL;
  if (!hook) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  try {
    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'landing', at: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(String(res.status));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}
