-- Give somebody access to a portal. Run in the Supabase SQL editor.
--
-- Two steps, and the first is the one people forget:
--
--   1. The ACCOUNT must exist. Authentication → Users → Add user, then open it
--      and set App metadata:
--         { "gw_role": "staff", "gw_tenant": "resonate" }
--      Your own team gets { "gw_role": "admin", "gw_tenant": "*" } instead —
--      that reaches every client.
--
--      A missing gw_tenant locks them out of a portal they should reach, and it
--      looks like a broken link rather than a missing tag.
--
--   2. Then this file, which says what they may DO inside that portal:
--         owner  — edits the plan document and the workplan   (you)
--         staff  — runs the workplan: status, owners, dates, notes
--         board  — reads everything, writes nothing           (board members,
--                                                              funders, guests)
--
-- Adding somebody as `board` is how you show a real portal to someone without
-- giving them the ability to change it, and without putting anything on a
-- public URL.

do $$
declare
  -- ----------------------------------------------------------------- edit me
  v_slug  text := 'resonate';
  v_email text := 'someone@example.org';
  v_role  text := 'board';          -- owner | staff | board
  -- -------------------------------------------------------------------------
  v_portal uuid;
  v_user   uuid;
begin
  select id into v_portal from portals where slug = v_slug;
  if v_portal is null then
    raise exception 'No portal "%". Run bootstrap.sql first.', v_slug;
  end if;

  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception
      'No account for %. Create it in Authentication -> Users first, and tag its App metadata with gw_role and gw_tenant.',
      v_email;
  end if;

  insert into portal_members (portal_id, user_id, email, role)
  values (v_portal, v_user, v_email, v_role)
  on conflict (portal_id, user_id) do update set role = excluded.role;

  raise notice '% can now open /% as %', v_email, v_slug, v_role;
end $$;

-- Who can reach this portal today:
--   select m.email, m.role from portal_members m
--     join portals p on p.id = m.portal_id where p.slug = 'resonate'
--   order by m.role, m.email;
