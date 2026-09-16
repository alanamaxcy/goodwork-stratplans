#!/usr/bin/env node
/* Proves supabase/seed.mjs works with NO service-role key: it signs in as a
   person and writes through RLS. Runs the real script against a stub that
   speaks Supabase's REST and auth surface, then asserts what it sent. */

import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/* MUST be async: this process is also the stub server, and execFileSync would
   block its event loop, so the child's request could never be answered. */
const run = promisify(execFile);

const root = path.resolve(import.meta.dirname, '..');
const PORT = 8779;

const PORTAL_ID = '00000000-0000-0000-0000-0000000000aa';

/* supabase-js decodes the access token to read its expiry, so the fixture has
   to be a well-formed JWT. It is never verified by anything here — the stub
   accepts any bearer — so it is unsigned on purpose. */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
  sub: '1', email: 'alan@goodworkatlanta.co', role: 'authenticated', aud: 'authenticated',
  app_metadata: { gw_tenant: '*' }, exp: Math.floor(Date.now() / 1000) + 3600,
})}.`;
const USER = { id: '1', email: 'alan@goodworkatlanta.co', app_metadata: { gw_tenant: '*' }, aud: 'authenticated', role: 'authenticated' };

const got = { portalPatch: null, taskBatches: [] };
let portalVisible = true;

const srv = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    const send = (code, out) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    };

    if (url.pathname.startsWith('/auth/v1/user')) return send(200, USER);
    if (url.pathname.startsWith('/auth/v1/token')) {
      return send(200, { access_token: 'stub', token_type: 'bearer', expires_in: 3600, refresh_token: 'stub', user: USER });
    }
    if (url.pathname === '/rest/v1/portals') {
      if (req.method === 'GET') return send(200, portalVisible ? [{ id: PORTAL_ID }] : []);
      if (req.method === 'PATCH') { got.portalPatch = body; return send(200, [body]); }
    }
    if (url.pathname === '/rest/v1/tasks' && req.method === 'POST') {
      got.taskBatches.push(body);
      return send(201, body);
    }
    send(404, { message: 'stub: ' + req.method + ' ' + url.pathname });
  });
});

srv.on('error', (e) => { console.error('STUB LISTEN ERROR:', e.message); process.exit(1); });
await new Promise((r) => srv.listen(PORT, r));

const env = {
  ...process.env,
  VITE_SUPABASE_URL: `http://127.0.0.1:${PORT}`,
  VITE_SUPABASE_ANON_KEY: 'stub-anon',
};

const { stdout: out } = await run('node', ['supabase/seed.mjs', '--slug', 'resonate', '--token', TOKEN], {
  cwd: root, env, encoding: 'utf8',
});
console.log(out.trim());

/* ---- what actually went over the wire ---- */
const patch = got.portalPatch || {};
const parents = got.taskBatches[0] || [];
const children = got.taskBatches[1] || [];

const results = {
  wroteNoServiceKey: !('SUPABASE_SERVICE_ROLE_KEY' in env) || !env.SUPABASE_SERVICE_ROLE_KEY,
  planPriorities: patch.plan?.priorities?.length ?? 0,
  findingThemes: patch.findings?.themes?.length ?? 0,
  phases: patch.engagement?.phases?.length ?? 0,
  parentBatch: parents.length,
  childBatch: children.length,
  parentsHaveNoParent: parents.every((r) => r.parent_id === null),
  childrenAllHaveParent: children.length > 0 && children.every((r) => !!r.parent_id),
  noPseudoLateStatus: [...parents, ...children].every((r) => ['next', 'doing', 'done', 'blocked'].includes(r.status)),
};

/* ---- and that it fails usefully when the portal is not visible ---- */
portalVisible = false;
let refusal = '';
try {
  await run('node', ['supabase/seed.mjs', '--slug', 'nope', '--token', TOKEN], { cwd: root, env, encoding: 'utf8' });
} catch (e) {
  refusal = (e.stderr || '').trim();
}
results.refusesUnknownPortal = /bootstrap\.sql/.test(refusal);

/* supabase-js leaves a keep-alive socket open, and close() waits for it —
   drop the connections or this harness never exits. */
srv.closeAllConnections?.();
srv.close();
console.log('\n' + JSON.stringify(results, null, 1));

const fail = [];
if (!results.planPriorities) fail.push('plan document not written');
if (!results.findingThemes) fail.push('findings not written');
if (!results.parentBatch || !results.childBatch) fail.push('tasks not written in two batches');
if (!results.parentsHaveNoParent) fail.push('a parent batch row carried a parent_id');
if (!results.childrenAllHaveParent) fail.push('a subtask batch row had no parent_id');
if (!results.noPseudoLateStatus) fail.push('a pseudo "late" status was persisted');
if (!results.refusesUnknownPortal) fail.push('did not point at bootstrap.sql for an unknown portal');

if (fail.length) { console.error('\nFAILED:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nSEED PASSED — no service-role key involved');
process.exit(0);
