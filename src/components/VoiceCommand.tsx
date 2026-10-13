'use client';

import { AudioLines, Check, Mic, Send, ShieldCheck, Square, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { describeRule } from '@/lib/rules/describe';
import { useRules } from '@/lib/rules/useRules';
import { useDictation } from '@/lib/speech';
import { useJournal } from '@/lib/store';
import { classify, type Command } from '@/lib/voice/intent';
import { StartExperiment } from './StartExperiment';
import { VoiceHelp } from './Voice';
import s from './VoiceCommand.module.css';

/** Handed to the journal box when a spoken note is waiting for it. */
export const VOICE_NOTE_KEY = 'proof.voice.note';
/** Tells Ask to read its answer aloud, because the question was spoken. */
export const VOICE_SPEAK_KEY = 'proof.voice.speak';

/** Opens the talk screen from anywhere ("Hey Proof" uses this too), optionally with what was already said. */
export function openVoice(said?: string) {
  window.dispatchEvent(new CustomEvent('proof:voice', { detail: said }));
}

/** Reads a short reply aloud, if the device can. */
export function say(text: string) {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {}
}

type Stage = { kind: 'listen' } | { kind: 'confirm'; command: Extract<Command, { type: 'rule' | 'plan' }> } | { kind: 'done'; message: string } | { kind: 'missed' };

/** The talk button, for the top bar and the rail. */
export function TalkButton({ className = '', label = false, wake = false }: { className?: string; label?: boolean; wake?: boolean }) {
  return (
    <button className={className} onClick={() => openVoice()} aria-label={wake ? 'Talk to Proof (listening for “Hey Proof”)' : 'Talk to Proof'} style={{ position: 'relative' }}>
      <AudioLines size={17} /> {label && <span>{wake ? 'Say “Hey Proof”' : 'Talk to Proof'}</span>}
      {wake && <span className={s.wakeDot} aria-hidden />}
    </button>
  );
}

/**
 * Talk to Proof: tap, say what you want, and it happens. A note goes to the
 * journal's confirm card, a question to Ask, "show my week" opens it. Rules
 * and plans are read back for a yes; nothing is saved without one.
 */
export function VoiceCommand() {
  const router = useRouter();
  const { data, addEntry } = useJournal();
  const { add } = useRules();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: 'listen' });
  const [heard, setHeard] = useState('');
  const [typed, setTyped] = useState('');
  const [experiment, setExperiment] = useState<Extract<Command, { type: 'experiment' }> | null>(null);
  const heardRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    // "Hey Proof" can have the microphone back.
    window.dispatchEvent(new Event('proof:voice-closed'));
    setHeard('');
    setTyped('');
    heardRef.current = '';
  }, []);

  const act = useCallback(
    (said: string) => {
      const text = said.trim();
      if (!text) return setStage({ kind: 'missed' });
      const c = classify(text, { trades: data.trades, playbook: data.playbook });
      switch (c.type) {
        case 'navigate':
          router.push(c.to);
          say(`Here’s ${c.label}.`);
          return close();
        case 'ask':
          try {
            sessionStorage.setItem(VOICE_SPEAK_KEY, '1');
          } catch {}
          router.push(`/ask?q=${encodeURIComponent(c.question)}`);
          return close();
        case 'journal':
          try {
            sessionStorage.setItem(VOICE_NOTE_KEY, c.text);
          } catch {}
          router.push('/journal');
          // The journal box may already be on screen; tell it directly too.
          window.dispatchEvent(new Event('proof:voice-note'));
          return close();
        case 'experiment':
          setExperiment(c);
          return close();
        case 'rule':
        case 'plan':
          setStage({ kind: 'confirm', command: c });
          say(c.type === 'rule' ? (c.body ? `Add the rule: ${describeRule(c.body)}?` : 'I couldn’t turn that into a rule.') : `Save this as the plan for ${c.trade}?`);
      }
    },
    [data.trades, data.playbook, router, close],
  );

  const mic = useDictation(
    (t) => {
      heardRef.current = `${heardRef.current} ${t}`.trim();
      setHeard(heardRef.current);
    },
    {
      single: true,
      onFallback: () => inputRef.current?.focus(),
      onEnd: () => {
        if (heardRef.current) act(heardRef.current);
        else setStage((st) => (st.kind === 'listen' ? { kind: 'missed' } : st));
      },
    },
  );

  // Open from the talk button, or from "Hey Proof" with words already said.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const said = (e as CustomEvent<string | undefined>).detail;
      setOpen(true);
      setHeard('');
      heardRef.current = '';
      setStage({ kind: 'listen' });
      if (said) act(said);
      else mic.start();
    };
    window.addEventListener('proof:voice', onOpen);
    return () => window.removeEventListener('proof:voice', onOpen);
  }, [act, mic]);

  // Escape closes it, like any dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      mic.stop();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, mic, close]);

  const again = () => {
    setHeard('');
    heardRef.current = '';
    setStage({ kind: 'listen' });
    mic.start();
  };

  async function confirm(c: Extract<Command, { type: 'rule' | 'plan' }>) {
    if (c.type === 'rule' && c.body) {
      const ok = await add(c.body);
      setStage({ kind: 'done', message: ok ? `Added: ${describeRule(c.body)}. Anything else?` : 'Couldn’t save that rule. Try again in a moment.' });
    }
    if (c.type === 'plan') {
      addEntry({ kind: 'plan', text: c.text, tradeId: c.tradeId });
      setStage({ kind: 'done', message: `Saved as the plan for ${c.trade}. Anything else?` });
    }
  }

  return (
    <>
      <StartExperiment open={!!experiment} onClose={() => setExperiment(null)} initial={experiment?.plan ? { plan: experiment.plan, insightId: 'voice' } : undefined} />
      <AnimatePresence>
        {open && (
          <motion.div className={s.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { mic.stop(); close(); }}>
            <motion.div
              className={s.panel}
              role="dialog"
              aria-modal="true"
              aria-label="Talk to Proof"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className={`btn btn-ghost btn-icon btn-sm ${s.close}`} onClick={() => { mic.stop(); close(); }} aria-label="Close">
                <X size={16} />
              </button>

              {(stage.kind === 'listen' || stage.kind === 'missed') && (
                <>
                  <button className={s.orb} data-on={mic.listening || undefined} onClick={mic.listening ? mic.stop : again} aria-label={mic.listening ? 'Stop listening' : 'Start listening'}>
                    {mic.listening ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
                  </button>
                  <p className={s.prompt}>
                    {stage.kind === 'missed' ? 'I didn’t catch that. Tap and try again.' : mic.listening ? 'Listening…' : 'What do you want to do?'}
                  </p>
                  <p className={s.heard} aria-live="polite">{[heard, mic.interim].filter(Boolean).join(' ') || ' '}</p>
                  <ul className={s.examples} aria-label="Things you can say">
                    <li>“Journal: took the 3-touch on gold, plus 2R”</li>
                    <li>“Which setup makes me the most?”</li>
                    <li>“Add a rule, max two trades a day”</li>
                    <li>“Show me my week”</li>
                  </ul>
                  <VoiceHelp mic={mic} />
                  <form
                    className={s.type}
                    onSubmit={(e) => {
                      e.preventDefault();
                      mic.stop();
                      act(typed);
                    }}
                  >
                    <input ref={inputRef} className={s.typeInput} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type it" aria-label="Or type what you want" />
                    <button className="btn btn-primary btn-icon btn-sm" disabled={!typed.trim()} aria-label="Go">
                      <Send size={15} />
                    </button>
                  </form>
                </>
              )}

              {stage.kind === 'confirm' && (
                <div className={s.confirm}>
                  <span className={s.badge}><ShieldCheck size={18} /></span>
                  {stage.command.type === 'rule' ? (
                    stage.command.body ? (
                      <>
                        <p className={s.prompt}>Add this rule?</p>
                        <p className={s.big}>{describeRule(stage.command.body)}</p>
                      </>
                    ) : (
                      <>
                        <p className={s.prompt}>I couldn’t turn that into a rule Proof can watch.</p>
                        <p className={s.note}>It can hold you to trades a day, losses in a row, a daily loss, or days and sessions you don’t trade.</p>
                      </>
                    )
                  ) : (
                    <>
                      <p className={s.prompt}>Save as the plan for {stage.command.trade}?</p>
                      <p className={s.big}>“{stage.command.text}”</p>
                    </>
                  )}
                  <div className="actions" style={{ width: '100%' }}>
                    <button className="btn btn-ghost" onClick={again}>Say it again</button>
                    {stage.command.type === 'rule' && !stage.command.body ? (
                      <Link href="/playbook" className="btn btn-primary" onClick={close}>Set it up</Link>
                    ) : (
                      <button className="btn btn-primary" onClick={() => confirm(stage.command)}>
                        <Check size={16} /> Yes, save
                      </button>
                    )}
                  </div>
                </div>
              )}

              {stage.kind === 'done' && (
                <div className={s.confirm}>
                  <span className={s.badge} data-done><Check size={18} /></span>
                  <p className={s.prompt}>{stage.message}</p>
                  <div className="actions" style={{ width: '100%' }}>
                    <button className="btn btn-ghost" onClick={close}>Done</button>
                    <button className="btn btn-primary" onClick={again}><Mic size={15} /> Say more</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

