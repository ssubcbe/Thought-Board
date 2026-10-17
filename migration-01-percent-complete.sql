-- ════════════════════════════════════════════════════════════════
--  Thought Board · update 01 — adds "% Complete"
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run again. Your existing data is not changed.
-- ════════════════════════════════════════════════════════════════

alter table public.thoughts add column if not exists percent_complete integer
  check (percent_complete is null or percent_complete between 0 and 100);

-- Share links: include % Complete (function must be re-created because its columns changed)
drop function if exists public.get_shared_thought(uuid);
create function public.get_shared_thought(p_token uuid)
returns table (
  title text, icon text, stage text, decision text, priority text, status text,
  percent_complete integer, start_date date, duration_weeks integer, end_date date,
  description text, objective text, expected_benefit text, planned_cost numeric,
  dev_link text, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.title, t.icon, t.stage, t.decision, t.priority, t.status,
         t.percent_complete, t.start_date, t.duration_weeks, t.end_date,
         t.description, t.objective, t.expected_benefit, t.planned_cost,
         t.dev_link, t.updated_at
  from public.thoughts t
  where p_token is not null and t.share_token = p_token
  limit 1;
$$;

revoke all on function public.get_shared_thought(uuid) from public;
grant execute on function public.get_shared_thought(uuid) to anon, authenticated;

-- Existing WIP projects start at 0 %, completed ones at 100 %
update public.thoughts set percent_complete = 0
  where stage = 'decision' and decision = 'proceed' and status = 'wip' and percent_complete is null;
update public.thoughts set percent_complete = 100
  where stage = 'decision' and decision = 'proceed' and status = 'completed' and percent_complete is null;
