'use client';

import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
if (typeof window !== 'undefined') {
  // Chrome fires this once, early; keep it so the button can use it later.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    window.dispatchEvent(new Event('proof:installable'));
  });
}

/**
 * Installing Proof to the home screen. Chrome and Android can show the system
 * prompt; iPhone can't, so there we explain the two taps instead.
 */
export function useInstall() {
  const [state, setState] = useState<'installed' | 'prompt' | 'ios' | 'none'>('none');

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const decide = () => setState(standalone ? 'installed' : deferred ? 'prompt' : ios ? 'ios' : 'none');
    // Checking the device after mount; nothing to read during prerender.
    decide();
    window.addEventListener('proof:installable', decide);
    window.addEventListener('appinstalled', decide);
    return () => {
      window.removeEventListener('proof:installable', decide);
      window.removeEventListener('appinstalled', decide);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    setState(outcome === 'accepted' ? 'installed' : 'none');
  }

  return { state, install };
}
