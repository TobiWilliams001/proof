import { sessionFor } from './format';
import type { Entry, JournalData, Trade } from './types';

/**
 * Persistence boundary. Async on purpose: the Supabase provider (auth + RLS)
 * replaces the local one here without touching any component.
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

export const storage: StorageProvider = localProvider;
