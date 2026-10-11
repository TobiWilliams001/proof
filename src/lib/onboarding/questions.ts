/** The welcome questions. One tap each; the whole thing should take under 30 seconds. */

export interface Question {
  key: 'markets' | 'account' | 'platform' | 'journalNow' | 'goal';
  title: string;
  multi?: boolean;
  options: string[];
}

export const QUESTIONS: Question[] = [
  { key: 'markets', title: 'What do you trade?', multi: true, options: ['Forex', 'Futures', 'Crypto', 'Stocks', 'Indices'] },
  { key: 'account', title: 'What kind of account?', options: ['Personal', 'Prop challenge', 'Funded prop account'] },
  { key: 'platform', title: 'Which platform?', options: ['MT4', 'MT5', 'cTrader', 'Other'] },
  { key: 'journalNow', title: 'How do you journal now?', options: ['Nothing', 'A spreadsheet', 'Another app'] },
  { key: 'goal', title: 'What do you want most?', options: ['Pass a challenge', 'Become consistent', 'Find my edge', 'Improve discipline'] },
];

/** Only these values are ever accepted or sent, so the server can trust the shape. */
export const ALLOWED: Record<Question['key'], Set<string>> = Object.fromEntries(
  QUESTIONS.map((q) => [q.key, new Set(q.options)]),
) as Record<Question['key'], Set<string>>;
