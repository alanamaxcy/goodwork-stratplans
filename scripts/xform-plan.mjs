/* Restructures plan.js into the client's taxonomy:
     Strategic Priority -> Initiative -> Task -> Subtask
   Pillars become priorities; objectives become initiatives; each initiative's
   measures are promoted to KPIs on its priority (matching how the consultant
   already builds these in Asana, where KPIs are a section of the priority). */
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./build/data/plan.js', import.meta.url), 'utf8');
globalThis.window = {};
new Function(src)();
const P = globalThis.window.PORTAL;

const priorities = P.plan.pillars.map((p, i) => ({
  id: p.id,
  n: i + 1,
  title: p.title,
  thesis: p.thesis,
  evidence: p.evidence,
  // Measures were per-objective; they belong to the priority as its KPIs.
  kpis: p.objectives.flatMap((o) =>
    o.measures.map((m) => ({ text: m.text, target: m.target, now: m.now, init: o.id })),
  ),
  initiatives: p.objectives.map((o) => ({
    id: o.id,
    title: o.title,
    detail: o.detail,
    evidence: o.evidence,
  })),
}));

/* Subtasks: the checklist inside a task. Written for the tasks where the work
   actually decomposes — not sprinkled evenly, because a real workplan doesn't. */
const SUBTASKS = {
  'T-102': ['Purpose statement — one paragraph', 'Minimum commitments (frequency, size, term)', 'What a group owes the church', 'What the church owes a group', 'Circulate to 4 leaders for reaction'],
  'T-103': ['Table at the October elder meeting', 'Collect written objections', 'Revise and re-table', 'Record the vote'],
  'T-105': ['Write the role description', 'Define the time commitment', 'Agree what an apprentice may lead alone'],
  'T-109': ['Pick the field to record first-visit date', 'Backfill the last 12 months', 'Build the placement-lag report'],
  'T-201': ['Inventory Wednesday curriculum', 'Inventory membership class material', 'Inventory Life Group studies', 'Flag gaps against the pathway outline'],
  'T-205': ['Draft selection criteria', 'Draft the eight-session outline', 'Name the two facilitators', 'Set the meeting cadence'],
  'T-209': ['List every role from the Sunday run sheet', 'List every role from kids and youth', 'Identify roles with no named lead'],
  'T-301': ['Pull the list of orgs from the county', 'Site visits — 5 organizations', 'Score against our capacity to help', 'Shortlist to 4'],
  'T-308': ['Write the study brief', 'Get three quotes', 'Elder approval of scope and spend'],
  'T-401': ['Identify 4 comparable churches', 'Interview each on term structure', 'Write the comparison memo'],
  'T-406': ['Draft the policy — target months and replenishment rule', 'Model it against the 12-month forecast', 'Elder adoption'],
  'T-409': ['Agree the study method and sources', 'Four study sessions', 'Draft a stated position', 'Congregational listening session'],
  'T-410': ['Review three covenants from other churches', 'Draft our version', 'Test with two Life Groups'],
};

const tasks = [];
for (const t of P.tasks) {
  tasks.push(t);
  const subs = SUBTASKS[t.id];
  if (!subs) continue;
  subs.forEach((title, i) => {
    /* A subtask is a task with a parent. Seed statuses so a parent that is
       underway shows partial progress rather than an empty checklist. */
    let status = 'next';
    if (t.status === 'done') status = 'done';
    else if (t.status === 'doing') status = i === 0 ? 'done' : i === 1 ? 'doing' : 'next';
    tasks.push({
      id: `${t.id}.${i + 1}`,
      parent: t.id,
      obj: t.obj,
      title,
      owner: t.owner,
      start: t.start,
      due: t.due,
      status,
    });
  });
}

const out = {
  client: P.client,
  firm: P.firm,
  today: P.today,
  phases: P.phases,
  scope: P.scope,
  plan: {
    vision: P.plan.vision,
    framing: P.plan.framing.replace('Four pillars, twelve objectives', 'Four strategic priorities, twelve initiatives'),
    priorities,
    track: P.plan.track,
  },
  tasks,
};

const head = `/* Engagement, plan and workplan content for one client portal.
   Taxonomy: Strategic Priority -> Initiative -> Task -> Subtask.
   A subtask is a task carrying a \`parent\`. KPIs hang off the priority.
   In the product this is the per-client record, served from Supabase; here it
   is illustrative content written against that client's real findings. */
window.PORTAL = `;

fs.writeFileSync(new URL('./build/data/plan.js', import.meta.url), head + JSON.stringify(out, null, 1) + ';\n');

const subs = tasks.filter((t) => t.parent).length;
console.log(`priorities ${priorities.length} · initiatives ${priorities.reduce((a, p) => a + p.initiatives.length, 0)} · KPIs ${priorities.reduce((a, p) => a + p.kpis.length, 0)}`);
console.log(`tasks ${tasks.length - subs} · subtasks ${subs} · total rows ${tasks.length}`);
console.log('KPIs per priority:', priorities.map((p) => `${p.id}:${p.kpis.length}`).join(' '));
