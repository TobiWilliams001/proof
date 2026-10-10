'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Choice = 'system' | 'light' | 'dark';

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    localStorage.setItem('proof.theme', choice);
  } catch {}
}

export function useThemeChoice(): [Choice, (c: Choice) => void] {
  const [choice, setChoice] = useState<Choice>('dark');
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    // Syncing from the DOM attribute the pre-paint script set.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(t === 'light' || t === 'dark' ? t : 'system');
  }, []);
  return [choice, (c) => (apply(c), setChoice(c))];
}

export function ThemeSwitch() {
  const [choice, set] = useThemeChoice();
  const opts: [Choice, React.ReactNode, string][] = [
    ['dark', <Moon key="d" size={15} />, 'Dark'],
    ['light', <Sun key="l" size={15} />, 'Light'],
    ['system', <Monitor key="s" size={15} />, 'Match device'],
  ];
  return (
    <div className="seg" role="group" aria-label="Theme">
      {opts.map(([c, icon, label]) => (
        <button key={c} aria-pressed={choice === c} onClick={() => set(c)} aria-label={label} title={label}>
          {icon}
        </button>
      ))}
    </div>
  );
}

/** Single-tap toggle for tight spaces (mobile top bar). */
export function ThemeToggle() {
  const [, set] = useThemeChoice();
  const toggle = () => {
    const dark =
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    set(dark ? 'light' : 'dark');
  };
  return (
    <button className="btn btn-ghost btn-icon btn-sm" onClick={toggle} aria-label="Toggle theme">
      <Sun size={17} className="theme-sun" />
      <Moon size={17} className="theme-moon" />
    </button>
  );
}
