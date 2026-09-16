#!/usr/bin/env node
/* Unit tests for the plan editor's pure logic.

   These matter more than they look. `tasks.initiative` is a soft reference to
   an initiative's display id, so every reorder, insert and delete shifts ids
   underneath real work. A bug here does not throw — it silently re-homes
   somebody's tasks under the wrong initiative, or drops them out of the
   workplan, and nobody notices until a quarterly review. */

import assert from 'node:assert/strict';
import * as E from '../src/lib/planEdit.js';

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('  FAIL ' + name + '\n       ' + e.message);
    process.exitCode = 1;
  }
};

const fixture = () => ({
  vision: 'v',
  framing: 'f',
  priorities: [
    {
      id: 'P1', n: 1, title: 'One', thesis: '', evidence: ['s1'],
      kpis: [{ text: 'k1', now: '', target: '', init: '1.1' }, { text: 'k2', now: '', target: '', init: '1.2' }],
      initiatives: [
        { id: '1.1', title: 'A', detail: '', evidence: [] },
        { id: '1.2', title: 'B', detail: '', evidence: [] },
      ],
    },
    {
      id: 'P2', n: 2, title: 'Two', thesis: '', evidence: [],
      kpis: [{ text: 'k3', now: '', target: '', init: '2.1' }],
      initiatives: [{ id: '2.1', title: 'C', detail: '', evidence: [] }],
    },
  ],
});

const tasksFor = () => [
  { id: 'T-101', init: '1.1', parent: null, title: 'a' },
  { id: 'T-101.1', init: '1.1', parent: 'T-101', title: 'a-sub' },
  { id: 'T-102', init: '1.2', parent: null, title: 'b' },
  { id: 'T-201', init: '2.1', parent: null, title: 'c' },
];

console.log('renumbering and task migration');

test('a stable plan produces no moves and no task writes', () => {
  const { moves } = E.renumber(fixture());
  assert.deepEqual(moves, {});
  assert.equal(E.taskMigrations(tasksFor(), moves).length, 0);
});

test('swapping two initiatives swaps their tasks, not collapses them', () => {
  const { plan, moves } = E.moveInitiative(fixture(), '1.2', -1);
  assert.deepEqual(plan.priorities[0].initiatives.map((o) => o.title), ['B', 'A']);
  // B took 1.1, A took 1.2 — both directions recorded
  assert.deepEqual(moves, { '1.1': '1.2', '1.2': '1.1' });
  const migrated = E.taskMigrations(tasksFor(), moves);
  const byId = Object.fromEntries(migrated.map((t) => [t.id, t.init]));
  assert.equal(byId['T-101'], '1.2', 'task on A followed A');
  assert.equal(byId['T-101.1'], '1.2', 'the subtask followed its parent');
  assert.equal(byId['T-102'], '1.1', 'task on B followed B');
  assert.equal(migrated.length, 3, 'only the affected rows are written');
});

test('moving a priority renumbers every initiative beneath it', () => {
  const { plan, moves } = E.movePriority(fixture(), 'P2', -1);
  assert.equal(plan.priorities[0].title, 'Two');
  assert.equal(plan.priorities[0].initiatives[0].id, '1.1');
  assert.equal(moves['2.1'], '1.1');
  assert.equal(moves['1.1'], '2.1');
  const migrated = E.taskMigrations(tasksFor(), moves);
  assert.equal(migrated.find((t) => t.id === 'T-201').init, '1.1');
  assert.equal(migrated.find((t) => t.id === 'T-101').init, '2.1');
});

test('KPIs follow the initiative they measure', () => {
  const { plan } = E.moveInitiative(fixture(), '1.2', -1);
  const kpis = plan.priorities[0].kpis;
  assert.equal(kpis.find((k) => k.text === 'k1').init, '1.2', 'k1 followed A');
  assert.equal(kpis.find((k) => k.text === 'k2').init, '1.1', 'k2 followed B');
});

test('inserting an initiative does not disturb the ones above it', () => {
  const { plan, moves } = E.addInitiative(fixture(), 'P1', {});
  assert.equal(plan.priorities[0].initiatives.length, 3);
  assert.equal(plan.priorities[0].initiatives[2].id, '1.3');
  assert.deepEqual(moves, {}, 'appending renumbers nothing');
});

test('deleting an initiative NEVER re-homes its tasks onto the one that slid up', () => {
  // The trap: remove 1.1 and 1.2 becomes 1.1. A task still pointing at "1.1"
  // would silently belong to a different initiative, with nothing orphaned.
  const tasks = tasksFor();
  const r = E.removeInitiative(fixture(), tasks, '1.1', { deleteTasks: true });
  assert.equal(r.plan.priorities[0].initiatives[0].title, 'B', '1.2 slid up');
  assert.deepEqual(r.taskDeletes.sort(), ['T-101', 'T-101.1'], 'its tasks are deleted, not adopted');

  const writes = E.pendingTaskWrites(tasks, r);
  const ids = writes.map((w) => w.id);
  assert.ok(!ids.includes('T-101'), 'a deleted task is never also rewritten');
  const b = writes.find((w) => w.id === 'T-102');
  assert.equal(b.init, '1.1', 'the surviving initiative\'s own task followed it up');
});

test('deleting an initiative can move its tasks somewhere real instead', () => {
  const tasks = tasksFor();
  const r = E.removeInitiative(fixture(), tasks, '1.1', { moveTo: '1.2' });
  assert.equal(r.taskDeletes.length, 0);
  const writes = E.pendingTaskWrites(tasks, r);
  const moved = writes.filter((w) => ['T-101', 'T-101.1'].includes(w.id));
  assert.equal(moved.length, 2);
  // 1.2 was renumbered to 1.1 by the delete, and the destination followed it.
  moved.forEach((t) => assert.equal(t.init, '1.1', 'tasks landed on the initiative we chose'));
  assert.equal(E.orphanedTasks(r.plan, writes).length, 0, 'nothing is orphaned');
});

test('deleting a priority takes every task beneath it', () => {
  const tasks = tasksFor();
  const r = E.removePriority(fixture(), tasks, 'P1', { deleteTasks: true });
  assert.deepEqual(r.taskDeletes.sort(), ['T-101', 'T-101.1', 'T-102']);
  const writes = E.pendingTaskWrites(tasks, r);
  assert.equal(writes.find((w) => w.id === 'T-201').init, '1.1', 'P2 became P1 and its task followed');
  assert.equal(E.orphanedTasks(r.plan, [...writes]).length, 0);
});

test('deleting a priority removes its KPIs and initiatives together', () => {
  const { plan } = E.removePriority(fixture(), tasksFor(), 'P1', { deleteTasks: true });
  assert.equal(plan.priorities.length, 1);
  assert.equal(plan.priorities[0].id, 'P1', 'the survivor is renumbered to P1');
  assert.equal(plan.priorities[0].title, 'Two');
  assert.equal(plan.priorities[0].initiatives[0].id, '1.1');
});

test('renumber is idempotent', () => {
  const once = E.renumber(fixture()).plan;
  const twice = E.renumber(once);
  assert.deepEqual(twice.plan, once);
  assert.deepEqual(twice.moves, {});
});

test('operations never mutate the plan handed in', () => {
  const before = fixture();
  const snapshot = JSON.stringify(before);
  E.movePriority(before, 'P2', -1);
  E.removeInitiative(before, tasksFor(), '1.1', { deleteTasks: true });
  E.addPriority(before, {});
  E.toggleEvidence(before, 'priority', 'P1', 's9');
  assert.equal(JSON.stringify(before), snapshot);
});

test('moving past either end is a no-op', () => {
  assert.deepEqual(E.movePriority(fixture(), 'P1', -1).plan, fixture());
  assert.deepEqual(E.moveInitiative(fixture(), '2.1', 1).plan, fixture());
});

console.log('\nevidence links');

test('toggling evidence adds then removes', () => {
  let p = E.toggleEvidence(fixture(), 'initiative', '1.1', 'w1');
  assert.deepEqual(p.priorities[0].initiatives[0].evidence, ['w1']);
  p = E.toggleEvidence(p, 'initiative', '1.1', 'w1');
  assert.deepEqual(p.priorities[0].initiatives[0].evidence, []);
});

console.log('\ntask ids');

test('a new task continues its initiative series, skipping taken numbers', () => {
  // 1.1 => the T-10x series. T-101 and T-102 are taken, so the next is T-103.
  assert.equal(E.nextTaskId(tasksFor(), '1.1', null), 'T-103');
  assert.equal(E.nextTaskId([], '2.1', null), 'T-202', 'a fresh initiative starts its own series');
});

test('a new task id never collides with an existing one', () => {
  const tasks = tasksFor();
  const id = E.nextTaskId(tasks, '2.1', null);
  assert.ok(!tasks.some((t) => t.id === id), `${id} is free`);
  assert.ok(/^T-\d+$/.test(id), `${id} is human-readable`);
});

test('a subtask id hangs off its parent and skips taken slots', () => {
  const id = E.nextTaskId(tasksFor(), '1.1', 'T-101');
  assert.equal(id, 'T-101.2', 'T-101.1 is taken');
});

test('deleting a task takes its subtasks with it', () => {
  assert.deepEqual(E.withDescendants(tasksFor(), 'T-101').sort(), ['T-101', 'T-101.1']);
});

console.log(`\n${passed} passed`);
if (process.exitCode) console.error('SOME TESTS FAILED');
else console.log('PLAN EDIT LOGIC PASSED');
