// Shapes mirror the brief's data model (§7) so the localStorage provider can be
// swapped for Supabase tables without touching the UI.

export type Side = 'long' | 'short';
export type Outcome = 'win' | 'loss' | 'be';
export type Session = 'Asian' | 'London' | 'Overlap' | 'New York' | 'Other';

export interface Trade {
  id: string;
  symbol: string;
  side: Side;
  openedAt: string; // ISO
  /** For an open position this mirrors openedAt until it closes; use isOpen() to tell. */
  closedAt: string; // ISO
  /** Absent means closed. Open positions never count toward stats. */
  status?: 'open';
  entry: number;
  /** Lets R be computed when the trade closes, instead of guessed. */
  stop?: number;
  exit: number;
  size: number;
  pnl: number;
  r: number | null; // null when risk is unknown — never guessed
  setup?: string;
  session: Session;
  source: 'manual' | 'csv' | 'sync' | 'demo';
  accountId?: string;
  /**
   * The platform's own identity for this trade. One position can be many deals
   * (partial closes), so sync keys on (accountId, positionId) and keeps every deal.
   */
  platform?: { positionId: string; dealIds?: string[] };
}

export type EntryKind = 'trade_note' | 'missed' | 'rule_break' | 'plan' | 'reflection';

export interface Structured {
  symbol?: string;
  side?: Side;
  setup?: string;
  r?: number;
  tags: string[];
  fields: Record<string, string>;
}

export interface Entry {
  id: string;
  kind: EntryKind;
  text: string;
  tradeId?: string;
  structured?: Structured;
  confidence?: number;
  /** One-tap answer after a close: did the trader follow their plan? */
  followedPlan?: boolean;
  createdAt: string;
}

export interface PlaybookSetup {
  id: string;
  name: string;
  description?: string;
  aliases?: string[];
}

export interface CustomField {
  id: string;
  name: string;
  type: 'select' | 'text' | 'number';
  options?: string[];
}

export interface Playbook {
  setups: PlaybookSetup[];
  tags: string[];
  fields: CustomField[];
}

export interface QuestionLog {
  id: string;
  question: string;
  toolCalls: { tool: string; args: unknown }[];
  answer: string;
  tradeIds: string[];
  entryIds: string[];
  askedAt: string;
}

export interface WeeklyReviewNote {
  weekStart: string; // YYYY-MM-DD (Monday)
  improvement: string;
}

export interface JournalData {
  version: 2;
  trades: Trade[];
  entries: Entry[];
  playbook: Playbook;
  questions: QuestionLog[];
  reviews: WeeklyReviewNote[];
}

export const KIND_LABEL: Record<EntryKind, string> = {
  trade_note: 'Trade',
  missed: 'Missed',
  rule_break: 'Rule break',
  plan: 'Plan',
  reflection: 'Reflection',
};

export const isOpen = (t: Trade) => t.status === 'open';
/** Stats, reviews and answers only ever look at closed trades. */
export const closedOnly = (ts: Trade[]) => ts.filter((t) => !isOpen(t));
