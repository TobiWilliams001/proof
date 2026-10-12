-- Proof accounts: one journal per trader, plus their welcome answers.
-- Run once in the Supabase SQL editor (or `supabase db push`).

-- The whole journal as one document. It mirrors the app's JournalData, so the
-- app and the database never drift apart while the shape is still changing.
create table if not exists public.journals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.journals enable row level security;

drop policy if exists "Traders read their own journal" on public.journals;
create policy "Traders read their own journal" on public.journals
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Traders create their own journal" on public.journals;
create policy "Traders create their own journal" on public.journals
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Traders update their own journal" on public.journals;
create policy "Traders update their own journal" on public.journals
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Traders delete their own journal" on public.journals;
create policy "Traders delete their own journal" on public.journals
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Welcome answers, in columns so the team can see who Proof is for.
-- Join with auth.users for the email of traders who said yes to a chat.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  markets text[] not null default '{}',
  account text,
  platform text,
  journal_now text,
  journal_app text check (char_length(journal_app) <= 40),
  goal text,
  chat boolean,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Traders read their own profile" on public.profiles;
create policy "Traders read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Traders create their own profile" on public.profiles;
create policy "Traders create their own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Traders update their own profile" on public.profiles;
create policy "Traders update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
