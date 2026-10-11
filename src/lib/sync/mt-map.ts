import { sessionFor } from '../format';
import { rFromPrices, round } from '../stats';
import type { Side, Trade } from '../types';

/**
 * MetaTrader (via MetaApi) → Proof trades. Pure, so every edge case is testable.
 *
 * MT5 has orders (requests), deals (fills) and positions. One position is one
 * trade for the trader, however many deals it took: partial closes are extra
 * "out" deals on the same position id. Money is the sum over every deal,
 * including commission and swap, so the number matches the platform.
 */

export interface MtDeal {
  id: string;
  type: string; // DEAL_TYPE_BUY | DEAL_TYPE_SELL | balance/credit/commission…
  entryType?: string; // DEAL_ENTRY_IN | OUT | INOUT | OUT_BY
  symbol?: string;
  positionId?: string;
  volume?: number;
  price?: number;
  profit: number;
  commission?: number;
  swap?: number;
  time: string; // ISO, UTC
  stopLoss?: number;
  platform?: 'mt4' | 'mt5';
}

export interface MtPosition {
  id: string;
  type: string; // POSITION_TYPE_BUY | POSITION_TYPE_SELL
  symbol: string;
  time: string; // open time, ISO UTC
  openPrice: number;
  stopLoss?: number;
  volume: number;
}

const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'XAU', 'XAG', 'BTC', 'ETH']);

/**
 * Brokers decorate symbols ("EURUSD.r", "EURUSDm", "XAUUSD+", "GBPJPY_i"). Strip
 * the decoration so stats group by instrument, not by broker naming.
 */
export function cleanBrokerSymbol(raw: string): string {
  const s = raw.toUpperCase().trim();
  const m = s.match(/^([A-Z]{3})([A-Z]{3})[^A-Z]?[A-Z]{0,3}[^A-Z]*$/);
  if (m && CURRENCIES.has(m[1]) && CURRENCIES.has(m[2])) return m[1] + m[2];
  return s.replace(/[^A-Z0-9]/g, '');
}

const isTradeDeal = (d: MtDeal) => d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL';
const isIn = (d: MtDeal) => d.entryType === 'DEAL_ENTRY_IN';
const isOut = (d: MtDeal) => d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_OUT_BY' || d.entryType === 'DEAL_ENTRY_INOUT';
const vwapLegs = (legs: { price: number; volume: number }[]) => {
  const v = legs.reduce((t, l) => t + l.volume, 0);
  return v ? legs.reduce((t, l) => t + l.price * l.volume, 0) / v : 0;
};

export const tradeIdFor = (accountId: string, positionId: string) => `mt_${accountId}_${positionId}`;

export interface MapOptions {
  accountId: string;
  /** Stops Proof saw when each position first appeared — the reliable source of R on MT4. */
  sightedStops?: Record<string, number>;
}

/**
 * Groups deals by position and returns the positions that are fully closed.
 * Positions still partly open are left out — they're reported as open trades.
 * Also returns position ids whose opening deal falls outside the fetched range,
 * so the caller can fetch those deals and try again.
 */
export function dealsToTrades(deals: MtDeal[], opts: MapOptions): { trades: Trade[]; missingEntry: string[] } {
  const byPosition = new Map<string, MtDeal[]>();
  for (const d of deals) {
    if (!isTradeDeal(d) || !d.positionId) continue;
    byPosition.set(d.positionId, [...(byPosition.get(d.positionId) ?? []), d]);
  }

  const trades: Trade[] = [];
  const missingEntry: string[] = [];
  for (const [positionId, group] of byPosition) {
    const ds = [...group].sort((x, y) => x.time.localeCompare(y.time) || x.id.localeCompare(y.id));
    if (!ds.some(isIn) && ds.some(isOut)) {
      missingEntry.push(positionId);
      continue;
    }

    // Walk the deals with a running volume. A reversal (INOUT, netting accounts)
    // closes the current segment and opens an opposite one on the same position.
    interface Leg { price: number; volume: number }
    interface Segment { key: string; side: Side; ins: Leg[]; outs: Leg[]; money: number; dealIds: string[]; openedAt: string; closedAt?: string; openingStop?: number }
    const segments: Segment[] = [];
    let cur: Segment | null = null;
    let volume = 0;
    const start = (d: MtDeal, key: string, vol: number): Segment => ({
      key,
      side: d.type === 'DEAL_TYPE_BUY' ? 'long' : 'short',
      ins: [{ price: d.price ?? 0, volume: vol }],
      outs: [],
      money: 0,
      dealIds: [d.id],
      openedAt: d.time,
      openingStop: d.stopLoss || undefined,
    });

    for (const d of ds) {
      const vol = d.volume ?? 0;
      const cost = (d.commission ?? 0) + (d.swap ?? 0);
      if (isIn(d)) {
        if (!cur || volume <= 1e-9) {
          cur = start(d, positionId, vol);
          segments.push(cur);
        } else {
          cur.ins.push({ price: d.price ?? 0, volume: vol });
          cur.dealIds.push(d.id);
        }
        cur.money += d.profit + cost;
        volume += vol;
      } else if (isOut(d) && cur) {
        const closing = d.entryType === 'DEAL_ENTRY_INOUT' ? Math.min(vol, volume) : vol;
        const share = vol ? closing / vol : 1;
        cur.outs.push({ price: d.price ?? 0, volume: closing });
        cur.dealIds.push(d.id);
        // All of a reversal's profit belongs to what it closed; its costs split by volume.
        cur.money += d.profit + cost * share;
        volume -= closing;
        if (volume <= 1e-9) cur.closedAt = d.time;
        if (d.entryType === 'DEAL_ENTRY_INOUT' && vol - closing > 1e-9) {
          cur = start(d, `${positionId}#${d.id}`, vol - closing);
          cur.side = d.type === 'DEAL_TYPE_BUY' ? 'long' : 'short';
          cur.money += cost * (1 - share);
          cur.openingStop = undefined; // a reversal deal's stop isn't a plan for the new side
          segments.push(cur);
          volume = vol - closing;
        }
      }
    }

    const platform = ds[0].platform ?? 'mt5';
    for (const seg of segments) {
      if (!seg.closedAt) continue; // still open: reported as an open trade
      const entry = vwapLegs(seg.ins);
      const exit = vwapLegs(seg.outs);
      // MT5's opening deal carries the stop of the order that opened it, the original
      // stop. MT4 only reports the latest stop, so there only a sighted stop is trusted.
      const stop = opts.sightedStops?.[seg.key] ?? (platform === 'mt5' ? seg.openingStop : undefined);
      trades.push({
        id: tradeIdFor(opts.accountId, seg.key),
        symbol: cleanBrokerSymbol(ds[0].symbol ?? ''),
        side: seg.side,
        openedAt: seg.openedAt,
        closedAt: seg.closedAt,
        entry: round(entry, 6),
        stop,
        exit: round(exit, 6),
        size: round(seg.ins.reduce((t, l) => t + l.volume, 0), 4),
        pnl: round(seg.money, 2),
        r: rFromPrices(seg.side, entry, stop, exit),
        session: sessionFor(seg.openedAt),
        source: 'sync',
        accountId: opts.accountId,
        platform: { positionId: seg.key, dealIds: seg.dealIds },
      });
    }
  }
  return { trades, missingEntry };
}

/** Open positions as Proof open trades. Same id as the closed trade will have, so notes stay linked. */
export function positionsToOpenTrades(positions: MtPosition[], opts: MapOptions): Trade[] {
  return positions.map((p) => ({
    id: tradeIdFor(opts.accountId, p.id),
    symbol: cleanBrokerSymbol(p.symbol),
    side: p.type === 'POSITION_TYPE_BUY' ? 'long' : 'short',
    openedAt: p.time,
    closedAt: p.time,
    status: 'open',
    entry: p.openPrice,
    // First sighting wins: later edits (trailing to breakeven) must not rewrite the risk taken.
    stop: opts.sightedStops?.[p.id] ?? (p.stopLoss || undefined),
    exit: 0,
    size: p.volume,
    pnl: 0,
    r: null,
    session: sessionFor(p.time),
    source: 'sync',
    accountId: opts.accountId,
    platform: { positionId: p.id },
  }));
}
