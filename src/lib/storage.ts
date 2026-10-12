import type { SupabaseClient } from '@supabase/supabase-js';
import { sessionFor } from './format';
import { mergeJournals } from './merge';
import type { Entry, JournalData, Trade } from './types';

/**
 * Persistence boundary. The signed-in app saves to the trader's account
 * (cloudProvider); the device-only provider is kept for journals written
 * before sign-in, which move into the account on first sign-in.
 */
export interface StorageProvider {
  load(): Promise<JournalData>;
  /** Resolves false when the write failed, so the UI can say so. */
  save(data: JournalData): Promise<boolean>;
  clear(): Promise<void>;
}

const KEY = 'proof.journal.v2';
const LEGACY_KEY = 'el_trades';

export function emptyJournal(): JournalData {
  return {
    version: 2,
    trades: [],
    entries: [],
    playbook: { setups: [], tags: [], fields: [] },
    questions: [],
    reviews: [],
  };
}

interface LegacyTrade {
  id: number;
  date: string;
  pair: string;
  side: 'long' | 'short';
  entry: number;
  exit: number;
  size: number;
  pnl: number;
  r: number;
  setup?: string;
  notes?: string;
}

/** Carries Edgelog's form-based trades into the new model; notes become entries. */
export function migrateLegacy(legacy: LegacyTrade[]): Pick<JournalData, 'trades' | 'entries'> {
  const trades: Trade[] = [];
  const entries: Entry[] = [];
  for (const t of legacy) {
    const closedAt = new Date(t.date || Date.now()).toISOString();
    const id = `legacy_${t.id}`;
    trades.push({
      id,
      symbol: (t.pair || 'UNKNOWN').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      side: t.side === 'short' ? 'short' : 'long',
      openedAt: closedAt,
      closedAt,
      entry: t.entry || 0,
      exit: t.exit || 0,
      size: t.size || 0,
      pnl: t.pnl || 0,
      r: t.r ? t.r : null,
      setup: t.setup || undefined,
      session: sessionFor(closedAt),
      source: 'manual',
    });
    if (t.notes && t.notes !== 'Imported from CSV') {
      entries.push({ id: `${id}_n`, kind: 'trade_note', text: t.notes, tradeId: id, createdAt: closedAt });
    }
  }
  return { trades, entries };
}

export const localProvider: StorageProvider = {
  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...emptyJournal(), ...JSON.parse(raw) };
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) return { ...emptyJournal(), ...migrateLegacy(JSON.parse(legacy)) };
    } catch {
      // Corrupt or blocked storage shouldn't brick the app.
    }
    return emptyJournal();
  },
  async save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      // Quota exceeded / private mode: keep working in memory, and tell the trader.
      return false;
    }
  },
  async clear() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(LEGACY_KEY);
      localStorage.removeItem('el_setups');
    } catch {}
  },
};

/** True when the device holds a journal written before signing in. */
function hasDeviceJournal(d: JournalData) {
  return d.trades.length > 0 || d.entries.length > 0 || d.playbook.setups.length > 0;
}

export interface CloudProvider extends StorageProvider {
  /** The saved journal, only if another device changed it since we last looked. */
  refresh(): Promise<JournalData | null>;
}

/**
 * The trader's journal in their account. A copy is kept on the device so the
 * app opens offline; the account copy wins whenever it can be reached.
 */
/** Fired when a save had to join this device's changes with another device's. */
export const MERGED_EVENT = 'proof:journal-merged';

export function cloudProvider(userId: string, sb: SupabaseClient): CloudProvider {
  const cacheKey = `${KEY}:${userId}`;
  let lastSeen: string | null = null;

  const cache = (d: JournalData) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(d));
    } catch {}
  };
  const cached = (): JournalData | null => {
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? { ...emptyJournal(), ...JSON.parse(raw) } : null;
    } catch {
      return null;
    }
  };
  const fetchRow = async () => {
    const { data, error } = await sb.from('journals').select('data, updated_at').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data as { data: JournalData; updated_at: string } | null;
  };
  const write = async (d: JournalData) => {
    const { data, error } = await sb
      .from('journals')
      .upsert({ user_id: userId, data: d, updated_at: new Date().toISOString() })
      .select('updated_at')
      .single();
    if (error) throw error;
    lastSeen = data.updated_at;
  };

  return {
    async load() {
      try {
        const row = await fetchRow();
        if (row) {
          lastSeen = row.updated_at;
          const d = { ...emptyJournal(), ...row.data };
          cache(d);
          return d;
        }
        // First sign-in: bring along anything written on this device before the account existed.
        const device = await localProvider.load();
        if (hasDeviceJournal(device)) {
          await write(device);
          cache(device);
          await localProvider.clear();
          return device;
        }
        return emptyJournal();
      } catch {
        // Offline or the service is down: open what this device last saw.
        return cached() ?? emptyJournal();
      }
    },
    async save(d) {
      cache(d);
      try {
        const row = await fetchRow();
        if (row && lastSeen && row.updated_at > lastSeen) {
          // Another device saved since we loaded: keep both sets of changes.
          const merged = mergeJournals(d, { ...emptyJournal(), ...row.data });
          await write(merged);
          cache(merged);
          window.dispatchEvent(new CustomEvent<JournalData>(MERGED_EVENT, { detail: merged }));
          return true;
        }
        await write(d);
        return true;
      } catch {
        return false;
      }
    },
    async refresh() {
      try {
        const row = await fetchRow();
        if (!row || (lastSeen && row.updated_at <= lastSeen)) return null;
        lastSeen = row.updated_at;
        const d = { ...emptyJournal(), ...row.data };
        cache(d);
        return d;
      } catch {
        return null;
      }
    },
    async clear() {
      try {
        localStorage.removeItem(cacheKey);
      } catch {}
      await sb.from('journals').delete().eq('user_id', userId);
      lastSeen = null;
    },
  };
}
