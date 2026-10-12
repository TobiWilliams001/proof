'use client';

import { ChevronRight, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { describeChange } from '@/lib/experiments/plan';
import { useExperiments } from '@/lib/experiments/useExperiments';
import s from './Experiments.module.css';

/** A quiet check-in on the journal: what's being tried, and how far along it is. */
export function ExperimentLine() {
  const { running, progress, experiments } = useExperiments();
  const finished = !running && experiments.find((e) => e.status === 'complete' && e.result && e.useful === undefined);
  if (!(running && progress) && !finished) return null;
  return (
    <Link href="/review" className={s.line}>
      <FlaskConical size={14} className={s.icon} aria-hidden />
      {running && progress ? (
        <span>
          {describeChange(running.change)} · <strong className="num">{progress.label}</strong>
        </span>
      ) : (
        <span>Your experiment is finished. See how it went</span>
      )}
      <ChevronRight size={15} className="faint" aria-hidden />
    </Link>
  );
}
