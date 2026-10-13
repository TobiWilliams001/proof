import { answerQuestion, parseQuestion } from './ask';
import type { JournalContext } from './tools';
import { closedOnly, type Playbook } from './types';

/**
 * Questions Ask can answer, built from the trader's own setups, pairs and words.
 * Each one is tried against their journal before it's shown, so a suggestion
 * never leads to "I'm not sure what you're asking".
 */

export interface SuggestionGroup {
  group: string;
  qs: string[];
}

function top<T>(items: T[], n: number): T[] {
  const counts = new Map<T, number>();
  for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([x]) => x);
}

/** Every candidate, grouped by what the trader wants to learn. Personal ones come first. */
function candidates(ctx: JournalContext, playbook: Playbook): SuggestionGroup[] {
  const closed = closedOnly(ctx.trades);
  const setups = top(closed.map((t) => t.setup).filter((x): x is string => !!x), 2);
  const pairs = top(closed.map((t) => t.symbol), 2);
  // Words the trader keeps using in their own notes, like "tired" or "early entry".
  const words = top(ctx.entries.flatMap((e) => e.structured?.tags ?? []), 3).filter((w) => w.length > 2);
  const playbookSetup = playbook.setups[0]?.name;

  return [
    {
      group: 'How you’re doing',
      qs: [
        'Which setup makes me the most?',
        ...setups.map((s) => `What’s my win rate on ${s}?`),
        ...pairs.slice(0, 1).map((p) => `How much have I made on ${p}?`),
        'How much did I make this month?',
        'What’s my win rate this week?',
        'What do I make on average per trade?',
        ...(playbookSetup && !setups.includes(playbookSetup) ? [`What’s my win rate on ${playbookSetup}?`] : []),
      ],
    },
    {
      group: 'Where you lose',
      qs: [
        'Which pair costs me the most?',
        'How do my trades do in the hour after a loss?',
        'Which session costs me the most?',
        'What’s my biggest dip?',
        'What’s my longest losing streak?',
        'How much do I make a trade on shorts?',
      ],
    },
    {
      group: 'Your habits',
      qs: [
        'How do I do when I follow my plan?',
        ...words.slice(0, 2).map((w) => `How do I perform when I log “${w}”?`),
        ...words.slice(0, 1).map((w) => `What do I keep saying about ${w}?`),
      ],
    },
  ];
}

/** True when Ask gives a real answer to this question on this journal. */
export function answerable(q: string, ctx: JournalContext, playbook: Playbook, now: Date): boolean {
  if (parseQuestion(q, ctx, playbook, now).intent.type === 'overview') return false;
  const a = answerQuestion(q, ctx, playbook, now);
  return !a.unsure && (a.tradeIds.length > 0 || a.entryIds.length > 0 || a.highlights.length > 0);
}

/** Starter questions: up to three per group, all answerable, none repeated. */
export function suggestQuestions(ctx: JournalContext, playbook: Playbook, now: Date, perGroup = 3): SuggestionGroup[] {
  const seen = new Set<string>();
  return candidates(ctx, playbook)
    .map((g) => ({
      group: g.group,
      qs: g.qs.filter((q) => !seen.has(q) && seen.add(q) && answerable(q, ctx, playbook, now)).slice(0, perGroup),
    }))
    .filter((g) => g.qs.length > 0);
}

/** Every answerable question, for matching as the trader types. */
export function allQuestions(ctx: JournalContext, playbook: Playbook, now: Date): string[] {
  return suggestQuestions(ctx, playbook, now, 99).flatMap((g) => g.qs);
}

const words = (s: string) => s.toLowerCase().replace(/[“”"’'?]/g, '').split(/\s+/).filter(Boolean);

/**
 * Suggestions that fit what's being typed: every typed word must start a word
 * in the question, so "win ra" finds "What's my win rate…".
 */
export function matchQuestions(input: string, pool: string[], limit = 4): string[] {
  const typed = words(input);
  if (!typed.length) return [];
  return pool
    .filter((q) => {
      const qw = words(q);
      return typed.every((t) => qw.some((w) => w.startsWith(t))) && q.toLowerCase() !== input.trim().toLowerCase();
    })
    .slice(0, limit);
}
