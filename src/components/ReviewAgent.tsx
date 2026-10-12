'use client';

import { FlaskConical, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { describeChange } from '@/lib/experiments/plan';
import { buildReport } from '@/lib/experiments/report';
import { experimentsDuring } from '@/lib/experiments/track';
import { useExperiments } from '@/lib/experiments/useExperiments';
import { fmt } from '@/lib/format';
import { describeRule } from '@/lib/rules/describe';
import { useRules } from '@/lib/rules/useRules';
import { rulesWeek } from '@/lib/rules/week';
import { useJournal, useUnits } from '@/lib/store';
import { useNow } from '@/lib/useNow';
import { TradeItem } from './Items';
import s from './ReviewAgent.module.css';

const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });

/** Rules kept and broken this week, day by day, with the trades behind each break. */
export function RulesThisWeek({ from, to }: { from: Date; to: Date }) {
  const { data } = useJournal();
  const { rules } = useRules();
  const [open, setOpen] = useState<string | null>(null);
  const weeks = useMemo(() => rulesWeek(rules, data.trades, from, to), [rules, data.trades, from, to]);
  if (!weeks.length) return null;
  const byId = new Map(rules.map((r) => [r.id, r]));
  const tradesById = new Map(data.trades.map((t) => [t.id, t]));

  return (
    <div className={s.block} aria-label="Your rules this week">
      <div className={s.head}>
        <ShieldCheck size={15} className={s.icon} aria-hidden />
        <span className="stat-label">Your rules</span>
      </div>
      <div className="list">
        {weeks.map((w) => {
          const days = w.kept.length + w.broken.length;
          return (
            <div key={w.ruleId} className={`list-item ${s.rule}`}>
              <div className={s.ruleTop}>
                <span className={s.ruleName}>{describeRule(byId.get(w.ruleId)!)}</span>
                <span className={s.score} data-clean={!w.broken.length || undefined}>
                  Kept on {w.kept.length} of {days} trading day{days === 1 ? '' : 's'}
                </span>
              </div>
              {w.broken.length > 0 && (
                <div className="row wrap" style={{ gap: 6 }}>
                  {w.broken.map((b) => {
                    const key = `${w.ruleId}${b.day}`;
                    return (
                      <button key={key} className="chip chip-sm chip-neg" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                        Broken {weekday(b.day)}
                      </button>
                    );
                  })}
                </div>
              )}
              <AnimatePresence initial={false}>
                {w.broken.map((b) =>
                  open === `${w.ruleId}${b.day}` ? (
                    <motion.div key={b.day} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', width: '100%' }}>
                      <div className="list" style={{ marginTop: 8 }}>
                        {b.tradeIds.map((id) => (tradesById.get(id) ? <TradeItem key={id} trade={tradesById.get(id)!} /> : null))}
                      </div>
                    </motion.div>
                  ) : null,
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** For a past week: the experiment that ran during it, and how it ended. */
export function ExperimentThatWeek({ from, to }: { from: Date; to: Date }) {
  const { experiments, progress } = useExperiments();
  const { units } = useUnits();
  const now = useNow();
  const [e] = experimentsDuring(experiments, from, to, new Date(now));
  if (!e) return null;
  const status =
    e.status === 'running'
      ? `Running · ${progress?.label ?? ''}`
      : e.status === 'abandoned'
        ? `Stopped on ${fmt.date(e.endAt ?? e.startAt)}`
        : e.result
          ? `${buildReport(e, e.result, units).headline}`
          : 'Finished';
  return (
    <div className={s.block} aria-label="Experiment that week">
      <div className={s.head}>
        <FlaskConical size={15} className={s.icon} aria-hidden />
        <span className="stat-label">Experiment</span>
      </div>
      <p className={s.ruleName}>{describeChange(e.change)}</p>
      <p className={s.note}>{status}</p>
    </div>
  );
}
