'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { introState, type IntroFlags } from './intro';
import { useJournal } from './store';
import { supabase } from './supabase/client';

interface IntroApi {
  /** False until both the account and the journal have been checked. */
  ready: boolean;
  needsWelcome: boolean;
  needsTour: boolean;
  markOnboarded(): void;
  markToured(): void;
}

const Ctx = createContext<IntroApi | null>(null);

/** Whether this trader has been through the welcome and the tour, checked on their account. */
export function IntroProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { data, ready: journalReady, markIntro } = useJournal();
  const [flags, setFlags] = useState<IntroFlags | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase()
      .from('profiles')
      .select('onboarded, toured')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data: row, error }) => {
        // No row yet means a new trader; an error (offline) falls back to the journal's copy.
        if (!error) setFlags({ onboarded: !!row?.onboarded, toured: !!row?.toured });
        setChecked(true);
      });
  }, [userId]);

  const mark = useCallback(
    (step: 'onboarded' | 'toured') => {
      const at = new Date().toISOString();
      setFlags((f) => ({ onboarded: f?.onboarded ?? false, toured: f?.toured ?? false, [step]: true }));
      markIntro(step === 'onboarded' ? 'welcomed' : 'toured');
      // A failed write is caught next time: the journal's copy already says done.
      supabase().from('profiles').upsert({ user_id: userId, [step]: true, [`${step}_at`]: at }).then(() => {});
    },
    [userId, markIntro],
  );

  const api = useMemo<IntroApi>(() => {
    const st = introState(data, flags);
    return {
      ready: journalReady && checked,
      ...st,
      markOnboarded: () => mark('onboarded'),
      markToured: () => mark('toured'),
    };
  }, [data, flags, journalReady, checked, mark]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useIntro() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useIntro must be used inside IntroProvider');
  return v;
}
