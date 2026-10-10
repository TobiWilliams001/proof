'use client';

import { motion } from 'motion/react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt } from '@/lib/format';
import { equitySeries } from '@/lib/stats';
import type { Trade } from '@/lib/types';
import s from './Charts.module.css';

const BIN_LABEL: Record<number, string> = {
  [-3]: '< −2R',
  [-2]: '−2…−1',
  [-1]: '−1…0',
  0: '0…1',
  1: '1…2',
  2: '2…3',
  3: '3R+',
};

/** R distribution. Position on the axis carries win/loss; colour only reinforces it. */
export function RBars({ bins }: { bins: { bin: number; count: number }[] }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  const total = bins.reduce((a, b) => a + b.count, 0);
  return (
    <figure className={s.bars} aria-label="Distribution of trade results in R">
      <div className={s.plot} role="list">
        {bins.map((b) => (
          <div key={b.bin} className={s.col} role="listitem" tabIndex={0} aria-label={`${BIN_LABEL[b.bin]}: ${b.count} trades`}>
            <span className={s.tip}>
              <strong className="num">{b.count}</strong> trade{b.count === 1 ? '' : 's'} · {BIN_LABEL[b.bin]}
              {total > 0 && <span className="faint"> · {fmt.pct(b.count / total)}</span>}
            </span>
            <span className={`num ${s.val}`}>{b.count || ''}</span>
            <motion.span
              className={s.bar}
              data-tone={b.bin < 0 ? 'neg' : 'pos'}
              initial={{ height: 0 }}
              animate={{ height: `${(b.count / max) * 100}%` }}
              transition={{ type: 'spring', stiffness: 220, damping: 26, delay: 0.05 * (b.bin + 3) }}
            />
          </div>
        ))}
      </div>
      <figcaption className={s.axis}>
        {bins.map((b) => (
          <span key={b.bin} className={b.bin === 0 ? s.zero : undefined}>
            {BIN_LABEL[b.bin]}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function EquityCurve({ trades, metric = 'r' }: { trades: Trade[]; metric?: 'r' | 'pnl' }) {
  const data = equitySeries(trades);
  if (data.length < 2) {
    return <div className={s.emptyChart}>The curve appears after your second trade.</div>;
  }
  const last = data[data.length - 1][metric];
  const tone = last >= 0 ? 'var(--pos)' : 'var(--neg)';
  const format = (v: number) => (metric === 'r' ? fmt.r(v) : fmt.pnl(v));

  return (
    <div className={s.equity}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity={0.18} />
              <stop offset="100%" stopColor={tone} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis
            width={44}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-sans)' }}
            tickFormatter={(v: number) => (metric === 'r' ? `${v}R` : `$${Math.round(v)}`)}
          />
          <Tooltip
            cursor={{ stroke: 'var(--ink-3)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return (
                <div className={s.tt}>
                  <div className="faint">Trade {p.i} · {fmt.date(p.date)}</div>
                  <div className="num" style={{ fontSize: 15, fontWeight: 500 }}>{format(p[metric])}</div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey={metric}
            stroke={tone}
            strokeWidth={2}
            fill="url(#eqFill)"
            activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2, fill: tone }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
