/* Managing who can reach a portal.

   This is the one operation that cannot happen in the browser: creating an
   account and tagging it needs Supabase's admin API, and that key must never
   reach a bundle. So it lives here, server-side, in SUPABASE_SERVICE_ROLE_KEY —
   set on the Netlify site, never in VITE_* (which Vite would compile into the
   page) and never in the repo.

   Every call re-verifies the caller against Supabase and re-checks that they
   own the portal they are asking about. The browser's claim to be an owner is
   not evidence; this function never trusts the client for anything but the
   portal slug.

   Two tags matter, and both are set here so nobody hand-edits JSON:
     gw_role    admin | staff   — kept for the Impact Suite's convention
     gw_tenant  the portal's tenant, or "*" for your own firm's staff

   A missing gw_tenant is the classic failure: the person signs in fine and then
   sees nothing, which looks like a broken link rather than a missing tag. */

import { createClient } from '@supabase/supabase-js';

const URL_ = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ROLES = ['owner', 'staff', 'board'];

const json = (code, body) =>
  new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!URL_ || !ANON) return json(500, { error: 'This deploy has no Supabase project configured.' });
  if (!SERVICE) {
    return json(501, {
      error:
        'Managing people needs SUPABASE_SERVICE_ROLE_KEY on this Netlify site. ' +
        'Until it is set, use supabase/add-member.sql in the SQL editor.',
    });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Not signed in.' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request.' }); }
  const { portalSlug, action } = body || {};
  if (!portalSlug || !action) return json(400, { error: 'Bad request.' });

  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  /* 1. Who is actually calling? Supabase validates the token, not us. */
  const { data: who, error: whoErr } = await anon.auth.getUser(token);
  const caller = who?.user;
  if (whoErr || !caller) return json(401, { error: 'Not signed in.' });

  /* 2. Which portal, and does the caller own it? Same precedence as spp_role:
        an explicit membership row wins, and "*" falls back to owner. */
  const { data: portal } = await admin
    .from('portals').select('id, slug, tenant, client_name').eq('slug', portalSlug).maybeSingle();
  if (!portal) return json(404, { error: 'No such portal.' });

  const { data: mine } = await admin
    .from('portal_members').select('role').eq('portal_id', portal.id).eq('user_id', caller.id).maybeSingle();
  const isGw = (caller.app_metadata?.gw_tenant || '') === '*';
  const callerRole = mine?.role || (isGw ? 'owner' : null);
  if (callerRole !== 'owner') return json(403, { error: 'Only a portal owner can manage who has access.' });

  /* Accounts live in auth.users, which the client cannot read; the admin API
     can, and pages so a long list is not silently truncated. */
  async function findUser(email) {
    const target = String(email || '').trim().toLowerCase();
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const hit = (data.users || []).find((u) => (u.email || '').toLowerCase() === target);
      if (hit) return hit;
      if ((data.users || []).length < 200) return null;
    }
    return null;
  }

  try {
    if (action === 'list') {
      const { data: rows } = await admin
        .from('portal_members').select('user_id, email, role').eq('portal_id', portal.id);
      const out = [];
      for (const r of rows || []) {
        const { data: u } = await admin.auth.admin.getUserById(r.user_id);
        const meta = u?.user?.app_metadata || {};
        const tenant = meta.gw_tenant || '';
        out.push({
          email: r.email || u?.user?.email || '',
          role: r.role,
          lastSignIn: u?.user?.last_sign_in_at || null,
          tenant,
          /* The failure that looks like a broken link: the row exists, the
             account exists, and RLS still returns nothing because the tag
             does not match. Surface it rather than let them debug a link. */
          tenantOk: tenant === '*' || tenant.toLowerCase() === String(portal.tenant).toLowerCase(),
        });
      }
      out.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.email.localeCompare(b.email));
      return json(200, { members: out, portal: { slug: portal.slug, tenant: portal.tenant } });
    }

    if (action === 'invite') {
      const email = String(body.email || '').trim().toLowerCase();
      const role = ROLES.includes(body.role) ? body.role : 'board';
      const ownFirm = !!body.ownFirm;
      if (!/.+@.+\..+/.test(email)) return json(400, { error: 'That does not look like an email address.' });

      const tenant = ownFirm ? '*' : portal.tenant;
      const gwRole = role === 'owner' ? 'admin' : 'staff';

      let user = await findUser(email);
      let created = false;
      if (!user) {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: true, // they prove the address by receiving a sign-in code
          app_metadata: { gw_role: gwRole, gw_tenant: tenant },
        });
        if (error) throw error;
        user = data.user;
        created = true;
      } else {
        /* Never widen an existing account's reach silently: only fill in a tag
           that is missing, or narrow it to this portal's tenant if it is blank. */
        const meta = user.app_metadata || {};
        if (!meta.gw_tenant) {
          const { error } = await admin.auth.admin.updateUserById(user.id, {
            app_metadata: { ...meta, gw_role: meta.gw_role || gwRole, gw_tenant: tenant },
          });
          if (error) throw error;
        }
      }

      const { error: mErr } = await admin.from('portal_members').upsert(
        { portal_id: portal.id, user_id: user.id, email, role },
        { onConflict: 'portal_id,user_id' },
      );
      if (mErr) throw mErr;

      return json(200, { ok: true, created, email, role });
    }

    if (action === 'setRole') {
      const email = String(body.email || '').trim().toLowerCase();
      const role = ROLES.includes(body.role) ? body.role : null;
      if (!role) return json(400, { error: 'Unknown role.' });
      const user = await findUser(email);
      if (!user) return json(404, { error: 'No account for that address.' });
      if (user.id === caller.id && role !== 'owner') {
        return json(400, { error: 'You cannot remove your own ownership — ask another owner to do it.' });
      }
      const { error } = await admin.from('portal_members')
        .update({ role }).eq('portal_id', portal.id).eq('user_id', user.id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (action === 'remove') {
      const email = String(body.email || '').trim().toLowerCase();
      const user = await findUser(email);
      if (!user) return json(404, { error: 'No account for that address.' });
      if (user.id === caller.id) return json(400, { error: 'You cannot remove yourself.' });
      /* Removes access to THIS portal. The account itself is left alone — it may
         belong to another client, and deleting people is not this button's job. */
      const { error } = await admin.from('portal_members')
        .delete().eq('portal_id', portal.id).eq('user_id', user.id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    return json(500, { error: e.message || 'Something went wrong.' });
  }
}
