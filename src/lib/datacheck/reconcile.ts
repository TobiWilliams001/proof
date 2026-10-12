import { fmt } from '../format';
import type { MtDeal } from '../sync/mt-map';
import type { Trade } from '../types';

/**
 * Proof's numbers against MetaTrader's, position by position. The platform
 * side is summed straight from its raw deals, independent of how Proof turns
 * deals into trades, so a mistake in that mapping shows up here.
 */

export interface PositionTotal {
  id: string;
  /** Net result including commission and swap. */
  net: number;
  closedAt: string;
}

export interface PlatformCheck {
  at: string;
  from: string;
  to: string;
  positions: PositionTotal[];
}

export interface Reconciliation {
  match: boolean;
  /** On MetaTrader, not in Proof. */
  missing: PositionTotal[];
  /** In Proof, not on MetaTrader. */
  extra: string[];
  /** Positions in both whose result differs by more than a cent. */
  different: { id: string; proof: number; platform: number }[];
  platformCount: number;
  proofCount: number;
  /** Proof's total minus the platform's, to the cent. */
  netDiff: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;
const isTradeDeal = (d: MtDeal) => d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL';

/** Fully closed positions whose last deal falls in the window, with their net from every deal. */
export function platformPositions(deals: MtDeal[], from: string, to: string): PositionTotal[] {
  const byPos = new Map<string, MtDeal[]>();
  for (const d of deals) if (isTradeDeal(d) && d.positionId) byPos.set(d.positionId, [...(byPos.get(d.positionId) ?? []), d]);
  const out: PositionTotal[] = [];
  for (const [id, ds] of byPos) {
    // Buys add volume, sells take it away; a closed position nets to zero, reversals included.
    const volume = ds.reduce((v, d) => v + (d.type === 'DEAL_TYPE_BUY' ? 1 : -1) * (d.volume ?? 0), 0);
    if (Math.abs(volume) > 1e-9) continue;
    // Every position must have its opening deal, or the net is short.
    if (!ds.some((d) => d.entryType === 'DEAL_ENTRY_IN')) continue;
    const closedAt = ds.map((d) => d.time).sort().at(-1)!;
    if (closedAt < from || closedAt > to) continue;
    out.push({ id, net: cents(ds.reduce((s, d) => s + (d.profit ?? 0) + (d.commission ?? 0) + (d.swap ?? 0), 0)), closedAt });
  }
  return out;
}

/** Proof's view of the same positions: a reversal's two trades add back up to one position. */
export function proofPositions(trades: Trade[], accountId: string, from: string, to: string): PositionTotal[] {
  const byPos = new Map<string, PositionTotal>();
  for (const t of trades) {
    if (t.accountId !== accountId || !t.platform || t.status === 'open') continue;
    const id = t.platform.positionId.split('#')[0];
    const cur = byPos.get(id);
    byPos.set(id, { id, net: cents((cur?.net ?? 0) + t.pnl), closedAt: !cur || t.closedAt > cur.closedAt ? t.closedAt : cur.closedAt });
  }
  return [...byPos.values()].filter((p) => Date.parse(p.closedAt) >= Date.parse(from) && Date.parse(p.closedAt) <= Date.parse(to));
}

export function reconcile(trades: Trade[], accountId: string, check: PlatformCheck): Reconciliation {
  const proof = proofPositions(trades, accountId, check.from, check.to);
  const mine = new Map(proof.map((p) => [p.id, p]));
  const theirs = new Map(check.positions.map((p) => [p.id, p]));
  const missing = check.positions.filter((p) => !mine.has(p.id));
  // A trade Proof sees closing right at the window's edge may sit just outside it on the
  // platform's clock; only count it as extra if it's clearly inside.
  const edge = 60_000;
  const extra = proof
    .filter((p) => !theirs.has(p.id) && Date.parse(p.closedAt) - Date.parse(check.from) > edge && Date.parse(check.to) - Date.parse(p.closedAt) > edge)
    .map((p) => p.id);
  const different = proof
    .filter((p) => theirs.has(p.id) && Math.abs(p.net - theirs.get(p.id)!.net) > 0.01)
    .map((p) => ({ id: p.id, proof: p.net, platform: theirs.get(p.id)!.net }));
  const sum = (ps: PositionTotal[]) => ps.reduce((s, p) => s + p.net, 0);
  const shared = proof.filter((p) => theirs.has(p.id));
  const netDiff = cents(sum(shared) - sum(shared.map((p) => theirs.get(p.id)!)) + sum(proof.filter((p) => extra.includes(p.id))) - sum(missing));
  return {
    match: !missing.length && !extra.length && !different.length && Math.abs(netDiff) <= 0.01,
    missing,
    extra,
    different,
    platformCount: check.positions.length,
    proofCount: shared.length + extra.length,
    netDiff,
  };
}

/** One clear sentence for what doesn't match MetaTrader, most important first. */
export function mismatchText(r: Reconciliation, name: string): string {
  if (r.missing.length) return `${r.missing.length} trade${r.missing.length === 1 ? ' is' : 's are'} missing from ${name} in the last 30 days.`;
  if (r.extra.length) return `${r.extra.length} trade${r.extra.length === 1 ? '' : 's'} in Proof ${r.extra.length === 1 ? 'isn’t' : 'aren’t'} in MetaTrader for ${name}.`;
  return `Proof’s total for ${name} over the last 30 days is ${fmt.money(Math.abs(r.netDiff))} ${r.netDiff > 0 ? 'higher' : 'lower'} than MetaTrader’s.`;
}
