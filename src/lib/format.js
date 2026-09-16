export const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const MONL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export const STATUS_ORDER = ['next', 'doing', 'done', 'blocked'];
export const STATUS_LABEL = { next: 'Not started', doing: 'In progress', done: 'Done', blocked: 'Blocked' };
export const STATUS_VAR = { done: '--st-done', doing: '--st-doing', next: '--st-next', blocked: '--st-blocked' };
/* Stack order for every bar in the product: progress first, absence last. */
export const STACK = ['done', 'doing', 'blocked', 'next'];

export function fmt(d) {
  if (!d) return '—';
  const p = String(d).split('-');
  return `${+p[2]} ${MON[+p[1] - 1]} ${p[0].slice(2)}`;
}

export function fmtLong(d) {
  if (!d) return '—';
  const p = String(d).split('-');
  return `${+p[2]} ${MONL[+p[1] - 1]} ${p[0]}`;
}

export function pct(a, b) {
  return b ? Math.round((a / b) * 100) : 0;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(task, now = today()) {
  return task.status !== 'done' && !!task.due && task.due < now;
}

export function counts(rows, now = today()) {
  const c = { total: rows.length, done: 0, doing: 0, next: 0, blocked: 0, late: 0 };
  rows.forEach((t) => {
    c[t.status] = (c[t.status] || 0) + 1;
    if (isOverdue(t, now)) c.late++;
  });
  return c;
}

/* The plan document is nested; these flatten it for lookups. */
export function indexPlan(plan) {
  const byInit = {};
  const priorityOf = {};
  (plan?.priorities || []).forEach((p) => {
    (p.initiatives || []).forEach((o) => {
      byInit[o.id] = o;
      priorityOf[o.id] = p;
    });
  });
  return { byInit, priorityOf };
}

/* Which initiatives cite a given finding — the back-link that makes the
   evidence chain run in both directions. */
export function findingDrives(plan) {
  const out = {};
  (plan?.priorities || []).forEach((p) => {
    (p.initiatives || []).forEach((o) => {
      (o.evidence || []).forEach((id) => {
        (out[id] = out[id] || []).push({ kind: 'init', id: o.id, title: o.title });
      });
    });
  });
  (plan?.track?.evidence || []).forEach((id) => {
    (out[id] = out[id] || []).push({ kind: 'track', id: 'TRK', title: plan.track.title });
  });
  return out;
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
