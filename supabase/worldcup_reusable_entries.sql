-- Reusable contest entries: a ranking/team can be entered into many leagues.
-- An "entry" (wc_ranking_entries / wc_salary_entries) is now your personal library
-- item; a "submission" links one entry to one league (null group = Global).
-- Run in the Supabase SQL Editor (keep RLS enabled).

-- ===== Ranking submissions =====
create table if not exists public.wc_ranking_submissions (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.wc_ranking_entries(id) on delete cascade,
  group_id   uuid references public.wc_groups(id) on delete cascade,  -- null = Global
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- one entry per league at most (treat Global/null as a fixed key)
create unique index if not exists wc_rs_uniq on public.wc_ranking_submissions (entry_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists wc_rs_group_idx on public.wc_ranking_submissions (group_id);
create index if not exists wc_rs_user_idx on public.wc_ranking_submissions (user_id);
alter table public.wc_ranking_submissions enable row level security;
drop policy if exists wc_rs_select on public.wc_ranking_submissions;
create policy wc_rs_select on public.wc_ranking_submissions for select to authenticated using (true);
drop policy if exists wc_rs_select_anon on public.wc_ranking_submissions;
create policy wc_rs_select_anon on public.wc_ranking_submissions for select to anon using (true);
drop policy if exists wc_rs_insert on public.wc_ranking_submissions;
create policy wc_rs_insert on public.wc_ranking_submissions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_rs_delete on public.wc_ranking_submissions;
create policy wc_rs_delete on public.wc_ranking_submissions for delete to authenticated using (user_id = auth.uid());

-- ===== Salary submissions =====
create table if not exists public.wc_salary_submissions (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.wc_salary_entries(id) on delete cascade,
  group_id   uuid references public.wc_groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists wc_ss_uniq on public.wc_salary_submissions (entry_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists wc_ss_group_idx on public.wc_salary_submissions (group_id);
create index if not exists wc_ss_user_idx on public.wc_salary_submissions (user_id);
alter table public.wc_salary_submissions enable row level security;
drop policy if exists wc_ss_select on public.wc_salary_submissions;
create policy wc_ss_select on public.wc_salary_submissions for select to authenticated using (true);
drop policy if exists wc_ss_select_anon on public.wc_salary_submissions;
create policy wc_ss_select_anon on public.wc_salary_submissions for select to anon using (true);
drop policy if exists wc_ss_insert on public.wc_salary_submissions;
create policy wc_ss_insert on public.wc_salary_submissions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_ss_delete on public.wc_salary_submissions;
create policy wc_ss_delete on public.wc_salary_submissions for delete to authenticated using (user_id = auth.uid());

-- ===== Migrate existing entries → a submission to the league they were made in =====
insert into public.wc_ranking_submissions (entry_id, group_id, user_id)
  select id, group_id, user_id from public.wc_ranking_entries
  on conflict do nothing;
insert into public.wc_salary_submissions (entry_id, group_id, user_id)
  select id, group_id, user_id from public.wc_salary_entries
  on conflict do nothing;
