'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

/** Signed-in traders go straight to their journal; everyone else gets started. */
export function NavCta({ className }: { className: string }) {
  const { session } = useAuth();
  return session ? (
    <Link href="/journal" className={className}>Open Proof</Link>
  ) : (
    <>
      <Link href="/start" className={className} data-variant="quiet">Sign in</Link>
      <Link href="/start" className={className}>Get started</Link>
    </>
  );
}
