/** The welcome questions. One tap each; the whole flow should take about a minute. */

export interface Question {
  key: 'markets' | 'accounts' | 'platforms' | 'journalNow' | 'goal';
  title: string;
  /** Why Proof asks, in a line, so it never feels like a survey. */
  why: string;
  multi?: boolean;
  options: string[];
}

export const QUESTIONS: Question[] = [
  { key: 'markets', title: 'What do you trade?', why: 'So Proof talks about the markets you know.', multi: true, options: ['Forex', 'Futures', 'Crypto', 'Stocks', 'Indices'] },
  { key: 'accounts', title: 'Which accounts do you trade?', why: 'Prop accounts come with limits; Proof can keep an eye on them.', multi: true, options: ['Personal', 'Prop challenge', 'Funded prop account', 'Investing'] },
  { key: 'platforms', title: 'Which platforms do you use?', why: 'So your trades can come in on their own.', multi: true, options: ['MT4', 'MT5', 'cTrader', 'TradingView', 'Other'] },
  { key: 'journalNow', title: 'How do you journal now?', why: 'So Proof can make the switch easy.', options: ['Nothing', 'A spreadsheet', 'Another app'] },
  { key: 'goal', title: 'What do you want most?', why: 'Proof puts this first in what it shows you.', options: ['Pass a challenge', 'Become consistent', 'Find my edge', 'Improve discipline'] },
];
