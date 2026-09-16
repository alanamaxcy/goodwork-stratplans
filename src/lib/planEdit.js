/* Pure operations on the plan document.

   Everything here takes a plan and returns a NEW plan — no mutation of the
   caller's object, no React, no network. That is deliberate: the dangerous part
   of editing a plan is not the typing, it is that `tasks.initiative` is a soft
   reference to an initiative's display id ("2.1"). Reorder a priority, delete
   an initiative, or insert one, and every id below it shifts. If the tasks are
   not moved in the same breath, somebody's work silently re-homes under an
   unrelated initiative — or disappears from the workplan entirely.

   So renumbering and task migration are one function, and they are tested
   without a browser. */

const clone = (x) => JSON.parse(JSON.stringify(x));

export function emptyPlan() {
  return { vision: '', framing: '', priorities: [], track: null };
}

/* Display ids are positional: priority N is "P<n>", its initiatives are
   "<n>.1", "<n>.2". Returns the new plan plus a map of every initiative id that
   moved, so tasks and KPIs can follow.

   The map is built from ids read BEFORE they are overwritten, so a straight
   swap (2.1 <-> 2.2) resolves correctly rather than collapsing into one id. */
export function renumber(plan) {
  const next = clone(plan);
  const moves = {};
  (next.priorities || []).forEach((p, pi) => {
    const n = pi + 1;
    p.n = n;
    p.id = `P${n}`;
    (p.initiatives || []).forEach((o, oi) => {
      const newId = `${n}.${oi + 1}`;
      if (o.id && o.id !== newId) moves[o.id] = newId;
      o.id = newId;
    });
    // A KPI names the initiative it measures; keep it pointing at the same one.
    (p.kpis || []).forEach((k) => {
      if (k.init && moves[k.init]) k.init = moves[k.init];
    });
  });
  return { plan: next, moves };
}

/* Which tasks need their `initiative` rewritten, given a move map. Returns only
   the rows that actually change, so a save writes the minimum. */
export function taskMigrations(tasks, moves) {
  if (!moves || !Object.keys(moves).length) return [];
  return tasks
    .filter((t) => moves[t.init])
    .map((t) => ({ ...t, init: moves[t.init] }));
}

/* Tasks whose initiative no longer exists. Deleting an initiative without
   answering for these is how a workplan loses work, so the editor asks. */
export function orphanedTasks(plan, tasks) {
  const live = new Set();
  (plan.priorities || []).forEach((p) => (p.initiatives || []).forEach((o) => live.add(o.id)));
  return tasks.filter((t) => !live.has(t.init));
}

// ---------------------------------------------------------------- priorities

export function addPriority(plan, labels) {
  const next = clone(plan);
  next.priorities = next.priorities || [];
  next.priorities.push({
    id: `P${next.priorities.length + 1}`,
    n: next.priorities.length + 1,
    title: `New ${(labels?.priority || 'strategic priority').toLowerCase()}`,
    thesis: '',
    evidence: [],
    kpis: [],
    initiatives: [],
  });
  return renumber(next);
}

/* Deleting is the dangerous edit, so it takes the tasks and an explicit
   disposition and does the whole thing atomically.

   Why it cannot just renumber like the others: remove initiative 1.1 and 1.2
   slides up to become 1.1. Tasks still pointing at "1.1" would then belong to
   what used to be 1.2 — silently, with nothing orphaned to notice. So the
   affected tasks are resolved FIRST, against the old ids, and only then is the
   plan renumbered.

   disposition: { moveTo: '<initiative id>' } | { deleteTasks: true } */
export function removePriority(plan, tasks, priorityId, disposition = {}) {
  const doomed = (plan.priorities || []).find((p) => p.id === priorityId);
  const ids = new Set((doomed?.initiatives || []).map((o) => o.id));
  const affected = (tasks || []).filter((t) => ids.has(t.init));

  const next = clone(plan);
  next.priorities = (next.priorities || []).filter((p) => p.id !== priorityId);
  return finishDelete(next, affected, disposition);
}

/* Resolve the affected tasks against the PRE-renumber plan, then renumber and
   carry every other task along with it. */
function finishDelete(planWithoutIt, affected, disposition) {
  const { plan, moves } = renumber(planWithoutIt);
  const taskDeletes = [];
  const reassigned = [];

  if (disposition.deleteTasks) {
    affected.forEach((t) => taskDeletes.push(t.id));
  } else if (disposition.moveTo) {
    // moveTo names an initiative by its id BEFORE renumbering, so follow it.
    const dest = moves[disposition.moveTo] || disposition.moveTo;
    affected.forEach((t) => reassigned.push({ ...t, init: dest }));
  }

  const affectedIds = new Set(affected.map((t) => t.id));
  return { plan, moves, taskDeletes, reassigned, affectedIds };
}

export function movePriority(plan, priorityId, delta) {
  const next = clone(plan);
  const list = next.priorities || [];
  const i = list.findIndex((p) => p.id === priorityId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return { plan, moves: {} };
  [list[i], list[j]] = [list[j], list[i]];
  return renumber(next);
}

// --------------------------------------------------------------- initiatives

export function addInitiative(plan, priorityId, labels) {
  const next = clone(plan);
  const p = (next.priorities || []).find((x) => x.id === priorityId);
  if (!p) return { plan, moves: {} };
  p.initiatives = p.initiatives || [];
  p.initiatives.push({
    id: `${p.n}.${p.initiatives.length + 1}`,
    title: `New ${(labels?.initiative || 'initiative').toLowerCase()}`,
    detail: '',
    evidence: [],
  });
  return renumber(next);
}

/* Same contract as removePriority: resolve the tasks first, renumber second. */
export function removeInitiative(plan, tasks, initId, disposition = {}) {
  const affected = (tasks || []).filter((t) => t.init === initId);
  const next = clone(plan);
  (next.priorities || []).forEach((p) => {
    p.initiatives = (p.initiatives || []).filter((o) => o.id !== initId);
    p.kpis = (p.kpis || []).filter((k) => k.init !== initId);
  });
  return finishDelete(next, affected, disposition);
}

/* Every task that must be written after a structural edit: the ones following
   a renumber, plus the ones a delete reassigned. Reassignment wins — those rows
   were computed against the old ids on purpose. */
export function pendingTaskWrites(tasks, result) {
  const reassigned = result.reassigned || [];
  const handled = new Set(reassigned.map((t) => t.id));
  (result.taskDeletes || []).forEach((id) => handled.add(id));
  const followed = taskMigrations(tasks, result.moves).filter((t) => !handled.has(t.id));
  return [...reassigned, ...followed];
}

export function moveInitiative(plan, initId, delta) {
  const next = clone(plan);
  for (const p of next.priorities || []) {
    const list = p.initiatives || [];
    const i = list.findIndex((o) => o.id === initId);
    if (i < 0) continue;
    const j = i + delta;
    if (j < 0 || j >= list.length) return { plan, moves: {} };
    [list[i], list[j]] = [list[j], list[i]];
    return renumber(next);
  }
  return { plan, moves: {} };
}

// ---------------------------------------------------------------------- KPIs

export function addKpi(plan, priorityId) {
  const next = clone(plan);
  const p = (next.priorities || []).find((x) => x.id === priorityId);
  if (!p) return next;
  p.kpis = p.kpis || [];
  p.kpis.push({ text: '', now: '', target: '', init: p.initiatives?.[0]?.id || '' });
  return next;
}

export function removeKpi(plan, priorityId, index) {
  const next = clone(plan);
  const p = (next.priorities || []).find((x) => x.id === priorityId);
  if (p) p.kpis = (p.kpis || []).filter((_, i) => i !== index);
  return next;
}

export function setKpi(plan, priorityId, index, field, value) {
  const next = clone(plan);
  const p = (next.priorities || []).find((x) => x.id === priorityId);
  if (p && p.kpis?.[index]) p.kpis[index][field] = value;
  return next;
}

// ------------------------------------------------------------- field editing

export function setPriorityField(plan, priorityId, field, value) {
  const next = clone(plan);
  const p = (next.priorities || []).find((x) => x.id === priorityId);
  if (p) p[field] = value;
  return next;
}

export function setInitiativeField(plan, initId, field, value) {
  const next = clone(plan);
  for (const p of next.priorities || []) {
    const o = (p.initiatives || []).find((x) => x.id === initId);
    if (o) { o[field] = value; break; }
  }
  return next;
}

export function setPlanField(plan, field, value) {
  return { ...clone(plan), [field]: value };
}

/* Toggle a finding on or off an initiative's evidence list. */
export function toggleEvidence(plan, kind, id, themeId) {
  const next = clone(plan);
  const target =
    kind === 'priority'
      ? (next.priorities || []).find((p) => p.id === id)
      : (next.priorities || []).flatMap((p) => p.initiatives || []).find((o) => o.id === id);
  if (!target) return next;
  const list = target.evidence || (target.evidence = []);
  const i = list.indexOf(themeId);
  if (i >= 0) list.splice(i, 1);
  else list.push(themeId);
  return next;
}

// ------------------------------------------------------------------ workplan

/* Task ids are human-readable and appear in exports and in conversation, so a
   new one continues its initiative's series rather than being a random string:
   the fourth task under 2.1 is T-204. Subtasks hang off their parent, T-204.1.

   Collisions are possible after deletions, so the next free number is found by
   scanning rather than assuming the count. */
export function nextTaskId(tasks, initId, parentId) {
  const taken = new Set(tasks.map((t) => t.id));
  if (parentId) {
    for (let i = 1; i < 500; i++) {
      const id = `${parentId}.${i}`;
      if (!taken.has(id)) return id;
    }
    return `${parentId}.x`;
  }
  const [pn, on] = String(initId).split('.');
  const base = (Number(pn) || 0) * 100 + (Number(on) || 0);
  for (let i = 1; i < 100; i++) {
    const id = `T-${base + i}`;
    if (!taken.has(id)) return id;
  }
  return `T-${Date.now()}`;
}

export function newTask(tasks, initId, parentId, defaults = {}) {
  return {
    id: nextTaskId(tasks, initId, parentId),
    parent: parentId || null,
    init: initId,
    title: parentId ? 'New subtask' : 'New task',
    owner: '',
    start: '',
    due: '',
    status: 'next',
    note: '',
    position: tasks.length,
    ...defaults,
  };
}

/* Deleting a task takes its subtasks with it — the database cascades, and the
   UI must agree or it will show rows that are already gone. */
export function withDescendants(tasks, id) {
  const kids = tasks.filter((t) => t.parent === id).map((t) => t.id);
  return [id, ...kids];
}
