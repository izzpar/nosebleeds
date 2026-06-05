-- ============================================================================
-- Fantasy World Cup — COMPLETE schema. Run this once in Supabase → SQL Editor.
-- Idempotent and safe to re-run (it only adds what's missing). This supersedes
-- running the individual worldcup_*.sql files — it includes all of them.
-- The "destructive operations" warning is just the DROP POLICY lines; safe.
-- ============================================================================

-- ---- Draft leagues (team + player snake drafts) ----------------------------
create table if not exists public.wc_leagues (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  invite_code     text not null unique,
  commissioner_id uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'lobby',
  pick_seconds    int  not null default 90,
  scoring         jsonb not null default
    '{"win":3,"draw":1,"goal":1,"clean_sheet":2,"r16":4,"qf":8,"sf":12,"final":16,"champion":25}'::jsonb,
  format          text not null default 'team',   -- 'team' | 'player'
  squad_size      int  not null default 15,
  created_at      timestamptz not null default now()
);

create table if not exists public.wc_members (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.wc_leagues(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  handle        text,
  display_name  text,
  draft_position int,
  created_at    timestamptz not null default now(),
  unique (league_id, user_id)
);

create table if not exists public.wc_picks (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.wc_leagues(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  team_id     text,
  team_abbr   text,
  team_name   text,
  player_id   text,
  player_name text,
  position    text,
  pick_number int  not null,
  created_at  timestamptz not null default now(),
  unique (league_id, team_id),
  unique (league_id, pick_number)
);
create unique index if not exists wc_picks_league_player_uq
  on public.wc_picks(league_id, player_id) where player_id is not null;
create index if not exists wc_members_league_idx on public.wc_members(league_id);
create index if not exists wc_picks_league_idx   on public.wc_picks(league_id);

-- Backfill columns if the tables pre-date the player-draft / format changes.
alter table public.wc_leagues add column if not exists format     text not null default 'team';
alter table public.wc_leagues add column if not exists squad_size int  not null default 15;
alter table public.wc_leagues add column if not exists draft_type   text not null default 'snake';
alter table public.wc_leagues add column if not exists budget       int  not null default 200;
alter table public.wc_leagues add column if not exists max_managers int  not null default 8;
alter table public.wc_picks   add column if not exists player_id   text;
alter table public.wc_picks   add column if not exists player_name text;
alter table public.wc_picks   add column if not exists position    text;
alter table public.wc_picks   add column if not exists price       int  not null default 0;

-- Live auction lot state (one row per league).
create table if not exists public.wc_auction (
  league_id        uuid primary key references public.wc_leagues(id) on delete cascade,
  nominator_pos    int not null default 0,
  item_id          text,
  item_kind        text,
  item_name        text,
  item_team        text,
  item_position    text,
  high_bid         int default 0,
  high_bidder      uuid,
  high_bidder_name text,
  ends_at          timestamptz,
  updated_at       timestamptz not null default now()
);

-- ---- Power Ranking (1–48) --------------------------------------------------
create table if not exists public.wc_rankings (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  handle       text,
  display_name text,
  ranking      jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now()
);

-- ---- Live player scoring store (written by /api/wc-score cron) --------------
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

-- ---- Salary-cap (FPL-style) entries ----------------------------------------
create table if not exists public.wc_fantasy_entries (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  handle       text,
  display_name text,
  squad        jsonb not null default '[]'::jsonb,
  starters     jsonb not null default '[]'::jsonb,
  bench        jsonb not null default '[]'::jsonb,
  captain      text,
  spent        numeric not null default 0,
  updated_at   timestamptz not null default now()
);
alter table public.wc_fantasy_entries add column if not exists bench jsonb not null default '[]'::jsonb;

-- ---- Mini-leagues (groups) for the public games ----------------------------
create table if not exists public.wc_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null, invite_code text not null unique,
  game text not null, creator_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.wc_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.wc_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  handle text, display_name text, created_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists wc_group_members_group_idx on public.wc_group_members(group_id);

-- ---- Row Level Security ----------------------------------------------------
alter table public.wc_leagues         enable row level security;
alter table public.wc_members         enable row level security;
alter table public.wc_picks           enable row level security;
alter table public.wc_rankings        enable row level security;
alter table public.wc_player_points   enable row level security;
alter table public.wc_fantasy_entries enable row level security;
alter table public.wc_auction         enable row level security;
alter table public.wc_groups          enable row level security;
alter table public.wc_group_members   enable row level security;

-- leagues
drop policy if exists wc_leagues_select on public.wc_leagues;
create policy wc_leagues_select on public.wc_leagues for select to authenticated using (true);
drop policy if exists wc_leagues_insert on public.wc_leagues;
create policy wc_leagues_insert on public.wc_leagues for insert to authenticated with check (commissioner_id = auth.uid());
drop policy if exists wc_leagues_update on public.wc_leagues;
create policy wc_leagues_update on public.wc_leagues for update to authenticated using (commissioner_id = auth.uid());
drop policy if exists wc_leagues_delete on public.wc_leagues;
create policy wc_leagues_delete on public.wc_leagues for delete to authenticated using (commissioner_id = auth.uid());

-- members
drop policy if exists wc_members_select on public.wc_members;
create policy wc_members_select on public.wc_members for select to authenticated using (true);
drop policy if exists wc_members_insert on public.wc_members;
create policy wc_members_insert on public.wc_members for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_members_update on public.wc_members;
create policy wc_members_update on public.wc_members for update to authenticated using (
  user_id = auth.uid() or league_id in (select id from public.wc_leagues where commissioner_id = auth.uid()));
drop policy if exists wc_members_delete on public.wc_members;
create policy wc_members_delete on public.wc_members for delete to authenticated using (
  user_id = auth.uid() or league_id in (select id from public.wc_leagues where commissioner_id = auth.uid()));

-- picks
drop policy if exists wc_picks_select on public.wc_picks;
create policy wc_picks_select on public.wc_picks for select to authenticated using (true);
drop policy if exists wc_picks_insert on public.wc_picks;
create policy wc_picks_insert on public.wc_picks for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_picks_delete on public.wc_picks;
create policy wc_picks_delete on public.wc_picks for delete to authenticated using (
  league_id in (select id from public.wc_leagues where commissioner_id = auth.uid()));

-- rankings
drop policy if exists wc_rankings_select on public.wc_rankings;
create policy wc_rankings_select on public.wc_rankings for select to authenticated using (true);
drop policy if exists wc_rankings_insert on public.wc_rankings;
create policy wc_rankings_insert on public.wc_rankings for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_rankings_update on public.wc_rankings;
create policy wc_rankings_update on public.wc_rankings for update to authenticated using (user_id = auth.uid());

-- player points (read-only to clients; cron writes via service role)
drop policy if exists wc_player_points_select on public.wc_player_points;
create policy wc_player_points_select on public.wc_player_points for select to authenticated using (true);

-- fantasy entries
drop policy if exists wc_fantasy_select on public.wc_fantasy_entries;
create policy wc_fantasy_select on public.wc_fantasy_entries for select to authenticated using (true);
drop policy if exists wc_fantasy_insert on public.wc_fantasy_entries;
create policy wc_fantasy_insert on public.wc_fantasy_entries for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_fantasy_update on public.wc_fantasy_entries;
create policy wc_fantasy_update on public.wc_fantasy_entries for update to authenticated using (user_id = auth.uid());

-- auction (members of the league can nominate/bid)
drop policy if exists wc_auction_select on public.wc_auction;
create policy wc_auction_select on public.wc_auction for select to authenticated using (true);
drop policy if exists wc_auction_insert on public.wc_auction;
create policy wc_auction_insert on public.wc_auction for insert to authenticated with check (
  league_id in (select league_id from public.wc_members where user_id = auth.uid()));
drop policy if exists wc_auction_update on public.wc_auction;
create policy wc_auction_update on public.wc_auction for update to authenticated using (
  league_id in (select league_id from public.wc_members where user_id = auth.uid()));

-- groups (mini-leagues)
drop policy if exists wc_groups_select on public.wc_groups;
create policy wc_groups_select on public.wc_groups for select to authenticated using (true);
drop policy if exists wc_groups_insert on public.wc_groups;
create policy wc_groups_insert on public.wc_groups for insert to authenticated with check (creator_id = auth.uid());
drop policy if exists wc_group_members_select on public.wc_group_members;
create policy wc_group_members_select on public.wc_group_members for select to authenticated using (true);
drop policy if exists wc_group_members_insert on public.wc_group_members;
create policy wc_group_members_insert on public.wc_group_members for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_group_members_delete on public.wc_group_members;
create policy wc_group_members_delete on public.wc_group_members for delete to authenticated using (user_id = auth.uid());
