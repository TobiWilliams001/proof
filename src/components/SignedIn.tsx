'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { RulesProvider } from '@/lib/rules/useRules';
import { JournalProvider } from '@/lib/store';

/** The app is for signed-in traders; everyone else goes to Get started. */
export function SignedIn({ children }: { children: React.ReactNode }) {
  const { ready, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || session) return;
    // A sign-in link that expired comes back with an error in the address.
    const expired = /error_code=otp_expired|error=access_denied/.test(window.location.hash + window.location.search);
    router.replace(`/start?next=${encodeURIComponent(window.location.pathname)}${expired ? '&link=expired' : ''}`);
  }, [ready, session, router]);

  if (!ready || !session) {
    return (
      <div className="page" aria-busy="true" style={{ display: 'grid', placeItems: 'center', minHeight: '60dvh' }}>
        <span className="faint">Loading…</span>
      </div>
    );
  }
  // Keyed on the trader, so switching accounts never shows the last person's journal.
  return (
    <JournalProvider key={session.user.id} userId={session.user.id}>
      <RulesProvider userId={session.user.id}>{children}</RulesProvider>
    </JournalProvider>
  );
}
