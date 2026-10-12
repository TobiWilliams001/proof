import { ArrowRight, Check, Lock, Mic, Plug, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Reveal } from '@/components/motion';
import { ThemeToggle } from '@/components/ThemeSwitch';
import { NavCta } from './NavCta';
import s from './landing.module.css';

// Copy: docs/PROOF_COPY.md (AIDA). Keep the two in sync.

const STEPS = [
  {
    icon: Plug,
    title: 'Connect once.',
    body: 'Link your MetaTrader account once. Your trades, past and future, come in on their own, so there’s no typing entries, stops or results.',
  },
  {
    icon: Mic,
    title: 'Say what happened.',
    body: 'When a trade closes, Proof asks one question: what happened? Type it or speak it, the way you’d tell a friend. Keep it as written, or let Proof organise it around your setups. A few seconds, and it’s done.',
  },
  {
    icon: Sparkles,
    title: 'See where the money goes.',
    body: 'Ask your journal anything, like “Which setup makes me the most?” or “How do I trade after a loss?” You get answers from your own trades, with every trade behind the answer one tap away.',
  },
];

const WINS = [
  ['Find your edge.', 'See which setups, pairs and sessions make you money, so you can do more of what works.'],
  ['Spot the leaks.', 'See the habits quietly costing you: trading after losses, oversizing when confident, entries you take out of boredom. Once you can see them, you can work on them.'],
  ['Trade your plan under pressure.', 'For prop traders, consistency matters most. Proof shows whether you’re actually following your plan, so a bad week doesn’t quietly become a habit.'],
  ['Know where you stand.', 'You open your week already knowing which setup to trust, which to leave alone, and the one small thing worth trying next.'],
];

// Questions, not results: Proof never markets outcomes it hasn't measured for you.
const QUESTIONS = [
  'How do my trades do in the hour after a loss?',
  'Which setup makes me the most?',
  'Do I do better when I follow my plan?',
];

const KINDS = [
  ['missed', 'Missed trades', '“Saw it, didn’t take it. Would’ve been +$400.”'],
  ['rule_break', 'Broken rules', '“Revenge trade after the loss.”'],
  ['plan', 'Plans', '“Watching gold at 2,340 for a footprint entry.”'],
  ['reflection', 'Your state', '“Slept badly. Cut size.”'],
];

const FAQ = [
  ['Do I have to talk to it?', 'No. Type or speak, whatever suits the moment.'],
  ['Does it work with prop-firm accounts?', 'Yes, if your firm uses MetaTrader 4 or 5. Connect with your investor password, the view-only one your firm gives you.'],
  ['Will it tell me how to trade?', 'No. Your strategy stays yours. Proof shows you, with evidence, what’s working in it and what isn’t.'],
  ['Where is my journal stored?', 'In your Proof account, so it’s there on every phone and computer you sign in on. Only you can see it, and you can export or delete it any time.'],
  ['What does it cost?', 'Free during early access.'],
];

export default function Landing() {
  return (
    <div className={s.page}>
      <nav className={s.nav}>
        <div className={s.navInner}>
          <Link href="/" aria-label="Proof home"><Logo size={24} /></Link>
          <div className={s.navLinks}>
            <a href="#how" className={s.navLink}>How it works</a>
            <ThemeToggle />
            <NavCta className={s.navCta} />
          </div>
        </div>
      </nav>

      {/* ATTENTION */}
      <header className={s.hero}>
        <div className={s.heroGlow} aria-hidden />
        <div className={s.wrap}>
          <Reveal y={10}><p className={s.badge}><span className={s.badgeDot} /> Free during early access</p></Reveal>
          <Reveal delay={0.06}>
            <h1 className={s.h1}>
              See what’s really <em>working in your trading.</em>
            </h1>
          </Reveal>
          <Reveal delay={0.14}><p className={s.lede}>
            Proof brings in your trades on its own, lets you note what happened in a few seconds, and shows you, with evidence, where you do well and where you keep slipping.
          </p></Reveal>
          <Reveal delay={0.22} className={s.heroCta}>
            <Link href="/start" className={s.cta}>Get started free <ArrowRight size={16} /></Link>
            <a href="#how" className={s.secondary}>See how it works <ArrowRight size={15} /></a>
          </Reveal>
        </div>

        {/* Product moment: a slice of the app, labelled as an example. */}
        <div className={s.demo} aria-label="Example of Proof in use">
          <Reveal delay={0.3} y={28} className={s.demoCard}>
            <div className={s.demoPrompt}>
              <span className={s.pulse} /> <strong>EURUSD long</strong> closed <span className="pos num">+$240</span>. What happened?
            </div>
            <p className={s.demoNote}>“Clean 3-touch at the value area, entered a bit early, held to target.”</p>
            <div className={s.demoChips}>
              <span className="chip chip-sm chip-on">3-touch</span>
              <span className="chip chip-sm chip-outline">#early entry</span>
              <span className="chip chip-sm chip-outline">value area</span>
              <span className={s.demoSaved}><Check size={13} /> Saved</span>
            </div>
          </Reveal>
          <Reveal delay={0.45} y={28} className={`${s.demoCard} ${s.demoAsk}`}>
            <div className={s.demoQ}>Which setup makes me the most?</div>
            <p className={s.demoA}>
              3-touch makes you the most money. Here are the trades behind it, with how sure that is.
            </p>
            <div className={s.demoFoot}>See the trades ›</div>
          </Reveal>
          <p className={s.demoLabel}>Example from a sample journal</p>
        </div>
      </header>

      {/* INTEREST: why journaling hasn't worked */}
      <section className={s.section}>
        <div className={`${s.wrap} ${s.narrow}`}>
          <Reveal><h2 className={s.h2}>Every trader knows their journal could make them better. Almost none keep one.</h2></Reveal>
          <p className={s.body}>
            Not because you lack discipline. Because the moment a trade closes, when the truth about why you took it is still fresh, the journal asks you to open a form and type numbers your platform already has.
          </p>
          <p className={s.body}>
            So the moment passes. And the mistakes that drain your account stay invisible, repeating quietly week after week.
          </p>
          <p className={s.pull}>Proof removes the work and keeps the truth.</p>
        </div>
      </section>

      {/* INTEREST: how it works */}
      <section className={`${s.section} ${s.tint}`} id="how">
        <div className={s.wrap}>
          <p className={s.kicker}>How it works</p>
          <div className={s.steps}>
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 0.08} className={s.step}>
                <div className={s.stepTop}>
                  <span className={s.stepIcon}><Icon size={18} /></span>
                  <span className={`num ${s.stepNum}`}>0{i + 1}</span>
                </div>
                <h3 className={s.h3}>{title}</h3>
                <p className={s.stepBody}>{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* DESIRE: what changes */}
      <section className={s.section}>
        <div className={s.wrap}>
          <Reveal><h2 className={`${s.h2} ${s.narrowH}`}>Trade with the clarity of someone who knows their numbers.</h2></Reveal>
          <div className={s.wins}>
            {WINS.map(([t, b], i) => (
              <Reveal key={t} delay={(i % 2) * 0.08} className={s.win}>
                <h3 className={s.h3}>{t}</h3>
                <p className={s.stepBody}>{b}</p>
              </Reveal>
            ))}
          </div>

          <Reveal className={s.insights}>
            <p className={s.insightsLabel}>Questions you can ask your journal</p>
            {QUESTIONS.map((q) => (
              <div key={q} className={s.insight}>
                <span>{q}</span>
                <span className="faint">›</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* DESIRE: built around how you trade */}
      <section className={`${s.section} ${s.tint}`}>
        <div className={`${s.wrap} ${s.split}`}>
          <div>
            <Reveal><h2 className={s.h2}>Your system. Not ours.</h2></Reveal>
            <p className={s.body}>
              Describe your playbook in plain words: your setups, your rules, what you care about. Proof organises everything around it. It never tells you how to trade. It shows you how <em>you</em> trade.
            </p>
          </div>
          <Reveal delay={0.1} className={s.playbook}>
            <p className={s.playbookQuote}>“I trade 2-touch and 3-touch continuations at value areas on the 1H…”</p>
            <div className={s.playbookArrow} aria-hidden>↓</div>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <span className="chip chip-on">2-touch</span>
              <span className="chip chip-on">3-touch</span>
              <span className="chip chip-outline">value area</span>
              <span className="chip chip-outline">1H</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* DESIRE: trades you didn't take */}
      <section className={s.section}>
        <div className={s.wrap}>
          <Reveal><h2 className={`${s.h2} ${s.narrowH}`}>The trades you didn’t take matter too.</h2></Reveal>
          <p className={s.body} style={{ maxWidth: '46ch' }}>Log what forms never capture:</p>
          <div className={s.kinds}>
            {KINDS.map(([k, label, quote], i) => (
              <Reveal key={k} delay={i * 0.06} className={s.kind}>
                <span className={`kind kind-${k}`}>{label}</span>
                <p className={s.kindQuote}>{quote}</p>
              </Reveal>
            ))}
          </div>
          <p className={s.pull}>Your discipline is part of your edge. Proof makes it visible.</p>
        </div>
      </section>

      {/* DESIRE: trust + privacy */}
      <section className={`${s.section} ${s.tint}`}>
        <div className={`${s.wrap} ${s.twoCol}`}>
          <div className={s.trust}>
            <Reveal><h2 className={s.h2}>Answers you can trust.</h2></Reveal>
            <p className={s.body}>
              Proof never makes up a number. Every figure is calculated from your actual trades, and every answer shows the trades it came from. If your data can’t answer a question, Proof tells you. And when something looks worth changing, it suggests a small experiment to try, not an order.
            </p>
          </div>
          <div className={s.trust}>
            <Reveal><h2 className={s.h2}><Lock size={22} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 8 }} />Private by default.</h2></Reveal>
            <ul className={s.checks}>
              {[
                'Proof can see your trades. It can never place or change one.',
                'Your login details are locked away. Disconnect any time and they’re deleted.',
                'No voice recordings stored.',
                'Export or delete your data whenever you want.',
              ].map((t) => (
                <li key={t}><Check size={16} /> {t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Works with */}
      <section className={s.works}>
        <div className={s.wrap}>
          <p className={s.kicker}>Works with</p>
          <p className={s.platforms}>MetaTrader 4 · MetaTrader 5</p>
          <p className="faint" style={{ fontSize: 14, marginTop: 8 }}>cTrader, Bybit and Binance are next, in the order traders ask for them.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className={s.section}>
        <div className={`${s.wrap} ${s.narrow}`}>
          <Reveal><h2 className={s.h2}>Questions</h2></Reveal>
          <div className={s.faq}>
            {FAQ.map(([q, a]) => (
              <details key={q} className={s.faqItem}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ACTION */}
      <section className={s.final}>
        <div className={`${s.wrap} ${s.narrow}`}>
          <Reveal><h2 className={s.finalH}>Your trades already hold the answers.</h2></Reveal>
          <p className={s.finalBody}>Connect your account, note what happened, and see what your own trading is telling you.</p>
          <Link href="/start" className={`${s.cta} ${s.ctaInverted}`}>Get started free <ArrowRight size={16} /></Link>
          <p className={s.finalNote}>Free during early access</p>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={`${s.wrap} ${s.footerInner}`}>
          <Logo size={20} />
          <span className="faint">© {new Date().getFullYear()} Proof</span>
        </div>
      </footer>
    </div>
  );
}
