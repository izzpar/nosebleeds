-- Fantasy World Cup — Power Ranking (1–48) game.
-- Run ONCE in Supabase → SQL Editor (in addition to worldcup_schema.sql).
-- One ranking per user; readable by all (for the global leaderboard).

create table if not exists public.wc_rankings (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  handle       text,
  display_name text,
  ranking      jsonb not null default '[]'::jsonb,  -- array of team ids, best→worst
  updated_at   timestamptz not null default now()
);

alter table public.wc_rankings enable row level security;

drop policy if exists wc_rankings_select on public.wc_rankings;
create policy wc_rankings_select on public.wc_rankings
  for select to authenticated using (true);

drop policy if exists wc_rankings_insert on public.wc_rankings;
create policy wc_rankings_insert on public.wc_rankings
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists wc_rankings_update on public.wc_rankings;
create policy wc_rankings_update on public.wc_rankings
  for update to authenticated using (user_id = auth.uid());
