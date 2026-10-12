-- The trader's own rules (max trades a day, stop after N losses, daily loss
-- limit, no trading in chosen sessions or days). Proof only watches them.

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('maxTrades', 'lossStreak', 'dailyLoss', 'noTrading')),
  params jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists rules_user_id_idx on public.rules (user_id);

alter table public.rules enable row level security;

drop policy if exists "Traders read their own rules" on public.rules;
create policy "Traders read their own rules" on public.rules
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Traders create their own rules" on public.rules;
create policy "Traders create their own rules" on public.rules
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Traders update their own rules" on public.rules;
create policy "Traders update their own rules" on public.rules
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Traders delete their own rules" on public.rules;
create policy "Traders delete their own rules" on public.rules
  for delete to authenticated using ((select auth.uid()) = user_id);
