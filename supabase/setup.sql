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

-- 👥 Friend groups: private groups with a chat, a group rating on every game,
-- and a weekly leaderboard. Joining only works through an invite code.
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  emoji       text not null default '🩸',
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists public.group_messages (
  id         bigserial primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists group_messages_recent on public.group_messages (group_id, created_at desc);

-- Membership check that policies can call without recursing into group_members' own policy.
create or replace function public.is_group_member(gid uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

-- Create a group (you become its first member) / join one by invite code.
create or replace function public.create_group(p_name text, p_emoji text default '🩸') returns uuid
  language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into public.groups (name, emoji, created_by) values (trim(p_name), coalesce(nullif(p_emoji, ''), '🩸'), auth.uid()) returning id into gid;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid());
  return gid;
end $$;
create or replace function public.join_group(p_code text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select id into gid from public.groups where invite_code = lower(trim(p_code));
  if gid is null then raise exception 'invite not found'; end if;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;
grant execute on function public.create_group(text, text), public.join_group(text) to authenticated;

alter table public.groups enable row level security;
drop policy if exists "groups members read" on public.groups;
create policy "groups members read" on public.groups for select using (public.is_group_member(id));
drop policy if exists "groups creator edits" on public.groups;
create policy "groups creator edits" on public.groups for update using (auth.uid() = created_by);
drop policy if exists "groups creator deletes" on public.groups;
create policy "groups creator deletes" on public.groups for delete using (auth.uid() = created_by);

alter table public.group_members enable row level security;
drop policy if exists "group_members members read" on public.group_members;
create policy "group_members members read" on public.group_members for select using (public.is_group_member(group_id));
drop policy if exists "group_members leave" on public.group_members;
create policy "group_members leave" on public.group_members for delete using (auth.uid() = user_id);

alter table public.group_messages enable row level security;
drop policy if exists "group_messages members read" on public.group_messages;
create policy "group_messages members read" on public.group_messages for select using (public.is_group_member(group_id));
drop policy if exists "group_messages members post" on public.group_messages;
create policy "group_messages members post" on public.group_messages for insert with check (auth.uid() = user_id and public.is_group_member(group_id));
drop policy if exists "group_messages own delete" on public.group_messages;
create policy "group_messages own delete" on public.group_messages for delete using (auth.uid() = user_id);
