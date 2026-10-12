'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useJournal } from '../store';
import { baselineFor } from './plan';
import { createExperiment, listExperiments, updateExperiment } from './repo';
import type { Experiment, Plan, Result } from './types';

interface ExperimentsApi {
  experiments: Experiment[];
  running: Experiment | null;
  ready: boolean;
  start(plan: Plan, insightId?: string): Promise<'ok' | 'already_running' | 'failed'>;
  finish(id: string, result: Result): Promise<boolean>;
  abandon(id: string): Promise<boolean>;
  rate(id: string, useful: boolean): Promise<boolean>;
}

const Ctx = createContext<ExperimentsApi | null>(null);

export function ExperimentsProvider({ children }: { children: React.ReactNode }) {
  const { data } = useJournal();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    listExperiments()
      .then(setExperiments)
      .catch(() => setExperiments([]))
      .finally(() => setReady(true));
  }, []);

  const api = useMemo<ExperimentsApi>(() => {
    const patch = async (id: string, p: Partial<Experiment>) => {
      const before = experiments;
      setExperiments(experiments.map((e) => (e.id === id ? { ...e, ...p } : e)));
      try {
        await updateExperiment(id, p);
        return true;
      } catch {
        setExperiments(before);
        return false;
      }
    };
    return {
      experiments,
      running: experiments.find((e) => e.status === 'running') ?? null,
      ready,
      async start(plan, insightId) {
        if (experiments.some((e) => e.status === 'running')) return 'already_running';
        const startAt = new Date();
        const endAt = plan.length.kind === 'days' ? new Date(startAt.getTime() + plan.length.value * 864e5).toISOString() : undefined;
        try {
          const e = await createExperiment({ ...plan, insightId, baseline: baselineFor(plan, data.trades, startAt), startAt: startAt.toISOString(), endAt, status: 'running' });
          if (!e) return 'failed';
          setExperiments([e, ...experiments]);
          return 'ok';
        } catch (err) {
          // The database allows one running experiment; another device may have started one.
          return (err as { code?: string }).code === '23505' ? 'already_running' : 'failed';
        }
      },
      finish: (id, result) => patch(id, { status: 'complete', result, endAt: new Date().toISOString() }),
      abandon: (id) => patch(id, { status: 'abandoned', endAt: new Date().toISOString() }),
      rate: (id, useful) => patch(id, { useful }),
    };
  }, [experiments, ready, data.trades]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useExperiments() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useExperiments must be used inside ExperimentsProvider');
  return v;
}
