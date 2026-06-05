-- Fantasy World Cup — live player scoring store (written by the /api/wc-score cron).
-- Global per-player cumulative fantasy points; each player league's standings
-- sum its members' drafted players' points from here.

create table if not exists public.wc_player_points (
  player_id   text primary key,
  player_name text,
  team_id     text,
  points      numeric not null default 0,
  matches     int not null default 0,
  goals       int not null default 0,
  assists     int not null default 0,
  minutes     int not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.wc_player_points enable row level security;

-- Readable by everyone (for standings); writes happen via the service-role key
-- in the cron, which bypasses RLS.
drop policy if exists wc_player_points_select on public.wc_player_points;
create policy wc_player_points_select on public.wc_player_points
  for select to authenticated using (true);
