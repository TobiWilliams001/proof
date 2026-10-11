import type { EntryKind, Playbook, PlaybookSetup, Side, Structured, Trade } from './types';

/**
 * Local, deterministic note structuring. It runs instantly and offline (the
 * brief asks for weak-connection resilience) and it can only ever map to the
 * trader's own playbook, it never invents setups or tags.
 */

export interface Clarify {
  field: 'setup';
  question: string;
  options: string[];
  /** The words the trader used for each option ("RE" for 2-touch), shown on the chips. */
  labels: Record<string, string>;
}

export interface StructureResult {
  kind: EntryKind;
  structured: Structured;
  confidence: number;
  clarify?: Clarify;
}

const SYMBOL_ALIASES: Record<string, string> = {
  GOLD: 'XAUUSD',
  SILVER: 'XAGUSD',
  NASDAQ: 'NAS100',
  NQ: 'NAS100',
  DOW: 'US30',
  SPX: 'SPX500',
  DAX: 'GER40',
  BITCOIN: 'BTCUSD',
  BTC: 'BTCUSD',
  ETH: 'ETHUSD',
};

const CURRENCIES = 'USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF|XAU|XAG';
const FX_RE = new RegExp(`\\b(${CURRENCIES})\\s?[/-]?\\s?(${CURRENCIES})\\b`, 'i');
const INDEX_RE = /\b(US30|NAS100|SPX500|US500|GER40|UK100|JP225|BTCUSDT?|ETHUSDT?)\b/i;
const ALIAS_RE = new RegExp(`\\b(${Object.keys(SYMBOL_ALIASES).join('|')})\\b`, 'i');

export function normalizeSymbol(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (SYMBOL_ALIASES[s]) return SYMBOL_ALIASES[s];
  return s.replace(/USDT$/, 'USD');
}

export function detectSymbol(text: string): string | undefined {
  const fx = text.match(FX_RE);
  if (fx && fx[1].toUpperCase() !== fx[2].toUpperCase()) return (fx[1] + fx[2]).toUpperCase();
  const idx = text.match(INDEX_RE);
  if (idx) return normalizeSymbol(idx[1]);
  const alias = text.match(ALIAS_RE);
  if (alias) return normalizeSymbol(alias[1]);
  return undefined;
}

export function detectSide(text: string): Side | undefined {
  if (/\b(long|buy|bought|longed)\b/i.test(text)) return 'long';
  if (/\b(short|sell|sold|shorted)\b/i.test(text)) return 'short';
  return undefined;
}

export function detectR(text: string): number | undefined {
  const m = text.match(/([+\-−]?\s?\d+(?:\.\d+)?)\s?R\b/);
  if (!m || m.index == null) return undefined;
  const value = parseFloat(m[1].replace('−', '-').replace(/\s/g, ''));
  if (value < 0 || /^\s*\+/.test(m[1])) return value;
  // "lost 1R" / "stopped out for 1.5R": the sign lives in the words before the number.
  const before = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
  return /\b(lost|lose|losing|down|loss|stopped|stop(ped)? out|minus|gave back)\b[^.!?]*$/.test(before) ? -value : value;
}

const KIND_PATTERNS: [EntryKind, RegExp][] = [
  ['rule_break', /\b(revenge|outside (of )?my (rules|plan)|broke (a |my )?rules?|against my rules|overtrad\w*|shouldn'?t have|fomo'?d|no setup|rule break)\b/i],
  ['missed', /\b(didn'?t take|did not take|missed|would'?ve been|would have been|passed on|skipped)\b/i],
  ['plan', /\b(watching|plan(ning)? (is|to)|looking for|waiting for|today i'?ll|if price|alert at|on watch)\b/i],
  ['reflection', /\b(tired|slept|sleep|mood|focus(ed)?|distracted|session reflection|felt|feeling|energy|stressed|calm today|cut size)\b/i],
];

export function detectKind(raw: string, opts: { linkedTrade?: boolean } = {}): EntryKind {
  // Phone keyboards and dictation insert curly apostrophes ("didn’t").
  const text = raw.replace(/[‘’]/g, "'");
  for (const [kind, re] of KIND_PATTERNS) {
    if (kind === 'reflection') continue;
    if (re.test(text)) return kind;
  }
  if (opts.linkedTrade) return 'trade_note';
  const hasMarketContext = detectSymbol(text) || detectR(text) != null;
  if (!hasMarketContext && KIND_PATTERNS[3][1].test(text)) return 'reflection';
  return hasMarketContext ? 'trade_note' : 'reflection';
}

/** "2-touch", "two touch" and "2 touch" should all match the same setup. */
function canon(s: string): string {
  const words: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5' };
  return s
    .toLowerCase()
    .replace(/\b(one|two|three|four|five)\b/g, (w) => words[w])
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

function containsPhrase(haystack: string, needle: string): boolean {
  const n = canon(needle);
  if (!n) return false;
  // "+" is kept so tags like "A+" don't collapse into the article "a".
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, ' ?');
  return new RegExp(`(^| )${escaped}( |$)`).test(haystack);
}

/** The name or alias the trader actually used for a setup. */
export function spokenName(text: string, setup: PlaybookSetup): string {
  const hay = canon(text);
  return [...(setup.aliases ?? []), setup.name].find((n) => containsPhrase(hay, n)) ?? setup.name;
}

export function matchSetups(text: string, playbook: Playbook): string[] {
  const hay = canon(text);
  return playbook.setups
    .filter((s) => [s.name, ...(s.aliases ?? [])].some((n) => containsPhrase(hay, n)))
    .map((s) => s.name);
}

export function matchTags(text: string, playbook: Playbook): string[] {
  const hay = canon(text);
  return playbook.tags.filter((t) => containsPhrase(hay, t));
}

function matchFields(text: string, playbook: Playbook): Record<string, string> {
  const hay = canon(text);
  const out: Record<string, string> = {};
  for (const f of playbook.fields) {
    if (f.type === 'select' && f.options) {
      const hit = f.options.find((o) => containsPhrase(hay, o));
      if (hit) out[f.name] = hit;
    } else {
      const m = text.match(new RegExp(`${f.name}\\s*[:=]\\s*([^,.;\\n]+)`, 'i'));
      if (m) out[f.name] = m[1].trim();
    }
  }
  return out;
}

export function structureNote(
  text: string,
  playbook: Playbook,
  trade?: Trade,
): StructureResult {
  // A note on a position that's still open is the plan, captured before the outcome.
  const kind = trade?.status === 'open' ? 'plan' : detectKind(text, { linkedTrade: !!trade });
  const setups = matchSetups(text, playbook);
  const structured: Structured = {
    symbol: trade?.symbol ?? detectSymbol(text),
    side: trade?.side ?? detectSide(text),
    r: trade?.r ?? detectR(text),
    setup: setups.length === 1 ? setups[0] : undefined,
    tags: matchTags(text, playbook),
    fields: matchFields(text, playbook),
  };

  // Confidence reflects how much of what matters we could pin down.
  let confidence = 0.5;
  if (structured.symbol) confidence += 0.15;
  if (structured.setup) confidence += 0.25;
  if (structured.tags.length) confidence += 0.1;
  confidence = Math.min(1, confidence);

  // Setup is the field that drives most answers, so it's the only one worth
  // interrupting the trader for, and only on notes about an actual trade.
  let clarify: Clarify | undefined;
  const setupMatters = (kind === 'trade_note' || kind === 'missed') && playbook.setups.length > 0;
  if (setupMatters && setups.length > 1) {
    // Ask in the trader's own words: "Was this your RE or RRE?"
    const labels = Object.fromEntries(
      setups.map((n) => [n, spokenName(text, playbook.setups.find((x) => x.name === n)!)]),
    );
    const said = setups.map((n) => labels[n]);
    clarify = {
      field: 'setup',
      question: `Was this your ${said.slice(0, -1).join(', ')} or ${said.at(-1)}?`,
      options: setups,
      labels,
    };
    confidence = Math.min(confidence, 0.6);
  } else if (setupMatters && setups.length === 0 && !trade?.setup) {
    clarify = {
      field: 'setup',
      question: 'Which setup was this?',
      options: playbook.setups.slice(0, 6).map((s) => s.name),
      labels: Object.fromEntries(playbook.setups.slice(0, 6).map((s) => [s.name, s.name])),
    };
  } else if (!structured.setup && trade?.setup) {
    structured.setup = trade.setup;
  }

  return { kind, structured, confidence: Math.round(confidence * 100) / 100, clarify };
}

/**
 * Brings an LLM's structuring back inside the trader's playbook. Anything the
 * model returns that isn't one of their own setups/tags is dropped.
 */
export function constrainToPlaybook(s: Partial<Structured>, playbook: Playbook): Structured {
  const setupNames = new Map(playbook.setups.map((x) => [x.name.toLowerCase(), x.name]));
  const tagNames = new Map(playbook.tags.map((x) => [x.toLowerCase(), x]));
  const fields: Record<string, string> = {};
  for (const f of playbook.fields) {
    const v = s.fields?.[f.name];
    if (typeof v !== 'string' || !v) continue;
    if (f.type === 'select' && !f.options?.some((o) => o.toLowerCase() === v.toLowerCase())) continue;
    fields[f.name] = v;
  }
  return {
    symbol: typeof s.symbol === 'string' ? normalizeSymbol(s.symbol) : undefined,
    side: s.side === 'long' || s.side === 'short' ? s.side : undefined,
    r: typeof s.r === 'number' && Number.isFinite(s.r) ? s.r : undefined,
    setup: s.setup ? setupNames.get(s.setup.toLowerCase()) : undefined,
    tags: (s.tags ?? []).map((t) => tagNames.get(String(t).toLowerCase())).filter((t): t is string => !!t),
    fields,
  };
}
