-- Let a draft league's commissioner delete it. These are ADDITIVE delete
-- policies only — they don't change who can read/create/update, so they won't
-- affect the existing draft flow. Run in the Supabase SQL editor.

-- Commissioner can delete their own league.
drop policy if exists wc_leagues_delete on wc_leagues;
create policy wc_leagues_delete on wc_leagues
  for delete using (auth.uid() = commissioner_id);

-- Members can be removed by themselves or by the league's commissioner
-- (so deleting a league can clear its members first).
drop policy if exists wc_members_delete on wc_members;
create policy wc_members_delete on wc_members
  for delete using (
    auth.uid() = user_id
    or auth.uid() in (select commissioner_id from wc_leagues where id = wc_members.league_id)
  );
