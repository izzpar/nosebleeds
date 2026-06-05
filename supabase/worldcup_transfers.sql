-- Fantasy World Cup — transfers & waivers foundation. Run in Supabase SQL Editor.

-- Per-round player points (written by the /api/wc-score cron) — powers
-- per-round snapshot scoring so mid-tournament squad changes are fair.
create table if not exists public.wc_player_round_points (
  player_id text not null,
  round_id  text not null,
  points    numeric not null default 0,
  primary key (player_id, round_id)
);
alter table public.wc_player_round_points enable row level security;
drop policy if exists wc_prp_select on public.wc_player_round_points;
create policy wc_prp_select on public.wc_player_round_points for select to authenticated using (true);

-- Per-round salary-cap lineup snapshots (the open game's transfers).
create table if not exists public.wc_fantasy_lineups (
  user_id    uuid not null references auth.users(id) on delete cascade,
  round_id   text not null,
  squad      jsonb not null default '[]'::jsonb,
  starters   jsonb not null default '[]'::jsonb,
  bench      jsonb not null default '[]'::jsonb,
  captain    text,
  updated_at timestamptz not null default now(),
  primary key (user_id, round_id)
);
alter table public.wc_fantasy_lineups enable row level security;
drop policy if exists wc_fl_select on public.wc_fantasy_lineups;
create policy wc_fl_select on public.wc_fantasy_lineups for select to authenticated using (true);
drop policy if exists wc_fl_insert on public.wc_fantasy_lineups;
create policy wc_fl_insert on public.wc_fantasy_lineups for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_fl_update on public.wc_fantasy_lineups;
create policy wc_fl_update on public.wc_fantasy_lineups for update to authenticated using (user_id = auth.uid());

-- Waiver claims for friend draft leagues (reverse-standings priority,
-- processed at each round lock; a pickup must name a drop).
create table if not exists public.wc_waiver_claims (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references public.wc_leagues(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  add_player_id   text not null,
  add_player_name text,
  add_position    text,
  add_team        text,
  drop_player_id   text not null,
  drop_player_name text,
  round_id  text,
  status    text not null default 'pending',  -- 'pending' | 'won' | 'failed'
  created_at timestamptz not null default now()
);
create index if not exists wc_waiver_league_idx on public.wc_waiver_claims(league_id);
alter table public.wc_waiver_claims enable row level security;
drop policy if exists wc_waiver_select on public.wc_waiver_claims;
create policy wc_waiver_select on public.wc_waiver_claims for select to authenticated using (true);
drop policy if exists wc_waiver_insert on public.wc_waiver_claims;
create policy wc_waiver_insert on public.wc_waiver_claims for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_waiver_delete on public.wc_waiver_claims;
create policy wc_waiver_delete on public.wc_waiver_claims for delete to authenticated using (user_id = auth.uid());
