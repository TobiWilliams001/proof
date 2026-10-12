'use client';

import { supabase } from '../supabase/client';
import type { Rule, RuleBody } from './types';
import { fromRow, type RuleRow } from './validate';

/** The trader's rules in their account. Row level security keeps them private. */
const COLUMNS = 'id, kind, params, active, created_at';

export async function listRules(): Promise<Rule[]> {
  const { data, error } = await supabase().from('rules').select(COLUMNS).order('created_at');
  if (error) throw error;
  return (data as RuleRow[]).map(fromRow).filter((r): r is Rule => r !== null);
}

export async function createRule(body: RuleBody): Promise<Rule | null> {
  const { data, error } = await supabase().from('rules').insert({ kind: body.kind, params: body.params }).select(COLUMNS).single();
  if (error) throw error;
  return fromRow(data as RuleRow);
}

export async function updateRule(id: string, patch: { params?: RuleBody['params']; active?: boolean }): Promise<void> {
  const { error } = await supabase().from('rules').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase().from('rules').delete().eq('id', id);
  if (error) throw error;
}
