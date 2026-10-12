# Proof — The Agent Journal (spec)

> Proof doesn't just answer. It watches your own rules, runs your experiments, and keeps your data honest — then tells you only what you need to know.

Branch: `feat/agent-journal`

---

## Principles (read first)

1. **About the trader, never the market.** Charts, prices and market alerts belong to TradingView and MetaTrader. Drawdown dashboards belong to prop firms. Proof only acts on the trader's own behaviour, rules and evidence.
2. **Doing, not just text.** Each job watches, decides from computed facts, acts, and follows up over time.
3. **The system decides, the AI phrases.** Every rule check, experiment result and data check is deterministic code over the trader's data. AI is only used to turn plain words into a rule (with confirmation) and to phrase messages.
4. **Ask before changing anything.** The agent never edits trades, notes or the playbook without the trader confirming. It never places, changes or closes trades, and never gives signals.
5. **Rare and calm.** At most one message per rule per day; nothing during a losing streak that reads as judgement. If in doubt, stay quiet.
6. **Minimal.** Three jobs. Nothing else in this branch.

---

## Job 1 — Watch the trader's own rules

**The problem.** Traders write rules ("max 2 trades a day", "stop after 2 losses") and break them in the moment, usually when it costs the most. Nothing outside their own discipline holds them to the rules they set.

**What it does.**
- The trader adds personal rules, from templates or in plain words (AI turns words into a rule; the trader confirms):
  - Max trades per day
  - Stop after N losses in a row (per day)
  - Personal daily loss limit (money or R)
  - No trading in a chosen session or on chosen days
- On every synced trade open or close, the rules engine checks the day so far.
- **Approaching a limit** (e.g. one trade left, or 80% of the daily loss): one calm in-app notice (push notification if available).
- **A rule broken:** a calm notice, and a draft "rule break" journal entry for the trader to confirm or dismiss.
- Daily summary in the weekly review: rules kept vs broken.

**Out of scope.** Prop-firm limits and dashboards, blocking trades, anything market-related.

**Data.** `rules` table: `id, user_id, kind, params (jsonb), active, created_at` — row level security.

**Acceptance criteria.**
- A trader can create, edit, pause and delete a rule; plain-words rules are always confirmed before saving.
- After the 2nd trade of the day with a "max 2 trades" rule, the trader sees "That's your 2 trades for today" once — not again that day.
- Breaking a rule creates a draft rule-break entry, never a saved one.
- The engine is pure, deterministic and fully unit-tested, including day boundaries in the trader's time zone and trades spanning midnight.

---

## Job 2 — Run experiments

**The problem.** Proof already suggests experiments ("take no reversals for the next 10 trades"), but suggestions are forgotten. Without tracking, the trader never learns whether the change helped.

**What it does.**
- **Start:** from a suggestion or manually — hypothesis, the behaviour change, the measure, and the length (N trades or a date range). Baseline is computed automatically from the previous comparable trades.
- **Run:** every new trade is matched to the experiment. Trades that go against the change (e.g. a reversal taken during "no reversals") are counted as breaks, not silently included.
- **Check in:** a quiet progress line in the app ("6 of 10 trades").
- **Finish:** a short report — before vs after on the chosen measure, sample sizes, adherence, and Proof's confidence language (observation / possible pattern / consistent pattern / not enough evidence yet). The trader marks it useful or not, and can keep or drop the change.

**Data.** `experiments` table (as in the MVP spec): `id, user_id, insight_id, hypothesis, behavior_change, measure, length_kind, length_value, baseline (jsonb), start_at, end_at, status (running | complete | abandoned), result (jsonb), useful (bool)` — row level security.

**Acceptance criteria.**
- One running experiment at a time in v1.
- The baseline and result are computed by the same calculation path as the rest of Proof's numbers.
- Small samples are reported as small; no result claims cause and effect.
- Abandoning keeps the history; nothing is deleted.
- Unit tests for matching, breaks, baseline and result; one end-to-end test from suggestion to report.

---

## Job 3 — Keep the data honest

**The problem.** The most common complaint about trading journals is wrong numbers: missing or doubled trades, missing fees, broken sync nobody noticed. If the trader can't trust the data, nothing else in Proof matters.

**What it does.**
- After each sync, compare Proof with the platform for the same period, where the platform provides totals: trade count, net P&L including fees and swap.
- Check for duplicates (same platform position number), trades with no original stop, and gaps in history.
- **All good:** the existing status line becomes "Up to date · matches MetaTrader".
- **Something off:** one clear banner saying what's wrong and the fix (e.g. "2 trades from last week are missing — re-import?"). Fixes run only after the trader confirms.
- Sync that has failed is always shown, never hidden.

**Out of scope.** Automatic fixes without confirmation.

**Acceptance criteria.**
- A deliberately duplicated position is detected and offered for merge, never merged automatically.
- A P&L mismatch larger than one cent is flagged with the difference shown.
- Time-zone and partial-close cases from `docs/RESEARCH.md` are covered by tests.

---

## Engineering standards

- Atomic commits, `type: description`, one logical change each. **No AI attribution** in commits or PRs.
- Rules engine, experiment matching and data checks are deterministic and unit-tested; AI paths get evals (rule parsing accuracy, message correctness).
- Supabase migrations with row level security for every new table.
- Follow `docs/PROOF_BRIEF.md` (design standard, quality bar) and `docs/PROOF_COPY.md` (desire-first, calm voice).

## Build order

1. Rules: table, engine, tests.
2. Rules: create/edit UI (templates, then plain words with confirm).
3. Rules: notices and draft rule-break entries.
4. Experiments: table, start flow, baseline.
5. Experiments: matching, breaks, progress, finish report.
6. Data check: duplicate and gap detection.
7. Data check: reconciliation with platform totals, status line and banner.
8. Weekly review: add rules kept/broken and experiment status.

## Definition of done

A trader sets "max 2 trades a day", trades from their phone while MetaTrader syncs, gets one calm notice at the limit and a draft entry if they break it; runs a 10-trade experiment that Proof tracks and reports on honestly; and sees "matches MetaTrader" — or a clear banner with a fix — after every sync.
