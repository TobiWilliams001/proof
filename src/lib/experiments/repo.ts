'use client';

import { supabase } from '../supabase/client';
import { fromRow, toRow, type ExperimentRow } from './rows';
import type { Experiment } from './types';

/** The trader's experiments, newest first. Row level security keeps them private. */
export async function listExperiments(): Promise<Experiment[]> {
  const { data, error } = await supabase().from('experiments').select('*').order('start_at', { ascending: false });
  if (error) throw error;
  return (data as ExperimentRow[]).map(fromRow).filter((e): e is Experiment => e !== null);
}

export async function createExperiment(e: Omit<Experiment, 'id'>): Promise<Experiment | null> {
  const { data, error } = await supabase().from('experiments').insert(toRow(e)).select('*').single();
  if (error) throw error;
  return fromRow(data as ExperimentRow);
}

export async function updateExperiment(id: string, patch: Partial<Pick<Experiment, 'status' | 'endAt' | 'result' | 'useful'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.status) row.status = patch.status;
  if (patch.endAt) row.end_at = patch.endAt;
  if (patch.result) row.result = patch.result;
  if (patch.useful !== undefined) row.useful = patch.useful;
  const { error } = await supabase().from('experiments').update(row).eq('id', id);
  if (error) throw error;
}
