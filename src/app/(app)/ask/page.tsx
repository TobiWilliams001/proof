'use client';

import { ArrowUp, ArrowUpRight, ChevronDown, Mic, Search, Square } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EntryItem, TradeItem } from '@/components/Items';
import { SPRING, stagger } from '@/components/motion';
import { VoiceHelp } from '@/components/Voice';
import { answerQuestion, type Answer } from '@/lib/ask';
import { allQuestions, matchQuestions, suggestQuestions } from '@/lib/ask-suggest';
import { useDictation } from '@/lib/speech';
import { useJournal, useUnits } from '@/lib/store';
import { say, VOICE_SPEAK_KEY } from '@/components/VoiceCommand';
import s from './ask.module.css';

// For a journal with no trades yet: what Ask will be able to do.
const STARTERS = ['Which setup makes me the most?', 'How do my trades do in the hour after a loss?', 'How do I do when I follow my plan?'];

interface Turn {
  id: number;
  q: string;
  a: Answer;
}

export default function AskPage() {
  const { data, ready, logQuestion } = useJournal();
  const { units } = useUnits();
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const append = useCallback((t: string) => setInput((p) => (p ? `${p} ${t}` : t)), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const mic = useDictation(append, { onFallback: () => inputRef.current?.focus() });
  const [focused, setFocused] = useState(false);
  const [pick, setPick] = useState(-1);

  // Built from the trader's own setups, pairs and words, and only questions Ask can answer.
  const ctx = useMemo(() => ({ trades: data.trades, entries: data.entries }), [data.trades, data.entries]);
  const [today] = useState(() => new Date());
  const groups = useMemo(() => (ready ? suggestQuestions(ctx, data.playbook, today) : []), [ready, ctx, data.playbook, today]);
  const pool = useMemo(() => (ready ? allQuestions(ctx, data.playbook, today) : []), [ready, ctx, data.playbook, today]);
  const matches = useMemo(() => (focused ? matchQuestions(input, pool) : []), [focused, input, pool]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length]);

  const ask = (q: string, aloud = false) => {
    const question = q.trim();
    if (!question) return;
    mic.stop();
    const a = answerQuestion(question, { trades: data.trades, entries: data.entries }, data.playbook, new Date(), units);
    if (aloud) say(a.text);
    setTurns((t) => [...t, { id: Date.now(), q: question, a }]);
    setInput('');
    setPick(-1);
    logQuestion({ question, toolCalls: a.toolCalls, answer: a.text, tradeIds: a.tradeIds, entryIds: a.entryIds });
  };

  // A question asked out loud ("Talk to Proof") arrives in the address; answer it, aloud.
  const asked = useRef(false);
  useEffect(() => {
    if (!ready || asked.current) return;
    const q = new URLSearchParams(window.location.search).get('q');
    if (!q) return;
    asked.current = true;
    let aloud = false;
    try {
      aloud = sessionStorage.getItem(VOICE_SPEAK_KEY) === '1';
      sessionStorage.removeItem(VOICE_SPEAK_KEY);
    } catch {}
    window.history.replaceState(null, '', '/ask');
    // Answering a question handed over from the talk screen, once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    ask(q, aloud);
    // Runs once, when the journal is ready to answer from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Answers from your own trades, never made up</div>
        <h1 className="page-title">Ask your journal</h1>
      </header>

      <AnimatePresence>
        {turns.length === 0 && (
          <motion.section
            className={s.suggest}
            variants={stagger.parent}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
          >
            {groups.length ? (
              groups.map(({ group, qs }) => (
                <motion.div key={group} className={s.group} variants={stagger.child}>
                  <h2 className={s.groupTitle}>{group}</h2>
                  <div className={s.groupList}>
                    {qs.map((q) => (
                      <motion.button key={q} className={s.sugg} onClick={() => ask(q)} disabled={!ready} whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
                        <span>{q}</span>
                        <ArrowUpRight size={16} className="faint" />
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              ))
            ) : ready ? (
              <motion.div className={s.group} variants={stagger.child}>
                <h2 className={s.groupTitle}>Once your trades are in, you can ask things like</h2>
                <div className={s.groupList}>
                  {STARTERS.map((q) => (
                    <p key={q} className={s.sugg} style={{ cursor: 'default' }}><span>{q}</span></p>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </motion.section>
        )}
      </AnimatePresence>

      <div className={s.thread}>
        {turns.map((t) => (
          <TurnView key={t.id} turn={t} />
        ))}
        <div ref={endRef} />
      </div>

      {mic.error && (
        <div className={s.voiceHelp}>
          <VoiceHelp mic={mic} />
        </div>
      )}
      <form
        className={s.askBar}
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        {/* Matching questions as the trader types, like a search. */}
        <AnimatePresence>
          {matches.length > 0 && (
            <motion.ul
              id="ask-matches"
              role="listbox"
              className={s.matches}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }}
              transition={{ duration: 0.16 }}
            >
              {matches.map((q, i) => (
                <li key={q} role="option" aria-selected={i === pick}>
                  {/* Pointer down, not click, so the tap lands before the input loses focus. */}
                  <button type="button" className={s.match} data-on={i === pick || undefined} onPointerDown={(e) => { e.preventDefault(); ask(q); }}>
                    <Search size={14} aria-hidden /> <span>{q}</span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
        <input
          className={s.askInput}
          placeholder="Ask anything about your trading…"
          ref={inputRef}
          value={mic.interim ? `${input} ${mic.interim}` : input}
          onChange={(e) => {
            setInput(e.target.value);
            setPick(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (!matches.length) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setPick((p) => (e.key === 'ArrowDown' ? (p + 1) % matches.length : (p - 1 + matches.length) % matches.length));
            } else if (e.key === 'Enter' && pick >= 0) {
              e.preventDefault();
              ask(matches[pick]);
            } else if (e.key === 'Escape') setFocused(false);
          }}
          aria-label="Your question"
          aria-autocomplete="list"
          aria-controls="ask-matches"
          aria-expanded={matches.length > 0}
          role="combobox"
          enterKeyHint="send"
        />
        {mic.supported && (
          <button type="button" className={`btn btn-icon btn-sm ${mic.listening ? s.micOn : 'btn-ghost'}`} onClick={mic.toggle} aria-label={mic.listening ? 'Stop listening' : 'Ask by voice'}>
            {mic.listening ? <Square size={12} fill="currentColor" /> : <Mic size={16} />}
          </button>
        )}
        <button className="btn btn-primary btn-icon btn-sm" disabled={!input.trim() || !ready} aria-label="Ask">
          <ArrowUp size={17} />
        </button>
      </form>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const { data } = useJournal();
  const [showTrades, setShowTrades] = useState(false);
  const { a } = turn;
  const trades = useMemo(() => data.trades.filter((t) => a.tradeIds.includes(t.id)), [data.trades, a.tradeIds]);
  const entries = useMemo(() => data.entries.filter((e) => a.entryIds.includes(e.id)), [data.entries, a.entryIds]);
  const tradesById = useMemo(() => new Map(data.trades.map((t) => [t.id, t])), [data.trades]);

  return (
    <div className={s.turn}>
      <motion.div className={s.q} initial={{ opacity: 0, x: 16, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={SPRING}>
        {turn.q}
      </motion.div>
      <motion.div className={s.a} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.12 }}>
        <p className={s.answer}>{a.text}</p>
        {a.confidence && (
          <p className={s.level}>
            {a.confidence.charAt(0).toUpperCase() + a.confidence.slice(1)} · {a.basis} trade{a.basis === 1 ? '' : 's'}
          </p>
        )}

        {a.highlights.length > 0 && (
          <div className={s.highlights}>
            {a.highlights.map((h, i) => (
              <div key={i} className={s.hl}>
                <div className={s.hlLabel}>{h.label}</div>
                <div className={`num ${s.hlValue} ${h.tone ?? ''}`}>{h.value}</div>
              </div>
            ))}
          </div>
        )}

        {entries.length > 0 && (
          <div className="list" style={{ marginTop: 14 }}>
            {entries.slice(0, 5).map((e) => (
              <EntryItem key={e.id} entry={e} trade={e.tradeId ? tradesById.get(e.tradeId) : undefined} compact />
            ))}
          </div>
        )}

        {trades.length > 0 && (
          <div className={s.support}>
            <div className={s.supportHead}>
              Based on {trades.length} trade{trades.length === 1 ? '' : 's'}
            </div>
            <div className="list">
              {trades.slice(0, showTrades ? 30 : 3).map((t) => (
                <Link key={t.id} href={`/trades?trade=${t.id}`} className={s.supportRow}>
                  <TradeItem trade={t} />
                </Link>
              ))}
            </div>
            {trades.length > 3 && (
              <button className={s.disclose} aria-expanded={showTrades} onClick={() => setShowTrades(!showTrades)}>
                {showTrades ? 'Show fewer' : `See all ${Math.min(trades.length, 30)}`}
                <ChevronDown size={14} className={s.chev} />
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

