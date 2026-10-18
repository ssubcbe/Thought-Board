-- ════════════════════════════════════════════════════════════════
--  Thought Board · update 03 — adds "Category"
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run again. Existing data is not changed or deleted.
--  (Objective / Expected benefit stay stored in the database but are
--   no longer shown in the app or on share links.)
-- ════════════════════════════════════════════════════════════════

alter table public.thoughts add column if not exists category text
  check (category is null or category in ('client_work','family_wellbeing','finance','home_improvements','personal','revenue'));

-- Share links: add Category, stop returning Objective / Expected benefit
drop function if exists public.get_shared_thought(uuid);
create function public.get_shared_thought(p_token uuid)
returns table (
  title text, icon text, category text, stage text, decision text, priority text, status text,
  percent_complete integer, start_date date, duration_weeks integer, end_date date,
  description text, planned_cost numeric,
  actual_cost numeric, dev_link text, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.title, t.icon, t.category, t.stage, t.decision, t.priority, t.status,
         t.percent_complete, t.start_date, t.duration_weeks, t.end_date,
         t.description, t.planned_cost,
         t.actual_cost, t.dev_link, t.updated_at
  from public.thoughts t
  where p_token is not null and t.share_token = p_token
  limit 1;
$$;

revoke all on function public.get_shared_thought(uuid) from public;
grant execute on function public.get_shared_thought(uuid) to anon, authenticated;
