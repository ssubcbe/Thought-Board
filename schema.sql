-- ════════════════════════════════════════════════════════════════
--  Thought Board · Supabase schema
--  Run once: Supabase dashboard → SQL Editor → New query → paste → Run
--  Safe to re-run.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.thoughts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,

  title            text not null check (char_length(title) between 1 and 120),
  icon             text,                                   -- emoji or square image URL

  stage            text not null default 'initial'
                   check (stage in ('initial','data_gathering','review','decision')),
  decision         text check (decision in ('proceed','dropped','future','on_hold')),

  -- Project fields (used when decision = 'proceed')
  priority         text check (priority in ('high','medium','low')),
  status           text check (status in ('not_started','wip','completed','on_hold')),

  start_date       date,
  duration_weeks   integer check (duration_weeks is null or duration_weeks between 0 and 520),
  end_date         date,                                   -- start_date + duration (set by the app)

  description      text check (description is null or coalesce(array_length(regexp_split_to_array(btrim(description), '\s+'), 1), 0) <= 250),
  objective        text check (objective   is null or coalesce(array_length(regexp_split_to_array(btrim(objective),   '\s+'), 1), 0) <= 250),
  expected_benefit text,
  planned_cost     numeric(14,2) check (planned_cost is null or planned_cost >= 0),

  dev_link         text,                                   -- link to the actual development
  share_token      uuid unique,                            -- null = not shared
  sort_order       double precision not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists thoughts_user_idx on public.thoughts (user_id, updated_at desc);

-- Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists thoughts_touch on public.thoughts;
create trigger thoughts_touch before update on public.thoughts
for each row execute function public.touch_updated_at();

-- ── Row-level security: you only ever see / change your own rows ──
alter table public.thoughts enable row level security;

drop policy if exists "own rows: select" on public.thoughts;
drop policy if exists "own rows: insert" on public.thoughts;
drop policy if exists "own rows: update" on public.thoughts;
drop policy if exists "own rows: delete" on public.thoughts;

create policy "own rows: select" on public.thoughts for select to authenticated using (auth.uid() = user_id);
create policy "own rows: insert" on public.thoughts for insert to authenticated with check (auth.uid() = user_id);
create policy "own rows: update" on public.thoughts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.thoughts for delete to authenticated using (auth.uid() = user_id);

-- Explicit grants (Supabase requires these for the Data API on new projects)
revoke all on public.thoughts from anon;
grant select, insert, update, delete on public.thoughts to authenticated;

-- ── Sharing: anyone with the secret token can read THAT ONE row, nothing else ──
create or replace function public.get_shared_thought(p_token uuid)
returns table (
  title text, icon text, stage text, decision text, priority text, status text,
  start_date date, duration_weeks integer, end_date date,
  description text, objective text, expected_benefit text, planned_cost numeric,
  dev_link text, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.title, t.icon, t.stage, t.decision, t.priority, t.status,
         t.start_date, t.duration_weeks, t.end_date,
         t.description, t.objective, t.expected_benefit, t.planned_cost,
         t.dev_link, t.updated_at
  from public.thoughts t
  where p_token is not null and t.share_token = p_token
  limit 1;
$$;

revoke all on function public.get_shared_thought(uuid) from public;
grant execute on function public.get_shared_thought(uuid) to anon, authenticated;
