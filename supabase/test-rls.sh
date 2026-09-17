#!/usr/bin/env bash
# Runs schema.sql against a throwaway Postgres 16 cluster with the parts
# Supabase provides (auth.users, auth.uid(), the realtime publication) stubbed,
# then exercises the RLS policies as three different users.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA="${TMPDIR:-/tmp}/spp-pg/data"
SOCK="${TMPDIR:-/tmp}/spp-pg/sock"
SCHEMA="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/schema.sql"

rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK" "$(dirname "$DATA")"
"$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null 2>&1
"$PGBIN/pg_ctl" -D "$DATA" -o "-k $SOCK -h '' -c listen_addresses=''" -w start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$DATA" -w stop >/dev/null 2>&1 || true' EXIT

psql() { command psql -h "$SOCK" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

echo "=== stub the Supabase-provided pieces ==="
psql -q <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
-- Supabase's auth.uid() reads the verified JWT claims GoTrue sets per request.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;
create publication supabase_realtime;
-- Three people: the consultant (Good Work, tenant *), a client staffer, a board member.
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111','alan@goodworkatlanta.co'),
  ('22222222-2222-2222-2222-222222222222','staff@resonate.org'),
  ('33333333-3333-3333-3333-333333333333','board@resonate.org'),
  ('44444444-4444-4444-4444-444444444444','outsider@elsewhere.org');
create role authenticated nologin;
grant usage on schema public, auth to authenticated;
SQL

echo "=== run schema.sql ==="
psql -q -f "$SCHEMA"
echo "    schema applied with no errors"

echo "=== idempotency: run it a second time ==="
psql -q -f "$SCHEMA"
echo "    re-run clean"

echo "=== seed one portal ==="
psql -q <<'SQL'
insert into portals (slug, tenant, client_name, engagement_name, adopted, labels, sections)
values ('resonate','resonate','Resonate Church','Strategic Plan 2026-2028','2026-08-18',
        '{"priority":"Pillar"}'::jsonb, '["plan","workplan"]'::jsonb);
insert into portal_members (portal_id, user_id, email, role)
select p.id,'22222222-2222-2222-2222-222222222222','staff@resonate.org','staff' from portals p where slug='resonate';
insert into portal_members (portal_id, user_id, email, role)
select p.id,'33333333-3333-3333-3333-333333333333','board@resonate.org','board' from portals p where slug='resonate';
insert into tasks (portal_id,id,initiative,title,owner_name,due_date,status)
select p.id,'T-102','1.1','Draft the one-page Life Group charter','R. Alvarez','2026-10-02','doing' from portals p where slug='resonate';
insert into tasks (portal_id,id,parent_id,initiative,title,status)
select p.id,'T-102.1','T-102','1.1','Purpose statement','done' from portals p where slug='resonate';
grant select, insert, update, delete on portals, portal_members, tasks, task_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;
SQL

# Run a statement as a signed-in user by setting the claims GoTrue would set.
as_user() { # $1=sub $2=tenant $3=email $4=sql
  command psql -h "$SOCK" -U postgres -d postgres -X -t -A -v ON_ERROR_STOP=0 -c "
    set local role authenticated;
    set local request.jwt.claims = '{\"sub\":\"$1\",\"email\":\"$3\",\"app_metadata\":{\"gw_tenant\":\"$2\"}}';
    $4" 2>&1 | tr -d '\n'
}

P=$(psql -t -A -c "select id from portals where slug='resonate'")

echo
echo "=== RLS: who can READ the portal ==="
echo "  Good Work (tenant *)     rows: $(as_user 11111111-1111-1111-1111-111111111111 '*'        alan@goodworkatlanta.co "select count(*) from portals")"
echo "  client staff             rows: $(as_user 22222222-2222-2222-2222-222222222222 resonate   staff@resonate.org      "select count(*) from portals")"
echo "  board member             rows: $(as_user 33333333-3333-3333-3333-333333333333 resonate   board@resonate.org      "select count(*) from portals")"
echo "  outsider (not a member)  rows: $(as_user 44444444-4444-4444-4444-444444444444 elsewhere  outsider@elsewhere.org  "select count(*) from portals")"
echo "  staff w/ WRONG tenant    rows: $(as_user 22222222-2222-2222-2222-222222222222 otherchurch staff@resonate.org     "select count(*) from portals")"

echo
echo "=== RLS: who can WRITE a task ==="
echo "  staff advances status  -> $(as_user 22222222-2222-2222-2222-222222222222 resonate staff@resonate.org "update tasks set status='done' where id='T-102'; select 'ok, rows='||count(*) from tasks where id='T-102' and status='done'")"
echo "  board advances status  -> $(as_user 33333333-3333-3333-3333-333333333333 resonate board@resonate.org "update tasks set status='next' where id='T-102'; select 'rows changed='||count(*) from tasks where id='T-102' and status='next'")"
echo "  board edits plan doc   -> $(as_user 33333333-3333-3333-3333-333333333333 resonate board@resonate.org "update portals set client_name='Hacked' where slug='resonate'; select 'name is now '||client_name from portals where slug='resonate'")"
echo "  outsider inserts task  -> $(as_user 44444444-4444-4444-4444-444444444444 elsewhere outsider@elsewhere.org "insert into tasks (portal_id,id,initiative,title) values ('$P','T-999','1.1','pwned')")"

echo
echo "=== Good Work staff: reaches every portal, but an explicit row scopes them ==="
echo "  gw with no member row   -> $(as_user 11111111-1111-1111-1111-111111111111 '*' alan@goodworkatlanta.co "select 'role='||coalesce(spp_role((select id from portals where slug='resonate')),'none')")"
psql -h "$SOCK" -U postgres -d postgres -q -c "insert into auth.users values ('55555555-5555-5555-5555-555555555555','junior@goodworkatlanta.co') on conflict do nothing" >/dev/null 2>&1
psql -h "$SOCK" -U postgres -d postgres -q -c "insert into portal_members (portal_id,user_id,email,role) select id,'55555555-5555-5555-5555-555555555555','junior@goodworkatlanta.co','board' from portals where slug='resonate' on conflict (portal_id,user_id) do update set role='board'" >/dev/null 2>&1
echo "  gw scoped to board      -> $(as_user 55555555-5555-5555-5555-555555555555 '*' junior@goodworkatlanta.co "select 'role='||coalesce(spp_role((select id from portals where slug='resonate')),'none')")"
# Check something nothing else in this script touches, so the result is
# unambiguous rather than reading an earlier test's write.
echo "  ...and cannot write     -> $(as_user 55555555-5555-5555-5555-555555555555 '*' junior@goodworkatlanta.co "update tasks set title='SCOPED WRITE LEAKED' where id='T-102'; select 'title is still: '||title from tasks where id='T-102'")"

echo
echo "=== per-client customisation is readable by the client, writable only by the owner ==="
echo "  staff reads labels      -> $(as_user 22222222-2222-2222-2222-222222222222 resonate staff@resonate.org "select labels->>'priority' from portals where slug='resonate'")"
echo "  staff rewrites labels   -> $(as_user 22222222-2222-2222-2222-222222222222 resonate staff@resonate.org "update portals set labels='{\"priority\":\"Hacked\"}'::jsonb where slug='resonate'; select 'label is now '||(labels->>'priority') from portals where slug='resonate'")"
echo "  Good Work rewrites it   -> $(as_user 11111111-1111-1111-1111-111111111111 '*' alan@goodworkatlanta.co "update portals set labels='{\"priority\":\"Goal area\"}'::jsonb where slug='resonate'; select 'label is now '||(labels->>'priority') from portals where slug='resonate'")"

echo
echo "=== audit trail written by the trigger ==="
psql -c "select task_id, field, old_value, new_value, actor_email from task_events order by id"

echo "=== subtask cascade: deleting a parent removes its children ==="
psql -q -c "delete from tasks where id='T-102'"
echo "    subtasks remaining after parent delete: $(psql -t -A -c "select count(*) from tasks where id='T-102.1'")"

echo
echo "=== constraint checks ==="
# Each insert MUST fail. pipefail means the pipeline is non-zero either way, so
# match on grep alone rather than on the pipeline's status.
refuses() { # name, expected-error-fragment, sql
  local out; out="$(psql -t -A -c "$3" 2>&1 || true)"
  if grep -qo "$2" <<<"$out"; then echo "  $1 -> refused: $(grep -o "$2" <<<"$out" | head -1)"
  else echo "  $1 -> FAIL, THE INSERT WAS ACCEPTED"; exit 1; fi
}
refuses "unknown status  " "violates check constraint \"[a-z_]*\"" "insert into tasks (portal_id,id,initiative,title,status) values ('$P','T-1','1.1','x','bogus')"
refuses "task as own parent" "violates check constraint \"[a-z_]*\"" "insert into tasks (portal_id,id,parent_id,initiative,title) values ('$P','T-2','T-2','1.1','x')"
refuses "parent that is gone" "violates foreign key constraint" "insert into tasks (portal_id,id,parent_id,initiative,title) values ('$P','T-3','T-nope','1.1','x')"
echo
echo "=== sharing a project: a name collision is refused, not half-applied ==="
# The dangerous order without the guard: `create table if not exists` skips,
# then RLS is switched on over the OTHER app's table and it goes dark. Prove
# schema.sql aborts, and prove the decoy is untouched.
command psql -h "$SOCK" -U postgres -d postgres -q -c "create database neighbour" >/dev/null
psql_nb() { command psql -h "$SOCK" -U postgres -d neighbour -v ON_ERROR_STOP=1 "$@"; }
psql_nb -q <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create publication supabase_realtime;
-- another app's table, same name, different shape
create table public.tasks (id serial primary key, title text, done boolean);
SQL
if psql_nb -q -f "$SCHEMA" >/dev/null 2>&1; then
  echo "  FAIL: schema.sql ran anyway over a foreign public.tasks"; exit 1
fi
echo "  schema.sql refused    -> $(psql_nb -t -A -f "$SCHEMA" 2>&1 | grep -o 'A different table called "public.tasks"[^\n]*' | head -c 92)…"
echo "  their table untouched -> rls enabled: $(psql_nb -t -A -c "select relrowsecurity from pg_class where oid='public.tasks'::regclass")"
echo "  nothing else created  -> portals table exists: $(psql_nb -t -A -c "select to_regclass('public.portals') is not null")"

echo
echo "ALL CHECKS COMPLETE"
