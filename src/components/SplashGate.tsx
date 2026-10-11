'use client';

import { useEffect } from 'react';

const HOLD_MS = 1200; // long enough to register the brand, short enough not to wait on
const FADE_MS = 420;

/** Lifts the launch splash (see the inline script in the root layout) after a short hold. */
export function SplashGate() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('splash')) return;
    // Count from when the app started, so a slow load doesn't add extra waiting.
    const wait = Math.max(0, HOLD_MS - performance.now());
    const out = setTimeout(() => root.classList.add('splash-out'), wait);
    const done = setTimeout(() => root.classList.remove('splash', 'splash-out'), wait + FADE_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(done);
    };
  }, []);
  return null;
}
