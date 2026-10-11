'use client';

import { Mic, Square } from 'lucide-react';
import { useCallback, type RefObject } from 'react';
import { useDictation } from '@/lib/speech';
import s from './Voice.module.css';

/**
 * Voice for any text box: dictated words are appended to the value. If the
 * browser can't listen (common on iPhone), the field is focused so the
 * keyboard's own mic is one tap away.
 */
export function useVoice(setValue: (fn: (prev: string) => string) => void, field: RefObject<HTMLTextAreaElement | HTMLInputElement | null>) {
  const append = useCallback(
    (t: string) => setValue((prev) => (prev ? `${prev.trimEnd()} ${t}` : t.charAt(0).toUpperCase() + t.slice(1))),
    [setValue],
  );
  return useDictation(append, { onFallback: () => field.current?.focus() });
}

type Mic = ReturnType<typeof useDictation>;

export function MicButton({ mic, label = 'Talk instead of typing', className = '' }: { mic: Mic; label?: string; className?: string }) {
  if (!mic.supported) return null;
  return (
    <button
      type="button"
      className={`btn btn-icon btn-sm ${mic.listening ? s.on : 'btn-soft'} ${className}`}
      onClick={mic.toggle}
      aria-label={mic.listening ? 'Stop listening' : label}
      aria-pressed={mic.listening}
      title={mic.listening ? 'Stop listening' : label}
    >
      {mic.listening ? <Square size={13} fill="currentColor" /> : <Mic size={16} />}
    </button>
  );
}

export function VoiceHelp({ mic }: { mic: Mic }) {
  if (!mic.error) return null;
  return (
    <p className={s.help} role="status">
      {mic.error}{' '}
      <button type="button" className={s.dismiss} onClick={mic.clearError}>
        Got it
      </button>
    </p>
  );
}
