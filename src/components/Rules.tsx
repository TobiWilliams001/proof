'use client';

import { Minus, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { understandRule } from '@/lib/ai-client';
import { describeRule, TEMPLATES, todayLine } from '@/lib/rules/describe';
import type { Rule, RuleBody } from '@/lib/rules/types';
import { WEEKDAYS } from '@/lib/rules/types';
import { useRules } from '@/lib/rules/useRules';
import { useUnits } from '@/lib/store';
import type { Session } from '@/lib/types';
import { Sheet } from './Sheet';
import { MicButton, useVoice, VoiceHelp } from './Voice';
import s from './Rules.module.css';

/** Monday first, the way most traders think about their week. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SESSION_CHOICES: Session[] = ['Asian', 'London', 'New York'];

type Editing = { id?: string; body: RuleBody } | null;

/**
 * The trader's own limits. Templates come first because tapping is faster
 * than typing; words work too, and nothing is saved until they confirm.
 */
export function Rules() {
  const { rules, ready, failed, today, add, update, remove } = useRules();
  const [choosing, setChoosing] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const statusFor = (r: Rule) => today.find((t) => t.ruleId === r.id);

  async function save(e: NonNullable<Editing>) {
    setProblem(null);
    const ok = e.id ? await update(e.id, { params: e.body.params }) : await add(e.body);
    if (!ok) return setProblem('Couldn’t save that rule. Check your connection and try again.');
    setEditing(null);
    setChoosing(false);
  }

  return (
    <section className="section" aria-labelledby="rules-title">
      <div className="section-head">
        <h2 id="rules-title" className="section-title">Your rules</h2>
        {rules.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setChoosing(true)}>
            <Plus size={14} /> Add
          </button>
        )}
      </div>
      <p className={s.lede}>Proof keeps an eye on these and tells you calmly when you’re close. It never stops a trade.</p>

      {failed && <p className={s.problem} role="alert">Couldn’t load your latest rules. Showing the last ones on this device.</p>}

      {!ready ? (
        <div className="skeleton" style={{ height: 120 }} aria-hidden />
      ) : rules.length === 0 ? (
        <Templates onPick={(body) => setEditing({ body })} />
      ) : (
        <div className="list">
          {rules.map((r) => {
            const st = statusFor(r);
            return (
              <div key={r.id} className={`list-item ${s.rule}`}>
                <button className={s.ruleMain} onClick={() => setEditing({ id: r.id, body: r })}>
                  <span className={s.ruleText} data-paused={!r.active || undefined}>{describeRule(r)}</span>
                  <span className={s.today} data-state={r.active ? st?.state : undefined}>{todayLine(r, r.active ? st : undefined)}</span>
                </button>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={r.active}
                  aria-label={r.active ? `Pause “${describeRule(r)}”` : `Turn on “${describeRule(r)}”`}
                  onClick={() => update(r.id, { active: !r.active })}
                />
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={choosing} onClose={() => setChoosing(false)} title="Add a rule">
        <Templates onPick={(body) => setEditing({ body })} compact />
        <OwnWords onUnderstood={(body) => setEditing({ body })} />
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit rule' : 'New rule'}>
        {editing && (
          <RuleEditor
            value={editing.body}
            onChange={(body) => setEditing({ ...editing, body })}
            onSave={() => save(editing)}
            onDelete={
              editing.id
                ? async () => {
                    if (!confirm(`Delete “${describeRule(editing.body)}”?`)) return;
                    if (await remove(editing.id!)) setEditing(null);
                    else setProblem('Couldn’t delete that rule. Try again.');
                  }
                : undefined
            }
            problem={problem}
          />
        )}
      </Sheet>
    </section>
  );
}

function Templates({ onPick, compact }: { onPick: (b: RuleBody) => void; compact?: boolean }) {
  const { units } = useUnits();
  return (
    <div className={s.templates} data-compact={compact || undefined}>
      {TEMPLATES.map((t) => (
        <button
          key={t.kind}
          className={s.template}
          // Daily loss starts in the trader's own units.
          onClick={() => onPick(t.kind === 'dailyLoss' && units === 'r' ? { kind: 'dailyLoss', params: { amount: 2, unit: 'r' } } : t.body)}
        >
          <span className={s.templateTitle}>{t.title}</span>
          <span className={s.templateExample}>e.g. {t.example}</span>
        </button>
      ))}
    </div>
  );
}

function OwnWords({ onUnderstood }: { onUnderstood: (b: RuleBody) => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const mic = useVoice(setText, ref);
  const [busy, setBusy] = useState(false);
  const [miss, setMiss] = useState(false);

  async function check() {
    setBusy(true);
    setMiss(false);
    const { rule } = await understandRule(text.trim());
    setBusy(false);
    if (rule) onUnderstood(rule);
    else setMiss(true);
  }

  return (
    <div className={s.words}>
      <label htmlFor="rule-words" className="label">Or say it your way</label>
      <textarea
        id="rule-words"
        ref={ref}
        className="input"
        rows={2}
        value={mic.interim ? `${text} ${mic.interim}` : text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. I stop after two losing trades"
      />
      <VoiceHelp mic={mic} />
      {miss && (
        <p className={s.problem}>
          Proof can’t watch that one yet. It can hold you to a number of trades, losses in a row, a daily loss, or days and sessions you don’t trade.
        </p>
      )}
      <div className="row">
        <MicButton mic={mic} />
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" disabled={!text.trim() || busy} onClick={check}>
          {busy ? 'Reading…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

function Stepper({ value, onChange, min = 1, max, label }: { value: number; onChange: (n: number) => void; min?: number; max: number; label: string }) {
  return (
    <div className={s.stepper} role="group" aria-label={label}>
      <button type="button" className="btn btn-soft btn-icon" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Fewer">
        <Minus size={16} />
      </button>
      <span className={`num ${s.stepValue}`} aria-live="polite">{value}</span>
      <button type="button" className="btn btn-soft btn-icon" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More">
        <Plus size={16} />
      </button>
    </div>
  );
}

function RuleEditor({
  value,
  onChange,
  onSave,
  onDelete,
  problem,
}: {
  value: RuleBody;
  onChange: (b: RuleBody) => void;
  onSave: () => void;
  onDelete?: () => void;
  problem: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const valid = value.kind !== 'noTrading' || value.params.days.length + value.params.sessions.length > 0;
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        await onSave();
        setBusy(false);
      }}
    >
      {/* The rule read back in plain words: this is what gets confirmed. */}
      <div className={s.preview}>
        <ShieldCheck size={18} />
        <span>{valid ? describeRule(value) : 'Pick at least one day or session'}</span>
      </div>

      {(value.kind === 'maxTrades' || value.kind === 'lossStreak') && (
        <div className={s.field}>
          <span className="label">{value.kind === 'maxTrades' ? 'Trades a day' : 'Losses in a row'}</span>
          <Stepper
            label={value.kind === 'maxTrades' ? 'Trades a day' : 'Losses in a row'}
            value={value.params.max}
            max={value.kind === 'maxTrades' ? 50 : 20}
            onChange={(max) => onChange({ ...value, params: { max } } as RuleBody)}
          />
        </div>
      )}

      {value.kind === 'dailyLoss' && (
        <div className={s.field}>
          <label className="label" htmlFor="loss-amount">Stop after losing</label>
          <div className="row">
            <input
              id="loss-amount"
              className="input num"
              inputMode="decimal"
              value={String(value.params.amount)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^\d.]/g, ''));
                if (Number.isFinite(n)) onChange({ ...value, params: { ...value.params, amount: n } });
              }}
              style={{ flex: 1 }}
            />
            <div className="seg" role="group" aria-label="Measured in">
              <button type="button" aria-pressed={value.params.unit === 'money'} onClick={() => onChange({ ...value, params: { ...value.params, unit: 'money' } })}>$</button>
              <button type="button" aria-pressed={value.params.unit === 'r'} onClick={() => onChange({ ...value, params: { ...value.params, unit: 'r' } })}>R</button>
            </div>
          </div>
          <span className="faint" style={{ fontSize: 12.5 }}>Counted from trades closed today, wins and losses together.</span>
        </div>
      )}

      {value.kind === 'noTrading' && (
        <>
          <div className={s.field}>
            <span className="label">Days</span>
            <div className="row wrap">
              {DAY_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={value.params.days.includes(d)}
                  onClick={() => onChange({ ...value, params: { ...value.params, days: toggle(value.params.days, d).sort() } })}
                >
                  {WEEKDAYS[d].slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className={s.field}>
            <span className="label">Sessions</span>
            <div className="row wrap">
              {SESSION_CHOICES.map((x) => (
                <button
                  key={x}
                  type="button"
                  className="chip"
                  aria-pressed={value.params.sessions.includes(x)}
                  onClick={() => onChange({ ...value, params: { ...value.params, sessions: toggle(value.params.sessions, x) } })}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {problem && <p className={s.problem} role="alert">{problem}</p>}

      <div className="actions">
        {onDelete && (
          <button type="button" className="btn btn-ghost" onClick={onDelete}>
            <Trash2 size={15} /> Delete
          </button>
        )}
        <button className="btn btn-primary" disabled={!valid || busy || (value.kind === 'dailyLoss' && !(value.params.amount > 0))}>
          {busy ? 'Saving…' : 'Save rule'}
        </button>
      </div>
    </form>
  );
}
