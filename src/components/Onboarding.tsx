'use client';

import { ArrowLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { QUESTIONS } from '@/lib/onboarding/questions';
import { useJournal } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import type { TraderProfile } from '@/lib/types';
import s from './Onboarding.module.css';

export const ONBOARDING_KEY = 'proof.onboarding.done';

/** Shows the welcome questions again (Settings uses this). */
export function startOnboarding() {
  try {
    localStorage.removeItem(ONBOARDING_KEY);
  } catch {}
  window.dispatchEvent(new Event('proof:onboarding'));
}

type Answers = Omit<TraderProfile, 'answeredAt'>;

/**
 * The welcome questions: five taps and an optional chat invite, under 30
 * seconds, skippable at any point. Answers tailor the app and are saved to the
 * trader's profile so the team can see who Proof is for. Never trades or notes.
 */
export function Onboarding() {
  const { ready, data, setProfile } = useJournal();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({ markets: [] });

  useEffect(() => {
    const show = () => {
      setStep(0);
      setA(data.profile ? { ...data.profile } : { markets: [] });
      setOpen(true);
    };
    window.addEventListener('proof:onboarding', show);
    return () => window.removeEventListener('proof:onboarding', show);
  }, [data.profile]);

  useEffect(() => {
    if (!ready || data.profile) return;
    let done = true;
    try {
      done = localStorage.getItem(ONBOARDING_KEY) === '1';
    } catch {}
    // First open only, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!done) setOpen(true);
  }, [ready, data.profile]);

  const close = (finished: boolean) => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {}
    if (finished) {
      const profile: TraderProfile = { ...a, answeredAt: new Date().toISOString() };
      setProfile(profile);
      saveProfile(profile);
    }
    setOpen(false);
    // The tour follows the welcome questions.
    window.dispatchEvent(new Event('proof:onboarded'));
  };

  if (!open) return null;
  const total = QUESTIONS.length + 1;
  const q = QUESTIONS[step];
  const next = () => setStep((n) => Math.min(n + 1, total - 1));
  const pick = (key: keyof Answers, value: string) => {
    setA((x) => ({ ...x, [key]: value }));
    // One tap moves on, unless the answer needs a follow-up ("which app?").
    if (!(key === 'journalNow' && value === 'Another app')) setTimeout(next, 180);
  };

  return (
    <div className={s.root} role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className={s.top}>
        {step > 0 ? (
          <button className="btn btn-ghost btn-icon" onClick={() => setStep(step - 1)} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        ) : (
          <span />
        )}
        <div className={s.progress} aria-hidden>
          {Array.from({ length: total }, (_, n) => (
            <span key={n} data-on={n <= step || undefined} />
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => close(false)}>Skip</button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className={s.body}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {step === 0 && <p className={s.intro}>A few quick taps so Proof fits how you trade.</p>}

          {q ? (
            <>
              <h1 id="ob-title" className={s.title}>{q.title}</h1>
              {q.multi && <p className={s.hint}>Pick all that apply.</p>}
              <div className={s.options}>
                {q.options.map((o) => {
                  const on = q.multi ? a.markets.includes(o) : a[q.key] === o;
                  return (
                    <button
                      key={o}
                      className={s.option}
                      aria-pressed={on}
                      onClick={() =>
                        q.multi
                          ? setA((x) => ({ ...x, markets: on ? x.markets.filter((m) => m !== o) : [...x.markets, o] }))
                          : pick(q.key, o)
                      }
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
              {q.key === 'journalNow' && a.journalNow === 'Another app' && (
                <input
                  className="input"
                  style={{ marginTop: 12 }}
                  placeholder="Which one?"
                  value={a.journalApp ?? ''}
                  onChange={(e) => setA((x) => ({ ...x, journalApp: e.target.value }))}
                  autoFocus
                  maxLength={40}
                />
              )}
              {(q.multi || (q.key === 'journalNow' && a.journalNow === 'Another app')) && (
                <div className="actions" style={{ marginTop: 20 }}>
                  <button className="btn btn-primary" onClick={next}>Next</button>
                </div>
              )}
            </>
          ) : (
            <>
              <h1 id="ob-title" className={s.title}>Happy to chat for 15 minutes about your trading?</h1>
              <p className={s.hint}>It helps shape what Proof does next.</p>
              <div className={s.options}>
                <button className={s.option} aria-pressed={a.chat === true} onClick={() => setA((x) => ({ ...x, chat: true }))}>Yes</button>
                <button className={s.option} aria-pressed={a.chat === false} onClick={() => setA((x) => ({ ...x, chat: false }))}>No thanks</button>
              </div>
              {a.chat && <p className={s.hint} style={{ marginTop: 12 }}>We’ll email you at the address you signed up with.</p>}
              <p className={s.privacy}>We only see these answers. Never your trades or notes.</p>
              <div className="actions" style={{ marginTop: 16 }}>
                <button className="btn btn-primary btn-block" onClick={() => close(true)}>Done</button>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Saves the answers to the trader's profile. A failure doesn't matter to them. */
async function saveProfile(p: TraderProfile) {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  await sb.from('profiles').upsert({
    user_id: data.session.user.id,
    markets: p.markets,
    account: p.account ?? null,
    platform: p.platform ?? null,
    journal_now: p.journalNow ?? null,
    journal_app: p.journalApp?.slice(0, 40) ?? null,
    goal: p.goal ?? null,
    chat: p.chat ?? null,
    answered_at: p.answeredAt,
  });
}
