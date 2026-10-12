import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { AIUnavailableError, getProvider } from '@/lib/ai/provider';
import { constrainToPlaybook } from '@/lib/structure';
import type { EntryKind, Playbook, Structured, Trade } from '@/lib/types';

/**
 * Typed AI tasks only, no free-form prompt proxy. Output is validated and
 * constrained to the trader's own playbook before it leaves the server.
 */

const KINDS: EntryKind[] = ['trade_note', 'missed', 'rule_break', 'plan', 'reflection'];
const MAX_TEXT = 4000;

type Body =
  | { task: 'note'; text: string; playbook: Playbook; trade?: Pick<Trade, 'symbol' | 'side' | 'r' | 'setup'> }
  | { task: 'playbook'; text: string };

function notePrompt(text: string, playbook: Playbook, trade?: unknown) {
  return `You map a trader's journal note onto THEIR OWN playbook. Never invent setups, tags or field values that are not listed.

Playbook setups: ${JSON.stringify(playbook.setups.map((s) => ({ name: s.name, aliases: s.aliases, description: s.description })))}
Playbook tags: ${JSON.stringify(playbook.tags)}
Custom fields: ${JSON.stringify(playbook.fields)}
Linked trade (from the platform, authoritative): ${trade ? JSON.stringify(trade) : 'none'}

Note: """${text}"""

Kinds: trade_note (about a taken trade), missed (saw it, didn't take it), rule_break, plan (future intent), reflection (state of mind/session).
Return JSON: {"kind": one of the kinds, "symbol": string|null, "side": "long"|"short"|null, "setup": exact playbook setup name|null, "r": number|null, "tags": [exact playbook tags], "fields": {fieldName: value}, "confidence": 0..1}`;
}

function playbookPrompt(text: string) {
  return `A trader described how they trade. Turn it into an editable playbook. Use their words for names; keep names short (1-3 words). Do not add setups they didn't describe.

Description: """${text}"""

Return JSON: {"setups":[{"name":string,"description":string,"aliases":[string]}],"tags":[string],"fields":[{"name":string,"type":"select","options":[string]}]}`;
}

export async function POST(req: NextRequest) {
  const who = await requireUser(req);
  if ('response' in who) return who.response;
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > MAX_TEXT) {
    return NextResponse.json({ error: 'invalid_text' }, { status: 400 });
  }

  try {
    const ai = getProvider();

    if (body.task === 'note') {
      const playbook = body.playbook ?? { setups: [], tags: [], fields: [] };
      const raw = await ai.json<Partial<Structured> & { kind?: string; confidence?: number }>(
        notePrompt(body.text, playbook, body.trade),
      );
      const structured = constrainToPlaybook(raw, playbook);
      return NextResponse.json({
        kind: KINDS.includes(raw.kind as EntryKind) ? raw.kind : null,
        structured,
        confidence: typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.7,
        provider: ai.name,
      });
    }

    if (body.task === 'playbook') {
      const raw = await ai.json<Partial<Playbook>>(playbookPrompt(body.text), { temperature: 0.3 });
      const clean = (s: unknown, max = 60) => String(s ?? '').trim().slice(0, max);
      return NextResponse.json({
        setups: (raw.setups ?? []).slice(0, 20).map((s, i) => ({
          id: `ai${Date.now()}${i}`,
          name: clean(s.name),
          description: clean(s.description, 200) || undefined,
          aliases: (s.aliases ?? []).map(clean).filter(Boolean).slice(0, 5),
        })).filter((s) => s.name),
        tags: [...new Set((raw.tags ?? []).map(clean).filter(Boolean))].slice(0, 30),
        fields: (raw.fields ?? []).slice(0, 10).map((f, i) => ({
          id: `aif${Date.now()}${i}`,
          name: clean(f.name),
          type: 'select' as const,
          options: (f.options ?? []).map(clean).filter(Boolean).slice(0, 12),
        })).filter((f) => f.name && f.options.length),
      });
    }

    return NextResponse.json({ error: 'unknown_task' }, { status: 400 });
  } catch (err) {
    if (err instanceof AIUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('[api/structure]', (err as Error).message);
    return NextResponse.json({ error: 'ai_failed' }, { status: 502 });
  }
}
