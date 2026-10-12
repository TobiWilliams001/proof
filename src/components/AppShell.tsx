'use client';

import { BarChart3, BookOpen, CalendarCheck, Calculator, Layers, MessageCircleQuestion, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useJournal } from '@/lib/store';
import { NEEDS_ACTION, SYNC_PROBLEM } from '@/lib/sync/client';
import { useAutoSync } from '@/lib/sync/useAutoSync';
import { Logo } from './Logo';
import { MotionRoot, SPRING } from './motion';
import { ThemeToggle } from './ThemeSwitch';
import { Onboarding } from './Onboarding';
import { Tour } from './Tour';
import s from './AppShell.module.css';

const PRIMARY = [
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/ask', label: 'Ask', icon: MessageCircleQuestion },
  { href: '/review', label: 'Review', icon: CalendarCheck },
  { href: '/trades', label: 'Trades', icon: BarChart3 },
];
const SECONDARY = [
  { href: '/playbook', label: 'Playbook', icon: Layers },
  { href: '/calculator', label: 'Calculator', icon: Calculator },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data, ready, saveFailed } = useJournal();
  useAutoSync();
  // Only problems the trader must fix get a banner; temporary ones retry quietly.
  const broken = (data.accounts ?? []).find((a) => a.state === 'error' && a.problem && NEEDS_ACTION.has(a.problem));
  const isActive = (href: string) => path === href || path.startsWith(`${href}/`);
  const moreActive = SECONDARY.some((i) => isActive(i.href));

  return (
    <MotionRoot>
    <div className={s.shell}>
      {/* Desktop rail */}
      <aside className={s.rail}>
        <Link href="/journal" className={s.brand} aria-label="Proof home">
          <Logo size={24} />
        </Link>
        <nav className={s.railNav} aria-label="Main">
          {[...PRIMARY, null, ...SECONDARY].map((item) =>
            item === null ? (
              <div key="sep" className={s.railSep} />
            ) : (
              <Link key={item.href} href={item.href} className={s.railItem} aria-current={isActive(item.href) ? 'page' : undefined} data-tour={`nav-${item.label.toLowerCase()}`}>
                {isActive(item.href) && <motion.span layoutId="rail-pill" className={s.railPill} transition={SPRING} />}
                <item.icon size={18} strokeWidth={1.8} /> <span className={s.label}>{item.label}</span>
              </Link>
            ),
          )}
        </nav>
        <div className={s.railFoot}>
          <span className={s.syncDot} data-on={ready && data.trades.length > 0} />
          <span className="faint" style={{ fontSize: 12 }}>
            {ready ? `${data.trades.length} trades · saved to your account` : 'Loading…'}
          </span>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className={s.top}>
        <Link href="/journal" aria-label="Proof home">
          <Logo size={22} />
        </Link>
        <div className="row">
          <ThemeToggle />
          <Link href="/settings" className="btn btn-ghost btn-icon btn-sm" aria-label="Settings">
            <Settings size={17} />
          </Link>
        </div>
      </header>

      <main className={s.main}>
        {broken && !path.startsWith('/settings') && (
          <div className={s.saveBanner} role="alert">
            <strong>We can’t bring in trades from {broken.name}.</strong> {SYNC_PROBLEM[broken.problem!]}{' '}
            <Link href="/settings#accounts">Fix it in Settings</Link>
          </div>
        )}
        {saveFailed && (
          <div className={s.saveBanner} role="alert">
            <strong>Your latest changes aren’t saved to your account yet.</strong>{' '}
            They’re kept on this device and will save when you’re back online.
          </div>
        )}
        {/* Keyed on the route so each screen settles in instead of snapping. */}
        <motion.div key={path} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          {children}
        </motion.div>
      </main>

      <Onboarding />
      <Tour />

      {/* Mobile tab bar */}
      <nav className={s.tabs} aria-label="Main">
        {PRIMARY.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={s.tab} aria-current={isActive(href) ? 'page' : undefined} data-tour={`nav-${label.toLowerCase()}`}>
            {isActive(href) && <motion.span layoutId="tab-pill" className={s.tabPill} transition={SPRING} />}
            <motion.span whileTap={{ scale: 0.88 }} className={s.tabInner}>
              <Icon size={21} strokeWidth={isActive(href) ? 2.1 : 1.7} />
              <span>{label}</span>
            </motion.span>
          </Link>
        ))}
        <Link href="/playbook" className={s.tab} aria-current={moreActive ? 'page' : undefined}>
          {moreActive && <motion.span layoutId="tab-pill" className={s.tabPill} transition={SPRING} />}
          <motion.span whileTap={{ scale: 0.88 }} className={s.tabInner}>
            <Layers size={21} strokeWidth={moreActive ? 2.1 : 1.7} />
            <span>Playbook</span>
          </motion.span>
        </Link>
      </nav>
    </div>
    </MotionRoot>
  );
}
