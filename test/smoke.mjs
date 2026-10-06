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
/* Playwright is resolved, not hard-coded. This used to import
   /opt/node22/lib/node_modules/playwright/index.mjs — an absolute path that
   exists in the dev container and nowhere else, so CI's build-and-smoke job
   died on ERR_MODULE_NOT_FOUND before a single assertion ran, while the same
   file passed locally. Try the normal specifier first (CI installs the
   package), fall back to the container's copy. */
const { chromium } = await (async () => {
  try { return await import('playwright'); } catch (e) {
    return import('/opt/node22/lib/node_modules/playwright/index.mjs');
  }
})();

const root = path.resolve(import.meta.dirname, '..');
const API_PORT = 8777;
const WEB_PORT = 8778;
const WEB_PORT_FILE = 8780;

/* ---------- the data the stub serves ---------- */
const { PORTAL: P } = await import(path.join(root, 'clients', 'resonate', 'plan.js'));
const { FINDINGS: F } = await import(path.join(root, 'clients', 'resonate', 'findings.js'));
const { PORTAL: PAACT_FILE } = await import(path.join(root, 'clients', 'paact', 'plan.js'));
const ENG = await import(path.join(root, 'src', 'lib', 'engagement.js'));

const PORTAL_ID = '00000000-0000-0000-0000-0000000000aa';
const PAACT_ID = '00000000-0000-0000-0000-0000000000bb';

/* Three people, the way the real project has them: Good Work's own staff
   tagged "*", an HTI colleague who owns PAACT, and someone from PAACT who
   reads it. Each gets a token naming them, so the stub can answer as RLS
   would for THAT person. */
const ALAN = { id: '11111111-1111-1111-1111-111111111111', email: 'alan@goodworkatlanta.co', app_metadata: { gw_tenant: '*', gw_role: 'admin' } };
const GINA = { id: '66666666-6666-6666-6666-666666666666', email: 'gina@hti.example', app_metadata: { gw_tenant: 'paact', gw_role: 'viewer' } };
const SHAWNELL = { id: '77777777-7777-7777-7777-777777777777', email: 'shawnell@paact.example', app_metadata: { gw_tenant: 'paact', gw_role: 'viewer' } };
const USERS = [ALAN, GINA, SHAWNELL];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = (u) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
  sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', app_metadata: u.app_metadata,
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.`;
const userOf = (req) => {
  const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { return USERS.find((u) => u.id === JSON.parse(Buffer.from(t.split('.')[1], 'base64url')).sub) || null; }
  catch (e) { return null; }
};

/* updated_at the way Postgres prints it — microseconds and a "+00:00" — because
   the save sends it back as a filter, and a "+" that is not escaped on the way
   is exactly the bug that would make every save look like a collision. */
let tick = 0;
const stamp = () => `${new Date(Date.now() + (tick += 1)).toISOString().slice(0, 23)}${String(tick % 1000).padStart(3, '0')}+00:00`;

const portalRow = {
  id: PORTAL_ID, slug: 'resonate', tenant: 'resonate', client_name: P.client.name, place: P.client.place,
  engagement_name: P.client.engagement, adopted: P.client.adopted,
  brand: {}, labels: {}, sections: ['scope', 'plan', 'findings', 'workplan', 'dashboard'],
  engagement: { phases: P.phases, scope: P.scope, firm: P.firm },
  plan: { vision: P.plan.vision, framing: P.plan.framing, priorities: P.plan.priorities, track: P.plan.track },
  findings: F,
  updated_at: stamp(),
};
/* PAACT as supabase/clients/paact.sql creates it: the canonical document. */
const paactRow = {
  id: PAACT_ID, slug: 'paact', tenant: 'paact', client_name: PAACT_FILE.client.name, place: PAACT_FILE.client.place,
  engagement_name: PAACT_FILE.client.engagement, adopted: null,
  brand: {}, labels: {}, sections: ['scope'],
  engagement: ENG.tidy(ENG.engagementOfFile(PAACT_FILE)),
  plan: {}, findings: {},
  updated_at: stamp(),
};
const PAACT_START = JSON.parse(JSON.stringify(paactRow.engagement));
const PORTALS = [portalRow, paactRow];
const MEMBERS = { [PAACT_ID]: { [GINA.id]: 'owner', [SHAWNELL.id]: 'board' }, [PORTAL_ID]: {} };
const roleOf = (u, p) => (u ? MEMBERS[p.id]?.[u.id] || (u.app_metadata.gw_tenant === '*' ? 'owner' : null) : null);
const canRead = (u, p) => !!roleOf(u, p) && (u.app_metadata.gw_tenant === '*' || u.app_metadata.gw_tenant === p.tenant);
/* Somebody else, saving between this screen's read and its write. */
const otherEditor = (fn) => { paactRow.engagement = fn(JSON.parse(JSON.stringify(paactRow.engagement))); paactRow.updated_at = stamp(); };
const paactPatches = [];
let taskRows = P.tasks.map((t, i) => ({
  portal_id: PORTAL_ID, id: t.id, parent_id: t.parent || null, initiative: t.obj,
  title: t.title, owner_name: t.owner, start_date: t.start, due_date: t.due,
  status: t.status === 'late' ? 'next' : t.status, note: '', position: i,
}));

const writes = [];
const planPatches = [];
const deletedIds = [];

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

    /* Accounts are provisioned, never self-served: an unknown address is
       refused, as Supabase does with shouldCreateUser: false. */
    if (url.pathname === '/auth/v1/otp') {
      return USERS.some((u) => u.email === body.email) ? send(200, {}) : send(422, { msg: 'Signups not allowed for otp' });
    }
    if (url.pathname === '/auth/v1/verify' || url.pathname === '/auth/v1/token') {
      const u = USERS.find((x) => x.email === body.email)
        || USERS.find((x) => `refresh:${x.id}` === body.refresh_token) || ALAN;
      return send(200, {
        access_token: tokenFor(u), token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: `refresh:${u.id}`, user: u,
      });
    }
    if (url.pathname === '/auth/v1/user') return send(200, userOf(req) || ALAN);
    if (url.pathname === '/auth/v1/logout') return send(204, {});

    if (url.pathname === '/rest/v1/portals') {
      const user = userOf(req);
      const eqOf = (k) => (url.searchParams.has(k) ? url.searchParams.get(k).replace(/^eq\./, '') : null);
      const match = (p) => ['slug', 'id'].every((k) => eqOf(k) === null || p[k] === eqOf(k));
      if (req.method === 'GET') {
        return send(200, PORTALS.filter((p) => canRead(user, p) && match(p)));
      }
      if (req.method === 'PATCH') {
        const row = PORTALS.find((p) => match(p));
        /* RLS: a row this person may not write is simply not matched. */
        if (!row || !canRead(user, row) || roleOf(user, row) !== 'owner') return send(200, []);
        const seen = eqOf('updated_at');
        if (seen !== null && seen !== row.updated_at) {
          if (row === paactRow) paactPatches.push({ stale: true, who: user.email });
          return send(200, []);
        }
        Object.assign(row, body);
        row.updated_at = stamp();
        if (row === paactRow) paactPatches.push({ ok: true, who: user.email, keys: Object.keys(body), guarded: seen !== null });
        else planPatches.push(body);
        return send(200, [row]);
      }
      return send(200, []);
    }
    if (url.pathname === '/rest/v1/portal_members') {
      const user = userOf(req);
      const pid = (url.searchParams.get('portal_id') || '').replace(/^eq\./, '');
      const role = user && MEMBERS[pid]?.[user.id];
      return send(200, role ? [{ role }] : []);
    }
    if (url.pathname === '/rest/v1/tasks') {
      if (req.method === 'GET') {
        const pid = (url.searchParams.get('portal_id') || '').replace(/^eq\./, '');
        return send(200, taskRows.filter((t) => !pid || t.portal_id === pid));
      }
      if (req.method === 'DELETE') {
        const raw = url.searchParams.get('id') || '';
        const ids = raw.replace(/^in\.\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
        ids.forEach((id) => deletedIds.push(id));
        taskRows = taskRows.filter((t) => !ids.includes(t.id));
        return send(204, null);
      }
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const serve = (dir) => http.createServer((req, res) => {
  const clean = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(dir, clean);
  // One deploy, many portals: every unknown path is the app, as netlify.toml does.
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const web = serve(path.join(root, 'dist'));

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
/* Stacked label/value pairs must actually stack. When they were left inline the
   page read "37sources" and "…partnerships, space)survey + interviews". */
results.stackedPairsInline = await page.$$eval(
  '.themerow .tn, .themerow .tsub, .themerow .tc, .themerow .tcl',
  (els) => els.filter((e) => getComputedStyle(e).display === 'inline').length,
);
/* The sticky header is one block: nothing in it may overlap the rail. */
await page.evaluate(() => window.scrollTo(0, 700));
await page.waitForTimeout(250);
results.headerOverlapsRail = await page.evaluate(() => {
  const a = document.querySelector('.subnav')?.getBoundingClientRect();
  const b = document.querySelector('.rail')?.getBoundingClientRect();
  if (!a || !b) return false;
  return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0
      && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0;
});
results.railIsSticky = await page.evaluate(() => {
  const r = document.querySelector('.rail');
  return !!r && getComputedStyle(r).position === 'sticky' && r.getBoundingClientRect().top >= 0;
});
await page.evaluate(() => window.scrollTo(0, 0));
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

/* ---- the plan editor ---- */
/* The no-access check above navigated away; come back (the session persists). */
await page.goto(`http://127.0.0.1:${WEB_PORT}/resonate`, { waitUntil: 'networkidle' });
await page.waitForSelector('.railnav', { timeout: 10000 });
await page.waitForTimeout(600);
await page.click('.railnav button:has-text("The plan")');
await page.waitForTimeout(400);
results.editButtonForOwner = await page.isVisible('button:has-text("Edit plan")');
await page.click('button:has-text("Edit plan")');
await page.waitForTimeout(500);
results.savebarShown = await page.isVisible('.savebar');
results.editorFields = await page.$$eval('.efield input, .efield textarea', (n) => n.length);

// rename a priority
const titleInput = page.locator('.priority.editing').first().locator('input').first();
await titleInput.fill('Life Groups that actually multiply');

// reorder two initiatives — the operation that renumbers and must carry tasks
const initsBefore = await page.$$eval('.priority.editing >> nth=0 >> .init.editing .init-id', (n) => n.map((x) => x.textContent));
await page.locator('.priority.editing').first().locator('.init.editing').nth(1)
  .locator('button[aria-label*="Move"][aria-label*="up"]').click();
await page.waitForTimeout(300);
const titlesAfter = await page.$$eval('.priority.editing >> nth=0 >> .init.editing input', (n) => n.map((x) => x.value).slice(0, 4));
results.initiativesReordered = titlesAfter[0] !== undefined;

// link a finding
await page.locator('.priority.editing').first().locator('button:has-text("Link a finding")').first().click();
await page.waitForTimeout(400);
results.pickerOpened = await page.isVisible('.pickerlist');
await page.locator('.pickrow').first().click();
await page.waitForTimeout(200);
await page.click('.modal button:has-text("Done")');
await page.waitForTimeout(300);

// add a KPI
const kpisBefore = await page.$$eval('.priority.editing >> nth=0 >> .ekpi', (n) => n.length);
await page.locator('.priority.editing').first().locator('button:has-text("Add kpi"), button:has-text("Add KPI")').first().click();
await page.waitForTimeout(250);
results.kpiAdded = (await page.$$eval('.priority.editing >> nth=0 >> .ekpi', (n) => n.length)) === kpisBefore + 1;

// Everything written from here on belongs to the editor save.
const writesBeforeSave = writes.length;
const initiativeOfBefore = Object.fromEntries(taskRows.map((t) => [t.id, t.initiative]));

// save, and check what reached the server
await page.click('.savebar button:has-text("Save")');
await page.waitForTimeout(1200);
results.editorClosedOnSave = !(await page.isVisible('.savebar'));
const lastPlan = planPatches[planPatches.length - 1]?.plan;
results.planWasSaved = !!lastPlan;
results.savedInitiativeIds = lastPlan
  ? lastPlan.priorities[0].initiatives.map((o) => o.id)
  : [];
results.savedFirstInitiativeTitle = lastPlan ? lastPlan.priorities[0].initiatives[0].title : '';
results.savedPriorityTitle = lastPlan ? lastPlan.priorities[0].title : '';
/* The whole point: reordering swapped 1.1 and 1.2, so every task on either one
   must have been rewritten, or real work now sits under the wrong heading.
   Counting all writes would pass on an unrelated earlier write — count only
   the ones this save produced, and check they actually changed. */
const saveWrites = writes.slice(writesBeforeSave);
results.tasksWrittenBySave = saveWrites.length;
results.tasksThatChangedInitiative = saveWrites.filter(
  (w) => initiativeOfBefore[w.id] && initiativeOfBefore[w.id] !== w.initiative,
).length;
const swapped = saveWrites.filter((w) => ['1.1', '1.2'].includes(initiativeOfBefore[w.id]));
results.swapWasHonoured =
  swapped.length > 0 &&
  swapped.every((w) => w.initiative === (initiativeOfBefore[w.id] === '1.1' ? '1.2' : '1.1'));
/* And the server's own copy must end up consistent with the saved plan. */
results.serverHasNoOrphans = (() => {
  const live = new Set((planPatches[planPatches.length - 1]?.plan?.priorities || [])
    .flatMap((p) => (p.initiatives || []).map((o) => o.id)));
  return taskRows.every((t) => live.has(t.initiative));
})();

/* ---- demo mode: no account, no database, nothing saved ---- */
const demo = await browser.newPage({ viewport: { width: 1320, height: 1050 }, deviceScaleFactor: 2 });
demo.on('pageerror', (e) => errs.push('DEMO ' + e.message));
const restCalls = [];
demo.on('request', (r) => { if (r.url().includes('/rest/v1/')) restCalls.push(r.method() + ' ' + r.url()); });

await demo.goto(`http://127.0.0.1:${WEB_PORT}/demo`, { waitUntil: 'networkidle' });
await demo.waitForTimeout(900);
results.demoSkipsSignIn = await demo.isVisible('.masthead');
results.demoBanner = (await demo.textContent('.demobar strong').catch(() => '')) || '';
results.demoSections = await demo.$$eval('.railnav .rn-t', (n) => n.length);
results.demoKpis = await demo.$$eval('.kpi', (n) => n.length);
results.demoClient = await demo.textContent('.brand-name');
/* The demo is public and must never carry the real client's identity. */
const demoText = await demo.evaluate(() => document.body.innerText);
results.demoLeaksRealClient = /\bresonate\b/i.test(demoText.replace(/\bresonat(es|ed|ing)\b/gi, 'X'))
  || /\bBelvedere\b/i.test(demoText);
await demo.screenshot({ path: path.join(root, 'test/shot-07-demo.png') });

// interactive, and pinned to the engagement's clock rather than drifting
await demo.click('.railnav button:has-text("Workplan")');
await demo.waitForTimeout(500);
results.demoTasks = await demo.$$eval('.task:not(.sub)', (n) => n.length);
const demoBefore = await demo.getAttribute('.task:not(.sub) .dot', 'class');
await demo.click('.task:not(.sub) .statusbtn');
await demo.waitForTimeout(400);
results.demoInteractive = demoBefore !== (await demo.getAttribute('.task:not(.sub) .dot', 'class'));
results.demoTouchedNoDatabase = restCalls.length === 0;
results.demoRestCalls = restCalls.slice(0, 3);
await demo.screenshot({ path: path.join(root, 'test/shot-08-demo-workplan.png') });


/* ---- /paact, from the database --------------------------------------------
   The portal the HTI Catalysts team signs in to and edits, and PAACT's own
   people read. The real app and the real supabase-js run against the stub,
   which answers as RLS would for whoever is signed in. The old file-served
   /paact is checked further down, on a build with no project at all. */
const signIn = async (pg, email) => {
  await pg.fill('#email', email);
  await pg.click('button:has-text("Send code")');
  await pg.waitForSelector('#code');
  await pg.fill('#code', '123456');
  await pg.click('button:has-text("Sign in")');
};
const mainText = (pg) => pg.evaluate(() => document.querySelector('.main')?.innerText || '');
const editButtons = (pg) => pg.evaluate(() => [...document.querySelectorAll('button')]
  .map((e) => e.textContent.trim()).filter((t) => /^(Edit (timeline|scope|team|plan)|Settings|Access)$/.test(t)));
const phaseOf = (id) => paactRow.engagement.phases.find((x) => x.id === id);
/* Wait for the thing itself rather than a fixed time: a save is two or three
   round trips, and a slow CI runner should not turn that into a failure. A
   short pause after, so a save that should NOT have happened has the chance. */
const until = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) { await new Promise((r) => setTimeout(r, 250)); return true; }
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

/* -- someone from PAACT, who reads. First, so the content checks below see
      the document exactly as supabase/clients/paact.sql creates it. */
const paact = await browser.newPage({ viewport: { width: 1320, height: 1050 }, deviceScaleFactor: 2 });
paact.on('pageerror', (e) => errs.push('PAACT ' + e.message));
await paact.goto(`http://127.0.0.1:${WEB_PORT}/paact`, { waitUntil: 'networkidle' });
results.paactAsksSignIn = await paact.isVisible('#email');
await signIn(paact, SHAWNELL.email);
await paact.waitForSelector('.masthead', { timeout: 10000 });
await paact.waitForTimeout(800);

results.paactPath = await paact.evaluate(() => location.pathname);
results.paactClient = (await paact.textContent('.brand-name').catch(() => '')) || '';
results.paactTopbarText = (await paact.evaluate(
  () => (document.querySelector('.topbar')?.innerText || '').replace(/\s+/g, ' ').trim(),
)) || '';
results.paactOpensOn = (await paact.textContent('.railnav [aria-current="true"] .rn-t').catch(() => '')) || '';
/* One section, because one section exists. An empty tab a client clicks into
   and finds nothing in is worse than a tab that is not there yet; each of the
   other four is switched on from Settings on the day it has content. */
results.paactSectionTabs = await paact.$$eval('.railnav .rn-t', (n) => n.map((x) => x.textContent.trim()));
results.paactHasBar = await paact.evaluate(() => !!document.querySelector('.demobar'));
results.paactThemeToggle = await paact.evaluate(() => !!document.querySelector('.themetoggle'));
/* Read-only means no way to change anything, not buttons that fail. */
results.boardRoleWord = (await paact.evaluate(() => document.querySelector('.mast-right .eyebrow')?.textContent || '')) || '';
results.boardEditControls = await editButtons(paact);
results.boardTickControls = await paact.$$eval('.pc-tick, .pc-statusrow', (n) => n.length);
/* The rail counts what this client has: the current phase's deliverables, not
   a workplan that does not exist yet ("0 of 0 done"). */
results.paactRail = (await paact.evaluate(() => document.querySelector('.rail')?.innerText || '')).replace(/\s+/g, ' ');

const paactScope = await mainText(paact);
results.paactPhasesShown = ['Foundation', 'Discovery', 'Synthesis', 'Plan design', 'Adoption']
  .filter((n) => paactScope.includes(n)).length;
results.paactShowsRealProgress = /\b2\b[^.]{0,12}\b7\b/.test(paactScope);
results.paactClaims2028AsEngagementEnd = /engagement[^.]{0,60}Feb 2028\b/i.test(paactScope);
results.axisTicks = await paact.$$eval('.pt-axisrow .pt-tick, .pt-axisrow [class*=tick]',
  (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
results.laneCount = await paact.$$eval('.pt-lane', (n) => n.length);
results.overrunBars = await paact.$$eval('.pt-bar.is-over', (n) => n.length);

await paact.click('.subnav button:has-text("Team")');
await paact.waitForTimeout(400);
const paactTeam = await mainText(paact);
results.paactTeamNames = ['Dr. Folami Prescott-Adams', 'Gina Glymph', 'Rachel Alterman Wallack', 'Shawnell']
  .filter((n) => paactTeam.includes(n)).length;
/* No workplan section, so no "Owners in the workplan" panel standing empty. */
results.paactEmptyOwnersPanel = /Owners in the/i.test(paactTeam);

await paact.click('.subnav button:has-text("Scope")');
await paact.waitForTimeout(400);
const paactAgreement = await mainText(paact);
results.paactKeyDatesShown = ['Fall Luncheon', 'Impact Report', 'RFP project end date']
  .filter((n) => paactAgreement.includes(n)).length;
results.paactCadenceShown = /Prescott-Adams/.test(paactAgreement) && /Weekly/i.test(paactAgreement);
results.paactSowContent = ['Expected outcomes', 'Questions this process answers', 'Documents under review']
  .filter((n) => paactAgreement.includes(n)).length;
await paact.screenshot({ path: path.join(root, 'test/shot-09-paact-timeline.png'), fullPage: true });

/* NOTHING BORROWED, ANYWHERE. Built from the sample portal's own data rather
   than a hand-written list, so a name added to the sample later is covered the
   day it lands — minus whatever PAACT legitimately shares, since both
   engagements really do have phases called Discovery and Synthesis. */
const { PORTAL: SAMPLE } = await import(path.join(root, 'clients', 'demo', 'plan.js'));
const paactSource = fs.readFileSync(path.join(root, 'clients', 'paact', 'plan.js'), 'utf8');
const sampleOnly = (() => {
  const t = new Set([SAMPLE.client.name, SAMPLE.client.place, SAMPLE.client.engagement]);
  SAMPLE.tasks.forEach((x) => x.owner && t.add(x.owner));
  (SAMPLE.plan.priorities || []).forEach((p) => {
    t.add(p.title);
    (p.initiatives || []).forEach((o) => t.add(o.title));
  });
  (SAMPLE.phases || []).forEach((p) => t.add(p.name));
  return [...t].map((x) => String(x || '').trim())
    .filter((x) => x.length > 3 && !paactSource.includes(x));
})();
let whole = '';
for (const tab of ['Timeline', 'Scope', 'Team']) {
  await paact.click(`.subnav button:has-text("${tab}")`);
  await paact.waitForTimeout(400);
  whole += '\n' + await paact.evaluate(
    () => (document.querySelector('.rail')?.innerText || '') + '\n' + (document.querySelector('.main')?.innerText || ''),
  );
}
results.sampleTermsChecked = sampleOnly.length;
results.portalLeaks = sampleOnly.filter((x) => whole.includes(x));
/* Two-digit years are unreadable across an engagement spanning 2026 to 2028:
   "15 Feb 27" and "15 Feb 28" differ by one character. A month followed by
   exactly two digits can only be a truncated year here, because the format
   puts the day first — except in "Feb 15, 2027", prose quoting the contract
   month-first, where the two digits are a day and the year follows. */
results.shortYears = [...whole.matchAll(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ?(\d{2})(?!\d)(?!,? ?\d{4})/g)]
  .map((m) => m[0]).filter((v, i, a) => a.indexOf(v) === i);
results.paactUnchangedByReading = JSON.stringify(paactRow.engagement) === JSON.stringify(PAACT_START);

/* -- an address with no account: refused at the code step, in words. */
const stranger = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await stranger.goto(`http://127.0.0.1:${WEB_PORT}/paact`, { waitUntil: 'networkidle' });
await stranger.fill('#email', 'stranger@nowhere.example');
await stranger.click('button:has-text("Send code")');
await stranger.waitForTimeout(700);
results.strangerRefused = (await stranger.textContent('.errnote').catch(() => '')) || '';
results.strangerGotCodeBox = await stranger.isVisible('#code');
await stranger.close();

/* -- the HTI team: an owner, arriving at the FRONT DOOR with no address. */
const own = await browser.newPage({ viewport: { width: 1320, height: 1050 }, deviceScaleFactor: 2 });
own.on('pageerror', (e) => errs.push('OWNER ' + e.message));
own.on('dialog', (d) => d.accept());
await own.goto(`http://127.0.0.1:${WEB_PORT}/`, { waitUntil: 'networkidle' });
results.frontDoorAsksSignIn = await own.isVisible('#email');
await signIn(own, GINA.email);
await own.waitForSelector('.masthead', { timeout: 10000 });
await own.waitForTimeout(800);
results.frontDoorLandsOn = await own.evaluate(() => location.pathname);
results.ownerRoleWord = (await own.evaluate(() => document.querySelector('.mast-right .eyebrow')?.textContent || '')) || '';
results.ownerEditControls = await editButtons(own);
results.ownerTickControls = await own.$$eval('.pc-card.is-open .pc-tick', (n) => n.length);
const openId = await own.evaluate(() => (document.querySelector('.pc-card.is-open')?.id || '').replace('pc-card-', ''));
/* Another person's edits go to a phase that is NOT the open one, whatever
   date this test runs on, so theirs and ours never touch the same row. */
const otherPhase = openId === 'p4' ? 'p3' : 'p4';

// 1. A tick: shown at once, saved behind, guarded by the version it read.
const firstBox = own.locator('.pc-card.is-open .pc-tick:has(input:not(:checked))').first();
const firstName = (await firstBox.innerText()).trim();
let mark = paactPatches.length;
await firstBox.click();
await until(() => paactPatches.length > mark);
results.tickSaves = paactPatches.slice(mark).map((x) => (x.stale ? 'stale' : x.guarded ? 'saved' : 'UNGUARDED'));
results.tickInDatabase = paactRow.engagement.phases.some((x) => x.deliverables.some((d) => d.name === firstName && d.done === true));

// 2. A tick that loses a race: someone else saved first, and both survive.
const theirs = phaseOf(otherPhase).deliverables[0];
otherEditor((e) => ENG.tick(e, otherPhase, theirs.id, true));
const secondBox = own.locator('.pc-card.is-open .pc-tick:has(input:not(:checked))').first();
const secondName = (await secondBox.innerText()).trim();
mark = paactPatches.length;
await secondBox.click();
await until(() => paactPatches.slice(mark).some((x) => x.ok));
results.raceSaves = paactPatches.slice(mark).map((x) => (x.stale ? 'stale' : 'saved'));
results.raceKeptMine = paactRow.engagement.phases.some((x) => x.deliverables.some((d) => d.name === secondName && d.done === true));
results.raceKeptTheirs = phaseOf(otherPhase).deliverables[0].done === true;
results.raceShowsTheirs = await own.evaluate(
  (id) => !!document.querySelector(`#pc-card-${id} .pc-list li.is-done`), otherPhase,
);

// 3. Where a phase stands, from the card itself.
const statusSel = own.locator('.pc-card.is-open .pc-statusrow select');
const statusWas = await statusSel.inputValue();
const statusTo = statusWas === 'done' ? 'in_progress' : 'done';
await statusSel.selectOption(statusTo);
await until(() => phaseOf(openId).status === statusTo);
results.statusSaved = phaseOf(openId).status === statusTo;
const statusBack = statusWas === '' ? 'in_progress' : statusWas;
await statusSel.selectOption(statusBack);
await until(() => phaseOf(openId).status === statusBack);

// 4. The editor, while somebody else ticks something: both kept, no question.
await own.click('button:has-text("Edit timeline")');
await own.waitForTimeout(400);
results.editorPhases = await own.$$eval('.ephase', (n) => n.length);
await own.locator('.ephase').nth(3).locator('input[type="text"]').first().fill('Plan design and drafting');
await own.locator('.ephase').nth(3).locator('button:has-text("Add deliverable")').click();
await own.locator('.ephase').nth(3).locator('.erow.e-del input[type="text"]').last().fill('Board briefing pack');
await own.click('.subnav button:has-text("Scope")');
await own.waitForTimeout(300);
await own.click('button:has-text("Add a key date")');
const newDate = own.locator('.esub:has(h4:text-is("Key dates")) .erow:not(.e-head)').last();
await newDate.locator('input[type="date"]').fill('2026-10-28');
await newDate.locator('input[type="text"]').fill('Partner convening #1');
const theirs2 = phaseOf(otherPhase).deliverables[1];
otherEditor((e) => ENG.tick(e, otherPhase, theirs2.id, true));
mark = paactPatches.length;
await own.click('.savebar button:has-text("Save")');
await until(async () => !(await own.isVisible('.savebar')));
results.editorSaves = paactPatches.slice(mark).map((x) => (x.stale ? 'stale' : 'saved'));
results.editorClosedOnSave = !(await own.isVisible('.savebar'));
results.editorToast = (await own.textContent('.toast').catch(() => '')) || '';
{
  const e = paactRow.engagement;
  results.editorKeptMine = e.phases.some((x) => x.name === 'Plan design and drafting'
    && x.deliverables.some((d) => d.name === 'Board briefing pack'))
    && e.scope.keyDates.some((d) => d.date === '2026-10-28' && d.what === 'Partner convening #1');
  results.editorKeptTheirs = phaseOf(otherPhase).deliverables[1].done === true;
  results.editorKeptEarlierTicks = e.phases.some((x) => x.deliverables.some((d) => d.name === firstName && d.done));
}

// 5. A date that cannot be right stops the save, in words.
await own.click('.subnav button:has-text("Timeline")');
await own.waitForTimeout(300);
await own.click('button:has-text("Edit timeline")');
await own.waitForTimeout(300);
await own.locator('.ephase').nth(0).locator('input[type="date"]').nth(1).fill('2026-08-01');
mark = paactPatches.length;
await own.click('.savebar button:has-text("Save")');
await own.waitForTimeout(500);
results.validationText = (await own.textContent('.eflag').catch(() => '')) || '';
results.validationWroteNothing = paactPatches.length === mark;
await own.click('.savebar button:has-text("Discard")');
await own.waitForTimeout(300);

// 6. Both changed the SAME date: the editor asks, and the answer is honoured.
await own.click('button:has-text("Edit timeline")');
await own.waitForTimeout(300);
await own.locator('.ephase').nth(1).locator('input[type="date"]').nth(1).fill('2026-12-11');
otherEditor((e) => ENG.setIn(e, ['phases', e.phases.findIndex((x) => x.id === 'p2'), 'end'], '2026-12-20'));
await own.click('.savebar button:has-text("Save")');
await until(() => own.isVisible('.eflag.is-conflict'));
results.conflictText = ((await own.textContent('.eflag.is-conflict').catch(() => '')) || '').replace(/\s+/g, ' ');
results.conflictHeldBack = phaseOf('p2').end === '2026-12-20';
await own.click('button:has-text("Keep mine and save")');
await until(async () => !(await own.isVisible('.savebar')));
results.conflictKeptMine = phaseOf('p2').end === '2026-12-11';
results.conflictEditorClosed = !(await own.isVisible('.savebar'));
await own.screenshot({ path: path.join(root, 'test/shot-13-paact-owner.png'), fullPage: true });

// 7. The Access screen offers "every client" only to your own firm's staff.
await own.click('button:has-text("Access")');
await own.waitForTimeout(500);
results.ownerSeesEveryClientBox = await own.isVisible('.teamcheck');
await own.click('.modal button:has-text("Close")');

// 8. Every other section switched on from Settings before it has content:
//    the plan and findings are still {} in the database, and nothing may crash.
const errsBefore = errs.length;
await own.click('button:has-text("Settings")');
await own.waitForTimeout(400);
for (const box of await own.$$('.setsections input[type="checkbox"]:not(:checked)')) await box.click();
await own.click('button:has-text("Save settings")');
await own.waitForTimeout(800);
results.allSectionsTabs = await own.$$eval('.railnav .rn-t', (n) => n.length);
results.allSectionsSaved = JSON.stringify(paactRow.sections);
results.emptySectionsRendered = [];
for (const name of ['The plan', 'Findings', 'Workplan', 'Dashboard', 'Scope & timeline']) {
  await own.click(`.railnav button:has-text("${name}")`);
  await own.waitForTimeout(400);
  if (await own.isVisible('.shead h2')) results.emptySectionsRendered.push(name);
}
results.emptySectionsErrors = errs.slice(errsBefore);
paactRow.sections = ['scope']; // back to one section for the phone checks below
paactRow.updated_at = stamp();

/* -- Good Work's own staff ("*") reach more than one portal: the front door
      lets them choose rather than guessing. */
const gw = await browser.newPage({ viewport: { width: 1200, height: 800 } });
gw.on('pageerror', (e) => errs.push('GW ' + e.message));
await gw.goto(`http://127.0.0.1:${WEB_PORT}/`, { waitUntil: 'networkidle' });
await signIn(gw, ALAN.email);
await gw.waitForSelector('.portalpick', { timeout: 10000 }).catch(() => {});
results.gwPicker = await gw.$$eval('.portalpick strong', (n) => n.map((x) => x.textContent.trim()));
await gw.close();

/* ---- the theme toggle, on /demo ----
   Checked here and not on /paact: the toggle is suppressed only on a MIXED
   portal, where the theme carries information about whose content you are
   reading rather than a preference. /demo is wholly sample, so it has the
   control like any ordinary portal. */
const themeBtn = await demo.$('[aria-label*="theme" i], [aria-label*="dark" i], [aria-label*="light" i], .themetoggle');
results.themeToggleFound = !!themeBtn;
if (themeBtn) {
  const before = await demo.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await themeBtn.click();
  await demo.waitForTimeout(900);
  results.themeAfter = await demo.evaluate(() => document.documentElement.getAttribute('data-theme'));
  results.themeFlipped = before !== results.themeAfter;
  /* The wipe adds a class that kills every transition on the page. Not removing
     it on BOTH the resolved and rejected paths leaves the app permanently
     un-animated. */
  results.themeWipeClassCleared = await demo.evaluate(
    () => !document.documentElement.classList.contains('theme-wipe'),
  );
  results.themeStorage = await demo.evaluate(() => {
    try { return Object.entries(localStorage).map(([k, v]) => `${k}=${v}`).join(','); }
    catch (e) { return 'THREW ' + e.message; }
  });
}

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
phone.on('pageerror', (e) => errs.push('PHONE ' + e.message));
await phone.goto(`http://127.0.0.1:${WEB_PORT}/demo`, { waitUntil: 'networkidle' });
await phone.waitForTimeout(500);
results.phoneHScroll = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
/* The banner lost its text once to a cascade collision and showed a bare
   "DEMO" chip, so assert it actually says something at this width. */
results.phoneBannerText = await phone.evaluate(
  () => (document.querySelector('.demobar')?.innerText || '').replace(/\s+/g, ' ').trim(),
);
/* A QR CODE ON A SLIDE MAKES THE PHONE THE PRIMARY SURFACE, so these are not
   "does it survive at 390px" checks — this is the first screen a client ever
   sees: the sign-in, then their timeline. */
await phone.goto(`http://127.0.0.1:${WEB_PORT}/paact`, { waitUntil: 'networkidle' });
results.phoneSignInHScroll = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await signIn(phone, SHAWNELL.email);
await phone.waitForSelector('.masthead', { timeout: 10000 });
await phone.waitForTimeout(900);
/* innerText, not textContent: the parenthetical is hidden with display:none
   rather than removed, so textContent still reports it and an assertion
   against it would pass while the phone shows two lines of wrapped name. */
results.phoneBrand = await phone.evaluate(() => document.querySelector('.brand-name')?.innerText.trim() || '');
results.phoneSub = await phone.evaluate(() => {
  const e = document.querySelector('.brand-sub');
  return e && getComputedStyle(e).display !== 'none' ? e.textContent.trim() : '';
});
/* 40px is the floor a thumb needs; every nav control was 32px. */
results.phoneSmallTargets = await phone.$$eval('.tabstrip button, .subnav button', (els) =>
  els.map((e) => ({ t: e.textContent.trim().slice(0, 20), h: Math.round(e.getBoundingClientRect().height) }))
     .filter((x) => x.h < 40));
results.phonePaactHeaderPct = await phone.evaluate(() => {
  const el = document.querySelector('.topbar');
  return el ? Math.round((el.getBoundingClientRect().height / window.innerHeight) * 100) : -1;
});
results.phonePaactHScroll = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await phone.screenshot({ path: path.join(root, 'test/shot-12-phone-paact.png') });
await phone.goto(`http://127.0.0.1:${WEB_PORT}/demo`, { waitUntil: 'networkidle' });
await phone.waitForTimeout(600);
results.phoneHeaderPctOfScreen = await phone.evaluate(() => {
  const el = document.querySelector('.topbar');
  if (!el) return -1; // no header on this screen: the assertion below catches it
  return Math.round((el.getBoundingClientRect().height / window.innerHeight) * 100);
});

/* An owner editing on a phone: the editor's rows have to fit 390px too. */
const phoneOwner = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
phoneOwner.on('pageerror', (e) => errs.push('PHONE OWNER ' + e.message));
await phoneOwner.goto(`http://127.0.0.1:${WEB_PORT}/paact`, { waitUntil: 'networkidle' });
await signIn(phoneOwner, GINA.email);
await phoneOwner.waitForSelector('.masthead', { timeout: 10000 });
await phoneOwner.waitForTimeout(700);
results.phoneTickHeights = await phoneOwner.$$eval('.pc-card.is-open .pc-tick',
  (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h < 40));
await phoneOwner.click('.subnav button:has-text("Scope")');
await phoneOwner.waitForTimeout(300);
await phoneOwner.click('.subnav button:has-text("Edit scope")');
await phoneOwner.waitForTimeout(500);
results.phoneEditorHScroll = await phoneOwner.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await phoneOwner.screenshot({ path: path.join(root, 'test/shot-14-phone-editor.png'), fullPage: false });
await phoneOwner.click('.savebar button:has-text("Discard")');
await phoneOwner.close();

/* ---- no database at all: the file fallback --------------------------------
   A deploy with no Supabase project still serves /paact, from its file, to
   anyone, read-only — the address on the slide worked before the database
   existed and must not break if it is ever switched off. And the bare root
   says /demo in the address bar rather than showing a client's name at "/". */
console.log('building with no project configured…');
execSync('npx vite build --outDir dist-file --emptyOutDir', {
  cwd: root,
  stdio: 'pipe',
  env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
});
const web2 = serve(path.join(root, 'dist-file'));
await new Promise((r) => web2.listen(WEB_PORT_FILE, r));
const fb = await browser.newPage({ viewport: { width: 1320, height: 1050 } });
fb.on('pageerror', (e) => errs.push('FALLBACK ' + e.message));
const fbCalls = [];
fb.on('request', (r) => { if (/\/(rest|auth)\/v1\//.test(r.url())) fbCalls.push(r.method() + ' ' + r.url()); });
await fb.goto(`http://127.0.0.1:${WEB_PORT_FILE}/paact`, { waitUntil: 'networkidle' });
await fb.waitForTimeout(800);
results.fallbackOpens = await fb.isVisible('.masthead');
results.fallbackPath = await fb.evaluate(() => location.pathname);
results.fallbackRoleWord = (await fb.evaluate(() => document.querySelector('.mast-right .eyebrow')?.textContent || '')) || '';
results.fallbackEditControls = await editButtons(fb);
results.fallbackTickControls = await fb.$$eval('.pc-tick, .pc-statusrow', (n) => n.length);
results.fallbackPhases = await fb.$$eval('.pc-card', (n) => n.length);
results.fallbackSections = await fb.$$eval('.railnav .rn-t', (n) => n.length);
await fb.goto(`http://127.0.0.1:${WEB_PORT_FILE}/`, { waitUntil: 'networkidle' });
await fb.waitForTimeout(800);
results.rootPath = await fb.evaluate(() => location.pathname);
results.rootBrand = (await fb.textContent('.brand-name').catch(() => '')) || '';
results.fallbackCalls = fbCalls.slice(0, 3);

await browser.close();
api.close();
web.close();
web2.close();

console.log(JSON.stringify(results, null, 1));
console.log('\npage errors:', errs.length ? errs : 'none');

const failures = [];
if (!results.signInShown) failures.push('sign-in screen did not render');
if (results.railSections?.length !== 5) failures.push('expected 5 sections');
if (!results.kpiRows) failures.push('no KPIs rendered from the plan document');
if (!results.themeRows) failures.push('no findings rendered');
if (results.stackedPairsInline) failures.push(results.stackedPairsInline + ' label/value spans are inline and will run together');
if (results.headerOverlapsRail) failures.push('the sticky header overlaps the rail');
if (!results.railIsSticky) failures.push('the rail scrolled off instead of sticking');
if (!results.taskRows) failures.push('no tasks rendered');
if (!results.subRows) failures.push('subtasks did not expand');
if (!results.statusChanged) failures.push('status did not advance');
if (!results.writeReachedServer) failures.push('the write never reached the server');
if (!results.scopedOnlyP2) failures.push('scoping leaked other priorities');
if (results.charts !== 4) failures.push('expected 4 dashboard charts');
if (!results.unknownPortalBlocked) failures.push('an unreachable portal still rendered');
if (results.phoneHScroll) failures.push('horizontal scroll at 390px');
if ((results.phoneBannerText || '').replace(/^Demo\s*/i, '').length < 10)
  failures.push('the demo banner has no text at phone width: ' + JSON.stringify(results.phoneBannerText));
if (results.phoneHeaderPctOfScreen < 0) failures.push('phone check never found the header — it measured nothing');
/* Two budgets, because /demo carries a banner a client portal does not. The
   client-facing number is the one that matters: it is the first screen someone
   sees after scanning a code off a slide. */
if (results.phoneHeaderPctOfScreen > 28) failures.push(`the /demo sticky header takes ${results.phoneHeaderPctOfScreen}% of a phone screen`);
if (results.phonePaactHeaderPct < 0) failures.push('the phone check never found the client portal header');
if (results.phonePaactHeaderPct > 23) failures.push(`the client portal's sticky header takes ${results.phonePaactHeaderPct}% of a phone screen`);
if (/\(/.test(results.phoneBrand || ''))
  failures.push('the phone masthead still carries the parenthetical name, which wraps to two lines of display type: ' + JSON.stringify(results.phoneBrand));
if (!/PAACT/.test(results.phoneBrand || ''))
  failures.push('the phone masthead lost the client name: ' + JSON.stringify(results.phoneBrand));
if (!/Strategic Plan/.test(results.phoneSub || ''))
  failures.push('the engagement name is hidden on a phone: ' + JSON.stringify(results.phoneSub));
if (results.phoneSmallTargets?.length)
  failures.push(`${results.phoneSmallTargets.length} nav targets are under 40px on a phone: ` + JSON.stringify(results.phoneSmallTargets));
if (!results.demoSkipsSignIn) failures.push('demo asked for a sign-in');
if (results.demoBanner !== 'Demo') failures.push('demo banner missing');
if (results.demoSections !== 5) failures.push('demo did not render all five sections');
if (!results.demoTasks) failures.push('demo rendered no tasks');
if (!results.demoKpis) failures.push('demo rendered no KPIs');
if (results.demoLeaksRealClient) failures.push('THE PUBLIC DEMO LEAKS THE REAL CLIENT');
if (!results.editButtonForOwner) failures.push('an owner cannot reach the editor');
if (!results.savebarShown) failures.push('the save bar did not appear');
if (!results.pickerOpened) failures.push('the evidence picker did not open');
if (!results.kpiAdded) failures.push('adding a KPI did nothing');
if (!results.planWasSaved) failures.push('save never reached the server');
if (results.savedPriorityTitle !== 'Life Groups that actually multiply') failures.push('the edited title was not saved');
if (!results.tasksThatChangedInitiative)
  failures.push('REORDERING RENUMBERED THE PLAN BUT NO TASK FOLLOWED — work is now under the wrong heading');
if (!results.swapWasHonoured)
  failures.push('tasks on the swapped initiatives did not swap with them: ' + results.tasksThatChangedInitiative);
if (!results.serverHasNoOrphans)
  failures.push('after saving, the server holds tasks pointing at initiatives that no longer exist');
if (!results.editorClosedOnSave) failures.push('the editor stayed open after saving');
if (!/Northside/.test(results.demoClient || '')) failures.push('demo is not showing the anonymised client');
if (!results.demoInteractive) failures.push('demo workplan is not interactive');
if (!results.demoTouchedNoDatabase) failures.push('demo hit the database: ' + results.demoRestCalls.join(', '));
/* ---- /paact, from the database ---- */
if (!results.paactAsksSignIn) failures.push('/paact opened without a sign-in on a deploy with a database');
if (!/^\/paact\/scope\/timeline$/.test(results.paactPath || ''))
  failures.push('after signing in, /paact landed on ' + JSON.stringify(results.paactPath));
if (!/PAACT/.test(results.paactClient || ''))
  failures.push('/paact is not showing PAACT: ' + JSON.stringify(results.paactClient));
if (/\bdemo\b/i.test(results.paactTopbarText || ''))
  failures.push("the client's own portal calls itself a Demo: " + JSON.stringify(results.paactTopbarText.slice(0, 120)));
if (!/scope|timeline/i.test(results.paactOpensOn || ''))
  failures.push('/paact opens on ' + JSON.stringify(results.paactOpensOn));
/* ONE section. A tab that opens onto nothing is worse than a tab that is not
   there yet, and each of the other four appears from Settings the day it has
   content in it. */
if (results.paactSectionTabs?.length !== 1)
  failures.push(`/paact shows ${results.paactSectionTabs?.length} sections; only Scope & timeline has content yet: ` + JSON.stringify(results.paactSectionTabs));
if (results.paactHasBar)
  failures.push('/paact still renders a sample/demo bar, but it carries nothing borrowed to disclaim');
if (!results.paactThemeToggle)
  failures.push('the theme toggle is hidden on /paact; it is only suppressed where the theme carries information, and nothing is borrowed here');
if (!/board/i.test(results.boardRoleWord || ''))
  failures.push('a read-only account is not told it is read-only: ' + JSON.stringify(results.boardRoleWord));
if (results.boardEditControls?.length || results.boardTickControls)
  failures.push('a read-only account is offered edits: ' + JSON.stringify(results.boardEditControls) + ` and ${results.boardTickControls} tick/status controls`);
if (results.paactPhasesShown !== 5)
  failures.push(`only ${results.paactPhasesShown} of 5 PAACT phases are on screen`);
if (!results.paactShowsRealProgress)
  failures.push("phase 1's real progress (2 of its 7 deliverables) is not shown");
if (results.paactClaims2028AsEngagementEnd)
  failures.push("the page presents Feb 2028 as the end of HTI Catalysts' engagement — it ends Feb 2027");
if (results.laneCount !== 5)
  failures.push(`the strip draws ${results.laneCount} lanes, not 5 — a phase was taken off the axis and reads as a footnote rather than a step`);
if (results.axisTicks?.some((t) => /2028/.test(t)))
  failures.push('the axis runs out to 2028, which squashes the four phases where the work happens: ' + results.axisTicks.join(' '));
if (results.overrunBars !== 1)
  failures.push(`${results.overrunBars} bars are drawn open-ended; phase 5 runs past the axis and exactly one should be`);
if (results.paactTeamNames !== 4)
  failures.push(`only ${results.paactTeamNames} of 4 named people appear on the Team tab`);
if (/\b0 of 0\b/.test(results.paactRail || '') || !/delivered/.test(results.paactRail || ''))
  failures.push('the rail reports a workplan PAACT does not have, instead of the phase it is in: ' + JSON.stringify(results.paactRail));
if (results.paactEmptyOwnersPanel)
  failures.push('the Team tab shows an "Owners in the workplan" panel on a portal with no workplan');
if (results.paactKeyDatesShown !== 3)
  failures.push(`only ${results.paactKeyDatesShown} of 3 checked key dates appear on Scope & cadence`);
if (!results.paactCadenceShown) failures.push('the working cadence (owner and rhythm) is missing');
if (results.paactSowContent !== 3)
  failures.push(`only ${results.paactSowContent} of 3 scope-of-work panels are present (outcomes, questions, documents)`);
if (!results.sampleTermsChecked)
  failures.push('the no-borrowed-content check built an empty term list and tested nothing');
if (results.portalLeaks?.length)
  failures.push("/paact CARRIES ANOTHER ENGAGEMENT'S CONTENT: " + results.portalLeaks.join(', '));
if (results.shortYears?.length)
  failures.push('two-digit years, unreadable across a three-year engagement: ' + results.shortYears.join(', '));
if (!results.paactUnchangedByReading) failures.push('a read-only visit changed the stored document');
if (!/no account for that address/i.test(results.strangerRefused || '') || results.strangerGotCodeBox)
  failures.push('an address with no account was not refused at the code step: ' + JSON.stringify(results.strangerRefused));
/* ---- the team, editing ---- */
if (!results.frontDoorAsksSignIn) failures.push('the front door did not ask for a sign-in');
if (results.frontDoorLandsOn !== '/paact/scope/timeline')
  failures.push('an account with one portal was not taken straight to it from the front door: ' + JSON.stringify(results.frontDoorLandsOn));
if (!/owner/i.test(results.ownerRoleWord || '')) failures.push('the owner is not shown as an owner: ' + JSON.stringify(results.ownerRoleWord));
if (JSON.stringify(results.ownerEditControls) !== JSON.stringify(['Edit timeline', 'Access', 'Settings']))
  failures.push('the owner\'s controls on section 01 are wrong (no Edit plan where there is no plan): ' + JSON.stringify(results.ownerEditControls));
if (!results.ownerTickControls) failures.push('an owner cannot tick a deliverable on the timeline');
if (JSON.stringify(results.tickSaves) !== '["saved"]')
  failures.push('a tick was not saved exactly once, guarded by the version it read: ' + JSON.stringify(results.tickSaves));
if (!results.tickInDatabase) failures.push('the ticked deliverable is not ticked in the database');
if (JSON.stringify(results.raceSaves) !== '["stale","saved"]')
  failures.push('a tick that lost a race was not replayed onto the newer version: ' + JSON.stringify(results.raceSaves));
if (!results.raceKeptMine || !results.raceKeptTheirs)
  failures.push(`TWO PEOPLE TICKING AT ONCE LOST ONE TICK — mine kept: ${results.raceKeptMine}, theirs kept: ${results.raceKeptTheirs}`);
if (!results.raceShowsTheirs) failures.push("after the collision, the screen does not show the other person's tick");
if (!results.statusSaved) failures.push("a phase's status set from the card was not saved");
if (results.editorPhases !== 5) failures.push(`the editor shows ${results.editorPhases} phases, not 5`);
if (JSON.stringify(results.editorSaves) !== '["stale","saved"]')
  failures.push('the editor did not merge onto the newer version: ' + JSON.stringify(results.editorSaves));
if (!results.editorKeptMine) failures.push("the editor's own changes (a renamed phase, a new deliverable, a new key date) were not all saved");
if (!results.editorKeptTheirs) failures.push("SAVING THE EDITOR WIPED A COLLEAGUE'S TICK made while it was open");
if (!results.editorKeptEarlierTicks) failures.push('saving the editor undid an earlier tick');
if (!results.editorClosedOnSave) failures.push('the section 01 editor stayed open after saving');
if (!/Saved/.test(results.editorToast || '')) failures.push('no confirmation after saving: ' + JSON.stringify(results.editorToast));
if (!/Foundation ends before it starts/.test(results.validationText || '') || !results.validationWroteNothing)
  failures.push('an end date before the start was not stopped before saving: ' + JSON.stringify(results.validationText));
if (!/Phase 2, Discovery — end date/.test(results.conflictText || ''))
  failures.push('two people changing the same date was not put to the editor in words: ' + JSON.stringify(results.conflictText));
if (!results.conflictHeldBack) failures.push('the conflicting save was written before anyone chose');
if (!results.conflictKeptMine || !results.conflictEditorClosed) failures.push('"Keep mine" did not save the editor\'s version');
if (results.allSectionsTabs !== 5 || results.emptySectionsRendered?.length !== 5 || results.emptySectionsErrors?.length)
  failures.push(`switching every section on before it has content broke something: ${results.allSectionsTabs} tabs, rendered ${JSON.stringify(results.emptySectionsRendered)}, errors ${JSON.stringify(results.emptySectionsErrors)}`);
if (results.ownerSeesEveryClientBox)
  failures.push('an owner who is not your own firm is offered the box that grants access to every client');
if (JSON.stringify((results.gwPicker || []).slice().sort()) !== JSON.stringify([P.client.name, PAACT_FILE.client.name].sort()))
  failures.push('your own staff at the front door did not get a choice of portals: ' + JSON.stringify(results.gwPicker));
if (results.phoneTickHeights?.length) failures.push('deliverable ticks are under 40px tall on a phone: ' + JSON.stringify(results.phoneTickHeights));
if (results.phoneEditorHScroll) failures.push('the section 01 editor scrolls sideways on a phone');
if (results.phoneSignInHScroll || results.phonePaactHScroll) failures.push('the sign-in or the client portal scrolls sideways on a phone');
/* ---- no database: the file fallback ---- */
if (!results.fallbackOpens) failures.push('with no database, /paact asked for a sign-in or failed to open');
if (results.fallbackPath !== '/paact/scope/timeline') failures.push('the fallback /paact landed on ' + JSON.stringify(results.fallbackPath));
if (!/view only/i.test(results.fallbackRoleWord || '')) failures.push('the fallback does not say it is view-only: ' + JSON.stringify(results.fallbackRoleWord));
if (results.fallbackEditControls?.length || results.fallbackTickControls)
  failures.push('the fallback offers edits it cannot save: ' + JSON.stringify(results.fallbackEditControls));
if (results.fallbackPhases !== 5 || results.fallbackSections !== 1)
  failures.push(`the fallback shows ${results.fallbackPhases} phases and ${results.fallbackSections} sections`);
if (results.fallbackCalls?.length) failures.push('the no-database build called a database: ' + results.fallbackCalls.join(', '));
if (!results.themeToggleFound) failures.push('no theme toggle was found on /demo');
if (results.themeToggleFound && !results.themeFlipped) failures.push('the theme toggle did not change the theme');
if (results.themeToggleFound && !results.themeWipeClassCleared)
  failures.push('the wipe left .theme-wipe on <html> — every transition on the page is now dead');
if (results.themeToggleFound && !/=(light|dark)\b/.test(results.themeStorage || ''))
  failures.push('the theme choice was not persisted. localStorage holds: ' + JSON.stringify(results.themeStorage));
/* With no database, the site root falls back to the demo. It must SAY so in
   the address bar: a QR code pointing at the root would otherwise put a whole
   room in front of another client's plan under that client's name, which is
   exactly how this was found. */
if (!/^\/demo\b/.test(results.rootPath || '') || !/Northside/.test(results.rootBrand || ''))
  failures.push(`with no database, the site root rendered "${results.rootBrand}" at ${JSON.stringify(results.rootPath)} — it should be the demo, at /demo`);

if (errs.length) failures.push('page errors: ' + errs.join(' | '));

if (failures.length) {
  console.error('\nFAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('\nSMOKE PASSED');
