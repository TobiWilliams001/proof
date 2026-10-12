'use client';

import { Link2, MessageSquareText, Trash2 } from 'lucide-react';
import { fmt } from '@/lib/format';
import { outcomeOf } from '@/lib/stats';
import { useUnits } from '@/lib/store';
import { isOpen, KIND_LABEL, type Entry, type Trade } from '@/lib/types';
import s from './Items.module.css';

export function EntryItem({
  entry,
  trade,
  onDelete,
  compact,
}: {
  entry: Entry;
  trade?: Trade;
  onDelete?: () => void;
  compact?: boolean;
}) {
  const u = useUnits();
  const st = entry.structured;
  // The trade (or the market the note is about) is the subject; the words are the story.
  const symbol = trade?.symbol ?? st?.symbol;
  const side = trade?.side ?? st?.side;
  // A linked trade speaks in the trader's units; a note's own figure stays as they said it.
  const r = trade ? (trade.r ?? null) : st?.r;
  const result = trade ? (isOpen(trade) ? null : u.show(trade.r, trade.pnl)) : st?.r != null ? fmt.r(st.r) : null;
  const tone = trade ? u.value(trade.r, trade.pnl) : (r ?? 0);
  const setup = st?.setup ?? trade?.setup;
  const rLabel = trade ? null : entry.kind === 'missed' ? 'would’ve been' : entry.kind === 'plan' ? 'target' : null;
  const meta = [...(st?.tags ?? []).map((t) => `#${t}`), ...Object.values(st?.fields ?? {})];

  return (
    <article className={s.entry}>
      <div className={s.entryHead}>
        <span className={`kind kind-${entry.kind}`}>{KIND_LABEL[entry.kind]}</span>
        <span className="faint" style={{ fontSize: 12 }}>
          {fmt.time(entry.createdAt)}
        </span>
        <span className="spacer" />
        {onDelete && (
          <button
            className={s.del}
            onClick={() => confirm('Delete this note?') && onDelete()}
            aria-label="Delete note"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {(symbol || setup) && (
        <div className={s.subject}>
          <span className={s.subjectMain}>
            {trade && <Link2 size={12} className="faint" aria-label="Linked trade" />}
            {symbol && <strong>{symbol}</strong>}
            {side && <span className={s.side}>{side}</span>}
            {setup && <span className={s.setup}>{setup}</span>}
          </span>
          {result && (
            <span className={s.subjectR}>
              {rLabel && <span className="faint">{rLabel} </span>}
              <span className={`num ${tone > 0 ? 'pos' : tone < 0 ? 'neg' : 'faint'}`}>{result}</span>
            </span>
          )}
        </div>
      )}

      <p className={compact ? s.textCompact : s.text}>{entry.text}</p>

      {meta.length > 0 && <p className={s.meta}>{meta.join('  ·  ')}</p>}
    </article>
  );
}

export function TradeItem({
  trade,
  noteCount = 0,
  onClick,
}: {
  trade: Trade;
  noteCount?: number;
  onClick?: () => void;
}) {
  const { units } = useUnits();
  const o = isOpen(trade) ? 'open' : outcomeOf(trade);
  // Lead with the trader's chosen units; the other figure sits quietly underneath.
  const money = fmt.pnl(trade.pnl);
  const r = trade.r != null ? fmt.r(trade.r) : null;
  const main = units === 'r' ? (r ?? money) : money;
  const sub = units === 'r' ? (r ? money : null) : units === 'both' ? r : null;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`list-item ${s.trade}`} onClick={onClick}>
      <span className={s.mark} data-o={o} aria-hidden />
      <span className={s.tradeMain}>
        <span className={s.tradeTop}>
          <strong className={s.sym}>{trade.symbol}</strong>
          <span className={s.side} data-side={trade.side}>
            {trade.side}
          </span>
          {noteCount > 0 && (
            <span className="faint" title={`${noteCount} note${noteCount > 1 ? 's' : ''}`}>
              <MessageSquareText size={13} />
            </span>
          )}
        </span>
        <span className={s.tradeSub}>
          {trade.setup ?? 'No setup'} · {isOpen(trade) ? 'opened ' : ''}{fmt.date(isOpen(trade) ? trade.openedAt : trade.closedAt)} {fmt.time(isOpen(trade) ? trade.openedAt : trade.closedAt)}
        </span>
      </span>
      {isOpen(trade) ? (
        <span className={s.openBadge}>Open</span>
      ) : (
      <span className={s.tradeNums}>
        <span className={`num ${s.r} ${o === 'win' ? 'pos' : o === 'loss' ? 'neg' : 'faint'}`}>
          {main}
        </span>
        {sub && <span className={`num ${s.pnl}`}>{sub}</span>}
      </span>
      )}
    </Tag>
  );
}
