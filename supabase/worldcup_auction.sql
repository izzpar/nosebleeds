-- Fantasy World Cup — auction drafts (team + player). Run after worldcup_all.sql
-- (or just re-run worldcup_all.sql, which now includes this).

alter table public.wc_leagues add column if not exists draft_type text not null default 'snake'; -- 'snake' | 'auction'
alter table public.wc_leagues add column if not exists budget     int  not null default 200;
alter table public.wc_picks   add column if not exists price      int  not null default 0;

-- Live auction lot state (one row per league). Any league member may update it
-- (to nominate / bid); the commissioner calls "Sold" to settle.
create table if not exists public.wc_auction (
  league_id        uuid primary key references public.wc_leagues(id) on delete cascade,
  nominator_pos    int not null default 0,
  item_id          text,
  item_kind        text,        -- 'team' | 'player'
  item_name        text,
  item_team        text,
  item_position    text,
  high_bid         int default 0,
  high_bidder      uuid,
  high_bidder_name text,
  ends_at          timestamptz,
  updated_at       timestamptz not null default now()
);

alter table public.wc_auction enable row level security;

drop policy if exists wc_auction_select on public.wc_auction;
create policy wc_auction_select on public.wc_auction
  for select to authenticated using (true);

-- Members of the league can insert/update the lot (nominate + bid).
drop policy if exists wc_auction_insert on public.wc_auction;
create policy wc_auction_insert on public.wc_auction
  for insert to authenticated with check (
    league_id in (select league_id from public.wc_members where user_id = auth.uid()));

drop policy if exists wc_auction_update on public.wc_auction;
create policy wc_auction_update on public.wc_auction
  for update to authenticated using (
    league_id in (select league_id from public.wc_members where user_id = auth.uid()));
