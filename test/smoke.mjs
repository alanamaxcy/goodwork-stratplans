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
const { PORTAL: P } = await import(path.join(root, 'data', 'plan.js'));
const { FINDINGS: F } = await import(path.join(root, 'data', 'findings.js'));

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
      if (req.method === 'PATCH') {
        Object.assign(portalRow, body);
        planPatches.push(body);
        return send(200, [portalRow]);
      }
      return send(200, []);
    }
    if (url.pathname === '/rest/v1/portal_members') return send(200, [{ role: 'owner' }]);
    if (url.pathname === '/rest/v1/tasks') {
      if (req.method === 'GET') return send(200, taskRows);
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


/* ---- /paact: the real engagement, with sample content in the other four ----
   This route had none of this coverage, which is exactly why a completely
   UNREACHABLE /paact once passed the build and every unit test: nothing here
   mentioned it, so nothing noticed that App.jsx never loaded it. The
   assertions below are deliberately written against visible TEXT rather than
   the timeline's own class names, so a redesign of the section does not
   silently stop testing whether the client's own facts are on screen. */
const paact = await browser.newPage({ viewport: { width: 1320, height: 1050 }, deviceScaleFactor: 2 });
paact.on('pageerror', (e) => errs.push('PAACT ' + e.message));
const paactRest = [];
paact.on('request', (r) => { if (r.url().includes('/rest/v1/')) paactRest.push(r.method() + ' ' + r.url()); });

await paact.goto(`http://127.0.0.1:${WEB_PORT}/paact`, { waitUntil: 'networkidle' });
await paact.waitForTimeout(900);

results.paactSkipsSignIn = await paact.isVisible('.masthead');
results.paactClient = (await paact.textContent('.brand-name').catch(() => '')) || '';
/* A client's own portal must never call itself a Demo. */
results.paactTopbarText = (await paact.evaluate(
  () => (document.querySelector('.topbar')?.innerText || '').replace(/\s+/g, ' ').trim(),
)) || '';
/* The one section carrying PAACT's own content is the one it must open on. */
results.paactOpensOn = (await paact.textContent('.railnav [aria-current="true"] .rn-t').catch(() => '')) || '';

const paactScope = await paact.evaluate(() => document.querySelector('.main')?.innerText || '');
results.paactPhasesShown = ['Foundation', 'Discovery', 'Synthesis', 'Plan design', 'Adoption']
  .filter((n) => paactScope.includes(n)).length;
/* Phase 1 is the only phase with work behind it: 2 of its 7 deliverables. */
results.paactShowsRealProgress = /\b2\b[^.]{0,12}\b7\b/.test(paactScope);
/* HTI's engagement ends 15 Feb 2027. 15 Feb 2028 is the end of plan year one;
   presenting the latter as the engagement span overstates the contract by a year. */
results.paactClaims2028AsEngagementEnd = /engagement[^.]{0,60}Feb 28\b/i.test(paactScope);

await paact.click('.subnav button:has-text("Who is on it")');
await paact.waitForTimeout(400);
const paactTeam = await paact.evaluate(() => document.querySelector('.main')?.innerText || '');
results.paactTeamNames = ['Folami', 'Shawnell', 'Kristin Bernhard', 'Danielle Wallace']
  .filter((n) => paactTeam.includes(n)).length;

await paact.click('.subnav button:has-text("Scope")');
await paact.waitForTimeout(400);
const paactAgreement = await paact.evaluate(() => document.querySelector('.main')?.innerText || '');
results.paactKeyDatesShown = ['Fall Luncheon', 'Impact Report', 'RFP project end date']
  .filter((n) => paactAgreement.includes(n)).length;
results.paactCadenceShown = /Shawnell/.test(paactAgreement) && /Weekly/i.test(paactAgreement);
await paact.screenshot({ path: path.join(root, 'test/shot-09-paact-timeline.png'), fullPage: true });

/* Sections 2-5 are another engagement's anonymised content. Unmarked, a client
   would read priorities they never agreed to as their own plan. */
await paact.click('.railnav button:has-text("The plan")');
await paact.waitForTimeout(500);
results.paactPlanMarkedSample = await paact.evaluate(() => {
  const t = (document.querySelector('.topbar')?.innerText || '') + ' ' + (document.querySelector('.main')?.innerText || '');
  return /sample|illustrative/i.test(t);
});
/* The banner alone is not enough, and checking only the banner is how a real
   blocker got through this test once: the section HEADLINE still read
   "PAACT (Promise All Atlanta Children Thrive) · Strategic Plan 2027-2031" over
   another engagement's vision and priorities — attributing that plan to PAACT in
   the largest type on the page, two inches under a banner saying it was not
   theirs. A reader takes in the headline first. */
results.paactPlanH2 = (await paact.textContent('.shead h2').catch(() => '')) || '';
await paact.screenshot({ path: path.join(root, 'test/shot-10-paact-sample.png') });

/* PAACT's portal serves the anonymised sample, so it must not leak the real
   client of that sample either. */
const paactText = await paact.evaluate(() => document.body.innerText);
results.paactLeaksRealClient = /\bresonate\b/i.test(paactText.replace(/\bresonat(es|ed|ing)\b/gi, 'X'))
  || /\bBelvedere\b/i.test(paactText);
results.paactTouchedNoDatabase = paactRest.length === 0;
results.paactRestCalls = paactRest.slice(0, 3);

/* ---- the theme toggle ---- */
const themeBtn = await paact.$('[aria-label*="theme" i], [aria-label*="dark" i], [aria-label*="light" i], .themetoggle');
results.themeToggleFound = !!themeBtn;
if (themeBtn) {
  const before = await paact.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await themeBtn.click();
  await paact.waitForTimeout(800);
  const after = await paact.evaluate(() => document.documentElement.getAttribute('data-theme'));
  results.themeFlipped = before !== after;
  results.themeAfter = after;
  /* The wipe adds a suppression class that kills every transition on the page.
     If it is not removed on BOTH the resolved and rejected paths, the app is
     left permanently un-animated. */
  results.themeWipeClassCleared = await paact.evaluate(
    () => !document.documentElement.classList.contains('theme-wipe'),
  );
  /* Whatever key the toggle chose — assert a choice was stored, not the name. */
  results.themePersisted = await paact.evaluate(() => {
    try {
      return Object.keys(localStorage)
        .filter((k) => /theme/i.test(k) || /^(light|dark)$/i.test(localStorage.getItem(k) || ''))
        .map((k) => k + '=' + localStorage.getItem(k)).join(',') || '';
    } catch { return 'threw'; }
  });
  await paact.screenshot({ path: path.join(root, 'test/shot-11-paact-dark.png') });
}

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto(`http://127.0.0.1:${WEB_PORT}/demo`, { waitUntil: 'networkidle' });
await phone.waitForTimeout(500);
results.phoneHScroll = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
/* A sticky header that eats the phone is a bug even when nothing overlaps. */
/* The banner lost its text once to a cascade collision and showed a bare
   "DEMO" chip, so assert it actually says something at this width. */
results.phoneBannerText = await phone.evaluate(
  () => (document.querySelector('.demobar')?.innerText || '').replace(/\s+/g, ' ').trim(),
);
results.phoneHeaderPctOfScreen = await phone.evaluate(() => {
  const el = document.querySelector('.topbar');
  if (!el) return -1; // no header on this screen: the assertion below catches it
  return Math.round((el.getBoundingClientRect().height / window.innerHeight) * 100);
});

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
if (results.phoneHeaderPctOfScreen > 28) failures.push(`sticky header takes ${results.phoneHeaderPctOfScreen}% of a phone screen`);
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
/* ---- /paact: the route the kickoff depends on ---- */
if (!results.paactSkipsSignIn) failures.push('/paact asked for a sign-in — the client cannot open it');
if (!/PAACT/.test(results.paactClient || ''))
  failures.push('/paact is not showing PAACT: ' + JSON.stringify(results.paactClient));
if (/\bdemo\b/i.test(results.paactTopbarText || ''))
  failures.push("the client's own portal calls itself a Demo: " + JSON.stringify(results.paactTopbarText.slice(0, 120)));
if (!/scope|timeline/i.test(results.paactOpensOn || ''))
  failures.push('/paact opens on ' + JSON.stringify(results.paactOpensOn) + ' — it must open on the one section carrying PAACT’s own content');
if (results.paactPhasesShown !== 5)
  failures.push(`only ${results.paactPhasesShown} of 5 PAACT phases are on screen`);
if (!results.paactShowsRealProgress)
  failures.push("phase 1's real progress (2 of its 7 deliverables) is not shown");
if (results.paactClaims2028AsEngagementEnd)
  failures.push("the page presents Feb 2028 as the end of HTI's engagement — it ends Feb 2027; 2028 is the end of plan year one");
if (results.paactTeamNames !== 4)
  failures.push(`only ${results.paactTeamNames} of 4 named people appear on "Who is on it"`);
if (results.paactKeyDatesShown !== 3)
  failures.push(`only ${results.paactKeyDatesShown} of 3 checked key dates appear on "Scope & cadence"`);
if (!results.paactCadenceShown) failures.push('the working cadence (owner and rhythm) is missing');
if (!results.paactPlanMarkedSample)
  failures.push("THE SAMPLE PLAN IS UNMARKED ON /paact — the client would read another engagement's priorities as their own");
if (/PAACT/i.test(results.paactPlanH2 || ''))
  failures.push('the sample plan is HEADED with the client name, which attributes it to them: ' + JSON.stringify(results.paactPlanH2));
if (!/sample/i.test(results.paactPlanH2 || ''))
  failures.push('the sample plan headline does not say it is a sample: ' + JSON.stringify(results.paactPlanH2));
if (results.paactLeaksRealClient) failures.push('/paact LEAKS THE REAL CLIENT OF THE SAMPLE CONTENT');
if (!results.paactTouchedNoDatabase) failures.push('/paact hit the database: ' + results.paactRestCalls.join(', '));
if (!results.themeToggleFound) failures.push('no theme toggle was found');
if (results.themeToggleFound && !results.themeFlipped) failures.push('the theme toggle did not change the theme');
if (results.themeToggleFound && !results.themeWipeClassCleared)
  failures.push('the wipe left .theme-wipe on <html> — every transition on the page is now dead');
if (results.themeToggleFound && !results.themePersisted)
  failures.push('the theme choice was not persisted: ' + JSON.stringify(results.themePersisted));

if (errs.length) failures.push('page errors: ' + errs.join(' | '));

if (failures.length) {
  console.error('\nFAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('\nSMOKE PASSED');
