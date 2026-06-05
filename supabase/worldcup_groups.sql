-- Fantasy World Cup — mini-leagues ("groups") for the public games
-- (Power Ranking + Salary Cap). Run after worldcup_all.sql (or it's included there).

create table if not exists public.wc_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  game        text not null,            -- 'ranking' | 'salary'
  creator_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.wc_group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.wc_groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  handle       text,
  display_name text,
  created_at   timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists wc_group_members_group_idx on public.wc_group_members(group_id);

alter table public.wc_groups        enable row level security;
alter table public.wc_group_members enable row level security;

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
