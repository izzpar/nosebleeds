-- Salary Cap league redesign: allow renaming a salary entry (label).
-- The wc_salary_entries table already has select/insert/delete policies; add update.
-- Run in the Supabase SQL Editor.

drop policy if exists wc_se_update on public.wc_salary_entries;
create policy wc_se_update on public.wc_salary_entries
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
