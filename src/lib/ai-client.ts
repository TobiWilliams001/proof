import { parseRuleText } from './rules/parse';
import type { RuleBody } from './rules/types';
import { structureNote, type StructureResult } from './structure';
import { authedFetch } from './supabase/client';
import type { EntryKind, Playbook, Structured, Trade } from './types';

/**
 * Local structuring is the baseline (instant, offline). When the server has an
 * AI provider and answers quickly, its result refines the local one.
 */
export async function refineWithAI(
  text: string,
  playbook: Playbook,
  trade: Trade | undefined,
  local: StructureResult,
  timeoutMs = 5000,
): Promise<StructureResult> {
  try {
    const res = await authedFetch('/api/structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'note',
        text,
        playbook,
        trade: trade && { symbol: trade.symbol, side: trade.side, r: trade.r, setup: trade.setup },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return local;
    const ai: { kind: EntryKind | null; structured: Structured; confidence: number } = await res.json();
    const structured: Structured = {
      ...local.structured,
      ...Object.fromEntries(Object.entries(ai.structured).filter(([, v]) => v != null && v !== '')),
      tags: [...new Set([...local.structured.tags, ...ai.structured.tags])],
      fields: { ...local.structured.fields, ...ai.structured.fields },
    };
    // Platform data is authoritative over anything read from the note.
    if (trade) Object.assign(structured, { symbol: trade.symbol, side: trade.side, r: trade.r ?? structured.r });
    return {
      kind: trade ? local.kind : ai.kind ?? local.kind,
      structured,
      confidence: Math.max(local.confidence, ai.confidence),
      clarify: structured.setup ? undefined : local.clarify,
    };
  } catch {
    return local;
  }
}

export async function importPlaybook(text: string): Promise<Playbook | { error: string }> {
  try {
    const res = await authedFetch('/api/structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'playbook', text }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json();
    if (!res.ok) return { error: body.error ?? 'failed' };
    return body as Playbook;
  } catch {
    return { error: 'offline' };
  }
}

/** Words → a rule: on the device first, then the AI. Null when neither is sure. */
export async function understandRule(text: string): Promise<{ rule: RuleBody | null; error?: string }> {
  const local = parseRuleText(text);
  if (local) return { rule: local };
  try {
    const res = await authedFetch('/api/structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'rule', text }),
      signal: AbortSignal.timeout(12000),
    });
    const body = await res.json();
    if (!res.ok) return { rule: null, error: body.error ?? 'failed' };
    return { rule: body.rule ?? null };
  } catch {
    return { rule: null, error: 'offline' };
  }
}

export { structureNote };
