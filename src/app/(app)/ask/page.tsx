'use client';

import { ArrowUp, ArrowUpRight, ChevronDown, Mic, Square } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EntryItem, TradeItem } from '@/components/Items';
import { SPRING, stagger } from '@/components/motion';
import { VoiceHelp } from '@/components/Voice';
import { answerQuestion, type Answer } from '@/lib/ask';
import { useDictation } from '@/lib/speech';
import { useJournal } from '@/lib/store';
import s from './ask.module.css';

// Grouped by what the trader is trying to learn, so the kinds of questions that work are obvious.
const SUGGESTED: { group: string; qs: string[] }[] = [
  { group: 'Performance', qs: ['What’s my win rate on my best setup?', 'Which setup makes me the most R?', 'What’s my P&L this month?'] },
  { group: 'Leaks', qs: ['Which pair costs me the most?', 'What’s my average R on shorts?'] },
  { group: 'Discipline', qs: ['How do I do when I follow my plan?', 'How do I perform when I log “tired”?', 'What do I keep saying about early entries?'] },
];

interface Turn {
  id: number;
  q: string;
  a: Answer;
}

export default function AskPage() {
  const { data, ready, logQuestion } = useJournal();
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const append = useCallback((t: string) => setInput((p) => (p ? `${p} ${t}` : t)), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const mic = useDictation(append, { onFallback: () => inputRef.current?.focus() });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length]);

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    mic.stop();
    const a = answerQuestion(question, { trades: data.trades, entries: data.entries }, data.playbook);
    setTurns((t) => [...t, { id: Date.now(), q: question, a }]);
    setInput('');
    logQuestion({ question, toolCalls: a.toolCalls, answer: a.text, tradeIds: a.tradeIds, entryIds: a.entryIds });
  };

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Answers from your own trades — never invented</div>
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
            {SUGGESTED.map(({ group, qs }) => (
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
            ))}
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
        <input
          className={s.askInput}
          placeholder="Ask anything about your trading…"
          ref={inputRef}
          value={mic.interim ? `${input} ${mic.interim}` : input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Your question"
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

