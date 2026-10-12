import { outcomeOf } from '../stats';
import { isOpen, type Session, type Trade } from '../types';
import type { Rule, RuleStatus } from './types';

/**
 * The rules engine: pure and deterministic. Given the trader's rules, their
 * trades and the moment, it says where each rule stands today. Nothing here
 * phrases, notifies or saves; that happens elsewhere.
 *
 * Day boundaries are the trader's local midnight. A trade counts toward the
 * day it was opened for "trades taken" and "no trading" (that's when the
 * decision was made), and toward the day it closed for losses (that's when the
 * loss is real). So a trade from 23:50 to 00:10 is yesterday's trade and
 * today's loss.
 */

export interface Clock {
  now: Date;
  /** IANA zone, e.g. "Europe/London". Defaults to the device's. */
  timeZone?: string;
}

/** Share of a limit that counts as close to it. */
const NEAR = 0.8;

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
function dayFormatter(timeZone: string) {
  let f = dayFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    dayFormatters.set(timeZone, f);
  }
  return f;
}

/** The local calendar day of a moment, as YYYY-MM-DD, plus its weekday (0 = Sunday). */
export function localDay(iso: string | Date, timeZone: string): { day: string; weekday: number } {
  const parts = dayFormatter(timeZone).formatToParts(typeof iso === 'string' ? new Date(iso) : iso);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day: `${get('year')}-${get('month')}-${get('day')}`, weekday };
}

/** Sessions a moment falls in. The London–New York overlap belongs to both. */
export function sessionsAt(iso: string): Session[] {
  const h = new Date(iso).getUTCHours();
  if (h < 7) return ['Asian'];
  if (h < 12) return ['London'];
  if (h < 16) return ['Overlap', 'London', 'New York'];
  if (h < 21) return ['New York'];
  return ['Other'];
}

export function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function checkRules(rules: Rule[], trades: Trade[], clock: Clock): RuleStatus[] {
  const tz = clock.timeZone ?? deviceTimeZone();
  const today = localDay(clock.now, tz).day;
  const openedToday = trades
    .filter((t) => localDay(t.openedAt, tz).day === today)
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const closedToday = trades
    .filter((t) => !isOpen(t) && localDay(t.closedAt, tz).day === today)
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt));

  return rules.filter((r) => r.active).map((rule): RuleStatus => {
    const base = { ruleId: rule.id, kind: rule.kind, day: today };
    switch (rule.kind) {
      case 'maxTrades': {
        const max = rule.params.max;
        const used = openedToday.length;
        const over = openedToday.slice(max).map((t) => t.id);
        // "One left" only when the limit is big enough for that to be news.
        const state = used > max ? 'broken' : used === max ? 'hit' : max >= 3 && used === max - 1 ? 'near' : 'clear';
        return { ...base, state, used, limit: max, tradeIds: over };
      }

      case 'lossStreak': {
        const max = rule.params.max;
        let run = 0;
        let reachedAt: string | null = null;
        for (const t of closedToday) {
          run = outcomeOf(t) === 'loss' ? run + 1 : 0;
          if (run >= max && !reachedAt) reachedAt = t.closedAt;
        }
        // No warning on the way down: a "careful" after one loss reads as judgement.
        const after = reachedAt ? openedToday.filter((t) => t.openedAt > reachedAt!).map((t) => t.id) : [];
        const state = after.length ? 'broken' : reachedAt ? 'hit' : 'clear';
        return { ...base, state, used: Math.max(run, reachedAt ? max : 0), limit: max, tradeIds: after };
      }

      case 'dailyLoss': {
        const { amount, unit } = rule.params;
        let net = 0;
        let reachedAt: string | null = null;
        for (const t of closedToday) {
          net += unit === 'money' ? t.pnl : (t.r ?? 0);
          if (-net >= amount && !reachedAt) reachedAt = t.closedAt;
        }
        const lost = Math.max(0, -net);
        const after = reachedAt ? openedToday.filter((t) => t.openedAt > reachedAt!).map((t) => t.id) : [];
        const state = after.length ? 'broken' : lost >= amount ? 'hit' : lost >= amount * NEAR ? 'near' : 'clear';
        return { ...base, state, used: Math.round(lost * 100) / 100, limit: amount, tradeIds: after };
      }

      case 'noTrading': {
        const { sessions, days } = rule.params;
        const outside = openedToday.filter(
          (t) => days.includes(localDay(t.openedAt, tz).weekday) || sessionsAt(t.openedAt).some((s) => sessions.includes(s)),
        );
        return { ...base, state: outside.length ? 'broken' : 'clear', used: outside.length, limit: 0, tradeIds: outside.map((t) => t.id) };
      }
    }
  });
}
