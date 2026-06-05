-- Draft scheduling + commissioner pause controls for draft leagues.
-- Run in the Supabase SQL Editor.

-- Scheduled draft time (auto-starts when it arrives; commissioner can also start early).
alter table public.wc_leagues add column if not exists draft_at timestamptz;

-- Commissioner pause: freezes the pick clock and suspends auto-drafting for late managers.
alter table public.wc_leagues add column if not exists draft_paused boolean not null default false;

-- Per-player scoring needs role + cumulative components for re-scoring with custom values.
alter table public.wc_player_points add column if not exists role text;
alter table public.wc_player_points add column if not exists components jsonb not null default '{}'::jsonb;

-- OPTIONAL (nicer invites): let logged-out visitors read a league/group so the
-- invite page can show its name before they sign up. Without this the invite
-- still works — it just shows generic copy until the account is created.
drop policy if exists wc_leagues_select_anon on public.wc_leagues;
create policy wc_leagues_select_anon on public.wc_leagues for select to anon using (true);
drop policy if exists wc_groups_select_anon on public.wc_groups;
create policy wc_groups_select_anon on public.wc_groups for select to anon using (true);
