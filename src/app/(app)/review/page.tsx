'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RBars } from '@/components/Charts';
import { EntryItem, TradeItem } from '@/components/Items';
import { MicButton, useVoice, VoiceHelp } from '@/components/Voice';
import { Reveal } from '@/components/motion';
import { addDays, startOfWeek, ymd } from '@/lib/dates';
import { fmt } from '@/lib/format';
import { buildCoachNote, type CoachLine } from '@/lib/coach';
import { buildWeeklyReview } from '@/lib/review';
import { useJournal } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import type { Entry, Trade } from '@/lib/types';
import s from './review.module.css';

export default function ReviewPage() {
  const { data, ready, setImprovement } = useJournal();
  const [offset, setOffset] = useState(0);
  // "/review?week=-1" opens last week (linked from Journal at the start of a week).
  useEffect(() => {
    const w = Number(new URLSearchParams(window.location.search).get('week'));
    // Reading the URL once after mount; static pages can't read it during prerender.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Number.isInteger(w) && w < 0) setOffset(w);
  }, []);
  const mounted = useMounted();
  const anchor = useMemo(() => addDays(startOfWeek(new Date()), offset * 7), [offset]);
  const r = useMemo(() => buildWeeklyReview(data.trades, data.entries, anchor), [data.trades, data.entries, anchor]);
  const tradesById = useMemo(() => new Map(data.trades.map((t) => [t.id, t])), [data.trades]);
  const coach = useMemo(() => buildCoachNote(data.trades, data.entries, data.playbook, anchor), [data, anchor]);

  const saved = data.reviews.find((x) => x.weekStart === r.weekStart)?.improvement ?? '';
  const [improvement, setImp] = useState(saved);
  const impRef = useRef<HTMLTextAreaElement>(null);
  const impMic = useVoice(setImp, impRef);
  // Keep the textarea in step when switching weeks or after storage loads.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setImp(saved), [saved, r.weekStart]);
  const lastWeek = data.reviews.find((x) => x.weekStart === ymd(addDays(new Date(`${r.weekStart}T12:00:00`), -7)));

  const range = `${fmt.date(`${r.weekStart}T12:00:00`)} – ${fmt.date(`${r.weekEnd}T12:00:00`)}`;
  const label = offset === 0 ? 'This week' : offset === -1 ? 'Last week' : range;
  const empty = ready && r.stats.count === 0 && !r.missed.length && !r.reflections.length && !r.plans.length;
  const hasTrades = r.stats.count > 0;

  return (
    <div className="page">
      <header className="page-head">
        <div className={s.weekNav}>
          <button className="btn btn-soft btn-icon btn-sm" onClick={() => setOffset(offset - 1)} aria-label="Previous week">
            <ChevronLeft size={16} />
          </button>
          <span className="eyebrow">{mounted ? range : '\u00a0'}</span>
          <button className="btn btn-soft btn-icon btn-sm" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} aria-label="Next week">
            <ChevronRight size={16} />
          </button>
        </div>
        <h1 className="page-title">{mounted ? label : '\u00a0'}</h1>
      </header>

      {!ready && (
        <div className="stack" aria-hidden>
          <div className="skeleton" style={{ height: 150 }} />
          <div className="stats">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}
          </div>
          <div className="skeleton" style={{ height: 190 }} />
        </div>
      )}

      {ready && !empty && <CoachNote lines={coach} tradesById={tradesById} entries={data.entries} />}

      {empty && (
        <div className="empty card">
          <h3>A quiet week</h3>
          <p>No trades or notes between {range}.</p>
        </div>
      )}

      {!empty && ready && (
        <>
          <Chapter n={1} title="Results">
            <div className="stats">
              <Stat label="Net R" value={fmt.r(r.stats.totalR)} tone={r.stats.totalR >= 0 ? 'pos' : 'neg'} />
              <Stat label="P&L" value={fmt.pnl(r.stats.pnl)} tone={r.stats.pnl >= 0 ? 'pos' : 'neg'} />
              <Stat label="Win rate" value={hasTrades ? fmt.pct(r.stats.winRate) : 'None yet'} sub={`${r.stats.wins}W · ${r.stats.losses}L${r.stats.breakeven ? ` · ${r.stats.breakeven}BE` : ''}`} />
              <Stat label="Avg R" value={fmt.r(r.stats.avgR)} sub={`best ${fmt.r(r.stats.bestR)} · worst ${fmt.r(r.stats.worstR)}`} />
            </div>
            {hasTrades && (
              <div className="card" style={{ marginTop: 12 }}>
                <div className={s.cardHead}>How your trades landed in R, {offset === 0 ? 'this week' : offset === -1 ? 'last week' : range}</div>
                <RBars bins={r.distribution} />
              </div>
            )}
          </Chapter>

          {(r.bestSetup || r.worstSetup) && (
            <Chapter n={2} title="What worked, what didn’t">
              <div className="grid-2">
                {r.bestSetup && <SetupCard title="Strongest setup" s={r.bestSetup} />}
                {r.worstSetup && <SetupCard title="Weakest setup" s={r.worstSetup} />}
              </div>
            </Chapter>
          )}

          <Chapter n={r.bestSetup || r.worstSetup ? 3 : 2} title="Discipline">
            <div className="grid-2">
              <Meter
                label="Followed your plan"
                value={r.adherence}
                display={r.adherence == null ? 'Not yet' : fmt.pct(r.adherence)}
                sub={
                  r.adherenceSource === 'answers'
                    ? `from your answers on ${r.planAnswered} trade${r.planAnswered === 1 ? '' : 's'}`
                    : `${r.ruleBreaks.length} rule break${r.ruleBreaks.length === 1 ? '' : 's'} logged`
                }
              />
              <Meter
                label="Journaled"
                value={r.stats.count ? r.journaled / r.stats.count : null}
                display={`${r.journaled}/${r.stats.count}`}
                sub="trades with a note"
              />
            </div>
            <Fold title="Rule breaks" items={r.ruleBreaks} tradesById={tradesById} />
            <Fold
              title="Missed trades"
              items={r.missed}
              tradesById={tradesById}
              aside={r.missedR ? `${fmt.r(r.missedR)} missed` : undefined}
            />
          </Chapter>

          {(r.themes.length > 0 || r.reflections.length > 0 || r.plans.length > 0) && (
            <Chapter n={r.bestSetup || r.worstSetup ? 4 : 3} title="In your own words">
              {r.themes.length > 0 && (
                <>
                  <p className="faint" style={{ fontSize: 12.5, marginBottom: 10 }}>Words you came back to in two or more notes</p>
                  <div className="row wrap">
                    {r.themes.map((t) => (
                      <span key={t.word} className={s.theme}>
                        {t.word} <span className="num faint">×{t.count}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
              <Fold title="Reflections" items={r.reflections} tradesById={tradesById} />
              <Fold title="Plans" items={r.plans} tradesById={tradesById} />
            </Chapter>
          )}
        </>
      )}

      {ready && (
        <Reveal className={`section ${s.improve}`}>
          <div className={s.chapterNum}>Next week</div>
          <h2 className="display" style={{ fontSize: 21, marginTop: 4 }}>One thing to improve</h2>
          {lastWeek?.improvement && (
            <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
              Last week you said: <em>“{lastWeek.improvement}”</em>
            </p>
          )}
          <textarea
            ref={impRef}
            className="textarea"
            style={{ marginTop: 14 }}
            placeholder="e.g. No entries in the first 15 minutes after a loss."
            value={impMic.interim ? `${improvement} ${impMic.interim}` : improvement}
            onChange={(e) => setImp(e.target.value)}
            onBlur={() => improvement !== saved && setImprovement(r.weekStart, improvement.trim())}
          />
          <VoiceHelp mic={impMic} />
          <div className="row" style={{ marginTop: 10 }}>
            <MicButton mic={impMic} />
            <span className="faint" style={{ fontSize: 12 }}>{improvement === saved && saved ? 'Saved' : 'Saves when you leave the box'}</span>
            <span className="spacer" />
            <button className="btn btn-primary btn-sm" disabled={improvement === saved} onClick={() => setImprovement(r.weekStart, improvement.trim())}>
              Save
            </button>
          </div>
        </Reveal>
      )}
    </div>
  );
}

function Chapter({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Reveal className={`section ${s.chapter}`}>
      <div className={s.chapterHead}>
        <span className={s.chapterNum}>0{n}</span>
        <h2 className={s.chapterTitle}>{title}</h2>
      </div>
      {children}
    </Reveal>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: 'pos' | 'neg'; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="faint" style={{ fontSize: 11.5 }}>{sub}</div>}
    </div>
  );
}

function Meter({ label, value, display, sub }: { label: string; value: number | null; display: string; sub: string }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{display}</div>
      <div className={s.meter} aria-hidden>
        <motion.span
          initial={{ width: 0 }}
          whileInView={{ width: `${(value ?? 0) * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function SetupCard({ title, s: x }: { title: string; s: { name: string; totalR: number; count: number } }) {
  return (
    <div className="card">
      <div className="stat-label">{title}</div>
      <div style={{ fontWeight: 600, marginTop: 4 }}>{x.name}</div>
      <div className={`num ${x.totalR >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 20, marginTop: 2 }}>{fmt.r(x.totalR)}</div>
      <div className="faint" style={{ fontSize: 12 }}>{x.count} trade{x.count === 1 ? '' : 's'}</div>
    </div>
  );
}

/** A list folded behind its count, the number is the headline, the notes are on demand. */
function Fold({
  title,
  items,
  tradesById,
  aside,
}: {
  title: string;
  items: Entry[];
  tradesById: Map<string, Trade>;
  aside?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className={s.fold}>
      <button className={s.foldHead} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={s.foldTitle}>{title}</span>
        <span className={`num ${s.foldCount}`}>{items.length}</span>
        <span className="spacer" />
        {aside && <span className={s.foldAside}>{aside}</span>}
        <ChevronDown size={16} className={s.chev} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="list" style={{ marginTop: 8 }}>
              {items.map((e) => (
                <EntryItem key={e.id} entry={e} trade={e.tradeId ? tradesById.get(e.tradeId) : undefined} compact />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The review speaks first: a short note from the week's data. Each claim can be
 * opened to show the trades and notes it rests on.
 */
function CoachNote({ lines, tradesById, entries }: { lines: CoachLine[]; tradesById: Map<string, Trade>; entries: Entry[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const suggestion = lines.find((l) => l.kind === 'suggestion');
  const facts = lines.filter((l) => l.kind !== 'suggestion');
  return (
    <motion.section
      className={s.coach}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      aria-label="Your week, in plain words"
    >
      <div className={s.coachBody}>
        {facts.map((l, i) => {
          const n = l.tradeIds.length + l.entryIds.length;
          return (
            <p key={i} className={i === 0 ? s.coachLead : s.coachFact}>
              {l.text}
              {n > 0 && l.kind !== 'summary' && (
                <>
                  {' '}
                  <button className={s.cite} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                    {l.entryIds.length ? `${l.entryIds.length} note${l.entryIds.length === 1 ? '' : 's'}` : `${l.tradeIds.length} trade${l.tradeIds.length === 1 ? '' : 's'}`}
                  </button>
                </>
              )}
              {l.confidence && <span className={s.level}>{l.confidence}</span>}
            </p>
          );
        })}
      </div>
      {suggestion && <p className={s.suggestion}>{suggestion.text}</p>}
      <AnimatePresence initial={false}>
        {open != null && facts[open] && (
          <motion.div
            key={open}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="list" style={{ marginTop: 14 }}>
              {facts[open].entryIds.length
                ? entries
                    .filter((e) => facts[open].entryIds.includes(e.id))
                    .map((e) => <EntryItem key={e.id} entry={e} trade={e.tradeId ? tradesById.get(e.tradeId) : undefined} compact />)
                : facts[open].tradeIds.slice(0, 12).map((id) => {
                    const t = tradesById.get(id);
                    return t ? <TradeItem key={id} trade={t} /> : null;
                  })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
