'use client';

import { FlaskConical } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { describeChange, describeLength } from '@/lib/experiments/plan';
import { buildReport } from '@/lib/experiments/report';
import type { Experiment } from '@/lib/experiments/types';
import { useExperiments } from '@/lib/experiments/useExperiments';
import { fmt } from '@/lib/format';
import { useRules } from '@/lib/rules/useRules';
import { useUnits } from '@/lib/store';
import { StartExperiment } from './StartExperiment';
import s from './Experiments.module.css';

/** The trader's experiment: progress while it runs, the honest report when it ends. */
export function ExperimentCard() {
  const { experiments, running, progress, ready, abandon } = useExperiments();
  const [starting, setStarting] = useState(false);
  if (!ready) return null;
  const latest = experiments.find((e) => e.status === 'complete');
  // The report stays until the trader has answered it.
  const awaiting = !running && latest?.result && (latest.useful === undefined || latest.result.kept === undefined) ? latest : null;

  return (
    <section className={`card ${s.card}`} aria-label="Experiment">
      <div className={s.head}>
        <FlaskConical size={16} className={s.icon} aria-hidden />
        <span className="stat-label">{awaiting ? 'Experiment finished' : 'Experiment'}</span>
      </div>

      {running && progress ? (
        <>
          <p className={s.title}>{describeChange(running.change)}</p>
          <div className={s.progress} aria-label={progress.label}>
            <motion.span
              initial={false}
              animate={{ width: `${progress.fraction * 100}%` }}
              transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </div>
          <p className={s.note}>
            <strong className="num">{progress.label}</strong>
            {progress.breaks.length > 0 &&
              ` · ${progress.breaks.length} went against it, so ${progress.breaks.length === 1 ? 'it’s' : 'they’re'} left out of the result`}
          </p>
          <p className={s.hypothesis}>“{running.hypothesis}”</p>
          <button
            className={`btn btn-ghost btn-sm ${s.stop}`}
            onClick={() => confirm('Stop this experiment? What happened so far is kept.') && abandon(running.id)}
          >
            Stop experiment
          </button>
        </>
      ) : awaiting ? (
        <Report e={awaiting} />
      ) : (
        <>
          <p className={s.note}>
            {latest ? `Last time you tried “${describeChange(latest.change)}” for ${describeLength(latest.length)}. ` : ''}
            Try one change for a while, like skipping a setup for 10 trades. Proof tracks every trade and tells you honestly whether it helped.
          </p>
          <button className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setStarting(true)}>
            Start an experiment
          </button>
        </>
      )}
      <StartExperiment open={starting} onClose={() => setStarting(false)} />
    </section>
  );
}

function Report({ e }: { e: Experiment }) {
  const { units } = useUnits();
  const { rate, decide } = useExperiments();
  const { add } = useRules();
  const [ruled, setRuled] = useState(false);
  const r = buildReport(e, e.result!, units);

  return (
    <>
      <p className={s.title}>{describeChange(e.change)}</p>
      <p className={s.headline}>{r.headline}</p>
      {r.lines.map((l) => (
        <p key={l} className={s.note}>{l}</p>
      ))}
      <p className={s.level}>{r.confidence}</p>

      <div className={s.ask}>
        <span className="label">Was this useful?</span>
        <div className="row">
          <button className="chip" aria-pressed={e.useful === true} onClick={() => rate(e.id, true)}>Yes</button>
          <button className="chip" aria-pressed={e.useful === false} onClick={() => rate(e.id, false)}>Not really</button>
        </div>
      </div>
      <div className={s.ask}>
        <span className="label">What now?</span>
        <div className="row wrap">
          <button className="chip" aria-pressed={e.result?.kept === true} onClick={() => decide(e.id, true)}>Keep doing it</button>
          <button className="chip" aria-pressed={e.result?.kept === false} onClick={() => decide(e.id, false)}>Drop it</button>
          {/* A session worth skipping can become a rule Proof keeps an eye on. */}
          {e.change.kind === 'skipSession' && e.result?.kept && !ruled && (
            <button
              className="btn btn-soft btn-sm"
              onClick={async () => {
                if (e.change.kind === 'skipSession') setRuled(await add({ kind: 'noTrading', params: { sessions: [e.change.session], days: [] } }));
              }}
            >
              Make it a rule
            </button>
          )}
        </div>
        {ruled && <p className={s.note}>Added to your rules.</p>}
      </div>
      <p className="faint" style={{ fontSize: 12 }}>Finished {e.endAt ? fmt.date(e.endAt) : ''}</p>
    </>
  );
}
