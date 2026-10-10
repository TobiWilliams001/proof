'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildDemo } from './demo';
import { rFromPrices } from './stats';
import { uid } from './id';
import { emptyJournal, storage } from './storage';
import type { Entry, JournalData, Playbook, QuestionLog, Trade } from './types';

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
        // Re-importing an overlapping history must not double-count trades.
        const key = (t: Trade) => `${t.symbol}|${t.side}|${t.closedAt}|${t.pnl}`;
        const seen = new Set(data.trades.map(key));
        const fresh = trades.filter((t) => !seen.has(key(t)) && seen.add(key(t)));
        if (fresh.length) {
          update((d) => ({ ...d, trades: [...fresh, ...d.trades].sort((a, b) => b.closedAt.localeCompare(a.closedAt)) }));
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
