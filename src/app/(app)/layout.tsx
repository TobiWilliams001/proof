import { AppShell } from '@/components/AppShell';
import { JournalProvider } from '@/lib/store';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <JournalProvider>
      <AppShell>{children}</AppShell>
    </JournalProvider>
  );
}
