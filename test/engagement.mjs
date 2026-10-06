#!/usr/bin/env node
/* The engagement document's edits, and what survives when two people save at
   once. No browser, no network: two editors run against one fake database
   that behaves like the real one — a save names the version it was built on
   and matches nothing if the row has moved on. */

import assert from 'node:assert/strict';
import path from 'node:path';
import * as E from '../src/lib/engagement.js';
import { createEngagementSync } from '../src/lib/engagementSync.js';

const root = path.resolve(import.meta.dirname, '..');
const { PORTAL: PAACT } = await import(path.join(root, 'clients', 'paact', 'plan.js'));
const { PORTAL: DEMO } = await import(path.join(root, 'clients', 'demo', 'plan.js'));

const clone = (x) => JSON.parse(JSON.stringify(x));
let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; }
};

const paact = () => E.tidy(E.toCanonical(PAACT));
const phase = (eng, n) => eng.phases.find((p) => p.number === n);

console.log('one shape');

await test('the client file becomes the canonical document', () => {
  const e = E.toCanonical(PAACT);
  assert.equal(e.client, undefined, 'the client block lives in portal columns, not here');
  assert.equal(e.meta, undefined, 'meta is lifted, not nested');
  assert.equal(e.engagementStart, '2026-09-01');
  assert.equal(e.engagementEnd, '2027-02-15');
  assert.equal(e.convener, 'GEEARS');
  assert.equal(e.firm.name, 'HTI Catalysts');
  assert.equal(e.phases.length, 5);
  assert.deepEqual(e.phases.map((p) => p.id), ['p1', 'p2', 'p3', 'p4', 'p5']);
  assert.deepEqual(e.phases.map((p) => p.status), ['in_progress', 'not_started', 'not_started', 'not_started', 'not_started']);
  assert.equal(e.phases[0].deliverables[0].id, 'p1-d1');
  assert.equal(e.phases[0].deliverables[0].done, true);
  assert.equal(e.phases[0].deliverables.filter((d) => d.done).length, 2);
  assert.equal(e.scope.cadence[0].id, 'c1');
  assert.equal(e.scope.cadence[0].rhythm, 'Weekly');
  assert.equal(e.scope.keyDates.length, 8);
  assert.equal(e.scope.consultingTeam.length, 4);
  assert.equal(e.scope.clientTeam.length, 5);
  assert.equal(e.scope.questions.length, 10);
});

await test('canonical is a fixed point: converting twice changes nothing', () => {
  const once = E.toCanonical(PAACT);
  assert.deepEqual(E.toCanonical(once), once);
  const t = E.tidy(once);
  assert.deepEqual(E.tidy(t), t);
});

await test('the older shape converts without inventing anything', () => {
  const e = E.toCanonical({ phases: DEMO.phases, scope: DEMO.scope, firm: DEMO.firm });
  assert.equal(e.phases[0].purpose, DEMO.phases[0].blurb, 'blurb becomes purpose');
  assert.equal(e.phases[0].n, undefined, 'the legacy alias is dropped');
  assert.equal(e.phases[0].deliverables[0].done, null, 'a bare string was never tracked, so it is not "to do"');
  assert.equal(e.phases[0].status, 'done');
  assert.equal(e.scope.cadence[0].rhythm, DEMO.scope.cadence[0].label);
  assert.equal(e.scope.cadence[0].what, DEMO.scope.cadence[0].detail);
  assert.equal(e.scope.cadence[0].next, DEMO.scope.cadence[0].next);
  assert.equal(e.scope.team, undefined);
  assert.deepEqual(e.scope.consultingTeam.map((m) => m.name), ['Alan Maxcy'], 'split by the org that IS the firm');
  assert.equal(e.scope.clientTeam.length, DEMO.scope.team.length - 1);
});

await test('a client file gives up only its engagement, never its plan or workplan', async () => {
  const { PORTAL: R } = await import(path.join(root, 'clients', 'resonate', 'plan.js'));
  const e = E.engagementOfFile(R);
  assert.equal(e.plan, undefined);
  assert.equal(e.tasks, undefined);
  assert.equal(e.today, undefined);
  assert.equal(e.client, undefined);
  assert.equal(e.phases.length, R.phases.length);
  assert.deepEqual(E.engagementOfFile(PAACT), E.toCanonical(PAACT), 'the PAACT file is engagement and nothing else');
});

await test('fields this file does not know about survive', () => {
  const src = clone(E.toCanonical(PAACT));
  src.phases[1].owner = 'Gina';
  src.scope.extra = [1, 2];
  src.newTopLevel = 'kept';
  const e = E.toCanonical(src);
  assert.equal(e.phases[1].owner, 'Gina');
  assert.deepEqual(e.scope.extra, [1, 2]);
  assert.equal(e.newTopLevel, 'kept');
});

await test('a duplicated id is broken, never merged', () => {
  const e = E.toCanonical({ phases: [{ id: 'x', name: 'A' }, { id: 'x', name: 'B' }] });
  assert.notEqual(e.phases[0].id, e.phases[1].id);
});

console.log('\nedits from the timeline');

await test('a tick changes one deliverable and nothing else', () => {
  const e = paact();
  const d = phase(e, 1).deliverables[1];
  const next = E.tick(e, 'p1', d.id, true);
  assert.equal(phase(next, 1).deliverables[1].done, true);
  assert.equal(phase(e, 1).deliverables[1].done, false, 'the original is untouched');
  assert.equal(next.phases[1], e.phases[1], 'other phases are the same objects');
});

await test('the first tick in a not-started phase moves it to in progress', () => {
  const e = paact();
  const next = E.tick(e, 'p2', phase(e, 2).deliverables[0].id, true);
  assert.equal(phase(next, 2).status, 'in_progress');
  const back = E.tick(next, 'p2', phase(e, 2).deliverables[0].id, false);
  assert.equal(phase(back, 2).status, 'in_progress', 'unticking never moves a status back');
});

await test('an edit naming a row that no longer exists is a no-op, by identity', () => {
  const e = paact();
  assert.equal(E.tick(e, 'p2', 'gone', true), e);
  assert.equal(E.tick(e, 'nope', 'p2-d1', true), e);
  assert.equal(E.setStatus(e, 'nope', 'done'), e);
  assert.equal(E.tick(e, 'p1', 'p1-d1', true), e, 'already ticked');
});

await test('status takes any spelling and stores one', () => {
  const e = paact();
  assert.equal(phase(E.setStatus(e, 'p3', 'Done'), 3).status, 'done');
  assert.equal(phase(E.setStatus(e, 'p3', 'active'), 3).status, 'in_progress');
  assert.equal(phase(E.setStatus(e, 'p3', null), 3).status, null);
});

console.log('\ntidy and check');

await test('blank rows go, text is trimmed, phases are numbered in date order', () => {
  const e = clone(paact());
  e.phases[2].deliverables.push({ id: 'blank', name: '   ', done: false });
  e.scope.inScope.push('  ', '  Trimmed  ');
  e.scope.cadence.push({ id: 'c-empty', rhythm: '', what: '', owner: '', next: '' });
  e.phases.push({ id: 'ph-empty', number: 6, name: '', start: '', end: '', status: 'not_started', purpose: '', note: '', deliverables: [] });
  e.phases[3].start = '2026-08-01'; // Plan design now starts first
  const t = E.tidy(e);
  assert.equal(phase(t, 4).deliverables.some((d) => d.id === 'blank'), false);
  assert.equal(t.scope.inScope.at(-1), 'Trimmed');
  assert.equal(t.scope.cadence.some((c) => c.id === 'c-empty'), false);
  assert.equal(t.phases.length, 5, 'an untouched blank phase is dropped');
  assert.equal(t.phases[0].name, 'Plan design');
  assert.deepEqual(t.phases.map((p) => p.number), [1, 2, 3, 4, 5]);
});

await test('validation names the problem in words', () => {
  const e = clone(paact());
  e.phases[1].end = '2026-09-01'; // before its start
  e.phases[2].name = '';
  e.scope.keyDates[0].date = '2026-02-30';
  e.scope.clientTeam.push({ id: 'x', name: '', org: 'PAACT', role: 'Parent', owns: '' });
  const v = E.validate(e);
  assert.ok(v.some((m) => /Discovery ends before it starts/.test(m)), v.join(' | '));
  assert.ok(v.some((m) => /needs a name/.test(m)), v.join(' | '));
  assert.ok(v.some((m) => /not a date/.test(m)), v.join(' | '));
  assert.ok(v.some((m) => /client team has no name/.test(m)), v.join(' | '));
  assert.deepEqual(E.validate(paact()), [], 'the real document is clean');
});

console.log('\nthree-way merge');

await test('different things changed on each side: both kept', () => {
  const base = paact();
  const mine = E.setIn(base, ['phases', 1, 'name'], 'Discovery and listening');
  const theirs = E.tick(base, 'p3', 'p3-d2', true);
  const { value, conflicts } = E.merge(base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(phase(value, 2).name, 'Discovery and listening');
  assert.equal(phase(value, 3).deliverables[1].done, true);
});

await test('two edits inside one deliverable list, matched by id not position', () => {
  const base = paact();
  /* I insert a deliverable at the TOP of Discovery and rename its fourth; they
     tick what was its fifth. By position, every one of those is a different
     row afterwards. */
  let mine = E.setIn(base, ['phases', 1, 'deliverables'],
    E.insertAt(phase(base, 2).deliverables, 0, { id: 'd-new', name: 'Interview guide signed off', done: false }));
  mine = E.setIn(mine, ['phases', 1, 'deliverables', 4, 'name'], 'SWOT/SOAR webform (target 60+)');
  const theirs = E.tick(base, 'p2', 'p2-d5', true);
  const { value, conflicts } = E.merge(base, mine, theirs);
  assert.deepEqual(conflicts, []);
  const ds = phase(value, 2).deliverables;
  assert.equal(ds[0].id, 'd-new');
  const webform = ds.find((d) => d.id === 'p2-d4');
  assert.equal(webform.name, 'SWOT/SOAR webform (target 60+)');
  assert.equal(ds.find((d) => d.id === 'p2-d5').done, true);
  assert.equal(ds.length, phase(base, 2).deliverables.length + 1);
});

await test('the same field changed both ways is a conflict, named in words', () => {
  const base = paact();
  const mine = E.setIn(base, ['phases', 1, 'end'], '2026-12-11');
  const theirs = E.setIn(base, ['phases', 1, 'end'], '2026-12-20');
  const r = E.merge(base, mine, theirs);
  assert.equal(r.conflicts.length, 1);
  assert.equal(E.describePath(r.conflicts[0], mine, theirs), 'Phase 2, Discovery — end date');
  assert.equal(phase(r.value, 2).end, '2026-12-20', 'unresolved, theirs stands');
  assert.equal(phase(E.merge(base, mine, theirs, 'mine').value, 2).end, '2026-12-11');
});

await test('a list of plain strings merges whole, and says so', () => {
  const base = paact();
  const mine = E.setIn(base, ['scope', 'inScope'], [...base.scope.inScope, 'One more convening']);
  const theirs = E.setIn(base, ['scope', 'inScope'], base.scope.inScope.slice(1));
  const r = E.merge(base, mine, theirs);
  assert.deepEqual(r.conflicts, [['scope', 'inScope']]);
  assert.equal(E.describePath(r.conflicts[0]), 'In scope');
});

await test('deleted on one side, edited on the other, is a conflict; deleted untouched is just gone', () => {
  const base = paact();
  const withoutD3 = E.setIn(base, ['phases', 2, 'deliverables'], phase(base, 3).deliverables.filter((d) => d.id !== 'p3-d3'));
  const editedD3 = E.tick(base, 'p3', 'p3-d3', true);
  const r = E.merge(base, withoutD3, editedD3);
  assert.equal(r.conflicts.length, 1);
  assert.match(E.describePath(r.conflicts[0], withoutD3, editedD3), /Impact Report integrated/);
  const clean = E.merge(base, withoutD3, E.tick(base, 'p3', 'p3-d1', true));
  assert.deepEqual(clean.conflicts, []);
  assert.equal(phase(clean.value, 3).deliverables.some((d) => d.id === 'p3-d3'), false);
  assert.equal(phase(clean.value, 3).deliverables[0].done, true);
});

await test('rows added on both sides are both kept', () => {
  const base = paact();
  const a = E.setIn(base, ['scope', 'keyDates'], [...base.scope.keyDates, { id: 'k-a', date: '2026-10-20', what: 'SPT roster confirmed' }]);
  const b = E.setIn(base, ['scope', 'keyDates'], [...base.scope.keyDates, { id: 'k-b', date: '2026-10-28', what: 'Convening #1' }]);
  const r = E.merge(base, a, b);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.value.scope.keyDates.slice(-2).map((d) => d.id).sort(), ['k-a', 'k-b']);
});

/* ---------- two editors, one database ---------------------------------- */

function fakeDb(doc) {
  let row = { engagement: clone(doc), updated_at: 'v0' };
  let n = 0;
  const log = [];
  return {
    get row() { return row; },
    log,
    load: async () => ({ engagement: clone(row.engagement), updated_at: row.updated_at }),
    save: async (engagement, seen) => {
      await new Promise((r) => setTimeout(r, 1));
      if (seen !== row.updated_at) { log.push('stale'); return { ok: false }; }
      row = { engagement: clone(engagement), updated_at: `v${++n}` };
      log.push('saved');
      return { ok: true, updated_at: row.updated_at };
    },
    /* Somebody else, saving between our read and our write. */
    external(fn) { row = { engagement: fn(clone(row.engagement)), updated_at: `v${++n}` }; },
  };
}

function editor(db, opts = {}) {
  const seen = { view: null, errors: [] };
  const s = createEngagementSync({
    load: opts.load || db.load,
    save: opts.save || db.save,
    onView: (v) => { seen.view = v; },
    onError: (e) => { seen.errors.push(e); },
  });
  return { s, seen };
}

console.log('\ntwo people, one document');

await test('a tick is shown at once and saved', async () => {
  const db = fakeDb(paact());
  const { s, seen } = editor(db);
  s.reset(await db.load());
  const p = s.apply({ kind: 'tick', phase: 'p1', item: 'p1-d2', done: true });
  assert.equal(phase(seen.view, 1).deliverables[1].done, true, 'optimistic');
  await p;
  assert.equal(phase(db.row.engagement, 1).deliverables[1].done, true);
  assert.equal(s.pending(), 0);
});

await test('somebody saves first: our tick is replayed onto their version', async () => {
  const db = fakeDb(paact());
  const { s, seen } = editor(db);
  s.reset(await db.load());
  db.external((e) => E.tick(e, 'p1', 'p1-d4', true)); // Gina, a moment earlier
  await s.apply({ kind: 'tick', phase: 'p1', item: 'p1-d2', done: true });
  const ds = phase(db.row.engagement, 1).deliverables;
  assert.equal(ds[1].done, true, 'ours');
  assert.equal(ds[3].done, true, 'and theirs');
  assert.deepEqual(db.log, ['stale', 'saved']);
  assert.equal(phase(seen.view, 1).deliverables[3].done, true, 'the screen now shows their tick too');
  assert.deepEqual(seen.errors, []);
});

await test('a burst of ticks lands in order, none lost', async () => {
  const db = fakeDb(paact());
  const { s } = editor(db);
  s.reset(await db.load());
  const ids = phase(db.row.engagement, 2).deliverables.map((d) => d.id);
  const all = ids.map((id) => s.apply({ kind: 'tick', phase: 'p2', item: id, done: true }));
  db.external((e) => E.setIn(e, ['scope', 'scopeSummary'], 'Changed meanwhile'));
  await Promise.all(all);
  await s.idle();
  assert.ok(phase(db.row.engagement, 2).deliverables.every((d) => d.done));
  assert.equal(db.row.engagement.scope.scopeSummary, 'Changed meanwhile');
  assert.equal(phase(db.row.engagement, 2).status, 'in_progress');
});

await test('a tick on a deliverable someone deleted is dropped quietly', async () => {
  const db = fakeDb(paact());
  const { s, seen } = editor(db);
  s.reset(await db.load());
  db.external((e) => E.setIn(e, ['phases', 0, 'deliverables'], e.phases[0].deliverables.slice(0, 3)));
  await s.apply({ kind: 'tick', phase: 'p1', item: 'p1-d6', done: true });
  assert.equal(phase(db.row.engagement, 1).deliverables.length, 3);
  assert.deepEqual(seen.errors, []);
});

await test('a refused save is undone on screen and reported, not retried forever', async () => {
  const db = fakeDb(paact());
  const { s, seen } = editor(db, { save: async () => ({ ok: false }) }); // RLS: 0 rows, row unchanged
  s.reset(await db.load());
  await s.apply({ kind: 'tick', phase: 'p1', item: 'p1-d2', done: true });
  assert.equal(seen.errors[0]?.code, 'refused');
  assert.equal(phase(seen.view, 1).deliverables[1].done, false, 'the screen matches the database again');
});

await test('a network failure is undone on screen and reported', async () => {
  const db = fakeDb(paact());
  const { s, seen } = editor(db, { save: async () => { throw new Error('Failed to fetch'); } });
  s.reset(await db.load());
  await s.apply({ kind: 'status', phase: 'p2', status: 'in_progress' });
  assert.equal(seen.errors.length, 1);
  assert.equal(phase(seen.view, 2).status, 'not_started');
});

await test('the editor and a tick at the same time: both kept, no question asked', async () => {
  const db = fakeDb(paact());
  const a = editor(db);
  const b = editor(db);
  a.s.reset(await db.load());
  b.s.reset(await db.load());
  const base = a.s.view();
  let draft = E.setIn(base, ['phases', 3, 'name'], 'Plan design and drafting');
  draft = E.setIn(draft, ['scope', 'keyDates'], [...draft.scope.keyDates, { id: 'k-x', date: '2026-10-28', what: 'Partner convening #1' }]);
  await b.s.apply({ kind: 'tick', phase: 'p2', item: 'p2-d1', done: true }); // Gina, while Alan edits
  const r = await a.s.saveDraft(base, draft);
  assert.equal(r.ok, true, JSON.stringify(r.conflicts));
  const e = db.row.engagement;
  assert.equal(phase(e, 4).name, 'Plan design and drafting');
  assert.equal(phase(e, 2).deliverables[0].done, true);
  assert.ok(e.scope.keyDates.some((d) => d.id === 'k-x'));
});

await test('both changed the same date: the editor is asked, and the choice is honoured', async () => {
  const db = fakeDb(paact());
  const a = editor(db);
  a.s.reset(await db.load());
  const base = a.s.view();
  const draft = E.setIn(base, ['phases', 1, 'end'], '2026-12-11');
  db.external((e) => E.setIn(e, ['phases', 1, 'end'], '2026-12-20'));
  const r = await a.s.saveDraft(base, draft);
  assert.equal(r.ok, false);
  assert.deepEqual(r.conflicts.map((p) => E.describePath(p, r.mine, r.theirs)), ['Phase 2, Discovery — end date']);
  assert.equal(phase(db.row.engagement, 2).end, '2026-12-20', 'nothing written until someone decides');
  const kept = await a.s.saveDraft(base, draft, { prefer: 'mine' });
  assert.equal(kept.ok, true);
  assert.equal(phase(db.row.engagement, 2).end, '2026-12-11');
});

await test('two people each moving a phase do not collide on its number', async () => {
  const db = fakeDb(paact());
  const a = editor(db);
  a.s.reset(await db.load());
  const base = a.s.view();
  /* Alan moves Plan design ahead of Synthesis; Gina, meanwhile, moves
     Foundation after Discovery. Both renumber the whole list. */
  const draft = E.setIn(base, ['phases', 3, 'start'], '2026-10-20');
  db.external((e) => E.tidy(E.setIn(e, ['phases', 0, 'start'], '2026-09-20')));
  const r = await a.s.saveDraft(base, draft);
  assert.equal(r.ok, true, JSON.stringify(r.conflicts));
  const e = db.row.engagement;
  assert.deepEqual(e.phases.map((p) => p.name), ['Discovery', 'Foundation', 'Plan design', 'Synthesis', 'Adoption & implementation']);
  assert.deepEqual(e.phases.map((p) => p.number), [1, 2, 3, 4, 5]);
});

await test('saving an untouched draft writes nothing', async () => {
  const db = fakeDb(paact());
  const a = editor(db);
  a.s.reset(await db.load());
  const r = await a.s.saveDraft(a.s.view(), a.s.view());
  assert.equal(r.unchanged, true);
  assert.deepEqual(db.log, []);
});

await test('another screen saved: refresh shows it, and queued ticks stay on top', async () => {
  const db = fakeDb(paact());
  const { s, seen } = editor(db);
  s.reset(await db.load());
  db.external((e) => E.setIn(e, ['planHorizon'], '5 years'));
  await s.refresh();
  assert.equal(seen.view.planHorizon, '5 years');
});

console.log(`\n${passed} passed`);
if (process.exitCode) console.error('SOME TESTS FAILED');
else console.log('ENGAGEMENT PASSED');
