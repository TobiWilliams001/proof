# Proof — Product Brief

> The trading journal that gets out of your way.
> Your trades sync themselves. You just say what happened. Then you can ask it anything.

---

## 1. The problem (start here, not with code)

Most traders know they should journal. Almost none keep doing it.

Not because they lack discipline — because journaling asks for effort at the worst possible moment. A trade just closed. Emotions are live. The honest truth about *why* you took it and *how* you felt is right there — and the tool asks you to open a form, find fields, and type numbers the platform already knows.

So the moment passes. The honest version gets rationalised or forgotten. Weeks later the journal is empty, and the trader is repeating the same mistakes without seeing them.

Three things are broken in existing journals:

1. **Friction at capture.** Forms, fields, manual numbers.
2. **Rigid structure.** They impose one way of trading instead of fitting the trader's own system.
3. **Dead data.** Even traders who log consistently can't easily get answers out of it. The insight stays buried.

**Proof fixes all three:** numbers arrive on their own, the story is captured in seconds the way you'd tell a friend, and the journal answers questions in plain language.

---

## 2. Who it's for

- Retail and prop-firm traders (FTMO and similar) who know journaling matters but have been defeated by the interface.
- Traders with **any** method. Proof is rule-agnostic: it learns the trader's own playbook; it never imposes one.

---

## 3. Product principles

1. **Friction is the enemy.** Every extra tap, field or screen is a reason to stop journaling. Remove it.
2. **Numbers from the platform. The story from the trader.** Never ask a trader to type what the platform already knows.
3. **Capture first, structure second.** Get the honest words down. Structure is optional and can happen after.
4. **The trader's rules, not ours.** Setups, tags and fields are defined by each trader.
5. **Answers must be true.** The AI never invents a number. Every statistic is computed from data and links back to the trades behind it.
6. **Private by default.** Financial and behavioural data is sensitive. Read-only platform access, encrypted credentials, easy export and delete.
7. **Calm, minimal, fast.** Works well on a phone and on a weak connection. Feels like a quiet notebook, not a dashboard.

---

## 3b. The quality bar

Proof should be a great product regardless of how many people use it. Scale is not the measure; how it feels to use is.

- **Fewer things, done exceptionally.** The core loop — capture, structure, ask, review — must be excellent before anything is added.
- **Fast.** Opening the app to a saved note: under 15 seconds. Every screen feels instant, even on a weak connection.
- **Correct.** Synced trades match the platform exactly. Answers are right and show their sources. Accuracy is measured, not assumed.
- **Reliable.** Nothing a trader writes is ever lost. Sync failures are visible and recoverable, never silent.
- **Calm and crafted.** Thoughtful empty states, clear errors, considered copy, smooth on mobile. No clutter, no dark patterns.
- **Respectful.** Private by default, honest about limits, easy to leave with your data.

### Design and experience standard (the minimum, not the stretch)

Proof should look and feel like a best-in-class 2026 product: modern, clean, sleek, calm. Every screen should communicate one thing clearly.

**Visual system**
- **Design tokens first:** one source of truth for colour, type, spacing, radius and shadow. No one-off values.
- **Dark mode by default** (traders live on dark charts), with an equally polished light mode. Both meet WCAG AA contrast.
- **Restrained palette:** neutral base, one accent colour, and semantic colours for profit/loss that never rely on colour alone (pair with +/−, icons or labels).
- **Typography:** one clean sans-serif, a clear type scale, generous line height, **tabular numerals** for all prices, P&L and R values.
- **Space over borders:** structure comes from spacing and hierarchy, not boxes and lines.
- **Subtle motion:** short, purposeful transitions (state changes, card confirmations). Respect reduced-motion settings.

**Structure and content**
- **One primary action per screen.** On the home screen, that's the journal box.
- **Clear hierarchy:** the most important number or insight is the largest thing on the screen.
- **Plain language everywhere.** No jargon the trader didn't introduce themselves. Copy from `docs/PROOF_COPY.md`.
- **Numbers formatted for traders:** consistent currency, R with one decimal, signed values (+2.4R / −1.0R), relative and absolute time.

**The conversational interface**
- The composer sits where the thumb is (bottom on mobile), always one tap away.
- Structured results appear as a **clean confirm card**, editable inline — never a form.
- The clarifying question is a single line with tap-to-answer chips.
- Answers to questions read like a short, clear message with the supporting trades shown as compact, tappable rows.

**Data visualisation**
- Charts are simple and honest: minimal gridlines, labelled axes, no decorative 3D or gradients that distort.
- Every chart answers one question, stated in its title ("Your R by setup, last 30 days").

**States and polish**
- **Thoughtful empty states** that teach the next step ("Connect an account and your trades will appear here").
- **Skeleton loading,** never blank screens or jumping layouts.
- **Clear, kind errors** that say what happened and what to do next.
- Works beautifully on a phone first, then scales up to desktop.

**Performance and accessibility**
- Fast on a mid-range phone and a weak connection; aim for a strong Lighthouse score on the main screens.
- Keyboard navigable, screen-reader labelled, visible focus states, touch targets at least 44px.

**Design QA before any feature is done:** check dark and light mode, mobile and desktop, empty/loading/error states, keyboard use, and contrast.

**Quality signals to track from day one:** time to journal a trade, 30-day retention (do people keep journaling?), extraction and answer accuracy from the evals, sync reliability, and what the first users say unprompted.

---

## 4. The core experience (v1)

### Onboarding — under 2 minutes
- Sign up.
- **Connect a trading account** (read-only). Past trades sync in automatically.
- Optional: **describe your playbook** in plain words ("I trade 2-touch and 3-touch continuations at value areas on the 1H…"). Proof turns it into setups and tags the trader can edit. Skippable.

### When a trade opens — capture the plan before the outcome
- When sync detects a newly opened position, Proof prompts: *"GBPUSD short opened. What's the plan?"*
- The thinking is captured before the result can colour it. Later, plan and outcome sit side by side.

### After a trade — the key moment
- When a synced trade closes, Proof gently prompts: *"EURUSD long closed +2.4R. What happened?"*
- **One-tap congruence:** "Did you follow your plan?" Yes / No — the single most important discipline metric, captured in a second.
- One text box. The trader **types or dictates** (speech-to-text straight into the box; no separate recording flow).
- A toggle per note: **Structure it** or **Keep it as written**.
  - *Structure it:* AI maps the note to the trader's own setups, tags and fields, links it to the trade, and shows a confirm card. At most **one** clarifying question, only when it genuinely matters ("Was this your RE or RRE?").
  - *Keep it as written:* saved as-is, still searchable and still used when answering questions.

### Notes that aren't trades
The same box handles:
- **Missed trades** — "Saw a 3-touch on GBPUSD at 1.2650, didn't take it, would've been +4R."
- **Rule breaks** — "Took a trade outside my rules, revenge after a loss."
- **Plans** — "Watching XAUUSD at 2,340 for a footprint entry today."
- **Session reflections** — "Tired, slept badly, cut size."

### Ask your journal
Plain-language questions, answered from the trader's own data:
- "What's my win rate on GBPJPY this month?"
- "How do I perform when I log 'tired'?"
- "Which setup makes me the most R?"
- "What do I keep saying about early entries?"

Every answer shows the numbers **and the trades behind them**.

### Weekly review — the AI speaks first
When the trader opens Proof at the start of the week, the review is already there before they do anything — specific to *their* data, in plain language. For example: *"Both losses this week were entered before the structure formed — you noted it yourself after each one. Your early entries are trailing your confirmed entries by 2R on average."* Not generic advice: their own data talking back, with the trades and notes behind every claim.

Auto-drafted from the week's data and notes: results, R distribution, rule adherence, missed and invalid trades, recurring themes in the trader's own words. The trader adds one improvement for next week.

---

## 5. Let the imagination run — beyond v1

Not for v1. Capture these so the architecture doesn't block them:

- **Plan vs. reality, automatically.** Morning plan ("watching GBPUSD at 1.2650 for a 3-touch") is matched to what actually happened — adherence measured without the trader doing anything.
- **Pre-session check-in.** One line on sleep, mood, focus. Proof learns how state affects results.
- **Rule guardrails.** The trader's own limits (daily loss, max trades) tracked live, with a calm nudge before a breach.
- **Prop-firm mode.** Daily/overall drawdown proximity and challenge progress for FTMO-style rules.
- **Chart snapshots.** Attach a screenshot; the note and the chart live together.
- **"Replay my week."** A short narrative of the week in the trader's own words and numbers.
- **Coaching from your own history.** "Your last 6 losses on JPY pairs were all impulsive approaches."
- **Shareable trade cards** and an optional accountability partner.
- **Native mobile app** with lock-screen capture.

---

## 5b. Starting point: Edgelog (this repo)

Proof evolves Edgelog — it does not start from zero. Edgelog (built since April 2026) already has: landing page, dashboard, trade log, CSV import, equity curve, analytics/stats utilities, risk calculator, AI coach and pattern briefs via a server-side `/api/ai` route, a connections screen (MetaApi, cTrader, Bybit, Binance — currently simulated), and a storage abstraction over localStorage.

**Keep and build on:** stats/analytics, equity curve, CSV import, calculator, the server-side AI route pattern, the storage abstraction (swap localStorage → Supabase behind it), the connections UI (make it real via the sync adapters in §8).

**Change:** the form-first `LogTradeModal` becomes the conversational journal box (§4). Manual trade entry stays as a fallback, not the main path.

**Add to sync adapters:** Bybit and Binance read-only API keys (official, free) alongside cTrader and MT4/MT5.

Before changing anything, read the existing code and summarise what's there, what to keep, and what to replace.

---

## 6. v1 scope

**In:**
- Auth, account, playbook (editable setups, tags, custom fields).
- Live trade sync behind a clean adapter interface (see §8).
- Journal box: type or dictate, structure-or-freeform toggle, confirm card, one clarifying question max.
- Notes linked to trades or standalone (missed, rule break, plan, reflection).
- Ask your journal (with linked trades in every answer).
- Weekly review.
- Data export and account deletion.

**Out (for now):** payments, native apps, coaching, prop-firm mode, chart analysis, social features.

---

## 7. Data model (sketch — refine while building)

- `users`
- `trading_accounts` — platform, display name, encrypted read-only credentials, sync status
- `trades` — synced: symbol, direction, open/close times and prices, size, P&L, R if derivable, platform ids
- `playbooks` — per user: `setups`, `tags`, `custom_fields` (name, type, options)
- `entries` — journal notes: `kind` (trade_note | missed | rule_break | plan | reflection), raw text, optional `trade_id`, `structured` (jsonb mapped to the user's playbook), `confidence`, timestamps, embedding for semantic search
- `questions` — Ask-your-journal log: question, tool calls made, answer, cited trade ids (useful for evals and trust)
- `weekly_reviews`

Row-level security on every table. A user can only ever read their own rows.

---

## 8. AI and data design

**Structuring a note**
- Input: the note, the linked trade (if any), and the user's playbook.
- Output: fields that match *that user's* playbook, each with a confidence score.
- Low confidence on an important field → one clarifying question. Otherwise, save.

**Ask your journal — correctness first**
- The model never calculates or recalls numbers itself.
- It answers by calling **safe, typed tools**, for example `get_stats(filters)`, `list_trades(filters)`, `search_notes(query)` — parameterised queries, never raw model-written SQL.
- The database computes; the model explains.
- Every answer cites the trades it used.

**Provider-agnostic**
- Put the LLM behind a small interface so the provider can change (free tier for development; a paid, no-training API before real users' data).
- Speech-to-text uses the browser's Web Speech API and OS dictation — no audio is stored.

**Evals from day one** (live in the repo, runnable with one command)
- ~50 sample notes with expected structured fields → field-extraction accuracy.
- ~50 questions with known correct answers over a fixture dataset → answer accuracy and citation correctness.

**Trade sync adapters**
- One `TradeSyncAdapter` interface: connect, initial import, incremental sync, disconnect.
- First adapters: **cTrader Open API** (official, free), **MT4/MT5** via a read-only sync service (e.g. MetaApi — check current free allowance), and **Bybit / Binance** read-only API keys (official, free). Fallback: file import of platform history exports (Edgelog's CSV import already exists).
- Credentials: read-only only, encrypted at rest, disconnect deletes them.

---

## 9. Stack and constraints

- **Free for the MVP.** Every choice must fit free tiers until real users arrive.
- Next.js app (this repo). **Read `AGENTS.md` first** — this Next.js version has breaking changes; check `node_modules/next/dist/docs/` before writing code.
- Supabase: auth, Postgres, RLS, storage, pgvector.
- Vercel Hobby for hosting (non-commercial; upgrade when charging).
- Installable PWA, mobile-first, works on slow connections.

---

## 10. Engineering standards (non-negotiable)

- **Atomic commits.** One logical change per commit. Never batch unrelated changes. Stage files deliberately — never `git add .` for mixed work.
- **Commit format:** `type: description` (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- **No AI attribution anywhere in git history.** No `Co-Authored-By` lines, no "Generated with" notes, in commits or PR descriptions.
- Tests ship with each feature (unit for logic, integration for sync and AI tools).
- Small, readable modules. Comments explain *why*, not *what*.
- Secrets only in environment variables; never committed.
- Before building any feature: restate the user problem it solves and the acceptance criteria, then build.
- **Understand before you build — don't copy.** Most problems have been met before. Study how proven projects solved them (their data model, edge cases, failure modes, and what their users complain about), then build the right version for Proof in our own code. Known references to study: Deltalytix (Next.js + Supabase journal), Tradepad (Next.js, MCP), TradeNote, the MetaApi SDK and open-source MT4/MT5 sync EAs. Record what was learned and what Proof does differently in `docs/RESEARCH.md`.
- **No copied code.** Learn from other projects; never paste their code into Proof, whatever the licence (several references are non-commercial or copyleft, and Proof will be a paid service). Official SDKs used as dependencies under their licence terms are fine.

---

## 11. Build order

1. Foundations — auth, database schema with RLS, app shell, PWA.
2. Journal box — type/dictate, freeform save, entries list.
3. Playbook — create/edit setups, tags, custom fields; plain-language playbook import.
4. Structuring — structure toggle, confirm card, one clarifying question, extraction evals.
5. Trade sync — adapter interface, cTrader adapter, MT4/MT5 adapter, history import fallback; link notes to trades; post-close prompt.
6. Ask your journal — typed tools, cited answers, Q&A evals.
7. Weekly review.
8. Export, delete, polish, landing page with waitlist.

## Definition of done for v1
A trader can connect an account, see trades appear on their own, journal a closed trade in under 30 seconds by typing or speaking, ask "what's my win rate on my best setup?" and get a correct answer with the trades behind it — and the evals prove the extraction and answers are accurate.
