#!/usr/bin/env node
/* The access-management function, exercised against a stub Supabase.

   This function holds the service-role key, which bypasses RLS entirely — so
   the database can no longer be the thing that says no. Every refusal has to be
   its own code here, and each one is asserted below. A bug in this file is not
   a broken button; it is one client's staff editing another client's plan. */

import http from 'node:http';
import assert from 'node:assert/strict';

const PORT = 8781;

/* Ids are real UUIDs because @supabase/auth-js validates them — a fixture with
   'staff-id' passes here and fails in production, which is worse than useless.

   The function reads its environment at module load, so the environment has to
   exist BEFORE it is imported — a static import is hoisted above these lines
   and would capture an empty config. */
process.env.SUPABASE_URL = `http://127.0.0.1:${PORT}`;
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
const { default: handler } = await import('../netlify/functions/team.mjs');

const PORTAL = { id: 'p-1', slug: 'resonate', tenant: 'resonate', client_name: 'Resonate Church' };
const USERS = {
  '11111111-1111-1111-1111-111111111111': { id: '11111111-1111-1111-1111-111111111111', email: 'alan@goodworkatlanta.co', app_metadata: { gw_tenant: '*' } },
  '22222222-2222-2222-2222-222222222222': { id: '22222222-2222-2222-2222-222222222222', email: 'staff@resonate.org', app_metadata: { gw_tenant: 'resonate' } },
  '33333333-3333-3333-3333-333333333333': { id: '33333333-3333-3333-3333-333333333333', email: 'someone@elsewhere.org', app_metadata: { gw_tenant: 'agape' } },
};
let members = [{ portal_id: 'p-1', user_id: '22222222-2222-2222-2222-222222222222', email: 'staff@resonate.org', role: 'staff' }];
let created = [];
let updatedMeta = [];

/* Enough of Supabase's REST + admin surface for the real client library. */
const srv = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    const send = (code, out) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); };
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

    if (url.pathname === '/auth/v1/user') {
      const u = USERS[auth];
      return u ? send(200, u) : send(401, { message: 'bad jwt' });
    }
    if (url.pathname === '/auth/v1/admin/users' && req.method === 'GET') {
      return send(200, { users: Object.values(USERS), aud: 'authenticated' });
    }
    if (url.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
      const u = { id: `44444444-4444-4444-4444-${String(created.length).padStart(12, '0')}`, email: body.email, app_metadata: body.app_metadata || {} };
      USERS[u.id] = u;
      created.push(u);
      return send(200, u);
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/')) {
      const id = url.pathname.split('/').pop();
      if (req.method === 'PUT') {
        updatedMeta.push({ id, app_metadata: body.app_metadata });
        USERS[id].app_metadata = body.app_metadata;
        return send(200, USERS[id]);
      }
      return send(200, USERS[id] || null);
    }
    if (url.pathname === '/rest/v1/portals') {
      const slug = (url.searchParams.get('slug') || '').replace('eq.', '');
      return send(200, slug === 'resonate' ? [PORTAL] : []);
    }
    if (url.pathname === '/rest/v1/portal_members') {
      const uid = (url.searchParams.get('user_id') || '').replace('eq.', '');
      if (req.method === 'GET') {
        return send(200, uid ? members.filter((m) => m.user_id === uid) : members);
      }
      if (req.method === 'POST') {
        const rows = Array.isArray(body) ? body : [body];
        rows.forEach((r) => {
          const i = members.findIndex((m) => m.user_id === r.user_id);
          if (i >= 0) members[i] = { ...members[i], ...r }; else members.push(r);
        });
        return send(201, rows);
      }
      if (req.method === 'PATCH') {
        members = members.map((m) => (m.user_id === uid ? { ...m, ...body } : m));
        return send(200, []);
      }
      if (req.method === 'DELETE') {
        members = members.filter((m) => m.user_id !== uid);
        return send(204, null);
      }
    }
    send(404, { message: 'stub: ' + req.method + ' ' + url.pathname });
  });
});
await new Promise((r) => srv.listen(PORT, r));

const post = (token, body) =>
  handler(new Request('http://x/.netlify/functions/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }));

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};

console.log('refusals — the whole point of this function');

await test('no token is refused', async () => {
  assert.equal((await post(null, { portalSlug: 'resonate', action: 'list' })).status, 401);
});

await test('a token Supabase does not recognise is refused', async () => {
  assert.equal((await post('forged', { portalSlug: 'resonate', action: 'list' })).status, 401);
});

await test('a signed-in NON-owner cannot list who has access', async () => {
  const r = await post('22222222-2222-2222-2222-222222222222', { portalSlug: 'resonate', action: 'list' });
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /owner/i);
});

await test('a signed-in non-owner cannot invite anyone', async () => {
  const r = await post('22222222-2222-2222-2222-222222222222', { portalSlug: 'resonate', action: 'invite', email: 'x@y.com', role: 'owner' });
  assert.equal(r.status, 403);
  assert.equal(created.length, 0, 'no account was created');
});

await test('someone from another tenant cannot touch this portal', async () => {
  assert.equal((await post('33333333-3333-3333-3333-333333333333', { portalSlug: 'resonate', action: 'list' })).status, 403);
});

await test('an unknown portal is a 404, not a leak', async () => {
  assert.equal((await post('11111111-1111-1111-1111-111111111111', { portalSlug: 'nope', action: 'list' })).status, 404);
});

console.log('\nwhat an owner can do');

await test('an owner lists members, and mis-tagged accounts are flagged', async () => {
  const r = await post('11111111-1111-1111-1111-111111111111', { portalSlug: 'resonate', action: 'list' });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const { members: list } = await r.json();
  const s = list.find((m) => m.email === 'staff@resonate.org');
  assert.equal(s.role, 'staff');
  assert.equal(s.tenantOk, true);
});

await test('inviting a new person creates the account AND tags the tenant', async () => {
  const r = await post('11111111-1111-1111-1111-111111111111', { portalSlug: 'resonate', action: 'invite', email: 'New@Resonate.org', role: 'board' });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.created, true);
  assert.equal(out.email, 'new@resonate.org', 'the address is normalised');
  const u = created.at(-1);
  assert.equal(u.app_metadata.gw_tenant, 'resonate', 'a missing gw_tenant is the failure that looks like a broken link');
  assert.ok(members.some((m) => m.user_id === u.id && m.role === 'board'));
});

await test('your own firm is tagged * so they reach every client', async () => {
  await post('11111111-1111-1111-1111-111111111111', { portalSlug: 'resonate', action: 'invite', email: 'junior@goodworkatlanta.co', role: 'staff', ownFirm: true });
  assert.equal(created.at(-1).app_metadata.gw_tenant, '*');
});

await test('an unknown role falls back to the least access, never the most', async () => {
  await post('11111111-1111-1111-1111-111111111111', { portalSlug: 'resonate', action: 'invite', email: 'sneaky@x.com', role: 'superuser' });
  assert.equal(members.find((m) => m.email === 'sneaky@x.com').role, 'board');
});

await test('inviting an EXISTING account never widens its reach', async () => {
  updatedMeta = [];
  await post('11111111-1111-1111-1111-111111111111', { portalSlug: 'resonate', action: 'invite', email: 'someone@elsewhere.org', role: 'board' });
  assert.equal(updatedMeta.length, 0, 'their gw_tenant was already set and must not be overwritten');
  assert.equal(USERS['33333333-3333-3333-3333-333333333333'].app_metadata.gw_tenant, 'agape');
});

await test('an owner cannot demote or remove themselves', async () => {
  members.push({ portal_id: 'p-1', user_id: '11111111-1111-1111-1111-111111111111', email: 'alan@goodworkatlanta.co', role: 'owner' });
  const a = await post('11111111-1111-1111-1111-111111111111', { portalSlug: 'resonate', action: 'setRole', email: 'alan@goodworkatlanta.co', role: 'board' });
  assert.equal(a.status, 400);
  const b = await post('11111111-1111-1111-1111-111111111111', { portalSlug: 'resonate', action: 'remove', email: 'alan@goodworkatlanta.co' });
  assert.equal(b.status, 400);
});

await test('removing someone revokes the portal, not the account', async () => {
  const before = Object.keys(USERS).length;
  const r = await post('11111111-1111-1111-1111-111111111111', { portalSlug: 'resonate', action: 'remove', email: 'staff@resonate.org' });
  assert.equal(r.status, 200);
  assert.ok(!members.some((m) => m.user_id === '22222222-2222-2222-2222-222222222222'), 'access removed');
  assert.equal(Object.keys(USERS).length, before, 'the account itself survives — it may belong to another client');
});

await test('without a service key it says so instead of half-working', async () => {
  const keep = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mod = await import('../netlify/functions/team.mjs?fresh=' + Date.now());
  const r = await mod.default(new Request('http://x/', {
    method: 'POST', headers: { Authorization: 'Bearer owner-id', 'Content-Type': 'application/json' },
    body: JSON.stringify({ portalSlug: 'resonate', action: 'list' }),
  }));
  assert.equal(r.status, 501);
  assert.match((await r.json()).error, /add-member\.sql/);
  process.env.SUPABASE_SERVICE_ROLE_KEY = keep;
});

srv.closeAllConnections?.();
srv.close();
console.log(`\n${passed} passed`);
if (process.exitCode) console.error('SOME TESTS FAILED');
else console.log('TEAM FUNCTION PASSED');
process.exit(process.exitCode || 0);
