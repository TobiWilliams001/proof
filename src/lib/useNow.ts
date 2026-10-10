'use client';

import { useEffect, useState } from 'react';

/**
 * A render-safe "now" that ticks every minute, so time windows like
 * "closed in the last 3 days" stay fresh without impure renders.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
