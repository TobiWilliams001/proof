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
  closedAt: string; // ISO
  entry: number;
  exit: number;
  size: number;
  pnl: number;
  r: number | null; // null when risk is unknown — never guessed
  setup?: string;
  session: Session;
  source: 'manual' | 'csv' | 'sync' | 'demo';
  accountId?: string;
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
