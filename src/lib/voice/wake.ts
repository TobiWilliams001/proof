/** Finds "Hey Proof" (or "OK Proof") in what was heard, and returns whatever was said after it. */
export function afterWakeWord(heard: string): string | null {
  const m = heard.match(/\b(?:hey|hi|ok|okay)[,\s]+proof\b[,.!?]?\s*(.*)$/i);
  return m ? m[1].trim() : null;
}
