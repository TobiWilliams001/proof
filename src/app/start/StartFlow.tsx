'use client';

import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { supabase, supabaseConfigured } from '@/lib/supabase/client';
import s from './start.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

type Mode = 'signup' | 'signin' | 'forgot' | 'check';

/** Where to go after signing in: back to the page that sent them here, or the journal. */
function nextPath() {
  const n = new URLSearchParams(window.location.search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/journal';
}

/** Plain words for what went wrong. Never the service's own message. */
function problemFor(err: { status?: number; code?: string } | null, mode: Mode): string | null {
  if (!err) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'You seem to be offline. Check your connection and try again.';
  if (err.status === 429 || err.code?.includes('rate_limit')) return 'Too many tries in a short time. Wait a minute, then try again.';
  if (err.code === 'user_already_exists' || err.code === 'email_exists') return 'There’s already an account with this email. Sign in instead.';
  if (err.code === 'weak_password') return `Choose a longer password, at least ${MIN_PASSWORD} characters.`;
  if (err.code === 'email_not_confirmed') return 'Confirm your email first. Open the link we sent you, then sign in.';
  if (err.code === 'invalid_credentials' || mode === 'signin') return 'That email or password isn’t right.';
  return 'Something went wrong. Try again in a moment.';
}

/**
 * Create an account or sign in with email and password. Everything happens
 * inside the app, which matters on iPhone, where links open Safari instead.
 */
export function StartFlow() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [checkText, setCheckText] = useState('');

  useEffect(() => {
    if (ready && session) router.replace(nextPath());
  }, [ready, session, router]);

  // Arriving from "Sign in" on the landing page, or from an old link.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // Reading the URL once after mount; it isn't available during prerender.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (q.get('mode') === 'signin') setMode('signin');
    if (q.get('link') === 'expired') {
      setMode('signin');
      setProblem('That link has expired or was already used. Sign in, or ask for a new one.');
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const go = (m: Mode) => {
    setMode(m);
    setProblem(null);
  };

  async function submit() {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) return setProblem('That doesn’t look like an email address.');
    if (mode !== 'forgot' && password.length < (mode === 'signup' ? MIN_PASSWORD : 1)) {
      return setProblem(mode === 'signup' ? `Use at least ${MIN_PASSWORD} characters for your password.` : 'Enter your password.');
    }
    setBusy(true);
    setProblem(null);
    const sb = supabase();

    if (mode === 'signup') {
      const { data, error } = await sb.auth.signUp({
        email: address,
        password,
        options: { emailRedirectTo: `${window.location.origin}/journal` },
      });
      setBusy(false);
      if (error) return setProblem(problemFor(error, mode));
      // With email confirmation on, an existing address comes back with no identities.
      if (data.user && data.user.identities?.length === 0) return setProblem(problemFor({ code: 'user_already_exists' }, mode));
      if (!data.session) {
        setCheckText(`We sent a link to ${address}. Open it to confirm your email, then sign in here.`);
        return go('check');
      }
      return; // Signed in; the session listener sends them on.
    }

    if (mode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({ email: address, password });
      if (error) {
        setBusy(false);
        return setProblem(problemFor(error, mode));
      }
      return;
    }

    // Forgot password: the email link opens the page to choose a new one.
    const { error } = await sb.auth.resetPasswordForEmail(address, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) return setProblem(problemFor(error, mode));
    setCheckText(`If there’s an account for ${address}, we’ve sent a link to choose a new password.`);
    go('check');
  }

  const title = { signup: 'Create your account', signin: 'Welcome back', forgot: 'Reset your password', check: 'Check your email' }[mode];
  const cta = { signup: 'Create account', signin: 'Sign in', forgot: 'Send reset link', check: '' }[mode];
  const busyText = { signup: 'Creating your account…', signin: 'Signing in…', forgot: 'Sending…', check: '' }[mode];

  return (
    <div className={s.page}>
      <header className={s.top}>
        <Link href="/" aria-label="Proof home"><Logo size={22} /></Link>
      </header>

      <main className={s.main}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.form
            key={mode === 'signup' || mode === 'signin' ? 'auth' : mode}
            className={s.card}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) submit();
            }}
          >
            {(mode === 'forgot' || mode === 'check') && (
              <button type="button" className={`btn btn-ghost btn-sm ${s.back}`} onClick={() => go('signin')}>
                <ArrowLeft size={15} /> Back to sign in
              </button>
            )}

            {(mode === 'signup' || mode === 'signin') && (
              <div className="seg" role="tablist" aria-label="Account" style={{ display: 'flex' }}>
                <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => go('signup')} style={{ flex: 1 }}>Create account</button>
                <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => go('signin')} style={{ flex: 1 }}>Sign in</button>
              </div>
            )}

            <h1 className={s.title}>{title}</h1>
            {mode === 'signup' && <p className={s.sub}>Free during early access. Your journal is saved to your account, on every device.</p>}
            {mode === 'forgot' && <p className={s.sub}>Enter your email and we’ll send you a link to choose a new password.</p>}
            {mode === 'check' && <p className={s.sub}>{checkText}</p>}

            {mode !== 'check' && (
              <label className="field">
                <span className="label">Email</span>
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete={mode === 'signup' ? 'email' : 'username'}
                  autoCapitalize="off"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </label>
            )}

            {(mode === 'signup' || mode === 'signin') && (
              <div className="field">
                <span className={s.labelRow}>
                  <label className="label" htmlFor="password">Password</label>
                  {mode === 'signin' && (
                    <button type="button" className={s.link} onClick={() => go('forgot')}>Forgot password?</button>
                  )}
                </span>
                <span className={s.passwordWrap}>
                  <input
                    id="password"
                    className="input"
                    type={show ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    minLength={mode === 'signup' ? MIN_PASSWORD : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className={s.eye} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
                {mode === 'signup' && <span className="faint" style={{ fontSize: 12.5 }}>At least {MIN_PASSWORD} characters.</span>}
              </div>
            )}

            {problem && <p className={s.problem} role="alert">{problem}</p>}

            {mode !== 'check' && (
              <button className="btn btn-primary btn-lg btn-block" disabled={busy || !supabaseConfigured}>
                {busy ? busyText : cta}
              </button>
            )}
            {!supabaseConfigured && <p className={s.note}>Sign-up isn’t open yet.</p>}
          </motion.form>
        </AnimatePresence>
      </main>
    </div>
  );
}
