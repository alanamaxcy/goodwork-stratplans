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
-- raw_app_meta_data is where Supabase keeps app_metadata: the gw_tenant tag
-- the generated client files read and fill in.
create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb not null default '{}'::jsonb);
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
update auth.users set raw_app_meta_data = '{"gw_tenant":"*","gw_role":"admin"}' where email = 'alan@goodworkatlanta.co';
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
echo "=== a client's portal in one paste: supabase/clients/paact.sql ==="
# Everything from here ASSERTS: a wrong answer stops the script.
CLIENT_SQL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/clients/paact.sql"
ADD_MEMBER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/add-member.sql"
expect() { # label, expected, actual
  if [[ "$3" == "$2" ]]; then echo "  ok    $1 -> $3"
  else echo "  FAIL  $1 -> expected [$2], got [$3]"; exit 1; fi
}
q() { psql -t -A -c "$1"; }
# as_user, without the "SET" command tags its two set-locals print first.
asq() { as_user "$@" | sed -E 's/^(SET)+//'; }
GINA=66666666-6666-6666-6666-666666666666
SHAWNELL=77777777-7777-7777-7777-777777777777
psql -q <<'SQL'
insert into auth.users (id, email, raw_app_meta_data) values
  ('66666666-6666-6666-6666-666666666666','gina@hti.example','{"gw_tenant":"paact","gw_role":"viewer"}'),
  ('77777777-7777-7777-7777-777777777777','shawnell@paact.example','{"gw_tenant":"paact","gw_role":"viewer"}'),
  ('88888888-8888-8888-8888-888888888888','untagged@hti.example','{}'),
  ('99999999-9999-9999-9999-999999999999','someone@agape.org','{"gw_tenant":"agape","gw_role":"admin"}');
SQL

out="$(sed "s/'alan@goodworkatlanta.co'/'nobody@nowhere.example'/" "$CLIENT_SQL" | psql -q 2>&1 || true)"
expect "no owner account: refused"        "yes" "$(grep -q 'No account for nobody@nowhere.example' <<<"$out" && echo yes || echo no)"
expect "...and nothing was created"       "0"   "$(q "select count(*) from portals where slug='paact'")"

expect "the paste, and what it shows"     "paact|5|alan@goodworkatlanta.co|owner|*" "$(psql -q -t -A -f "$CLIENT_SQL" 2>/dev/null | tail -1)"
expect "section 01, and only it"          '["scope"]' "$(q "select sections::text from portals where slug='paact'")"
expect "39 deliverables, 2 already ticked" "39|2" "$(q "select count(*)||'|'||count(*) filter (where (d->>'done')::boolean) from portals, jsonb_array_elements(engagement->'phases') ph, jsonb_array_elements(ph->'deliverables') d where slug='paact'")"
expect "a * account keeps its tag"        "*"   "$(q "select raw_app_meta_data->>'gw_tenant' from auth.users where email='alan@goodworkatlanta.co'")"

as_user 11111111-1111-1111-1111-111111111111 '*' alan@goodworkatlanta.co "update portals set engagement = jsonb_set(engagement, '{planHorizon}', '\"Edited in the app\"') where slug='paact'" >/dev/null
psql -q -f "$CLIENT_SQL" >/dev/null 2>&1
expect "an edit made in the app survives a re-run" "Edited in the app" "$(q "select engagement->>'planHorizon' from portals where slug='paact'")"
q "update portal_members set role='board' where email='alan@goodworkatlanta.co' and portal_id=(select id from portals where slug='paact')" >/dev/null
psql -q -f "$CLIENT_SQL" >/dev/null 2>&1
expect "a role changed in the app survives a re-run" "board" "$(q "select m.role from portal_members m join portals p on p.id=m.portal_id where p.slug='paact' and m.email='alan@goodworkatlanta.co'")"
q "update portal_members set role='owner' where email='alan@goodworkatlanta.co' and portal_id=(select id from portals where slug='paact')" >/dev/null

sed "s/'alan@goodworkatlanta.co'/'untagged@hti.example'/" "$CLIENT_SQL" | psql -q >/dev/null 2>&1
expect "an untagged owner is tagged for this client, never *" "paact|viewer" "$(q "select (raw_app_meta_data->>'gw_tenant')||'|'||(raw_app_meta_data->>'gw_role') from auth.users where email='untagged@hti.example'")"

P2=$(q "select id from portals where slug='paact'")
psql -q -c "insert into portal_members (portal_id,user_id,email,role) values ('$P2','$GINA','gina@hti.example','owner'), ('$P2','$SHAWNELL','shawnell@paact.example','board')"

echo
echo "=== saving section 01: one version at a time ==="
# The app's save: change the document only if the row is still on the version
# the change was built from. "0" is a collision or a refusal; the app tells
# them apart by re-reading.
cas() { # sub tenant email version-expression
  asq "$1" "$2" "$3" "with u as (update portals set engagement = jsonb_set(engagement,'{convener}','\"$3\"') where id='$P2' and updated_at = $4 returning 1) select count(*) from u"
}
CURRENT="(select updated_at from portals where id='$P2')"
before=$(q "select updated_at from portals where id='$P2'")
expect "an owner saves on the current version"   "1" "$(cas $GINA paact gina@hti.example "$CURRENT")"
expect "...and the version moves"                "moved" "$([[ "$(q "select updated_at from portals where id='$P2'")" != "$before" ]] && echo moved || echo same)"
expect "a save built on an old version: 0 rows"  "0" "$(cas $GINA paact gina@hti.example "'2000-01-01'::timestamptz")"
expect "a board member cannot save"              "0" "$(cas $SHAWNELL paact shawnell@paact.example "$CURRENT")"
expect "...but can read it"                      "1" "$(asq $SHAWNELL paact shawnell@paact.example "select count(*) from portals where slug='paact'")"
expect "...and nobody else's"                    "0" "$(asq $SHAWNELL paact shawnell@paact.example "select count(*) from portals where slug='resonate'")"
expect "another client's staff cannot read it"   "0" "$(asq 22222222-2222-2222-2222-222222222222 resonate staff@resonate.org "select count(*) from portals where slug='paact'")"
expect "an owner of PAACT cannot edit Resonate"  "0" "$(asq $GINA paact gina@hti.example "with u as (update portals set client_name='x' where slug='resonate' returning 1) select count(*) from u")"
expect "portal saves are published to realtime"  "1" "$(q "select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='portals'")"

echo
echo "=== add-member.sql ==="
sed "s/'someone@example.org'/'someone@agape.org'/" "$ADD_MEMBER" | psql -q >/dev/null 2>&1
expect "a mis-tagged account is added but keeps its tag" "board|agape" "$(q "select m.role||'|'||(u.raw_app_meta_data->>'gw_tenant') from portal_members m join auth.users u on u.id=m.user_id where m.portal_id='$P2' and u.email='someone@agape.org'")"
psql -q -c "insert into auth.users (id, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','new.board@paact.example')"
sed "s/'someone@example.org'/'new.board@paact.example'/" "$ADD_MEMBER" | psql -q >/dev/null 2>&1
expect "an untagged account is tagged and added"  "board|paact" "$(q "select m.role||'|'||(u.raw_app_meta_data->>'gw_tenant') from portal_members m join auth.users u on u.id=m.user_id where m.portal_id='$P2' and u.email='new.board@paact.example'")"
out="$(sed "s/'someone@example.org'/'ghost@paact.example'/" "$ADD_MEMBER" | psql -q 2>&1 || true)"
expect "no account: refused with directions"      "yes" "$(grep -q 'Create it first' <<<"$out" && echo yes || echo no)"

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
