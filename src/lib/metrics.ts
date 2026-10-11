/**
 * Quality signals from brief §3b, kept on the device. "Time to journal a
 * trade" is measured from the first keystroke (or the prompt opening) to save.
 */

const KEY = 'proof.metrics.journalTime';
const MAX = 200;

interface Sample {
  at: string;
  seconds: number;
}

function read(): Sample[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function recordJournalTime(seconds: number) {
  // Ignore notes drafted over a long gap, they measure the trader's day, not the tool.
  if (!(seconds > 0) || seconds > 15 * 60) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...read(), { at: new Date().toISOString(), seconds: Math.round(seconds) }].slice(-MAX)));
  } catch {}
}

/** Median of the last 20 notes, the median ignores the odd distracted one. */
export function typicalJournalTime(): { seconds: number; samples: number } | null {
  const recent = read().slice(-20).map((s) => s.seconds).sort((a, b) => a - b);
  if (recent.length < 3) return null;
  const mid = Math.floor(recent.length / 2);
  const seconds = recent.length % 2 ? recent[mid] : Math.round((recent[mid - 1] + recent[mid]) / 2);
  return { seconds, samples: recent.length };
}
