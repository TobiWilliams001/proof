import type { JournalData } from './types';

/**
 * Whether a trader still needs the welcome questions and the tour. Kept on the
 * account, not the device, so a new account on a shared browser still gets
 * both, and a trader on a new phone doesn't see them twice.
 */
export function introState(d: Pick<JournalData, 'intro' | 'profile'>) {
  // Traders from before this was kept on the account answered (or saw) both already.
  const welcomed = !!d.intro?.welcomedAt || !!d.profile;
  return {
    needsWelcome: !welcomed,
    needsTour: !!d.intro?.welcomedAt && !d.intro?.touredAt,
  };
}
