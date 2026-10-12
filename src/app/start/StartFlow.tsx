'use client';

import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Eye, EyeOff, FlaskConical, Lock, Mail, MailCheck, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeSwitch';
import { useAuth } from '@/lib/auth';
import { supabase, supabaseConfigured } from '@/lib/supabase/client';
import s from './start.module.css';

/** Shown once Google is switched on in Supabase (Authentication → Sign In / Providers). */
const GOOGLE = process.env.NEXT_PUBLIC_AUTH_GOOGLE === '1';

/** Google's mark in its own colours, as its brand guidelines ask. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

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

  /** Google sign-in: one tap, no password. Comes back to the page that sent them here. */
  async function google() {
    setProblem(null);
    setBusy(true);
    const { error } = await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${nextPath()}` },
    });
    // On success the browser leaves for Google; only a failure lands here.
    if (error) {
      setBusy(false);
      setProblem('Google sign-in isn’t available right now. Use your email instead.');
    }
  }

  const title = { signup: 'Create your account', signin: 'Welcome back', forgot: 'Reset your password', check: 'Check your email' }[mode];
  const sub = {
    signup: 'Start your journal in under a minute. Your notes and numbers stay yours.',
    signin: 'Sign in to pick up where you left off.',
    forgot: 'Enter your email and we’ll send you a link to choose a new password.',
    check: checkText,
  }[mode];
  const cta = { signup: 'Create account', signin: 'Sign in', forgot: 'Send reset link', check: '' }[mode];
  const busyText = { signup: 'Creating your account…', signin: 'Signing in…', forgot: 'Sending…', check: '' }[mode];
  const longEnough = password.length >= MIN_PASSWORD;

  return (
    <div className={s.page}>
      <BrandPanel />

      <div className={s.side}>
        <header className={s.top}>
          <Link href="/" aria-label="Proof home" className={s.logo}><Logo size={22} /></Link>
          <ThemeToggle />
        </header>

        <main className={s.main}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.form
              key={mode}
              className={s.card}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) submit();
              }}
            >
              {(mode === 'forgot' || mode === 'check') && (
                <button type="button" className={s.back} onClick={() => go('signin')}>
                  <ArrowLeft size={15} /> Back to sign in
                </button>
              )}

              <div className={s.heading}>
                {mode === 'signup' && <span className={s.badge}><span className={s.badgeDot} /> Free during early access</span>}
                {mode === 'check' && <span className={s.iconBubble}><MailCheck size={22} /></span>}
                <h1 className={s.title}>{title}</h1>
                <p className={s.sub}>{sub}</p>
              </div>

              {GOOGLE && (mode === 'signup' || mode === 'signin') && (
                <>
                  <button type="button" className={s.google} onClick={google} disabled={busy}>
                    <GoogleMark /> Continue with Google
                  </button>
                  <div className={s.or}><span>or with email</span></div>
                </>
              )}

              {mode !== 'check' && (
                <div className={s.field}>
                  <label className={s.label} htmlFor="email">Email</label>
                  <span className={s.inputWrap}>
                    <Mail size={17} className={s.inputIcon} aria-hidden />
                    <input
                      id="email"
                      className={s.input}
                      type="email"
                      inputMode="email"
                      autoComplete={mode === 'signup' ? 'email' : 'username'}
                      autoCapitalize="off"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus={!GOOGLE}
                    />
                  </span>
                </div>
              )}

              {(mode === 'signup' || mode === 'signin') && (
                <div className={s.field}>
                  <span className={s.labelRow}>
                    <label className={s.label} htmlFor="password">Password</label>
                    {mode === 'signin' && (
                      <button type="button" className={s.link} onClick={() => go('forgot')}>Forgot password?</button>
                    )}
                  </span>
                  <span className={s.inputWrap}>
                    <Lock size={17} className={s.inputIcon} aria-hidden />
                    <input
                      id="password"
                      className={s.input}
                      type={show ? 'text' : 'password'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      placeholder={mode === 'signup' ? 'Choose a password' : 'Your password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="button" className={s.eye} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                      {show ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                  {mode === 'signup' && (
                    <span className={s.rule} data-ok={longEnough || undefined}>
                      <Check size={13} aria-hidden /> At least {MIN_PASSWORD} characters
                    </span>
                  )}
                </div>
              )}

              {problem && (
                <p className={s.problem} role="alert">
                  <AlertCircle size={15} aria-hidden /> {problem}
                </p>
              )}

              {mode !== 'check' && (
                <button className={`btn btn-primary btn-lg btn-block ${s.cta}`} disabled={busy || !supabaseConfigured}>
                  {busy ? busyText : <>{cta} <ArrowRight size={16} /></>}
                </button>
              )}
              {!supabaseConfigured && <p className={s.note}>Sign-up isn’t open yet.</p>}

              {mode === 'signup' && (
                <p className={s.switch}>
                  Already have an account? <button type="button" className={s.link} onClick={() => go('signin')}>Sign in</button>
                </p>
              )}
              {mode === 'signin' && (
                <p className={s.switch}>
                  New to Proof? <button type="button" className={s.link} onClick={() => go('signup')}>Create an account</button>
                </p>
              )}
            </motion.form>
          </AnimatePresence>
        </main>

        <footer className={s.trust}>
          <ShieldCheck size={14} aria-hidden /> Private by default. Proof never places a trade.
        </footer>
      </div>
    </div>
  );
}

/** The other half on larger screens: what Proof does, shown rather than told. */
function BrandPanel() {
  const cards = [
    { icon: <ShieldCheck size={16} />, title: 'That’s your 2 trades for today.', sub: 'Your rule: Max 2 trades a day.' },
    { icon: <FlaskConical size={16} />, title: 'Skip Footprint · 6 of 10 trades', sub: 'Proof tracks your experiment for you.' },
    { icon: <CheckCircle2 size={16} />, title: 'Up to date · matches MetaTrader', sub: 'Every number checked against your platform.' },
  ];
  return (
    <aside className={s.brand} aria-hidden>
      <div className={s.brandGlow} />
      <Logo size={24} />
      <div className={s.brandBody}>
        <h2 className={s.brandTitle}>See what’s really <em>working in your trading.</em></h2>
        <div className={s.brandCards}>
          {cards.map((c, i) => (
            <motion.div
              key={c.title}
              className={s.brandCard}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.12, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <span className={s.brandIcon}>{c.icon}</span>
              <span>
                <strong>{c.title}</strong>
                <span>{c.sub}</span>
              </span>
            </motion.div>
          ))}
        </div>
      </div>
      <p className={s.brandFoot}>The trading journal you’ll keep.</p>
    </aside>
  );
}
