import { makePlan } from '../experiments/plan';
import type { Change, Length, Plan } from '../experiments/types';
import { parseRuleText } from '../rules/parse';
import type { RuleBody } from '../rules/types';
import { detectSymbol } from '../structure';
import { isOpen, type Playbook, type Session, type Side, type Trade } from '../types';

/**
 * What a spoken request means. On the device and deterministic, so it's fast,
 * works offline and can be tested; nothing here saves anything. The caller
 * confirms before a rule, plan or experiment is kept.
 */
export type Command =
  | { type: 'journal'; text: string }
  | { type: 'ask'; question: string }
  | { type: 'navigate'; to: string; label: string }
  | { type: 'rule'; body: RuleBody | null; text: string }
  | { type: 'experiment'; plan: Plan | null; text: string }
  | { type: 'plan'; tradeId: string; trade: string; text: string };

const SCREENS: [RegExp, string, string][] = [
  [/\b(week|weekly|review)\b/, '/review', 'your week'],
  [/\b(trades?|stats|numbers|insights)\b/, '/trades', 'your trades'],
  [/\b(playbook|setups?|rules)\b/, '/playbook', 'your playbook'],
  [/\b(settings|account)\b/, '/settings', 'settings'],
  [/\b(calculator|position size|lot size)\b/, '/calculator', 'the calculator'],
  [/\b(ask|questions?)\b/, '/ask', 'Ask'],
  [/\b(journal|notes|home)\b/, '/journal', 'your journal'],
];

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30 };
const NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty)';
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORDS[s]);

function clean(raw: string): string {
  return raw
    .replace(/[’']/g, "'")
    .replace(/^\s*(hey|ok|okay)?,?\s*proof[,.!]?\s*/i, '')
    .trim();
}

function lengthFrom(q: string): Length {
  const trades = q.match(new RegExp(`\\b(?:for |next )?${NUM} trades?\\b`));
  if (trades) return { kind: 'trades', value: num(trades[1]) };
  const weeks = q.match(new RegExp(`\\b${NUM} weeks?\\b`));
  if (weeks) return { kind: 'days', value: num(weeks[1]) * 7 };
  const days = q.match(new RegExp(`\\b${NUM} days?\\b`));
  if (days) return { kind: 'days', value: num(days[1]) };
  return { kind: 'trades', value: 10 };
}

function changeFrom(q: string, setups: string[]): Change | null {
  const session = q.match(/\b(asian?|london|new york|ny)\b/);
  if (/\b(skip|no|avoid|without|stop trading)\b/.test(q) && session && /\bsession\b|\bopen\b/.test(q)) {
    const s = session[1];
    return { kind: 'skipSession', session: (s.startsWith('asia') ? 'Asian' : s === 'london' ? 'London' : 'New York') as Session };
  }
  if (/\b(plan|planned)\b/.test(q)) return { kind: 'followPlan' };
  const check = q.match(/\bcheck(?:ing)? for (.+?)(?: before| for| over|$)/);
  if (check) return { kind: 'checkFor', word: check[1].replace(/^(an? |the )/, '').trim() };
  if (/\b(skip|no|avoid|without|stop taking)\b/.test(q)) {
    const setup = setups.find((s) => q.includes(s.toLowerCase()));
    if (setup) return { kind: 'skipSetup', setup };
  }
  return null;
}

export function classify(raw: string, ctx: { trades: Trade[]; playbook: Playbook }): Command {
  const text = clean(raw);
  const q = ` ${text.toLowerCase()} `.replace(/\s+/g, ' ');

  // "Journal: ..." / "Note: ..." says it outright.
  const journal = text.match(/^(journal|note|log|write down|jot down)\b[:,]?\s*(?:that\s+)?(.+)$/i);
  if (journal) return { type: 'journal', text: journal[2].trim() };

  // "Add a rule, max two trades a day"
  if (/\b(add|set|create|new|make)\b[^.]*\brule\b/.test(q) || /^ rule\b/.test(q)) {
    const rest = text.replace(/^.*?\brule\b[:,]?\s*(?:that\s+|to\s+)?/i, '');
    return { type: 'rule', body: parseRuleText(rest) ?? parseRuleText(text), text: rest };
  }

  // "Start an experiment, skip Footprint for ten trades"
  if (/\b(start|run|begin|try|new)\b[^.]*\bexperiment\b/.test(q)) {
    const setups = [...new Set([...ctx.playbook.setups.map((s) => s.name), ...ctx.trades.map((t) => t.setup).filter((s): s is string => !!s)])];
    const change = changeFrom(q, setups);
    return { type: 'experiment', plan: change ? makePlan(change, 'perTrade', lengthFrom(q)) : null, text };
  }

  // "Show me my week" / "Open my trades"
  if (/^ (show|open|go to|take me to|view|see|bring up)\b/.test(q)) {
    const screen = SCREENS.find(([re]) => re.test(q));
    if (screen) return { type: 'navigate', to: screen[1], label: screen[2] };
  }

  // A question goes to Ask, before plans: "how do I do when I follow my plan?" is a question.
  if (/^ (ask|what|which|how|when|where|why|who|do|does|did|am|is|are|was|were|can|could|should|have|has)\b/.test(q) || text.endsWith('?')) {
    return { type: 'ask', question: text.replace(/^ask\b[:,]?\s*/i, '') };
  }

  // "GBPUSD short, the plan is to hold below 1.2650": a plan for an open trade.
  if (/\bplan\b/.test(q)) {
    const open = ctx.trades.filter(isOpen);
    const symbol = detectSymbol(text);
    const side: Side | undefined = /\bshort\b|\bsell\b/.test(q) ? 'short' : /\blong\b|\bbuy\b/.test(q) ? 'long' : undefined;
    const match = open.filter((t) => (!symbol || t.symbol === symbol) && (!side || t.side === side));
    const trade = match.length === 1 ? match[0] : !symbol && open.length === 1 ? open[0] : undefined;
    if (trade) return { type: 'plan', tradeId: trade.id, trade: `${trade.symbol} ${trade.side}`, text };
  }

  // Anything else is something that happened: a note.
  return { type: 'journal', text };
}
