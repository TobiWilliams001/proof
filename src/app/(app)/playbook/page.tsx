'use client';

import { Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MicButton, useVoice, VoiceHelp } from '@/components/Voice';
import { importPlaybook } from '@/lib/ai-client';
import { uid } from '@/lib/id';
import { Reveal } from '@/components/motion';
import { Rules } from '@/components/Rules';
import { useJournal } from '@/lib/store';
import type { CustomField, Playbook, PlaybookSetup } from '@/lib/types';
import s from './playbook.module.css';

const AI_ERRORS: Record<string, string> = {
  not_configured: 'Turning a description into setups isn’t available right now. You can add them by hand below. It only takes a minute.',
  rate_limited: 'That’s taking longer than usual. Try again in a minute, or add setups by hand below.',
  offline: 'You seem to be offline. Add setups by hand below, or try again when you’re connected.',
};

export default function PlaybookPage() {
  const { data, setPlaybook } = useJournal();
  const pb = data.playbook;
  const [desc, setDesc] = useState('');
  const descRef = useRef<HTMLTextAreaElement>(null);
  const descMic = useVoice(setDesc, descRef);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tag, setTag] = useState('');

  const save = (next: Partial<Playbook>) => setPlaybook({ ...pb, ...next });
  const updateSetup = (id: string, patch: Partial<PlaybookSetup>) =>
    save({ setups: pb.setups.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const updateField = (id: string, patch: Partial<CustomField>) =>
    save({ fields: pb.fields.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  async function runImport() {
    setBusy(true);
    setMsg(null);
    const res = await importPlaybook(desc);
    setBusy(false);
    if ('error' in res) return setMsg(AI_ERRORS[res.error] ?? 'Couldn’t read that just now. Try again, or add setups by hand.');
    // Merge, never overwrite: the trader's existing edits win.
    const names = new Set(pb.setups.map((x) => x.name.toLowerCase()));
    save({
      setups: [...pb.setups, ...res.setups.filter((x) => !names.has(x.name.toLowerCase()))],
      tags: [...new Set([...pb.tags, ...res.tags])],
      fields: [...pb.fields, ...res.fields.filter((f) => !pb.fields.some((g) => g.name.toLowerCase() === f.name.toLowerCase()))],
    });
    setMsg(`Added ${res.setups.length} setups and ${res.tags.length} tags. Edit anything below.`);
    setDesc('');
  }

  const addTag = () => {
    const t = tag.trim().replace(/^#/, '');
    if (t && !pb.tags.some((x) => x.toLowerCase() === t.toLowerCase())) save({ tags: [...pb.tags, t] });
    setTag('');
  };

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Your system. Not ours.</div>
        <h1 className="page-title">Playbook</h1>
        <p className="page-sub">Proof sorts every note into these, and nothing else. Change them any time.</p>
      </header>

      <Reveal className={`${s.describe}`}>
        <label htmlFor="desc" className={s.describeLabel}>
          <Sparkles size={15} /> Describe how you trade
        </label>
        <textarea
          id="desc"
          ref={descRef}
          className={s.describeBox}
          rows={3}
          value={descMic.interim ? `${desc} ${descMic.interim}` : desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="I trade 2-touch and 3-touch continuations at value areas on the 1H. I track whether I was patient or entered early…"
        />
        <VoiceHelp mic={descMic} />
        <div className="row">
          <MicButton mic={descMic} />
          {msg && <p className={s.msg}>{msg}</p>}
          <span className="spacer" />
          <button className="btn btn-primary btn-sm" disabled={!desc.trim() || busy} onClick={runImport}>
            {busy ? 'Reading…' : 'Turn into setups'}
          </button>
        </div>
      </Reveal>

      <Rules />

      <Reveal className="section">
        <div className="section-head">
          <h2 className="section-title">Setups</h2>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => save({ setups: [...pb.setups, { id: uid('s_'), name: 'New setup', aliases: [] }] })}
          >
            <Plus size={14} /> Add
          </button>
        </div>
        {pb.setups.length === 0 ? (
          <p className="card card-quiet muted" style={{ fontSize: 14 }}>
            No setups yet. Describe your trading above, or add one.
          </p>
        ) : (
          <div className="stack">
            {pb.setups.map((x) => (
              <div key={x.id} className={`card ${s.setup}`}>
                <div className="row">
                  <input
                    className={s.name}
                    value={x.name}
                    onChange={(e) => updateSetup(x.id, { name: e.target.value })}
                    aria-label="Setup name"
                  />
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={`Delete ${x.name}`}
                    onClick={() => confirm(`Delete “${x.name}”?`) && save({ setups: pb.setups.filter((y) => y.id !== x.id) })}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <SetupDescription value={x.description ?? ''} onChange={(description) => updateSetup(x.id, { description })} />
                <label className={s.aliases}>
                  <span className="faint">Also called</span>
                  <ListInput
                    values={x.aliases ?? []}
                    placeholder="RE, two touch"
                    onCommit={(aliases) => updateSetup(x.id, { aliases })}
                    aria-label={`Other names for ${x.name}`}
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </Reveal>

      <Reveal className="section">
        <h2 className="section-title" style={{ marginBottom: 12 }}>Tags</h2>
        <div className="row wrap">
          {pb.tags.map((t) => (
            <span key={t} className="chip">
              #{t}
              <button aria-label={`Remove ${t}`} onClick={() => save({ tags: pb.tags.filter((x) => x !== t) })} className="faint">
                <X size={12} />
              </button>
            </span>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addTag();
            }}
            className={s.tagForm}
          >
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="add tag" aria-label="New tag" />
            <button aria-label="Add tag" disabled={!tag.trim()}><Plus size={13} /></button>
          </form>
        </div>
      </Reveal>

      <Reveal className="section">
        <div className="section-head">
          <h2 className="section-title">Fields you track</h2>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => save({ fields: [...pb.fields, { id: uid('f_'), name: 'New field', type: 'select', options: [] }] })}
          >
            <Plus size={14} /> Add
          </button>
        </div>
        {pb.fields.length === 0 ? (
          <p className="card card-quiet muted" style={{ fontSize: 14 }}>
            Optional. For example: Timeframe (15m, 1H, 4H) or Location (value area, range high).
          </p>
        ) : (
          <div className="list">
            {pb.fields.map((f) => (
              <div key={f.id} className={`list-item ${s.field}`}>
                <input className={s.fieldName} value={f.name} onChange={(e) => updateField(f.id, { name: e.target.value })} aria-label="Field name" />
                <ListInput
                  className={s.fieldOpts}
                  values={f.options ?? []}
                  placeholder="Options, comma separated"
                  onCommit={(options) => updateField(f.id, { options })}
                  aria-label={`Options for ${f.name}`}
                />
                <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Delete ${f.name}`} onClick={() => save({ fields: pb.fields.filter((x) => x.id !== f.id) })}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Reveal>
    </div>
  );
}

/**
 * Comma-separated list editor. Keeps the raw text while typing (so "two touch, "
 * can be typed naturally) and only parses it on blur or Enter.
 */
function ListInput({
  values,
  onCommit,
  ...rest
}: { values: string[]; onCommit: (v: string[]) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const joined = values.join(', ');
  const [raw, setRaw] = useState(joined);
  const [focused, setFocused] = useState(false);
  const commit = () => {
    const next = raw.split(',').map((v) => v.trim()).filter(Boolean);
    if (next.join(', ') !== joined) onCommit(next);
    setRaw(next.join(', '));
  };
  return (
    <input
      {...rest}
      value={focused ? raw : joined}
      onFocus={() => {
        setRaw(joined);
        setFocused(true);
      }}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => {
        commit();
        setFocused(false);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

/** A setup's description, with voice like every other text box. */
function SetupDescription({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const mic = useVoice((fn) => onChange(fn(latest.current)), ref);
  return (
    <>
      <div className={s.descRow}>
        <textarea
          ref={ref}
          className={s.descInput}
          rows={1}
          value={mic.interim ? `${value} ${mic.interim}` : value}
          placeholder="What makes it this setup?"
          onChange={(e) => onChange(e.target.value)}
          aria-label="Description"
        />
        <MicButton mic={mic} label="Describe it by voice" />
      </div>
      <VoiceHelp mic={mic} />
    </>
  );
}
