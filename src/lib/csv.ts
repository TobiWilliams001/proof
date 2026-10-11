import { sessionFor } from './format';
import { uid } from './id';
import { normalizeSymbol } from './structure';
import type { Trade } from './types';

/** Picks the delimiter that splits the header line most, ignoring quoted text. */
function detectDelimiter(text: string): string {
  const header = (text.split(/\r?\n/, 1)[0] ?? '').replace(/"[^"]*"/g, '');
  const counts = [',', ';', '\t'].map((d) => [d, header.split(d).length - 1] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ',';
}

/** RFC-4180-ish: handles quoted fields, escaped quotes, CRLF, and , ; or tab delimiters. */
export function parseCSV(text: string): string[][] {
  const delim = detectDelimiter(text.replace(/^\uFEFF/, ''));
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row.map((f) => f.trim()));
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row.map((f) => f.trim()));
  return rows;
}

export const CSV_FIELDS = ['closedAt', 'symbol', 'side', 'entry', 'exit', 'size', 'pnl', 'r', 'setup'] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

export const CSV_FIELD_LABEL: Record<CsvField, string> = {
  closedAt: 'Close time',
  symbol: 'Symbol',
  side: 'Side',
  entry: 'Entry price',
  exit: 'Exit price',
  size: 'Size',
  pnl: 'P&L',
  r: 'R multiple',
  setup: 'Setup',
};

// Header names used by MT4/MT5, cTrader, Bybit, Binance and common journals.
const HINTS: Record<CsvField, RegExp> = {
  closedAt: /^(close[ _]?time|closing[ _]?time|close[ _]?date|closed[ _]?at|date|time|closed|exit[ _]?time)$/i,
  symbol: /^(symbol|pair|instrument|market|contract|ticker)$/i,
  side: /^(side|type|direction|action|order ?type)$/i,
  entry: /^(entry|entry ?price|open ?price|price|avg ?entry ?price)$/i,
  exit: /^(exit|exit ?price|close ?price|closing ?price|avg ?exit ?price)$/i,
  size: /^(size|volume|lots?|qty|quantity|amount)$/i,
  pnl: /^(p&?l|pnl|profit|net ?profit|realized ?p&?l|closed ?p&?l|gross ?profit)$/i,
  r: /^(r|r ?multiple|r:r|rr|r-multiple)$/i,
  setup: /^(setup|strategy|playbook|tag)$/i,
};

export function guessMapping(headers: string[]): Partial<Record<CsvField, number>> {
  const map: Partial<Record<CsvField, number>> = {};
  for (const f of CSV_FIELDS) {
    const idx = headers.findIndex((h, i) => HINTS[f].test(h) && !Object.values(map).includes(i));
    if (idx >= 0) map[f] = idx;
  }
  return map;
}

/**
 * Platform exports use "2026.10.06 10:15" (MT4/5), ISO, or epoch ms. Normalised to
 * ISO-with-T first, because Safari rejects a space between date and time.
 */
export function parseDate(v: string | undefined): Date | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d{12,13}$/.test(s)) return new Date(Number(s));
  const m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  // Anything with an explicit zone or offset is unambiguous, let the engine parse it.
  if (m && !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const [, y, mo, d, h = '0', mi = '0', se = '0'] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  }
  // European "15.01.2024 10:30".
  const eu = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (eu) {
    const [, d, mo, y, h = '0', mi = '0', se = '0'] = eu;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const s = v.trim();
  // Accounting style "(45.20)" is a loss.
  const negative = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  let digits = s.replace(/[^0-9.,]/g, '');
  // "1.234,50" / "1,5" → decimal comma; "1,234.50" → thousands comma.
  if (/,\d{1,2}$/.test(digits) && !/\.\d+$/.test(digits)) digits = digits.replace(/\./g, '').replace(',', '.');
  else digits = digits.replace(/,/g, '');
  const n = parseFloat(digits);
  return Number.isFinite(n) ? (negative ? -Math.abs(n) : n) : null;
}

export function rowsToTrades(
  rows: string[][],
  mapping: Partial<Record<CsvField, number>>,
): { trades: Trade[]; skipped: number } {
  const trades: Trade[] = [];
  let skipped = 0;
  for (const row of rows) {
    const get = (f: CsvField) => (mapping[f] != null ? row[mapping[f]!] : undefined);
    const symbol = get('symbol');
    const pnl = num(get('pnl'));
    const when = parseDate(get('closedAt'));
    // A trade without a symbol or a result can't answer any question honestly.
    if (!symbol || pnl == null || !when || Number.isNaN(when.getTime())) {
      skipped++;
      continue;
    }
    const closedAt = when.toISOString();
    trades.push({
      id: uid('t_'),
      symbol: normalizeSymbol(symbol),
      side: /sell|short/i.test(get('side') ?? '') ? 'short' : 'long',
      openedAt: closedAt,
      closedAt,
      entry: num(get('entry')) ?? 0,
      exit: num(get('exit')) ?? 0,
      size: num(get('size')) ?? 0,
      pnl,
      r: num(get('r')),
      setup: get('setup') || undefined,
      session: sessionFor(closedAt),
      source: 'csv',
    });
  }
  return { trades, skipped };
}
