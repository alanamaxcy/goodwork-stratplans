#!/usr/bin/env node
/* Loads one client's plan, findings and workplan into a portal that
   supabase/bootstrap.sql has already created.

   It signs in AS YOU — email plus the one-time code, the same way the app does
   — and writes through RLS as that portal's owner. There is no service-role
   key: nothing secret is created, pasted, or stored on disk.

     npm run seed -- --slug resonate

   Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env or the
   environment. Both are public by design.

   This exists for migration. Once the plan editor lands it is how you import a
   legacy plan, not how you set up a client. */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(import.meta.dirname, '..');

/* Minimal .env reader — no dependency for four lines of parsing. */
function loadEnv() {
  const f = path.join(root, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []),
);

const URL_ = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = process.env.VITE_SUPABASE_ANON_KEY || '';
const SLUG = args.slug || 'resonate';
const DIR = args.from || path.join(root, 'data');

if (!URL_ || !ANON) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).');
  process.exit(1);
}

function readBundle(file, global) {
  const win = {};
  new Function('window', fs.readFileSync(path.join(DIR, file), 'utf8'))(win);
  if (!win[global]) throw new Error(`${file} did not set window.${global}`);
  return win[global];
}

const P = readBundle('plan.js', 'PORTAL');
const F = readBundle('findings.js', 'FINDINGS');

/* autoRefreshToken keeps a timer alive, which would stop this CLI from ever
   exiting. A seed run takes seconds; it never needs a refresh. */
const db = createClient(URL_, ANON, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/* ---- sign in the way a person does ---- */
if (args.token) {
  // Non-interactive path, for tests only: a session token obtained elsewhere.
  await db.auth.setSession({ access_token: args.token, refresh_token: args.token });
} else {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const email = args.email || (await rl.question('Your email: '));
  const { error } = await db.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
  if (error) { console.error('Could not send the code:', error.message); process.exit(1); }
  const code = await rl.question(`Code sent to ${email.trim()}. Type it here: `);
  rl.close();
  const { error: vErr } = await db.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (vErr) { console.error('That code did not work:', vErr.message); process.exit(1); }
}

const { data: sess } = await db.auth.getSession();
if (!sess?.session) { console.error('Not signed in.'); process.exit(1); }
console.log(`signed in as ${sess.session.user.email}`);

/* ---- find the portal (RLS decides whether we can see it at all) ---- */
const { data: portal, error: pErr } = await db.from('portals').select('id').eq('slug', SLUG).maybeSingle();
if (pErr) { console.error(pErr.message); process.exit(1); }
if (!portal) {
  console.error(
    `No portal "${SLUG}" is visible to this account.\n` +
    `Run supabase/bootstrap.sql in the SQL editor first, with v_slug = '${SLUG}'.`,
  );
  process.exit(1);
}

/* ---- the plan document ---- */
const { error: upErr } = await db
  .from('portals')
  .update({
    client_name: P.client.name,
    place: P.client.place || null,
    engagement_name: P.client.engagement,
    adopted: P.client.adopted || null,
    engagement: { phases: P.phases, scope: P.scope, firm: P.firm },
    plan: { vision: P.plan.vision, framing: P.plan.framing, priorities: P.plan.priorities, track: P.plan.track },
    findings: F,
  })
  .eq('id', portal.id);

if (upErr) {
  console.error(
    `Could not write the plan: ${upErr.message}\n` +
    `Only a portal's OWNER may edit the plan document — check portal_members.`,
  );
  process.exit(1);
}
console.log(`plan: ${P.plan.priorities.length} priorities · findings: ${(F.themes || []).length} themes`);

/* ---- the workplan. Parents before children: the composite FK needs them. ---- */
const rows = P.tasks.map((t, i) => ({
  portal_id: portal.id,
  id: t.id,
  parent_id: t.parent || null,
  initiative: t.obj,
  title: t.title,
  owner_name: t.owner || null,
  start_date: t.start || null,
  due_date: t.due || null,
  // The prototype carried a pseudo-status for a task that was merely late.
  // Late is derived from the due date; it is never stored.
  status: t.status === 'late' ? 'next' : t.status,
  note: '',
  position: i,
}));

const parents = rows.filter((r) => !r.parent_id);
const children = rows.filter((r) => r.parent_id);
for (const [name, batch] of [['tasks', parents], ['subtasks', children]]) {
  if (!batch.length) continue;
  const { error } = await db.from('tasks').upsert(batch, { onConflict: 'portal_id,id' });
  if (error) { console.error(`Could not write ${name}: ${error.message}`); process.exit(1); }
  console.log(`${name}: ${batch.length}`);
}

console.log(`\ndone — open /${SLUG}`);
process.exit(0);
