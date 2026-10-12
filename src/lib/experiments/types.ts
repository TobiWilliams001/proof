import type { Confidence } from '../stats';
import type { Session } from '../types';

/**
 * One behaviour change the trader tries for a while. Each kind can be checked
 * against a trade from the data alone, so a trade that goes against it is
 * counted as a break, never silently included.
 */
export type Change =
  | { kind: 'skipSetup'; setup: string }
  | { kind: 'checkFor'; word: string }
  | { kind: 'followPlan' }
  | { kind: 'skipSession'; session: Session };

export type Measure = 'perTrade' | 'winRate';

export type Length = { kind: 'trades'; value: number } | { kind: 'days'; value: number };

/** The numbers an experiment compares, from one calculation path. */
export interface Snapshot {
  count: number;
  winRate: number;
  /** Average per trade: R over trades with a known R, and money over all. */
  perTradeR: number | null;
  perTradeMoney: number | null;
  tradeIds: string[];
}

export interface Plan {
  hypothesis: string;
  change: Change;
  measure: Measure;
  length: Length;
}

export interface Experiment extends Plan {
  id: string;
  /** The coach finding it came from, if any. */
  insightId?: string;
  baseline: Snapshot;
  startAt: string;
  /** Set when it finishes or is abandoned; for a days-long experiment, when it's due. */
  endAt?: string;
  status: 'running' | 'complete' | 'abandoned';
  result?: Result;
  useful?: boolean;
}

export interface Result {
  after: Snapshot;
  /** Trades that went against the change during the experiment. */
  breaks: string[];
  /** Share of trades that kept to the change. */
  adherence: number;
  confidence: ExperimentConfidence;
}

/** Proof's confidence words, with "not enough evidence yet" for a small experiment. */
export type ExperimentConfidence = Exclude<Confidence, 'not enough data'> | 'not enough evidence yet';
