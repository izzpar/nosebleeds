-- World Cup match predictions — a standalone daily pick game (separate from the
-- US-sports /predictions). One pick per match: home win / draw / away win.
-- Run this in the Supabase SQL editor.

create table if not exists wc_predictions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  handle       text,
  display_name text,
  match_id     text not null,                 -- ESPN event id
  match_date   timestamptz,                   -- kickoff (lock time)
  home_abbr    text,
  away_abbr    text,
  home_name    text,
  away_name    text,
  pick         text not null check (pick in ('home','draw','away')),
  status       text not null default 'pending' check (status in ('pending','won','lost','void')),
  result       text,                          -- 'home' | 'draw' | 'away' once settled
  created_at   timestamptz default now(),
  settled_at   timestamptz,
  unique (user_id, match_id)
);

alter table wc_predictions enable row level security;

-- Everyone can read (powers the global leaderboard); you only write your own.
drop policy if exists wc_predictions_read on wc_predictions;
create policy wc_predictions_read on wc_predictions for select using (true);
drop policy if exists wc_predictions_insert on wc_predictions;
create policy wc_predictions_insert on wc_predictions for insert with check (auth.uid() = user_id);
drop policy if exists wc_predictions_update on wc_predictions;
create policy wc_predictions_update on wc_predictions for update using (auth.uid() = user_id);
drop policy if exists wc_predictions_delete on wc_predictions;
create policy wc_predictions_delete on wc_predictions for delete using (auth.uid() = user_id);

create index if not exists wc_predictions_user_idx  on wc_predictions(user_id);
create index if not exists wc_predictions_match_idx on wc_predictions(match_id);
create index if not exists wc_predictions_status_idx on wc_predictions(status);
