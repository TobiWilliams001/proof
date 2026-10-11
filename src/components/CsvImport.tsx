'use client';

import { FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { CSV_FIELD_LABEL, CSV_FIELDS, guessMapping, parseCSV, rowsToTrades, type CsvField } from '@/lib/csv';
import type { Trade } from '@/lib/types';

export function CsvImport({ onImport }: { onImport: (t: Trade[]) => number }) {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [name, setName] = useState('');
  const [map, setMap] = useState<Partial<Record<CsvField, number>>>({});
  const [result, setResult] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function read(file: File) {
    const parsed = parseCSV(await file.text());
    setName(file.name);
    setResult(null);
    if (parsed.length < 2) return setResult('That file has no trade rows.');
    setRows(parsed);
    setMap(guessMapping(parsed[0]));
  }

  if (!rows) {
    return (
      <>
        <button
          className="card card-quiet"
          style={{
            width: '100%', display: 'grid', placeItems: 'center', gap: 6, padding: 28, textAlign: 'center',
            border: `1.5px dashed ${drag ? 'var(--accent)' : 'var(--line-2)'}`, background: drag ? 'var(--accent-soft)' : undefined,
          }}
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) read(f);
          }}
        >
          <FileUp size={22} className="faint" />
          <strong style={{ fontSize: 14.5 }}>Import a history file</strong>
          <span className="faint" style={{ fontSize: 13 }}>CSV from MetaTrader, cTrader, Bybit, Binance or a spreadsheet</span>
        </button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        {result && <p className="faint" style={{ fontSize: 13, marginTop: 8 }}>{result}</p>}
      </>
    );
  }

  const headers = rows[0];
  const preview = rowsToTrades(rows.slice(1), map);

  return (
    <div className="card stack">
      <div className="row">
        <strong style={{ fontSize: 14.5 }}>{name}</strong>
        <span className="spacer" />
        <span className="faint num" style={{ fontSize: 12 }}>{rows.length - 1} rows</span>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>We matched what we could. Check the columns. Symbol, close time and P&L are needed.</p>
      <div className="grid-2">
        {CSV_FIELDS.map((f) => (
          <label key={f} className="field">
            <span className="label">{CSV_FIELD_LABEL[f]}{['symbol', 'closedAt', 'pnl'].includes(f) && ' *'}</span>
            <select
              className="select"
              value={map[f] ?? ''}
              onChange={(e) => setMap({ ...map, [f]: e.target.value === '' ? undefined : Number(e.target.value) })}
            >
              <option value="">Skip</option>
              {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="row">
        <span className="faint" style={{ fontSize: 13 }}>
          {preview.trades.length} ready{preview.skipped ? ` · ${preview.skipped} skipped (missing symbol, time or P&L)` : ''}
        </span>
      </div>
      <div className="row">
        <button className="btn btn-ghost btn-sm" onClick={() => setRows(null)}>Cancel</button>
        <span className="spacer" />
        <button
          className="btn btn-primary btn-sm"
          disabled={!preview.trades.length}
          onClick={() => {
            const added = onImport(preview.trades);
            const dupes = preview.trades.length - added;
            setRows(null);
            setResult(`Imported ${added} trade${added === 1 ? '' : 's'} from ${name}${dupes ? ` · ${dupes} already in your journal, skipped` : ''}.`);
          }}
        >
          Import {preview.trades.length} trades
        </button>
      </div>
    </div>
  );
}
