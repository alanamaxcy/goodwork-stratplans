-- Bootstrap one portal. Paste this into the Supabase SQL editor AFTER
-- schema.sql, once per client.
--
-- Why this exists: creating the first portal is the one write that RLS is
-- built to refuse — there is no member row yet, so nobody is its owner. The
-- usual answer is a service-role key, which then has to live somewhere. In the
-- SQL editor you are already superuser, so no key is created, shared, or
-- stored. Edit the four values below and run it.
--
-- Afterwards `npm run seed` loads the plan, findings and workplan as YOU,
-- signed in normally. The service-role key never enters the picture.

do $$
declare
  -- ----------------------------------------------------------------- edit me
  v_slug        text := 'resonate';                 -- the URL: /resonate
  v_tenant      text := 'resonate';                 -- must match users' gw_tenant
  v_client      text := 'Resonate Church';
  v_engagement  text := 'Strategic Plan 2026–2028';
  v_place       text := 'Belvedere Park · Decatur, GA';
  v_owner_email text := 'alan@goodworkatlanta.co';  -- must already exist in auth.users
  -- -------------------------------------------------------------------------
  v_portal uuid;
  v_user   uuid;
begin
  insert into portals (slug, tenant, client_name, place, engagement_name, sections)
  values (v_slug, v_tenant, v_client, v_place, v_engagement,
          '["scope","plan","findings","workplan","dashboard"]'::jsonb)
  on conflict (slug) do update
    set client_name = excluded.client_name,
        place = excluded.place,
        engagement_name = excluded.engagement_name
  returning id into v_portal;

  select id into v_user from auth.users where lower(email) = lower(v_owner_email);

  if v_user is null then
    raise exception
      'No account for %. Create it first: Authentication -> Users -> Add user, then set App metadata {"gw_role":"admin","gw_tenant":"*"} and re-run.',
      v_owner_email;
  end if;

  insert into portal_members (portal_id, user_id, email, role)
  values (v_portal, v_user, v_owner_email, 'owner')
  on conflict (portal_id, user_id) do update set role = 'owner';

  raise notice 'portal % ready (%). owner: %', v_slug, v_portal, v_owner_email;
  raise notice 'now run:  npm run seed -- --slug %', v_slug;
end $$;

-- ---------------------------------------------------------------------------
-- Adding the rest of the client's people, later. Each needs an account in
-- Authentication -> Users tagged { "gw_role": "staff", "gw_tenant": "<tenant>" },
-- then one row here. `staff` runs the workplan; `board` reads only.
--
--   insert into portal_members (portal_id, user_id, email, role)
--   select p.id, u.id, u.email, 'staff'
--     from portals p, auth.users u
--    where p.slug = 'resonate' and u.email = 'someone@theirchurch.org'
--   on conflict (portal_id, user_id) do update set role = excluded.role;
-- ---------------------------------------------------------------------------
