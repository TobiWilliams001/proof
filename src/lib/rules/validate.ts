import type { Session } from '../types';
import type { Rule, RuleBody } from './types';

const SESSIONS: Session[] = ['Asian', 'London', 'Overlap', 'New York', 'Other'];
const posInt = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max ? (v as number) : null);
const posNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);

/**
 * Only well-formed rules reach the engine, whether they come from the
 * database, a template or words the AI turned into a rule.
 */
export function toRuleBody(kind: unknown, params: unknown): RuleBody | null {
  const p = (params ?? {}) as Record<string, unknown>;
  switch (kind) {
    case 'maxTrades': {
      const max = posInt(p.max, 50);
      return max ? { kind, params: { max } } : null;
    }
    case 'lossStreak': {
      const max = posInt(p.max, 20);
      return max ? { kind, params: { max } } : null;
    }
    case 'dailyLoss': {
      const amount = posNum(p.amount);
      const unit = p.unit === 'r' ? 'r' : p.unit === 'money' ? 'money' : null;
      return amount && unit ? { kind, params: { amount, unit } } : null;
    }
    case 'noTrading': {
      const sessions = Array.isArray(p.sessions) ? SESSIONS.filter((s) => (p.sessions as unknown[]).includes(s)) : [];
      const days = Array.isArray(p.days) ? [...new Set((p.days as unknown[]).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort() : [];
      return sessions.length || days.length ? { kind, params: { sessions, days } } : null;
    }
    default:
      return null;
  }
}

export interface RuleRow {
  id: string;
  kind: string;
  params: unknown;
  active: boolean;
  created_at: string;
}

export function fromRow(row: RuleRow): Rule | null {
  const body = toRuleBody(row.kind, row.params);
  return body ? ({ id: row.id, active: row.active, createdAt: row.created_at, ...body } as Rule) : null;
}
