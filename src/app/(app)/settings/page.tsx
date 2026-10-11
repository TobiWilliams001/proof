'use client';

import { Calculator, ChevronRight, Download, Lock, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { CsvImport } from '@/components/CsvImport';
import { SyncAccounts } from '@/components/SyncAccounts';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { Reveal } from '@/components/motion';
import { typicalJournalTime } from '@/lib/metrics';
import { useJournal } from '@/lib/store';
import { useMounted } from '@/lib/useMounted';
import { PLATFORMS } from '@/lib/sync/adapter';

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  // Revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SettingsPage() {
  const { data, addTrades, loadDemo, clearAll } = useJournal();
  const stamp = new Date().toISOString().slice(0, 10);
  const mounted = useMounted();
  const pace = mounted ? typicalJournalTime() : null;

  const exportCsv = () => {
    const head = 'closed_at,symbol,side,entry,exit,size,pnl,r,setup,notes';
    const notes = new Map<string, string[]>();
    for (const e of data.entries) if (e.tradeId) notes.set(e.tradeId, [...(notes.get(e.tradeId) ?? []), e.text]);
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = data.trades.map((t) =>
      [t.closedAt, t.symbol, t.side, t.entry, t.exit, t.size, t.pnl, t.r ?? '', t.setup ?? '', (notes.get(t.id) ?? []).join(' | ')].map(q).join(','),
    );
    download(`proof-trades-${stamp}.csv`, [head, ...lines].join('\n'), 'text/csv');
  };

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Private by default</div>
        <h1 className="page-title">Settings</h1>
      </header>

      <Reveal className="section" id="accounts" style={{ marginTop: 8 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Trading accounts</h2>
        <SyncAccounts />
        <h3 className="section-title" style={{ margin: '24px 0 12px' }}>More platforms</h3>
        <div className="list">
          {PLATFORMS.filter((p) => p.id !== 'mt5').map((p) => (
            <div key={p.id} className="list-item">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 550 }}>{p.name}</span>
                <span className="faint" style={{ fontSize: 12.5 }}>{p.via}</span>
              </span>
              <span className="chip chip-sm chip-outline">Coming soon</span>
            </div>
          ))}
        </div>
        <p className="faint" style={{ fontSize: 12.5, margin: '10px 4px 14px' }}>
          You can also bring in a history file from any platform.
        </p>
        <CsvImport onImport={addTrades} />
      </Reveal>

      <Reveal className="section">
        <h2 className="section-title" style={{ marginBottom: 12 }}>Appearance</h2>
        <div className="list">
          <div className="list-item">
            <span style={{ flex: 1 }}>Theme</span>
            <ThemeSwitch />
          </div>
        </div>
      </Reveal>

      <Reveal className="section">
        <h2 className="section-title" style={{ marginBottom: 12 }}>Tools</h2>
        <div className="list">
          <Link href="/calculator" className="list-item">
            <Calculator size={17} className="faint" />
            <span style={{ flex: 1 }}>Position size calculator</span>
            <ChevronRight size={16} className="faint" />
          </Link>
        </div>
      </Reveal>

      <Reveal className="section">
        {pace && (
          <p className="card" style={{ marginBottom: 16, fontSize: 14.5 }}>
            You usually journal a note in <strong className="num">{pace.seconds} seconds</strong>
            <span className="faint"> · last {pace.samples} notes</span>
          </p>
        )}
        <h2 className="section-title" style={{ marginBottom: 12 }}>Your data</h2>
        <div className="list">
          <button className="list-item" onClick={() => download(`proof-journal-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json')}>
            <Download size={17} className="faint" />
            <span style={{ flex: 1 }}>Export everything <span className="faint">(JSON)</span></span>
          </button>
          <button className="list-item" onClick={exportCsv} disabled={!data.trades.length}>
            <Download size={17} className="faint" />
            <span style={{ flex: 1 }}>Export trades with notes <span className="faint">(CSV)</span></span>
          </button>
          <button
            className="list-item"
            onClick={() => (!data.trades.length && !data.entries.length) || confirm('Replace your journal with demo data?') ? loadDemo() : undefined}
          >
            <Sparkles size={17} className="faint" />
            <span style={{ flex: 1 }}>Load demo journal</span>
          </button>
          <button
            className="list-item"
            style={{ color: 'var(--neg-text)' }}
            onClick={async () => {
              if (confirm('Delete every trade, note and setup on this device? This can’t be undone.')) await clearAll();
            }}
          >
            <Trash2 size={17} />
            <span style={{ flex: 1 }}>Delete everything</span>
          </button>
        </div>
        <p className="row faint" style={{ fontSize: 12.5, margin: '12px 4px 0', alignItems: 'flex-start' }}>
          <Lock size={13} style={{ marginTop: 3, flex: 'none' }} />
          Your journal currently lives only in this browser. Proof never stores voice recordings — dictation uses your browser’s built-in speech recognition and only the text is kept.
        </p>
      </Reveal>
    </div>
  );
}
