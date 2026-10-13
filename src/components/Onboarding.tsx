'use client';

import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bitcoin,
  Check,
  Circle,
  Globe2,
  Layers,
  LineChart,
  Monitor,
  MoreHorizontal,
  Plug,
  Repeat,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Target,
  Trophy,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { importPlaybook } from '@/lib/ai-client';
import { QUESTIONS, type Question } from '@/lib/onboarding/questions';
import { accountsOf, platformsOf, usesMetaTrader } from '@/lib/onboarding/profile';
import { suggestRules } from '@/lib/onboarding/suggestRules';
import { describeRule } from '@/lib/rules/describe';
import { useRules } from '@/lib/rules/useRules';
import { useJournal } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import type { TraderProfile } from '@/lib/types';
import { useIntro } from '@/lib/useIntro';
import { MicButton, useVoice, VoiceHelp } from './Voice';
import s from './Onboarding.module.css';

/** Shows the welcome questions again (Settings uses this). */
export function startOnboarding() {
  window.dispatchEvent(new Event('proof:onboarding'));
}

type Answers = Omit<TraderProfile, 'answeredAt'>;
type Step = 'welcome' | Question['key'] | 'playbook' | 'rules' | 'done';
const STEPS: Step[] = ['welcome', ...QUESTIONS.map((q) => q.key), 'playbook', 'rules', 'done'];

const ICONS: Record<string, LucideIcon> = {
  Forex: Globe2,
  Futures: BarChart3,
  Crypto: Bitcoin,
  Stocks: LineChart,
  Indices: Layers,
  Personal: UserRound,
  'Prop challenge': Target,
  'Funded prop account': Trophy,
  Investing: LineChart,
  MT4: Monitor,
  MT5: Monitor,
  cTrader: Zap,
  TradingView: BarChart3,
  Other: MoreHorizontal,
  Nothing: Circle,
  'A spreadsheet': Table2,
  'Another app': AppWindow,
  'Pass a challenge': Trophy,
  'Become consistent': Repeat,
  'Find my edge': Search,
  'Improve discipline': ShieldCheck,
};

const ease = [0.2, 0.8, 0.2, 1] as const;

/**
 * The first minute in Proof: a few one-tap questions (each says why it's
 * asked), an optional sentence on how they trade, rules that fit their goal,
 * and one clear next step. Skippable at any point; shown once per account.
 */
export function Onboarding() {
  const { data, setProfile, setPlaybook } = useJournal();
  const { ready, needsWelcome, markOnboarded } = useIntro();
  const { add } = useRules();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [a, setA] = useState<Answers>({ markets: [] });
  const [desc, setDesc] = useState('');
  const descRef = useRef<HTMLTextAreaElement>(null);
  const mic = useVoice(setDesc, descRef);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);

  // Retake from Settings: start again with the saved answers.
  useEffect(() => {
    const show = () => {
      setStep(1);
      setA(data.profile ? { ...data.profile, accounts: accountsOf(data.profile), platforms: platformsOf(data.profile) } : { markets: [] });
      setOpen(true);
    };
    window.addEventListener('proof:onboarding', show);
    return () => window.removeEventListener('proof:onboarding', show);
  }, [data.profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready && needsWelcome) setOpen(true);
  }, [ready, needsWelcome]);

  const rules = useMemo(() => suggestRules(a), [a]);
  const current = STEPS[step];
  const q = QUESTIONS.find((x) => x.key === current);
  const progress = step / (STEPS.length - 1);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
  };
  const next = () => go(step + 1);

  /** Saves what was answered, marks the welcome done, and moves on. */
  const finish = async (then?: string) => {
    const answered = a.markets.length || a.accounts?.length || a.platforms?.length || a.journalNow || a.goal;
    if (answered) {
      const profile: TraderProfile = { ...a, answeredAt: new Date().toISOString() };
      setProfile(profile);
      saveProfile(profile);
    }
    await Promise.all(picked.map((i) => add(rules[i])));
    markOnboarded();
    setOpen(false);
    if (then) router.push(then);
  };

  const pick = (key: keyof Answers, value: string) => {
    setA((x) => ({ ...x, [key]: value }));
    // One tap moves on, unless the answer needs a follow-up ("which app?").
    if (!(key === 'journalNow' && value === 'Another app')) setTimeout(next, 220);
  };

  async function readPlaybook() {
    if (!desc.trim()) return next();
    setReading(true);
    const res = await importPlaybook(desc);
    setReading(false);
    if ('error' in res) {
      // Never block the welcome on the AI: keep their words for the playbook page.
      setReadNote('Saved. You can turn it into setups on the Playbook page any time.');
    } else {
      const names = new Set(data.playbook.setups.map((x) => x.name.toLowerCase()));
      setPlaybook({
        ...data.playbook,
        setups: [...data.playbook.setups, ...res.setups.filter((x) => !names.has(x.name.toLowerCase()))],
        tags: [...new Set([...data.playbook.tags, ...res.tags])],
        fields: [...data.playbook.fields, ...res.fields],
      });
      setReadNote(`Found ${res.setups.length} setup${res.setups.length === 1 ? '' : 's'}: ${res.setups.map((x) => x.name).join(', ')}.`);
    }
    setTimeout(next, 900);
  }

  if (!open) return null;

  return (
    <div className={s.root} role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className={s.glow} aria-hidden />
      <div className={s.top}>
        {step > 0 && current !== 'done' ? (
          <button className="btn btn-ghost btn-icon" onClick={() => go(step - 1)} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        ) : (
          <span />
        )}
        {step > 0 && current !== 'done' ? (
          <div className={s.progress} aria-label={`Step ${step} of ${STEPS.length - 2}`}>
            <motion.span initial={false} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.4, ease }} />
          </div>
        ) : (
          <span />
        )}
        {current !== 'done' ? (
          <button className="btn btn-ghost btn-sm" onClick={() => finish()}>Skip</button>
        ) : (
          <span />
        )}
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={current}
          className={s.body}
          custom={dir}
          initial={{ opacity: 0, x: 28 * dir }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -28 * dir }}
          transition={{ duration: 0.26, ease }}
        >
          {current === 'welcome' && (
            <div className={s.welcome}>
              <span className={s.mark}>Proof</span>
              <h1 id="ob-title" className={s.hero}>Let’s set Proof up for how you trade.</h1>
              <p className={s.why}>About a minute. You can change anything later.</p>
              <ul className={s.points}>
                {[
                  [Plug, 'Your trades come in on their own'],
                  [Sparkles, 'Say what happened in a few seconds'],
                  [Search, 'See what’s working, with the trades behind it'],
                ].map(([Icon, text]) => {
                  const I = Icon as LucideIcon;
                  return (
                    <li key={text as string}>
                      <span className={s.pointIcon}><I size={16} /></span>
                      {text as string}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {q && (
            <>
              <p className={s.count}>Question {QUESTIONS.indexOf(q) + 1} of {QUESTIONS.length}</p>
              <h1 id="ob-title" className={s.title}>{q.title}</h1>
              <p className={s.why}>{q.multi ? `${q.why} Pick all that apply.` : q.why}</p>
              <div className={s.options} data-multi={q.multi || undefined}>
                {q.options.map((o) => {
                  const list = (q.multi ? (a[q.key] as string[] | undefined) : undefined) ?? [];
                  const on = q.multi ? list.includes(o) : a[q.key] === o;
                  const Icon = ICONS[o] ?? Circle;
                  return (
                    <motion.button
                      key={o}
                      className={s.option}
                      aria-pressed={on}
                      whileTap={{ scale: 0.98 }}
                      onClick={() =>
                        q.multi
                          ? setA((x) => ({ ...x, [q.key]: on ? list.filter((m) => m !== o) : [...list, o] }))
                          : pick(q.key, o)
                      }
                    >
                      <span className={s.optionIcon}><Icon size={18} /></span>
                      <span className={s.optionLabel}>{o}</span>
                      <span className={s.tick} aria-hidden>{on && <Check size={14} strokeWidth={3} />}</span>
                    </motion.button>
                  );
                })}
              </div>
              {q.key === 'journalNow' && a.journalNow === 'Another app' && (
                <input
                  className={`input ${s.extra}`}
                  placeholder="Which one?"
                  value={a.journalApp ?? ''}
                  onChange={(e) => setA((x) => ({ ...x, journalApp: e.target.value }))}
                  autoFocus
                  maxLength={40}
                />
              )}
            </>
          )}

          {current === 'playbook' && (
            <>
              <p className={s.count}>Optional</p>
              <h1 id="ob-title" className={s.title}>How do you trade?</h1>
              <p className={s.why}>A sentence or two is enough. Proof turns it into your own setups, so every note is sorted your way.</p>
              <textarea
                ref={descRef}
                className={`input ${s.describe}`}
                aria-label="How you trade"
                rows={4}
                value={mic.interim ? `${desc} ${mic.interim}` : desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="e.g. I trade 2-touch and 3-touch continuations at value areas on the 1H, mostly London."
              />
              <VoiceHelp mic={mic} />
              <div className={s.describeRow}>
                <MicButton mic={mic} label="Say it instead" />
                {readNote && <p className={s.readNote}>{readNote}</p>}
              </div>
            </>
          )}

          {current === 'rules' && (
            <>
              <p className={s.count}>Optional</p>
              <h1 id="ob-title" className={s.title}>Want Proof to hold you to a few rules?</h1>
              <p className={s.why}>It tells you calmly when you’re close, and never stops a trade. Pick any, or none.</p>
              <div className={s.options}>
                {rules.map((r, i) => {
                  const on = picked.includes(i);
                  return (
                    <motion.button
                      key={describeRule(r)}
                      className={s.option}
                      aria-pressed={on}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setPicked(on ? picked.filter((x) => x !== i) : [...picked, i])}
                    >
                      <span className={s.optionIcon}><ShieldCheck size={18} /></span>
                      <span className={s.optionLabel}>{describeRule(r)}</span>
                      <span className={s.tick} aria-hidden>{on && <Check size={14} strokeWidth={3} />}</span>
                    </motion.button>
                  );
                })}
              </div>
              <p className={s.small}>You can change the numbers later on the Playbook page.</p>
            </>
          )}

          {current === 'done' && (
            <div className={s.welcome}>
              <motion.span
                className={s.doneIcon}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              >
                <Check size={26} strokeWidth={3} />
              </motion.span>
              <h1 id="ob-title" className={s.hero}>You’re set.</h1>
              <p className={s.why}>
                {usesMetaTrader(a)
                  ? 'Connect your MetaTrader account and your trades, past and future, come in on their own.'
                  : 'Add your first trade or note, and Proof starts learning how you trade.'}
              </p>
              <label className={s.chat}>
                <input type="checkbox" checked={!!a.chat} onChange={(e) => setA((x) => ({ ...x, chat: e.target.checked }))} />
                <span>I’m happy to chat for 15 minutes about my trading. It helps shape what Proof does next.</span>
              </label>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className={s.actions}>
        {current === 'welcome' && (
          <button className={`btn btn-primary btn-lg btn-block ${s.cta}`} onClick={next}>
            Let’s go <ArrowRight size={16} />
          </button>
        )}
        {q && (q.multi || (q.key === 'journalNow' && a.journalNow === 'Another app')) && (
          <button className={`btn btn-primary btn-lg btn-block ${s.cta}`} onClick={next} disabled={q.multi && !((a[q.key] as string[] | undefined)?.length)}>
            Continue <ArrowRight size={16} />
          </button>
        )}
        {current === 'playbook' && (
          <>
            <button className={`btn btn-primary btn-lg btn-block ${s.cta}`} onClick={readPlaybook} disabled={reading}>
              {reading ? 'Reading…' : desc.trim() ? <>Continue <ArrowRight size={16} /></> : 'Skip for now'}
            </button>
          </>
        )}
        {current === 'rules' && (
          <button className={`btn btn-primary btn-lg btn-block ${s.cta}`} onClick={next}>
            {picked.length ? <>Add {picked.length === 1 ? 'this rule' : `${picked.length} rules`} <ArrowRight size={16} /></> : 'Not now'}
          </button>
        )}
        {current === 'done' && (
          <>
            {(usesMetaTrader(a)) && (
              <button className={`btn btn-primary btn-lg btn-block ${s.cta}`} onClick={() => finish('/settings#accounts')}>
                <Plug size={16} /> Connect MetaTrader
              </button>
            )}
            <button
              className={`btn ${usesMetaTrader(a) ? 'btn-ghost' : 'btn-primary'} btn-lg btn-block ${s.cta}`}
              onClick={() => finish()}
            >
              {usesMetaTrader(a) ? 'Look around first' : <>Start journaling <ArrowRight size={16} /></>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Saves the answers to the trader's profile so the team can see who Proof is for. */
async function saveProfile(p: TraderProfile) {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  await sb.from('profiles').upsert({
    user_id: data.session.user.id,
    markets: p.markets,
    // Several answers are kept readable in the dashboard, e.g. "Personal, Prop challenge".
    account: accountsOf(p).join(', ') || null,
    platform: platformsOf(p).join(', ') || null,
    journal_now: p.journalNow ?? null,
    journal_app: p.journalApp?.slice(0, 40) ?? null,
    goal: p.goal ?? null,
    chat: p.chat ?? null,
    answered_at: p.answeredAt,
  });
}
