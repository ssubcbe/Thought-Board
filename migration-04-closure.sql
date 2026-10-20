-- ════════════════════════════════════════════════════════════════
--  My Thought Board · update 04 — Closing remarks, closure date, 30-day lock
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run again. Existing data is kept.
--  Projects that are already Completed get today as their closure date,
--  so each one has a fresh 30-day window before it becomes read-only.
-- ════════════════════════════════════════════════════════════════

alter table public.thoughts add column if not exists closing_remarks text
  check (closing_remarks is null or char_length(closing_remarks) <= 100);
alter table public.thoughts add column if not exists closed_at timestamptz;

update public.thoughts set closed_at = now()
  where stage = 'decision' and decision = 'proceed' and status = 'completed' and closed_at is null;

-- Closure: set closed_at when a project is Completed, clear it when reopened,
-- and make the row read-only 30 days after closure (only sharing can still change).
create or replace function public.thoughts_closure()
returns trigger language plpgsql as $$
declare
  was_done boolean := false;
  is_done  boolean := new.stage = 'decision' and new.decision = 'proceed' and new.status = 'completed';
begin
  if tg_op = 'UPDATE' then
    was_done := old.stage = 'decision' and old.decision = 'proceed' and old.status = 'completed';
    if was_done and old.closed_at is not null and old.closed_at < now() - interval '30 days'
       and (to_jsonb(new) - 'share_token' - 'updated_at') is distinct from (to_jsonb(old) - 'share_token' - 'updated_at') then
      raise exception 'This item is locked (read-only): it was closed more than 30 days ago.';
    end if;
  end if;
  if is_done then
    new.closed_at := case when was_done and old.closed_at is not null then old.closed_at else now() end;
  else
    new.closed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists thoughts_closure on public.thoughts;
create trigger thoughts_closure before insert or update on public.thoughts
for each row execute function public.thoughts_closure();

-- Share links: include closure date and closing remarks
drop function if exists public.get_shared_thought(uuid);
create function public.get_shared_thought(p_token uuid)
returns table (
  title text, icon text, category text, stage text, decision text, priority text, status text,
  percent_complete integer, start_date date, duration_weeks integer, end_date date,
  description text, planned_cost numeric,
  actual_cost numeric, dev_link text, closing_remarks text, closed_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.title, t.icon, t.category, t.stage, t.decision, t.priority, t.status,
         t.percent_complete, t.start_date, t.duration_weeks, t.end_date,
         t.description, t.planned_cost,
         t.actual_cost, t.dev_link, t.closing_remarks, t.closed_at, t.updated_at
  from public.thoughts t
  where p_token is not null and t.share_token = p_token
  limit 1;
$$;

revoke all on function public.get_shared_thought(uuid) from public;
grant execute on function public.get_shared_thought(uuid) to anon, authenticated;
