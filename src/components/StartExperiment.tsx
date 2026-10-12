'use client';

import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { baselineFor, describeChange, hypothesisFor, makePlan } from '@/lib/experiments/plan';
import type { Change, Length, Measure, Plan } from '@/lib/experiments/types';
import { useExperiments } from '@/lib/experiments/useExperiments';
import { fmt } from '@/lib/format';
import { useJournal, useUnits } from '@/lib/store';
import type { Session } from '@/lib/types';
import { Sheet } from './Sheet';
import s from './Experiments.module.css';

const LENGTHS: { label: string; length: Length }[] = [
  { label: '10 trades', length: { kind: 'trades', value: 10 } },
  { label: '20 trades', length: { kind: 'trades', value: 20 } },
  { label: '2 weeks', length: { kind: 'days', value: 14 } },
];
const SESSIONS: Session[] = ['Asian', 'London', 'New York'];

/** Starting points, each with an example, so it's clear what an experiment is. */
function templates(setups: string[]): { title: string; example: string; change: Change | null }[] {
  return [
    { title: 'Skip a setup', example: `e.g. No ${setups[0] ?? 'Breakout retest'} for 10 trades`, change: setups[0] ? { kind: 'skipSetup', setup: setups[0] } : null },
    { title: 'Check for a habit', example: 'e.g. Check for “early entry” before each trade', change: { kind: 'checkFor', word: 'early entry' } },
    { title: 'Only trades that fit your plan', example: 'e.g. Take only planned trades for 10 trades', change: { kind: 'followPlan' } },
    { title: 'Skip a session', example: 'e.g. No New York session for 2 weeks', change: { kind: 'skipSession', session: 'New York' } },
  ];
}

export function StartExperiment({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { plan: Plan; insightId: string };
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Start an experiment">
      {open && <Flow key={initial?.insightId ?? 'manual'} initial={initial} onDone={onClose} />}
    </Sheet>
  );
}

function Flow({ initial, onDone }: { initial?: { plan: Plan; insightId: string }; onDone: () => void }) {
  const { data } = useJournal();
  const { running, start } = useExperiments();
  const setups = useMemo(
    () => [...new Set([...data.playbook.setups.map((x) => x.name), ...data.trades.map((t) => t.setup).filter((x): x is string => !!x)])],
    [data.playbook.setups, data.trades],
  );
  const [plan, setPlan] = useState<Plan | null>(initial?.plan ?? null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (running) {
    return (
      <p className={s.note}>
        You already have an experiment running: <strong>{describeChange(running.change)}</strong>. Finish or stop it first, so each change gets a fair test.
      </p>
    );
  }

  if (!plan) {
    return (
      <div className="stack">
        <p className={s.note}>Try one change for a while. Proof tracks every trade and tells you honestly whether it helped.</p>
        <div className={s.templates}>
          {templates(setups).map((t) =>
            t.change ? (
              <button key={t.title} className={s.template} onClick={() => setPlan(makePlan(t.change!))}>
                <span className={s.templateTitle}>{t.title}</span>
                <span className={s.templateExample}>{t.example}</span>
              </button>
            ) : null,
          )}
        </div>
      </div>
    );
  }

  const change = plan.change;
  const setChange = (c: Change) => setPlan({ ...plan, change: c, hypothesis: hypothesisFor(c, plan.measure) });

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setProblem(null);
        const r = await start(plan, initial?.insightId);
        setBusy(false);
        if (r === 'ok') return onDone();
        setProblem(r === 'already_running' ? 'Another experiment is already running.' : 'Couldn’t start it. Check your connection and try again.');
      }}
    >
      <div className={s.preview}>
        <FlaskConical size={18} />
        <span>{describeChange(change)}</span>
      </div>

      {change.kind === 'skipSetup' && setups.length > 1 && (
        <Choice label="Setup" options={setups} value={change.setup} onPick={(setup) => setChange({ kind: 'skipSetup', setup })} />
      )}
      {change.kind === 'checkFor' && (
        <label className="field">
          <span className="label">The habit, in your words</span>
          <input
            className="input"
            value={change.word}
            maxLength={40}
            onChange={(e) => setChange({ kind: 'checkFor', word: e.target.value })}
            placeholder="early entry"
          />
          <span className="faint" style={{ fontSize: 12.5 }}>A trade counts against it if your note about it mentions these words.</span>
        </label>
      )}
      {change.kind === 'skipSession' && (
        <Choice label="Session" options={SESSIONS} value={change.session} onPick={(session) => setChange({ kind: 'skipSession', session: session as Session })} />
      )}

      <Choice
        label="Measure"
        options={['Average per trade', 'Win rate']}
        value={plan.measure === 'perTrade' ? 'Average per trade' : 'Win rate'}
        onPick={(v) => {
          const measure: Measure = v === 'Win rate' ? 'winRate' : 'perTrade';
          setPlan({ ...plan, measure, hypothesis: hypothesisFor(change, measure) });
        }}
      />
      <Choice
        label="For"
        options={LENGTHS.map((l) => l.label)}
        value={LENGTHS.find((l) => l.length.kind === plan.length.kind && l.length.value === plan.length.value)?.label ?? ''}
        onPick={(v) => setPlan({ ...plan, length: LENGTHS.find((l) => l.label === v)!.length })}
      />

      <label className="field">
        <span className="label">What you expect</span>
        <textarea className="input" rows={2} maxLength={300} value={plan.hypothesis} onChange={(e) => setPlan({ ...plan, hypothesis: e.target.value })} />
      </label>

      <Baseline plan={plan} />

      {problem && <p className={s.problem} role="alert">{problem}</p>}
      <div className="actions">
        {!initial && <button type="button" className="btn btn-ghost" onClick={() => setPlan(null)}>Back</button>}
        <button className="btn btn-primary" disabled={busy || (change.kind === 'checkFor' && !change.word.trim())}>
          {busy ? 'Starting…' : 'Start experiment'}
        </button>
      </div>
    </form>
  );
}

/** The "before" number, shown up front so the trader knows what they're comparing against. */
function Baseline({ plan }: { plan: Plan }) {
  const { data } = useJournal();
  const u = useUnits();
  // The start moment is "now"; computed once per render of the form.
  const [now] = useState(() => new Date());
  const b = baselineFor(plan, data.trades, now);
  if (!b.count) return <p className={s.note}>No earlier trades to compare with yet, so Proof will report what happens during the experiment on its own.</p>;
  const value = plan.measure === 'winRate' ? `${fmt.pct(b.winRate)} won` : `${u.show(b.perTradeR, b.perTradeMoney)} a trade`;
  return (
    <p className={s.baseline}>
      <span className="faint">Before:</span> <strong className="num">{value}</strong> over your last {b.count} trade{b.count === 1 ? '' : 's'}.
    </p>
  );
}

function Choice({ label, options, value, onPick }: { label: string; options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="row wrap">
        {options.map((o) => (
          <button key={o} type="button" className="chip" aria-pressed={o === value} onClick={() => onPick(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
