-- Give somebody access to a portal. Run in the Supabase SQL editor.
--
-- The easy way is the app: open the portal, press Access, type their address.
-- That needs SUPABASE_SERVICE_ROLE_KEY on the Netlify site. This file is the
-- way to do the same thing without it.
--
-- Two steps:
--
--   1. The ACCOUNT must exist. Authentication -> Users -> Add user ->
--      Create new user. Their email, any password (they never use it — sign-in
--      is an emailed code), and tick Auto Confirm User.
--
--   2. Then this file, with their address and what they may DO in the portal:
--         owner  — edits everything and manages who has access
--         staff  — runs the workplan: status, owners, dates, notes
--         board  — reads everything, writes nothing (board members, funders,
--                  guests, and the client's own team where they only read)
--
-- An account with no tag yet is tagged for this portal's client, which is what
-- lets it see the portal at all. An account that already has a tag keeps it:
-- this file never widens anyone's reach, and never hands out "*" (your own
-- firm, every client). Tag your own colleagues "*" by hand, deliberately.

do $$
declare
  -- ----------------------------------------------------------------- edit me
  v_slug  text := 'paact';
  v_email text := 'someone@example.org';
  v_role  text := 'board';          -- owner | staff | board
  -- -------------------------------------------------------------------------
  v_portal uuid;
  v_tenant text;
  v_user   uuid;
  v_tag    text;
begin
  select id, lower(tenant) into v_portal, v_tenant from portals where slug = v_slug;
  if v_portal is null then
    raise exception 'No portal "%". Run its supabase/clients/%.sql first.', v_slug, v_slug;
  end if;

  select id, coalesce(raw_app_meta_data ->> 'gw_tenant', '')
    into v_user, v_tag
    from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception
      'No account for %. Create it first: Authentication -> Users -> Add user -> Create new user (tick Auto Confirm User), then run this again.',
      v_email;
  end if;

  if v_tag = '' then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                               || jsonb_build_object('gw_tenant', v_tenant, 'gw_role', 'viewer')
     where id = v_user;
  elsif v_tag <> '*' and lower(v_tag) <> v_tenant then
    raise warning '% is tagged gw_tenant = "%" and this portal is "%": they will see nothing here until that changes.',
      v_email, v_tag, v_tenant;
  end if;

  insert into portal_members (portal_id, user_id, email, role)
  values (v_portal, v_user, lower(v_email), v_role)
  on conflict (portal_id, user_id) do update set role = excluded.role;

  raise notice '% can now open /% as %', v_email, v_slug, v_role;
end $$;

-- Who can open the portal now. Change the slug to match the one above.
select m.email as person, m.role,
       coalesce(u.raw_app_meta_data ->> 'gw_tenant', '(none)') as tag
  from portal_members m
  join portals p on p.id = m.portal_id
  join auth.users u on u.id = m.user_id
 where p.slug = 'paact'
 order by m.role, m.email;
