import { closedOnly, type Trade } from '../types';
import { checkRules, deviceTimeZone, localDay } from './engine';
import type { Rule } from './types';

/**
 * How the trader did against their rules over a week, day by day. A day only
 * counts if they traded and the rule existed; a quiet day isn't a kept day.
 */
export interface RuleWeek {
  ruleId: string;
  /** Trading days the rule was kept, and broken. */
  kept: string[];
  broken: { day: string; tradeIds: string[] }[];
}

export function rulesWeek(rules: Rule[], trades: Trade[], from: Date, to: Date, timeZone = deviceTimeZone()): RuleWeek[] {
  // One moment from each local trading day in the week stands in for "that day".
  const days = new Map<string, Date>();
  for (const t of trades) {
    const at = new Date(t.openedAt);
    if (at < from || at >= to) continue;
    const { day } = localDay(at, timeZone);
    if (!days.has(day)) days.set(day, at);
  }
  for (const t of closedOnly(trades)) {
    const at = new Date(t.closedAt);
    if (at < from || at >= to) continue;
    const { day } = localDay(at, timeZone);
    if (!days.has(day)) days.set(day, at);
  }

  return rules
    .filter((r) => r.active)
    .map((rule) => {
      const created = localDay(rule.createdAt, timeZone).day;
      const week: RuleWeek = { ruleId: rule.id, kept: [], broken: [] };
      for (const [day, at] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
        if (day < created) continue;
        const [st] = checkRules([rule], trades, { now: at, timeZone });
        if (st.state === 'broken') week.broken.push({ day, tradeIds: st.tradeIds });
        else week.kept.push(day);
      }
      return week;
    })
    .filter((w) => w.kept.length + w.broken.length > 0);
}
