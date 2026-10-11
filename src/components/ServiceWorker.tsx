'use client';

import { useEffect } from 'react';

/** Registers the offline worker in production only, in dev it would cache stale bundles. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Offline support is an enhancement; the app works without it.
    });
  }, []);
  return null;
}
