/* Per-portal taxonomy.
   A church says "pillars", a foundation says "goal areas", a district says
   "strategic priorities". Making the nouns data is one jsonb column and is most
   of what makes a portal feel built for a client rather than rented to them.

   Every label falls back, so a portal that sets none still reads correctly and
   a portal that sets two does not have to set the other eight. */

export const DEFAULT_LABELS = {
  priority: 'Strategic priority',
  priorities: 'Strategic priorities',
  priorityShort: 'Priority',
  initiative: 'Initiative',
  initiatives: 'Initiatives',
  task: 'Task',
  tasks: 'Tasks',
  subtask: 'Subtask',
  subtasks: 'Subtasks',
  kpi: 'KPI',
  kpis: 'KPIs',
  findings: 'Findings',
  workplan: 'Workplan',
  plan: 'The plan',
  scope: 'Scope & timeline',
  dashboard: 'Dashboard',
};

export function makeLabels(portal) {
  return { ...DEFAULT_LABELS, ...((portal && portal.labels) || {}) };
}

/* Sentence-case a label that is defined title-case, for mid-sentence use.
   "Strategic priority" -> "strategic priority", but "KPI" stays "KPI". */
export function lower(label) {
  if (!label) return '';
  if (label === label.toUpperCase()) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/* Which sections this portal shows, in order. A client with no SWOT hides
   findings; one that has not started implementing hides the workplan. */
export const ALL_SECTIONS = ['scope', 'plan', 'findings', 'workplan', 'dashboard'];

export function visibleSections(portal, labels) {
  const configured = (portal && portal.sections) || null;
  const ids = Array.isArray(configured) && configured.length ? configured : ALL_SECTIONS;
  const titleFor = {
    scope: labels.scope,
    plan: labels.plan,
    findings: labels.findings,
    workplan: labels.workplan,
    dashboard: labels.dashboard,
  };
  return ids
    .filter((id) => ALL_SECTIONS.includes(id))
    .map((id, i) => ({ id, n: String(i + 1).padStart(2, '0'), title: titleFor[id] }));
}
