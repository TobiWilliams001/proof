'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during prerender and hydration, true after. Pages are statically built,
 * so anything that reads "today" must wait for this or it will show the build date.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
