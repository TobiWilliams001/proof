# Proof

The trading journal you'll actually keep. Trades arrive on their own, you say what happened in your own words, then you ask your journal anything, and every answer shows the trades behind it.

Product brief: [docs/PROOF_BRIEF.md](docs/PROOF_BRIEF.md) · Landing copy: [docs/PROOF_COPY.md](docs/PROOF_COPY.md)

## Run it

```bash
npm install
npm run dev        # http://localhost:3000, open /journal and "Explore with a demo journal"
npm test           # unit tests
npm run eval       # extraction + Ask-your-journal evals (prints accuracy)
npm run lint
npm run build
```

> This is Next.js 16, read `AGENTS.md` and `node_modules/next/dist/docs/` before changing framework code.

## Environment (`.env.local`)

| Variable | Needed for | Without it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sign-up, sign-in and saving journals to accounts | The app can't be opened; Get started says sign-up isn't open |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same (the `sb_publishable_…` key; safe in the browser) | Same |
| `SUPABASE_URL` | Server check that API calls come from a signed-in trader (falls back to the public URL) | Uses `NEXT_PUBLIC_SUPABASE_URL` |
| `ANTHROPIC_API_KEY` | AI refinement of note structuring; plain-language playbook import | Local structuring still works; playbook is edited by hand |
| `ANTHROPIC_MODEL` | Override the default model (`claude-haiku-5-5`) | |
| `METAAPI_TOKEN` | Automatic MetaTrader 4/5 import (MetaApi API token) | Settings says automatic import isn't switched on |
| `SYNC_SECRET` | Locks each connected account reference so only Proof's server can use it (32+ random characters) | Automatic import stays off |
| `SYNC_MAX_ACCOUNTS` | Cap on connected MetaApi accounts (default 3); each one costs money at MetaApi | Defaults to 3 |

### Supabase setup (once)

1. SQL editor: run each file in `supabase/migrations/` in order: `0001_accounts.sql` (journals, profiles), `0002_rules.sql` (the trader's rules), `0003_experiments.sql` (experiments, one running at a time), `0004_intro_flags.sql` (whether each trader has seen the welcome and the tour). Every table has row level security.
2. Accounts use email and password. Authentication → Sign In / Providers → Email: turn **Confirm email** off for instant sign-up while testing; with it on, new traders confirm by email link once, then sign in.
3. Authentication → URL Configuration: set the Site URL to your Vercel URL and add it (and `http://localhost:3000/**`) to Redirect URLs.
4. The built-in email sender allows only a few emails an hour. Before real testers, add custom SMTP (for example Resend) under Authentication → SMTP.

## How it's built

| Area | Where | Notes |
|---|---|---|
| Data model | `src/lib/types.ts` | Mirrors brief §7 (trades, entries, playbook, questions, reviews) |
| Storage | `src/lib/storage.ts` | Journal saved to the trader's Supabase account (one JSON document, RLS), cached on the device for offline; journals written before sign-in move in on first sign-in |
| Journal box | `src/components/Composer.tsx` | Type or dictate, structure-or-keep toggle, confirm card, at most one clarifying question |
| Structuring | `src/lib/structure.ts` | Deterministic, offline, only ever maps to the trader's own playbook; LLM output is constrained the same way |
| Ask your journal | `src/lib/ask.ts`, `src/lib/tools.ts` | Question → typed tools (`get_stats`, `group_stats`, `list_trades`, `search_notes`) → answer built only from tool output, with citations |
| Weekly review | `src/lib/review.ts` | Results, R distribution, rule adherence, missed trades, themes in the trader's words |
| Trade sync | `src/lib/sync/adapter.ts` | `TradeSyncAdapter` contract; CSV import (`src/lib/csv.ts`) works today |
| AI provider | `src/lib/ai/provider.ts` | Server-only, swappable; route `src/app/api/structure` exposes typed tasks only |
| Design system | `src/app/globals.css` | Mobile-first tokens, light/dark, validated colour-blind-safe win/loss colours; motion via `motion` |

## Not built yet (from the brief)

cTrader, Bybit and Binance import, and the EA push path for MetaTrader.
