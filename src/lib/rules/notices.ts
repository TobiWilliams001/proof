import { fmt } from '../format';
import type { Trade } from '../types';
import { describeRule } from './describe';
import type { Rule, RuleState, RuleStatus } from './types';

/**
 * What Proof says about the trader's rules, and when. Pure: given what was
 * already said and where each rule stands now, it returns what to say next.
 *
 * Calm by design: one message per rule per day. If a rule moves from "close"
 * to "at the limit" before the trader has dismissed the card, the same card
 * updates in place; it is not a second message. Going past a rule produces a
 * draft note, never a saved one.
 */

export interface RuleNotice {
  ruleId: string;
  day: string;
  state: Extract<RuleState, 'near' | 'hit'>;
  dismissed: boolean;
}

export interface RuleBreakDraft {
  id: string;
  ruleId: string;
  day: string;
  text: string;
  tradeIds: string[];
  createdAt: string;
  status: 'pending' | 'saved' | 'dismissed';
}

export interface AgentState {
  notices: RuleNotice[];
  drafts: RuleBreakDraft[];
}

export const emptyAgent = (): AgentState => ({ notices: [], drafts: [] });

const RANK: Record<RuleState, number> = { clear: 0, near: 1, hit: 2, broken: 3 };
const KEEP_DAYS = 14;

export interface AgentStep {
  next: AgentState;
  /** Rules that deserve a device notification now: the first message of the day only. */
  notify: { ruleId: string; title: string }[];
  changed: boolean;
}

export function stepAgent(prev: AgentState, statuses: RuleStatus[], rules: Rule[], trades: Trade[], now: Date): AgentStep {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const notices = [...prev.notices];
  const drafts = [...prev.drafts];
  const notify: AgentStep['notify'] = [];
  let changed = false;

  for (const st of statuses) {
    const rule = byId.get(st.ruleId);
    if (!rule) continue;

    if (st.state === 'broken') {
      if (!drafts.some((d) => d.ruleId === st.ruleId && d.day === st.day)) {
        drafts.push({
          id: `rb_${st.ruleId}_${st.day}`,
          ruleId: st.ruleId,
          day: st.day,
          text: draftText(rule, st, trades),
          tradeIds: st.tradeIds,
          createdAt: now.toISOString(),
          status: 'pending',
        });
        changed = true;
      }
      continue;
    }

    if (st.state !== 'near' && st.state !== 'hit') continue;
    const i = notices.findIndex((n) => n.ruleId === st.ruleId && n.day === st.day);
    if (i < 0) {
      notices.push({ ruleId: st.ruleId, day: st.day, state: st.state, dismissed: false });
      notify.push({ ruleId: st.ruleId, title: noticeText(rule, st).title });
      changed = true;
    } else if (!notices[i].dismissed && RANK[st.state] > RANK[notices[i].state]) {
      notices[i] = { ...notices[i], state: st.state };
      changed = true;
    }
  }

  // Old days are history the trader no longer needs on screen.
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const keptNotices = notices.filter((n) => n.day >= cutoff);
  const keptDrafts = drafts.filter((d) => d.day >= cutoff || d.status === 'pending');
  if (keptNotices.length !== notices.length || keptDrafts.length !== drafts.length) changed = true;

  return { next: { notices: keptNotices, drafts: keptDrafts }, notify, changed };
}

const money = (n: number, unit: 'money' | 'r') => (unit === 'money' ? fmt.money(n) : `${Math.round(n * 10) / 10}R`);

/** The card for a rule at or near its limit. Plain, calm, never a telling-off. */
export function noticeText(rule: Rule, st: Pick<RuleStatus, 'state' | 'used' | 'limit'>): { title: string; detail: string } {
  const detail = `Your rule: ${describeRule(rule)}.`;
  switch (rule.kind) {
    case 'maxTrades':
      return st.state === 'hit'
        ? { title: `That’s your ${st.limit} trade${st.limit === 1 ? '' : 's'} for today.`, detail }
        : { title: 'One trade left today.', detail };
    case 'lossStreak':
      return { title: `That’s ${st.limit} loss${st.limit === 1 ? '' : 'es'} in a row today.`, detail: `${detail} A good moment to step away.` };
    case 'dailyLoss':
      return st.state === 'hit'
        ? { title: `You’ve reached your ${money(st.limit, rule.params.unit)} limit for today.`, detail }
        : { title: `You’re ${money(st.used, rule.params.unit)} down today, close to your ${money(st.limit, rule.params.unit)} limit.`, detail };
    case 'noTrading':
      return { title: describeRule(rule), detail };
  }
}

/** A first draft of the rule-break note, in the first person, for the trader to keep or change. */
export function draftText(rule: Rule, st: RuleStatus, trades: Trade[]): string {
  const t = trades.find((x) => x.id === st.tradeIds[0]);
  const which = t ? ` (${t.symbol} ${t.side})` : '';
  const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
  switch (rule.kind) {
    case 'maxTrades':
      return `Took a ${ordinal(rule.params.max + 1)} trade today${which}, past my max of ${rule.params.max}.`;
    case 'lossStreak':
      return `Kept trading after ${rule.params.max} losses in a row${which}.`;
    case 'dailyLoss':
      return `Kept trading after hitting my ${money(rule.params.amount, rule.params.unit)} daily loss limit${which}.`;
    case 'noTrading':
      return `Traded when I said I wouldn’t: ${describeRule(rule).replace(/^No trading /, '')}${which}.`;
  }
}
