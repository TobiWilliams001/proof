'use client';

import { Plus, Search, Trash2, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EquityCurve } from '@/components/Charts';
import { HealthCard } from '@/components/HealthCard';
import { Composer } from '@/components/Composer';
import { EntryItem, TradeItem } from '@/components/Items';
import { Sheet } from '@/components/Sheet';
import { TradeForm } from '@/components/TradeForm';
import { fmt } from '@/lib/format';
import { computeStats, groupStats, rFromPrices, riskStats, type GroupKey } from '@/lib/stats';
import { Reveal } from '@/components/motion';
import { useJournal, useUnits } from '@/lib/store';
import { Term } from '@/components/Term';
import { useNow } from '@/lib/useNow';
import { closedOnly, isOpen, type Trade } from '@/lib/types';

const RANGES = [
  { id: '30', label: '30d', days: 30 },
  { id: '90', label: '90d', days: 90 },
  { id: 'all', label: 'All', days: Infinity },
] as const;

export default function TradesPage() {
  const { data, ready, addTrades, deleteTrade, deleteEntry, closeTrade } = useJournal();
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('all');
  const u = useUnits();
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
    return closedOnly(data.trades).filter((t) => t.closedAt >= cutoff);
  }, [data.trades, range, now]);
  const openPositions = useMemo(() => data.trades.filter(isOpen), [data.trades]);
  const rangeLabel = range === 'all' ? 'all time' : `last ${range} days`;
  const byLabel = by === 'symbol' ? 'pair' : by;

  // "/trades?trade=<id>" opens that trade, Ask links its supporting trades here.
  useEffect(() => {
    if (!ready) return;
    const id = new URLSearchParams(window.location.search).get('trade');
    const t = id && data.trades.find((x) => x.id === id);
    if (t) {
      // Opening the linked trade once data has loaded.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(t);
      setView('list');
      window.history.replaceState(null, '', '/trades');
    }
  }, [ready, data.trades]);

  const stats = useMemo(() => computeStats(trades), [trades]);
  const risk = useMemo(() => riskStats(trades), [trades]);
  const groups = useMemo(() => groupStats(trades, by), [trades, by]);
  // The Show results in setting decides. Charts pick one scale, so Both draws money.
  const metric: 'r' | 'pnl' = u.units === 'r' && stats.rCount > 0 ? 'r' : 'pnl';
  if (metric === 'pnl') groups.sort((a, b) => b.stats.pnl - a.stats.pnl);
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

      {!ready ? (
        <div className="stack" aria-hidden>
          <div className="skeleton" style={{ height: 44 }} />
          <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}</div>
          <div className="skeleton" style={{ height: 240 }} />
        </div>
      ) : data.trades.length === 0 ? (
        <div className="card empty">
          <h3>No trades yet</h3>
          <p>Connect your MetaTrader account and your trades will appear here on their own.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <Link href="/settings#accounts" className="btn btn-primary btn-sm"><Upload size={15} /> Import history</Link>
          </div>
        </div>
      ) : (
        <>
          <HealthCard />
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
          </div>

          <AnimatePresence mode="wait" initial={false}>
          {view === 'insights' ? (
          <motion.div key="insights" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.25 }}>
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Net</div>
              <Big v={u.split(stats.rCount ? stats.totalR : null, stats.pnl)} tone={u.totalValue(stats)} />
            </div>
            <div className="stat">
              <div className="stat-label"><Term word="Win rate" /></div>
              <div className="stat-value">{stats.count ? fmt.pct(stats.winRate) : 'None yet'}</div>
            </div>
            <div className="stat">
              <div className="stat-label"><Term word="Average per trade" /></div>
              <Big v={u.split(risk.expectancyR, risk.expectancyMoney)} tone={u.value(risk.expectancyR, risk.expectancyMoney)} />
            </div>
            <div className="stat">
              <div className="stat-label">Trades</div>
              <div className="stat-value">{stats.count}</div>
            </div>
          </div>

          {/* The bad runs, in one slim strip: how deep it got and how long it lasted. */}
          {stats.count > 0 && (
            <div className="mini-stats">
              <div>
                <span><Term word="Biggest dip" /></span>
                <strong className="num">{metric === 'r' ? `${risk.maxDrawdownR.toFixed(1)}R` : fmt.money(risk.maxDrawdownMoney)}</strong>
              </div>
              <div>
                <span>Losses in a row</span>
                <strong className="num">{risk.longestLosingStreak}</strong>
              </div>
              <div>
                <span><Term word="Recovery" /></span>
                <strong>{risk.maxDrawdownMoney === 0 ? 'None needed' : risk.recovered ? `${risk.recoveryTrades} trades` : 'Not yet'}</strong>
              </div>
            </div>
          )}

          <Reveal className="section">
            <h2 className="section-title" style={{ marginBottom: 12 }}>How your {metric === 'r' ? <Term word="R" /> : 'account'} has grown, {rangeLabel}</h2>
            <div className="card"><EquityCurve trades={trades} metric={metric} /></div>
          </Reveal>

          <Reveal className="section">
            <div className="section-head">
              <h2 className="section-title">Where your {metric === 'r' ? <Term word="R" /> : 'money'} comes from, by {byLabel}</h2>
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
                        {g.stats.count} trade{g.stats.count === 1 ? '' : 's'} · {fmt.pct(g.stats.winRate)} won · {u.avg(g.stats)} a trade
                      </div>
                    </div>
                    <div className={`num ${v >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 16, alignSelf: 'center' }}>
                      {u.total(g.stats)}
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

          {openPositions.length > 0 && (
            <section className="section" style={{ marginTop: 0 }}>
              <div className="section-head">
                <h2 className="section-title">Open now</h2>
                <span className="faint num" style={{ fontSize: 12 }}>{openPositions.length}</span>
              </div>
              <div className="list">
                {openPositions.map((t) => (
                  <TradeItem key={t.id} trade={t} noteCount={notesByTrade.get(t.id)} onClick={() => setOpen(t)} />
                ))}
              </div>
            </section>
          )}
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

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `${open.symbol} ${open.side}${isOpen(open) ? ' · open' : ''}` : ''}>
        {open && isOpen(open) && (
          <div className="stack">
            <div className="stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              <div className="stat"><div className="stat-label">Entry</div><div className="stat-value num">{open.entry || 'Not set'}</div></div>
              <div className="stat"><div className="stat-label">Stop</div><div className="stat-value num">{open.stop ?? 'Not set'}</div></div>
              <div className="stat"><div className="stat-label">Opened</div><div className="stat-value" style={{ fontSize: 15 }}>{fmt.relative(open.openedAt, now)}</div></div>
              <div className="stat"><div className="stat-label">Setup</div><div className="stat-value" style={{ fontSize: 15 }}>{open.setup ?? 'None'}</div></div>
            </div>
            {openNotes.length > 0 && (
              <div className="list">
                {openNotes.map((e) => <EntryItem key={e.id} entry={e} onDelete={() => deleteEntry(e.id)} />)}
              </div>
            )}
            <Composer trade={open} placeholder={openNotes.length ? 'Add to the plan…' : 'What’s the plan? Why this trade, where you’re wrong…'} />
            {open.source !== 'sync' && (
              <CloseTrade
                trade={open}
                onClose={(c) => {
                  closeTrade(open.id, c);
                  setOpen(null);
                }}
              />
            )}
          </div>
        )}
        {open && !isOpen(open) && (
          <div className="stack">
            <div className="stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              <div className="stat"><div className="stat-label">Result</div><Big v={u.split(open.r, open.pnl)} tone={u.value(open.r, open.pnl)} /></div>
              <div className="stat"><div className="stat-label">Opened</div><div className="stat-value" style={{ fontSize: 15 }}>{fmt.date(open.openedAt)} {fmt.time(open.openedAt)}</div></div>
              <div className="stat"><div className="stat-label">Entry → exit</div><div className="stat-value" style={{ fontSize: 15 }}>{open.entry || '?'} → {open.exit || '?'}</div></div>
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
              style={{ justifySelf: 'start', color: 'var(--neg-text)' }}
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

/** Closing a manual position: exit price and result. R comes from the stop, never guessed. */
function CloseTrade({ trade, onClose }: { trade: Trade; onClose: (c: { exit: number; pnl: number; closedAt: string }) => void }) {
  const [exit, setExit] = useState('');
  const [pnl, setPnl] = useState('');
  const toNum = (v: string) => {
    const n = Number(v.trim().replace('−', '-').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, ''));
    return v.trim() && Number.isFinite(n) ? n : null;
  };
  const x = toNum(exit);
  const p = toNum(pnl);
  const r = x != null ? rFromPrices(trade.side, trade.entry, trade.stop, x) : null;
  const showR = useUnits().units !== 'money';
  return (
    <form
      className="card card-quiet stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (x != null && p != null) onClose({ exit: x, pnl: p, closedAt: new Date().toISOString() });
      }}
    >
      <div className="label">Closed this trade?</div>
      <div className="grid-2">
        <input className="input num" inputMode="text" placeholder="Exit price" value={exit} onChange={(e) => setExit(e.target.value)} aria-label="Exit price" />
        <input className="input num" inputMode="text" placeholder="P&L, e.g. -80" value={pnl} onChange={(e) => setPnl(e.target.value)} aria-label="Profit or loss" />
      </div>
      {showR && r != null && <p className="faint" style={{ fontSize: 13 }}>That’s <span className={`num ${r >= 0 ? 'pos' : 'neg'}`}>{fmt.r(r)}</span> against your stop.</p>}
      <button className="btn btn-primary btn-block" disabled={x == null || p == null}>Mark as closed</button>
    </form>
  );
}

/** A headline number, with R underneath when showing both. */
function Big({ v, tone }: { v: { main: string; sub: string | null }; tone: number }) {
  return (
    <>
      <div className={`stat-value ${tone >= 0 ? 'pos' : 'neg'}`}>{v.main}</div>
      {v.sub && <div className="faint num" style={{ fontSize: 12.5, marginTop: 2 }}>{v.sub}</div>}
    </>
  );
}
