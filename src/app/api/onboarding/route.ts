import { NextRequest, NextResponse } from 'next/server';
import { ALLOWED } from '@/lib/onboarding/questions';

/**
 * Welcome answers, forwarded to ONBOARDING_WEBHOOK_URL (a sheet or form
 * service) so you can see who your traders are. Only the answers are sent: no
 * trades, notes or names, and an email only if the trader asked to chat.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const one = (v: unknown, key: keyof typeof ALLOWED) => (typeof v === 'string' && ALLOWED[key].has(v) ? v : undefined);

export async function POST(req: NextRequest) {
  const hook = process.env.ONBOARDING_WEBHOOK_URL;
  if (!hook) return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ ok: false }, { status: 400 });

  const markets = Array.isArray(b.markets) ? b.markets.filter((m): m is string => typeof m === 'string' && ALLOWED.markets.has(m)) : [];
  const chat = b.chat === true;
  const email = chat && typeof b.email === 'string' && EMAIL_RE.test(b.email) && b.email.length <= 254 ? b.email : undefined;
  const payload = {
    markets: markets.join(', '),
    account: one(b.account, 'account'),
    platform: one(b.platform, 'platform'),
    journalNow: one(b.journalNow, 'journalNow'),
    // Free text, so kept short and plain.
    journalApp: typeof b.journalApp === 'string' ? b.journalApp.replace(/[^\p{L}\p{N} .&+-]/gu, '').slice(0, 40) : undefined,
    goal: one(b.goal, 'goal'),
    chat,
    email,
    at: new Date().toISOString(),
  };

  try {
    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json({ ok: res.ok });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
