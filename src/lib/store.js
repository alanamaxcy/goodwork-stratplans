import { supabase } from './supabase.js';
import { toCanonical } from './engagement.js';

/* The data layer. Two shapes, for two different write patterns:

   The PLAN is a document (portals.plan jsonb) — read whole, written whole, by
   one person, a few times an engagement.

   TASKS are rows — written constantly by several people at once, so each gets
   its own RLS check, its own realtime event and its own audit row. Two staff
   editing different tasks must never clobber each other. */

export async function loadPortal(slug) {
  if (!supabase) return { portal: null, role: null, reason: 'unconfigured' };

  const { data: portal, error } = await supabase
    .from('portals')
    .select('id, slug, tenant, client_name, place, engagement_name, adopted, brand, labels, sections, plan, engagement, findings, updated_at')
    .eq('slug', slug)
    .maybeSingle();

  // RLS makes an unreachable portal indistinguishable from one that does not
  // exist. That is deliberate — it is also why we cannot say which it was.
  if (error) return { portal: null, role: null, reason: 'error', error };
  if (!portal) return { portal: null, role: null, reason: 'not-visible' };

  const role = await roleFor(portal.id);
  /* One shape on screen whatever shape the row was seeded in. See
     lib/engagement.js: an older portal's flat team and string deliverables
     are read once, here, and saved back canonical the first time anyone edits. */
  return { portal: { ...portal, engagement: toCanonical(portal.engagement) }, role, reason: 'ok' };
}

async function roleFor(portalId) {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.session?.user;
  if (!user) return null;

  const { data } = await supabase
    .from('portal_members')
    .select('role')
    .eq('portal_id', portalId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (data?.role) return data.role;
  // Good Work's own staff carry no member row; the tenant claim is their grant.
  const tenant = user.app_metadata?.gw_tenant;
  return tenant === '*' ? 'owner' : 'board';
}

/* Every portal this account can reach. Only Good Work sees more than one, and
   this is the only place a list of clients exists. */
export async function listPortals() {
  if (!supabase) return [];
  const { data } = await supabase
    .from('portals')
    .select('slug, client_name, engagement_name')
    .order('client_name');
  return data || [];
}

export async function loadTasks(portalId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select('id, parent_id, initiative, title, owner_name, start_date, due_date, status, note, position')
    .eq('portal_id', portalId)
    .order('position')
    .order('id');
  if (error) return [];
  return (data || []).map(fromRow);
}

export function fromRow(r) {
  return {
    id: r.id,
    parent: r.parent_id || null,
    init: r.initiative,
    title: r.title,
    owner: r.owner_name || '',
    start: r.start_date || '',
    due: r.due_date || '',
    status: r.status,
    note: r.note || '',
    position: r.position ?? 0,
  };
}

export function toRow(portalId, t) {
  return {
    portal_id: portalId,
    id: t.id,
    parent_id: t.parent || null,
    initiative: t.init,
    title: t.title,
    owner_name: t.owner || null,
    start_date: t.start || null,
    due_date: t.due || null,
    status: t.status,
    note: t.note || '',
    position: t.position ?? 0,
  };
}

/* One task, one write. Never the whole workplan. */
export async function saveTask(portalId, task) {
  if (!supabase) return;
  const { error } = await supabase
    .from('tasks')
    .upsert(toRow(portalId, task), { onConflict: 'portal_id,id' });
  if (error) throw error;
}

/* Live updates from everyone else in the same workplan. Returns an unsubscribe;
   subscribe once per portal, in an effect, never during render. */
export function watchTasks(portalId, onChange) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`tasks:${portalId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `portal_id=eq.${portalId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') onChange({ type: 'delete', id: payload.old?.id });
        else if (payload.new) onChange({ type: 'upsert', task: fromRow(payload.new) });
      },
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/* ---------- the engagement document (section 01) ----------

   Edited by several people on one team, so every save is a compare-and-set:
   it names the version it was built on (`updated_at`, which the portals_touch
   trigger moves on every write) and the database applies it only if the row is
   still on that version. A save that matches no row comes back { ok: false },
   and lib/engagementSync.js re-reads the row and replays the change on top of
   whatever the other person saved. */

export async function loadEngagement(portalId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('portals')
    .select('engagement, updated_at')
    .eq('id', portalId)
    .maybeSingle();
  if (error) throw error;
  return data ? { engagement: toCanonical(data.engagement), updated_at: data.updated_at } : null;
}

export async function saveEngagement(portalId, engagement, seen) {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase
    .from('portals')
    .update({ engagement })
    .eq('id', portalId)
    .eq('updated_at', seen)
    .select('updated_at');
  if (error) throw error;
  return data && data.length ? { ok: true, updated_at: data[0].updated_at } : { ok: false };
}

/* Somebody else saved this portal. Only the fact is used, never the payload:
   a portal row can carry a findings document far larger than a realtime
   message, and the caller re-reads what it needs anyway. */
export function watchPortal(portalId, onChange) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`portal:${portalId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'portals', filter: `id=eq.${portalId}` },
      () => onChange(),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function savePlan(portalId, plan) {
  if (!supabase) return;
  const { error } = await supabase.from('portals').update({ plan }).eq('id', portalId);
  if (error) throw error;
}

/* Everything the consultant can configure about a portal: who it is for, what
   this client calls things, which sections appear, and one accent colour.
   Owner-only — RLS refuses it for anyone else. */
export async function savePortalSettings(portalId, fields) {
  if (!supabase) return;
  const { error } = await supabase.from('portals').update(fields).eq('id', portalId);
  if (error) throw error;
}

/* One round trip for a structural edit. Parents before children: the composite
   foreign key requires a subtask's parent to exist first. */
export async function saveTasks(portalId, tasks) {
  if (!supabase || !tasks.length) return;
  const rows = tasks.map((t) => toRow(portalId, t));
  const parents = rows.filter((r) => !r.parent_id);
  const children = rows.filter((r) => r.parent_id);
  for (const batch of [parents, children]) {
    if (!batch.length) continue;
    const { error } = await supabase.from('tasks').upsert(batch, { onConflict: 'portal_id,id' });
    if (error) throw error;
  }
}

/* The database cascades subtasks, but pass them anyway: deleting a parent and
   its children in one statement keeps the local list and the server in step
   even if the cascade is ever relaxed. */
export async function deleteTasks(portalId, ids) {
  if (!supabase || !ids.length) return;
  const { error } = await supabase.from('tasks').delete().eq('portal_id', portalId).in('id', ids);
  if (error) throw error;
}
