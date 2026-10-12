'use client';

import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';
import s from '../start/start.module.css';

const MIN_PASSWORD = 8;

/** Opened from the reset email: the link signs the trader in, then they choose a new password. */
export function ResetPassword() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    if (password.length < MIN_PASSWORD) return setProblem(`Use at least ${MIN_PASSWORD} characters.`);
    setBusy(true);
    setProblem(null);
    const { error } = await supabase().auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setProblem(
        error.code === 'same_password' ? 'That’s your current password. Choose a different one.' : 'We couldn’t save your new password. Try again.',
      );
    }
    router.replace('/journal');
  }

  return (
    <div className={s.page}>
      <header className={s.top}>
        <Link href="/" aria-label="Proof home"><Logo size={22} /></Link>
      </header>
      <main className={s.main}>
        {!ready ? (
          <p className={s.note}>Loading…</p>
        ) : !session ? (
          <div className={s.card}>
            <h1 className={s.title}>This link has expired</h1>
            <p className={s.sub}>Reset links work once and for a short time. Ask for a new one.</p>
            <Link href="/start?mode=signin" className="btn btn-primary btn-lg btn-block">Back to sign in</Link>
          </div>
        ) : (
          <form
            className={s.card}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) save();
            }}
          >
            <h1 className={s.title}>Choose a new password</h1>
            <p className={s.sub}>For {session.user.email}.</p>
            <div className="field">
              <label className="label" htmlFor="new-password">New password</label>
              <span className={s.passwordWrap}>
                <input
                  id="new-password"
                  className="input"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                <button type="button" className={s.eye} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
              <span className="faint" style={{ fontSize: 12.5 }}>At least {MIN_PASSWORD} characters.</span>
            </div>
            {problem && <p className={s.problem} role="alert">{problem}</p>}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
          </form>
        )}
      </main>
    </div>
  );
}
