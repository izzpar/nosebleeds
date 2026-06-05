-- League redesign: Salary Cap & Power Ranking become league-based.
-- A "league" is a wc_groups row (game = 'ranking' | 'salary'); entries are scoped
-- to a league (group_id null = the default Global league). Commissioners set
-- max_entries per user. Run in Supabase SQL Editor.

alter table public.wc_groups add column if not exists max_entries int not null default 1;

-- ---- Power Ranking entries -------------------------------------------------
create table if not exists public.wc_ranking_entries (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references public.wc_groups(id) on delete cascade,  -- null = Global
  user_id    uuid not null references auth.users(id) on delete cascade,
  handle     text,
  display_name text,
  label      text,
  ranking    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wc_ranking_entries_group_idx on public.wc_ranking_entries(group_id);
alter table public.wc_ranking_entries enable row level security;
drop policy if exists wc_re_select on public.wc_ranking_entries;
create policy wc_re_select on public.wc_ranking_entries for select to authenticated using (true);
drop policy if exists wc_re_insert on public.wc_ranking_entries;
create policy wc_re_insert on public.wc_ranking_entries for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_re_update on public.wc_ranking_entries;
create policy wc_re_update on public.wc_ranking_entries for update to authenticated using (user_id = auth.uid());
drop policy if exists wc_re_delete on public.wc_ranking_entries;
create policy wc_re_delete on public.wc_ranking_entries for delete to authenticated using (user_id = auth.uid());

-- ---- Salary-cap entries (per-round lineups hang off an entry) ---------------
create table if not exists public.wc_salary_entries (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references public.wc_groups(id) on delete cascade,  -- null = Global
  user_id    uuid not null references auth.users(id) on delete cascade,
  handle     text,
  display_name text,
  label      text,
  created_at timestamptz not null default now()
);
create index if not exists wc_salary_entries_group_idx on public.wc_salary_entries(group_id);
alter table public.wc_salary_entries enable row level security;
drop policy if exists wc_se_select on public.wc_salary_entries;
create policy wc_se_select on public.wc_salary_entries for select to authenticated using (true);
drop policy if exists wc_se_insert on public.wc_salary_entries;
create policy wc_se_insert on public.wc_salary_entries for insert to authenticated with check (user_id = auth.uid());
drop policy if exists wc_se_delete on public.wc_salary_entries;
create policy wc_se_delete on public.wc_salary_entries for delete to authenticated using (user_id = auth.uid());

create table if not exists public.wc_salary_entry_lineups (
  entry_id   uuid not null references public.wc_salary_entries(id) on delete cascade,
  round_id   text not null,
  squad      jsonb not null default '[]'::jsonb,
  starters   jsonb not null default '[]'::jsonb,
  bench      jsonb not null default '[]'::jsonb,
  captain    text,
  updated_at timestamptz not null default now(),
  primary key (entry_id, round_id)
);
alter table public.wc_salary_entry_lineups enable row level security;
drop policy if exists wc_sel_select on public.wc_salary_entry_lineups;
create policy wc_sel_select on public.wc_salary_entry_lineups for select to authenticated using (true);
drop policy if exists wc_sel_write on public.wc_salary_entry_lineups;
create policy wc_sel_write on public.wc_salary_entry_lineups for all to authenticated using (
  entry_id in (select id from public.wc_salary_entries where user_id = auth.uid())
) with check (
  entry_id in (select id from public.wc_salary_entries where user_id = auth.uid())
);
