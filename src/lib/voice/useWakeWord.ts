'use client';

import { useEffect, useState } from 'react';
import { afterWakeWord } from './wake';

export const WAKE_KEY = 'proof.voice.wake';

interface Rec {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

/** Continuous listening works in Chrome on a computer or Android; iPhone's browser doesn't allow it. */
export function wakeSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return !ios && !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

/**
 * Listens for "Hey Proof" only while Proof is open on screen and the trader
 * has turned it on. Nothing is recorded; the browser turns speech into text and
 * everything but the wake word and what follows it is ignored. It steps aside
 * while the talk screen has the microphone.
 */
export function useWakeWord(onWake: (said: string) => void): { listening: boolean } {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(true);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setEnabled(localStorage.getItem(WAKE_KEY) === '1' && wakeSupported());
      } catch {}
    };
    read();
    const onVis = () => setVisible(document.visibilityState === 'visible');
    const onBusy = () => setBusy(true);
    const onFree = () => setBusy(false);
    window.addEventListener('proof:wake-setting', read);
    window.addEventListener('proof:voice', onBusy);
    window.addEventListener('proof:voice-closed', onFree);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('proof:wake-setting', read);
      window.removeEventListener('proof:voice', onBusy);
      window.removeEventListener('proof:voice-closed', onFree);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    if (!enabled || busy || !visible) return;
    const w = window as unknown as Record<string, new () => Rec>;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    let stopped = false;
    let rec: Rec | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const begin = () => {
      if (stopped) return;
      rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = navigator.language || 'en-US';
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (!e.results[i].isFinal) continue;
          const rest = afterWakeWord(e.results[i][0].transcript);
          if (rest == null) continue;
          stopped = true;
          rec?.stop();
          onWake(rest);
          return;
        }
      };
      // Browsers end continuous listening after a while; pick it back up quietly.
      rec.onend = () => {
        setListening(false);
        if (!stopped) timer = setTimeout(begin, 400);
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') stopped = true;
      };
      try {
        rec.start();
        setListening(true);
      } catch {
        timer = setTimeout(begin, 1000);
      }
    };
    begin();
    return () => {
      stopped = true;
      clearTimeout(timer);
      try {
        rec?.stop();
      } catch {}
      setListening(false);
    };
  }, [enabled, busy, visible, onWake]);

  return { listening };
}
