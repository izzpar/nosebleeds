-- World Cup: pregame hype + per-player ratings (Futez-style).
-- Run in the Supabase SQL Editor (keep RLS enabled).

-- 1) Pregame hype lives on the existing match-ratings row; the entertainment
--    rating is now optional (a pregame row may only have hype).
alter table public.wc_match_ratings add column if not exists hype numeric;
alter table public.wc_match_ratings alter column rating drop not null;

-- 2) Per-player ratings: one row per user per player per fixture.
create table if not exists public.wc_player_ratings (
  user_id      uuid not null references auth.users(id) on delete cascade,
  fixture_id   text not null,
  player_id    text not null,
  player_name  text,
  team_id      text,
  rating       numeric not null,        -- 1..10
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, fixture_id, player_id)
);
create index if not exists wc_player_ratings_fixture_idx on public.wc_player_ratings(fixture_id);
create index if not exists wc_player_ratings_user_idx on public.wc_player_ratings(user_id);
alter table public.wc_player_ratings enable row level security;

drop policy if exists wc_pr_select on public.wc_player_ratings;
create policy wc_pr_select on public.wc_player_ratings for select to authenticated using (true);
drop policy if exists wc_pr_select_anon on public.wc_player_ratings;
create policy wc_pr_select_anon on public.wc_player_ratings for select to anon using (true);
drop policy if exists wc_pr_insert on public.wc_player_ratings;
create policy wc_pr_insert on public.wc_player_ratings for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_pr_update on public.wc_player_ratings;
create policy wc_pr_update on public.wc_player_ratings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists wc_pr_delete on public.wc_player_ratings;
create policy wc_pr_delete on public.wc_player_ratings for delete to authenticated using (user_id = auth.uid());
