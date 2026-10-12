'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { mismatchText, reconcile, type Reconciliation } from '@/lib/datacheck/reconcile';
import { useJournal } from '@/lib/store';
import { pullMt } from '@/lib/sync/client';
import type { SyncAccount } from '@/lib/types';
import s from './AppShell.module.css';

const HIDE_KEY = 'proof.databanner.hidden';

/**
 * Shown when Proof's numbers don't match MetaTrader's: what's off, by how much,
 * and the fix. The fix runs only when the trader taps it.
 */
export function DataBanner() {
  const { data, applySync } = useJournal();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string | null>(() => {
    try {
      return localStorage.getItem(HIDE_KEY);
    } catch {
      return null;
    }
  });

  const accounts = data.accounts;
  const trades = data.trades;
  const off = useMemo(
    () =>
      (accounts ?? [])
        .filter((a) => a.state === 'ok' && a.platformCheck)
        .map((a) => ({ a, r: reconcile(trades, a.localId, a.platformCheck!) }))
        .find((x) => !x.r.match) ?? null,
    [accounts, trades],
  );

  if (note) return <div className={s.saveBanner} role="status">{note}</div>;
  if (!off || hidden === off.a.platformCheck!.at) return null;
  const { a, r } = off;

  async function fix(acc: SyncAccount, rec: Reconciliation) {
    if (!confirm('Bring in the last 30 days again from MetaTrader? Trades already in your journal aren’t doubled, and their numbers are refreshed.')) return;
    setBusy(true);
    const since = rec.missing.length ? new Date(Date.parse(rec.missing.map((p) => p.closedAt).sort()[0]) - 864e5).toISOString() : acc.platformCheck!.from;
    const res = await pullMt(acc, since, true);
    setBusy(false);
    if (res.state === 'ok') {
      applySync(acc.localId, res);
      setNote('Done. Proof now matches MetaTrader for the last 30 days.');
      setTimeout(() => setNote(null), 6000);
    } else setNote('Couldn’t reach MetaTrader just now. Try again in a few minutes.');
  }

  return (
    <div className={s.saveBanner} role="alert">
      <strong>{mismatchText(r, a.name)}</strong>{' '}
      {r.missing.length || r.different.length || r.netDiff ? (
        <button className={s.bannerLink} onClick={() => fix(a, r)} disabled={busy}>
          {busy ? 'Bringing them in…' : 'Re-import'}
        </button>
      ) : (
        <Link href="/trades">Review them</Link>
      )}{' '}
      <button
        className={s.bannerLink}
        onClick={() => {
          setHidden(a.platformCheck!.at);
          try {
            localStorage.setItem(HIDE_KEY, a.platformCheck!.at);
          } catch {}
        }}
      >
        Not now
      </button>
    </div>
  );
}
