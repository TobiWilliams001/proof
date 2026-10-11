/** Pure position-sizing maths. Numbers in, numbers out. */

export interface PositionResult {
  size: number; // units of base (crypto) or standard lots (forex)
  notional: number; // USD
  riskAmt: number;
  profit: number;
  rr: number;
  liqPrice?: number;
  /** True when the stop sits beyond liquidation, you'd be wiped before it triggers. */
  stopBeyondLiq?: boolean;
  margin?: number;
  targetWrongSide?: boolean;
}

// Rough maintenance margin used by most perp venues at low tiers.
const MAINT_MARGIN = 0.005;

export function sizeCrypto(p: {
  balance: number;
  riskPct: number;
  entry: number;
  stop: number;
  target?: number;
  leverage: number;
  side: 'long' | 'short';
  futures: boolean;
}): PositionResult | null {
  if (p.balance <= 0 || p.entry <= 0 || p.stop <= 0 || p.entry === p.stop) return null;
  const riskAmt = p.balance * (p.riskPct / 100);
  const perUnit = Math.abs(p.entry - p.stop);
  const size = riskAmt / perUnit;
  const notional = size * p.entry;
  // Signed: a target on the wrong side of entry is not a reward.
  const toTarget = p.target && p.target > 0 ? (p.side === 'long' ? p.target - p.entry : p.entry - p.target) : 0;
  const profit = toTarget > 0 ? size * toTarget : 0;
  const res: PositionResult = { size, notional, riskAmt, profit, rr: profit / riskAmt, targetWrongSide: toTarget < 0 };
  if (p.futures && p.leverage > 0) {
    const lev = p.leverage;
    res.margin = notional / lev;
    res.liqPrice = p.side === 'long' ? p.entry * (1 - 1 / lev + MAINT_MARGIN) : p.entry * (1 + 1 / lev - MAINT_MARGIN);
    res.stopBeyondLiq = p.side === 'long' ? p.stop <= res.liqPrice : p.stop >= res.liqPrice;
  }
  return res;
}

export const FX_PAIRS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'EURJPY', 'GBPJPY'] as const;
export type FxPair = (typeof FX_PAIRS)[number];

/**
 * USD-account pip value per standard lot (100k units).
 * USD-quoted pairs are $10/pip; JPY-quoted pairs need the USDJPY rate to convert.
 */
export function pipValueUSD(pair: FxPair, usdJpy: number): number {
  if (pair.endsWith('USD')) return 10;
  return usdJpy > 0 ? 1000 / usdJpy : 0;
}

export function sizeForex(p: {
  balance: number;
  riskPct: number;
  stopPips: number;
  targetPips?: number;
  pair: FxPair;
  usdJpy: number;
}): PositionResult | null {
  const pip = pipValueUSD(p.pair, p.usdJpy);
  if (p.balance <= 0 || p.stopPips <= 0 || pip <= 0) return null;
  const riskAmt = p.balance * (p.riskPct / 100);
  const lots = riskAmt / (p.stopPips * pip);
  const profit = p.targetPips ? lots * p.targetPips * pip : 0;
  return { size: lots, notional: lots * 100000, riskAmt, profit, rr: profit / riskAmt };
}
