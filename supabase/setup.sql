-- The Nosebleeds: tables for player grades, play reactions and game alerts.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run: everything is "if not exists" / "or replace".

-- ⭐ Player grades (1–10) on finished games
create table if not exists public.player_ratings (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_id     text not null,
  sport       text,
  player_name text not null,
  team        text,
  rating      numeric not null check (rating between 1 and 10),
  updated_at  timestamptz not null default now(),
  primary key (user_id, game_id, player_name)
);
alter table public.player_ratings enable row level security;
drop policy if exists "player_ratings readable" on public.player_ratings;
create policy "player_ratings readable" on public.player_ratings for select using (true);
drop policy if exists "player_ratings own insert" on public.player_ratings;
create policy "player_ratings own insert" on public.player_ratings for insert with check (auth.uid() = user_id);
drop policy if exists "player_ratings own update" on public.player_ratings;
create policy "player_ratings own update" on public.player_ratings for update using (auth.uid() = user_id);
drop policy if exists "player_ratings own delete" on public.player_ratings;
create policy "player_ratings own delete" on public.player_ratings for delete using (auth.uid() = user_id);

-- ⚡ Reactions on individual plays (one per person per play)
create table if not exists public.play_reactions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  game_id    text not null,
  play_id    text not null,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id, play_id)
);
create index if not exists play_reactions_game on public.play_reactions (game_id);
alter table public.play_reactions enable row level security;
drop policy if exists "play_reactions readable" on public.play_reactions;
create policy "play_reactions readable" on public.play_reactions for select using (true);
drop policy if exists "play_reactions own insert" on public.play_reactions;
create policy "play_reactions own insert" on public.play_reactions for insert with check (auth.uid() = user_id);
drop policy if exists "play_reactions own update" on public.play_reactions;
create policy "play_reactions own update" on public.play_reactions for update using (auth.uid() = user_id);
drop policy if exists "play_reactions own delete" on public.play_reactions;
create policy "play_reactions own delete" on public.play_reactions for delete using (auth.uid() = user_id);

-- 🔔 Game alerts: each phone/browser that turned alerts on (private to its owner)
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions own" on public.push_subscriptions;
create policy "push_subscriptions own" on public.push_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 🔔 Which alerts each person already got (written only by the server's cron job)
create table if not exists public.push_log (
  user_id uuid not null,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_log enable row level security; -- no policies: server (service role) only
