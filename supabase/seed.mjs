#!/usr/bin/env node
/* Loads one client's content into Postgres from the prototype's data bundle.
   This is the ONLY path by which client content enters the database from files,
   and it exists for migration — once milestone 2 lands, the editor replaces it.

   Run locally, never in CI or a deploy:
     SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node supabase/seed.mjs \
       --slug resonate --tenant resonate --owner alan@goodworkatlanta.co

   It needs the SERVICE ROLE key because it writes before any member row exists,
   which is exactly the state RLS is built to refuse. That key never goes in the
   Netlify site environment or the bundle — only in your shell, for this. */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []),
);

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SLUG = args.slug || 'resonate';
const TENANT = args.tenant || SLUG;
const OWNER = args.owner || '';
const DIR = args.from || path.join(import.meta.dirname, '..', 'data');

if (!URL_ || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. See .env.example.');
  process.exit(1);
}

/* The bundle is browser JS assigning to window.*; evaluate it in a shim. */
function readBundle(file, global) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const win = {};
  new Function('window', src)(win);
  if (!win[global]) throw new Error(`${file} did not set window.${global}`);
  return win[global];
}

const P = readBundle('plan.js', 'PORTAL');
const F = readBundle('findings.js', 'FINDINGS');

const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const portalRow = {
  slug: SLUG,
  tenant: TENANT,
  client_name: P.client.name,
  place: P.client.place || null,
  engagement_name: P.client.engagement,
  adopted: P.client.adopted || null,
  brand: { accent: null, logoUrl: null },
  labels: {}, // defaults in src/lib/labels.js until the client asks otherwise
  sections: ['scope', 'plan', 'findings', 'workplan', 'dashboard'],
  engagement: { phases: P.phases, scope: P.scope, firm: P.firm },
  plan: { vision: P.plan.vision, framing: P.plan.framing, priorities: P.plan.priorities, track: P.plan.track },
  findings: F,
};

const { data: portal, error: pErr } = await db
  .from('portals')
  .upsert(portalRow, { onConflict: 'slug' })
  .select('id')
  .single();
if (pErr) throw pErr;
console.log(`portal "${SLUG}" upserted · ${portal.id}`);

const tasks = P.tasks.map((t, i) => ({
  portal_id: portal.id,
  id: t.id,
  parent_id: t.parent || null,
  initiative: t.obj,
  title: t.title,
  owner_name: t.owner || null,
  start_date: t.start || null,
  due_date: t.due || null,
  // The prototype used a pseudo-status for a task that was merely late; late is
  // derived from the due date, never stored.
  status: t.status === 'late' ? 'next' : t.status,
  note: '',
  position: i,
}));

/* Parents before children: the composite FK requires the parent to exist. */
const parents = tasks.filter((t) => !t.parent_id);
const children = tasks.filter((t) => t.parent_id);
for (const batch of [parents, children]) {
  const { error } = await db.from('tasks').upsert(batch, { onConflict: 'portal_id,id' });
  if (error) throw error;
}
console.log(`tasks: ${parents.length} + ${children.length} subtasks`);

if (OWNER) {
  const { data: list, error: uErr } = await db.auth.admin.listUsers();
  if (uErr) throw uErr;
  const user = (list?.users || []).find((u) => (u.email || '').toLowerCase() === OWNER.toLowerCase());
  if (!user) {
    console.warn(`! no account for ${OWNER} — create it in Supabase → Authentication → Users, then re-run`);
  } else {
    const { error } = await db
      .from('portal_members')
      .upsert({ portal_id: portal.id, user_id: user.id, email: user.email, role: 'owner' },
              { onConflict: 'portal_id,user_id' });
    if (error) throw error;
    console.log(`owner: ${user.email}`);
  }
}

console.log(`\ndone. open /${SLUG}`);
console.log(`remember: tag each user's app_metadata { "gw_role": "staff", "gw_tenant": "${TENANT}" }`);
