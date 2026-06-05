-- Fantasy World Cup — schema + RLS
-- Run this ONCE in your Supabase project: Dashboard → SQL Editor → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / drops policies before recreating).
--
-- Design notes:
--   * The draft is a SNAKE draft. We do NOT store a mutable "current pick"
--     counter — the next pick index is simply COUNT(wc_picks for league).
--     This avoids race conditions when several friends draft at once.
--   * Turn order is derived client-side from each member's draft_position.
--   * Among-friends trust model: any league member can insert their own pick;
--     the UNIQUE constraints below prevent double-picking a team or a slot.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.wc_leagues (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  invite_code     text not null unique,
  commissioner_id uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'lobby',   -- 'lobby' | 'drafting' | 'done'
  pick_seconds    int  not null default 90,         -- on-the-clock timer (advisory)
  scoring         jsonb not null default
    '{"win":3,"draw":1,"goal":1,"clean_sheet":2,"r16":4,"qf":8,"sf":12,"final":16,"champion":25}'::jsonb,
  created_at      timestamptz not null default now()
);

create table if not exists public.wc_members (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.wc_leagues(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  handle        text,
  display_name  text,
  draft_position int,                                -- assigned when the draft starts (0-based)
  created_at    timestamptz not null default now(),
  unique (league_id, user_id)
);

create table if not exists public.wc_picks (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.wc_leagues(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  team_id     text not null,                         -- ESPN team id
  team_abbr   text,
  team_name   text,
  pick_number int  not null,                         -- 0-based global pick order
  created_at  timestamptz not null default now(),
  unique (league_id, team_id),                       -- a nation can be drafted once
  unique (league_id, pick_number)                    -- one pick per slot (race guard)
);

create index if not exists wc_members_league_idx on public.wc_members(league_id);
create index if not exists wc_picks_league_idx   on public.wc_picks(league_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.wc_leagues enable row level security;
alter table public.wc_members enable row level security;
alter table public.wc_picks   enable row level security;

-- wc_leagues -----------------------------------------------------------------
drop policy if exists wc_leagues_select on public.wc_leagues;
create policy wc_leagues_select on public.wc_leagues
  for select to authenticated using (true);            -- readable so invite codes can be looked up

drop policy if exists wc_leagues_insert on public.wc_leagues;
create policy wc_leagues_insert on public.wc_leagues
  for insert to authenticated with check (commissioner_id = auth.uid());

drop policy if exists wc_leagues_update on public.wc_leagues;
create policy wc_leagues_update on public.wc_leagues
  for update to authenticated using (commissioner_id = auth.uid());

drop policy if exists wc_leagues_delete on public.wc_leagues;
create policy wc_leagues_delete on public.wc_leagues
  for delete to authenticated using (commissioner_id = auth.uid());

-- wc_members -----------------------------------------------------------------
drop policy if exists wc_members_select on public.wc_members;
create policy wc_members_select on public.wc_members
  for select to authenticated using (true);

drop policy if exists wc_members_insert on public.wc_members;
create policy wc_members_insert on public.wc_members
  for insert to authenticated with check (user_id = auth.uid());

-- self can update self; commissioner can update any member (to seed draft order)
drop policy if exists wc_members_update on public.wc_members;
create policy wc_members_update on public.wc_members
  for update to authenticated using (
    user_id = auth.uid()
    or league_id in (select id from public.wc_leagues where commissioner_id = auth.uid())
  );

drop policy if exists wc_members_delete on public.wc_members;
create policy wc_members_delete on public.wc_members
  for delete to authenticated using (
    user_id = auth.uid()
    or league_id in (select id from public.wc_leagues where commissioner_id = auth.uid())
  );

-- wc_picks -------------------------------------------------------------------
drop policy if exists wc_picks_select on public.wc_picks;
create policy wc_picks_select on public.wc_picks
  for select to authenticated using (true);

drop policy if exists wc_picks_insert on public.wc_picks;
create policy wc_picks_insert on public.wc_picks
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists wc_picks_delete on public.wc_picks;
create policy wc_picks_delete on public.wc_picks
  for delete to authenticated using (
    league_id in (select id from public.wc_leagues where commissioner_id = auth.uid())
  );
