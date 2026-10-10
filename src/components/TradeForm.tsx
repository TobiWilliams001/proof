'use client';

import { useState } from 'react';
import { sessionFor } from '@/lib/format';
import { uid } from '@/lib/id';
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

/** Manual entry — a fallback for when there's no sync or history file. */
export function TradeForm({ playbook, onSave }: { playbook: Playbook; onSave: (t: Trade) => void }) {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState({ symbol: '', side: 'long' as Side, closedAt: local, pnl: '', r: '', entry: '', exit: '', setup: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const pnl = parseNum(f.pnl);
  const r = f.r.trim() === '' ? null : parseNum(f.r);
  const closed = new Date(f.closedAt);
  const dateOk = !Number.isNaN(closed.getTime());
  const rOk = f.r.trim() === '' || r != null;
  const valid = !!f.symbol.trim() && pnl != null && dateOk && rOk;

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const closedAt = closed.toISOString();
        onSave({
          id: uid('t_'),
          symbol: normalizeSymbol(f.symbol),
          side: f.side,
          openedAt: closedAt,
          closedAt,
          entry: parseNum(f.entry) ?? 0,
          exit: parseNum(f.exit) ?? 0,
          size: 0,
          pnl: pnl!,
          r,
          setup: f.setup || undefined,
          session: sessionFor(closedAt),
          source: 'manual',
        });
      }}
    >
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
      <div className="grid-2">
        <label className="field">
          <span className="label">P&L ($)</span>
          <input className="input num" inputMode="text" enterKeyHint="next" value={f.pnl} onChange={set('pnl')} placeholder="-80 or 240" required aria-invalid={f.pnl !== '' && pnl == null} />
        </label>
        <label className="field">
          <span className="label">R multiple <span className="faint">(optional)</span></span>
          <input className="input num" inputMode="text" value={f.r} onChange={set('r')} placeholder="2.4 or -1" aria-invalid={!rOk} />
        </label>
      </div>
      <label className="field">
        <span className="label">Closed</span>
        <input className="input" type="datetime-local" value={f.closedAt} onChange={set('closedAt')} required aria-invalid={!dateOk} />
        {!dateOk && <span className="neg" style={{ fontSize: 12 }}>Pick when the trade closed.</span>}
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
      <details>
        <summary className="label" style={{ cursor: 'pointer', padding: '4px 0' }}>Prices</summary>
        <div className="grid-2" style={{ marginTop: 10 }}>
          <input className="input num" inputMode="decimal" value={f.entry} onChange={set('entry')} placeholder="Entry" aria-label="Entry price" />
          <input className="input num" inputMode="decimal" value={f.exit} onChange={set('exit')} placeholder="Exit" aria-label="Exit price" />
        </div>
      </details>
      <button className="btn btn-primary btn-block" disabled={!valid} style={{ marginTop: 6 }}>
        Add trade
      </button>
    </form>
  );
}
