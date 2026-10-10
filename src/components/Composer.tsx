'use client';

import { ArrowUp, Check, Link2, Mic, Sparkles, Square, Undo2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { refineWithAI } from '@/lib/ai-client';
import { fmt } from '@/lib/format';
import { useDictation } from '@/lib/speech';
import { useJournal } from '@/lib/store';
import { useNow } from '@/lib/useNow';
import { detectKind, structureNote, type Clarify } from '@/lib/structure';
import { KIND_LABEL, type EntryKind, type Structured, type Trade } from '@/lib/types';
import { SPRING } from './motion';
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
}: {
  trade?: Trade;
  onDone?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const { data, addEntry, deleteEntry } = useJournal();
  const [text, setText] = useState('');
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
      // Restoring a per-device preference after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(MODE_KEY) === 'raw') setStructure(false);
    } catch {}
  }, []);

  const setMode = (on: boolean) => {
    setStructure(on);
    try {
      localStorage.setItem(MODE_KEY, on ? 'structure' : 'raw');
    } catch {}
  };

  const appendDictation = useCallback((t: string) => {
    setText((prev) => (prev ? `${prev.trimEnd()} ${t}` : t.charAt(0).toUpperCase() + t.slice(1)));
  }, []);
  const mic = useDictation(appendDictation);

  // Auto-grow the box so long notes never scroll inside a tiny field.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text, mic.interim]);

  const detected = useMemo(() => (text.trim() ? detectKind(text, { linkedTrade: !!trade }) : null), [text, trade]);
  const kind = manualKind ?? detected ?? (trade ? 'trade_note' : 'reflection');

  const noted = useMemo(() => new Set(data.entries.map((e) => e.tradeId).filter(Boolean)), [data.entries]);

  function linkCandidate(d: Draft): Trade | undefined {
    if (d.tradeId || !d.structured.symbol || (d.kind !== 'trade_note' && d.kind !== 'rule_break')) return;
    const cutoff = new Date(now - 3 * 864e5).toISOString();
    return data.trades.find((t) => t.symbol === d.structured.symbol && t.closedAt >= cutoff && !noted.has(t.id));
  }

  function reset() {
    setText('');
    setManualKind(null);
    setDraft(null);
    setRefining(false);
    touched.current = false;
    reqId.current++;
  }

  function commit(d: Draft | null, opts: { asWritten?: boolean } = {}) {
    const structuredSave = !!d && !opts.asWritten;
    const entry = addEntry({
      kind: d?.kind ?? kind,
      text: text.trim(),
      // A trade link chosen on the confirm card survives "Keep as written".
      tradeId: d?.tradeId ?? trade?.id,
      structured: structuredSave ? d!.structured : undefined,
      confidence: structuredSave ? d!.confidence : undefined,
    });
    setSaved({ id: entry.id, label: structuredSave ? 'Saved and structured' : 'Saved as written' });
    reset();
    setTimeout(() => setSaved((cur) => (cur?.id === entry.id ? null : cur)), 5000);
    onDone?.();
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
          {refining && <span className={s.refining}>refining…</span>}
          <span className="spacer" />
          <span className="faint num" style={{ fontSize: 12 }} title="How sure the mapping is">
            {Math.round(draft.confidence * 100)}%
          </span>
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
                  <Link2 size={12} /> {linked.symbol} {fmt.side(linked.side).toLowerCase()} · {fmt.r(linked.r)}
                  {!trade && (
                    <button aria-label="Unlink" onClick={() => edit((d) => ({ ...d, tradeId: undefined }))}>
                      <X size={12} />
                    </button>
                  )}
                </span>
              ) : (
                candidate && (
                  <button className="chip chip-sm chip-outline" onClick={() => edit((d) => ({ ...d, tradeId: candidate.id }))}>
                    <Link2 size={12} /> Link to {candidate.symbol} {fmt.side(candidate.side).toLowerCase()} {fmt.r(candidate.r)} · {fmt.relative(candidate.closedAt, now)}
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
                    {x.name}
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

        <div className={s.actions}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              reqId.current++;
              setRefining(false);
              setDraft(null);
            }}
          >
            Edit text
          </button>
          <span className="spacer" />
          <button className="btn btn-soft btn-sm" onClick={() => commit(draft, { asWritten: true })}>
            Keep as written
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => commit(draft)}>
            <Check size={15} /> Save
          </button>
        </div>
      </div>
    );
  }

  // ── Writing ─────────────────────────────────────────────────
  return swap('write',
    <div className={s.wrapOuter}>
      <div className={`${s.box} ${mic.listening ? s.listening : ''}`}>
        <label htmlFor="composer" className="sr-only">
          What happened?
        </label>
        <textarea
          id="composer"
          ref={taRef}
          className={s.ta}
          rows={3}
          value={mic.interim ? `${text}${text ? ' ' : ''}${mic.interim}` : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={placeholder ?? 'What happened? A trade, a missed one, a plan, how you feel…'}
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
        />

        {text.trim() && (
          <div className={`scroll-x ${s.kinds}`} role="group" aria-label="Type of note">
            {KINDS.map((k) => (
              <button key={k} className="chip chip-sm" aria-pressed={kind === k} onClick={() => setManualKind(k)}>
                {KIND_LABEL[k]}
                {!manualKind && detected === k && <span className={s.auto}>auto</span>}
              </button>
            ))}
          </div>
        )}

        <div className={s.bar}>
          {mic.supported && (
            <button
              className={`btn btn-icon btn-sm ${mic.listening ? s.micOn : 'btn-soft'}`}
              onClick={mic.toggle}
              aria-label={mic.listening ? 'Stop dictation' : 'Dictate'}
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
        {mic.error && <p className={s.err}>{mic.error}</p>}
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
