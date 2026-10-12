import type { Session } from '../types';
import type { RuleBody } from './types';
import { toRuleBody } from './validate';

/**
 * Turns common ways of saying a rule into one, on the device. Anything it
 * isn't sure about returns null and goes to the AI; either way the trader
 * confirms before anything is saved.
 */

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUM = '(\\d+|a|an|one|single|two|three|four|five|six|seven|eight|nine|ten)';
const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORDS[s]);

const DAYS: [RegExp, number[]][] = [
  [/\bweekends?\b/, [0, 6]],
  [/\bsundays?\b/, [0]],
  [/\bmondays?\b/, [1]],
  [/\btuesdays?\b/, [2]],
  [/\bwednesdays?\b/, [3]],
  [/\bthursdays?\b/, [4]],
  [/\bfridays?\b/, [5]],
  [/\bsaturdays?\b/, [6]],
];
const SESSIONS: [RegExp, Session][] = [
  [/\b(asian?|tokyo|sydney)\b/, 'Asian'],
  [/\blondon\b/, 'London'],
  [/\b(new york|ny|us session|us open)\b/, 'New York'],
];

export function parseRuleText(text: string): RuleBody | null {
  const q = ` ${text.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim()} `;
  // Percent-of-account limits need the account size; leave those to a person.
  if (/%|percent/.test(q)) return null;

  // "Stop after 2 losses in a row", "3 losers and I'm done"
  const streak =
    q.match(new RegExp(`\\bafter ${NUM} (?:consecutive |straight )?(?:losses|losing trades|losers|loss|losing trade|stop ?outs?)(?: in a row| back to back)?\\b`)) ??
    q.match(new RegExp(`\\b${NUM} (?:consecutive |straight )?(?:losses|losers|losing trades) (?:in a row|back to back|and (?:im|i am) (?:done|out))\\b`));
  if (streak && !/\$|\d+ ?r\b|dollars|usd/.test(q)) return toRuleBody('lossStreak', { max: toNum(streak[1]) });

  // "Max 2 trades a day", "no more than 3 trades per day", "one trade a day"
  const trades =
    q.match(new RegExp(`\\b(?:max(?:imum)?|no more than|at most|only|up to|limit(?: of| to)?|just)? ?${NUM} trades? (?:a|per|each) (?:day|session)\\b`)) ??
    q.match(new RegExp(`\\b(?:max(?:imum)?|limit) (?:of )?${NUM} trades?\\b`));
  if (trades) return toRuleBody('maxTrades', { max: toNum(trades[1]) });

  // "Stop for the day after losing $200", "daily loss limit 2R", "if I'm down 150 I stop"
  const money = q.match(/(?:\$\s?([\d,]+(?:\.\d+)?)(k)?|([\d,]+(?:\.\d+)?)(k)? ?(?:dollars|usd|bucks|\$))/);
  const r = q.match(/\b(\d+(?:\.\d+)?) ?r\b/);
  if ((money || r) && /\b(los[es]|losing|lost|down|loss|drawdown|red)\b/.test(q)) {
    if (r && !money) return toRuleBody('dailyLoss', { amount: Number(r[1]), unit: 'r' });
    if (money) {
      const n = Number((money[1] ?? money[3]).replace(/,/g, '')) * (money[2] || money[4] ? 1000 : 1);
      return toRuleBody('dailyLoss', { amount: n, unit: 'money' });
    }
  }

  // "No trading on Fridays", "don't trade the New York session", "never trade at weekends"
  const avoids =
    /\b(no|dont|do not|never|avoid|not|stay out of|skip)\b[^.]*\btrad/.test(q) ||
    /\btrad\w*[^.]*\b(off|out)\b/.test(q) ||
    /\b(stay out of|avoid|skip|sit out)\b[^.]*\b(sessions?|open|weekends?|\w+days?)\b/.test(q);
  if (avoids) {
    const days = DAYS.filter(([re]) => re.test(q)).flatMap(([, d]) => d);
    const sessions = SESSIONS.filter(([re]) => re.test(q)).map(([, s]) => s);
    if (days.length || sessions.length) return toRuleBody('noTrading', { sessions, days });
  }

  return null;
}
