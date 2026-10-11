# Market and sync research

October 2026. Sources: vendor docs, pricing pages, help centres, Trustpilot. Reddit was unreachable, so complaint evidence leans on reviews and help articles. Prices change often; re-check before relying on them.

## What traders actually use

| | Deltalytix | TradesViz | TradeZella |
|---|---|---|---|
| For | Futures and prop traders running many accounts | Data-heavy traders, any asset | Retail and prop day traders who want polish |
| Getting trades in | Direct sync (Rithmic, Tradovate…), file import, AI column mapping | 70+ live connections; MT5 synced on their servers, **manual trigger** | "500+ brokers"; MT4/5 auto-sync **every 3 hours** |
| AI | AI coach over notes | Numbers computed deterministically; coach runs fixed checks, ranks by $ impact, shows sample size | Credit-metered AI; one user reports it "contaminated ~200 trades" with no undo |
| Price | Free tier; paid ~$20/mo | Free (stocks only); $15–30/mo | No free tier; $26–99/mo |
| Licence | **CC BY-NC 4.0: study only, not reusable in a paid product** | Proprietary | Proprietary |

## What traders praise
Sync that just works, fast human support, depth for the price, psychology/discipline features, replaying their own trades.

## What they complain about (most to least common)
1. **Wrong numbers.** Dropped closing fills, split or doubled trades, missing fees, wrong currency.
2. **Sync that breaks silently.** Weekly disconnects; credentials accepted that later fail.
3. **Timezones.** Trades on the wrong day; fixed by "delete and re-import".
4. **Billing traps.** Paywalled basics (even your own notes), no trials, no refunds.
5. **Slow support while data is wrong.**
6. **Bloated, buggy interfaces.** "Far too many options."
7. **AI that damages data or is generic.** No independent accuracy testing anywhere.
8. **Manual entry is too much work; weak mobile.**

## How MT4/MT5 sync really works

| Method | Credentials | Live? | Cost | Gotchas |
|---|---|---|---|---|
| MetaApi (cloud terminal) | Investor (read-only) password | Yes | ~$30/mo + usage; 6-hour minimum each time an account starts | Mixed reliability reviews; MetaQuotes terminal restrictions have broken cloud connections |
| Expert Advisor in the trader's terminal | None shared | Real-time | Free to build | Best data (original SL/TP, comments); terminal must stay open; URL allow-list setup |
| HTML/CSV statement export | None | No | Free | Manual; "All history" + English report; broker server time |
| Official MetaQuotes API | Broker-side only |, |, | No consumer read-only API exists |

**Data rules that matter:** one MT5 position can be many deals, so key on (account, position id) and keep every deal id. MT4 partial closes create a new ticket ("from #…"). Server time is broker time (often GMT+2/+3, shifting with US DST), so detect the offset per server. **R needs the original stop**, which history often doesn't keep, so capture it when the position is first seen.

**Other platforms:** cTrader Open API is free and official, but Spotware reviews every app first with no stated timeline, so apply early. Binance needs a symbol per call, 24h windows for spot, and futures history only ~3 months back (older history needs CSV). Bybit returns 200 rows per page in windows of up to 7 days.

## Dead ends to avoid
Feature sprawl (hundreds of charts, replay, courses). AI writing over trade data without undo. Credit-metered AI and paywalled basics. Accepting credentials without checking them. Hidden "manual sync". Timezone as one global setting. Building on non-commercial or copyleft journal code. Relying on a single MT bridge vendor.

## What Proof does with this

**Already true in the product**
- Numbers are computed, never generated. Every answer and weekly claim shows the trades or notes behind it.
- Answers on small samples say so ("only 3 trades, a hint, not a pattern").
- AI only suggests. Structuring goes through the confirm card; nothing overwrites trade data.
- Platform position ids are stored and used for de-duplication; re-imports never double-count.
- A note written before its trade arrives links itself when the trade lands, but only when exactly one trade fits.
- The plan is captured when a position opens; R is computed from the stop, never guessed.
- Full export and delete, free; the trader's own notes are never paywalled.

**Built into the sync contract** (`src/lib/sync/adapter.ts`), for when live sync is built
- Verify credentials at connect.
- Capture open positions with their original stop.
- One position = one trade; keep every deal id.
- Convert timestamps to UTC using the detected server offset.
- Include fees and swap so numbers reconcile with the platform.
- Report sync health, shown to the trader, never hidden.

**Next, when sync is built**
1. Sync health on screen ("synced 2 min ago"; a clear banner with the fix when broken).
2. Reconciliation: compare Proof's period P&L with the platform's and flag any gap.
3. MT4/MT5 behind the adapter with two paths: MetaApi (investor password, short deploy windows) and an open-source EA push; statement import stays as the safety net. Confirm MetaApi's commercial terms first.
4. cTrader as the first live adapter. Apply to Spotware now.
5. Paged, rate-limited Binance/Bybit backfill plus CSV for older history; tell traders plainly how far back the API goes.
6. Duplicate-detection and DST-week cases added to the evals.

## What we learned from each reference project

We studied these to understand them, not to reuse their code.

**Deltalytix** (non-commercial licence, study only). Turns broker fills into trades with a first-in, first-out queue per instrument, which is sound, but it saves one row per matched piece, so one position closed in three parts becomes three trades and inflates the win rate. Duplicates are found by hashing the trade's contents, which broke again and again (corrections, the same fill arriving two ways). Its AI tools and its screens calculate win rate and profit factor separately and can disagree. It keeps no stop, so it has no R. **Proof:** one position is one trade; identity comes from the platform's own position number; one calculation path for screens, answers and the weekly note; the original stop is kept.

**TradePad**. Lets an AI assistant read and write the journal, which is a good idea, but its assistant endpoints have no sign-in and allow writes and deletes. Its R returns 0 instead of "unknown" on bad input, and days are counted in UTC rather than the trader's time. **Proof:** if we add an assistant connection, it will be read-only, signed in, and built on the same tools as Ask; R is never guessed.

**TradeNote** (GPL, study only). Keeps executions as the source of truth and shows gross and net side by side, both good. But it groups by "flat to flat" without handling a reversal, counts breakeven as a win, assumes US dollars, and rejects a whole day on re-import if anything from that day exists. **Proof:** reversals split into two trades, breakeven is its own count, duplicates are caught per position.

**MetaApi and MetaTrader**. Deals carry a UTC time as well as broker time, so time zones are handled. An MT5 opening deal carries the stop of the order that opened it (the original stop); MT4 only reports the latest stop, so for MT4 Proof trusts only the stop it saw when the position first appeared. One position can have many deals; a partial close is extra closing deals; a reversal closes one side and opens the other. MetaApi's free tier can't be used by an app serving other people, so Proof pays per connected account. **Proof:** all of the above is in `src/lib/sync/mt-map.ts`, with tests for partial closes, reversals, fees, swap and stops.

**Open-source sync EAs** (studied for the future push path). The good ones queue events, send them in batches, retry until accepted, and use the deal number to avoid duplicates. Common mistakes: sending broker time as if it were UTC, losing the open price on later partial closes, and no queue that survives a restart.
