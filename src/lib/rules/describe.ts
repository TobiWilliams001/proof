import { fmt } from '../format';
import type { Session } from '../types';
import { WEEKDAYS, type RuleBody, type RuleKind } from './types';

const SESSION_NAME: Record<Session, string> = { Asian: 'Asian', London: 'London', Overlap: 'London–New York overlap', 'New York': 'New York', Other: 'late' };

function list(items: string[]) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

const amount = (a: number, unit: 'money' | 'r') => (unit === 'money' ? fmt.money(a) : `${a}R`);

/** The rule in the trader's words: "Max 2 trades a day". */
export function describeRule(r: RuleBody): string {
  switch (r.kind) {
    case 'maxTrades':
      return `Max ${r.params.max} trade${r.params.max === 1 ? '' : 's'} a day`;
    case 'lossStreak':
      return r.params.max === 1 ? 'Stop for the day after a loss' : `Stop after ${r.params.max} losses in a row`;
    case 'dailyLoss':
      return `Stop for the day after losing ${amount(r.params.amount, r.params.unit)}`;
    case 'noTrading': {
      const { sessions, days } = r.params;
      const parts: string[] = [];
      if (days.length) {
        const weekend = days.length === 2 && days.includes(0) && days.includes(6);
        parts.push(weekend ? 'at weekends' : `on ${list(days.map((d) => `${WEEKDAYS[d]}s`))}`);
      }
      if (sessions.length) parts.push(`in the ${list(sessions.map((s) => SESSION_NAME[s]))} session${sessions.length > 1 ? 's' : ''}`);
      return `No trading ${parts.join(' or ')}`;
    }
  }
}

/** One-tap starting points. Each shows an example so it's obvious what it's for. */
export const TEMPLATES: { kind: RuleKind; title: string; example: string; body: RuleBody }[] = [
  { kind: 'maxTrades', title: 'Max trades a day', example: 'Max 2 trades a day', body: { kind: 'maxTrades', params: { max: 2 } } },
  { kind: 'lossStreak', title: 'Stop after losses in a row', example: 'Stop after 2 losses in a row', body: { kind: 'lossStreak', params: { max: 2 } } },
  { kind: 'dailyLoss', title: 'Daily loss limit', example: 'Stop for the day after losing $200', body: { kind: 'dailyLoss', params: { amount: 200, unit: 'money' } } },
  { kind: 'noTrading', title: 'Times you don’t trade', example: 'No trading on Fridays', body: { kind: 'noTrading', params: { sessions: [], days: [5] } } },
];

/** Where a rule stands today, in a few words: "1 of 2 today". */
export function todayLine(r: RuleBody, st: { state: string; used: number; limit: number } | undefined): string {
  if (!st) return 'Paused';
  if (st.state === 'broken') return 'Broken today';
  switch (r.kind) {
    case 'maxTrades':
      return st.state === 'hit' ? 'At your limit today' : `${st.used} of ${st.limit} today`;
    case 'lossStreak':
      return st.state === 'hit' ? 'At your limit today' : 'Clear today';
    case 'dailyLoss':
      return st.state === 'hit'
        ? 'At your limit today'
        : st.used > 0
          ? `${amount(st.used, r.params.unit)} of ${amount(st.limit, r.params.unit)} today`
          : 'Clear today';
    case 'noTrading':
      return 'Clear today';
  }
}
