'use client';

import { CheckCircle2, ChevronDown, Stethoscope } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { checkJournal, type Issue } from '@/lib/datacheck/checks';
import { useJournal } from '@/lib/store';
import { pullMt } from '@/lib/sync/client';
import { useNow } from '@/lib/useNow';
import { listItem } from './motion';
import s from './HealthCard.module.css';

const SNOOZE_KEY = 'proof.health.snoozed';
const SNOOZE_DAYS = 7;
const SHOW = 3;

function snoozed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * The journal's check-up: numbers that may be wrong come first, then the
 * things that make it more useful. Each says what's off and offers one fix;
 * nothing changes until the trader taps it.
 */
export function HealthCard() {
  const { data, ready, mergeTrades, applySync } = useJournal();
  const now = useNow();
  const [hidden, setHidden] = useState(snoozed);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const issues = useMemo(
    () => (ready ? checkJournal(data, new Date(now)).filter((i) => i.severity === 'fix' || !(hidden[i.id] > now)) : []),
    [ready, data, now, hidden],
  );
  if (!ready || !data.trades.length) return null;

  if (!issues.length) {
    return (
      <p className={s.ok}>
        <CheckCircle2 size={15} aria-hidden /> {done ?? 'Your journal checks out: no doubled trades or gaps found.'}
      </p>
    );
  }

  const snooze = (id: string) => {
    const next = { ...hidden, [id]: now + SNOOZE_DAYS * 864e5 };
    setHidden(next);
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
    } catch {}
  };

  async function act(i: Issue) {
    const a = i.action;
    if (!a) return;
    if (a.kind === 'merge') {
      if (!confirm('Keep one copy of this trade and move its notes onto it? The extra copy is removed.')) return;
      mergeTrades(a.keep, a.remove);
      setDone('Merged. Your totals now count that trade once.');
    }
    if (a.kind === 'reimport') {
      const acc = data.accounts?.find((x) => x.localId === a.accountId);
      if (!acc || !confirm('Bring in that period again from MetaTrader? Trades already in your journal aren’t doubled.')) return;
      setBusy(i.id);
      const r = await pullMt(acc, a.since);
      setBusy(null);
      if (r.state === 'ok') {
        applySync(acc.localId, r);
        setDone(r.closed.length ? 'Done. Any missing trades from that period are back.' : 'Done. MetaTrader has no trades for that period, so nothing was missing.');
        snooze(i.id);
      } else setDone('Couldn’t reach MetaTrader just now. Try again in a few minutes.');
    }
  }

  const shown = all ? issues : issues.slice(0, SHOW);
  return (
    <section className={s.card} aria-label="Journal check">
      <div className={s.head}>
        <Stethoscope size={16} className={s.icon} aria-hidden />
        <span className="stat-label">Journal check</span>
        <span className="faint" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{issues.length} to look at</span>
      </div>
      {done && <p className={s.done}>{done}</p>}
      <AnimatePresence initial={false}>
        {shown.map((i) => (
          <motion.div key={i.id} className={s.issue} data-severity={i.severity} {...listItem}>
            <p className={s.title}>{i.title}</p>
            <p className={s.detail}>{i.detail}</p>
            <div className={s.actions}>
              {i.action?.kind === 'go' && (
                <Link href={i.action.href} className="btn btn-soft btn-sm">{i.action.label}</Link>
              )}
              {i.action?.kind === 'merge' && <button className="btn btn-soft btn-sm" onClick={() => act(i)}>Merge</button>}
              {i.action?.kind === 'reimport' && (
                <button className="btn btn-soft btn-sm" onClick={() => act(i)} disabled={busy === i.id}>
                  {busy === i.id ? 'Bringing it in…' : 'Re-import that period'}
                </button>
              )}
              {i.severity === 'tidy' || i.action?.kind === 'reimport' ? (
                <button className="btn btn-ghost btn-sm" onClick={() => snooze(i.id)}>Not now</button>
              ) : null}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {issues.length > SHOW && (
        <button className={`btn btn-ghost btn-sm ${s.more}`} onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show ${issues.length - SHOW} more`} <ChevronDown size={14} style={{ transform: all ? 'rotate(180deg)' : undefined }} />
        </button>
      )}
    </section>
  );
}
