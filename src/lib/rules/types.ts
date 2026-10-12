import type { Session } from '../types';

/**
 * The trader's own limits. Proof watches these; it never blocks a trade and
 * never adds rules of its own. Prop-firm limits are out of scope on purpose.
 */
export type Rule = { id: string; active: boolean; createdAt: string } & RuleBody;

export type RuleBody =
  | { kind: 'maxTrades'; params: { max: number } }
  | { kind: 'lossStreak'; params: { max: number } }
  | { kind: 'dailyLoss'; params: { amount: number; unit: 'money' | 'r' } }
  | { kind: 'noTrading'; params: { sessions: Session[]; days: number[] } };

export type RuleKind = RuleBody['kind'];

/**
 * clear: nothing to say. near: close to the limit. hit: at the limit, the
 * moment to stop. broken: traded past it.
 */
export type RuleState = 'clear' | 'near' | 'hit' | 'broken';

export interface RuleStatus {
  ruleId: string;
  kind: RuleKind;
  /** The trader's local day this status is for, YYYY-MM-DD. */
  day: string;
  state: RuleState;
  /** How much of the limit is used: trades taken, losses in a row, money or R lost. */
  used: number;
  limit: number;
  /** For a broken rule: the trades that went past it. */
  tradeIds: string[];
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
