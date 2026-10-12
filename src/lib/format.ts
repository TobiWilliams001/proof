const whole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const centsFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Cents only matter on small amounts ($184.59 reads slower than $185), and when
// shown they're always two digits: $12.40, never $12.4.
const cash = (n: number) => {
  const v = Math.round(n * 100) / 100;
  return Math.abs(v) >= 100 || Number.isInteger(v) ? whole.format(v) : centsFmt.format(v);
};

export const fmt = {
  money: (n: number) => cash(n),
  // Zero carries no sign: "+$0" reads like a gain.
  pnl: (n: number) => (n === 0 ? cash(0) : `${n > 0 ? '+' : '−'}${cash(Math.abs(n))}`),
  r: (r: number | null | undefined) =>
    r == null || Number.isNaN(r) ? 'No R' : `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}R`,
  pct: (n: number) => `${Math.round(n * 100)}%`,
  date: (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  dateLong: (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
  time: (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  relative(iso: string, now = Date.now()) {
    const mins = Math.round((now - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return fmt.date(iso);
  },
  side: (s: 'long' | 'short') => (s === 'long' ? 'Long' : 'Short'),
};

export function sessionFor(iso: string): import('./types').Session {
  const h = new Date(iso).getUTCHours();
  if (h < 7) return 'Asian';
  if (h < 12) return 'London';
  if (h < 16) return 'Overlap';
  if (h < 21) return 'New York';
  return 'Other';
}
