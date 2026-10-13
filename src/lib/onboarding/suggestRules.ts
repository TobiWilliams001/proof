import type { RuleBody } from '../rules/types';
import type { TraderProfile } from '../types';
import { accountsOf } from './profile';

/**
 * Starting rules that fit what the trader told us. Prop traders live by a daily
 * loss limit; anyone working on discipline benefits from a cap and a stop.
 * They're suggestions: nothing is added unless the trader picks it.
 */
export function suggestRules(p: Partial<Pick<TraderProfile, 'accounts' | 'account' | 'goal'>>): RuleBody[] {
  const prop = accountsOf(p).some((a) => a === 'Prop challenge' || a === 'Funded prop account') || p.goal === 'Pass a challenge';
  const out: RuleBody[] = [];
  if (prop) out.push({ kind: 'dailyLoss', params: { amount: 500, unit: 'money' } });
  out.push({ kind: 'lossStreak', params: { max: 2 } });
  out.push({ kind: 'maxTrades', params: { max: 3 } });
  return out;
}
