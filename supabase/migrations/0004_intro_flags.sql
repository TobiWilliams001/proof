-- Whether each trader has been through the welcome questions and the tour.
-- On the account, so a new device or "delete everything" never shows them again,
-- and the team can see how many finish them.

alter table public.profiles add column if not exists onboarded boolean not null default false;
alter table public.profiles add column if not exists onboarded_at timestamptz;
alter table public.profiles add column if not exists toured boolean not null default false;
alter table public.profiles add column if not exists toured_at timestamptz;

-- Traders who already answered went through both before this existed.
update public.profiles
set onboarded = true, onboarded_at = coalesce(onboarded_at, answered_at),
    toured = true, toured_at = coalesce(toured_at, answered_at)
where answered_at is not null and onboarded = false;
