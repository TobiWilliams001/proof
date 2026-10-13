import { describe, expect, it } from 'vitest';
import { afterWakeWord } from './wake';

describe('"Hey Proof"', () => {
  it('hears the wake word and keeps what follows', () => {
    expect(afterWakeWord('hey proof show me my week')).toBe('show me my week');
    expect(afterWakeWord('Okay, Proof. Which setup makes me the most?')).toBe('Which setup makes me the most?');
    expect(afterWakeWord('something something hey proof')).toBe('');
  });
  it('ignores everything else, including the word proof on its own', () => {
    expect(afterWakeWord('I need proof that this works')).toBeNull();
    expect(afterWakeWord('show me my week')).toBeNull();
  });
});
