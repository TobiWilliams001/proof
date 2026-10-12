import { AppShell } from '@/components/AppShell';
import { SignedIn } from '@/components/SignedIn';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SignedIn>
      <AppShell>{children}</AppShell>
    </SignedIn>
  );
}
