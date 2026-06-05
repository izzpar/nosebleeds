-- Fantasy World Cup — salary-cap (FPL-style) game.
-- One open global game: each user builds a 15-player squad under a budget,
-- picks 11 starters + a captain. Players overlap freely across users.
-- Scored from wc_player_points. Run after worldcup_scoring.sql.

create table if not exists public.wc_fantasy_entries (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  handle       text,
  display_name text,
  squad        jsonb not null default '[]'::jsonb,  -- 15 player ids
  starters     jsonb not null default '[]'::jsonb,  -- 11 player ids (subset of squad)
  captain      text,                                 -- player id (in starters)
  spent        numeric not null default 0,           -- total price of squad
  updated_at   timestamptz not null default now()
);

alter table public.wc_fantasy_entries enable row level security;

drop policy if exists wc_fantasy_select on public.wc_fantasy_entries;
create policy wc_fantasy_select on public.wc_fantasy_entries
  for select to authenticated using (true);

drop policy if exists wc_fantasy_insert on public.wc_fantasy_entries;
create policy wc_fantasy_insert on public.wc_fantasy_entries
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists wc_fantasy_update on public.wc_fantasy_entries;
create policy wc_fantasy_update on public.wc_fantasy_entries
  for update to authenticated using (user_id = auth.uid());
