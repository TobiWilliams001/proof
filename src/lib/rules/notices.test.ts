import { describe, expect, it } from 'vitest';
import type { Trade } from '../types';
import { checkRules } from './engine';
import { draftText, emptyAgent, noticeText, stepAgent } from './notices';
import type { Rule } from './types';

const max2: Rule = { id: 'r1', active: true, createdAt: '2026-01-01T00:00:00Z', kind: 'maxTrades', params: { max: 2 } };
const loss: Rule = { id: 'r2', active: true, createdAt: '2026-01-01T00:00:00Z', kind: 'dailyLoss', params: { amount: 100, unit: 'money' } };
let n = 0;
const trade = (openedAt: string, pnl: number): Trade => ({
  id: `t${++n}`, symbol: 'EURUSD', side: 'long', openedAt, closedAt: new Date(new Date(openedAt).getTime() + 30 * 60_000).toISOString(),
  entry: 1, exit: 1, size: 1, pnl, r: null, session: 'London', source: 'sync',
});
const clock = (iso: string) => ({ now: new Date(iso), timeZone: 'Europe/London' });
function run(rules: Rule[], trades: Trade[], iso: string, prev = emptyAgent()) {
  return stepAgent(prev, checkRules(rules, trades, clock(iso)), rules, trades, new Date(iso));
}

describe('rule notices', () => {
  const t1 = trade('2026-10-05T08:00:00Z', 20);
  const t2 = trade('2026-10-05T10:00:00Z', -10);
  const t3 = trade('2026-10-05T13:00:00Z', 5);

  it('says “That’s your 2 trades for today” once after the 2nd trade, and not again that day', () => {
    const first = run([max2], [t1, t2], '2026-10-05T10:31:00Z');
    expect(first.notify).toEqual([{ ruleId: 'r1', title: 'That’s your 2 trades for today.' }]);
    expect(first.next.notices).toMatchObject([{ ruleId: 'r1', day: '2026-10-05', state: 'hit', dismissed: false }]);

    // The next sync, minutes later: nothing new to say.
    const again = run([max2], [t1, t2], '2026-10-05T11:00:00Z', first.next);
    expect(again.notify).toEqual([]);
    expect(again.changed).toBe(false);
  });

  it('stays quiet once dismissed, even if the rule gets closer to its limit', () => {
    const near = run([loss], [trade('2026-10-05T08:00:00Z', -85)], '2026-10-05T09:00:00Z');
    expect(near.next.notices[0].state).toBe('near');
    const dismissed = { ...near.next, notices: near.next.notices.map((x) => ({ ...x, dismissed: true })) };
    const hit = run([loss], [trade('2026-10-05T08:00:00Z', -85), trade('2026-10-05T09:10:00Z', -20)], '2026-10-05T10:00:00Z', dismissed);
    expect(hit.notify).toEqual([]);
    expect(hit.next.notices[0]).toMatchObject({ state: 'near', dismissed: true });
  });

  it('updates the same card from close to at-the-limit without a second message', () => {
    const a = trade('2026-10-05T08:00:00Z', -85);
    const near = run([loss], [a], '2026-10-05T09:00:00Z');
    const hit = run([loss], [a, trade('2026-10-05T09:10:00Z', -20)], '2026-10-05T10:00:00Z', near.next);
    expect(hit.notify).toEqual([]);
    expect(hit.next.notices).toHaveLength(1);
    expect(hit.next.notices[0].state).toBe('hit');
  });

  it('drafts one rule-break note when the rule is broken, never a saved entry, never twice', () => {
    const broken = run([max2], [t1, t2, t3], '2026-10-05T14:00:00Z');
    expect(broken.next.drafts).toHaveLength(1);
    expect(broken.next.drafts[0]).toMatchObject({ ruleId: 'r1', status: 'pending', tradeIds: [t3.id] });
    expect(broken.next.drafts[0].text).toBe('Took a 3rd trade today (EURUSD long), past my max of 2.');
    const again = run([max2], [t1, t2, t3, trade('2026-10-05T15:00:00Z', 1)], '2026-10-05T16:00:00Z', broken.next);
    expect(again.next.drafts).toHaveLength(1);
  });

  it('keeps a dismissed draft dismissed', () => {
    const broken = run([max2], [t1, t2, t3], '2026-10-05T14:00:00Z');
    const dismissed = { ...broken.next, drafts: broken.next.drafts.map((d) => ({ ...d, status: 'dismissed' as const })) };
    expect(run([max2], [t1, t2, t3], '2026-10-05T15:00:00Z', dismissed).next.drafts[0].status).toBe('dismissed');
  });

  it('starts fresh the next day', () => {
    const day1 = run([max2], [t1, t2], '2026-10-05T11:00:00Z');
    const d1 = trade('2026-10-06T08:00:00Z', 1);
    const d2 = trade('2026-10-06T09:00:00Z', 1);
    const day2 = run([max2], [t1, t2, d1, d2], '2026-10-06T10:00:00Z', day1.next);
    expect(day2.notify).toHaveLength(1);
    expect(day2.next.notices.map((x) => x.day)).toEqual(['2026-10-05', '2026-10-06']);
  });

  it('forgets old days but keeps drafts still waiting for an answer', () => {
    const old = { notices: [{ ruleId: 'r1', day: '2026-09-01', state: 'hit' as const, dismissed: true }], drafts: [
      { id: 'a', ruleId: 'r1', day: '2026-09-01', text: '', tradeIds: [], createdAt: '', status: 'pending' as const },
      { id: 'b', ruleId: 'r1', day: '2026-09-02', text: '', tradeIds: [], createdAt: '', status: 'saved' as const },
    ] };
    const r = run([max2], [], '2026-10-05T10:00:00Z', old);
    expect(r.next.notices).toEqual([]);
    expect(r.next.drafts.map((d) => d.id)).toEqual(['a']);
  });
});

describe('wording', () => {
  it('is calm and specific', () => {
    expect(noticeText(loss, { state: 'near', used: 85, limit: 100 }).title).toBe('You’re $85 down today, close to your $100 limit.');
    expect(noticeText(loss, { state: 'hit', used: 105, limit: 100 }).title).toBe('You’ve reached your $100 limit for today.');
    const streak: Rule = { ...max2, kind: 'lossStreak', params: { max: 2 } };
    expect(noticeText(streak, { state: 'hit', used: 2, limit: 2 }).detail).toBe('Your rule: Stop after 2 losses in a row. A good moment to step away.');
    const noFri: Rule = { ...max2, kind: 'noTrading', params: { sessions: [], days: [5] } };
    expect(draftText(noFri, { ruleId: 'r1', kind: 'noTrading', day: '', state: 'broken', used: 1, limit: 0, tradeIds: [] }, [])).toBe(
      'Traded when I said I wouldn’t: on Fridays.',
    );
  });
});
