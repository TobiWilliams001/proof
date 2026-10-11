'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dictation straight into a text box. Uses the browser's speech recognition;
 * nothing is recorded or stored by Proof. On iPhone the browser often refuses
 * before showing any prompt, so we ask for the microphone properly first and,
 * if voice still can't start, fall back to the keyboard's own mic.
 */

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function getCtor(): (new () => Recognition) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => Recognition) | undefined;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isHomeScreenApp(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
}

/** Plain-words help for each way voice can fail, per device. */
function explain(kind: 'blocked' | 'unavailable' | 'network'): string {
  if (kind === 'network') return 'Voice needs an internet connection. You can type instead.';
  if (isIOS()) {
    if (kind === 'blocked') {
      return 'Your iPhone isn’t letting Proof use the microphone. Go to Settings, then Safari, then Microphone, and choose Allow. Or tap the mic on your keyboard to talk.';
    }
    return isHomeScreenApp()
      ? 'Voice works best in Safari. Here, tap the mic on your keyboard to talk.'
      : 'Voice typing is off on this iPhone. Turn on Dictation in Settings, then General, then Keyboard. Then tap the mic on your keyboard to talk.';
  }
  return kind === 'blocked'
    ? 'The microphone is blocked for Proof. Allow it in your browser’s site settings, then try again.'
    : 'Voice isn’t available in this browser. You can type instead.';
}

export function useDictation(onText: (finalText: string) => void, opts: { onFallback?: () => void } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  const fallback = useRef(opts.onFallback);
  useEffect(() => {
    cb.current = onText;
    fallback.current = opts.onFallback;
  }, [onText, opts.onFallback]);

  useEffect(() => {
    // Feature detection has to happen after mount (no window during prerender).
    // On iPhone we always show the mic: if the browser can't listen, the keyboard can.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!getCtor() || isIOS());
    return () => rec.current?.stop();
  }, []);

  const fail = useCallback((kind: 'blocked' | 'unavailable' | 'network') => {
    setListening(false);
    setInterim('');
    setError(explain(kind));
    // Bring up the keyboard so its own mic is one tap away.
    if (isIOS()) fallback.current?.();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const Ctor = getCtor();
    if (!Ctor) return fail('unavailable');

    // Ask for the microphone explicitly: this is what makes iPhone show its prompt.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        return fail((e as DOMException)?.name === 'NotAllowedError' ? 'blocked' : 'unavailable');
      }
    }

    const r = new Ctor();
    // iPhone handles one phrase at a time far more reliably than continuous mode.
    r.continuous = !isIOS();
    r.interimResults = true;
    r.lang = navigator.language || 'en-US';
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) cb.current(res[0].transcript.trim());
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed') fail('blocked');
      else if (e.error === 'network') fail('network');
      else fail('unavailable');
    };
    r.onend = () => {
      setListening(false);
      setInterim('');
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      fail('unavailable');
    }
  }, [fail]);

  const stop = useCallback(() => rec.current?.stop(), []);

  return { supported, listening, interim, error, start, stop, toggle: listening ? stop : start, clearError: () => setError(null) };
}
