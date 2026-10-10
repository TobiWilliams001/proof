import { addDays, startOfDay } from './dates';
import { sessionFor } from './format';
import type { Entry, JournalData, Playbook, Side, Trade } from './types';

export const DEMO_PLAYBOOK: Playbook = {
  setups: [
    { id: 's1', name: '2-touch', description: 'Continuation after the second touch of a value area on the 1H.', aliases: ['RE', 'two touch'] },
    { id: 's2', name: '3-touch', description: 'Continuation after a third, cleaner touch — the A+ version.', aliases: ['RRE', 'three touch'] },
    { id: 's3', name: 'Footprint', description: 'Order-flow entry on absorption at a planned level.', aliases: ['footprint entry'] },
    { id: 's4', name: 'Breakout retest', description: 'Range break, then retest of the broken level.', aliases: ['retest'] },
  ],
  tags: ['patient', 'early entry', 'late entry', 'tired', 'revenge', 'fomo', 'moved stop', 'news', 'A+'],
  fields: [
    { id: 'f1', name: 'Timeframe', type: 'select', options: ['15m', '1H', '4H'] },
    { id: 'f2', name: 'Location', type: 'select', options: ['value area', 'range high', 'range low'] },
  ],
};

// Deterministic so the demo (and anything screenshotted from it) is stable.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYMBOLS: Record<string, { price: number; pip: number }> = {
  EURUSD: { price: 1.0842, pip: 0.0001 },
  GBPUSD: { price: 1.2655, pip: 0.0001 },
  GBPJPY: { price: 191.4, pip: 0.01 },
  XAUUSD: { price: 2341, pip: 0.1 },
  NAS100: { price: 19850, pip: 1 },
};

// Win probability and average winner per setup — 3-touch is the trader's edge.
const SETUP_PROFILE: Record<string, { p: number; win: [number, number] }> = {
  '3-touch': { p: 0.64, win: [1.8, 3.6] },
  '2-touch': { p: 0.5, win: [1.2, 2.4] },
  Footprint: { p: 0.45, win: [1.5, 3] },
  'Breakout retest': { p: 0.33, win: [1, 2] },
};

const WIN_NOTES = [
  'Waited for the {setup} at the value area, entry was clean. Stayed patient and let it run.',
  'Textbook {setup}. A+ location, held to target without touching it.',
  'Good read on the {setup}, took partials at 1R and trailed the rest. Patient.',
  '{setup} on the 1H, came in a little late entry but the level held.',
];
const LOSS_NOTES = [
  'Took the {setup} too soon — early entry before the touch confirmed. Stopped out.',
  'Felt tired, forced a {setup} that was not really there. Should have sat out.',
  'Clean {setup} by the rules, just didn’t work. Fine loss.',
  'Moved stop on the {setup} and gave back more than planned. Early entry again.',
  'Revenge trade after the last loss, called it a {setup} but it was fomo.',
];

export function buildDemo(now = new Date()): JournalData {
  const rand = mulberry32(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const trades: Trade[] = [];
  const entries: Entry[] = [];
  const today = startOfDay(now);
  const setups = Object.keys(SETUP_PROFILE);

  let n = 0;
  for (let d = 27; d >= 0; d--) {
    const day = addDays(today, -d);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const perDay = d === 0 ? 1 : 1 + Math.floor(rand() * 2.2);
    for (let k = 0; k < perDay; k++) {
      const symbol = pick(Object.keys(SYMBOLS));
      const setup = rand() < 0.4 ? '3-touch' : pick(setups);
      const prof = SETUP_PROFILE[setup];
      const side: Side = rand() < 0.55 ? 'long' : 'short';
      const r =
        rand() < 0.08
          ? 0
          : rand() < prof.p
            ? +(prof.win[0] + rand() * (prof.win[1] - prof.win[0])).toFixed(1)
            : -+(0.6 + rand() * 0.4).toFixed(1);
      const open = new Date(day);
      open.setHours(8 + Math.floor(rand() * 9), Math.floor(rand() * 60));
      const close = new Date(open.getTime() + (20 + rand() * 220) * 60000);
      if (close > now) close.setTime(now.getTime() - 15 * 60000);
      const { price, pip } = SYMBOLS[symbol];
      const entry = +(price * (1 + (rand() - 0.5) * 0.02)).toFixed(pip < 0.01 ? 5 : 2);
      const stop = pip * (15 + Math.floor(rand() * 25));
      const exit = +(entry + (side === 'long' ? 1 : -1) * r * stop * (symbol === 'NAS100' || symbol === 'XAUUSD' ? 10 : 1)).toFixed(pip < 0.01 ? 5 : 2);
      const id = `demo_t${++n}`;
      trades.push({
        id,
        symbol,
        side,
        openedAt: open.toISOString(),
        closedAt: close.toISOString(),
        entry,
        exit,
        size: +(0.2 + rand() * 1.8).toFixed(2),
        pnl: Math.round(r * 120 * 100) / 100,
        r,
        setup,
        session: sessionFor(open.toISOString()),
        source: 'demo',
      });

      // Leave the most recent trade un-journaled so the post-close prompt shows.
      if (d === 0 || rand() < 0.3) continue;
      const text = pick(r > 0 ? WIN_NOTES : LOSS_NOTES).replace('{setup}', setup);
      const tags = DEMO_PLAYBOOK.tags.filter((t) => text.toLowerCase().includes(t.toLowerCase()));
      entries.push({
        id: `demo_e${n}`,
        kind: /revenge|fomo/i.test(text) ? 'rule_break' : 'trade_note',
        text,
        tradeId: id,
        structured: { symbol, side, setup, r, tags, fields: { Timeframe: '1H' } },
        confidence: 0.9,
        createdAt: new Date(close.getTime() + 4 * 60000).toISOString(),
      });
    }
  }

  const extra: [number, Entry['kind'], string, Partial<Entry['structured']>][] = [
    [1, 'missed', 'Saw a 3-touch on GBPUSD at 1.2650, didn’t take it — would’ve been +4R. Hesitated after the morning loss.', { symbol: 'GBPUSD', setup: '3-touch', r: 4 }],
    [3, 'reflection', 'Tired, slept badly. Cut size in half and only took A+ setups.', { tags: ['tired', 'A+'] }],
    [6, 'missed', 'Missed the Footprint on XAUUSD, was away from the desk. Would have been +2.5R.', { symbol: 'XAUUSD', setup: 'Footprint', r: 2.5 }],
    [0, 'plan', 'Watching XAUUSD at 2,340 for a footprint entry today. Only if London holds the low.', { symbol: 'XAUUSD', setup: 'Footprint' }],
    [8, 'reflection', 'Good focus all session. Patient, waited for my levels, no early entries.', { tags: ['patient', 'early entry'] }],
  ];
  for (const [ago, kind, text, s] of extra) {
    const at = addDays(today, -ago);
    at.setHours(kind === 'plan' ? 7 : 18, 30);
    if (at > now) at.setTime(now.getTime() - 60 * 60000);
    entries.push({
      id: `demo_x${ago}${kind}`,
      kind,
      text,
      structured: { tags: [], fields: {}, ...s },
      confidence: 0.85,
      createdAt: at.toISOString(),
    });
  }

  return {
    version: 2,
    trades: trades.reverse(),
    entries: entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    playbook: DEMO_PLAYBOOK,
    questions: [],
    reviews: [],
  };
}
