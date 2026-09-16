#!/usr/bin/env node
/* End-to-end smoke test.
   Stands up a stub that speaks enough of Supabase's REST and auth surface for
   the real @supabase/supabase-js client to talk to it, serves the real built
   bundle, then drives the real sign-in flow and asserts every section renders
   from the data the "database" returned.

   This is not a mock of our own code — App, the store layer and supabase-js all
   run for real. Only Postgres is replaced. RLS is covered separately by
   supabase/test-rls.sh, which uses an actual Postgres. */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const root = path.resolve(import.meta.dirname, '..');
const API_PORT = 8777;
const WEB_PORT = 8778;

/* ---------- the data the stub serves ---------- */
function readBundle(file, global) {
  const win = {};
  new Function('window', fs.readFileSync(path.join(root, 'data', file), 'utf8'))(win);
  return win[global];
}
const P = readBundle('plan.js', 'PORTAL');
const F = readBundle('findings.js', 'FINDINGS');

const PORTAL_ID = '00000000-0000-0000-0000-0000000000aa';
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'alan@goodworkatlanta.co', app_metadata: { gw_tenant: '*', gw_role: 'admin' } };

const portalRow = {
  id: PORTAL_ID, slug: 'resonate', client_name: P.client.name, place: P.client.place,
  engagement_name: P.client.engagement, adopted: P.client.adopted,
  brand: {}, labels: {}, sections: ['scope', 'plan', 'findings', 'workplan', 'dashboard'],
  engagement: { phases: P.phases, scope: P.scope, firm: P.firm },
  plan: { vision: P.plan.vision, framing: P.plan.framing, priorities: P.plan.priorities, track: P.plan.track },
  findings: F,
};
let taskRows = P.tasks.map((t, i) => ({
  portal_id: PORTAL_ID, id: t.id, parent_id: t.parent || null, initiative: t.obj,
  title: t.title, owner_name: t.owner, start_date: t.start, due_date: t.due,
  status: t.status === 'late' ? 'next' : t.status, note: '', position: i,
}));

const writes = [];

/* ---------- stub API ---------- */
const api = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${API_PORT}`);
  const send = (code, body) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(200, {});

  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};

    if (url.pathname === '/auth/v1/otp') return send(200, {});
    if (url.pathname === '/auth/v1/verify' || url.pathname === '/auth/v1/token') {
      return send(200, {
        access_token: 'stub-token', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'stub-refresh', user: USER,
      });
    }
    if (url.pathname === '/auth/v1/user') return send(200, USER);
    if (url.pathname === '/auth/v1/logout') return send(204, {});

    if (url.pathname === '/rest/v1/portals') {
      if (req.method === 'GET') {
        const slug = (url.searchParams.get('slug') || '').replace('eq.', '');
        const rows = !slug || slug === 'resonate' ? [portalRow] : [];
        return send(200, rows);
      }
      return send(200, []);
    }
    if (url.pathname === '/rest/v1/portal_members') return send(200, [{ role: 'owner' }]);
    if (url.pathname === '/rest/v1/tasks') {
      if (req.method === 'GET') return send(200, taskRows);
      const incoming = Array.isArray(body) ? body : [body];
      incoming.forEach((r) => {
        writes.push(r);
        const i = taskRows.findIndex((t) => t.id === r.id);
        if (i >= 0) taskRows[i] = { ...taskRows[i], ...r };
        else taskRows.push(r);
      });
      return send(201, incoming);
    }
    send(404, { message: 'stub: no route ' + url.pathname });
  });
});

/* ---------- serve the built bundle ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json' };
const web = http.createServer((req, res) => {
  const clean = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(root, 'dist', clean);
  // One deploy, many portals: every unknown path is the app, as netlify.toml does.
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'dist', 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/* ---------- run ---------- */
console.log('building against the stub…');
execSync('npm run build', {
  cwd: root,
  stdio: 'pipe',
  env: { ...process.env, VITE_SUPABASE_URL: `http://127.0.0.1:${API_PORT}`, VITE_SUPABASE_ANON_KEY: 'stub-anon-key' },
});

await new Promise((r) => api.listen(API_PORT, r));
await new Promise((r) => web.listen(WEB_PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1050 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  // the stub speaks no websocket; realtime failing is expected and must not break the app
  if (m.type() === 'error' && !/WebSocket|realtime|Failed to load resource/i.test(t)) errs.push(t);
});

const results = {};
const shot = (n) => page.screenshot({ path: path.join(root, `test/shot-${n}.png`) });

await page.goto(`http://127.0.0.1:${WEB_PORT}/resonate`, { waitUntil: 'networkidle' });
results.signInShown = await page.isVisible('text=Sign in');
await shot('01-signin');

await page.fill('#email', 'alan@goodworkatlanta.co');
await page.click('button:has-text("Send code")');
await page.waitForSelector('#code');
await page.fill('#code', '123456');
await page.click('button:has-text("Sign in")');
await page.waitForSelector('.masthead', { timeout: 10000 });
await page.waitForTimeout(600);

results.brand = await page.textContent('.brand-name');
results.role = await page.textContent('.mast-right .eyebrow');
results.railSections = await page.$$eval('.railnav .rn-t', (n) => n.map((x) => x.textContent));
results.planH2 = await page.textContent('.shead h2');
results.kpiRows = await page.$$eval('.kpi', (n) => n.length);
await shot('02-plan');

await page.click('.railnav [aria-current="false"] >> nth=0'); // scope
await page.waitForTimeout(300);
results.scopeH2 = await page.textContent('.shead h2');

await page.click('.railnav button:has-text("Findings")');
await page.waitForTimeout(400);
results.themeRows = await page.$$eval('.themerow', (n) => n.length);
await page.click('.themerow >> nth=0');
await page.waitForTimeout(300);
results.themeOpened = await page.textContent('.theme-detail h3');
await shot('03-finding');

await page.click('.railnav button:has-text("Workplan")');
await page.waitForTimeout(400);
results.taskRows = await page.$$eval('.task:not(.sub)', (n) => n.length);
await page.click('.twist >> nth=0');
await page.waitForTimeout(250);
results.subRows = await page.$$eval('.task.sub', (n) => n.length);

// a real write, through the real client, to the stub
const before = await page.getAttribute('.task:not(.sub) .dot', 'class');
await page.click('.task:not(.sub) .statusbtn');
await page.waitForTimeout(600);
results.statusChanged = before !== (await page.getAttribute('.task:not(.sub) .dot', 'class'));
results.writeReachedServer = writes.length > 0;
results.writeShape = writes[0] ? Object.keys(writes[0]).sort().join(',') : '(none)';
await shot('04-workplan');

await page.click('#subnav [data-sub="P2"]');
await page.waitForTimeout(400);
results.scopedOnlyP2 = await page.$$eval('.ig-id', (n) => n.every((x) => x.textContent.startsWith('2.')));

await page.click('#subnav [data-sub="all"]');
await page.click('.railnav button:has-text("Dashboard")');
await page.waitForTimeout(500);
results.charts = await page.$$eval('.chart', (n) => n.length);
results.svgRects = await page.$$eval('.chart svg rect', (n) => n.length);
results.dashTiles = await page.$$eval('.tile .tv', (n) => n.map((x) => x.textContent));
await shot('05-dashboard');

// a portal this account cannot reach must show nothing, not someone else's data
await page.goto(`http://127.0.0.1:${WEB_PORT}/someoneelse`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
results.unknownPortalBlocked = !(await page.isVisible('.masthead'));
results.unknownPortalMessage = (await page.textContent('.splash-card h1').catch(() => '')) || '';
await shot('06-no-access');

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto(`http://127.0.0.1:${WEB_PORT}/resonate`, { waitUntil: 'networkidle' });
await phone.waitForTimeout(500);
results.phoneHScroll = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

await browser.close();
api.close();
web.close();

console.log(JSON.stringify(results, null, 1));
console.log('\npage errors:', errs.length ? errs : 'none');

const failures = [];
if (!results.signInShown) failures.push('sign-in screen did not render');
if (results.railSections?.length !== 5) failures.push('expected 5 sections');
if (!results.kpiRows) failures.push('no KPIs rendered from the plan document');
if (!results.themeRows) failures.push('no findings rendered');
if (!results.taskRows) failures.push('no tasks rendered');
if (!results.subRows) failures.push('subtasks did not expand');
if (!results.statusChanged) failures.push('status did not advance');
if (!results.writeReachedServer) failures.push('the write never reached the server');
if (!results.scopedOnlyP2) failures.push('scoping leaked other priorities');
if (results.charts !== 4) failures.push('expected 4 dashboard charts');
if (!results.unknownPortalBlocked) failures.push('an unreachable portal still rendered');
if (results.phoneHScroll) failures.push('horizontal scroll at 390px');
if (errs.length) failures.push('page errors: ' + errs.join(' | '));

if (failures.length) {
  console.error('\nFAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('\nSMOKE PASSED');
