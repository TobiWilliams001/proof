'use client';

import { Plus, Search, Trash2, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EquityCurve } from '@/components/Charts';
import { Composer } from '@/components/Composer';
import { EntryItem, TradeItem } from '@/components/Items';
import { Sheet } from '@/components/Sheet';
import { TradeForm } from '@/components/TradeForm';
import { fmt } from '@/lib/format';
import { computeStats, groupStats, type GroupKey } from '@/lib/stats';
import { Reveal } from '@/components/motion';
import { useJournal } from '@/lib/store';
import { useNow } from '@/lib/useNow';
import type { Trade } from '@/lib/types';

const RANGES = [
  { id: '30', label: '30d', days: 30 },
  { id: '90', label: '90d', days: 90 },
  { id: 'all', label: 'All', days: Infinity },
] as const;

export default function TradesPage() {
  const { data, ready, addTrades, deleteTrade, deleteEntry } = useJournal();
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('all');
  const [metric, setMetric] = useState<'r' | 'pnl'>('r');
  const [by, setBy] = useState<GroupKey>('setup');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Trade | null>(null);
  const [adding, setAdding] = useState(false);
  const [limit, setLimit] = useState(25);
  const [view, setView] = useState<'insights' | 'list'>('insights');
  const now = useNow();

  const trades = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)!.days;
    const cutoff = Number.isFinite(days) ? new Date(now - days * 864e5).toISOString() : '';
    return data.trades.filter((t) => t.closedAt >= cutoff);
  }, [data.trades, range, now]);

  const stats = useMemo(() => computeStats(trades), [trades]);
  const groups = useMemo(() => groupStats(trades, by), [trades, by]);
  const notesByTrade = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.entries) if (e.tradeId) m.set(e.tradeId, (m.get(e.tradeId) ?? 0) + 1);
    return m;
  }, [data.entries]);
  const visible = useMemo(() => {
    const s = q.trim().toUpperCase();
    return s ? trades.filter((t) => t.symbol.includes(s) || (t.setup ?? '').toUpperCase().includes(s)) : trades;
  }, [trades, q]);
  const maxAbs = Math.max(1, ...groups.map((g) => Math.abs(metric === 'r' ? g.stats.totalR : g.stats.pnl)));

  const openNotes = open ? data.entries.filter((e) => e.tradeId === open.id) : [];

  return (
    <div className="page page-wide">
      <header className="page-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="eyebrow">Numbers from your platform</div>
          <h1 className="page-title">Trades</h1>
        </div>
        <button className="btn btn-soft btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Add manually
        </button>
      </header>

      {ready && data.trades.length === 0 ? (
        <div className="card empty">
          <h3>No trades yet</h3>
          <p>Import your platform’s history file — live sync is on the way.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <Link href="/settings#accounts" className="btn btn-primary btn-sm"><Upload size={15} /> Import history</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="seg" role="tablist" aria-label="View" style={{ display: 'flex', marginBottom: 12 }}>
            <button role="tab" aria-selected={view === 'insights'} onClick={() => setView('insights')} style={{ flex: 1 }}>Insights</button>
            <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')} style={{ flex: 1 }}>All trades · {trades.length}</button>
          </div>
          <div className="row wrap" style={{ marginBottom: 14 }}>
            <div className="seg" role="group" aria-label="Range">
              {RANGES.map((r) => (
                <button key={r.id} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
              ))}
            </div>
            <span className="spacer" />
            <div className="seg" role="group" aria-label="Unit">
              <button aria-pressed={metric === 'r'} onClick={() => setMetric('r')}>R</button>
              <button aria-pressed={metric === 'pnl'} onClick={() => setMetric('pnl')}>$</button>
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
          {view === 'insights' ? (
          <motion.div key="insights" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.25 }}>
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Net</div>
              <div className={`stat-value ${(metric === 'r' ? stats.totalR : stats.pnl) >= 0 ? 'pos' : 'neg'}`}>
                {metric === 'r' ? fmt.r(stats.totalR) : fmt.pnl(stats.pnl)}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Win rate</div>
              <div className="stat-value">{stats.count ? fmt.pct(stats.winRate) : '—'}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Avg R</div>
              <div className="stat-value">{fmt.r(stats.avgR)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Trades</div>
              <div className="stat-value">{stats.count}</div>
            </div>
          </div>

          <Reveal className="section">
            <h2 className="section-title" style={{ marginBottom: 12 }}>Equity in {metric === 'r' ? 'R' : 'dollars'}</h2>
            <div className="card"><EquityCurve trades={trades} metric={metric} /></div>
          </Reveal>

          <Reveal className="section">
            <div className="section-head">
              <h2 className="section-title">Where it comes from</h2>
              <div className="seg" role="group" aria-label="Group by">
                {(['setup', 'symbol', 'session'] as const).map((k) => (
                  <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}>
                    {k === 'symbol' ? 'Pair' : k[0].toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="list">
              {groups.map((g) => {
                const v = metric === 'r' ? g.stats.totalR : g.stats.pnl;
                return (
                  <div key={g.name} className="list-item" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 550 }}>{g.name}</div>
                      <div className="faint" style={{ fontSize: 12 }}>
                        {g.stats.count} trades · {fmt.pct(g.stats.winRate)} win · {fmt.r(g.stats.avgR)} avg
                      </div>
                    </div>
                    <div className={`num ${v >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 16, alignSelf: 'center' }}>
                      {metric === 'r' ? fmt.r(v) : fmt.pnl(v)}
                    </div>
                    <div style={{ gridColumn: '1 / -1', height: 4, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${(Math.abs(v) / maxAbs) * 100}%`,
                          background: v >= 0 ? 'var(--pos)' : 'var(--neg)',
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
          </motion.div>
          ) : (
          <motion.div key="list" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>

          <section className="section" style={{ marginTop: 0 }}>
            <div className="section-head">
              <h2 className="section-title">All trades</h2>
              <label className="row" style={{ background: 'var(--surface-2)', borderRadius: 999, padding: '0 12px', height: 34 }}>
                <Search size={14} className="faint" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Pair or setup"
                  aria-label="Filter trades"
                  style={{ border: 0, outline: 0, background: 'transparent', width: 120, fontSize: 14 }}
                />
              </label>
            </div>
            <div className="list">
              {visible.slice(0, limit).map((t) => (
                <TradeItem key={t.id} trade={t} noteCount={notesByTrade.get(t.id)} onClick={() => setOpen(t)} />
              ))}
              {visible.length === 0 && <div className="list-item faint">No trades match.</div>}
            </div>
            {visible.length > limit && (
              <button className="btn btn-soft btn-block" style={{ marginTop: 12 }} onClick={() => setLimit(limit + 50)}>
                Show more ({visible.length - limit})
              </button>
            )}
          </section>
          </motion.div>
          )}
          </AnimatePresence>
        </>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `${open.symbol} ${open.side}` : ''}>
        {open && (
          <div className="stack">
            <div className="stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              <div className="stat"><div className="stat-label">Result</div><div className={`stat-value ${(open.r ?? open.pnl) >= 0 ? 'pos' : 'neg'}`}>{fmt.r(open.r)}</div></div>
              <div className="stat"><div className="stat-label">P&L</div><div className="stat-value">{fmt.pnl(open.pnl)}</div></div>
              <div className="stat"><div className="stat-label">Entry → exit</div><div className="stat-value" style={{ fontSize: 15 }}>{open.entry || '—'} → {open.exit || '—'}</div></div>
              <div className="stat"><div className="stat-label">Closed</div><div className="stat-value" style={{ fontSize: 15 }}>{fmt.date(open.closedAt)} {fmt.time(open.closedAt)}</div></div>
            </div>
            <div className="row wrap">
              {open.setup && <span className="chip chip-sm chip-on">{open.setup}</span>}
              <span className="chip chip-sm">{open.session}</span>
              <span className="chip chip-sm">{open.source === 'demo' ? 'Demo' : open.source === 'csv' ? 'Imported' : open.source === 'sync' ? 'Synced' : 'Manual'}</span>
            </div>
            {openNotes.length > 0 && (
              <div className="list">
                {openNotes.map((e) => <EntryItem key={e.id} entry={e} onDelete={() => deleteEntry(e.id)} />)}
              </div>
            )}
            <Composer trade={open} placeholder={openNotes.length ? 'Add to the story…' : 'What happened?'} />
            <button
              className="btn btn-ghost btn-sm"
              style={{ justifySelf: 'start', color: 'var(--neg)' }}
              onClick={() => {
                if (confirm('Remove this trade? Its notes are kept.')) {
                  deleteTrade(open.id);
                  setOpen(null);
                }
              }}
            >
              <Trash2 size={14} /> Remove trade
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a trade">
        <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
          A fallback for when you can’t sync or import. Only the essentials.
        </p>
        <TradeForm
          playbook={data.playbook}
          onSave={(t) => {
            addTrades([t]);
            setAdding(false);
          }}
        />
      </Sheet>
    </div>
  );
}
