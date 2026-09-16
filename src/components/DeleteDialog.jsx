import React, { useState } from 'react';
import { lower } from '../lib/labels.js';

/* Deleting something that carries tasks is the one edit that can destroy work
   somebody else did, so it never happens on a single click. The dialog states
   how many tasks are affected and makes the person choose where they go —
   there is no default, because a default here is a guess about someone's work.

   The alternative (delete and let the tasks re-home onto whatever slides into
   the vacated number) is exactly the silent corruption this whole path exists
   to prevent. */
export default function DeleteDialog({ target, tasks, draft, labels, onCancel, onConfirm }) {
  const affected = target.kind === 'priority'
    ? tasks.filter((t) => {
        const p = (draft.priorities || []).find((x) => x.id === target.id);
        return (p?.initiatives || []).some((o) => o.id === t.init);
      })
    : tasks.filter((t) => t.init === target.id);

  const tops = affected.filter((t) => !t.parent);
  const subs = affected.filter((t) => t.parent);

  /* Somewhere else the work could live: every initiative except the ones about
     to disappear. */
  const doomed = new Set(
    target.kind === 'priority'
      ? ((draft.priorities || []).find((x) => x.id === target.id)?.initiatives || []).map((o) => o.id)
      : [target.id],
  );
  const destinations = (draft.priorities || [])
    .flatMap((p) => (p.initiatives || []).map((o) => ({ id: o.id, label: `${o.id} · ${o.title}` })))
    .filter((o) => !doomed.has(o.id));

  const [choice, setChoice] = useState('');

  const noun = target.kind === 'priority' ? lower(labels.priority) : lower(labels.initiative);
  const needsChoice = affected.length > 0;
  const ready = !needsChoice || choice === 'delete' || (choice && choice !== 'delete');

  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <div className="modal" role="dialog" aria-label={`Delete ${noun}`}>
        <span className="eyebrow">Delete {noun}</span>
        <h3 style={{ marginTop: 3 }}>{target.title || target.id}</h3>

        {!needsChoice ? (
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 10 }}>
            Nothing in the {lower(labels.workplan)} is attached to this, so deleting it loses no work.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 10 }}>
              <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>
                {tops.length} {tops.length === 1 ? lower(labels.task) : lower(labels.tasks)}
                {subs.length ? ` and ${subs.length} ${lower(labels.subtasks)}` : ''}
              </strong>{' '}
              {affected.length === 1 ? 'is' : 'are'} attached to this. Say where {affected.length === 1 ? 'it goes' : 'they go'}.
            </p>
            <div className="efield" style={{ marginTop: 12 }}>
              <label className="eyebrow" htmlFor="dest">Move them to</label>
              <select id="dest" value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">Choose…</option>
                {destinations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                <option value="delete">Delete them permanently</option>
              </select>
            </div>
            {choice === 'delete' ? (
              <p className="errnote">
                {affected.length} {affected.length === 1 ? 'row' : 'rows'} will be removed from the {lower(labels.workplan)}. This cannot be undone.
              </p>
            ) : null}
            {!destinations.length && choice !== 'delete' ? (
              <p className="sethint">
                There is nowhere else to put them — add another {lower(labels.initiative)} first, or delete them.
              </p>
            ) : null}
          </>
        )}

        <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onCancel}>Cancel</button>
          <button
            className="solid danger"
            disabled={!ready}
            onClick={() => onConfirm(choice === 'delete' ? { deleteTasks: true } : choice ? { moveTo: choice } : {})}
          >
            Delete {noun}
          </button>
        </div>
      </div>
    </>
  );
}
