'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildDemo } from './demo';
import { rFromPrices } from './stats';
import { linkEarlyNotes } from './link';
import { uid } from './id';
import { emptyJournal, storage } from './storage';
import { isOpen, type Entry, type JournalData, type Playbook, type QuestionLog, type SyncAccount, type Trade } from './types';

interface JournalApi {
  data: JournalData;
  ready: boolean;
  /** True when the last save to this device failed — nothing is lost silently. */
  saveFailed: boolean;
  addEntry(e: Omit<Entry, 'id' | 'createdAt'>): Entry;
  updateEntry(id: string, patch: Partial<Entry>): void;
  deleteEntry(id: string): void;
  /** Returns how many were new (duplicates of existing trades are skipped). */
  addTrades(trades: Trade[]): number;
  deleteTrade(id: string): void;
  /** Closes an open position; R comes from the stop when one was given. */
  closeTrade(id: string, close: { exit: number; pnl: number; closedAt: string }): void;
  setPlaybook(p: Playbook): void;
  logQuestion(q: Omit<QuestionLog, 'id' | 'askedAt'>): void;
  setImprovement(weekStart: string, improvement: string): void;
  addAccount(a: SyncAccount): void;
  updateAccount(localId: string, patch: Partial<SyncAccount>): void;
  /** Stops importing; trades already imported stay, open positions from it are cleared. */
  removeAccount(localId: string): void;
  /** Merges one sync result: closed trades added once, open positions replaced. */
  applySync(localId: string, r: { closed: Trade[]; open: Trade[]; syncedAt: string }): void;
  loadDemo(): void;
  clearAll(): Promise<void>;
}

const Ctx = createContext<JournalApi | null>(null);

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<JournalData>(emptyJournal);
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const loaded = useRef(false);
  const fromOtherTab = useRef(false);

  useEffect(() => {
    storage.load().then((d) => {
      loaded.current = true;
      setData(d);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (fromOtherTab.current) {
      fromOtherTab.current = false;
      return;
    }
    if (loaded.current) storage.save(data).then((ok) => setSaveFailed(!ok));
  }, [data]);

  // The installed app and a browser tab share storage; pick up the other's writes
  // so a stale tab never overwrites notes written elsewhere.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('proof.journal')) storage.load().then((d) => {
          fromOtherTab.current = true;
          setData(d);
        });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((fn: (d: JournalData) => JournalData) => setData(fn), []);

  const api = useMemo<JournalApi>(
    () => ({
      data,
      ready,
      saveFailed,
      addEntry(e) {
        const entry: Entry = { ...e, id: uid('e_'), createdAt: new Date().toISOString() };
        update((d) => ({ ...d, entries: [entry, ...d.entries] }));
        return entry;
      },
      updateEntry(id, patch) {
        update((d) => ({ ...d, entries: d.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
      },
      deleteEntry(id) {
        update((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
      },
      addTrades(trades) {
        // Re-importing an overlapping history must not double-count trades. The
        // platform's position id is the true identity when there is one.
        const key = (t: Trade) =>
          t.platform ? `p|${t.accountId ?? ''}|${t.platform.positionId}` : `${t.symbol}|${t.side}|${t.closedAt}|${t.pnl}`;
        const seen = new Set(data.trades.map(key));
        const fresh = trades.filter((t) => !seen.has(key(t)) && seen.add(key(t)));
        if (fresh.length) {
          update((d) => ({
            ...d,
            trades: [...fresh, ...d.trades].sort((a, b) => b.closedAt.localeCompare(a.closedAt)),
            entries: linkEarlyNotes(d.entries, fresh),
          }));
        }
        return fresh.length;
      },
      closeTrade(id, { exit, pnl, closedAt }) {
        update((d) => ({
          ...d,
          trades: d.trades
            .map((t) => {
              if (t.id !== id) return t;
              const { status: _open, ...closed } = t;
              void _open;
              return { ...closed, exit, pnl, closedAt, r: rFromPrices(t.side, t.entry, t.stop, exit) };
            })
            .sort((a, b) => b.closedAt.localeCompare(a.closedAt)),
        }));
      },
      deleteTrade(id) {
        update((d) => ({
          ...d,
          trades: d.trades.filter((t) => t.id !== id),
          entries: d.entries.map((e) => (e.tradeId === id ? { ...e, tradeId: undefined } : e)),
        }));
      },
      setPlaybook(playbook) {
        update((d) => ({ ...d, playbook }));
      },
      logQuestion(q) {
        const log: QuestionLog = { ...q, id: uid('q_'), askedAt: new Date().toISOString() };
        // Keep the log bounded; it's for evals and trust, not an archive.
        update((d) => ({ ...d, questions: [log, ...d.questions].slice(0, 200) }));
      },
      setImprovement(weekStart, improvement) {
        update((d) => ({
          ...d,
          reviews: [...d.reviews.filter((r) => r.weekStart !== weekStart), { weekStart, improvement }],
        }));
      },
      addAccount(a) {
        update((d) => ({ ...d, accounts: [...(d.accounts ?? []).filter((x) => x.localId !== a.localId), a] }));
      },
      updateAccount(localId, patch) {
        update((d) => ({ ...d, accounts: (d.accounts ?? []).map((a) => (a.localId === localId ? { ...a, ...patch } : a)) }));
      },
      removeAccount(localId) {
        update((d) => ({
          ...d,
          accounts: (d.accounts ?? []).filter((a) => a.localId !== localId),
          trades: d.trades.filter((t) => !(t.accountId === localId && isOpen(t))),
        }));
      },
      applySync(localId, { closed, open: openNow, syncedAt }) {
        // A position can't be both closed and open; the closed record wins.
        const closedIds = new Set(closed.map((t) => t.id));
        const open = openNow.filter((t) => !closedIds.has(t.id));
        update((d) => {
          const account = (d.accounts ?? []).find((a) => a.localId === localId);
          if (!account) return d;
          // Remember the first stop seen for each open position.
          const stops = { ...account.stops };
          for (const t of open) if (t.platform && t.stop != null && stops[t.platform.positionId] == null) stops[t.platform.positionId] = t.stop;
          // This account's open positions are replaced by the current list; closed
          // trades are added once (same id as when they were open, so notes stay linked).
          const kept = d.trades.filter((t) => !(t.accountId === localId && isOpen(t)));
          const known = new Set(kept.map((t) => t.id));
          const newClosed = closed.filter((t) => !known.has(t.id));
          const trades = [...newClosed, ...open, ...kept].sort((a, b) => b.closedAt.localeCompare(a.closedAt));
          return {
            ...d,
            trades,
            entries: linkEarlyNotes(d.entries, [...newClosed, ...open]),
            accounts: (d.accounts ?? []).map((a) =>
              a.localId === localId ? { ...a, state: 'ok' as const, problem: undefined, lastSyncedAt: syncedAt, lastAttemptAt: syncedAt, stops } : a,
            ),
          };
        });
      },
      loadDemo() {
        setData(buildDemo());
      },
      async clearAll() {
        await storage.clear();
        setData(emptyJournal());
      },
    }),
    [data, ready, saveFailed, update],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useJournal(): JournalApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useJournal must be used inside <JournalProvider>');
  return v;
}
