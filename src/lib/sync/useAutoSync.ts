'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useJournal } from '../store';
import { NEEDS_ACTION, pullMt } from './client';

const EVERY_MS = 2 * 60_000;
const WHILE_CONNECTING_MS = 20_000;
/** How often Proof checks its totals against MetaTrader's. */
const CHECK_EVERY_MS = 60 * 60_000;

/**
 * Keeps connected accounts up to date with no taps: on open, every two minutes
 * while the app is visible, and on return to the tab. Problems the trader must
 * fix (wrong password…) stop retries until they act; temporary ones retry.
 */
export function useAutoSync() {
  const { data, ready, applySync, updateAccount } = useJournal();
  const accounts = useMemo(() => data.accounts ?? [], [data.accounts]);
  const busy = useRef(new Set<string>());
  const latest = useRef(accounts);
  useEffect(() => {
    latest.current = accounts;
  }, [accounts]);

  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (document.visibilityState !== 'visible') return schedule();
      const due = latest.current.filter((a) => {
        if (busy.current.has(a.localId)) return false;
        if (a.state === 'error' && a.problem && NEEDS_ACTION.has(a.problem)) return false;
        const last = a.lastAttemptAt ? Date.parse(a.lastAttemptAt) : 0;
        return Date.now() - last >= (a.state === 'connecting' ? WHILE_CONNECTING_MS : EVERY_MS) - 1000;
      });
      await Promise.all(
        due.map(async (a) => {
          busy.current.add(a.localId);
          try {
            const checkDue = !a.platformCheck || Date.now() - Date.parse(a.platformCheck.at) >= CHECK_EVERY_MS;
            const r = await pullMt(a, a.lastSyncedAt, checkDue);
            const at = new Date().toISOString();
            if (r.state === 'ok') applySync(a.localId, r);
            else if (r.state === 'connecting') updateAccount(a.localId, { state: 'connecting', problem: undefined, lastAttemptAt: at });
            else updateAccount(a.localId, { state: 'error', problem: r.problem, lastAttemptAt: at });
          } finally {
            busy.current.delete(a.localId);
          }
        }),
      );
      schedule();
    };
    const schedule = () => {
      clearTimeout(timer);
      const connecting = latest.current.some((a) => a.state === 'connecting');
      timer = setTimeout(run, connecting ? WHILE_CONNECTING_MS : EVERY_MS);
    };
    const onVisible = () => document.visibilityState === 'visible' && run();

    run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Re-armed when accounts are added or removed, not on every sync result.
  }, [ready, accounts.length, applySync, updateAccount]);
}
