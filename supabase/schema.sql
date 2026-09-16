-- Strategic Plan Portal — Supabase schema
--
-- Follows the Impact Suite's conventions (docs/AUTH-SETUP-SUPABASE.md):
-- ONE Supabase project holds every client. What keeps clients apart is the
-- `gw_tenant` claim in each user's app_metadata. `gw_tenant = '*'` is Good
-- Work's own staff and reaches every client.
--
-- What is different here, and deliberately so: role is PER PORTAL, not global.
-- A consultant runs many engagements; a board member of one client must not be
-- a board member of the next. `gw_tenant` scopes which portals exist for you at
-- all; `portal_members.role` decides what you may do inside one. Both are
-- enforced in RLS, so a stolen anon key reaches nothing.
--
-- Run: psql "$DATABASE_URL" -f schema.sql   (or paste into the SQL editor)
-- Idempotent — safe to re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- claims ---
-- Read the verified JWT the client sent. These are STABLE and SECURITY INVOKER:
-- they only read claims, never data, so they need no elevated rights.

create or replace function spp_tenant() returns text
  language sql stable
  set search_path = public, pg_temp
as $$
  select lower(coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'gw_tenant',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      ->> 'gw_tenant',
    ''));
$$;

-- Good Work's own staff: tagged `*`, works across every client.
create or replace function spp_is_gw() returns boolean
  language sql stable
  set search_path = public, pg_temp
as $$
  select spp_tenant() = '*';
$$;

-- ---------------------------------------------------------------- tables ---

create table if not exists portals (
  id           uuid primary key default gen_random_uuid(),
  -- The first path segment: plans.example.org/resonate. An address, not a
  -- secret; RLS below is what actually decides who reads it.
  slug         text unique not null,
  tenant       text not null,                    -- matches the gw_tenant claim
  client_name  text not null,
  place        text,
  engagement_name text not null,
  adopted      date,

  -- ---- everything below is edited IN THE APP by the consultant ----

  -- Logo and one accent colour. Deliberately not full theming: the portal
  -- should look like one product across every client, not reskin into each.
  brand        jsonb not null default '{}'::jsonb,

  -- What this client calls things. A church says "pillars", a foundation says
  -- "goal areas". One column, and the portal stops sounding generic.
  -- {"priority":"Pillar","priorities":"Pillars","initiative":"Workstream"}
  labels       jsonb not null default '{}'::jsonb,

  -- Which sections appear, in order. A client with no SWOT drops "findings".
  -- ["scope","plan","findings","workplan","dashboard"]
  sections     jsonb not null default '[]'::jsonb,

  -- Phases, in/out of scope, cadence, team.
  engagement   jsonb not null default '{}'::jsonb,

  -- Vision, framing, priorities -> initiatives, KPIs, the parallel track.
  -- A DOCUMENT, not rows: read whole, written whole, by one person, a few
  -- times an engagement. Tasks are rows because many people write them at once.
  plan         jsonb not null default '{}'::jsonb,

  -- Coded themes with source counts and the quote pool.
  findings     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Older deploys created this table with `engagement text`; lift it forward
-- rather than shipping a migration anyone has to remember to run.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'portals' and column_name = 'engagement'
                and data_type <> 'jsonb')
  then
    alter table portals rename column engagement to engagement_name;
    alter table portals add column engagement jsonb not null default '{}'::jsonb;
  end if;
end $$;

do $$
begin
  alter table portals add column if not exists brand    jsonb not null default '{}'::jsonb;
  alter table portals add column if not exists labels   jsonb not null default '{}'::jsonb;
  alter table portals add column if not exists sections jsonb not null default '[]'::jsonb;
end $$;

create table if not exists portal_members (
  portal_id  uuid not null references portals (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'board'
               check (role in ('owner', 'staff', 'board')),
  created_at timestamptz not null default now(),
  primary key (portal_id, user_id)
);
create index if not exists portal_members_user_idx on portal_members (user_id);

create table if not exists tasks (
  portal_id     uuid not null references portals (id) on delete cascade,
  -- Human-readable and stable: 'T-101', and its subtask 'T-101.1'. These end up
  -- in CSV exports and in conversation ("where is T-204?"), so they are the key
  -- rather than a surrogate uuid nobody can say out loud.
  id            text not null,
  -- A SUBTASK IS A TASK WITH A PARENT. One table, one set of rules, one status
  -- vocabulary — rather than a second table that would need all three again.
  parent_id     text,
  -- The initiative id from the plan document ("2.1"). A SOFT reference, not
  -- a foreign key: renumbering a plan in the editor must never orphan or
  -- cascade-delete somebody's work. The editor keeps the two in step.
  initiative    text not null,
  title         text not null,
  owner_name    text,
  owner_user_id uuid references auth.users (id) on delete set null,
  start_date    date,
  due_date      date,
  status        text not null default 'next'
                  check (status in ('next', 'doing', 'done', 'blocked')),
  note          text not null default '',
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,

  primary key (portal_id, id),
  foreign key (portal_id, parent_id) references tasks (portal_id, id) on delete cascade,
  -- One level of nesting. A subtask of a subtask is a project plan pretending
  -- to be a checklist; the constraint is what keeps the workplan readable.
  constraint tasks_not_self_parent check (parent_id is distinct from id)
);
create index if not exists tasks_portal_idx      on tasks (portal_id);
create index if not exists tasks_parent_idx      on tasks (portal_id, parent_id);
create index if not exists tasks_initiative_idx  on tasks (portal_id, initiative);
create index if not exists tasks_due_idx         on tasks (portal_id, due_date);

-- Who changed what. A shared password has no audit trail; real accounts do, and
-- for a tool clients run their year on, "when did this slip?" is a real question.
create table if not exists task_events (
  id         bigserial primary key,
  portal_id  uuid not null references portals (id) on delete cascade,
  task_id    text not null,
  actor      uuid references auth.users (id) on delete set null,
  actor_email text,
  field      text not null,
  old_value  text,
  new_value  text,
  at         timestamptz not null default now()
);
create index if not exists task_events_task_idx on task_events (portal_id, task_id, at desc);

-- ------------------------------------------------------------- role lookup ---
-- SECURITY DEFINER because it reads portal_members from inside the policies
-- that protect portal_members — an invoker-rights function would recurse.
-- search_path is pinned so the definer right cannot be redirected.

create or replace function spp_role(p uuid) returns text
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select case
    when spp_is_gw() then 'owner'
    else (select m.role from portal_members m
           where m.portal_id = p and m.user_id = auth.uid())
  end;
$$;

create or replace function spp_can_edit(p uuid) returns boolean
  language sql stable
  set search_path = public, pg_temp
as $$
  select spp_role(p) in ('owner', 'staff');
$$;

-- A portal is visible only to its members, and only on a site whose tenant
-- matches theirs. Good Work staff pass both.
create or replace function spp_can_read(p uuid) returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select spp_role(p) is not null
     and (spp_is_gw() or exists (
           select 1 from portals o
            where o.id = p and lower(o.tenant) = spp_tenant()));
$$;

-- ------------------------------------------------------------------ RLS ---

alter table portals        enable row level security;
alter table portal_members enable row level security;
alter table tasks          enable row level security;
alter table task_events    enable row level security;

drop policy if exists portals_read   on portals;
drop policy if exists portals_write  on portals;
drop policy if exists members_read   on portal_members;
drop policy if exists members_manage on portal_members;
drop policy if exists tasks_read     on tasks;
drop policy if exists tasks_insert   on tasks;
drop policy if exists tasks_update   on tasks;
drop policy if exists tasks_delete   on tasks;
drop policy if exists events_read    on task_events;
drop policy if exists events_insert  on task_events;

create policy portals_read on portals
  for select using (spp_can_read(id));

-- Only the consultant edits the plan document. Staff run the workplan; they do
-- not get to quietly reword an adopted priority.
create policy portals_write on portals
  for update using (spp_role(id) = 'owner') with check (spp_role(id) = 'owner');

create policy members_read on portal_members
  for select using (spp_can_read(portal_id));

create policy members_manage on portal_members
  for all using (spp_role(portal_id) = 'owner')
          with check (spp_role(portal_id) = 'owner');

create policy tasks_read on tasks
  for select using (spp_can_read(portal_id));

create policy tasks_insert on tasks
  for insert with check (spp_can_edit(portal_id));

create policy tasks_update on tasks
  for update using (spp_can_edit(portal_id))
          with check (spp_can_edit(portal_id));

create policy tasks_delete on tasks
  for delete using (spp_can_edit(portal_id));

create policy events_read on task_events
  for select using (spp_can_read(portal_id));

-- Append-only: there is no update or delete policy, so an audit row cannot be
-- rewritten or removed through the API by anyone, owner included.
create policy events_insert on task_events
  for insert with check (spp_can_edit(portal_id));

-- --------------------------------------------------------------- triggers ---

create or replace function spp_touch_task() returns trigger
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  who    uuid := auth.uid();
  mail   text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
  f      text;
  oldv   text;
  newv   text;
begin
  new.updated_at := now();
  new.updated_by := coalesce(who, new.updated_by);

  if tg_op = 'UPDATE' then
    foreach f in array array['status', 'owner_name', 'due_date', 'start_date', 'title', 'note'] loop
      execute format('select ($1).%I::text, ($2).%I::text', f, f)
        into oldv, newv using old, new;
      if oldv is distinct from newv then
        insert into task_events (portal_id, task_id, actor, actor_email, field, old_value, new_value)
        values (new.portal_id, new.id, who, mail, f, oldv, newv);
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_touch on tasks;
create trigger tasks_touch before insert or update on tasks
  for each row execute function spp_touch_task();

create or replace function spp_touch_portal() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists portals_touch on portals;
create trigger portals_touch before update on portals
  for each row execute function spp_touch_portal();

-- --------------------------------------------------------------- realtime ---
-- Two people in the same workplan should see each other's changes without a
-- reload. Guarded so re-running the file is not an error.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table tasks;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ------------------------------------------------------------------ seed ---
-- Creating the first portal and its owner is a one-time job for the service
-- role (RLS above deliberately gives an anonymous caller no way in):
--
--   insert into portals (slug, tenant, client_name, engagement, adopted, plan, findings)
--   values ('resonate', 'resonate', 'Resonate Church',
--           'Strategic Plan 2026-2028', '2026-08-18',
--           '<contents of data/plan.js>'::jsonb,
--           '<contents of data/findings.js>'::jsonb);
--
--   insert into portal_members (portal_id, user_id, email, role)
--   select p.id, u.id, u.email, 'owner'
--     from portals p, auth.users u
--    where p.slug = 'resonate' and u.email = 'alan@goodworkatlanta.co';
--
-- Tag every user in Supabase → Authentication → Users → App metadata:
--   { "gw_role": "staff", "gw_tenant": "resonate" }   -- a client's staff
--   { "gw_role": "admin", "gw_tenant": "*" }          -- Good Work
