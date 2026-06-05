-- Player-draft support: extend the existing draft tables (run after worldcup_schema.sql).
-- Team drafts are unaffected (new columns are nullable / defaulted).

alter table public.wc_leagues add column if not exists format     text not null default 'team'; -- 'team' | 'player'
alter table public.wc_leagues add column if not exists squad_size int  not null default 15;     -- players per manager (player format)

alter table public.wc_picks add column if not exists player_id   text;
alter table public.wc_picks add column if not exists player_name text;
alter table public.wc_picks add column if not exists position    text;

-- A player can be drafted once per league. Partial index so team picks
-- (player_id IS NULL) don't collide.
create unique index if not exists wc_picks_league_player_uq
  on public.wc_picks(league_id, player_id) where player_id is not null;
