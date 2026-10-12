'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNow } from '../useNow';
import { useJournal } from '../store';
import { checkRules } from './engine';
import { createRule, deleteRule, listRules, updateRule } from './repo';
import type { Rule, RuleBody, RuleStatus } from './types';

interface RulesApi {
  rules: Rule[];
  ready: boolean;
  /** True when the rules couldn't be loaded; the last copy on this device is shown. */
  failed: boolean;
  /** Where each active rule stands today. */
  today: RuleStatus[];
  add(body: RuleBody): Promise<boolean>;
  update(id: string, patch: { params?: RuleBody['params']; active?: boolean }): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}

const Ctx = createContext<RulesApi | null>(null);

export function RulesProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { data } = useJournal();
  const now = useNow(60_000);
  const cacheKey = `proof.rules:${userId}`;
  const [rules, setRules] = useState<Rule[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const keep = useCallback(
    (next: Rule[]) => {
      setRules(next);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(next));
      } catch {}
    },
    [cacheKey],
  );

  useEffect(() => {
    let cached: Rule[] = [];
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey) ?? '[]');
    } catch {}
    listRules()
      .then((r) => {
        keep(r);
        setFailed(false);
      })
      .catch(() => {
        setRules(cached);
        setFailed(true);
      })
      .finally(() => setReady(true));
  }, [cacheKey, keep]);

  const today = useMemo(() => checkRules(rules, data.trades, { now: new Date(now) }), [rules, data.trades, now]);

  const api = useMemo<RulesApi>(
    () => ({
      rules,
      ready,
      failed,
      today,
      async add(body) {
        try {
          const r = await createRule(body);
          if (r) keep([...rules, r]);
          return !!r;
        } catch {
          return false;
        }
      },
      async update(id, patch) {
        const before = rules;
        // Show the change straight away; put it back if the save fails.
        keep(rules.map((r) => (r.id === id ? ({ ...r, ...patch } as Rule) : r)));
        try {
          await updateRule(id, patch);
          return true;
        } catch {
          keep(before);
          return false;
        }
      },
      async remove(id) {
        const before = rules;
        keep(rules.filter((r) => r.id !== id));
        try {
          await deleteRule(id);
          return true;
        } catch {
          keep(before);
          return false;
        }
      },
    }),
    [rules, ready, failed, today, keep],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useRules() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRules must be used inside RulesProvider');
  return v;
}
