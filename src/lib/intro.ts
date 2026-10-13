import type { JournalData } from './types';

/** What the account says about the welcome and the tour, from the profiles table. */
export interface IntroFlags {
  onboarded: boolean;
  toured: boolean;
}

/**
 * Whether a trader still needs the welcome questions and the tour. Checked
 * against the account (the profiles table) and the journal's own copy, so it
 * holds on a new device, after "delete everything", and offline. Either
 * saying "done" is enough.
 */
export function introState(d: Pick<JournalData, 'intro' | 'profile'>, flags: IntroFlags | null) {
  const marked = !!flags?.onboarded || !!d.intro?.welcomedAt;
  // Answers saved before these flags existed: the trader went through both back then.
  const fromBefore = !marked && !!d.profile;
  const toured = !!flags?.toured || !!d.intro?.touredAt || fromBefore;
  return { needsWelcome: !marked && !fromBefore, needsTour: marked && !toured };
}
