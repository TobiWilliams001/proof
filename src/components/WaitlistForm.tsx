'use client';

import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import s from './WaitlistForm.module.css';

export function WaitlistForm({ cta = 'Join the waitlist', inverted }: { cta?: string; inverted?: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'closed' | 'error'>('idle');

  if (state === 'done') {
    return (
      <p className={s.done} role="status">
        <Check size={16} /> You’re on the list. We’ll write when your spot opens.
      </p>
    );
  }

  return (
    <div>
      <form
        className={`${s.form} ${inverted ? s.inverted : ''}`}
        onSubmit={async (e) => {
          e.preventDefault();
          setState('busy');
          try {
            const res = await fetch('/api/waitlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            });
            setState(res.ok ? 'done' : res.status === 503 ? 'closed' : 'error');
          } catch {
            setState('error');
          }
        }}
      >
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address"
          className={s.input}
        />
        <button className={s.btn} disabled={state === 'busy'}>
          {state === 'busy' ? 'Joining…' : cta}
          <ArrowRight size={16} />
        </button>
      </form>
      {state === 'closed' && (
        <p className={s.note}>
          The waitlist isn’t open just yet. You can <Link href="/journal">try the early build</Link> right now.
        </p>
      )}
      {state === 'error' && <p className={s.note}>That didn’t go through. Check the address and try again.</p>}
    </div>
  );
}
