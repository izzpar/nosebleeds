-- Draft scheduling + commissioner pause controls for draft leagues.
-- Run in the Supabase SQL Editor.

-- Scheduled draft time (auto-starts when it arrives; commissioner can also start early).
alter table public.wc_leagues add column if not exists draft_at timestamptz;

-- Commissioner pause: freezes the pick clock and suspends auto-drafting for late managers.
alter table public.wc_leagues add column if not exists draft_paused boolean not null default false;

-- Per-player scoring needs role + cumulative components for re-scoring with custom values.
alter table public.wc_player_points add column if not exists role text;
alter table public.wc_player_points add column if not exists components jsonb not null default '{}'::jsonb;
