-- World Cup match ratings + Star Man (man-of-the-match) voting.
-- One row per user per fixture. Run in the Supabase SQL Editor.

create table if not exists public.wc_match_ratings (
  user_id          uuid not null references auth.users(id) on delete cascade,
  fixture_id       text not null,
  rating           numeric not null,           -- 1..10 entertainment rating
  review           text,
  motm_player_id   text,                        -- your Star Man pick
  motm_player_name text,
  handle           text,
  display_name     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, fixture_id)
);
create index if not exists wc_match_ratings_fixture_idx on public.wc_match_ratings(fixture_id);
alter table public.wc_match_ratings enable row level security;

drop policy if exists wc_mr_select on public.wc_match_ratings;
create policy wc_mr_select on public.wc_match_ratings for select to authenticated using (true);
-- Community ratings are public so logged-out visitors can see them (and get hooked).
drop policy if exists wc_mr_select_anon on public.wc_match_ratings;
create policy wc_mr_select_anon on public.wc_match_ratings for select to anon using (true);
drop policy if exists wc_mr_insert on public.wc_match_ratings;
create policy wc_mr_insert on public.wc_match_ratings for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_mr_update on public.wc_match_ratings;
create policy wc_mr_update on public.wc_match_ratings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists wc_mr_delete on public.wc_match_ratings;
create policy wc_mr_delete on public.wc_match_ratings for delete to authenticated using (user_id = auth.uid());
