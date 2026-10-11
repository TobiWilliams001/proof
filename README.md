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
| `GEMINI_API_KEY` | AI refinement of note structuring; plain-language playbook import | Local structuring still works; playbook is edited by hand |
| `GEMINI_MODEL` | Override the default model (`gemini-3.8-flash`) |, |
| `METAAPI_TOKEN` | Automatic MetaTrader 4/5 import (MetaApi API token) | Settings says automatic import isn't switched on |
| `SYNC_SECRET` | Locks each connected account reference so only Proof's server can use it (32+ random characters) | Automatic import stays off |
| `SYNC_MAX_ACCOUNTS` | Cap on connected accounts while there's no sign-in (default 3); each one costs money at MetaApi | Defaults to 3 |
| `ONBOARDING_WEBHOOK_URL` | Where welcome answers go (a sheet or form service), so you can see who your traders are. Only the answers, no trades or notes | Answers stay on the device |
| `WAITLIST_WEBHOOK_URL` | Landing-page waitlist (forwards `{ email }` as JSON) | Form says the waitlist isn't open yet |

## How it's built

| Area | Where | Notes |
|---|---|---|
| Data model | `src/lib/types.ts` | Mirrors brief §7 (trades, entries, playbook, questions, reviews) |
| Storage | `src/lib/storage.ts` | Async `StorageProvider`; localStorage today, Supabase + RLS next. Migrates old Edgelog data |
| Journal box | `src/components/Composer.tsx` | Type or dictate, structure-or-keep toggle, confirm card, at most one clarifying question |
| Structuring | `src/lib/structure.ts` | Deterministic, offline, only ever maps to the trader's own playbook; LLM output is constrained the same way |
| Ask your journal | `src/lib/ask.ts`, `src/lib/tools.ts` | Question → typed tools (`get_stats`, `group_stats`, `list_trades`, `search_notes`) → answer built only from tool output, with citations |
| Weekly review | `src/lib/review.ts` | Results, R distribution, rule adherence, missed trades, themes in the trader's words |
| Trade sync | `src/lib/sync/adapter.ts` | `TradeSyncAdapter` contract; CSV import (`src/lib/csv.ts`) works today |
| AI provider | `src/lib/ai/provider.ts` | Server-only, swappable; route `src/app/api/structure` exposes typed tasks only |
| Design system | `src/app/globals.css` | Mobile-first tokens, light/dark, validated colour-blind-safe win/loss colours; motion via `motion` |

## Not built yet (from the brief)

Sign-in and a database (Supabase), cTrader, Bybit and Binance import, and the EA push path for MetaTrader.
