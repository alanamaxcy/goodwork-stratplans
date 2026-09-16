import { supabase } from './supabase.js';

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
    .select('id, slug, client_name, place, engagement_name, adopted, brand, labels, sections, plan, engagement, findings')
    .eq('slug', slug)
    .maybeSingle();

  // RLS makes an unreachable portal indistinguishable from one that does not
  // exist. That is deliberate — it is also why we cannot say which it was.
  if (error) return { portal: null, role: null, reason: 'error', error };
  if (!portal) return { portal: null, role: null, reason: 'not-visible' };

  const role = await roleFor(portal.id);
  return { portal, role, reason: 'ok' };
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

export async function savePlan(portalId, plan) {
  if (!supabase) return;
  const { error } = await supabase.from('portals').update({ plan }).eq('id', portalId);
  if (error) throw error;
}
