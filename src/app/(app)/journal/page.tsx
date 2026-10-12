'use client';

import { ArrowRight, Layers, PlugZap, Search, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Composer } from '@/components/Composer';
import { EntryItem } from '@/components/Items';
import { RuleCards } from '@/components/RuleCards';
import { Sheet } from '@/components/Sheet';
import { listItem, stagger } from '@/components/motion';
import { addDays, startOfDay, startOfWeek, ymd } from '@/lib/dates';
import { fmt } from '@/lib/format';
import { buildCoachNote } from '@/lib/coach';
import { computeStats } from '@/lib/stats';
import { useJournal, useUnits } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import { useNow } from '@/lib/useNow';
import { closedOnly, isOpen, KIND_LABEL, type EntryKind, type Trade } from '@/lib/types';
import s from './journal.module.css';

const FILTERS: (EntryKind | 'all')[] = ['all', 'trade_note', 'missed', 'rule_break', 'plan', 'reflection'];

function dayLabel(key: string) {
  const today = ymd(new Date());
  const yest = ymd(new Date(startOfDay(new Date()).getTime() - 864e5));
  if (key === today) return 'Today';
  if (key === yest) return 'Yesterday';
  return fmt.dateLong(`${key}T12:00:00`);
}

export default function JournalPage() {
  const { data, ready, deleteEntry, loadDemo } = useJournal();
  const u = useUnits();
  const [filter, setFilter] = useState<EntryKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [prompted, setPrompted] = useState<Trade | null>(null);
  const [days, setDays] = useState(7);
  const now = useNow();

  const tradesById = useMemo(() => new Map(data.trades.map((t) => [t.id, t])), [data.trades]);

  // The key moments: a position just opened (capture the plan before the outcome)
  // and a trade just closed (capture what happened). Opened ones come first.
  const awaiting = useMemo(() => {
    const planned = new Set(data.entries.filter((e) => e.kind === 'plan').map((e) => e.tradeId));
    const noted = new Set(data.entries.filter((e) => e.kind !== 'plan').map((e) => e.tradeId));
    const cutoff = new Date(now - 3 * 864e5).toISOString();
    const opened = data.trades.filter((t) => isOpen(t) && !planned.has(t.id));
    const closed = closedOnly(data.trades).filter((t) => t.closedAt >= cutoff && !noted.has(t.id));
    return [...opened, ...closed].slice(0, 3);
  }, [data, now]);

  // At the start of the week the review is already waiting, the AI speaks first.
  const weekReady = useMemo(() => {
    const d = new Date(now);
    const dow = d.getDay(); // Sun 0, Mon 1
    if (dow !== 0 && dow !== 1) return null;
    const week = dow === 1 ? addDays(startOfWeek(d), -7) : d;
    const lines = buildCoachNote(data.trades, data.entries, data.playbook, week, u.units);
    const headline = lines.find((l) => l.kind === 'pattern' || l.kind === 'compare') ?? lines[0];
    if (!headline || headline.text === 'No trades this week.') return null;
    return { text: headline.text, href: dow === 1 ? '/review?week=-1' : '/review' };
  }, [data, now, u.units]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.entries.filter(
      (e) =>
        (filter === 'all' || e.kind === filter) &&
        (!q || e.text.toLowerCase().includes(q) || e.structured?.tags.some((t) => t.toLowerCase().includes(q))),
    );
    const byDay = new Map<string, typeof list>();
    for (const e of list) {
      const k = ymd(new Date(e.createdAt));
      byDay.set(k, [...(byDay.get(k) ?? []), e]);
    }
    return [...byDay.entries()];
  }, [data.entries, filter, query]);

  // Each day header carries that day's result, so the timeline reads like a ledger.
  const dayTrades = useMemo(() => {
    const m = new Map<string, Trade[]>();
    for (const t of closedOnly(data.trades)) {
      const k = ymd(new Date(t.closedAt));
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [data.trades]);

  const glance = useMemo(() => {
    const today = ymd(new Date(now));
    const weekStart = startOfWeek(new Date(now)).toISOString();
    return {
      today: computeStats(dayTrades.get(today) ?? []),
      week: computeStats(data.trades.filter((t) => t.closedAt >= weekStart)),
      notesToday: data.entries.filter((e) => ymd(new Date(e.createdAt)) === today).length,
    };
  }, [data, dayTrades, now]);

  const isEmpty = ready && data.trades.length === 0 && data.entries.length === 0;
  const mounted = useMounted();
  const today = mounted ? new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '\u00a0';

  return (
    <div className={`page ${s.page}`}>
      <motion.header className="page-head" variants={stagger.parent} initial="hidden" animate="show">
        <motion.div className="eyebrow" variants={stagger.child}>{today}</motion.div>
        <motion.h1 className="page-title" variants={stagger.child}>What happened?</motion.h1>
      </motion.header>

      {ready && data.trades.length > 0 && (
        <motion.div className={s.glance} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04, duration: 0.45 }}>
          <Glance label="Today" value={glance.today.count ? u.total(glance.today) : 'None'} tone={u.totalValue(glance.today)} sub={`${glance.today.count} trade${glance.today.count === 1 ? '' : 's'}`} />
          <Glance label="This week" value={glance.week.count ? u.total(glance.week) : 'None'} tone={u.totalValue(glance.week)} sub={glance.week.count ? `${fmt.pct(glance.week.winRate)} win rate` : 'no trades yet'} />
          <Glance label="Notes today" value={String(glance.notesToday)} sub={awaiting.length ? `${awaiting.length} trade${awaiting.length === 1 ? '' : 's'} waiting` : 'all caught up'} />
        </motion.div>
      )}

      <RuleCards />

      {awaiting.length > 0 && (
        <section className={`${s.prompts}`} aria-label="Trades waiting for a note" data-tour="prompts">
          <AnimatePresence initial={false}>
          {awaiting.map((t) => (
            <motion.button key={t.id} className={s.prompt} data-open={isOpen(t) || undefined} onClick={() => setPrompted(t)} {...listItem} whileTap={{ scale: 0.985 }}>
              <span className={s.promptDot} aria-hidden />
              <span className={s.promptText}>
                <strong>
                  {t.symbol} {t.side}
                </strong>{' '}
                {isOpen(t) ? (
                  <>opened. What’s the plan?</>
                ) : (
                  <>
                    closed{' '}
                    <span className={`num ${u.value(t.r, t.pnl) >= 0 ? 'pos' : 'neg'}`}>
                      {u.show(t.r, t.pnl)}
                    </span>
                    . What happened?
                  </>
                )}
              </span>
              <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {fmt.relative(isOpen(t) ? t.openedAt : t.closedAt, now)}
              </span>
            </motion.button>
          ))}
          </AnimatePresence>
        </section>
      )}


      {weekReady && mounted && (
        <Link href={weekReady.href} className={s.weekReady}>
          <span className={s.weekReadyLabel}>Your week, in review</span>
          <span className={s.weekReadyText}>{weekReady.text}</span>
          <span className={s.weekReadyCta}>Read your review <ArrowRight size={14} /></span>
        </Link>
      )}

      {/* The one primary action: docked where the thumb is on phones, inline on desktop. */}
      <motion.div className={s.dock} data-tour="composer" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.5 }}>
        <Composer docked />
      </motion.div>

      {!ready && (
        <div className="section stack">
          <div className="skeleton" style={{ height: 96 }} />
          <div className="skeleton" style={{ height: 96 }} />
        </div>
      )}

      {isEmpty && (
        <motion.section className={`section ${s.onboard}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
          <h2 className="display" style={{ fontSize: 21 }}>Set up in two minutes</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            Numbers come from your platform. The story comes from you.
          </p>
          <motion.div className={s.steps} variants={stagger.parent} initial="hidden" animate="show">
            <motion.div variants={stagger.child}><Link href="/settings#accounts" className={s.step}>
              <span className={s.stepIcon}><PlugZap size={18} /></span>
              <span>
                <strong>Connect MetaTrader</strong>
                <span className="faint">Your trades come in on their own, past and future.</span>
              </span>
              <ArrowRight size={16} className="faint" />
            </Link></motion.div>
            <motion.div variants={stagger.child}><Link href="/playbook" className={s.step}>
              <span className={s.stepIcon}><Layers size={18} /></span>
              <span>
                <strong>Describe your playbook</strong>
                <span className="faint">Optional. Your setups and tags, in plain words.</span>
              </span>
              <ArrowRight size={16} className="faint" />
            </Link></motion.div>
            <motion.div variants={stagger.child}><button className={s.step} onClick={loadDemo}>
              <span className={s.stepIcon}><Sparkles size={18} /></span>
              <span>
                <strong>Explore with a demo journal</strong>
                <span className="faint">Four weeks of sample trades and notes. Clear it anytime.</span>
              </span>
              <ArrowRight size={16} className="faint" />
            </button></motion.div>
          </motion.div>
        </motion.section>
      )}

      {ready && data.entries.length > 0 && (
        <section className="section">
          <div className={s.filterBar}>
            <div className="scroll-x scroll-fade" style={{ flex: 1, marginRight: 0, paddingRight: 24 }} role="group" aria-label="Filter notes">
              {FILTERS.map((f) => (
                <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : KIND_LABEL[f]}
                </button>
              ))}
            </div>
            <button
              className="btn btn-soft btn-icon btn-sm"
              aria-label="Search notes"
              aria-pressed={searching}
              onClick={() => (setSearching(!searching), setQuery(''))}
            >
              <Search size={15} />
            </button>
          </div>
          {searching && (
            <input
              className="input"
              style={{ marginTop: 10 }}
              placeholder="Search your notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          )}

          {groups.length === 0 && <p className="empty">Nothing here yet.</p>}
          {groups.slice(0, days).map(([day, entries]) => (
            <div key={day} className={s.day}>
              <h3 className={s.dayLabel}>
                <span>{dayLabel(day)}</span>
                {dayTrades.get(day) && <DaySummary trades={dayTrades.get(day)!} />}
              </h3>
              <motion.div className="list" layout>
                <AnimatePresence initial={false} mode="popLayout">
                  {entries.map((e) => (
                    <motion.div key={e.id} {...listItem}>
                      <EntryItem
                        entry={e}
                        trade={e.tradeId ? tradesById.get(e.tradeId) : undefined}
                        onDelete={() => deleteEntry(e.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          ))}
          {groups.length > days && (
            <button className="btn btn-soft btn-block" style={{ marginTop: 20 }} onClick={() => setDays(days + 14)}>
              Show older ({groups.length - days} more day{groups.length - days === 1 ? '' : 's'})
            </button>
          )}
        </section>
      )}

      <Sheet
        open={!!prompted}
        onClose={() => setPrompted(null)}
        title={prompted ? `${prompted.symbol} ${prompted.side}${isOpen(prompted) ? ' · open' : ''}` : ''}
      >
        {prompted && (
          <>
            {isOpen(prompted) ? (
              <div className={s.tradeFacts}>
                <Fact label="Entry" value={String(prompted.entry || 'Not set')} />
                <Fact label="Stop" value={prompted.stop != null ? String(prompted.stop) : 'Not set'} />
                <Fact label="Opened" value={fmt.time(prompted.openedAt)} />
                <Fact label="Setup" value={prompted.setup ?? 'None'} />
              </div>
            ) : (
              <>
                <div className={s.tradeFacts}>
                  <Fact label="Result" value={u.show(prompted.r, prompted.pnl)} tone={u.value(prompted.r, prompted.pnl) >= 0 ? 'pos' : 'neg'} />
                  <Fact label="Opened" value={fmt.time(prompted.openedAt)} />
                  <Fact label="Closed" value={fmt.time(prompted.closedAt)} />
                  <Fact label="Setup" value={prompted.setup ?? 'None'} />
                </div>
                {/* Plan and outcome, side by side. */}
                {(() => {
                  const plan = data.entries.find((e) => e.tradeId === prompted.id && e.kind === 'plan');
                  return plan ? <blockquote className={s.planQuote}><span>Your plan</span>{plan.text}</blockquote> : null;
                })()}
              </>
            )}
            <Composer
              trade={prompted}
              autoFocus
              onDone={() => setPrompted(null)}
              placeholder={isOpen(prompted) ? 'What’s the plan? Why this trade, where you’re wrong…' : 'Say it the way you’d tell a friend…'}
            />
          </>
        )}
      </Sheet>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={`num ${tone ?? ''}`} style={{ fontSize: 15, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Glance({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: number }) {
  return (
    <div className={s.glanceItem}>
      <div className="stat-label">{label}</div>
      <div className={`num ${s.glanceValue} ${tone == null || value === 'None' ? '' : tone >= 0 ? 'pos' : 'neg'}`}>{value}</div>
      <div className="faint" style={{ fontSize: 11.5 }}>{sub}</div>
    </div>
  );
}

function DaySummary({ trades }: { trades: Trade[] }) {
  const u = useUnits();
  const st = computeStats(trades);
  const v = u.totalValue(st);
  return (
    <span className={s.daySummary}>
      {st.count} trade{st.count === 1 ? '' : 's'} ·{' '}
      <span className={`num ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}`}>{u.total(st)}</span>
    </span>
  );
}
