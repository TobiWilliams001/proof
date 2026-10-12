'use client';

import { ArrowUp, Check, Link2, Mic, Sparkles, Square, Undo2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { refineWithAI } from '@/lib/ai-client';
import { fmt } from '@/lib/format';
import { recordJournalTime } from '@/lib/metrics';
import { useDictation } from '@/lib/speech';
import { useJournal, useUnits } from '@/lib/store';
import { useNow } from '@/lib/useNow';
import { detectKind, structureNote, type Clarify } from '@/lib/structure';
import { isOpen, KIND_LABEL, type EntryKind, type Structured, type Trade } from '@/lib/types';
import { SPRING } from './motion';
import { VoiceHelp } from './Voice';
import s from './Composer.module.css';

// Same root element in both states, so AnimatePresence can cross-fade them.
function swap(key: string, node: React.ReactNode) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.985, transition: { duration: 0.16 } }}
        transition={SPRING}
      >
        {node}
      </motion.div>
    </AnimatePresence>
  );
}

const KINDS = Object.keys(KIND_LABEL) as EntryKind[];
const MODE_KEY = 'proof.composer.mode';

interface Draft {
  kind: EntryKind;
  structured: Structured;
  confidence: number;
  clarify?: Clarify;
  tradeId?: string;
}

export function Composer({
  trade,
  onDone,
  autoFocus,
  placeholder,
  docked,
}: {
  trade?: Trade;
  onDone?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  /** Compact resting state for the thumb-zone dock; grows as the trader writes. */
  docked?: boolean;
}) {
  const { data, addEntry, deleteEntry, updateEntry } = useJournal();
  const u = useUnits();
  const draftKey = `proof.draft.${trade?.id ?? 'journal'}`;
  const [text, setTextRaw] = useState('');
  const startedAt = useRef<number | null>(null);
  // Saved note waiting on the one-tap "did you follow your plan?" answer.
  const [askPlan, setAskPlan] = useState<{ entryId: string; trade: Trade; label: string } | null>(null);
  const [structure, setStructure] = useState(true);
  const [manualKind, setManualKind] = useState<EntryKind | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [refining, setRefining] = useState(false);
  const [saved, setSaved] = useState<{ id: string; label: string } | null>(null);
  const touched = useRef(false);
  // Each submit gets an id; a late AI reply for an older submit is ignored.
  const reqId = useRef(0);
  const now = useNow();
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      // Restoring per-device state after hydration: the mode preference, and any
      // unsent draft, nothing a trader writes should be lost to a reload.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(MODE_KEY) === 'raw') setStructure(false);
      const kept = localStorage.getItem(draftKey);
      if (kept) setTextRaw(kept);
    } catch {}
    if (trade) startedAt.current = Date.now();
  }, [draftKey, trade]);

  const setText = useCallback(
    (next: string | ((prev: string) => string)) => {
      setTextRaw((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        if (startedAt.current == null && value) startedAt.current = Date.now();
        try {
          if (value.trim()) localStorage.setItem(draftKey, value);
          else localStorage.removeItem(draftKey);
        } catch {}
        return value;
      });
    },
    [draftKey],
  );

  const setMode = (on: boolean) => {
    setStructure(on);
    try {
      localStorage.setItem(MODE_KEY, on ? 'structure' : 'raw');
    } catch {}
  };

  const appendDictation = useCallback(
    (t: string) => setText((prev) => (prev ? `${prev.trimEnd()} ${t}` : t.charAt(0).toUpperCase() + t.slice(1))),
    [setText],
  );
  const mic = useDictation(appendDictation, { onFallback: () => taRef.current?.focus() });

  // Auto-grow the box so long notes never scroll inside a tiny field.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text, mic.interim]);

  const detected = useMemo(() => (text.trim() ? detectKind(text, { linkedTrade: !!trade }) : null), [text, trade]);
  const openTrade = !!trade && isOpen(trade);
  const kind = manualKind ?? (openTrade ? 'plan' : detected) ?? (trade ? 'trade_note' : 'reflection');

  const noted = useMemo(() => new Set(data.entries.map((e) => e.tradeId).filter(Boolean)), [data.entries]);

  function linkCandidate(d: Draft): Trade | undefined {
    if (d.tradeId || !d.structured.symbol || (d.kind !== 'trade_note' && d.kind !== 'rule_break')) return;
    const cutoff = new Date(now - 3 * 864e5).toISOString();
    return data.trades.find((t) => !isOpen(t) && t.symbol === d.structured.symbol && t.closedAt >= cutoff && !noted.has(t.id));
  }

  function reset() {
    setText('');
    setManualKind(null);
    setDraft(null);
    setRefining(false);
    touched.current = false;
    reqId.current++;
  }

  function finish(entryId: string, label: string) {
    setSaved({ id: entryId, label });
    setTimeout(() => setSaved((cur) => (cur?.id === entryId ? null : cur)), 5000);
    onDone?.();
  }

  function commit(d: Draft | null, opts: { asWritten?: boolean } = {}) {
    const structuredSave = !!d && !opts.asWritten;
    const entryKind = d?.kind ?? kind;
    const tradeId = d?.tradeId ?? trade?.id;
    const entry = addEntry({
      kind: entryKind,
      text: text.trim(),
      // A trade link chosen on the confirm card survives "Keep as written".
      tradeId,
      structured: structuredSave ? d!.structured : undefined,
      confidence: structuredSave ? d!.confidence : undefined,
    });
    if (startedAt.current) recordJournalTime((Date.now() - startedAt.current) / 1000);
    startedAt.current = null;
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    const label = structuredSave ? 'Saved and structured' : 'Saved as written';
    reset();

    // After a closed trade, one tap: did you follow your plan? Asked once per trade.
    const linked = data.trades.find((t) => t.id === tradeId);
    const alreadyAnswered = data.entries.some((e) => e.tradeId === tradeId && e.followedPlan != null);
    if (linked && !isOpen(linked) && (entryKind === 'trade_note' || entryKind === 'rule_break') && !alreadyAnswered) {
      setAskPlan({ entryId: entry.id, trade: linked, label });
      return;
    }
    finish(entry.id, label);
  }

  function answerPlan(followed: boolean | null) {
    if (!askPlan) return;
    if (followed != null) updateEntry(askPlan.entryId, { followedPlan: followed });
    finish(askPlan.entryId, askPlan.label);
    setAskPlan(null);
  }

  function submit() {
    if (!text.trim()) return;
    mic.stop();
    if (!structure) return commit(null);

    const local = structureNote(text, data.playbook, trade);
    const d: Draft = {
      ...local,
      kind: manualKind ?? local.kind,
      tradeId: trade?.id,
    };
    setDraft(d);
    touched.current = false;

    setRefining(true);
    const id = ++reqId.current;
    refineWithAI(text, data.playbook, trade, local).then((r) => {
      if (id !== reqId.current) return;
      setRefining(false);
      if (touched.current) return;
      setDraft((cur) => cur && { ...cur, ...r, kind: manualKind ?? r.kind, tradeId: cur.tradeId });
    });
  }

  const edit = (fn: (d: Draft) => Draft) => {
    touched.current = true;
    setDraft((d) => (d ? fn(d) : d));
  };

  // ── Confirm card ────────────────────────────────────────────
  if (draft) {
    const candidate = linkCandidate(draft);
    const linked = data.trades.find((t) => t.id === draft.tradeId);
    const pb = data.playbook;
    return swap('confirm',
      <div className={`${s.box} ${s.confirm}`}>
        <div className={s.confirmHead}>
          <span className={s.spark}><Sparkles size={14} /></span>
          <span>Here’s how I read it</span>
          {refining && <span className={s.settling} aria-hidden />}
        </div>

        <blockquote className={s.quote}>{text}</blockquote>

        <div className={s.rows}>
          <Row label="Type">
            <div className="row wrap">
              {KINDS.map((k) => (
                <button key={k} className="chip chip-sm" aria-pressed={draft.kind === k} onClick={() => edit((d) => ({ ...d, kind: k }))}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </Row>

          {(linked || candidate) && (
            <Row label="Trade">
              {linked ? (
                <span className="chip chip-sm chip-on">
                  <Link2 size={12} /> {linked.symbol} {fmt.side(linked.side).toLowerCase()} · {u.show(linked.r, linked.pnl)}
                  {!trade && (
                    <button aria-label="Unlink" onClick={() => edit((d) => ({ ...d, tradeId: undefined }))}>
                      <X size={12} />
                    </button>
                  )}
                </span>
              ) : (
                candidate && (
                  <button className="chip chip-sm chip-outline" onClick={() => edit((d) => ({ ...d, tradeId: candidate.id }))}>
                    <Link2 size={12} /> Link to {candidate.symbol} {fmt.side(candidate.side).toLowerCase()} {u.show(candidate.r, candidate.pnl)} · {fmt.relative(candidate.closedAt, now)}
                  </button>
                )
              )}
            </Row>
          )}

          {(draft.structured.symbol || draft.structured.r != null) && !linked && (
            <Row label="Read">
              <span className="row wrap">
                {draft.structured.symbol && <span className="chip chip-sm">{draft.structured.symbol}</span>}
                {draft.structured.side && <span className="chip chip-sm">{fmt.side(draft.structured.side)}</span>}
                {draft.structured.r != null && (
                  <span className={`chip chip-sm ${draft.structured.r >= 0 ? 'chip-pos' : 'chip-neg'}`}>{fmt.r(draft.structured.r)}</span>
                )}
              </span>
            </Row>
          )}

          {pb.setups.length > 0 && (
            <Row label="Setup">
              {draft.clarify && !draft.structured.setup && <p className={s.ask}>{draft.clarify.question}</p>}
              <div className="row wrap">
                {(draft.clarify && !draft.structured.setup ? pb.setups.filter((x) => draft.clarify!.options.includes(x.name)) : pb.setups).map((x) => (
                  <button
                    key={x.id}
                    className="chip chip-sm"
                    aria-pressed={draft.structured.setup === x.name}
                    onClick={() =>
                      edit((d) => ({
                        ...d,
                        clarify: undefined,
                        structured: { ...d.structured, setup: d.structured.setup === x.name ? undefined : x.name },
                      }))
                    }
                  >
                    {(draft.clarify && !draft.structured.setup && draft.clarify.labels[x.name]) || x.name}
                  </button>
                ))}
                {draft.clarify && !draft.structured.setup && (
                  <button className="chip chip-sm chip-outline" onClick={() => edit((d) => ({ ...d, clarify: undefined }))}>
                    None of these
                  </button>
                )}
              </div>
            </Row>
          )}

          {pb.tags.length > 0 && (
            <Row label="Tags">
              <div className="row wrap">
                {pb.tags.map((t) => {
                  const on = draft.structured.tags.includes(t);
                  return (
                    <button
                      key={t}
                      className="chip chip-sm"
                      aria-pressed={on}
                      onClick={() =>
                        edit((d) => ({
                          ...d,
                          structured: { ...d.structured, tags: on ? d.structured.tags.filter((x) => x !== t) : [...d.structured.tags, t] },
                        }))
                      }
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </Row>
          )}

          {pb.fields.filter((f) => f.type === 'select').map((f) => (
            <Row key={f.id} label={f.name}>
              <div className="row wrap">
                {f.options?.map((o) => {
                  const on = draft.structured.fields[f.name] === o;
                  return (
                    <button
                      key={o}
                      className="chip chip-sm"
                      aria-pressed={on}
                      onClick={() =>
                        edit((d) => {
                          const fields = { ...d.structured.fields };
                          if (on) delete fields[f.name];
                          else fields[f.name] = o;
                          return { ...d, structured: { ...d.structured, fields } };
                        })
                      }
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </Row>
          ))}

          {pb.setups.length === 0 && (
            <p className={s.hint}>
              Add your setups and tags in <Link href="/playbook">your playbook</Link> and Proof will map notes onto them.
            </p>
          )}
        </div>

        <div className="actions" style={{ marginTop: 14 }}>
          <button
            className="btn btn-ghost"
            onClick={() => {
              reqId.current++;
              setRefining(false);
              setDraft(null);
            }}
          >
            Edit text
          </button>
          <span className="spacer" />
          <button className="btn btn-soft" onClick={() => commit(draft, { asWritten: true })}>
            Keep as written
          </button>
          <button className="btn btn-primary" onClick={() => commit(draft)}>
            <Check size={15} /> Save
          </button>
        </div>
      </div>
    );
  }

  // ── Did you follow your plan? ──────────────────────────────
  if (askPlan) {
    const plan = data.entries.find((e) => e.tradeId === askPlan.trade.id && e.kind === 'plan');
    return swap('plan',
      <div className={`${s.box} ${s.congruence}`}>
        <p className={s.congruenceQ}>Did you follow your plan?</p>
        <p className={s.congruenceSub}>
          {askPlan.trade.symbol} {askPlan.trade.side} · {u.show(askPlan.trade.r, askPlan.trade.pnl)}
        </p>
        {plan && <blockquote className={s.planQuote}>Your plan: “{plan.text}”</blockquote>}
        <div className={s.congruenceActions}>
          <button className="btn btn-soft" onClick={() => answerPlan(false)}>No</button>
          <button className="btn btn-primary" onClick={() => answerPlan(true)}>Yes</button>
        </div>
        <button className={s.skip} onClick={() => answerPlan(null)}>Skip</button>
      </div>,
    );
  }

  // ── Writing ─────────────────────────────────────────────────
  return swap('write',
    <div className={`${s.wrapOuter} ${docked ? s.docked : ''}`}>
      <div className={`${s.box} ${mic.listening ? s.listening : ''}`}>
        <label htmlFor="composer" className="sr-only">
          What happened?
        </label>
        <textarea
          id="composer"
          ref={taRef}
          className={s.ta}
          rows={docked ? 1 : 3}
          value={mic.interim ? `${text}${text ? ' ' : ''}${mic.interim}` : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={placeholder ?? (openTrade ? 'What’s the plan? Why this trade, where you’re wrong…' : docked ? 'What happened?' : 'What happened? A trade, a missed one, a plan, how you feel…')}
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
        />

        {text.trim() && (
          <div className={`scroll-x ${s.kinds}`} role="group" aria-label="Type of note">
            {KINDS.map((k) => (
              <button key={k} className="chip chip-sm" aria-pressed={kind === k} onClick={() => setManualKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        <div className={s.bar}>
          {mic.supported && (
            <button
              className={`btn btn-icon btn-sm ${mic.listening ? s.micOn : 'btn-soft'}`}
              onClick={mic.toggle}
              aria-label={mic.listening ? 'Stop listening' : 'Talk instead of typing'}
              aria-pressed={mic.listening}
            >
              {mic.listening ? <Square size={13} fill="currentColor" /> : <Mic size={16} />}
            </button>
          )}
          <button
            className={s.toggle}
            role="switch"
            aria-checked={structure}
            onClick={() => setMode(!structure)}
          >
            <span className="switch" aria-checked={structure} />
            <span>{structure ? 'Structure it' : 'Keep as written'}</span>
          </button>
          <span className="spacer" />
          <button className="btn btn-primary btn-icon" onClick={submit} disabled={!text.trim()} aria-label="Save note">
            <ArrowUp size={18} />
          </button>
        </div>
        <VoiceHelp mic={mic} />
      </div>

      <AnimatePresence>
      {saved && (
        <motion.div
          className={s.toast}
          role="status"
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.97, transition: { duration: 0.18 } }}
          transition={SPRING}
        >
          <Check size={15} /> {saved.label}
          <button
            className={s.undo}
            onClick={() => {
              deleteEntry(saved.id);
              setSaved(null);
            }}
          >
            <Undo2 size={13} /> Undo
          </button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={s.row}>
      <div className={s.rowLabel}>{label}</div>
      <div className={s.rowBody}>{children}</div>
    </div>
  );
}
