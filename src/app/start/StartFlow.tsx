'use client';

import { ArrowLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { supabase, supabaseConfigured } from '@/lib/supabase/client';
import s from './start.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_AFTER = 60;

/** Where to go after signing in: back to the page that sent them here, or the journal. */
function nextPath() {
  const n = new URLSearchParams(window.location.search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/journal';
}

/** Plain words for what went wrong. Never the service's own message. */
function problemFor(err: { status?: number; code?: string; message?: string } | null, step: 'email' | 'code') {
  if (!err) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'You seem to be offline. Check your connection and try again.';
  if (err.status === 429 || err.code?.includes('rate_limit')) return 'Too many tries in a short time. Wait a minute, then try again.';
  if (step === 'code') return 'That code didn’t work or has expired. Check it, or send a new one.';
  return 'We couldn’t send the code. Check your email address and try again.';
}

/**
 * Sign up and sign in are one flow: email, then the code from the email.
 * A code (not a link) keeps the trader inside the installed app on iPhone.
 */
export function StartFlow() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (ready && session) router.replace(nextPath());
  }, [ready, session, router]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) {
      setProblem('That doesn’t look like an email address.');
      return;
    }
    setBusy(true);
    setProblem(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${nextPath()}` },
    });
    setBusy(false);
    if (error) {
      setProblem(problemFor(error, 'email'));
      return;
    }
    setEmail(address);
    setCode('');
    setStep('code');
    setWait(RESEND_AFTER);
  }

  async function verify(token: string) {
    setBusy(true);
    setProblem(null);
    const { error } = await supabase().auth.verifyOtp({ email, token, type: 'email' });
    if (error) {
      setBusy(false);
      setProblem(problemFor(error, 'code'));
      return;
    }
    // The session listener sends them on; keep the button busy until then.
  }

  const digits = code.replace(/\D/g, '');

  return (
    <div className={s.page}>
      <header className={s.top}>
        <Link href="/" aria-label="Proof home"><Logo size={22} /></Link>
      </header>

      <main className={s.main}>
        <AnimatePresence mode="wait" initial={false}>
          {step === 'email' ? (
            <motion.form
              key="email"
              className={s.card}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) send();
              }}
            >
              <h1 className={s.title}>Get started</h1>
              <p className={s.sub}>Enter your email and we’ll send you a code. No password to remember.</p>
              <label className="field">
                <span className="label">Email</span>
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  enterKeyHint="send"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </label>
              {problem && <p className={s.problem} role="alert">{problem}</p>}
              <button className="btn btn-primary btn-lg btn-block" disabled={busy || !supabaseConfigured}>
                {busy ? 'Sending…' : 'Send code'}
              </button>
              {!supabaseConfigured && <p className={s.note}>Sign-up isn’t open yet.</p>}
              <p className={s.note}>New or returning, it’s the same step. Free during early access.</p>
            </motion.form>
          ) : (
            <motion.form
              key="code"
              className={s.card}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && digits.length >= 6) verify(digits);
              }}
            >
              <button type="button" className={`btn btn-ghost btn-sm ${s.back}`} onClick={() => { setStep('email'); setProblem(null); }}>
                <ArrowLeft size={15} /> Change email
              </button>
              <h1 className={s.title}>Check your email</h1>
              <p className={s.sub}>We sent a code to <strong>{email}</strong>. It can take a minute to arrive.</p>
              <label className="field">
                <span className="label">Code</span>
                <input
                  className={`input num ${s.code}`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  enterKeyHint="go"
                  maxLength={8}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                    setCode(v);
                  }}
                  autoFocus
                  required
                />
              </label>
              {problem && <p className={s.problem} role="alert">{problem}</p>}
              <button className="btn btn-primary btn-lg btn-block" disabled={busy || digits.length < 6}>
                {busy ? 'Signing in…' : 'Continue'}
              </button>
              <p className={s.note}>
                No email? Check spam, or{' '}
                <button type="button" className={s.link} disabled={wait > 0 || busy} onClick={send}>
                  {wait > 0 ? `send a new code in ${wait}s` : 'send a new code'}
                </button>
                .
              </p>
            </motion.form>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
