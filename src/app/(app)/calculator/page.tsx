'use client';

import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { FX_PAIRS, sizeCrypto, sizeForex, type FxPair } from '@/lib/calculator';
import { fmt } from '@/lib/format';

export default function CalculatorPage() {
  const [market, setMarket] = useState<'crypto' | 'forex'>('crypto');
  const [balance, setBalance] = useState('5000');
  const [risk, setRisk] = useState(1);

  const [c, setC] = useState({ entry: '43200', stop: '42500', target: '45500', lev: '10', side: 'long' as 'long' | 'short', futures: false });
  const [f, setF] = useState({ pair: 'EURUSD' as FxPair, stopPips: '20', targetPips: '50', usdJpy: '149.5' });

  const bal = parseFloat(balance) || 0;
  const res =
    market === 'crypto'
      ? sizeCrypto({
          balance: bal,
          riskPct: risk,
          entry: parseFloat(c.entry) || 0,
          stop: parseFloat(c.stop) || 0,
          target: parseFloat(c.target) || 0,
          leverage: parseFloat(c.lev) || 0,
          side: c.side,
          futures: c.futures,
        })
      : sizeForex({
          balance: bal,
          riskPct: risk,
          stopPips: parseFloat(f.stopPips) || 0,
          targetPips: parseFloat(f.targetPips) || 0,
          pair: f.pair,
          usdJpy: parseFloat(f.usdJpy) || 0,
        });

  const wrongSide =
    market === 'crypto' &&
    parseFloat(c.stop) > 0 &&
    (c.side === 'long' ? parseFloat(c.stop) >= parseFloat(c.entry) : parseFloat(c.stop) <= parseFloat(c.entry));

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Before you enter</div>
        <h1 className="page-title">Size the trade</h1>
      </header>

      <div className="seg" role="group" aria-label="Market" style={{ marginBottom: 16 }}>
        <button aria-pressed={market === 'crypto'} onClick={() => setMarket('crypto')}>Crypto</button>
        <button aria-pressed={market === 'forex'} onClick={() => setMarket('forex')}>Forex</button>
      </div>

      <div className="card stack">
        <label className="field">
          <span className="label">Account balance ($)</span>
          <input className="input num" inputMode="text" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </label>
        <label className="field">
          <span className="label row">
            Risk per trade <span className="spacer" />
            <span className="num" style={{ color: 'var(--ink)' }}>{risk.toFixed(1)}% · {fmt.money((bal * risk) / 100)}</span>
          </span>
          <input type="range" min="0.1" max="5" step="0.1" value={risk} onChange={(e) => setRisk(Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
        </label>

        {market === 'crypto' ? (
          <>
            <div className="grid-2">
              <div className="seg" style={{ height: 46, alignItems: 'center' }}>
                {(['long', 'short'] as const).map((s) => (
                  <button key={s} aria-pressed={c.side === s} onClick={() => setC({ ...c, side: s })} style={{ flex: 1, height: 40 }}>
                    {s === 'long' ? 'Long' : 'Short'}
                  </button>
                ))}
              </div>
              <div className="seg" style={{ height: 46, alignItems: 'center' }}>
                <button aria-pressed={!c.futures} onClick={() => setC({ ...c, futures: false })} style={{ flex: 1, height: 40 }}>Spot</button>
                <button aria-pressed={c.futures} onClick={() => setC({ ...c, futures: true })} style={{ flex: 1, height: 40 }}>Perp</button>
              </div>
            </div>
            <div className="grid-2">
              <Num label="Entry" value={c.entry} onChange={(v) => setC({ ...c, entry: v })} />
              <Num label="Stop" value={c.stop} onChange={(v) => setC({ ...c, stop: v })} />
              <Num label="Target" value={c.target} onChange={(v) => setC({ ...c, target: v })} />
              {c.futures && <Num label="Leverage (×)" value={c.lev} onChange={(v) => setC({ ...c, lev: v })} />}
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span className="label">Pair</span>
              <select className="select" value={f.pair} onChange={(e) => setF({ ...f, pair: e.target.value as FxPair })}>
                {FX_PAIRS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <div className="grid-2">
              <Num label="Stop (pips)" value={f.stopPips} onChange={(v) => setF({ ...f, stopPips: v })} />
              <Num label="Target (pips)" value={f.targetPips} onChange={(v) => setF({ ...f, targetPips: v })} />
              {f.pair.endsWith('JPY') && <Num label="USDJPY rate" value={f.usdJpy} onChange={(v) => setF({ ...f, usdJpy: v })} />}
            </div>
          </>
        )}
      </div>

      {wrongSide && (
        <p className="card" style={{ marginTop: 12, color: 'var(--warn)', background: 'var(--warn-soft)', border: 0, fontSize: 14 }}>
          Your stop is on the wrong side of entry for a {c.side}.
        </p>
      )}

      {res?.targetWrongSide && !wrongSide && (
        <p className="card" style={{ marginTop: 12, color: 'var(--warn)', background: 'var(--warn-soft)', border: 0, fontSize: 14 }}>
          Your target is on the wrong side of entry for a {c.side}, so there’s no reward to measure.
        </p>
      )}

      {res && !wrongSide && (
        <section className="section" style={{ marginTop: 16 }}>
          {res.stopBeyondLiq && (
            <div className="card row" style={{ marginBottom: 12, background: 'var(--neg-soft)', border: 0, color: 'var(--neg)', alignItems: 'flex-start' }}>
              <ShieldAlert size={18} style={{ flex: 'none', marginTop: 2 }} />
              <span style={{ fontSize: 14 }}>
                <strong>Stop is past liquidation.</strong> At {c.lev}× you’d be liquidated near {res.liqPrice?.toFixed(2)} before your stop triggers. Lower leverage or tighten the stop.
              </span>
            </div>
          )}
          <div className="stats">
            <div className="stat">
              <div className="stat-label">{market === 'forex' ? 'Lots' : 'Size'}</div>
              <div className="stat-value">{market === 'forex' ? res.size.toFixed(2) : res.size < 1 ? res.size.toFixed(4) : res.size.toFixed(2)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Notional</div>
              <div className="stat-value">{fmt.money(res.notional)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">At risk</div>
              <div className="stat-value neg">{fmt.pnl(-res.riskAmt)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Reward : risk</div>
              <div className="stat-value">{res.rr ? `${res.rr.toFixed(2)}R` : '—'}</div>
            </div>
          </div>
          {res.margin != null && (
            <p className="faint" style={{ fontSize: 13, margin: '10px 4px 0' }}>
              Margin used {fmt.money(res.margin)} · est. liquidation {res.liqPrice?.toFixed(2)}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className="input num" inputMode="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
