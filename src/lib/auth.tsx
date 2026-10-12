'use client';

import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from './supabase/client';

interface AuthApi {
  /** False until the saved session has been checked. */
  ready: boolean;
  session: Session | null;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const api: AuthApi = {
    ready,
    session,
    async signOut() {
      await supabase().auth.signOut();
      // Leave nothing of the journal behind on a shared device.
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('proof.journal') || k.startsWith('proof.draft'))
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
