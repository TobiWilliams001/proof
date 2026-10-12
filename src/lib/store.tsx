'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildDemo } from './demo';
import { rFromPrices, type Stats } from './stats';
import { resultValue, showResult, type Units } from './units';
import { applyMerge } from './datacheck/checks';
import { linkEarlyNotes } from './link';
import { emptyAgent, type AgentState } from './rules/notices';
import { uid } from './id';
import { cloudProvider, emptyJournal, MERGED_EVENT } from './storage';
import { supabase } from './supabase/client';
import { isOpen, type Entry, type JournalData, type Playbook, type QuestionLog, type SyncAccount, type Trade, type TraderProfile } from './types';

interface JournalApi {
  data: JournalData;
  ready: boolean;
  /** True when the last save to the account failed; nothing is lost silently. */
  saveFailed: boolean;
  addEntry(e: Omit<Entry, 'id' | 'createdAt'>): Entry;
  updateEntry(id: string, patch: Partial<Entry>): void;
  deleteEntry(id: string): void;
  /** Returns how many were new (duplicates of existing trades are skipped). */
  addTrades(trades: Trade[]): number;
  deleteTrade(id: string): void;
  /** Merges duplicate copies of one trade into the kept one; their notes move with it. Only after the trader confirms. */
  mergeTrades(keep: string, remove: string[]): void;
  /** Closes an open position; R comes from the stop when one was given. */
  closeTrade(id: string, close: { exit: number; pnl: number; closedAt: string }): void;
  setPlaybook(p: Playbook): void;
  setProfile(p: TraderProfile): void;
  setUnits(u: Units): void;
  setAgent(a: AgentState): void;
  dismissNotice(ruleId: string, day: string): void;
  /** Saves a drafted rule-break note as a real entry, in the trader's (possibly edited) words. */
  saveDraft(id: string, text: string): void;
  dismissDraft(id: string): void;
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

export function JournalProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [data, setData] = useState<JournalData>(emptyJournal);
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const loaded = useRef(false);
  /** Set when data came from the account, so it isn't saved straight back. */
  const fromAccount = useRef(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storage = useMemo(() => cloudProvider(userId, supabase()), [userId]);

  useEffect(() => {
    storage.load().then((d) => {
      loaded.current = true;
      fromAccount.current = true;
      setData(d);
      setReady(true);
    });
  }, [storage]);

  // Saves are batched: a burst of changes (an import, a sync) is one write.
  useEffect(() => {
    if (fromAccount.current) {
      fromAccount.current = false;
      return;
    }
    if (!loaded.current) return;
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      storage.save(data).then((ok) => setSaveFailed(!ok));
    }, 500);
  }, [data, storage]);

  // Notes written on the phone show up on the laptop when it comes back into view,
  // and a save that failed offline goes through once the connection returns.
  useEffect(() => {
    const pull = () => {
      if (pending.current || document.visibilityState !== 'visible') return;
      storage.refresh().then((d) => {
        if (!d) return;
        fromAccount.current = true;
        setData(d);
      });
    };
    const online = () => setData((d) => ({ ...d }));
    const merged = (e: Event) => {
      fromAccount.current = true;
      setData((e as CustomEvent<JournalData>).detail);
    };
    window.addEventListener(MERGED_EVENT, merged);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('proof.journal')) pull();
    };
    document.addEventListener('visibilitychange', pull);
    window.addEventListener('focus', pull);
    window.addEventListener('online', online);
    window.addEventListener('storage', onStorage);
    return () => {
      document.removeEventListener('visibilitychange', pull);
      window.removeEventListener('focus', pull);
      window.removeEventListener('online', online);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(MERGED_EVENT, merged);
    };
  }, [storage]);

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
      mergeTrades(keep, remove) {
        update((d) => ({ ...d, ...applyMerge(d, keep, remove) }));
      },
      setUnits(units) {
        update((d) => ({ ...d, units }));
      },
      setAgent(agent) {
        update((d) => ({ ...d, agent }));
      },
      dismissNotice(ruleId, day) {
        update((d) => {
          const a = d.agent ?? emptyAgent();
          return { ...d, agent: { ...a, notices: a.notices.map((n) => (n.ruleId === ruleId && n.day === day ? { ...n, dismissed: true } : n)) } };
        });
      },
      saveDraft(id, text) {
        update((d) => {
          const a = d.agent ?? emptyAgent();
          const draft = a.drafts.find((x) => x.id === id);
          if (!draft || draft.status !== 'pending') return d;
          const entry: Entry = { id: uid('e_'), kind: 'rule_break', text: text.trim() || draft.text, tradeId: draft.tradeIds[0], createdAt: new Date().toISOString() };
          return {
            ...d,
            entries: [entry, ...d.entries],
            agent: { ...a, drafts: a.drafts.map((x) => (x.id === id ? { ...x, status: 'saved' as const } : x)) },
          };
        });
      },
      dismissDraft(id) {
        update((d) => {
          const a = d.agent ?? emptyAgent();
          return { ...d, agent: { ...a, drafts: a.drafts.map((x) => (x.id === id ? { ...x, status: 'dismissed' as const } : x)) } };
        });
      },
      setProfile(profile) {
        update((d) => ({ ...d, profile }));
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
        fromAccount.current = true;
        setData(emptyJournal());
      },
    }),
    [data, ready, saveFailed, update, storage],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useJournal(): JournalApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useJournal must be used inside <JournalProvider>');
  return v;
}

/** The trader's chosen units and a formatter for results in them. */
export function useUnits() {
  const { data } = useJournal();
  const units: Units = data.units ?? 'money';
  return {
    units,
    show: (r: number | null | undefined, money: number | null | undefined) => showResult(units, r, money),
    value: (r: number | null | undefined, money: number | null | undefined) => resultValue(units, r, money),
    /** For big numbers: the headline figure, with R as a small second line in Both mode. */
    split: (r: number | null | undefined, money: number | null | undefined) =>
      units === 'both'
        ? { main: showResult('money', r, money), sub: r != null && money != null ? showResult('r', r, null) : null }
        : { main: showResult(units, r, money), sub: null },
    /** A group's total, in the trader's units. */
    total: (st: Stats) => showResult(units, st.rCount ? st.totalR : null, st.pnl),
    totalValue: (st: Stats) => resultValue(units, st.rCount ? st.totalR : null, st.pnl),
    /** A group's average per trade, in the trader's units. */
    avg: (st: Stats) => showResult(units, st.avgR, st.count ? st.pnl / st.count : null),
  };
}
