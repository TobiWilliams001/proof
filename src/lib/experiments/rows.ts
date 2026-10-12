import type { Session } from '../types';
import type { Change, Experiment, Length, Measure, Result, Snapshot } from './types';

const SESSIONS: Session[] = ['Asian', 'London', 'Overlap', 'New York', 'Other'];

/** Only well-formed changes are tracked; anything else is ignored rather than misread. */
export function toChange(v: unknown): Change | null {
  const c = (v ?? {}) as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === 'string' && x.trim() && x.length <= 60 ? x.trim() : null);
  switch (c.kind) {
    case 'skipSetup':
      return text(c.setup) ? { kind: 'skipSetup', setup: text(c.setup)! } : null;
    case 'checkFor':
      return text(c.word) ? { kind: 'checkFor', word: text(c.word)! } : null;
    case 'followPlan':
      return { kind: 'followPlan' };
    case 'skipSession':
      return SESSIONS.includes(c.session as Session) ? { kind: 'skipSession', session: c.session as Session } : null;
    default:
      return null;
  }
}

export interface ExperimentRow {
  id: string;
  insight_id: string | null;
  hypothesis: string;
  behavior_change: unknown;
  measure: string;
  length_kind: string;
  length_value: number;
  baseline: Snapshot;
  start_at: string;
  end_at: string | null;
  status: string;
  result: Result | null;
  useful: boolean | null;
}

export function fromRow(r: ExperimentRow): Experiment | null {
  const change = toChange(r.behavior_change);
  const measure = r.measure === 'winRate' || r.measure === 'perTrade' ? (r.measure as Measure) : null;
  const length: Length | null =
    (r.length_kind === 'trades' || r.length_kind === 'days') && Number.isInteger(r.length_value) && r.length_value > 0
      ? { kind: r.length_kind, value: r.length_value }
      : null;
  const status = ['running', 'complete', 'abandoned'].includes(r.status) ? (r.status as Experiment['status']) : null;
  if (!change || !measure || !length || !status || !r.baseline) return null;
  return {
    id: r.id,
    insightId: r.insight_id ?? undefined,
    hypothesis: r.hypothesis,
    change,
    measure,
    length,
    baseline: r.baseline,
    startAt: r.start_at,
    endAt: r.end_at ?? undefined,
    status,
    result: r.result ?? undefined,
    useful: r.useful ?? undefined,
  };
}

export function toRow(e: Omit<Experiment, 'id'>) {
  return {
    insight_id: e.insightId ?? null,
    hypothesis: e.hypothesis.slice(0, 300),
    behavior_change: e.change,
    measure: e.measure,
    length_kind: e.length.kind,
    length_value: e.length.value,
    baseline: e.baseline,
    start_at: e.startAt,
    end_at: e.endAt ?? null,
    status: e.status,
    result: e.result ?? null,
    useful: e.useful ?? null,
  };
}
