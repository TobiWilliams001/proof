'use client';

import { Download, Share } from 'lucide-react';
import { useInstall } from '@/lib/useInstall';

/** "Add Proof to your home screen", in whatever way this device allows. */
export function InstallCard({ compact }: { compact?: boolean }) {
  const { state, install } = useInstall();
  if (state === 'installed' || state === 'none') return null;
  return (
    <div className={compact ? '' : 'card'} style={{ display: 'grid', gap: 10 }}>
      <div>
        <strong style={{ display: 'block', fontSize: 15 }}>Put Proof on your home screen</strong>
        <span className="muted" style={{ fontSize: 13.5 }}>Open it in one tap, right after a trade.</span>
      </div>
      {state === 'prompt' ? (
        <button className="btn btn-primary btn-sm" style={{ justifySelf: 'start' }} onClick={install}>
          <Download size={15} /> Install Proof
        </button>
      ) : (
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          In Safari, tap <Share size={14} style={{ display: 'inline', verticalAlign: '-2px' }} aria-label="Share" /> then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </div>
  );
}
