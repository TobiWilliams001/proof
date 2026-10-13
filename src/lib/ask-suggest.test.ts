import { describe, expect, it } from 'vitest';
import { answerable, allQuestions, matchQuestions, suggestQuestions } from './ask-suggest';
import { buildDemo } from './demo';
import { emptyJournal } from './storage';

const now = new Date(2026, 9, 10, 12);
const demo = buildDemo(now);
const ctx = { trades: demo.trades, entries: demo.entries };

describe('Ask suggestions', () => {
  it('builds questions from the trader’s own setups, pairs and words', () => {
    const groups = suggestQuestions(ctx, demo.playbook, now);
    const all = groups.flatMap((g) => g.qs);
    process.stdout.write(`\n  ${JSON.stringify(groups, null, 1)}\n`);
    expect(groups.map((g) => g.group)).toEqual(['How you’re doing', 'Where you lose', 'Your habits']);
    expect(all.some((q) => /3-touch|2-touch|Footprint|Breakout retest/.test(q))).toBe(true);
    expect(all.some((q) => /“[a-z ]+”/i.test(q))).toBe(true);
    for (const g of groups) expect(g.qs.length).toBeLessThanOrEqual(3);
  });

  it('only suggests questions Ask can answer', () => {
    for (const q of allQuestions(ctx, demo.playbook, now)) expect(answerable(q, ctx, demo.playbook, now)).toBe(true);
  });

  it('suggests nothing it can’t answer on an empty journal', () => {
    const empty = emptyJournal();
    expect(suggestQuestions({ trades: [], entries: [] }, empty.playbook, now)).toEqual([]);
  });

  it('matches as the trader types', () => {
    const pool = allQuestions(ctx, demo.playbook, now);
    expect(matchQuestions('win ra', pool)[0]).toMatch(/win rate/);
    expect(matchQuestions('after a l', pool)).toContain('How do my trades do in the hour after a loss?');
    expect(matchQuestions('', pool)).toEqual([]);
    expect(matchQuestions('zebra', pool)).toEqual([]);
  });
});
