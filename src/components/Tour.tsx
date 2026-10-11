'use client';

import { AnimatePresence, motion } from 'motion/react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useJournal } from '@/lib/store';
import { InstallCard } from './InstallCard';
import s from './Tour.module.css';

const DONE_KEY = 'proof.tour.done';

interface Step {
  target?: string; // data-tour name; the first visible match is highlighted
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { title: 'Welcome to Proof', body: 'Your trades come in on their own. You say what happened. Proof shows you where you win and where you keep losing.' },
  { target: 'composer', title: 'Say what happened', body: 'Type it or tap the mic, the way you’d tell a friend. Proof sorts it into your own setups.' },
  { target: 'prompts', title: 'Trades waiting for you', body: 'When a trade opens, Proof asks for your plan. When it closes, it asks what happened. One question each time.' },
  { target: 'nav-ask', title: 'Ask anything', body: 'Ask about your trading in plain words. Every answer shows the trades behind it.' },
  { target: 'nav-review', title: 'Your week, written for you', body: 'Each week Proof sums up what worked, what didn’t, and one thing to work on.' },
  { title: 'Bring in your trades', body: 'Connect your MetaTrader account and your trades will appear here on their own.' },
];

/** Replays the tour from anywhere (Settings uses this). */
export function startTour() {
  try {
    localStorage.removeItem(DONE_KEY);
  } catch {}
  window.dispatchEvent(new Event('proof:tour'));
}

function visible(name: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  // offsetParent is null for fixed elements (the docked note box), so check size and style instead.
  return (
    all.find((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    }) ?? null
  );
}

export function Tour() {
  const { ready, data, loadDemo } = useJournal();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Steps whose target isn't on screen (no waiting trades yet) are skipped.
  const steps = STEPS.filter((st) => !st.target || st.target !== 'prompts' || (typeof document !== 'undefined' && !!visible('prompts')));
  const step = steps[Math.min(i, steps.length - 1)];

  useEffect(() => {
    const show = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener('proof:tour', show);
    return () => window.removeEventListener('proof:tour', show);
  }, []);

  useEffect(() => {
    if (!ready || path !== '/journal') return;
    let seen = true;
    try {
      seen = localStorage.getItem(DONE_KEY) === '1';
    } catch {}
    // First visit only; opening after hydration so the page is there to point at.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!seen) setOpen(true);
  }, [ready, path]);

  const target = step?.target;

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = target ? visible(target) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    const el = target ? visible(target) : null;
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const frame = requestAnimationFrame(measure);
    const t = setTimeout(measure, 350); // after any scroll settles
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [open, i, target]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {}
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish, steps.length]);

  if (!open || !step) return null;
  const last = i >= steps.length - 1;
  const pad = 8;
  // Card sits below the highlight if there's room, otherwise above; centred without a target.
  const below = rect ? rect.bottom + 220 < window.innerHeight : true;

  return (
    <div className={s.root} role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <AnimatePresence>
        {rect ? (
          <motion.div
            key="spot"
            className={s.spot}
            initial={false}
            animate={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          />
        ) : (
          <motion.div key="dim" className={s.dim} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        )}
      </AnimatePresence>

      <motion.div
        key={i}
        className={s.card}
        style={
          rect
            ? below
              ? { top: Math.min(rect.bottom + 16, window.innerHeight - 240) }
              : { bottom: window.innerHeight - rect.top + 16 }
            : { top: '50%', transform: 'translateY(-50%)' }
        }
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className={s.progress} aria-hidden>
          {steps.map((_, n) => (
            <span key={n} data-on={n <= i || undefined} />
          ))}
        </div>
        <h2 id="tour-title" className={s.title}>{step.title}</h2>
        <p className={s.body}>{step.body}</p>

        {last && (
          <div className={s.finalActions}>
            <button
              className="btn btn-primary"
              onClick={() => {
                finish();
                router.push('/settings#accounts');
              }}
            >
              Connect MetaTrader
            </button>
            {data.trades.length === 0 && (
              <button
                className="btn btn-soft"
                onClick={() => {
                  loadDemo();
                  finish();
                }}
              >
                Try it with sample trades
              </button>
            )}
            <InstallCard compact />
          </div>
        )}

        <div className={s.nav}>
          <button className={s.skip} onClick={finish}>{last ? 'Close' : 'Skip'}</button>
          <span className="spacer" />
          {i > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setI(i - 1)}>Back</button>
          )}
          {!last && (
            <button className="btn btn-primary btn-sm" onClick={() => setI(i + 1)} autoFocus>
              {i === 0 ? 'Show me' : 'Next'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
