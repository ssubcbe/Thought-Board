-- ════════════════════════════════════════════════════════════════
--  Thought Board · update 02 — adds "Actual cost"
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run again. Your existing data is not changed.
--  (Run migration-01-percent-complete.sql first if you haven't.)
-- ════════════════════════════════════════════════════════════════

alter table public.thoughts add column if not exists actual_cost numeric(14,2)
  check (actual_cost is null or actual_cost >= 0);

-- Share links: include Actual cost (function re-created because its columns changed)
drop function if exists public.get_shared_thought(uuid);
create function public.get_shared_thought(p_token uuid)
returns table (
  title text, icon text, stage text, decision text, priority text, status text,
  percent_complete integer, start_date date, duration_weeks integer, end_date date,
  description text, objective text, expected_benefit text, planned_cost numeric,
  actual_cost numeric, dev_link text, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.title, t.icon, t.stage, t.decision, t.priority, t.status,
         t.percent_complete, t.start_date, t.duration_weeks, t.end_date,
         t.description, t.objective, t.expected_benefit, t.planned_cost,
         t.actual_cost, t.dev_link, t.updated_at
  from public.thoughts t
  where p_token is not null and t.share_token = p_token
  limit 1;
$$;

revoke all on function public.get_shared_thought(uuid) from public;
grant execute on function public.get_shared_thought(uuid) to anon, authenticated;
