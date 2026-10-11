'use client';

import { Check, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { fmt } from '@/lib/format';
import { useJournal } from '@/lib/store';
import { connectMt, disconnectMt, SYNC_PROBLEM } from '@/lib/sync/client';
import { useNow } from '@/lib/useNow';
import type { SyncAccount } from '@/lib/types';
import { Sheet } from './Sheet';

/** Connected MetaTrader accounts: their health, and the connect flow. */
export function SyncAccounts() {
  const { data, updateAccount, removeAccount } = useJournal();
  const accounts = data.accounts ?? [];
  const [adding, setAdding] = useState(false);
  const now = useNow();

  return (
    <>
      {accounts.length > 0 && (
        <div className="list" style={{ marginBottom: 12 }}>
          {accounts.map((a) => (
            <div key={a.localId} className="list-item" style={{ alignItems: 'flex-start' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 550 }}>{a.name}</span>
                <span className="faint" style={{ fontSize: 12.5 }}>
                  {a.platform.toUpperCase()} · {a.login} · {a.server}
                </span>
                <Status a={a} now={now} />
              </span>
              <span className="row" style={{ flex: 'none' }}>
                {a.state === 'error' && (
                  <button
                    className="btn btn-soft btn-icon btn-sm"
                    aria-label="Try again"
                    onClick={() => updateAccount(a.localId, { state: 'connecting', problem: undefined, lastAttemptAt: undefined })}
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    if (!confirm(`Stop importing from ${a.name}? Trades already in your journal stay.`)) return;
                    await disconnectMt(a);
                    removeAccount(a.localId);
                  }}
                >
                  Disconnect
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-primary btn-block" onClick={() => setAdding(true)}>
        <Plus size={16} /> Connect MetaTrader
      </button>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Connect MetaTrader">
        <ConnectForm onDone={() => setAdding(false)} />
      </Sheet>
    </>
  );
}

function Status({ a, now }: { a: SyncAccount; now: number }) {
  if (a.state === 'error') {
    return <span className="neg" style={{ display: 'block', fontSize: 13, marginTop: 4 }}>{SYNC_PROBLEM[a.problem ?? 'unavailable'] ?? SYNC_PROBLEM.unavailable}</span>;
  }
  if (a.state === 'connecting' || !a.lastSyncedAt) {
    return <span className="faint" style={{ display: 'block', fontSize: 13, marginTop: 4 }}>Connecting to your broker. Your first import can take a few minutes.</span>;
  }
  return (
    <span className="pos" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, marginTop: 4 }}>
      <Check size={13} /> Up to date · {fmt.relative(a.lastSyncedAt, now)}
    </span>
  );
}

function ConnectForm({ onDone }: { onDone: () => void }) {
  const { addAccount, data } = useJournal();
  const [f, setF] = useState({ platform: (data.profile?.platform === 'MT4' ? 'mt4' : 'mt5') as 'mt4' | 'mt5', login: '', password: '', server: '', name: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ text: string; suggestions?: string[] } | null>(null);
  const valid = /^\d{3,12}$/.test(f.login.trim()) && f.password && f.server.trim();

  async function connect(transactionId?: string) {
    setProblem(null);
    setBusy(transactionId ? 'Still finding your broker. This can take a minute.' : 'Connecting to your broker…');
    const r = await connectMt({ ...f, transactionId });
    if (r.status === 'pending') {
      setTimeout(() => connect(r.transactionId), Math.min(r.retryAfterSeconds, 30) * 1000);
      return;
    }
    setBusy(null);
    if (r.status === 'error') {
      setProblem({ text: SYNC_PROBLEM[r.problem] ?? SYNC_PROBLEM.unavailable, suggestions: r.suggestions });
      return;
    }
    addAccount({
      ...r.account,
      sealed: r.sealed,
      state: 'connecting',
      connectedAt: new Date().toISOString(),
      stops: {},
    });
    // The password only lived in this form; clear it straight away.
    setF((x) => ({ ...x, password: '' }));
    onDone();
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) connect();
      }}
    >
      <p className="muted" style={{ fontSize: 14.5 }}>
        Your trades will come in on their own, past and future. Proof can see your trades but can never place or change one.
      </p>
      <div className="seg" role="group" aria-label="Platform" style={{ display: 'flex' }}>
        <button type="button" aria-pressed={f.platform === 'mt5'} onClick={() => setF({ ...f, platform: 'mt5' })} style={{ flex: 1 }}>MetaTrader 5</button>
        <button type="button" aria-pressed={f.platform === 'mt4'} onClick={() => setF({ ...f, platform: 'mt4' })} style={{ flex: 1 }}>MetaTrader 4</button>
      </div>
      <label className="field">
        <span className="label">Account number</span>
        <input className="input num" inputMode="numeric" autoComplete="off" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} placeholder="12345678" data-autofocus />
      </label>
      <label className="field">
        <span className="label">Investor password</span>
        <input className="input" type="password" autoComplete="off" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <span className="faint" style={{ fontSize: 12.5 }}>
          The view-only password from your broker, not the one you trade with. You can also create one in MetaTrader.
        </span>
      </label>
      <label className="field">
        <span className="label">Server</span>
        <input className="input" autoComplete="off" autoCapitalize="off" value={f.server} onChange={(e) => setF({ ...f, server: e.target.value })} placeholder="ICMarketsSC-Live02" />
        <span className="faint" style={{ fontSize: 12.5 }}>Exactly as MetaTrader shows it when you log in.</span>
      </label>
      <label className="field">
        <span className="label">Name <span className="faint">(optional)</span></span>
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="FTMO challenge" />
      </label>

      {problem && (
        <div className="card card-quiet" role="alert" style={{ fontSize: 14 }}>
          <span className="neg">{problem.text}</span>
          {problem.suggestions && problem.suggestions.length > 0 && (
            <div className="row wrap" style={{ marginTop: 10 }}>
              <span className="faint" style={{ fontSize: 12.5, width: '100%' }}>Did you mean:</span>
              {problem.suggestions.map((sv) => (
                <button key={sv} type="button" className="chip chip-sm" onClick={() => setF({ ...f, server: sv })}>
                  {sv}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button className="btn btn-primary btn-block" disabled={!valid || !!busy}>
        {busy ?? 'Connect'}
      </button>
    </form>
  );
}
