-- Experiments: one behaviour change tried for N trades or N days, compared
-- with the trader's own baseline. Abandoned ones are kept as history.

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  insight_id text,
  hypothesis text not null check (char_length(hypothesis) <= 300),
  behavior_change jsonb not null,
  measure text not null check (measure in ('perTrade', 'winRate')),
  length_kind text not null check (length_kind in ('trades', 'days')),
  length_value integer not null check (length_value between 1 and 365),
  baseline jsonb not null,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  status text not null default 'running' check (status in ('running', 'complete', 'abandoned')),
  result jsonb,
  useful boolean,
  created_at timestamptz not null default now()
);

-- One running experiment at a time (v1): two changes at once can't be told apart.
create unique index if not exists experiments_one_running on public.experiments (user_id) where status = 'running';
create index if not exists experiments_user_id_idx on public.experiments (user_id);

alter table public.experiments enable row level security;

drop policy if exists "Traders read their own experiments" on public.experiments;
create policy "Traders read their own experiments" on public.experiments
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Traders create their own experiments" on public.experiments;
create policy "Traders create their own experiments" on public.experiments
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Traders update their own experiments" on public.experiments;
create policy "Traders update their own experiments" on public.experiments
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- No delete policy: abandoning keeps the history; nothing is deleted.
