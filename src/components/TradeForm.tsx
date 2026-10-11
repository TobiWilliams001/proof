'use client';

import { useState } from 'react';
import { fmt, sessionFor } from '@/lib/format';
import { uid } from '@/lib/id';
import { rFromPrices } from '@/lib/stats';
import { normalizeSymbol } from '@/lib/structure';
import type { Playbook, Side, Trade } from '@/lib/types';

/** Accepts "-80", "−80", "1,5" and "1,234.50"; null when it isn't a number. */
function parseNum(v: string): number | null {
  const s = v.trim().replace('−', '-');
  if (!s) return null;
  const normalised = /,\d{1,2}$/.test(s) && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/**
 * Manual entry, a fallback for when there's no sync or history file.
 * "Still open" records a position so its plan can be captured before the outcome.
 */
export function TradeForm({ playbook, onSave }: { playbook: Playbook; onSave: (t: Trade) => void }) {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [state, setState] = useState<'closed' | 'open'>('closed');
  const [f, setF] = useState({ symbol: '', side: 'long' as Side, when: local, pnl: '', r: '', entry: '', exit: '', stop: '', setup: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const isOpen = state === 'open';
  const pnl = parseNum(f.pnl);
  const entry = parseNum(f.entry);
  const exit = parseNum(f.exit);
  const stop = parseNum(f.stop);
  const typedR = f.r.trim() === '' ? null : parseNum(f.r);
  // When R isn't typed, work it out from prices, but only if all three are there.
  const priceR = entry != null && exit != null ? rFromPrices(f.side, entry, stop ?? undefined, exit) : null;
  const r = typedR ?? priceR;
  const when = new Date(f.when);
  const dateOk = !Number.isNaN(when.getTime());
  const rOk = f.r.trim() === '' || typedR != null;
  const stopOk = f.stop.trim() === '' || stop != null;
  const valid = !!f.symbol.trim() && dateOk && stopOk && (isOpen ? entry != null : pnl != null && rOk);

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const at = when.toISOString();
        onSave({
          id: uid('t_'),
          symbol: normalizeSymbol(f.symbol),
          side: f.side,
          openedAt: at,
          closedAt: at,
          ...(isOpen ? { status: 'open' as const } : {}),
          entry: entry ?? 0,
          stop: stop ?? undefined,
          exit: isOpen ? 0 : exit ?? 0,
          size: 0,
          pnl: isOpen ? 0 : pnl!,
          r: isOpen ? null : r,
          setup: f.setup || undefined,
          session: sessionFor(at),
          source: 'manual',
        });
      }}
    >
      <div className="seg" role="group" aria-label="Trade status" style={{ display: 'flex' }}>
        <button type="button" aria-pressed={!isOpen} onClick={() => setState('closed')} style={{ flex: 1 }}>Closed</button>
        <button type="button" aria-pressed={isOpen} onClick={() => setState('open')} style={{ flex: 1 }}>Still open</button>
      </div>

      <div className="grid-2">
        <label className="field">
          <span className="label">Symbol</span>
          <input className="input" value={f.symbol} onChange={set('symbol')} placeholder="EURUSD" autoCapitalize="characters" required data-autofocus />
        </label>
        <div className="field">
          <span className="label">Side</span>
          <div className="seg" style={{ height: 46, alignItems: 'center' }}>
            {(['long', 'short'] as const).map((s) => (
              <button type="button" key={s} aria-pressed={f.side === s} onClick={() => setF({ ...f, side: s })} style={{ flex: 1, height: 40 }}>
                {s === 'long' ? 'Long' : 'Short'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isOpen ? (
        <div className="grid-2">
          <label className="field">
            <span className="label">Entry</span>
            <input className="input num" inputMode="text" value={f.entry} onChange={set('entry')} placeholder="1.2650" required />
          </label>
          <label className="field">
            <span className="label">Stop <span className="faint">(for R later)</span></span>
            <input className="input num" inputMode="text" value={f.stop} onChange={set('stop')} placeholder="1.2680" aria-invalid={!stopOk} />
          </label>
        </div>
      ) : (
        <div className="grid-2">
          <label className="field">
            <span className="label">P&L ($)</span>
            <input className="input num" inputMode="text" enterKeyHint="next" value={f.pnl} onChange={set('pnl')} placeholder="-80 or 240" required aria-invalid={f.pnl !== '' && pnl == null} />
          </label>
          <label className="field">
            <span className="label">R <span className="faint">(optional)</span></span>
            <input className="input num" inputMode="text" value={f.r} onChange={set('r')} placeholder={priceR != null ? fmt.r(priceR) : '2.4 or -1'} aria-invalid={!rOk} />
          </label>
        </div>
      )}

      <label className="field">
        <span className="label">{isOpen ? 'Opened' : 'Closed'}</span>
        <input className="input" type="datetime-local" value={f.when} onChange={set('when')} required aria-invalid={!dateOk} />
        {!dateOk && <span className="neg" style={{ fontSize: 12 }}>Pick when the trade {isOpen ? 'opened' : 'closed'}.</span>}
      </label>

      {playbook.setups.length > 0 && (
        <label className="field">
          <span className="label">Setup</span>
          <select className="select" value={f.setup} onChange={set('setup')}>
            <option value="">None</option>
            {playbook.setups.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
      )}

      {!isOpen && (
        <details>
          <summary className="label" style={{ cursor: 'pointer', padding: '10px 0' }}>Prices</summary>
          <div className="grid-2" style={{ marginTop: 10 }}>
            <input className="input num" inputMode="text" value={f.entry} onChange={set('entry')} placeholder="Entry" aria-label="Entry price" />
            <input className="input num" inputMode="text" value={f.exit} onChange={set('exit')} placeholder="Exit" aria-label="Exit price" />
            <input className="input num" inputMode="text" value={f.stop} onChange={set('stop')} placeholder="Stop" aria-label="Stop price" />
          </div>
          {priceR != null && typedR == null && (
            <p className="faint" style={{ fontSize: 13, marginTop: 8 }}>
              That’s <span className={`num ${priceR >= 0 ? 'pos' : 'neg'}`}>{fmt.r(priceR)}</span> against your stop.
            </p>
          )}
        </details>
      )}

      <button className="btn btn-primary btn-block" disabled={!valid} style={{ marginTop: 6 }}>
        {isOpen ? 'Add open trade' : 'Add trade'}
      </button>
    </form>
  );
}
