'use client';

import { FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { describeChange, describeLength } from '@/lib/experiments/plan';
import { useExperiments } from '@/lib/experiments/useExperiments';
import { fmt } from '@/lib/format';
import { StartExperiment } from './StartExperiment';
import s from './Experiments.module.css';

/** The trader's current experiment, or an invitation to start one. */
export function ExperimentCard() {
  const { running, ready } = useExperiments();
  const [starting, setStarting] = useState(false);
  if (!ready) return null;

  return (
    <section className={`card ${s.card}`} aria-label="Experiment">
      <div className={s.head}>
        <FlaskConical size={16} className={s.icon} aria-hidden />
        <span className="stat-label">Experiment</span>
      </div>
      {running ? (
        <>
          <p className={s.title}>{describeChange(running.change)}</p>
          <p className={s.note}>For {describeLength(running.length)}, since {fmt.date(running.startAt)}.</p>
        </>
      ) : (
        <>
          <p className={s.note}>Try one change for a while, like skipping a setup for 10 trades. Proof tracks every trade and tells you honestly whether it helped.</p>
          <button className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setStarting(true)}>
            Start an experiment
          </button>
        </>
      )}
      <StartExperiment open={starting} onClose={() => setStarting(false)} />
    </section>
  );
}
